/* Result modal, save match scores */

let editResultState = null;

function isEditingCompletedResult(){
  return !!editResultState?.match_id;
}

function clearEditResultState(){
  editResultState = null;
  const titleEl = document.getElementById("resultModalTitle");
  if(titleEl) titleEl.textContent = "Kết quả trận";
}

function buildFormPlayersFromResult(lastResultObj, cap){
  const savedLast = lastResult;
  const savedMode = lineupMode;
  lastResult = lastResultObj;
  lineupMode = cap ? "cap" : "internal";
  const list = getAllMatchPlayers();
  lastResult = savedLast;
  lineupMode = savedMode;
  return list;
}

function getResultFormPlayers(){
  if(editResultState?.formPlayers?.length) return editResultState.formPlayers;
  return getAllMatchPlayers();
}

function getRatingBeforeForResultForm(player){
  if(editResultState?.ratingBeforeMap?.[player.name] != null){
    return Number(editResultState.ratingBeforeMap[player.name]) || 5;
  }
  return Number(player.rating) || 5;
}

function canEditMatchVideos(){
  if(isEditingCompletedResult()) return true;
  if(canFinalizeMatch()) return true;
  if(isCapHlvResultOnly()) return true;
  if(canResultTeamA() || canResultTeamB()) return true;
  return false;
}

function getGoalVideoMap(){
  if(isEditingCompletedResult()) return editResultState.playerGoalVideoUrls;
  return playerGoalVideoUrls;
}

function getHighlightVideoValue(){
  if(isEditingCompletedResult()){
    return normalizeVideoUrlInput(editResultState?.highlightVideoUrl);
  }
  const el = document.getElementById("highlightVideoUrl");
  const fromDom = el ? normalizeVideoUrlInput(el.value) : "";
  return fromDom || normalizeVideoUrlInput(highlightVideoUrl);
}

function bindHighlightVideoInput(){
  const el = document.getElementById("highlightVideoUrl");
  if(!el || el.dataset.bound) return;
  el.dataset.bound = "1";
  el.addEventListener("input", () => {
    const val = normalizeVideoUrlInput(el.value);
    if(isEditingCompletedResult()) editResultState.highlightVideoUrl = val;
    else highlightVideoUrl = val;
    persistPendingMatchStats();
  });
}

function ensureGoalVideoSlotCount(name, count){
  const map = getGoalVideoMap();
  const n = Math.max(0, Math.round(Number(count) || 0));
  if(!Array.isArray(map[name])){
    const legacy = map[name];
    map[name] = legacy ? parseGoalVideoUrlsInput(legacy) : [];
  }
  while(map[name].length < n) map[name].push("");
  if(map[name].length > n) map[name].length = n;
}

function setPlayerGoalVideo(name, index, value){
  const goalMap = isEditingCompletedResult() ? editResultState.playerMatchGoals : playerMatchGoals;
  const goalCount = clampMatchStat(goalMap[name] ?? 0);
  ensureGoalVideoSlotCount(name, Math.max(goalCount, Number(index) + 1));
  getGoalVideoMap()[name][index] = normalizeVideoUrlInput(value);
  if(!isEditingCompletedResult()) persistPendingMatchStats();
}

function goalVideoUrlsForPayload(name, goalCount){
  return normalizeGoalVideoUrlsForSave(getGoalVideoMap()[name], goalCount);
}

function resultPlayerVideoInputHtml(p, goals, encodedName){
  if(!canEditMatchVideos()) return "";
  const map = getGoalVideoMap();
  const goalCount = Math.max(0, Math.round(Number(goals) || 0));
  ensureGoalVideoSlotCount(p.name, goalCount);
  const urls = map[p.name] || [];
  const filledCount = urls.filter(Boolean).length;
  const slotCount = Math.max(goalCount, filledCount);
  const show = slotCount > 0 || canFinalizeMatch() || isEditingCompletedResult();
  if(!show) return "";
  return Array.from({length: slotCount}, (_, i) => {
    const url = escapeAttr(urls[i] || "");
    return `<input class="resultVideoInput" type="url" value="${url}" placeholder="📹 Bàn ${i + 1} (YouTube/Zalo...)"
      oninput="setPlayerGoalVideo(decodeURIComponent('${encodedName}'), ${i}, this.value)">`;
  }).join("");
}

async function openEditResultModal(historyIdx, ev){
  if(ev) ev.stopPropagation();
  clearError();
  if(!isLoggedIn() || !canFinalizeMatch()){
    showError("Chỉ Host mới được sửa kết quả trận đã hoàn tất.");
    return;
  }

  const match = cachedHistoryMatches[historyIdx];
  if(!match?.match_id) return;

  try{
    const data = await apiGet("get_match_detail", {match_id: match.match_id});
    if(!data.summary || !data.players?.length){
      showError("Không có dữ liệu trận để sửa.");
      return;
    }

    const summary = data.summary;
    const cap = isCapMatchFromDetail(summary, data.players);
    const rebuilt = rebuildLastResultFromDetail(data.players, summary);

    editResultState = {
      match_id: summary.match_id,
      summary,
      cap,
      formPlayers: buildFormPlayersFromResult(rebuilt, cap),
      ratingBeforeMap: {},
      playerMatchScores: {},
      playerMatchGoals: {},
      playerMatchAssists: {},
      playerGoalVideoUrls: {},
      highlightVideoUrl: summary.highlight_video_url || "",
      pendingTeamAScore: formatIntScoreDisplay(summary.team_a_score),
      pendingTeamBScore: formatIntScoreDisplay(summary.team_b_score),
      opponentTeamName: summary.opponent_name || "",
      formationA: normalizeFormationValue(summary.formation_a, formationA),
      formationB: normalizeFormationValue(summary.formation_b, formationB)
    };

    data.players.forEach(hp => {
      const name = hp.player_name;
      if(!name) return;
      editResultState.ratingBeforeMap[name] = Number(hp.rating_before ?? hp.rating) || 5;
      if(hp.match_score != null && hp.match_score !== ""){
        editResultState.playerMatchScores[name] = Number(hp.match_score);
      }
      editResultState.playerMatchGoals[name] = Number(hp.goals) || 0;
      editResultState.playerMatchAssists[name] = Number(hp.assists) || 0;
      editResultState.playerGoalVideoUrls[name] = parseGoalVideoUrlsInput(hp.goal_video_urls || hp.goal_video_url);
    });

    editResultState.formPlayers.forEach(p => {
      if(editResultState.playerMatchScores[p.name] == null){
        editResultState.playerMatchScores[p.name] = 7;
      }
    });

    const titleEl = document.getElementById("resultModalTitle");
    if(titleEl) titleEl.textContent = "Sửa kết quả trận";

    renderResultForm();
    document.getElementById("resultModal").classList.add("show");
    syncModalOpenState();
    updateResultModalPerms();
  }catch(e){
    console.error(e);
    showError(e.message || "Không mở được form sửa kết quả.");
  }
}

function isResultModalOpen(){
  return document.getElementById("resultModal")?.classList.contains("show");
}

function shouldPreserveLocalMatchResult(){
  if(isEditingCompletedResult()) return true;
  if(isResultModalOpen()) return true;
  if(isCapHlvView() && isMatchReadyForResults() && canResultCap()) return true;
  return false;
}

function syncGoalVideoUrlsFromDom(){
  const map = getGoalVideoMap();
  document.querySelectorAll("#resultTeams .resultPlayerBlock").forEach(block => {
    const nameEl = block.querySelector(".resultPlayer .name");
    if(!nameEl) return;
    const name = nameEl.textContent.trim();
    const inputs = block.querySelectorAll(".resultVideoInput");
    if(!inputs.length) return;
    map[name] = Array.from(inputs, input => normalizeVideoUrlInput(input.value));
  });
}

function syncResultFormDraftFromDom(){
  syncPendingScoresFromInputs();
  const opponentEl = document.getElementById("opponentTeamName");
  const opponentVal = opponentEl ? String(opponentEl.value || "").trim() : "";
  if(isEditingCompletedResult()){
    editResultState.opponentTeamName = opponentVal;
    editResultState.highlightVideoUrl = normalizeVideoUrlInput(document.getElementById("highlightVideoUrl")?.value);
  }else if(opponentEl){
    opponentTeamName = opponentVal;
    highlightVideoUrl = normalizeVideoUrlInput(document.getElementById("highlightVideoUrl")?.value);
  }

  const scoreMap = isEditingCompletedResult() ? editResultState.playerMatchScores : playerMatchScores;
  const goalMap = isEditingCompletedResult() ? editResultState.playerMatchGoals : playerMatchGoals;
  const assistMap = isEditingCompletedResult() ? editResultState.playerMatchAssists : playerMatchAssists;

  document.querySelectorAll("#resultTeams .resultPlayer").forEach(row => {
    if(row.classList.contains("resultPlayerHead")) return;
    const nameEl = row.querySelector(".name");
    if(!nameEl) return;
    const name = nameEl.textContent.trim();
    const sel = row.querySelector("select");
    if(sel && sel.value !== "") scoreMap[name] = Number(sel.value);
    const statInputs = row.querySelectorAll(".resultStatInput");
    if(statInputs[0]) goalMap[name] = clampMatchStat(statInputs[0].value);
    if(statInputs[1]) assistMap[name] = clampMatchStat(statInputs[1].value);
  });
  syncGoalVideoUrlsFromDom();
}

function bindResultFormInputs(){
  const opponentEl = document.getElementById("opponentTeamName");
  if(opponentEl && !opponentEl.dataset.bound){
    opponentEl.dataset.bound = "1";
    opponentEl.addEventListener("input", () => {
      opponentTeamName = String(opponentEl.value || "").trim();
      persistPendingMatchStats();
    });
  }
}

function refreshResultMvpTags(){
  const mvpNames = getMvpNamesFromScores();
  document.querySelectorAll("#resultTeams .resultPlayer").forEach(row => {
    if(row.classList.contains("resultPlayerHead")) return;
    const nameEl = row.querySelector(".name");
    const mvpTag = row.querySelector(".mvpTag");
    if(!nameEl || !mvpTag) return;
    const name = nameEl.textContent.trim();
    mvpTag.textContent = mvpNames.includes(name) ? "⭐ MVP" : "";
  });
}

async function openResultModal(){
  clearEditResultState();
  if(!isLoggedIn() || (!canEnterAnyResult() && !canFinalizeMatch())){
    showError("Bạn cần đăng nhập với quyền nhập kết quả.");
    return;
  }
  if(!matchLocked || !lastResult){
    showError("Chưa có trận nào đang chờ kết quả.");
    return;
  }
  if(!isMatchReadyForResults()){
    if(canFinalizeMatch()){
      showError("Bấm Chốt trận đấu trước khi nhập kết quả.");
    }else{
      showError(isCapMode()
        ? "Chờ HLV Cáp chốt đội hình trước khi nhập kết quả."
        : "Chờ 2 HLV chốt đội hình trước khi nhập kết quả.");
    }
    return;
  }
  stopConfirmPolling();
  loadPendingScoresFromStore();
  renderResultForm();
  document.getElementById("resultModal").classList.add("show");
  syncModalOpenState();
}

function readScoreInput(id){
  return parsePositiveIntScore(document.getElementById(id)?.value, null);
}

function resolveMatchScores(hostFinalize){
  const inputA = readScoreInput("teamAScore");
  const inputB = readScoreInput("teamBScore");
  const pendingA = parsePositiveIntScore(pendingTeamAScore, null);
  const pendingB = parsePositiveIntScore(pendingTeamBScore, null);

  if(canFinalizeMatch() || isCapMode()){
    return {
      teamAScore: inputA ?? pendingA,
      teamBScore: inputB ?? pendingB
    };
  }
  if(canResultTeamA() && !canResultTeamB()){
    return { teamAScore: inputA ?? pendingA, teamBScore: pendingB };
  }
  if(canResultTeamB() && !canResultTeamA()){
    return { teamAScore: pendingA, teamBScore: inputB ?? pendingB };
  }
  return {
    teamAScore: inputA ?? pendingA,
    teamBScore: inputB ?? pendingB
  };
}

function closeResultModal(){
  if(isEditingCompletedResult()){
    if(isCapMode()){
      opponentTeamName = editResultState.opponentTeamName || opponentTeamName;
    }
    clearEditResultState();
    document.getElementById("resultModal").classList.remove("show");
    syncModalOpenState();
    updateResultModalPerms();
    return;
  }
  if(isCapMode()){
    const opponentEl = document.getElementById("opponentTeamName");
    if(opponentEl) opponentTeamName = String(opponentEl.value || "").trim();
  }
  document.getElementById("resultModal").classList.remove("show");
  syncModalOpenState();
  persistPendingMatchStats();
  persistPendingScores();
  if(shouldPollPendingMatch()) startConfirmPolling();
}

async function cancelPendingMatch(){
  clearError();
  if(!isLoggedIn() || !hasPerm(PERMS.CANCEL_MATCH)){
    showError("Bạn cần quyền hủy trận.");
    return;
  }
  if(!matchLocked || !currentMatchId){
    showError("Không có trận đang chờ để hủy.");
    return;
  }

  const label = displayMatchLabel();
  const confirmed = confirm(
    `⚠️ Hủy trận "${label}"?\n\n` +
    "Toàn bộ dữ liệu đội hình và kết quả đang nhập của trận này sẽ bị XÓA trên Google Sheet.\n\n" +
    "Thao tác này không thể hoàn tác. Bạn có chắc chắn?"
  );
  if(!confirmed) return;

  const btn = document.getElementById("btnCancelMatch");
  btn.disabled = true;
  btn.textContent = "Đang hủy...";

  try{
    await apiPost("cancel_match", { match_id: currentMatchId });
    closeResultModal();
    unlockMatchState();
    document.getElementById("ocrStatus").innerHTML =
      `Đã hủy trận <b>${escapeHtml(label)}</b>. Có thể chia đội / lên đội hình mới.`;
    showToast(`✓ Đã hủy trận ${label}`, "success");
  }catch(e){
    console.error(e);
    showError(e.message || "Không hủy được trận.");
  }finally{
    btn.disabled = false;
    btn.textContent = "Hủy Trận";
  }
}

function renderResultForm(){
  if(isResultModalOpen()) syncResultFormDraftFromDom();
  else if(!isEditingCompletedResult()) syncPendingScoresFromInputs();

  const cap = isEditingCompletedResult() ? !!editResultState.cap : isCapMode();
  const scoreMap = isEditingCompletedResult() ? editResultState.playerMatchScores : playerMatchScores;
  const goalMap = isEditingCompletedResult() ? editResultState.playerMatchGoals : playerMatchGoals;
  const assistMap = isEditingCompletedResult() ? editResultState.playerMatchAssists : playerMatchAssists;
  const editScores = isEditingCompletedResult()
    ? { a: editResultState.pendingTeamAScore, b: editResultState.pendingTeamBScore }
    : null;

  document.getElementById("opponentFieldWrap").style.display = cap ? "" : "none";
  document.getElementById("opponentTeamName").value = isEditingCompletedResult()
    ? (editResultState.opponentTeamName || "")
    : (opponentTeamName || "");
  bindResultFormInputs();

  const scoreA = document.getElementById("teamAScore");
  const scoreB = document.getElementById("teamBScore");
  if(scoreA) scoreA.value = formatIntScoreDisplay(editScores ? editScores.a : pendingTeamAScore);
  if(scoreB) scoreB.value = formatIntScoreDisplay(editScores ? editScores.b : pendingTeamBScore);
  applyResultScoreFieldPerms();
  updateHlvResultStatusUI();

  const matchLabel = isEditingCompletedResult()
    ? displayMatchLabel(editResultState.summary)
    : displayMatchLabel();
  const formFormationA = isEditingCompletedResult() ? editResultState.formationA : (cap ? formationCapMain : formationA);
  const formFormationB = isEditingCompletedResult() ? editResultState.formationB : (cap ? formationCapSub : formationB);

  if(cap){
    document.getElementById("scoreLabelA").textContent = "⚽ DUFC";
    document.getElementById("scoreLabelA").style.color = "#38bdf8";
    document.getElementById("scoreLabelB").textContent = "Đội bạn";
    document.getElementById("scoreLabelB").style.color = "#94a3b8";
    document.getElementById("resultSummary").textContent =
      `Trận ${matchLabel} · ${formFormationA} / ${formFormationB}`;
  }else{
    document.getElementById("scoreLabelA").textContent = "🔴 Đội A";
    document.getElementById("scoreLabelA").style.color = "#ef4444";
    document.getElementById("scoreLabelB").textContent = "🟡 Đội B";
    document.getElementById("scoreLabelB").style.color = "#facc15";
    document.getElementById("resultSummary").textContent =
      `Trận ${matchLabel} · ${formFormationA} vs ${formFormationB}`;
  }

  const opponentEl = document.getElementById("opponentTeamName");
  if(opponentEl && !isEditingCompletedResult()){
    opponentEl.disabled = !!(isCapHlvResultOnly() && capHlvResultConfirmed());
  }else if(opponentEl){
    opponentEl.disabled = false;
  }

  const videoWrap = document.getElementById("highlightVideoWrap");
  if(videoWrap){
    videoWrap.style.display = canEditMatchVideos() ? "" : "none";
    const highlightEl = document.getElementById("highlightVideoUrl");
    if(highlightEl && canEditMatchVideos()){
      highlightEl.value = getHighlightVideoValue();
      bindHighlightVideoInput();
    }
  }

  if(isEditingCompletedResult()){
    document.getElementById("resultHint").innerHTML =
      `<b>Sửa kết quả trận đã hoàn tất.</b> Rating và MVP sẽ được tính lại từ đầu cho trận này.<br>
       <b>Rating</b>: điểm 8–10 <b>+1</b> · 6–7 giữ nguyên · 1–5 <b>-1</b>.<br>
       <b>MVP</b>: mỗi đội (hoặc DUFC với trận Cáp) 1 người điểm cao nhất → +1 MVP.` +
      (cap ? `<br><b>⚽ BT / 🅰️ KT / 📹 Video</b>: bàn thắng, kiến tạo và link video từng bàn.` : `<br><b>⚽ BT / 🅰️ KT / 📹 Video</b>: ghi nhận theo trận · BT/KT không tính bảng Top.`);
  }else if(cap){
    document.getElementById("resultHint").innerHTML =
      `<b>Rating</b>: điểm trận 8–10 <b>+1</b> · 6–7 giữ nguyên · 1–5 <b>-1</b> rating.<br>
       <b>MVP</b>: 1 người điểm cao nhất trong đội DUFC → cộng <b>1 lần MVP</b>.<br>
       <b>⚽ BT / 🅰️ KT / 📹 Video</b>: bàn thắng, kiến tạo và link video từng bàn.` +
      (canFinalizeMatch()
        ? (capHlvResultConfirmed()
          ? `<br><b>Host</b>: chỉnh tỉ số/tên đội/BT/KT · <b>không sửa điểm cầu thủ</b> đã chốt HLV Cáp → <b>Xác nhận trận đấu</b>.`
          : `<br><b>Host</b>: nhập tỉ số, tên đội & chấm điểm → <b>Xác nhận trận đấu</b> (không cần chờ HLV Cáp).`)
        : (isCapHlvResultOnly()
          ? `<br><b>HLV Cáp</b>: nhập tỉ số & chấm điểm → <b>Xác nhận HLV Cáp</b>.`
          : ""));
  }else{
    document.getElementById("resultHint").innerHTML =
      `<b>Rating</b> (chia đội cân bằng): điểm trận 8–10 <b>+1</b> · 6–7 giữ nguyên · 1–5 <b>-1</b> rating.<br>
       <b>MVP</b> (thống kê cuối năm): mỗi đội 1 người điểm cao nhất → cộng <b>1 lần MVP</b>, không ảnh hưởng rating.<br>
       <b>⚽ BT / 🅰️ KT</b>: ghi nhận theo trận · <span class="meta">BT/KT không tính bảng Top (chỉ trận Cáp)</span>.<br>
       <b>📹 Video</b>: link từng bàn thắng + video trận (tùy chọn).` +
      (canFinalizeMatch()
        ? `<br><b>Host</b>: nhập tỉ số & chấm điểm toàn trận → <b>Xác nhận trận đấu</b> (không cần chờ HLV). Điểm đội đã xác nhận HLV không sửa được.`
        : (canResultTeamA() && !canResultTeamB()
          ? `<br><b>HLV Đội A</b>: nhập bàn thắng Đội A + chấm điểm cầu thủ → <b>Xác nhận Đội A</b>.`
          : (canResultTeamB() && !canResultTeamA()
            ? `<br><b>HLV Đội B</b>: nhập bàn thắng Đội B + chấm điểm cầu thủ → <b>Xác nhận Đội B</b>.`
            : "")));
  }

  const mvpNames = getMvpNamesFromScores(scoreMap);
  const teams = cap
    ? [{key: "CAP", title: "⚽ DUFC", color: "#38bdf8"}]
    : [
        {key: "A", title: "🔴 Đội A (Áo Đỏ)", color: "#ef4444"},
        {key: "B", title: "🟡 Đội B (Áo Vàng)", color: "#facc15"}
      ].filter(team => {
        if(isEditingCompletedResult() || canFinalizeMatch()) return true;
        if(team.key === "A") return canResultTeamA();
        if(team.key === "B") return canResultTeamB();
        return false;
      });

  const showStats = true;

  document.getElementById("resultTeams").innerHTML = teams.map(team => {
    const list = getResultFormPlayers().filter(p => p.team === team.key);
    const header = showStats
      ? `<div class="resultPlayer resultPlayerHead">
          <span></span><span>Cầu thủ</span>
          <span class="resultColHead">Điểm</span>
          <span class="resultColHead">⚽ BT</span>
          <span class="resultColHead">🅰️ KT</span>
          <span></span>
        </div>`
      : `<div class="resultPlayer resultPlayerHead noStats">
          <span></span><span>Cầu thủ</span>
          <span class="resultColHead">Điểm</span>
          <span></span>
        </div>`;
    const rows = list.map(p => {
      const score = Number(scoreMap[p.name] ?? 7);
      const goals = Number(goalMap[p.name] ?? 0);
      const assists = Number(assistMap[p.name] ?? 0);
      const ratingBefore = getRatingBeforeForResultForm(p);
      const isMvp = mvpNames.includes(p.name);
      const mvpTotal = Number(p.mvp_count) || 0;
      const encodedName = encodeURIComponent(p.name);
      const roleMeta = cap
        ? `${p.capLabel || (p.starter ? "Ra sân" : "Dự bị")}`
        : (p.starter ? p.assigned : "Dự bị");
      const ratingLocked = !isEditingCompletedResult() && isPlayerScoreLocked(p.team);
      const statLocked = !isEditingCompletedResult() && isPlayerStatInputLocked(p.team);
      const statInputs = showStats
        ? `<input class="resultStatInput" type="number" min="0" max="30" value="${goals}" ${statLocked ? "disabled" : ""}
            onchange="setPlayerMatchGoals(decodeURIComponent('${encodedName}'), this.value)">
          <input class="resultStatInput" type="number" min="0" max="30" value="${assists}" ${statLocked ? "disabled" : ""}
            onchange="setPlayerMatchAssists(decodeURIComponent('${encodedName}'), this.value)">`
        : "";
      const lockNote = ratingLocked && (canFinalizeMatch() || isCapHlvResultOnly()) ? " · đã chốt HLV" : "";
      const videoInput = canEditMatchVideos() ? resultPlayerVideoInputHtml(p, goals, encodedName) : "";
      const videoRow = videoInput ? `<div class="resultPlayerVideo">${videoInput}</div>` : "";
      return `<div class="resultPlayerBlock">${`<div class="resultPlayer${showStats ? "" : " noStats"}${ratingLocked ? " resultLocked" : ""}">
        <img src="${escapeAttr(avatarSrc(p.avatar, p.name))}" onerror="this.src='${defaultAvatar(p.name)}'">
        <div>
          <div class="name">${escapeHtml(playerDisplayName(p))}</div>
          <div class="meta">${roleMeta} · rating ${ratingBefore}${mvpTotal ? ` · 🏆 ${mvpTotal} MVP` : ""}${lockNote}</div>
        </div>
        <select ${ratingLocked ? "disabled" : ""} onchange="setPlayerMatchScore(decodeURIComponent('${encodedName}'), this.value)">
          ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}" ${n===score?"selected":""}>${n}</option>`).join("")}
        </select>
        ${statInputs}
        <div class="mvpTag">${isMvp ? `⭐ MVP` : ""}</div>
      </div>`}${videoRow}</div>`;
    }).join("");

    return `<div class="resultTeam"><h3 style="color:${team.color}">${team.title}</h3>${header}${rows}</div>`;
  }).join("");
  bindResultFormInputs();
}

function clampMatchStat(value){
  const n = Math.round(Number(value));
  if(!Number.isFinite(n) || n < 0) return 0;
  return Math.min(30, n);
}

function persistPendingMatchStats(){
  const saved = JSON.parse(localStorage.getItem(PENDING_MATCH_KEY) || "{}");
  if(!saved.matchId && currentMatchId) saved.matchId = currentMatchId;
  if(!saved.matchId) return;
  saved.playerMatchScores = playerMatchScores;
  saved.playerMatchGoals = playerMatchGoals;
  saved.playerMatchAssists = playerMatchAssists;
  saved.playerGoalVideoUrls = playerGoalVideoUrls;
  saved.highlightVideoUrl = highlightVideoUrl;
  saved.opponentTeamName = opponentTeamName;
  localStorage.setItem(PENDING_MATCH_KEY, JSON.stringify(saved));
}

function collectInvalidVideoUrls(){
  const invalid = [];
  const highlight = getHighlightVideoValue();
  if(highlight && !isLikelyVideoUrl(highlight)) invalid.push("Link video trận");
  const map = isEditingCompletedResult() ? editResultState.playerGoalVideoUrls : playerGoalVideoUrls;
  Object.entries(map || {}).forEach(([name, urls]) => {
    parseGoalVideoUrlsInput(urls).forEach((val, i) => {
      if(val && !isLikelyVideoUrl(val)){
        const label = playerDisplayName({name, display_name: name});
        invalid.push(filledCountLabel(label, i + 1));
      }
    });
  });
  return invalid;
}

function filledCountLabel(name, goalNo){
  return goalNo > 1 ? `${name} · bàn ${goalNo}` : name;
}

function setPlayerMatchScore(name, value){
  syncResultFormDraftFromDom();
  const player = getResultFormPlayers().find(p => p.name === name);
  if(player && !isEditingCompletedResult() && isPlayerScoreLocked(player.team)) return;
  const scoreMap = isEditingCompletedResult() ? editResultState.playerMatchScores : playerMatchScores;
  scoreMap[name] = Number(value);
  if(!isEditingCompletedResult()) persistPendingMatchStats();
  refreshResultMvpTags();
}

function setPlayerMatchGoals(name, value){
  const player = getResultFormPlayers().find(p => p.name === name);
  if(player && !isEditingCompletedResult() && isPlayerStatInputLocked(player.team)) return;
  const goalMap = isEditingCompletedResult() ? editResultState.playerMatchGoals : playerMatchGoals;
  goalMap[name] = clampMatchStat(value);
  if(!isEditingCompletedResult()){
    persistPendingMatchStats();
    persistPendingScores();
  }
  if(canEditMatchVideos()) renderResultForm();
  else refreshResultMvpTags();
}

function setPlayerMatchAssists(name, value){
  const player = getResultFormPlayers().find(p => p.name === name);
  if(player && !isEditingCompletedResult() && isPlayerStatInputLocked(player.team)) return;
  const assistMap = isEditingCompletedResult() ? editResultState.playerMatchAssists : playerMatchAssists;
  assistMap[name] = clampMatchStat(value);
  if(!isEditingCompletedResult()){
    persistPendingMatchStats();
    persistPendingScores();
  }
}

function pickTeamMvp_(teamPlayers, scoreMap){
  if(!teamPlayers.length) return null;
  let maxScore = -1;
  teamPlayers.forEach(p => {
    const s = Number(scoreMap[p.name] ?? 7);
    if(s > maxScore) maxScore = s;
  });
  const tied = teamPlayers.filter(p => Number(scoreMap[p.name] ?? 7) === maxScore);
  tied.sort((a, b) => {
    if(!!a.starter !== !!b.starter) return a.starter ? -1 : 1;
    return a.name.localeCompare(b.name, "vi");
  });
  return tied[0] ? tied[0].name : null;
}

function getMvpNamesFromScores(scoreMapOverride){
  const scoreMap = scoreMapOverride || (isEditingCompletedResult() ? editResultState.playerMatchScores : playerMatchScores);
  const cap = isEditingCompletedResult() ? !!editResultState.cap : isCapMode();
  const formPlayers = getResultFormPlayers();
  if(cap){
    const winner = pickTeamMvp_(formPlayers, scoreMap);
    return winner ? [winner] : [];
  }
  const mvps = [];
  ["A", "B"].forEach(team => {
    const winner = pickTeamMvp_(formPlayers.filter(p => p.team === team), scoreMap);
    if(winner) mvps.push(winner);
  });
  return mvps;
}

async function saveMatchResult(){
  clearError();
  syncResultFormDraftFromDom();

  if(isEditingCompletedResult()){
    if(!isLoggedIn() || !canFinalizeMatch()){
      showError("Chỉ Host mới được sửa kết quả trận đã hoàn tất.");
      return;
    }

    const cap = !!editResultState.cap;
    const teamAScore = readScoreInput("teamAScore");
    const teamBScore = readScoreInput("teamBScore");
    if(teamAScore === null || teamBScore === null){
      showError(cap ? "Vui lòng nhập tỷ số DUFC và đội bạn (số nguyên ≥ 0)." : "Vui lòng nhập tỷ số 2 đội (số nguyên ≥ 0).");
      return;
    }

    let opponent = editResultState.opponentTeamName || "";
    if(cap){
      opponent = String(document.getElementById("opponentTeamName").value || "").trim();
      if(!opponent){
        showError("Vui lòng nhập tên đội bạn.");
        return;
      }
    }

    const scoreMap = editResultState.playerMatchScores;
    const goalMap = editResultState.playerMatchGoals;
    const assistMap = editResultState.playerMatchAssists;
    const invalidVideos = collectInvalidVideoUrls();
    if(invalidVideos.length){
      showError("Link video không hợp lệ: " + invalidVideos.join(", "));
      return;
    }
    const mvpNames = getMvpNamesFromScores(scoreMap);
    const payloadPlayers = getResultFormPlayers().map(p => ({
      player_name: p.name,
      team: p.team,
      starter: !!p.starter,
      match_score: Number(scoreMap[p.name] ?? 7),
      goals: clampMatchStat(goalMap[p.name] ?? 0),
      assists: clampMatchStat(assistMap[p.name] ?? 0),
      goal_video_urls: goalVideoUrlsForPayload(p.name, goalMap[p.name] ?? 0),
      is_mvp: mvpNames.includes(p.name)
    }));

    const label = displayMatchLabel(editResultState.summary);
    if(!confirm(`Lưu thay đổi kết quả trận "${label}"?\nRating và MVP sẽ được tính lại.`)){
      return;
    }

    const btn = document.getElementById("btnSaveResult");
    btn.disabled = true;
    btn.textContent = "Đang lưu...";

    try{
      const data = await apiPost("edit_match_result", {
        match_id: editResultState.match_id,
        match_type: cap ? "cap" : "internal",
        opponent_name: cap ? opponent : "",
        highlight_video_url: getHighlightVideoValue(),
        team_a_score: teamAScore,
        team_b_score: teamBScore,
        players: payloadPlayers
      });

      closeResultModal();
      await loadDefaultRoster();
      await loadMatchHistory();
      if(document.getElementById("tabLatest").classList.contains("active")) loadLatestMatch();
      if(document.getElementById("tabStats").classList.contains("active")) renderStats();
      showToast(`✓ Đã cập nhật kết quả trận ${data.match_label || label}`, "success", 4000);
    }catch(e){
      console.error(e);
      showError(e.message || "Không lưu được thay đổi kết quả.");
    }finally{
      updateResultModalPerms();
    }
    return;
  }

  if(!isLoggedIn() || !canEnterAnyResult()){
    showError("Bạn cần quyền nhập kết quả.");
    return;
  }
  if(!matchLocked || !currentMatchId || !lastResult){
    showError("Không có trận đang chờ kết quả.");
    return;
  }

  const cap = isCapMode();
  const capHostFinalize = cap && canFinalizeMatch();
  const capHlvPartial = cap && isCapHlvResultOnly();
  const hostFinalizeInternal = canFinalizeMatch() && !cap;
  const hostFinalize = hostFinalizeInternal || capHostFinalize;
  const internalHlvPartial = !cap && !hostFinalize && (canResultTeamA() || canResultTeamB());
  persistPendingScores();

  if(capHlvPartial && capHlvResultConfirmed()){
    showError("Bạn đã xác nhận HLV Cáp — không thể chỉnh sửa.");
    return;
  }
  if(!hostFinalize && canResultTeamA() && !canResultTeamB() && teamResultSaved.A){
    showError("Bạn đã xác nhận Đội A — không thể chỉnh sửa.");
    return;
  }
  if(!hostFinalize && canResultTeamB() && !canResultTeamA() && teamResultSaved.B){
    showError("Bạn đã xác nhận Đội B — không thể chỉnh sửa.");
    return;
  }

  const { teamAScore, teamBScore } = resolveMatchScores(hostFinalize);

  if(canFinalizeMatch() || cap){
    if(teamAScore === null || teamBScore === null){
      showError(cap ? "Vui lòng nhập tỷ số DUFC và đội bạn (số nguyên ≥ 0)." : "Vui lòng nhập tỷ số 2 đội (số nguyên ≥ 0).");
      return;
    }
  }else if(canResultTeamA() && !canResultTeamB()){
    if(teamAScore === null){
      showError("Vui lòng nhập bàn thắng Đội A (số nguyên ≥ 0).");
      return;
    }
  }else if(canResultTeamB() && !canResultTeamA()){
    if(teamBScore === null){
      showError("Vui lòng nhập bàn thắng Đội B (số nguyên ≥ 0).");
      return;
    }
  }else if(teamAScore === null || teamBScore === null){
    showError("Vui lòng nhập tỷ số (số nguyên ≥ 0).");
    return;
  }

  if(cap){
    opponentTeamName = String(document.getElementById("opponentTeamName").value || "").trim();
    if(hostFinalize && !opponentTeamName){
      showError("Vui lòng nhập tên đội bạn.");
      return;
    }
  }

  const invalidVideos = collectInvalidVideoUrls();
  if(invalidVideos.length){
    showError("Link video không hợp lệ: " + invalidVideos.join(", "));
    return;
  }

  const allPlayers = getAllMatchPlayers();
  const mvpNames = getMvpNamesFromScores();
  const seenNames = new Set();
  const payloadPlayers = (hostFinalize || capHostFinalize || capHlvPartial ? allPlayers : allPlayers.filter(p => {
    if(seenNames.has(p.name)) return false;
    seenNames.add(p.name);
    if(canResultTeamA() && !canResultTeamB() && p.team !== "A") return false;
    if(canResultTeamB() && !canResultTeamA() && p.team !== "B") return false;
    return true;
  })).map(p => ({
    player_name: p.name,
    team: p.team,
    starter: !!p.starter,
    match_score: Number(playerMatchScores[p.name] ?? 7),
    goals: clampMatchStat(playerMatchGoals[p.name] ?? 0),
    assists: clampMatchStat(playerMatchAssists[p.name] ?? 0),
    goal_video_urls: goalVideoUrlsForPayload(p.name, playerMatchGoals[p.name] ?? 0),
    rating_before: Number(p.rating) || 5,
    mvp_count_before: Number(p.mvp_count) || 0,
    is_mvp: mvpNames.includes(p.name)
  }));

  const btn = document.getElementById("btnSaveResult");
  btn.disabled = true;
  btn.textContent = "Đang lưu...";

  try{
    const data = await apiPost("save_match_result", {
      match_id: currentMatchId,
      match_label: currentMatchLabel || displayMatchLabel(),
      match_type: cap ? "cap" : "internal",
      opponent_name: cap ? opponentTeamName : "",
      highlight_video_url: (hostFinalize || capHlvPartial || internalHlvPartial) ? getHighlightVideoValue() : "",
      formation_a: cap ? formationCapMain : formationA,
      formation_b: cap ? formationCapSub : formationB,
      team_a_score: teamAScore,
      team_b_score: teamBScore,
      finalize_match: hostFinalize,
      players: payloadPlayers
    });

    if(data.partial){
      teamResultSaved.A = !!data.team_a_result_saved;
      teamResultSaved.B = !!data.team_b_result_saved;
      if(teamAScore != null) pendingTeamAScore = String(teamAScore);
      if(teamBScore != null) pendingTeamBScore = String(teamBScore);
      if(data.team_a_score != null && data.team_a_score !== "") pendingTeamAScore = formatIntScoreDisplay(data.team_a_score);
      if(data.team_b_score != null && data.team_b_score !== "") pendingTeamBScore = formatIntScoreDisplay(data.team_b_score);
      persistTeamWorkflowState();
      persistPendingScores();
      updateHlvResultStatusUI();
      updateResultModalPerms();
      updateLockBannerContent();
      const waiting = (data.waiting_teams || []).join(", ");
      const teamLabel = capHlvPartial ? "HLV Cáp"
        : (canResultTeamA() && !canResultTeamB() ? "Đội A" : (canResultTeamB() && !canResultTeamA() ? "Đội B" : "một phần"));
      showToast(`✓ Đã xác nhận ${teamLabel}. Chờ: ${waiting || "đội còn lại"}`, "success", 4000);
      document.getElementById("ocrStatus").innerHTML =
        `Đã xác nhận KQ <b>${escapeHtml(teamLabel)}</b> trận <b>${data.match_label || displayMatchLabel()}</b>. Chờ: <b>${escapeHtml(waiting || "đội còn lại")}</b>.`;
      await refreshTeamConfirmFromServer();
      closeResultModal();
      return;
    }

    closeResultModal();
    unlockMatchState();
    await loadDefaultRoster();
    invalidateTeamsStats();

    document.getElementById("ocrStatus").innerHTML =
      `Đã kết thúc trận <b>${data.match_label || displayMatchLabel()}</b>. MVP: <b>${(data.mvp_players || []).join(", ") || "—"}</b>. Rating đã cập nhật.`;
    showToast("✓ Trận đã kết thúc — rating đã cập nhật", "success", 4200);
  }catch(e){
    console.error(e);
    const msg = e.message || "Không lưu được kết quả trận.";
    showError(msg.includes("Không tìm thấy trận")
      ? msg + " Hoặc bấm F12 → Application → Local Storage → xóa dufc_pending_match rồi xuất ảnh lại."
      : msg);
  }finally{
    updateResultModalPerms();
  }
}

function statRowHtml(p, rank, mode){
  let value;
  let badgeClass;
  let label;
  if(mode === "mvp"){
    value = Number(p.mvp_count) || 0;
    badgeClass = "statMvp";
    label = `🏆 ${value}`;
  }else if(mode === "rating"){
    value = Number.isFinite(Number(p.rating)) ? Number(p.rating) : 5;
    badgeClass = "statRating";
    label = String(value);
  }else if(mode === "goals"){
    value = Number(p.total_goals) || 0;
    badgeClass = "statGoals";
    label = `⚽ ${value}`;
  }else{
    value = Number(p.total_assists) || 0;
    badgeClass = "statAssists";
    label = `🅰️ ${value}`;
  }
  const inactiveNote = mode === "rating" && Number(p.inactivity_penalty) > 0
    ? ` · −${p.inactivity_penalty} vắng (${Number(p.days_inactive) || 0} ngày)`
    : "";
  return `<div class="statRow">
    <span class="statRank">#${rank}</span>
    <img src="${escapeAttr(avatarSrc(p.avatar, p.name))}" onerror="this.src='${defaultAvatar(p.name)}'">
    <div>
      <div class="name">${escapeHtml(playerDisplayName(p))}</div>
      <div class="meta">${p.main}${p.secondary.length ? "/" + p.secondary.join("/") : ""}${inactiveNote}</div>
    </div>
    <span class="statValue ${badgeClass}">${label}</span>
  </div>`;
}
