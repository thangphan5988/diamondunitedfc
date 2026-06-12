/* Teams — full player cards */

let teamsFilterPos = "";
let teamsStatsMap = new Map();
let teamsStatsLoaded = false;

function teamCardTier(rating){
  const r = Number(rating) || 5;
  if(r >= 9) return "gold";
  if(r >= 7) return "blue";
  return "silver";
}

function profileCardSrc(url, fallbackName, zaloAvatar){
  const u = String(url || "").trim();
  if(u) return avatarSrc(u, fallbackName);
  const z = String(zaloAvatar || "").trim();
  if(z) return avatarSrc(z, fallbackName);
  return defaultAvatar(fallbackName || "?");
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

function teamStatChip(value, icon, extraClass){
  const n = Number(value) || 0;
  if(n <= 0) return "";
  const cls = extraClass ? `teamCardInfoItem ${extraClass}` : "teamCardInfoItem";
  return `<span class="${cls}"><b>${n}</b><span>${icon}</span></span>`;
}

function teamCardHtml(p){
  const tier = teamCardTier(p.rating);
  const tierClass = tier === "gold" ? "gold" : tier === "silver" ? "silver" : "";
  const name = playerDisplayName(p);
  const portrait = profileCardSrc(p.profile_card, p.name, p.avatar);
  const jerseyNum = p.jersey_number != null && p.jersey_number !== "" ? String(Number(p.jersey_number)) : "";
  const rating = Number.isFinite(Number(p.rating)) ? Number(p.rating) : 5;
  const goals = Number(p.total_goals) || 0;
  const assists = Number(p.total_assists) || 0;
  const mvp = Number(p.mvp_count) || 0;

  const statItems = [];
  if(rating > 0) statItems.push(teamStatChip(rating, "⭐"));
  if(mvp > 0) statItems.push(teamStatChip(mvp, "🏆", "teamCardInfoItem--mvp"));
  if(goals > 0) statItems.push(teamStatChip(goals, "⚽"));
  if(assists > 0) statItems.push(teamStatChip(assists, "🅰️"));

  return `<article class="teamCard${tierClass ? ` teamCard--${tierClass}` : ""}" title="${escapeAttr(name)}">
    <div class="teamCardInner">
      <span class="teamCardCorner" aria-hidden="true"></span>
      <span class="teamCardCorner teamCardCorner--br" aria-hidden="true"></span>
      <div class="teamCardPortrait teamCardPortraitBtn" role="button" tabindex="0"
        data-player-name="${escapeAttr(p.name)}"
        onclick="openTeamPlayerModal(this.dataset.playerName)"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openTeamPlayerModal(this.dataset.playerName)}">
        <img src="${escapeAttr(portrait)}" alt="" loading="lazy"
          onerror="this.src='${escapeAttr(defaultAvatar(p.name))}'">
      </div>
      <div class="teamCardFoot">
        <div class="teamCardName">${escapeHtml(name)}</div>
        <div class="teamCardInfoRow">
          <div class="teamCardInfoMain">
            <b>${jerseyNum ? escapeHtml(jerseyNum) : "—"}</b>
            <span>${escapeHtml(p.main)}</span>
          </div>
          ${statItems.length ? `<div class="teamCardInfoStats">${statItems.join("")}</div>` : ""}
        </div>
      </div>
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

  let list = players.map(enrichPlayerForTeams);

  if(teamsFilterPos){
    list = list.filter(p => p.main === teamsFilterPos);
  }

  list.sort((a, b) => {
    const diff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
    return diff || playerDisplayName(a).localeCompare(playerDisplayName(b), "vi");
  });

  if(countEl) countEl.textContent = `${list.length} cầu thủ`;

  if(!list.length){
    grid.innerHTML = `<div class="teamsEmpty">Không tìm thấy cầu thủ phù hợp.</div>`;
    return;
  }

  grid.innerHTML = list.map(teamCardHtml).join("");
}

function invalidateTeamsStats(){
  teamsStatsLoaded = false;
  teamsStatsMap = new Map();
}

function teamPlayerInfoRow(label, value){
  if(value == null || value === "") return "";
  return `<div class="teamPlayerInfoRow"><span>${escapeHtml(label)}</span><b>${escapeHtml(String(value))}</b></div>`;
}

function openTeamPlayerModal(name){
  const key = normalizeName(name);
  const raw = players.find(p => normalizeName(p.name) === key);
  if(!raw) return;

  const p = enrichPlayerForTeams(raw);
  const display = playerDisplayName(p);
  const portrait = profileCardSrc(p.profile_card, p.name, p.avatar);
  const jersey = p.jersey_number != null && p.jersey_number !== "" ? String(Number(p.jersey_number)) : "—";
  const rating = Number.isFinite(Number(p.rating)) ? Number(p.rating) : 5;
  const mvp = Number(p.mvp_count) || 0;
  const goals = Number(p.total_goals) || 0;
  const assists = Number(p.total_assists) || 0;
  const birthDisplay = birthDateLabel(p.birth_date);

  const modal = document.getElementById("teamPlayerModal");
  const img = document.getElementById("teamPlayerModalImg");
  const info = document.getElementById("teamPlayerModalInfo");
  if(!modal || !img || !info) return;

  document.getElementById("teamPlayerModalName").textContent = display;
  const canonEl = document.getElementById("teamPlayerModalCanon");
  if(canonEl){
    canonEl.textContent = p.display_name && p.display_name !== p.name ? `@${p.name}` : "";
  }

  img.src = portrait;
  img.alt = display;
  img.onerror = () => { img.src = defaultAvatar(p.name); };

  const rows = [
    teamPlayerInfoRow("Số áo", jersey),
    teamPlayerInfoRow("Vị trí", p.main),
    birthDisplay ? teamPlayerInfoRow("Ngày sinh", birthDisplay) : "",
    teamPlayerInfoRow("Rating", rating),
    mvp > 0 ? teamPlayerInfoRow("MVP", mvp) : "",
    goals > 0 ? teamPlayerInfoRow("Bàn thắng", goals) : "",
    assists > 0 ? teamPlayerInfoRow("Kiến tạo", assists) : ""
  ].filter(Boolean).join("");

  info.innerHTML = rows || `<div class="meta">Chưa có thông tin thêm.</div>`;

  const descEl = document.getElementById("teamPlayerModalDesc");
  if(descEl) descEl.textContent = generatePlayerDescription(p);

  modal.classList.add("show");
  syncModalOpenState();
}

function closeTeamPlayerModal(){
  document.getElementById("teamPlayerModal")?.classList.remove("show");
  syncModalOpenState();
}
