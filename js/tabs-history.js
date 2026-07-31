/* Tab switching, match history list */

const MAIN_TAB_ORDER = ["latest", "history", "stats", "teams", "lineup", "hlv_a", "hlv_b", "hlv_cap", "admin"];
const MAIN_TAB_IDS = {
  latest: "tabLatest",
  history: "tabHistory",
  stats: "tabStats",
  teams: "tabTeams",
  lineup: "tabLineup",
  hlv_a: "tabHlvA",
  hlv_b: "tabHlvB",
  hlv_cap: "tabHlvCap",
  admin: "tabAdmin"
};

function mainTabButton(key){
  return document.getElementById(MAIN_TAB_IDS[key] || "");
}

function closeMobileTabMenu(){
  const menu = document.getElementById("mainNavMobileMenu");
  const btn = document.getElementById("mainNavMobileBtn");
  if(menu) menu.hidden = true;
  if(btn) btn.setAttribute("aria-expanded", "false");
  document.removeEventListener("click", closeMobileTabMenuOnOutside, true);
}

function closeMobileTabMenuOnOutside(event){
  if(event.target.closest("#mainNavMobile")) return;
  closeMobileTabMenu();
}

function toggleMobileTabMenu(event){
  if(event?.stopPropagation) event.stopPropagation();
  const menu = document.getElementById("mainNavMobileMenu");
  const btn = document.getElementById("mainNavMobileBtn");
  if(!menu || !btn) return;
  const willOpen = menu.hidden;
  if(willOpen){
    rebuildMobileTabMenu(getActiveMainTab());
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    document.addEventListener("click", closeMobileTabMenuOnOutside, true);
  }else{
    closeMobileTabMenu();
  }
}

function pickMobileTab(tab){
  closeMobileTabMenu();
  if(typeof trackSiteInteraction === "function"){
    trackSiteInteraction("mobile_tab_menu", { tab });
  }
  switchTab(tab);
}

function getActiveMainTab(){
  for(const key of MAIN_TAB_ORDER){
    const btn = mainTabButton(key);
    if(btn?.classList.contains("active")) return key;
  }
  return "latest";
}

function rebuildMobileTabMenu(activeTab){
  const menu = document.getElementById("mainNavMobileMenu");
  if(!menu) return;
  const current = activeTab || getActiveMainTab();
  const parts = [];
  MAIN_TAB_ORDER.forEach(key => {
    const btn = mainTabButton(key);
    if(!btn || btn.style.display === "none") return;
    const label = btn.textContent.trim();
    const active = key === current ? " active" : "";
    parts.push(`<button type="button" class="mainNavMobileItem${active}" role="option" onclick="pickMobileTab('${key}')">${escapeHtml(label)}</button>`);
  });
  menu.innerHTML = parts.join("");
}

function syncMobileTabNav(activeTab){
  const tab = activeTab || getActiveMainTab();
  const btn = mainTabButton(tab);
  const menuBtn = document.getElementById("mainNavMobileBtn");
  if(menuBtn && btn){
    menuBtn.setAttribute("aria-label", `Menu — ${btn.textContent.trim()}`);
  }
  rebuildMobileTabMenu(tab);
  closeMobileTabMenu();
}

function formatHistoryScore(value){
  if(value == null || String(value).trim() === "") return "?";
  const s = String(value).trim().replace(",", ".");
  if(/^\d+$/.test(s)) return String(parseInt(s, 10));
  const f = Number(s);
  if(!Number.isFinite(f) || f < 0) return "?";
  return String(Math.floor(f));
}

function switchTab(tab){
  const hlvTabs = new Set(["hlv_a", "hlv_b", "hlv_cap"]);
  const isLineup = tab === "lineup";
  const isHlv = hlvTabs.has(tab);
  const isAdmin = tab === "admin";

  if(isLineup && !canUseSplitTab()){
    tab = preferredHlvTab();
  }
  if(tab === "hlv_a" && !canShowHlvATab()){
    tab = preferredHlvTab();
  }
  if(tab === "hlv_b" && !canShowHlvBTab()){
    tab = preferredHlvTab();
  }
  if(tab === "hlv_cap" && !canShowHlvCapTab()){
    tab = preferredHlvTab();
  }
  if(isAdmin && !(isLoggedIn() && canAccessAdminTab())){
    tab = "latest";
  }

  const showLineupView = tab === "lineup" || hlvTabs.has(tab);
  document.getElementById("latestResultView").style.display = tab === "latest" ? "" : "none";
  document.getElementById("lineupView").style.display = showLineupView ? "" : "none";
  document.getElementById("historyView").style.display = tab === "history" ? "" : "none";
  document.getElementById("statsView").style.display = tab === "stats" ? "" : "none";
  document.getElementById("teamsView").style.display = tab === "teams" ? "" : "none";
  document.getElementById("adminView").style.display = tab === "admin" ? "" : "none";

  document.getElementById("tabLatest").classList.toggle("active", tab === "latest");
  document.getElementById("tabLineup").classList.toggle("active", tab === "lineup");
  document.getElementById("tabHlvA")?.classList.toggle("active", tab === "hlv_a");
  document.getElementById("tabHlvB")?.classList.toggle("active", tab === "hlv_b");
  document.getElementById("tabHlvCap")?.classList.toggle("active", tab === "hlv_cap");
  document.getElementById("tabHistory").classList.toggle("active", tab === "history");
  document.getElementById("tabStats").classList.toggle("active", tab === "stats");
  document.getElementById("tabTeams").classList.toggle("active", tab === "teams");
  document.getElementById("tabAdmin").classList.toggle("active", tab === "admin");

  if(tab === "lineup") enterLineupWorkspace("split", true);
  if(tab === "hlv_a") enterLineupWorkspace("hlv_a", true);
  if(tab === "hlv_b") enterLineupWorkspace("hlv_b", true);
  if(tab === "hlv_cap") enterLineupWorkspace("hlv_cap", true);

  if(tab === "latest") loadLatestMatch();
  else stopLatestMatchPolling();
  if(tab === "history") loadMatchHistory();
  if(tab === "stats"){
    switchStatsTab(currentStatsTab);
    renderStats();
  }
  if(tab === "teams"){
    invalidateTeamsStats();
    renderTeams();
  }
  if(tab === "admin"){
    if(canManageUsers()) switchAdminSection("users");
    else if(canManageRoster()) switchAdminSection("roster");
    else if(canManageSponsors()) switchAdminSection("sponsors");
  }
  if(showLineupView && shouldRestorePending()) restorePendingMatchIfAny();
  if(shouldPollPendingMatch()) startConfirmPolling();
  else stopConfirmPolling();
  syncMobileTabNav(tab);
}

async function loadMatchHistory(){
  const el = document.getElementById("historyList");
  el.innerHTML = `<div class="meta">Đang tải lịch sử...</div>`;
  try{
    const data = await apiGet("get_match_list", {limit: 40});
    renderMatchHistoryList(data.matches || []);
  }catch(e){
    console.error(e);
    el.innerHTML = `<div class="error" style="display:block">${escapeHtml(e.message || "Không tải được lịch sử.")}</div>`;
  }
}

function renderMatchHistoryList(matches){
  const el = document.getElementById("historyList");
  cachedHistoryMatches = matches;
  if(!matches.length){
    el.innerHTML = `<div class="meta">Chưa có trận nào hoàn tất.</div>`;
    return;
  }

  el.innerHTML = matches.map((m, idx) => {
    const isCap = String(m.match_type || "").toLowerCase() === "cap";
    const scoreA = formatHistoryScore(m.team_a_score);
    const scoreB = formatHistoryScore(m.team_b_score);
    const score = isCap
      ? `DUFC ${scoreA} - ${scoreB} ${escapeHtml(String(m.opponent_name || "Đội bạn"))}`
      : `🔴 ${scoreA} - ${scoreB} 🟡`;
    const formationText = isCap
      ? escapeHtml(String(m.formation_a || ""))
      : `${escapeHtml(String(m.formation_a || ""))} vs ${escapeHtml(String(m.formation_b || ""))}`;
    const typeTag = isCap ? " · ⚽ Cáp" : "";
    const videoTag = normalizeVideoUrlInput(m.highlight_video_url)
      ? ` · <span class="historyVideoTag">🎬 Video</span>`
      : "";
    const deleteBtn = hasPerm(PERMS.DELETE_MATCH)
      ? `<button type="button" class="danger historyActionBtn" onclick="deleteHistoryMatch(${idx}, event)">🗑 Xóa</button>`
      : "";
    const editBtn = canFinalizeMatch()
      ? `<button type="button" class="secondary historyActionBtn" onclick="openEditResultModal(${idx}, event)">✏️ Sửa KQ</button>`
      : "";
    const actionBtns = (editBtn || deleteBtn)
      ? `<div class="historyItemActions">${editBtn}${deleteBtn}</div>`
      : "";
    return `<div class="historyItem" onclick="toggleHistoryDetail(${idx})">
      <div class="historyItemHead">
        <h3>${escapeHtml(displayMatchLabel(m))}${typeTag}${videoTag} · ${score}</h3>
        ${actionBtns}
      </div>
      <div class="historyMeta">
        MVP: <b>${escapeHtml(String(m.mvp_players || "—"))}</b> ·
        ${formationText}
      </div>
      <div id="histDetail_${idx}" class="historyDetail" onclick="event.stopPropagation()"></div>
    </div>`;
  }).join("");
}

async function deleteHistoryMatch(idx, ev){
  if(ev) ev.stopPropagation();
  if(!hasPerm(PERMS.DELETE_MATCH)){
    showError("Bạn không có quyền xóa trận.");
    return;
  }

  const match = cachedHistoryMatches[idx];
  if(!match?.match_id) return;

  const label = displayMatchLabel(match);
  if(!confirm(`Xóa trận "${label}" khỏi lịch sử?\nRating và MVP sẽ được tính lại. Hành động này không thể hoàn tác.`)){
    return;
  }

  try{
    await apiPost("delete_match", { match_id: match.match_id });
    await loadDefaultRoster();
    invalidateTeamsStats();
    await loadMatchHistory();
    if(document.getElementById("tabLatest").classList.contains("active")) loadLatestMatch();
    if(document.getElementById("tabStats").classList.contains("active")) renderStats();
    if(document.getElementById("tabTeams").classList.contains("active")) renderTeams();
  }catch(e){
    showError(e.message || "Không xóa được trận.");
  }
}

async function toggleHistoryDetail(idx){
  const matchId = cachedHistoryMatches[idx]?.match_id;
  const detailEl = document.getElementById("histDetail_" + idx);
  if(!detailEl || !matchId) return;

  if(detailEl.classList.contains("show")){
    detailEl.classList.remove("show");
    detailEl.innerHTML = "";
    return;
  }

  document.querySelectorAll(".historyDetail.show").forEach(el => {
    el.classList.remove("show");
    el.innerHTML = "";
  });

  detailEl.innerHTML = `<div class="meta">Đang tải chi tiết...</div>`;
  detailEl.classList.add("show");

  try{
    const data = await apiGet("get_match_detail", {match_id: matchId});
    if(!data.summary || !data.players?.length){
      detailEl.innerHTML = `<div class="meta">Không có dữ liệu chi tiết.</div>`;
      return;
    }
    renderMatchResultView(detailEl, data.summary, data.players, `hist${idx}`, {embed: true});
  }catch(e){
    detailEl.innerHTML = `<div class="error" style="display:block">${escapeHtml(e.message || "Không tải được chi tiết.")}</div>`;
  }
}
