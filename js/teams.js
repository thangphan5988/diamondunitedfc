/* Teams — full player cards (FUT-style) */

let teamsSort = "rating";
let teamsFilterPos = "";
let teamsStatsMap = new Map();
let teamsStatsLoaded = false;

const FUT_POS_LABEL = { GK: "GK", DEF: "CB", MID: "CM", FWD: "ST" };

function futOverallRating(rating){
  return Math.min(99, Math.max(40, Math.round(Number(rating || 5) * 10)));
}

function futCardTier(rating){
  const r = Number(rating) || 5;
  if(r >= 9) return "gold";
  if(r >= 7) return "blue";
  return "silver";
}

function futAttribute(rating, main, attr){
  const base = futOverallRating(rating);
  const boosts = {
    GK:  { PAC: 0.82, SHO: 0.72, PAS: 0.88, DRI: 0.78, DEF: 0.96, PHY: 0.92 },
    DEF: { PAC: 0.88, SHO: 0.78, PAS: 0.86, DRI: 0.82, DEF: 0.98, PHY: 0.94 },
    MID: { PAC: 0.92, SHO: 0.90, PAS: 0.98, DRI: 0.94, DEF: 0.84, PHY: 0.90 },
    FWD: { PAC: 0.96, SHO: 0.98, PAS: 0.90, DRI: 0.96, DEF: 0.76, PHY: 0.88 }
  };
  const mult = (boosts[main] || boosts.MID)[attr] || 0.9;
  return Math.min(99, Math.max(40, Math.round(base * mult)));
}

function profileCardSrc(url, fallbackName, zaloAvatar){
  const u = String(url || "").trim();
  if(u) return avatarSrc(u, fallbackName);
  const z = String(zaloAvatar || "").trim();
  if(z) return avatarSrc(z, fallbackName);
  return defaultAvatar(fallbackName || "?");
}

function playerPositionsLabel(p){
  const sec = (p.secondary || []).join("/");
  return sec ? `${p.main}/${sec}` : p.main;
}

function playerSideShort(p){
  const sides = normalizeSideList(p.side || p.preferred_side || "");
  if(!sides.length) return "";
  const map = { LEFT: "Trái", RIGHT: "Phải", CENTER: "Giữa" };
  return sides.map(s => map[s] || s).join(" · ");
}

async function ensureTeamsStats(){
  if(teamsStatsLoaded) return;
  try{
    const data = await apiGet("get_player_stats");
    teamsStatsMap = new Map();
    (data.stats || []).forEach(s => {
      teamsStatsMap.set(normalizeName(s.player_name), {
        goals: Number(s.goals) || 0,
        assists: Number(s.assists) || 0
      });
    });
  }catch(e){
    console.error(e);
  }finally{
    teamsStatsLoaded = true;
  }
}

function enrichPlayerForTeams(p){
  const totals = teamsStatsMap.get(normalizeName(p.name)) || { goals: 0, assists: 0 };
  return Object.assign({}, p, {
    total_goals: totals.goals,
    total_assists: totals.assists
  });
}

function futCardHtml(p){
  const overall = futOverallRating(p.rating);
  const tier = futCardTier(p.rating);
  const pos = FUT_POS_LABEL[p.main] || p.main;
  const name = playerDisplayName(p).toUpperCase();
  const portrait = profileCardSrc(p.profile_card, p.name, p.avatar);
  const jersey = p.jersey_number != null && p.jersey_number !== "" ? `#${Number(p.jersey_number)}` : "";
  const mvp = Number(p.mvp_count) || 0;
  const attrs = {
    PAC: futAttribute(p.rating, p.main, "PAC"),
    SHO: futAttribute(p.rating, p.main, "SHO"),
    PAS: futAttribute(p.rating, p.main, "PAS"),
    DRI: futAttribute(p.rating, p.main, "DRI"),
    DEF: futAttribute(p.rating, p.main, "DEF"),
    PHY: futAttribute(p.rating, p.main, "PHY")
  };
  const sideText = playerSideShort(p);
  const posText = playerPositionsLabel(p);
  const inactive = Number(p.inactivity_penalty) > 0 ? ` · −${p.inactivity_penalty} vắng` : "";
  const extraParts = [
    posText,
    sideText,
    mvp ? `🏆 ${mvp} MVP` : "",
    Number(p.total_goals) ? `⚽ ${p.total_goals}` : "",
    Number(p.total_assists) ? `🅰️ ${p.total_assists}` : ""
  ].filter(Boolean);

  return `<article class="futCard futCard--${tier}" title="${escapeAttr(playerDisplayName(p))}">
    <div class="futCardInner">
      <div class="futCardTop">
        <div class="futCardMeta">
          <div class="futRating">${overall}</div>
          <div class="futPos">${escapeHtml(pos)}</div>
          ${jersey ? `<div class="futJersey">${escapeHtml(jersey)}</div>` : ""}
          <img class="futClub" src="assets/logo.png" width="24" height="24" alt="DUFC">
        </div>
        <div class="futPortraitWrap">
          <img class="futPortrait" src="${escapeAttr(portrait)}" alt="" loading="lazy"
            onerror="this.src='${escapeAttr(defaultAvatar(p.name))}'">
        </div>
      </div>
      ${mvp ? `<div class="futCardMvp">🏆 ${mvp}</div>` : ""}
      <div class="futName">${escapeHtml(name)}</div>
      <div class="futStats">
        <div class="futStat"><b>${attrs.PAC}</b><span>PAC</span></div>
        <div class="futStat"><b>${attrs.DRI}</b><span>DRI</span></div>
        <div class="futStat"><b>${attrs.SHO}</b><span>SHO</span></div>
        <div class="futStat"><b>${attrs.DEF}</b><span>DEF</span></div>
        <div class="futStat"><b>${attrs.PAS}</b><span>PAS</span></div>
        <div class="futStat"><b>${attrs.PHY}</b><span>PHY</span></div>
      </div>
      <div class="futExtra">${escapeHtml(extraParts.join(" · ") + inactive)}</div>
    </div>
  </article>`;
}

function setTeamsPosFilter(pos){
  teamsFilterPos = pos || "";
  document.querySelectorAll(".teamsPosBtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.pos === teamsFilterPos);
  });
  renderTeams();
}

async function renderTeams(){
  const grid = document.getElementById("teamsGrid");
  const countEl = document.getElementById("teamsCount");
  if(!grid) return;

  if(!players.length){
    grid.innerHTML = `<div class="teamsEmpty">Đang tải danh sách cầu thủ...</div>`;
    if(countEl) countEl.textContent = "";
    return;
  }

  grid.innerHTML = `<div class="teamsEmpty">Đang tải thống kê...</div>`;
  await ensureTeamsStats();

  const keyword = normalizeName(String(document.getElementById("teamsSearch")?.value || "").trim());
  let list = players.map(enrichPlayerForTeams);

  if(teamsFilterPos){
    list = list.filter(p => p.main === teamsFilterPos || (p.secondary || []).includes(teamsFilterPos));
  }
  if(keyword){
    list = list.filter(p => {
      const hay = normalizeName([
        p.name, p.display_name, p.main, (p.secondary || []).join(" "),
        sideLabel(p.side), jerseyLabel(p.jersey_number), String(p.rating)
      ].join(" "));
      return hay.includes(keyword);
    });
  }

  list.sort((a, b) => {
    if(teamsSort === "name") return playerDisplayName(a).localeCompare(playerDisplayName(b), "vi");
    if(teamsSort === "jersey"){
      const ja = a.jersey_number != null ? Number(a.jersey_number) : 999;
      const jb = b.jersey_number != null ? Number(b.jersey_number) : 999;
      return ja - jb || playerDisplayName(a).localeCompare(playerDisplayName(b), "vi");
    }
    if(teamsSort === "position") return (a.main || "").localeCompare(b.main || "") || (Number(b.rating) - Number(a.rating));
    const diff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
    return diff || playerDisplayName(a).localeCompare(playerDisplayName(b), "vi");
  });

  if(countEl) countEl.textContent = `${list.length} cầu thủ`;

  if(!list.length){
    grid.innerHTML = `<div class="teamsEmpty">Không tìm thấy cầu thủ phù hợp.</div>`;
    return;
  }

  grid.innerHTML = list.map(futCardHtml).join("");
}

function invalidateTeamsStats(){
  teamsStatsLoaded = false;
  teamsStatsMap = new Map();
}
