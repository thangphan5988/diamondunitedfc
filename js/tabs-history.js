/* Tab switching, match history list */

function formatHistoryScore(value){
  if(value == null || String(value).trim() === "") return "?";
  const s = String(value).trim().replace(",", ".");
  if(/^\d+$/.test(s)) return String(parseInt(s, 10));
  const f = Number(s);
  if(!Number.isFinite(f) || f < 0) return "?";
  return String(Math.floor(f));
}

function switchTab(tab){
  const isLatest = tab === "latest";
  const isLineup = tab === "lineup";
  const isHistory = tab === "history";
  const isStats = tab === "stats";
  const isAdmin = tab === "admin";

  if(isLineup && !canUseLineupTab()){
    tab = "latest";
  }
  if(isAdmin && !(isLoggedIn() && hasPerm(PERMS.MANAGE_USERS))){
    tab = "latest";
  }

  document.getElementById("latestResultView").style.display = tab === "latest" ? "" : "none";
  document.getElementById("lineupView").style.display = tab === "lineup" ? "" : "none";
  document.getElementById("historyView").style.display = tab === "history" ? "" : "none";
  document.getElementById("statsView").style.display = tab === "stats" ? "" : "none";
  document.getElementById("adminView").style.display = tab === "admin" ? "" : "none";

  document.getElementById("tabLatest").classList.toggle("active", tab === "latest");
  document.getElementById("tabLineup").classList.toggle("active", tab === "lineup");
  document.getElementById("tabHistory").classList.toggle("active", tab === "history");
  document.getElementById("tabStats").classList.toggle("active", tab === "stats");
  document.getElementById("tabAdmin").classList.toggle("active", tab === "admin");

  if(tab === "latest") loadLatestMatch();
  else stopLatestMatchPolling();
  if(tab === "history") loadMatchHistory();
  if(tab === "stats"){
    switchStatsTab(currentStatsTab);
    renderStats();
  }
  if(tab === "admin") loadAdminUsers();
  if(tab === "lineup" && shouldRestorePending()) restorePendingMatchIfAny();
  if(shouldPollPendingMatch()) startConfirmPolling();
  else stopConfirmPolling();
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
    const deleteBtn = hasPerm(PERMS.DELETE_MATCH)
      ? `<button type="button" class="danger historyDeleteBtn" onclick="deleteHistoryMatch(${idx}, event)">🗑 Xóa</button>`
      : "";
    return `<div class="historyItem" onclick="toggleHistoryDetail(${idx})">
      <div class="historyItemHead">
        <h3>${escapeHtml(displayMatchLabel(m))}${typeTag} · ${score}</h3>
        ${deleteBtn}
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
    await loadMatchHistory();
    if(document.getElementById("tabLatest").classList.contains("active")) loadLatestMatch();
    if(document.getElementById("tabStats").classList.contains("active")) renderStats();
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
