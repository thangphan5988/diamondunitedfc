/* Match rebuild, pending restore, formations */

function calcRatingDelta(matchScore){
  const s = Number(matchScore);
  if(!Number.isFinite(s)) return 0;
  if(s >= 8) return 1;
  if(s <= 5) return -1;
  return 0;
}

function deltaLabel(delta){
  if(delta > 0) return "+" + delta;
  if(delta < 0) return String(delta);
  return "0";
}

function deltaClass(delta){
  if(delta > 0) return "up";
  if(delta < 0) return "down";
  return "zero";
}

function getAllMatchPlayers(){
  if(!lastResult) return [];
  const result = [];
  function addTeam(teamName, shirt, lineup){
    lineup.starters.forEach(p => result.push(Object.assign({}, p, {team: teamName, shirt, starter: true})));
    lineup.bench.forEach(p => result.push(Object.assign({}, p, {team: teamName, shirt, starter: false})));
  }
  if(isCapMode()){
    const pool = lastResult.teamCap || lastResult.teamMain || lastResult.teamA || [];
    const lineupMain = lastResult.lineupMain || lastResult.lineupA || { starters: [], bench: [] };
    const lineupSub = lastResult.lineupSub || lastResult.lineupB || { starters: [], bench: [] };
    const enrichMap = new Map();
    [...lineupMain.starters, ...lineupMain.bench, ...lineupSub.starters].forEach(p => {
      if(!enrichMap.has(p.name)) enrichMap.set(p.name, p);
    });

    pool.forEach(p => {
      const ep = enrichMap.get(p.name) || p;
      const inMain = lineupMain.starters.some(x => x.name === p.name);
      const inSub = lineupSub.starters.some(x => x.name === p.name);
      let capLabel = "Dự bị";
      if(inMain && inSub) capLabel = "Chính RS · Phụ RS";
      else if(inMain) capLabel = "Chính RS";
      else if(inSub) capLabel = "Phụ RS";

      result.push(Object.assign({}, ep, {
        team: "CAP",
        shirt: "DUFC",
        starter: inMain || inSub,
        capLabel
      }));
    });
    return result;
  }
  addTeam("A", "Áo Đỏ", lastResult.lineupA);
  addTeam("B", "Áo Vàng", lastResult.lineupB);
  return result;
}

function updateLockBannerContent(){
  const textEl = document.getElementById("lockBannerText");
  const resultBtn = document.getElementById("btnLockBannerResult");
  if(!textEl || !matchLocked || !bothTeamsConfirmed()) return;

  const label = displayMatchLabel();
  const cap = isCapMode();
  const canResult = isLoggedIn() && canEnterAnyResult();
  const exportHint = isLoggedIn() && hasPerm(PERMS.EXPORT) && (canSplitTeams() || (cap && canCoordinateCap()))
    ? ` <span class="meta">(${escapeHtml(lineupExportButtonLabel())} để gửi ảnh vào nhóm Zalo — tùy chọn)</span>`
    : "";

  if(cap){
    textEl.innerHTML =
      `🔒 Trận Cáp <b>${escapeHtml(label)}</b> — nhập kết quả sau trận.${exportHint}`;
  }else{
    textEl.innerHTML =
      `🔒 Trận <b>${escapeHtml(label)}</b> — nhập kết quả sau trận.${exportHint}`;
  }

  if(resultBtn){
    resultBtn.style.display = canResult ? "" : "none";
    resultBtn.disabled = false;
    resultBtn.title = "";
    resultBtn.textContent = "Nhập kết quả trận";
  }
  updateHlvResultStatusUI();
}

function shouldShowLockBanner(){
  if(!matchLocked || !bothTeamsConfirmed()) return false;
  return canEnterAnyResult() || isMatchHost() ||
    (canSplitTeams() && hasPerm(PERMS.EXPORT)) ||
    (isCapMode() && canCoordinateCap() && hasPerm(PERMS.EXPORT));
}

function applyLockUI(locked){
  matchLocked = locked;
  const banner = document.getElementById("lockBanner");
  const grid = document.getElementById("lineupGrid");
  if(locked){
    if(shouldShowLockBanner()){
      updateLockBannerContent();
      banner.classList.add("show");
    }else{
      banner.classList.remove("show");
    }
    grid.classList.add("locked");
    const btnPublish = document.getElementById("btnPublish");
    if(btnPublish){ btnPublish.style.display = "none"; btnPublish.disabled = true; }
    const btnRandom = document.getElementById("btnRandom");
    if(btnRandom){ btnRandom.style.display = "none"; btnRandom.disabled = true; }
  }else{
    banner.classList.remove("show");
    grid.classList.remove("locked");
    const btnRandom = document.getElementById("btnRandom");
    if(btnRandom) btnRandom.disabled = false;
  }
  applyLineupRoleUI();
}

function lockMatchState(matchId, matchLabel, imageFilename){
  currentMatchId = matchId;
  currentMatchLabel = matchLabel || matchId;
  currentImageFilename = imageFilename;
  const allPlayers = getAllMatchPlayers();
  playerMatchScores = {};
  playerMatchGoals = {};
  playerMatchAssists = {};
  playerGoalVideoUrls = {};
  highlightVideoUrl = "";
  allPlayers.forEach(p => {
    playerMatchScores[p.name] = 7;
    playerMatchGoals[p.name] = 0;
    playerMatchAssists[p.name] = 0;
  });
  finishPendingMatchRestore();
}

function unlockMatchState(){
  matchLocked = false;
  teamConfirmState = { A: false, B: false };
  teamResultSaved = { A: false, B: false };
  pendingTeamAScore = "";
  pendingTeamBScore = "";
  lineupPublishedToHlv = false;
  lineupDragSession = null;
  localStorage.removeItem("dufc_team_workflow");
  currentMatchId = null;
  currentMatchLabel = null;
  setCurrentMatchDate(null);
  currentMatchStartTime = DEFAULT_MATCH_START_TIME;
  setMatchStartTimeSelect(DEFAULT_MATCH_START_TIME);
  currentImageFilename = null;
  opponentTeamName = "";
  playerMatchScores = {};
  playerMatchGoals = {};
  playerMatchAssists = {};
  playerGoalVideoUrls = {};
  highlightVideoUrl = "";
  localStorage.removeItem(PENDING_MATCH_KEY);
  applyLockUI(false);
  lastResult = null;
  clearPitch("pitchA");
  clearPitch("pitchB");
  clearPitch("pitchCapMain");
  clearPitch("pitchCapSub");
  setBench("benchA", []);
  setBench("benchB", []);
  setBench("benchCapMain", []);
  setBench("benchCapSub", []);
  document.getElementById("textResult").textContent = "";
  document.getElementById("sizes").textContent = "0 - 0";
  document.getElementById("score").textContent = "0";
  document.getElementById("scoreA").textContent = "";
  document.getElementById("scoreB").textContent = "";
  document.getElementById("sizesCap").textContent = "0 / 0";
  document.getElementById("scoreCap").textContent = "0";
  document.getElementById("scoreCapMain").textContent = "";
  document.getElementById("scoreCapSub").textContent = "";
  selectAll(false);
}

function rosterPlayerByName(name){
  const key = normalizeName(name);
  return players.find(p => normalizeName(p.name) === key);
}

function fitFromHistoryLabel(fitLabel){
  if(fitLabel === "main_position") return 2;
  if(fitLabel === "secondary_position") return 1;
  return 0;
}

function isCapMatchFromDetail(summary, historyPlayers){
  const type = String(summary?.match_type || "").trim().toLowerCase();
  if(type === "cap") return true;
  const teams = new Set((historyPlayers || []).map(hp => String(hp.team || "").toUpperCase()));
  return teams.has("CAP") || teams.has("MAIN") || teams.has("SUB") ||
    (!teams.has("B") && !teams.has("A") && teams.size <= 2);
}

function rebuildLastResultFromDetail(historyPlayers, summary){
  const capMatch = isCapMatchFromDetail(summary, historyPlayers);
  const teamA = [];
  const teamB = [];
  const teamMain = [];
  const teamSub = [];
  const teamCap = [];
  const lineupA = { starters: [], bench: [], score: 0 };
  const lineupB = { starters: [], bench: [], score: 0 };
  const lineupMain = { starters: [], bench: [], score: 0 };
  const lineupSub = { starters: [], bench: [], score: 0 };
  const lineupCap = { starters: [], bench: [], score: 0 };
  const teamsInMatch = new Set((historyPlayers || []).map(hp => String(hp.team || "").toUpperCase()));
  const hasMainSub = teamsInMatch.has("MAIN") || teamsInMatch.has("SUB");
  const seenLineupRows = new Set();
  const seenTeamPlayers = new Set();

  historyPlayers.forEach(hp => {
    const teamKey = String(hp.team || "").toUpperCase();
    const isStarter = hp.starter === true || hp.starter === "TRUE";
    const lineupKey = `${teamKey}|${normalizeName(hp.player_name)}|${isStarter ? "S" : "B"}`;
    if(seenLineupRows.has(lineupKey)) return;
    seenLineupRows.add(lineupKey);
    let base = rosterPlayerByName(hp.player_name);
    if(!base){
      base = {
        id: hp.player_name,
        name: hp.player_name,
        main: hp.main_position || "MID",
        secondary: [],
        rating: Number(hp.rating) || 5,
        mvp_count: 0,
        avatar: defaultAvatar(hp.player_name),
        side: [],
        selected: true
      };
    }

    const assignedRaw = hp.assigned_position === "BENCH"
      ? (hp.main_position || base.main)
      : (hp.assigned_position || base.main);
    const assigned = normalizePos(assignedRaw) || base.main;
    const customX = hp.custom_x != null ? Number(hp.custom_x) : (hp.customX != null ? Number(hp.customX) : null);
    const customY = hp.custom_y != null ? Number(hp.custom_y) : (hp.customY != null ? Number(hp.customY) : null);
    const p = Object.assign({}, base, {
      rating: Number(hp.rating) || base.rating,
      assigned,
      assignedSide: hp.assigned_side || "",
      captain: hp.captain === true || hp.captain === "TRUE",
      fit: fitFromHistoryLabel(hp.fit_label)
    });
    if(isValidPitchCoord(customX, customY)){
      p.customX = customX;
      p.customY = customY;
      p.hasCustomPosition = true;
    }

    const isTeamA = teamKey === "A";
    const isMain = capMatch && (teamKey === "MAIN" || (!hasMainSub && teamKey === "CAP"));
    const isSub = capMatch && teamKey === "SUB";
    const teamPlayerKey = `${teamKey}|${normalizeName(hp.player_name)}`;

    if(isMain){
      if(!seenTeamPlayers.has(teamPlayerKey)){
        seenTeamPlayers.add(teamPlayerKey);
        teamMain.push(p);
        teamCap.push(p);
      }
    }else if(isSub){
      if(!seenTeamPlayers.has(teamPlayerKey)){
        seenTeamPlayers.add(teamPlayerKey);
        teamSub.push(p);
        teamCap.push(p);
      }
    }else if(isTeamA){
      if(!seenTeamPlayers.has(teamPlayerKey)){
        teamA.push(p);
        seenTeamPlayers.add(teamPlayerKey);
      }
    }else if(!seenTeamPlayers.has(teamPlayerKey)){
      teamB.push(p);
      seenTeamPlayers.add(teamPlayerKey);
    }

    if(isMain){
      if(isStarter) lineupMain.starters.push(p);
      else lineupMain.bench.push(p);
      if(isStarter) lineupCap.starters.push(p);
      else lineupCap.bench.push(p);
    }else if(isSub){
      if(isStarter) lineupSub.starters.push(p);
      else lineupSub.bench.push(p);
    }else if(isTeamA){
      if(isStarter) lineupA.starters.push(p);
      else lineupA.bench.push(p);
    }else{
      if(isStarter) lineupB.starters.push(p);
      else lineupB.bench.push(p);
    }
  });

  if(capMatch || teamCap.length){
    const pool = teamMain.length ? teamMain : teamCap;
    const subStarterNames = new Set(lineupSub.starters.map(p => p.name));
    if(lineupSub.starters.length && pool.length){
      lineupSub.bench = pool.filter(p => !subStarterNames.has(p.name));
    }
    const primaryLineup = lineupMain.starters.length || lineupMain.bench.length ? lineupMain : lineupCap;

    return {
      matchMode: "cap",
      teamCap: pool,
      teamMain: pool,
      teamSub: pool,
      lineupMain: primaryLineup,
      lineupSub,
      lineupCap: primaryLineup,
      teamA: pool,
      teamB: pool,
      lineupA: primaryLineup,
      lineupB: lineupSub,
      score: 0
    };
  }

  sortLineupByHistoryOrder(lineupA, historyPlayers, "A");
  sortLineupByHistoryOrder(lineupB, historyPlayers, "B");
  return { matchMode: "internal", teamA, teamB, lineupA, lineupB, score: 0 };
}

function isValidPitchCoord(x, y){
  return Number.isFinite(x) && Number.isFinite(y) && x >= 4 && x <= 96 && y >= 4 && y <= 96;
}

function sortLineupByHistoryOrder(lineup, historyPlayers, team){
  if(!lineup) return;
  const orderMap = {};
  (historyPlayers || []).forEach(hp => {
    if(String(hp.team || "").toUpperCase() !== team) return;
    orderMap[hp.player_name] = Number(hp.lineup_order) || 999;
  });
  const byOrder = (a, b) => (orderMap[a.name] || 999) - (orderMap[b.name] || 999);
  if(lineup.starters?.length) lineup.starters.sort(byOrder);
  if(lineup.bench?.length) lineup.bench.sort(byOrder);
}

function syncSelectedPlayersFromMatch(historyPlayers){
  const names = new Set((historyPlayers || []).map(hp => normalizeName(hp.player_name)));
  players.forEach(p => { p.selected = names.has(normalizeName(p.name)); });
  renderPlayerPicker();
  updateStats();
}

function finishPendingMatchRestore(sourceNote, options = {}){
  const cap = isCapMode();
  switchLineupMode(cap ? "cap" : "internal", true);

  if(cap){
    document.getElementById("formationSelectCapMain").value = formationCapMain;
    document.getElementById("formationSelectCapSub").value = formationCapSub;
    renderCapLineups(lastResult);
    updateCapResultStats(lastResult);
    document.getElementById("textResult").textContent = textResultCap(lastResult);
  }else{
    document.getElementById("formationSelectA").value = formationA;
    document.getElementById("formationSelectB").value = formationB;
    renderInternalLineups();
    updateResultStats(lastResult, getAllMatchPlayers().length);
    document.getElementById("textResult").textContent = textResult(lastResult);
  }

  localStorage.setItem(PENDING_MATCH_KEY, JSON.stringify({
    matchId: currentMatchId,
    matchLabel: currentMatchLabel,
    matchDate: getMatchDateForSave(),
    matchStartTime: getSelectedMatchStartTime(),
    imageFilename: currentImageFilename,
    lineupMode: getMatchMode(),
    lineupPublishedToHlv,
    formationA,
    formationB,
    formationCapMain,
    formationCapSub,
    opponentTeamName,
    lastResult,
    playerMatchScores,
    playerMatchGoals,
    playerMatchAssists,
    playerGoalVideoUrls,
    highlightVideoUrl,
    teamConfirmState,
    teamResultSaved,
    lockedAt: new Date().toISOString()
  }));
  persistTeamWorkflowState();

  const status = String(options.status || "").toLowerCase();
  const shouldLock = options.lock === true || bothTeamsConfirmed() || status === "lineup_exported";
  applyLockUI(shouldLock);
  const note = sourceNote ? ` <span class="meta">(${sourceNote})</span>` : "";
  if(shouldLock){
    if(bothTeamsConfirmed()){
      document.getElementById("ocrStatus").innerHTML =
        `Trận <b>${displayMatchLabel()}</b> đã chốt — nhập kết quả sau trận.${note}`;
    }else if(currentImageFilename){
      document.getElementById("ocrStatus").innerHTML =
        `Đang chờ kết quả trận <b>${displayMatchLabel()}</b>.${note}`;
    }else if(canSplitTeams()){
      updateCoordinatorConfirmStatus();
    }else{
      document.getElementById("ocrStatus").innerHTML =
        `Trận <b>${displayMatchLabel()}</b> đã chốt — chờ xuất hình đội hình.${note}`;
    }
  }else{
    if(canSplitTeams() && !cap){
      updateCoordinatorConfirmStatus();
    }else if(canCoordinateCap() && cap && lineupPublishedToHlv){
      updateCoordinatorConfirmStatus();
    }else if(lineupPublishedToHlv){
      document.getElementById("ocrStatus").innerHTML =
        `Đội hình <b>${displayMatchLabel()}</b> đã sẵn sàng — HLV có thể chỉnh & chốt.${note}`;
    }
  }
  applyLineupRoleUI();
}

function resolveFormation(value, fallback = "3-1-2"){
  const fb = FORMATIONS[fallback] ? fallback : "3-1-2";
  const s = String(value || "").trim();
  if(!s) return fb;
  if(FORMATIONS[s]) return s;
  const dashed = s.replace(/\//g, "-");
  if(FORMATIONS[dashed]) return dashed;
  const dateMangle = s.match(/^(\d-\d-\d)/);
  if(dateMangle && FORMATIONS[dateMangle[1]]) return dateMangle[1];
  if(s.includes("T") && s.includes(":")) return fb;
  return fb;
}

function normalizeFormationValue(value, fallback){
  return resolveFormation(value, fallback);
}

function restorePendingMatchFromLocalStorage(){
  const raw = localStorage.getItem(PENDING_MATCH_KEY);
  if(!raw) return false;

  try{
    const saved = JSON.parse(raw);
    if(!saved || !saved.matchId || !saved.lastResult) return false;
    if((saved.lineupMode === "cap" || isCapMode()) && !saved.lineupPublishedToHlv) return false;

    currentMatchId = saved.matchId;
    currentMatchLabel = saved.matchLabel || formatMatchLabel(saved.lockedAt || Date.now());
    setCurrentMatchDate(saved.matchDate || parseMatchDateFromLabel(currentMatchLabel) || parseMatchDateFromMatchId(currentMatchId));
    setMatchStartTimeSelect(saved.matchStartTime || DEFAULT_MATCH_START_TIME);
    currentImageFilename = saved.imageFilename || "";
    formationA = normalizeFormationValue(saved.formationA, formationA);
    formationB = normalizeFormationValue(saved.formationB, formationB);
    formationCapMain = normalizeFormationValue(saved.formationCapMain || saved.formationCap, formationCapMain);
    formationCapSub = normalizeFormationValue(saved.formationCapSub || saved.formationCap, formationCapSub);
    opponentTeamName = saved.opponentTeamName || "";
    lastResult = saved.lastResult;
    if(saved.lineupMode) lineupMode = saved.lineupMode;
    playerMatchScores = saved.playerMatchScores || {};
    playerMatchGoals = saved.playerMatchGoals || {};
    playerMatchAssists = saved.playerMatchAssists || {};
    playerGoalVideoUrls = saved.playerGoalVideoUrls || {};
    highlightVideoUrl = saved.highlightVideoUrl || "";
    teamConfirmState = Object.assign({ A: false, B: false, Main: false, Sub: false }, saved.teamConfirmState || {});
    teamResultSaved = Object.assign({ A: false, B: false }, saved.teamResultSaved || {});
    loadPendingScoresFromStore(saved);
    lineupPublishedToHlv = !!saved.lineupPublishedToHlv;
    const capRestore = saved.lineupMode === "cap" || isCapMode();
    finishPendingMatchRestore("(offline cache)", {
      lock: !!saved.imageFilename || (capRestore ? !!(teamConfirmState.Main && teamConfirmState.Sub) : !!(teamConfirmState.A && teamConfirmState.B)),
      status: saved.imageFilename ? "lineup_exported" : "lineup_published"
    });
    return true;
  }catch(e){
    console.error(e);
    localStorage.removeItem(PENDING_MATCH_KEY);
    return false;
  }
}

async function restorePendingMatchIfAny(){
  try{
    const data = await apiGet("get_pending_match");

    if(applyServerPendingMatch(data)){
      if(canSplitTeams() || (canCoordinateCap() && isCapMode())) updateCoordinatorConfirmStatus();
      return;
    }

    // Sheet không còn trận pending → xóa cache browser cũ
    localStorage.removeItem(PENDING_MATCH_KEY);
    if(matchLocked) unlockMatchState();
  }catch(e){
    console.error("restorePendingMatchIfAny server failed:", e);
    restorePendingMatchFromLocalStorage();
  }
}
