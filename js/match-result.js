/* Result modal, save match scores */

function isResultModalOpen(){
  return document.getElementById("resultModal")?.classList.contains("show");
}

function shouldPreserveLocalMatchResult(){
  if(isResultModalOpen()) return true;
  if(isCapHlvView() && matchLocked && currentImageFilename && canResultCap()) return true;
  return false;
}

function syncResultFormDraftFromDom(){
  syncPendingScoresFromInputs();
  const opponentEl = document.getElementById("opponentTeamName");
  if(opponentEl) opponentTeamName = String(opponentEl.value || "").trim();

  document.querySelectorAll("#resultTeams .resultPlayer").forEach(row => {
    if(row.classList.contains("resultPlayerHead")) return;
    const nameEl = row.querySelector(".name");
    if(!nameEl) return;
    const name = nameEl.textContent.trim();
    const sel = row.querySelector("select");
    if(sel && sel.value !== "") playerMatchScores[name] = Number(sel.value);
    const statInputs = row.querySelectorAll(".resultStatInput");
    if(statInputs[0]) playerMatchGoals[name] = clampMatchStat(statInputs[0].value);
    if(statInputs[1]) playerMatchAssists[name] = clampMatchStat(statInputs[1].value);
  });
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
  if(!isLoggedIn() || !canEnterAnyResult()){
    showError("Bạn cần đăng nhập với quyền nhập kết quả.");
    return;
  }
  if(!matchLocked || !lastResult){
    showError("Chưa có trận nào đang chờ kết quả.");
    return;
  }
  if(!currentImageFilename){
    showError("Cần xuất hình đội hình trước khi nhập kết quả.");
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
  else syncPendingScoresFromInputs();

  const cap = isCapMode();
  document.getElementById("opponentFieldWrap").style.display = cap ? "" : "none";
  document.getElementById("opponentTeamName").value = opponentTeamName || "";
  bindResultFormInputs();

  const scoreA = document.getElementById("teamAScore");
  const scoreB = document.getElementById("teamBScore");
  if(scoreA) scoreA.value = formatIntScoreDisplay(pendingTeamAScore);
  if(scoreB) scoreB.value = formatIntScoreDisplay(pendingTeamBScore);
  applyResultScoreFieldPerms();
  updateHlvResultStatusUI();

  if(cap){
    document.getElementById("scoreLabelA").textContent = "⚽ DUFC";
    document.getElementById("scoreLabelA").style.color = "#38bdf8";
    document.getElementById("scoreLabelB").textContent = "Đội bạn";
    document.getElementById("scoreLabelB").style.color = "#94a3b8";
    document.getElementById("resultSummary").textContent =
      `Trận ${displayMatchLabel()} · ${formationCapMain} / ${formationCapSub}`;
  }else{
    document.getElementById("scoreLabelA").textContent = "🔴 Đội A";
    document.getElementById("scoreLabelA").style.color = "#ef4444";
    document.getElementById("scoreLabelB").textContent = "🟡 Đội B";
    document.getElementById("scoreLabelB").style.color = "#facc15";
    document.getElementById("resultSummary").textContent =
      `Trận ${displayMatchLabel()} · ${formationA} vs ${formationB}`;
  }

  const opponentEl = document.getElementById("opponentTeamName");
  if(opponentEl){
    opponentEl.disabled = !!(isCapHlvResultOnly() && capHlvResultConfirmed());
  }

  document.getElementById("resultHint").innerHTML = cap
    ? `<b>Rating</b>: điểm trận 8–10 <b>+1</b> · 6–7 giữ nguyên · 1–5 <b>-1</b> rating.<br>
       <b>MVP</b>: 1 người điểm cao nhất trong đội DUFC → cộng <b>1 lần MVP</b>.<br>
       <b>⚽ BT / 🅰️ KT</b>: bàn thắng và kiến tạo từng cầu thủ.` +
      (canFinalizeMatch()
        ? (capHlvResultConfirmed()
          ? `<br><b>Host</b>: chỉnh tỉ số/tên đội/BT/KT · <b>không sửa điểm cầu thủ</b> đã chốt HLV Cáp → <b>Xác nhận trận đấu</b>.`
          : `<br><b>Host</b>: chỉnh tỉ số/tên đội khi cần · chờ HLV Cáp xác nhận → <b>Xác nhận trận đấu</b>.`)
        : (isCapHlvResultOnly()
          ? `<br><b>HLV Cáp</b>: nhập tỉ số & chấm điểm → <b>Xác nhận HLV Cáp</b>. Host chốt trận sau.`
          : ""))
    : `<b>Rating</b> (chia đội cân bằng): điểm trận 8–10 <b>+1</b> · 6–7 giữ nguyên · 1–5 <b>-1</b> rating.<br>
       <b>MVP</b> (thống kê cuối năm): mỗi đội 1 người điểm cao nhất → cộng <b>1 lần MVP</b>, không ảnh hưởng rating.` +
      (canFinalizeMatch()
        ? `<br><b>Host</b>: chỉnh tỉ số khi cần · chờ 2 HLV xác nhận → <b>Xác nhận trận đấu</b>. Điểm cầu thủ đội đã xác nhận không sửa được.`
        : (canResultTeamA() && !canResultTeamB()
          ? `<br><b>HLV Đội A</b>: nhập bàn thắng Đội A + chấm điểm cầu thủ → <b>Xác nhận Đội A</b>.`
          : (canResultTeamB() && !canResultTeamA()
            ? `<br><b>HLV Đội B</b>: nhập bàn thắng Đội B + chấm điểm cầu thủ → <b>Xác nhận Đội B</b>.`
            : "")));

  const mvpNames = getMvpNamesFromScores();
  const teams = cap
    ? [{key: "CAP", title: "⚽ DUFC", color: "#38bdf8"}]
    : [
        {key: "A", title: "🔴 Đội A (Áo Đỏ)", color: "#ef4444"},
        {key: "B", title: "🟡 Đội B (Áo Vàng)", color: "#facc15"}
      ].filter(team => {
        if(canFinalizeMatch()) return true;
        if(team.key === "A") return canResultTeamA();
        if(team.key === "B") return canResultTeamB();
        return false;
      });

  document.getElementById("resultTeams").innerHTML = teams.map(team => {
    const list = getAllMatchPlayers().filter(p => p.team === team.key);
    const header = cap
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
      const score = Number(playerMatchScores[p.name] ?? 7);
      const goals = Number(playerMatchGoals[p.name] ?? 0);
      const assists = Number(playerMatchAssists[p.name] ?? 0);
      const ratingBefore = Number(p.rating) || 5;
      const isMvp = mvpNames.includes(p.name);
      const mvpTotal = Number(p.mvp_count) || 0;
      const encodedName = encodeURIComponent(p.name);
      const roleMeta = cap
        ? `${p.capLabel || (p.starter ? "Ra sân" : "Dự bị")}`
        : (p.starter ? p.assigned : "Dự bị");
      const ratingLocked = isPlayerScoreLocked(p.team);
      const statLocked = isPlayerStatInputLocked(p.team);
      const statInputs = cap
        ? `<input class="resultStatInput" type="number" min="0" max="30" value="${goals}" ${statLocked ? "disabled" : ""}
            onchange="setPlayerMatchGoals(decodeURIComponent('${encodedName}'), this.value)">
          <input class="resultStatInput" type="number" min="0" max="30" value="${assists}" ${statLocked ? "disabled" : ""}
            onchange="setPlayerMatchAssists(decodeURIComponent('${encodedName}'), this.value)">`
        : "";
      const lockNote = ratingLocked && (canFinalizeMatch() || isCapHlvResultOnly()) ? " · đã chốt HLV" : "";
      return `<div class="resultPlayer${cap ? "" : " noStats"}${ratingLocked ? " resultLocked" : ""}">
        <img src="${escapeAttr(p.avatar)}" onerror="this.src='${defaultAvatar(p.name)}'">
        <div>
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="meta">${roleMeta} · rating ${ratingBefore}${mvpTotal ? ` · 🏆 ${mvpTotal} MVP` : ""}${lockNote}</div>
        </div>
        <select ${ratingLocked ? "disabled" : ""} onchange="setPlayerMatchScore(decodeURIComponent('${encodedName}'), this.value)">
          ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}" ${n===score?"selected":""}>${n}</option>`).join("")}
        </select>
        ${statInputs}
        <div class="mvpTag">${isMvp ? `⭐ MVP` : ""}</div>
      </div>`;
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
  saved.opponentTeamName = opponentTeamName;
  localStorage.setItem(PENDING_MATCH_KEY, JSON.stringify(saved));
}

function setPlayerMatchScore(name, value){
  syncResultFormDraftFromDom();
  const player = getAllMatchPlayers().find(p => p.name === name);
  if(player && isPlayerScoreLocked(player.team)) return;
  playerMatchScores[name] = Number(value);
  persistPendingMatchStats();
  refreshResultMvpTags();
}

function setPlayerMatchGoals(name, value){
  const player = getAllMatchPlayers().find(p => p.name === name);
  if(player && isPlayerStatInputLocked(player.team)) return;
  playerMatchGoals[name] = clampMatchStat(value);
  persistPendingMatchStats();
  persistPendingScores();
}

function setPlayerMatchAssists(name, value){
  const player = getAllMatchPlayers().find(p => p.name === name);
  if(player && isPlayerStatInputLocked(player.team)) return;
  playerMatchAssists[name] = clampMatchStat(value);
  persistPendingMatchStats();
  persistPendingScores();
}

function pickTeamMvp_(teamPlayers){
  if(!teamPlayers.length) return null;
  let maxScore = -1;
  teamPlayers.forEach(p => {
    const s = Number(playerMatchScores[p.name] ?? 7);
    if(s > maxScore) maxScore = s;
  });
  const tied = teamPlayers.filter(p => Number(playerMatchScores[p.name] ?? 7) === maxScore);
  tied.sort((a, b) => {
    if(!!a.starter !== !!b.starter) return a.starter ? -1 : 1;
    return a.name.localeCompare(b.name, "vi");
  });
  return tied[0] ? tied[0].name : null;
}

function getMvpNamesFromScores(){
  if(isCapMode()){
    const winner = pickTeamMvp_(getAllMatchPlayers());
    return winner ? [winner] : [];
  }
  const mvps = [];
  ["A", "B"].forEach(team => {
    const winner = pickTeamMvp_(getAllMatchPlayers().filter(p => p.team === team));
    if(winner) mvps.push(winner);
  });
  return mvps;
}

async function saveMatchResult(){
  clearError();
  syncResultFormDraftFromDom();
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
  persistPendingScores();

  if(hostFinalizeInternal && !bothTeamsResultSaved()){
    showError("Chờ cả 2 HLV xác nhận điểm trước khi Host kết thúc trận.");
    return;
  }
  if(capHostFinalize && !capHlvResultConfirmed()){
    showError("Chờ HLV Cáp xác nhận KQ trước khi Host kết thúc trận.");
    return;
  }
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
    if(capHostFinalize && !opponentTeamName){
      showError("Vui lòng nhập tên đội bạn.");
      return;
    }
  }

  const allPlayers = getAllMatchPlayers();
  const mvpNames = getMvpNamesFromScores();
  const seenNames = new Set();
  const payloadPlayers = (hostFinalizeInternal ? [] : (capHostFinalize || capHlvPartial ? allPlayers : allPlayers.filter(p => {
    if(seenNames.has(p.name)) return false;
    seenNames.add(p.name);
    if(canResultTeamA() && !canResultTeamB() && p.team !== "A") return false;
    if(canResultTeamB() && !canResultTeamA() && p.team !== "B") return false;
    return true;
  }))).map(p => ({
    player_name: p.name,
    team: p.team,
    starter: !!p.starter,
    match_score: Number(playerMatchScores[p.name] ?? 7),
    goals: cap ? clampMatchStat(playerMatchGoals[p.name] ?? 0) : 0,
    assists: cap ? clampMatchStat(playerMatchAssists[p.name] ?? 0) : 0,
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

    document.getElementById("ocrStatus").innerHTML =
      `Đã kết thúc trận <b>${data.match_label || displayMatchLabel()}</b>. MVP: <b>${(data.mvp_players || []).join(", ") || "—"}</b>. Rating đã cập nhật.`;
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
    value = Number(p.rating) || 5;
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
  return `<div class="statRow">
    <span class="statRank">#${rank}</span>
    <img src="${escapeAttr(p.avatar)}" onerror="this.src='${defaultAvatar(p.name)}'">
    <div>
      <div class="name">${escapeHtml(p.name)}</div>
      <div class="meta">${p.main}${p.secondary.length ? "/" + p.secondary.join("/") : ""}</div>
    </div>
    <span class="statValue ${badgeClass}">${label}</span>
  </div>`;
}
