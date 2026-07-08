/* Split teams, build lineup, cap optimize */

const DEFAULT_CAPTAIN_A = "thang phan";
const DEFAULT_CAPTAIN_B = "minh phat";

function fit(p,pos){ if(p.main===pos)return 2; if(p.secondary.includes(pos))return 1; return 0; }
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}

function canCoverPosition(player, pos){
  return player.main === pos || player.secondary.includes(pos);
}

function positionFitScore(player, pos){
  if(player.main === pos) return 10000;
  if(player.secondary.includes(pos)) return 5200;
  return -7000;
}

function fitLabelValue(player, pos){
  if(player.main === pos) return 2;
  if(player.secondary.includes(pos)) return 1;
  return 0;
}

function sideMatchLevel(playerSide, slotSide){
  const sides = Array.isArray(playerSide) ? playerSide : (playerSide ? [playerSide] : []);
  if(!sides.length || !slotSide) return "NONE";

  const exactIndex = sides.indexOf(slotSide);
  if(exactIndex === 0) return "PRIMARY";
  if(exactIndex > 0) return "SECONDARY";

  const primary = sides[0];
  if(primary === "CENTER" && (slotSide === "LEFT" || slotSide === "RIGHT")) return "SOFT";
  if(slotSide === "CENTER" && (primary === "LEFT" || primary === "RIGHT")) return "BAD";
  return "BAD";
}

function sidePriorityScore(playerSide, slotSide){
  const level = sideMatchLevel(playerSide, slotSide);
  if(level === "PRIMARY") return 1200;
  if(level === "SECONDARY") return 650;
  if(level === "SOFT") return 120;
  if(level === "BAD") return -500;
  return 0;
}

function assignmentScore(player, slot){
  const rating = Number(player.rating) || 5;
  const isMain = player.main === slot.pos;
  const isSecondary = player.secondary.includes(slot.pos);
  const sideLevel = sideMatchLevel(player.side, slot.side);

  let tier = 0;

  // Luật ưu tiên mới:
  // 1. Position chính + preferred_side chính -> rating cao thắng.
  // 2. Position chính + preferred_side phụ -> rating cao thắng.
  // 3. Position chính + lệch side -> rating cao thắng.
  // 4. Position phụ -> rating cao thắng.
  // 5. Trái vị trí -> rating cao thắng.
  if(isMain && sideLevel === "PRIMARY"){
    tier = 5;
  }else if(isMain && sideLevel === "SECONDARY"){
    tier = 4;
  }else if(isMain){
    tier = 3;
  }else if(isSecondary){
    tier = 2;
  }else{
    tier = 1;
  }

  let score = tier * 100000 + rating * 1000;

  // Side chỉ dùng để phân hạng trong cùng position chính.
  // Với position phụ, rating là yếu tố chính.
  if(isMain){
    if(sideLevel === "SOFT") score += 180;
    if(sideLevel === "BAD") score -= 180;
  }else if(isSecondary){
    score += sidePriorityScore(player.side, slot.side) * 0.05;
  }

  // GK cực kỳ ưu tiên đúng người.
  if(slot.pos === "GK" && player.main !== "GK" && !player.secondary.includes("GK")){
    score -= 300000;
  }

  return score;
}

function starsAssignmentScore(player, slot){
  const rating = Number(player.rating) || 5;
  if(slot.pos === "GK" && !canCoverPosition(player, "GK")) return -1e15;

  let fitTier = 0;
  if(player.main === slot.pos) fitTier = 5000;
  else if(player.secondary.includes(slot.pos)) fitTier = 2500;

  return rating * 1000 + fitTier + sidePriorityScore(player.side, slot.side) * 0.05;
}

function solveLineupSlots(team, slots, scoreFn){
  const n = team.length;
  const capPoolLimit = window.MAX_LINEUP_DP_POOL || 18;

  function greedyAssign(){
    const picks = [];
    const used = new Set();
    for(const slot of slots){
      let bestIndex = -1;
      let bestValue = -1e15;
      for(let i = 0; i < n; i++){
        if(used.has(i)) continue;
        const value = scoreFn(team[i], slot);
        if(value > bestValue){
          bestValue = value;
          bestIndex = i;
        }
      }
      if(bestIndex >= 0){
        used.add(bestIndex);
        picks.push({ playerIndex: bestIndex, slot });
      }
    }
    return picks;
  }

  if(n > capPoolLimit) return greedyAssign();

  const memo = new Map();
  function solve(slotIdx, usedMask){
    if(slotIdx >= slots.length) return { score: 0, picks: [] };

    const key = slotIdx + "|" + usedMask;
    if(memo.has(key)) return memo.get(key);

    const slot = slots[slotIdx];
    let best = { score: -1e15, picks: [] };

    for(let i = 0; i < n; i++){
      if(usedMask & (1 << i)) continue;
      const next = solve(slotIdx + 1, usedMask | (1 << i));
      const total = scoreFn(team[i], slot) + next.score;
      if(total > best.score){
        best = { score: total, picks: [{ playerIndex: i, slot }, ...next.picks] };
      }
    }

    memo.set(key, best);
    return best;
  }

  const solved = solve(0, 0);
  if(solved.picks.length >= slots.length) return solved.picks;
  return greedyAssign();
}

function lineupFromSlotPicks(team, picks, captainName){
  const usedIndexes = new Set(picks.map(x => x.playerIndex));
  const starters = picks.map(({ playerIndex, slot }) => {
    const p = team[playerIndex];
    const isCaptain = captainName && normalizeName(p.name) === captainName;
    return {
      ...p,
      assigned: slot.pos,
      assignedSide: slot.side,
      fit: fitLabelValue(p, slot.pos),
      forcedStarter: isCaptain,
      captain: isCaptain
    };
  });

  const bench = team
    .filter((_, idx) => !usedIndexes.has(idx))
    .sort((a, b) => (Number(b.rating) || 5) - (Number(a.rating) || 5));

  const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const sideOrder = { LEFT: 0, CENTER: 1, RIGHT: 2 };
  starters.sort((a, b) => {
    if(order[a.assigned] !== order[b.assigned]) return order[a.assigned] - order[b.assigned];
    return (sideOrder[a.assignedSide] ?? 1) - (sideOrder[b.assignedSide] ?? 1);
  });

  return { starters, bench };
}

function buildStars(team, formation){
  const slots = slotOrderForFormation(resolveFormation(formation, "3-1-2"));
  const picks = solveLineupSlots(team, slots, starsAssignmentScore);
  const lineup = lineupFromSlotPicks(team, picks, null);

  let captain = lineup.starters[0];
  lineup.starters.forEach(p => {
    if((Number(p.rating) || 5) > (Number(captain.rating) || 5)) captain = p;
  });
  const captainKey = captain ? normalizeName(captain.name) : "";
  lineup.starters.forEach(p => {
    p.captain = captainKey && normalizeName(p.name) === captainKey;
  });

  let score = 0;
  lineup.starters.forEach(p => {
    score += starsAssignmentScore(p, { pos: p.assigned, side: p.assignedSide }) / 100;
  });
  lineup.score = Math.round(score * 10) / 10;
  return lineup;
}

function slotOrderForFormation(formation){
  return FORMATIONS[formation].map((slot, index) => ({...slot, index}));
}

function defaultCaptainNameForTeam(teamSide){
  if(teamSide === "A" && matchCaptains?.A) return matchCaptains.A;
  if(teamSide === "B" && matchCaptains?.B) return matchCaptains.B;
  if(teamSide === "A") return DEFAULT_CAPTAIN_A;
  if(teamSide === "B") return DEFAULT_CAPTAIN_B;
  return null;
}

function enforceMatchCaptains(teamA, teamB){
  const capA = defaultCaptainNameForTeam("A");
  const capB = defaultCaptainNameForTeam("B");
  if(capA) ensurePlayerOnTeam(capA, teamA, teamB);
  if(capB) ensurePlayerOnTeam(capB, teamB, teamA);
}

function violatesCaptainSplitRule(teamA, teamB){
  const capA = defaultCaptainNameForTeam("A");
  const capB = defaultCaptainNameForTeam("B");
  if(!capA || !capB || normalizeName(capA) === normalizeName(capB)) return false;

  const pool = [...teamA, ...teamB];
  if(!hasPlayer(pool, capA) || !hasPlayer(pool, capB)) return false;

  const aHasCapA = hasPlayer(teamA, capA);
  const aHasCapB = hasPlayer(teamA, capB);
  const bHasCapA = hasPlayer(teamB, capA);
  const bHasCapB = hasPlayer(teamB, capB);
  return (aHasCapA && aHasCapB) || (bHasCapA && bHasCapB);
}

function build(team, formation, teamSide){
  const slots = slotOrderForFormation(formation);
  const n = team.length;
  const captainName = defaultCaptainNameForTeam(teamSide);
  const captainKey = captainName ? normalizeName(captainName) : "";
  const forcedNames = captainKey && team.some(p => normalizeName(p.name) === captainKey)
    ? [captainKey]
    : [];
  const forcedIndexes = [];

  for(let i = 0; i < n; i++){
    if(forcedNames.includes(normalizeName(team[i].name))){
      forcedIndexes.push(i);
    }
  }

  const forcedFullMask = forcedIndexes.reduce((mask, idx) => mask | (1 << idx), 0);
  let solved;

  const capPoolLimit = window.MAX_LINEUP_DP_POOL || 18;
  if(n > capPoolLimit){
    solved = {score:-9999, picks:[]};
    const used = new Set();
    for(const slot of slots){
      let bestIndex = -1;
      let bestValue = -1e15;
      for(let i = 0; i < n; i++){
        if(used.has(i)) continue;
        const value = assignmentScore(team[i], slot);
        if(value > bestValue){
          bestValue = value;
          bestIndex = i;
        }
      }
      if(bestIndex >= 0){
        used.add(bestIndex);
        solved.picks.push({playerIndex:bestIndex, slot});
      }
    }
  }else{
  const memo = new Map();

  function solve(slotIdx, usedMask){
    if(slotIdx >= slots.length){
      if((usedMask & forcedFullMask) !== forcedFullMask){
        return {score:-1e15, picks:[]};
      }
      return {score:0, picks:[]};
    }

    const key = slotIdx + "|" + usedMask;
    if(memo.has(key)) return memo.get(key);

    const slot = slots[slotIdx];
    let best = {score:-1e15, picks:[]};

    for(let i = 0; i < n; i++){
      if(usedMask & (1 << i)) continue;

      const player = team[i];
      let score = assignmentScore(player, slot);

      if(forcedNames.includes(normalizeName(player.name))){
        score += 120;
      }

      const next = solve(slotIdx + 1, usedMask | (1 << i));
      const total = score + next.score;

      if(total > best.score){
        best = {score: total, picks: [{playerIndex:i, slot}, ...next.picks]};
      }
    }

    memo.set(key, best);
    return best;
  }

  solved = solve(0, 0);
  }

  if(!solved.picks || solved.picks.length < slots.length){
    solved = {score:-9999, picks:[]};
    const used = new Set();
    for(const slot of slots){
      let bestIndex = -1;
      let bestValue = -1e15;
      for(let i = 0; i < n; i++){
        if(used.has(i)) continue;
        const value = assignmentScore(team[i], slot);
        if(value > bestValue){
          bestValue = value;
          bestIndex = i;
        }
      }
      if(bestIndex >= 0){
        used.add(bestIndex);
        solved.picks.push({playerIndex:bestIndex, slot});
      }
    }
  }

  const usedIndexes = new Set(solved.picks.map(x => x.playerIndex));
  const starters = solved.picks.map(({playerIndex, slot}) => {
    const p = team[playerIndex];
    const f = fitLabelValue(p, slot.pos);
    const isCaptain = captainKey && normalizeName(p.name) === captainKey;
    return {
      ...p,
      assigned: slot.pos,
      assignedSide: slot.side,
      fit: f,
      forcedStarter: isCaptain,
      captain: isCaptain
    };
  });

  const bench = team.filter((_, idx) => !usedIndexes.has(idx));

  let score = 0;
  starters.forEach(p => {
    const slot = {pos:p.assigned, side:p.assignedSide};
    score += assignmentScore(p, slot) / 100;
    score += p.fit === 2 ? 80 : p.fit === 1 ? 35 : -120;
  });

  const order = {GK:0, DEF:1, MID:2, FWD:3};
  const sideOrder = {LEFT:0, CENTER:1, RIGHT:2};
  starters.sort((a,b) => {
    if(order[a.assigned] !== order[b.assigned]) return order[a.assigned] - order[b.assigned];
    return (sideOrder[a.assignedSide] ?? 1) - (sideOrder[b.assignedSide] ?? 1);
  });

  return {starters, bench, score:Math.round(score * 10) / 10};
}

function gkCandidateIndexes(team){
  const idx = [];
  team.forEach((p, i) => {
    if(canCoverPosition(p, "GK")) idx.push(i);
  });
  return idx;
}

function buildSubLineup(team, formation, benchNames, mainStarterNames, refMainLineup){
  const slots = slotOrderForFormation(formation);
  const n = team.length;
  const gkIndexes = gkCandidateIndexes(team);
  let forcedGkIndex = -1;

  if(gkIndexes.length === 1){
    forcedGkIndex = gkIndexes[0];
  }else{
    const mainGk = (refMainLineup.starters || []).find(p => p.assigned === "GK");
    if(mainGk){
      forcedGkIndex = team.findIndex(p => normalizeName(p.name) === normalizeName(mainGk.name));
    }
  }

  let solved;

  function subAssignmentScore(player, slot, playerIndex){
    let score = assignmentScore(player, slot);
    const nameKey = normalizeName(player.name);

    if(slot.pos === "GK"){
      if(forcedGkIndex >= 0 && playerIndex === forcedGkIndex) score += 200000;
      return score;
    }

    // Ưu tiên dự bị đội hình Chính vào Phụ trước
    if(benchNames.has(nameKey)) score += 125000;
    else if(mainStarterNames.has(nameKey)) score -= 78000;
    else score += 18000;

    return score;
  }

  const capPoolLimit = window.MAX_LINEUP_DP_POOL || 18;
  if(n > capPoolLimit){
    solved = {score: -9999, picks: []};
    const used = new Set();
    for(const slot of slots){
      let bestIndex = -1;
      let bestValue = -1e15;
      for(let i = 0; i < n; i++){
        if(used.has(i)) continue;
        if(slot.pos === "GK" && forcedGkIndex >= 0 && i !== forcedGkIndex) continue;
        const value = subAssignmentScore(team[i], slot, i);
        if(value > bestValue){
          bestValue = value;
          bestIndex = i;
        }
      }
      if(bestIndex >= 0){
        used.add(bestIndex);
        solved.picks.push({playerIndex: bestIndex, slot});
      }
    }
  }else{
  const memo = new Map();

  function solve(slotIdx, usedMask){
    if(slotIdx >= slots.length) return {score: 0, picks: []};

    const key = slotIdx + "|" + usedMask;
    if(memo.has(key)) return memo.get(key);

    const slot = slots[slotIdx];
    let best = {score: -1e15, picks: []};

    for(let i = 0; i < n; i++){
      if(usedMask & (1 << i)) continue;
      if(slot.pos === "GK" && forcedGkIndex >= 0 && i !== forcedGkIndex) continue;

      const player = team[i];
      const score = subAssignmentScore(player, slot, i);
      const next = solve(slotIdx + 1, usedMask | (1 << i));
      const total = score + next.score;

      if(total > best.score){
        best = {score: total, picks: [{playerIndex: i, slot}, ...next.picks]};
      }
    }

    memo.set(key, best);
    return best;
  }

  solved = solve(0, 0);
  }

  if(!solved.picks || solved.picks.length < slots.length){
    solved = {score: -9999, picks: []};
    const used = new Set();
    for(const slot of slots){
      let bestIndex = -1;
      let bestValue = -1e15;
      for(let i = 0; i < n; i++){
        if(used.has(i)) continue;
        if(slot.pos === "GK" && forcedGkIndex >= 0 && i !== forcedGkIndex) continue;
        const value = subAssignmentScore(team[i], slot, i);
        if(value > bestValue){
          bestValue = value;
          bestIndex = i;
        }
      }
      if(bestIndex >= 0){
        used.add(bestIndex);
        solved.picks.push({playerIndex: bestIndex, slot});
      }
    }
  }

  const usedIndexes = new Set(solved.picks.map(x => x.playerIndex));
  const starters = solved.picks.map(({playerIndex, slot}) => {
    const p = team[playerIndex];
    return {
      ...p,
      assigned: slot.pos,
      assignedSide: slot.side,
      fit: fitLabelValue(p, slot.pos),
      forcedStarter: false,
      captain: false
    };
  });

  const bench = team.filter((_, idx) => !usedIndexes.has(idx));

  let score = 0;
  starters.forEach(p => {
    const slot = {pos: p.assigned, side: p.assignedSide};
    score += assignmentScore(p, slot) / 100;
    score += p.fit === 2 ? 80 : p.fit === 1 ? 35 : -120;
  });

  const order = {GK: 0, DEF: 1, MID: 2, FWD: 3};
  const sideOrder = {LEFT: 0, CENTER: 1, RIGHT: 2};
  starters.sort((a, b) => {
    if(order[a.assigned] !== order[b.assigned]) return order[a.assigned] - order[b.assigned];
    return (sideOrder[a.assignedSide] ?? 1) - (sideOrder[b.assignedSide] ?? 1);
  });

  return {starters, bench, score: Math.round(score * 10) / 10};
}

function optimizeCapDual(pool){
  // Ước lượng dự bị Chính để xếp Phụ trước
  const estimateMain = build(pool, formationCapMain);
  const benchNames = new Set(estimateMain.bench.map(p => normalizeName(p.name)));
  const mainStarterNames = new Set(estimateMain.starters.map(p => normalizeName(p.name)));

  // 1. Đội hình Phụ trước — ưu tiên dự bị Chính
  const lineupSub = buildSubLineup(pool, formationCapSub, benchNames, mainStarterNames, estimateMain);

  // 2. Đội hình Chính sau
  const lineupMain = build(pool, formationCapMain);

  const benchInSub = lineupSub.starters.filter(p => benchNames.has(normalizeName(p.name))).length;
  const score = Math.round(lineupMain.score + lineupSub.score + benchInSub * 18);

  return {
    matchMode: "cap",
    teamCap: pool,
    teamMain: pool,
    teamSub: pool,
    lineupMain,
    lineupSub,
    lineupCap: lineupMain,
    teamA: pool,
    teamB: pool,
    lineupA: lineupMain,
    lineupB: lineupSub,
    score
  };
}

function counts(team){
  const c={GK:0,DEF:0,MID:0,FWD:0};
  team.forEach(p=>c[p.main]++);
  return c;
}

function coverCounts(team){
  const c={GK:0,DEF:0,MID:0,FWD:0};
  team.forEach(p=>{
    POS.forEach(pos=>{
      if(canCoverPosition(p,pos)) c[pos]++;
    });
  });
  return c;
}

function hasRequiredPositions(team){
  const c = coverCounts(team);
  return c.GK >= 1 && c.DEF >= 1 && c.MID >= 1 && c.FWD >= 1;
}

function ensurePlayerOnTeam(playerName, targetTeam, otherTeam){
  const key = normalizeName(playerName);
  const inPool = [...targetTeam, ...otherTeam].some(p => normalizeName(p.name) === key);
  if(!inPool || targetTeam.some(p => normalizeName(p.name) === key)) return;

  const idx = otherTeam.findIndex(p => normalizeName(p.name) === key);
  if(idx < 0) return;
  const player = otherTeam.splice(idx, 1)[0];
  if(targetTeam.length > 0){
    const swapIdx = Math.floor(Math.random() * targetTeam.length);
    otherTeam.push(targetTeam.splice(swapIdx, 1)[0]);
  }
  targetTeam.push(player);
}

function enforceHlvCaptainTeams(teamA, teamB){
  enforceMatchCaptains(teamA, teamB);
}

function evalSplit(a,b){
  const teamA = [...a];
  const teamB = [...b];
  enforceHlvCaptainTeams(teamA, teamB);
  const la=build(teamA, formationA, "A"), lb=build(teamB, formationB, "B");
  let s=la.score+lb.score;

  const ca=coverCounts(teamA), cb=coverCounts(teamB);
  POS.forEach(pos=>{
    s-=Math.abs((ca[pos]||0)-(cb[pos]||0))*18;
  });

  if(!hasRequiredPositions(teamA)) s-=5000;
  if(!hasRequiredPositions(teamB)) s-=5000;

  s-=Math.abs(teamA.length-teamB.length)*80;
  s-=Math.abs(sumRating(teamA)-sumRating(teamB))*22;
  s-=ratingDistributionPenalty(teamA, teamB);

  return {teamA, teamB, lineupA:la, lineupB:lb, score:Math.round(s)};
}

function sumRating(t){return t.reduce((s,p)=>s+(Number(p.rating)||5),0)}

function exactRatingCounts(team){
  const c = {};
  team.forEach(p => {
    const r = Math.max(1, Math.round(Number(p.rating) || 5));
    c[r] = (c[r] || 0) + 1;
  });
  return c;
}

function ratingDistributionPenalty(teamA, teamB){
  const a = exactRatingCounts(teamA);
  const b = exactRatingCounts(teamB);
  const weights = {10:720,9:560,8:300,7:220,6:120,5:90,4:60,3:50,2:40,1:30};

  let penalty = 0;
  for(let r = 1; r <= 10; r++){
    const diff = Math.abs((a[r] || 0) - (b[r] || 0));
    penalty += diff * (weights[r] || 50);
    if(r >= 9 && diff >= 2) penalty += diff * 900;
  }

  return penalty;
}

function ratingDistributionKey(team){
  const c = exactRatingCounts(team);
  return [10,9,8,7,6,5,4,3,2,1].map(r => `${r}:${c[r] || 0}`).join(" ");
}

function fastSplitScore(teamA, teamB){
  let s = 0;
  s -= Math.abs(teamA.length - teamB.length) * 250;
  s -= Math.abs(sumRating(teamA) - sumRating(teamB)) * 35;
  s -= ratingDistributionPenalty(teamA, teamB);

  const ca = coverCounts(teamA), cb = coverCounts(teamB);
  POS.forEach(pos=>{
    s -= Math.abs((ca[pos]||0)-(cb[pos]||0)) * 70;
  });

  if(teamA.length >= 7 && !hasRequiredPositions(teamA)) s -= 3000;
  if(teamB.length >= 7 && !hasRequiredPositions(teamB)) s -= 3000;

  return s;
}

function splitByRatingBalanced(list){
  const sorted = shuffle(list).sort((a,b)=>(Number(b.rating)||5)-(Number(a.rating)||5));
  const teamA = [];
  const teamB = [];

  for(const p of sorted){
    const scoreA = fastSplitScore([...teamA, p], teamB);
    const scoreB = fastSplitScore(teamA, [...teamB, p]);
    if(scoreA >= scoreB) teamA.push(p);
    else teamB.push(p);
  }

  enforceHlvCaptainTeams(teamA, teamB);
  return [teamA, teamB];
}

function splitCandidateScore(teamA, teamB){
  let s = fastSplitScore(teamA, teamB);
  if(!hasRequiredPositions(teamA)) s -= 8000;
  if(!hasRequiredPositions(teamB)) s -= 8000;
  if(violatesCaptainSplitRule(teamA, teamB)) s -= 9000;
  const pool = [...teamA, ...teamB];
  const capA = defaultCaptainNameForTeam("A");
  const capB = defaultCaptainNameForTeam("B");
  if(capA && hasPlayer(pool, capA) && !hasPlayer(teamA, capA)) s -= 9000;
  if(capB && hasPlayer(pool, capB) && !hasPlayer(teamB, capB)) s -= 9000;
  return s;
}

function hasPlayer(team, targetName){
  const target = normalizeName(targetName);
  return team.some(p => normalizeName(p.name) === target);
}

function normalizeName(name){
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function randomBest(list){
  let candidateMap = new Map();

  // Bước 1: random danh sách 2 đội dựa trên chất lượng/rating + đủ vị trí.
  // Không chạy optimizer đội hình ở bước này để tránh bị stuck.
  for(let i = 0; i < 900; i++){
    const [teamA, teamB] = splitByRatingBalanced(list);
    if(Math.abs(teamA.length - teamB.length) > 1) continue;

    const key = teamA.map(p=>p.id).sort().join("|") + "___" + teamB.map(p=>p.id).sort().join("|");
    const quickScore = splitCandidateScore(teamA, teamB);

    if(!candidateMap.has(key) || candidateMap.get(key).quickScore < quickScore){
      candidateMap.set(key, {teamA, teamB, quickScore});
    }
  }

  let candidates = Array.from(candidateMap.values())
    .sort((a,b)=>b.quickScore-a.quickScore)
    .slice(0, 40);

  if(!candidates.length){
    for(let i = 0; i < 80; i++){
      const sh = shuffle(list);
      const half = Math.ceil(sh.length / 2);
      const teamA = sh.slice(0, half);
      const teamB = sh.slice(half);
      enforceHlvCaptainTeams(teamA, teamB);
      candidates.push({teamA, teamB, quickScore: 0});
    }
  }

  // Bước 2: sau khi đã có danh sách 2 đội, mới tối ưu đội hình chính theo sơ đồ.
  let best = null;
  for(const c of candidates){
    const res = evalSplit(c.teamA, c.teamB);
    if(!best || res.score > best.score) best = res;
  }

  if(best){
    console.log("Rating distribution A:", ratingDistributionKey(best.teamA));
    console.log("Rating distribution B:", ratingDistributionKey(best.teamB));
  }

  return best;
}
