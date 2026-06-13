/* HLV confirm workflow, lock UI, polling */

function bothTeamsConfirmed(){
  if(isCapMode()) return !!(teamConfirmState.Main && teamConfirmState.Sub);
  return teamConfirmState.A && teamConfirmState.B;
}

function bothTeamsResultSaved(){
  if(isCapMode()) return capHlvResultConfirmed();
  return teamResultSaved.A && teamResultSaved.B;
}

function canHostFinalizeMatch(){
  return isMatchHost() && bothTeamsResultSaved();
}

function hlvResultBadgeHtml(team, label){
  const done = teamResultSaved[team];
  const cls = done ? "hlvResultBadge done" : "hlvResultBadge pending";
  const icon = done ? "✓" : "⏳";
  const text = done ? "Đã xác nhận KQ" : "Chưa xác nhận KQ";
  return `<span class="${cls}">${icon} ${label}: ${text}</span>`;
}

function hlvResultStatusHtml(opts = {}){
  const parts = isCapMode()
    ? [hlvResultBadgeHtml("A", "⚽ HLV Cáp")]
    : [
        hlvResultBadgeHtml("A", "🔴 HLV A"),
        hlvResultBadgeHtml("B", "🟡 HLV B")
      ];
  if(opts.hostNote){
    if(isCapMode() && canFinalizeMatch()){
      parts.push(`<span class="hlvResultBadge hostNote">Host chỉnh tỉ số/tên đội khi cần → Xác nhận trận sau HLV Cáp</span>`);
    }else if(isMatchHost()){
      parts.push(`<span class="hlvResultBadge hostNote">Host có thể nhập & kết thúc trận bất cứ lúc nào</span>`);
    }
  }
  return parts.join("");
}

function updateHlvResultStatusUI(){
  const bar = document.getElementById("hlvResultStatus");
  const modalBar = document.getElementById("resultHlvStatus");
  const show = matchLocked && currentImageFilename;
  const html = show ? hlvResultStatusHtml({ hostNote: true }) : "";
  if(bar){
    bar.innerHTML = html;
    bar.style.display = show && html ? "flex" : "none";
  }
  if(modalBar){
    modalBar.innerHTML = html;
    modalBar.style.display = show && html ? "flex" : "none";
  }
}

function formatIntScoreDisplay(value){
  const n = parsePositiveIntScore(value, null);
  return n === null ? "" : String(n);
}

function loadPendingScoresFromStore(extra){
  if(extra){
    if(extra.team_a_score != null && extra.team_a_score !== "") pendingTeamAScore = formatIntScoreDisplay(extra.team_a_score);
    if(extra.team_b_score != null && extra.team_b_score !== "") pendingTeamBScore = formatIntScoreDisplay(extra.team_b_score);
    return;
  }
  const saved = JSON.parse(localStorage.getItem(PENDING_MATCH_KEY) || "{}");
  if(saved.teamAScore != null && saved.teamAScore !== "") pendingTeamAScore = formatIntScoreDisplay(saved.teamAScore);
  if(saved.teamBScore != null && saved.teamBScore !== "") pendingTeamBScore = formatIntScoreDisplay(saved.teamBScore);
  if(saved.team_a_score != null && saved.team_a_score !== "") pendingTeamAScore = formatIntScoreDisplay(saved.team_a_score);
  if(saved.team_b_score != null && saved.team_b_score !== "") pendingTeamBScore = formatIntScoreDisplay(saved.team_b_score);
}

function parsePositiveIntScore(value, fallback){
  if(value == null) return fallback !== undefined ? fallback : null;
  const s = String(value).trim().replace(",", ".");
  if(!s) return fallback !== undefined ? fallback : null;
  if(/^\d+$/.test(s)){
    const n = parseInt(s, 10);
    if(n < 0 || n > 99) return fallback !== undefined ? fallback : null;
    return n;
  }
  const f = Number(s);
  if(!Number.isFinite(f) || f < 0) return fallback !== undefined ? fallback : null;
  const n = Math.floor(f);
  if(n < 0 || n > 99) return fallback !== undefined ? fallback : null;
  return n;
}

function sanitizeScoreInput(el){
  if(!el || el.disabled) return;
  const v = parsePositiveIntScore(el.value, null);
  el.value = v === null ? "" : String(v);
  persistPendingScores();
}

function syncPendingScoresFromInputs(){
  const inputA = document.getElementById("teamAScore");
  const inputB = document.getElementById("teamBScore");
  if(inputA && !inputA.disabled){
    const v = parsePositiveIntScore(inputA.value, null);
    if(v !== null) pendingTeamAScore = String(v);
  }
  if(inputB && !inputB.disabled){
    const v = parsePositiveIntScore(inputB.value, null);
    if(v !== null) pendingTeamBScore = String(v);
  }
}

function persistPendingScores(){
  syncPendingScoresFromInputs();
  const saved = JSON.parse(localStorage.getItem(PENDING_MATCH_KEY) || "{}");
  saved.teamAScore = pendingTeamAScore;
  saved.teamBScore = pendingTeamBScore;
  localStorage.setItem(PENDING_MATCH_KEY, JSON.stringify(saved));
}

function applyResultScoreFieldPerms(){
  const wrapA = document.getElementById("scoreWrapA");
  const wrapB = document.getElementById("scoreWrapB");
  const inputA = document.getElementById("teamAScore");
  const inputB = document.getElementById("teamBScore");
  if(!wrapA || !wrapB || !inputA || !inputB) return;

  wrapA.classList.remove("scorePrimary", "scoreMuted");
  wrapB.classList.remove("scorePrimary", "scoreMuted");
  inputA.disabled = false;
  inputB.disabled = false;

  if(typeof isEditingCompletedResult === "function" && isEditingCompletedResult()){
    wrapA.classList.add("scorePrimary");
    wrapB.classList.add("scorePrimary");
    return;
  }

  if(canFinalizeMatch()){
    wrapA.classList.add("scorePrimary");
    wrapB.classList.add("scorePrimary");
    if(pendingTeamAScore !== "") inputA.value = formatIntScoreDisplay(pendingTeamAScore);
    if(pendingTeamBScore !== "") inputB.value = formatIntScoreDisplay(pendingTeamBScore);
    return;
  }
  if(isCapHlvResultOnly()){
    wrapA.classList.add("scorePrimary");
    wrapB.classList.add("scorePrimary");
    if(teamResultSaved.A) inputA.disabled = inputB.disabled = true;
    if(pendingTeamAScore !== "") inputA.value = formatIntScoreDisplay(pendingTeamAScore);
    if(pendingTeamBScore !== "") inputB.value = formatIntScoreDisplay(pendingTeamBScore);
    return;
  }
  if(canResultTeamA() && !canResultTeamB()){
    wrapA.classList.add("scorePrimary");
    wrapB.classList.add("scoreMuted");
    inputB.disabled = true;
    if(teamResultSaved.A) inputA.disabled = true;
    if(pendingTeamBScore !== "") inputB.value = formatIntScoreDisplay(pendingTeamBScore);
    if(pendingTeamAScore !== "") inputA.value = formatIntScoreDisplay(pendingTeamAScore);
  }else if(canResultTeamB() && !canResultTeamA()){
    wrapB.classList.add("scorePrimary");
    wrapA.classList.add("scoreMuted");
    inputA.disabled = true;
    if(teamResultSaved.B) inputB.disabled = true;
    if(pendingTeamAScore !== "") inputA.value = formatIntScoreDisplay(pendingTeamAScore);
    if(pendingTeamBScore !== "") inputB.value = formatIntScoreDisplay(pendingTeamBScore);
  }
}

function isPlayerScoreLocked(teamKey){
  if(isCapMode()){
    return capHlvResultConfirmed();
  }
  if(canFinalizeMatch() && teamResultSaved[teamKey]) return true;
  if(teamKey === "A" && canResultTeamA() && !canResultTeamB() && teamResultSaved.A) return true;
  if(teamKey === "B" && canResultTeamB() && !canResultTeamA() && teamResultSaved.B) return true;
  return false;
}

function isPlayerStatInputLocked(teamKey){
  if(isCapMode() && canFinalizeMatch()) return false;
  return isPlayerScoreLocked(teamKey);
}

function syncPlayerMatchScoresFromHistory(historyPlayers){
  (historyPlayers || []).forEach(hp => {
    const name = hp.player_name;
    const ms = hp.match_score;
    if(name && ms != null && ms !== "" && Number.isFinite(Number(ms))){
      playerMatchScores[name] = Number(ms);
    }
  });
}

function shouldPollPendingMatch(){
  if(!isLoggedIn()) return false;
  if(canSplitTeams()) return true;
  if(canCoordinateCap()) return true;
  if(canCapHlvEdit()) return true;
  if(isHlvEditor() && matchLocked && currentImageFilename) return true;
  return false;
}

function updateTeamConfirmBadges(){
  ["A", "B"].forEach(team => {
    const badge = document.getElementById("teamConfirmBadge" + team);
    if(!badge) return;
    const show = isSplitWorkflow() || canManageTeamA() || canManageTeamB();
    badge.style.display = show ? "inline-block" : "none";
    if(teamConfirmState[team]){
      badge.textContent = "✓ Đã chốt";
      badge.classList.remove("pending");
    }else{
      badge.textContent = "Chưa chốt";
      badge.classList.add("pending");
    }
  });
}

function persistTeamWorkflowState(){
  const saved = JSON.parse(localStorage.getItem(PENDING_MATCH_KEY) || "{}");
  if(!saved.matchId && !lastResult) return;
  saved.teamConfirmState = teamConfirmState;
  saved.teamResultSaved = teamResultSaved;
  saved.lineupPublishedToHlv = lineupPublishedToHlv;
  saved.teamAScore = pendingTeamAScore;
  saved.teamBScore = pendingTeamBScore;
  localStorage.setItem(PENDING_MATCH_KEY, JSON.stringify(saved));
  const draftKey = "dufc_team_workflow";
  localStorage.setItem(draftKey, JSON.stringify({
    teamConfirmState,
    teamResultSaved,
    updatedAt: new Date().toISOString()
  }));
}

function loadTeamWorkflowState(extra){
  if(extra){
    if(String(extra.match_type || "").toLowerCase() === "cap"){
      teamConfirmState.Main = !!extra.team_a_lineup_confirmed;
      teamConfirmState.Sub = !!extra.team_b_lineup_confirmed;
    }else{
      teamConfirmState.A = !!extra.team_a_lineup_confirmed;
      teamConfirmState.B = !!extra.team_b_lineup_confirmed;
    }
    teamResultSaved.A = !!extra.team_a_result_saved;
    teamResultSaved.B = !!extra.team_b_result_saved;
    return;
  }
  const draft = JSON.parse(localStorage.getItem("dufc_team_workflow") || "{}");
  if(draft.teamConfirmState){
    teamConfirmState = Object.assign({ A: false, B: false, Main: false, Sub: false }, draft.teamConfirmState);
  }
  if(draft.teamResultSaved){
    teamResultSaved = Object.assign({ A: false, B: false }, draft.teamResultSaved);
  }
}

function updateCoordinatorConfirmStatus(){
  const el = document.getElementById("ocrStatus");
  if(!el || !lastResult) return;

  if(isCapMode() && canCoordinateCap()){
    const main = teamConfirmState.Main ? "✓" : "⏳";
    const sub = teamConfirmState.Sub ? "✓" : "⏳";
    let msg = `HLV Cáp chốt: ⚽ Chính ${main} · 🔄 Phụ ${sub}`;
    if(teamConfirmState.Main && teamConfirmState.Sub){
      msg += matchLocked
        ? (currentImageFilename ? " — Đã khóa, chờ nhập kết quả." : " — Đã khóa, bấm Xuất hình đội hình.")
        : " — Đang khóa trận...";
    }
    el.innerHTML = msg;
    return;
  }

  if(!canSplitTeams()) return;
  const a = teamConfirmState.A ? "✓" : "⏳";
  const b = teamConfirmState.B ? "✓" : "⏳";
  let msg = `HLV chốt: 🔴 Đội A ${a} · 🟡 Đội B ${b}`;
  if(teamConfirmState.A && teamConfirmState.B){
    msg += matchLocked
      ? (currentImageFilename ? " — Đã khóa, chờ nhập kết quả." : " — Đã khóa, bấm Xuất hình đội hình.")
      : " — Đang khóa trận...";
  }
  el.innerHTML = msg;
}

function shouldFullApplyServerPendingMatch(){
  if(lineupDragSession) return false;
  if(typeof shouldPreserveLocalMatchResult === "function" && shouldPreserveLocalMatchResult()) return false;
  if(canCoordinateCap() && isCapMode() && lastResult && !lineupPublishedToHlv && !matchLocked){
    return false;
  }
  if(isCapHlvView() && lineupPublishedToHlv && !matchLocked && !(teamConfirmState.Main && teamConfirmState.Sub)){
    return !lastResult;
  }
  if(isCapHlvView() && matchLocked && currentImageFilename && canResultCap()){
    return false;
  }
  return true;
}

function applyServerPendingMatchLight(summary){
  if(typeof shouldPreserveLocalMatchResult === "function" && shouldPreserveLocalMatchResult()) return;
  const status = String(summary.status || "").toLowerCase();
  currentMatchId = summary.match_id;
  currentMatchLabel = summary.match_label || formatMatchLabel(summary.created_at || Date.now());
  setMatchStartTimeSelect(summary.match_start_time || DEFAULT_MATCH_START_TIME);
  currentImageFilename = summary.image_filename || currentImageFilename || "";
  lineupPublishedToHlv = status === "lineup_published" || status === "lineup_exported";
  loadTeamWorkflowState(summary);
  loadPendingScoresFromStore(summary);
  updateTeamConfirmBadges();
  if(status === "lineup_exported"){
    applyLockUI(true);
  }else if(bothTeamsConfirmed()){
    maybeAutoLockFromConfirm();
  }else if(matchLocked){
    applyLockUI(false);
  }
  updateCoordinatorConfirmStatus();
  updateHlvResultStatusUI();
  persistTeamWorkflowState();
  applyLineupRoleUI();
}

function maybeAutoLockFromConfirm(){
  if(matchLocked || !bothTeamsConfirmed() || !lastResult || !currentMatchId) return;

  const allPlayers = getAllMatchPlayers();
  if(!Object.keys(playerMatchScores).length){
    playerMatchScores = {};
    playerMatchGoals = {};
    playerMatchAssists = {};
    allPlayers.forEach(p => {
      playerMatchScores[p.name] = 7;
      playerMatchGoals[p.name] = 0;
      playerMatchAssists[p.name] = 0;
    });
  }

  const saved = JSON.parse(localStorage.getItem(PENDING_MATCH_KEY) || "{}");
  saved.matchId = currentMatchId;
  saved.matchLabel = currentMatchLabel || saved.matchLabel;
  saved.lastResult = lastResult;
  saved.teamConfirmState = teamConfirmState;
  saved.formationA = formationA;
  saved.formationB = formationB;
  saved.lockedAt = new Date().toISOString();
  localStorage.setItem(PENDING_MATCH_KEY, JSON.stringify(saved));
  persistTeamWorkflowState();

  applyLockUI(true);
  if(canSplitTeams() && !isCapMode()){
    showToast(`🔒 Cả 2 HLV đã chốt — bấm ${lineupExportButtonLabel()}`, "warn", 5000);
  }else if(canCoordinateCap() && isCapMode()){
    showToast(`🔒 HLV Cáp đã chốt — bấm ${lineupExportButtonLabel()}`, "warn", 5000);
  }
  updateCoordinatorConfirmStatus();
}

function applyServerPendingMatch(data){
  if(!data?.pending || !data.summary || !data.players?.length) return false;
  if(typeof shouldPreserveLocalMatchResult === "function" && shouldPreserveLocalMatchResult()) return false;

  const summary = data.summary;
  if(isCapHlvView() && !isServerLineupPublished(summary)) return false;
  if(canCoordinateCap() && isCapMode() && lastResult && !lineupPublishedToHlv && !matchLocked){
    return false;
  }
  const status = String(summary.status || "").toLowerCase();

  currentMatchId = summary.match_id;
  currentMatchLabel = summary.match_label || formatMatchLabel(summary.created_at || Date.now());
  setMatchStartTimeSelect(summary.match_start_time || DEFAULT_MATCH_START_TIME);
  currentImageFilename = summary.image_filename || currentImageFilename || "";
  formationA = normalizeFormationValue(summary.formation_a, formationA);
  formationB = normalizeFormationValue(summary.formation_b, formationB);
  formationCapMain = normalizeFormationValue(summary.formation_a, formationCapMain);
  formationCapSub = normalizeFormationValue(summary.formation_b, formationCapSub);
  opponentTeamName = summary.opponent_name || "";
  lastResult = rebuildLastResultFromDetail(data.players, summary);
  syncSelectedPlayersFromMatch(data.players);
  lineupPublishedToHlv = status === "lineup_published" || status === "lineup_exported";
  const preserveResult = typeof shouldPreserveLocalMatchResult === "function" && shouldPreserveLocalMatchResult();
  if(!preserveResult){
    loadTeamWorkflowState(summary);
    loadPendingScoresFromStore(summary);
  }

  playerMatchScores = playerMatchScores || {};
  playerMatchGoals = playerMatchGoals || {};
  playerMatchAssists = playerMatchAssists || {};
  getAllMatchPlayers().forEach(p => {
    if(playerMatchScores[p.name] == null) playerMatchScores[p.name] = 7;
    if(playerMatchGoals[p.name] == null) playerMatchGoals[p.name] = 0;
    if(playerMatchAssists[p.name] == null) playerMatchAssists[p.name] = 0;
  });
  if(!preserveResult) syncPlayerMatchScoresFromHistory(data.players);

  switchLineupMode(isCapMode() ? "cap" : "internal", true);
  if(isCapMode()){
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

  updateTeamConfirmBadges();

  if(status === "lineup_exported"){
    applyLockUI(true);
  }else if(bothTeamsConfirmed()){
    maybeAutoLockFromConfirm();
  }else if(matchLocked){
    applyLockUI(false);
  }

  updateCoordinatorConfirmStatus();
  updateHlvResultStatusUI();
  persistTeamWorkflowState();
  applyLineupRoleUI();
  return true;
}

async function refreshTeamConfirmFromServer(){
  if(!shouldPollPendingMatch()) return;
  if(typeof shouldPreserveLocalMatchResult === "function" && shouldPreserveLocalMatchResult()) return;
  try{
    const data = await apiGet("get_pending_match");
    if(!data.pending || !data.summary) return;

    const summary = data.summary;
    const isCapPending = String(summary.match_type || "").toLowerCase() === "cap";
    const published = isServerLineupPublished(summary);
    if(isCapHlvView() && !published) return;
    if(!canSplitTeams() && !canCoordinateCap() && !canCapHlvEdit() &&
      currentMatchId && summary.match_id !== currentMatchId) return;

    if(data.players?.length){
      const prevA = teamConfirmState.A;
      const prevB = teamConfirmState.B;
      const prevMain = teamConfirmState.Main;
      const prevSub = teamConfirmState.Sub;
      if(shouldFullApplyServerPendingMatch()){
        applyServerPendingMatch(data);
      }else{
        applyServerPendingMatchLight(summary);
        return;
      }
      if(canSplitTeams() && !isCapPending){
        if(!prevA && teamConfirmState.A) showToast("🔴 HLV Đội A đã chốt", "info");
        if(!prevB && teamConfirmState.B) showToast("🟡 HLV Đội B đã chốt", "info");
        if(teamConfirmState.A && teamConfirmState.B && matchLocked && !currentImageFilename){
          updateCoordinatorConfirmStatus();
        }
      }else if(canCoordinateCap() && isCapPending){
        if(!prevMain && teamConfirmState.Main) showToast("⚽ HLV Cáp đã chốt Chính", "info");
        if(!prevSub && teamConfirmState.Sub) showToast("🔄 HLV Cáp đã chốt Phụ", "info");
        if(teamConfirmState.Main && teamConfirmState.Sub && matchLocked && !currentImageFilename){
          updateCoordinatorConfirmStatus();
        }else if(lineupPublishedToHlv){
          updateCoordinatorConfirmStatus();
        }
      }
      return;
    }

    if(!(typeof shouldPreserveLocalMatchResult === "function" && shouldPreserveLocalMatchResult())){
      loadTeamWorkflowState(summary);
      loadPendingScoresFromStore(summary);
    }
    updateTeamConfirmBadges();
    maybeAutoLockFromConfirm();
    updateCoordinatorConfirmStatus();
    updateHlvResultStatusUI();
    persistTeamWorkflowState();
    applyLineupRoleUI();
  }catch(e){
    console.error("refreshTeamConfirmFromServer:", e);
  }
}

function startConfirmPolling(){
  stopConfirmPolling();
  if(typeof shouldPreserveLocalMatchResult === "function" && shouldPreserveLocalMatchResult()) return;
  if(!shouldPollPendingMatch()) return;
  refreshTeamConfirmFromServer();
  confirmPollTimer = setInterval(refreshTeamConfirmFromServer, 3000);
}

function stopConfirmPolling(){
  if(confirmPollTimer){
    clearInterval(confirmPollTimer);
    confirmPollTimer = null;
  }
}

function setWorkflowBtn(el, done, doneText, activeText){
  if(!el) return;
  if(done){
    el.disabled = true;
    el.textContent = doneText;
    el.classList.add("btnDone");
  }else{
    el.disabled = false;
    el.textContent = activeText;
    el.classList.remove("btnDone");
  }
}

function applyLineupRoleUI(){
  const importOk = canImportRoster();
  const splitOk = canSplitTeams();
  const manageA = canManageTeamA();
  const manageB = canManageTeamB();
  const full = isFullLineupRole();
  const capHlv = isCapHlvView();

  const playerCard = document.getElementById("playerCard");
  const lineupGrid = document.getElementById("lineupGrid");
  const summaryCap = document.getElementById("summaryCap");
  if(playerCard) playerCard.style.display = (importOk && !capHlv) ? "" : "none";
  if(summaryCap) summaryCap.style.display = (lineupMode === "cap" && !capHlv) ? "" : "none";
  if(lineupGrid){
    lineupGrid.classList.toggle("singleTeam", !importOk && !capHlv);
    lineupGrid.classList.toggle("hlvRoleView", isHlvEditor());
    lineupGrid.classList.toggle("capHlvRoleView", capHlv);
  }

  const panelA = document.getElementById("teamPanelA");
  const panelB = document.getElementById("teamPanelB");
  if(panelA) panelA.style.display = (full || manageA || splitOk) ? "" : "none";
  if(panelB) panelB.style.display = (full || manageB || splitOk) ? "" : "none";
  if(panelA){
    panelA.classList.toggle("hlvPanel", isHlvPanelTeam("A"));
    panelA.classList.toggle("hlvConfirmed", isHlvPanelTeam("A") && teamConfirmState.A);
  }
  if(panelB){
    panelB.classList.toggle("hlvPanel", isHlvPanelTeam("B"));
    panelB.classList.toggle("hlvConfirmed", isHlvPanelTeam("B") && teamConfirmState.B);
  }

  const internalTeams = document.getElementById("internalTeams");
  if(internalTeams){
    const hlvSingle = (manageA && !manageB && !splitOk) || (manageB && !manageA && !splitOk);
    internalTeams.classList.toggle("singleTeam", hlvSingle);
    internalTeams.classList.toggle("hlvRoleView", isHlvEditor());
  }

  const coordinatorLocked = (splitOk || (canCoordinateCap() && isCapMode())) && lineupPublishedToHlv && !matchLocked;
  if(lineupGrid) lineupGrid.classList.toggle("coordinatorLocked", coordinatorLocked);

  const importControls = ["searchBox"];
  importControls.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = importOk ? "" : "none";
  });
  const screenshotLabel = document.getElementById("screenshotLabel");
  if(screenshotLabel) screenshotLabel.style.display = importOk ? "" : "none";
  const selectAllBtn = document.querySelector("#playerCard .secondary.lockable");
  const hideAfterLineupReady = !!lastResult && !matchLocked &&
    ((splitOk && lineupMode === "internal") || (canCoordinateCap() && lineupMode === "cap"));
  if(selectAllBtn) selectAllBtn.style.display = importOk && !hideAfterLineupReady ? "" : "none";

  const formA = document.getElementById("formationSelectA");
  const formB = document.getElementById("formationSelectB");
  const blockCoordinatorEdit = coordinatorLocked || matchLocked;
  const hlvLockedA = isHlvPanelTeam("A") && teamConfirmState.A;
  const hlvLockedB = isHlvPanelTeam("B") && teamConfirmState.B;
  if(formA) formA.disabled = blockCoordinatorEdit || hlvLockedA || !(manageA || full);
  if(formB) formB.disabled = blockCoordinatorEdit || hlvLockedB || !(manageB || full);

  const showTeamControls = !matchLocked && !!lastResult;
  const btnConfA = document.getElementById("btnConfirmA");
  const btnConfB = document.getElementById("btnConfirmB");
  const showConfA = manageA && showTeamControls && !splitOk;
  const showConfB = manageB && showTeamControls && !splitOk;
  if(btnConfA){
    btnConfA.style.display = showConfA ? "" : "none";
    if(showConfA) setWorkflowBtn(btnConfA, teamConfirmState.A, "✓ Đã chốt", "✓ Chốt đội hình");
  }
  if(btnConfB){
    btnConfB.style.display = showConfB ? "" : "none";
    if(showConfB) setWorkflowBtn(btnConfB, teamConfirmState.B, "✓ Đã chốt", "✓ Chốt đội hình");
  }

  const btnPublish = document.getElementById("btnPublish");
  const showPublishInternal = splitOk && showTeamControls && !matchLocked;
  const showPublishCap = canCoordinateCap() && isCapMode() && !!lastResult && !matchLocked;
  const showPublish = showPublishInternal || showPublishCap;
  if(btnPublish){
    btnPublish.style.display = showPublish ? "" : "none";
    if(showPublish) setWorkflowBtn(btnPublish, lineupPublishedToHlv, "✓ Đã gửi HLV", "Gửi HLV");
  }

  const btnRandom = document.getElementById("btnRandom");
  if(btnRandom) btnRandom.style.display = splitOk && lineupMode === "internal" && !matchLocked && !lastResult ? "" : "none";

  const exportOk = hasPerm(PERMS.EXPORT) && (splitOk || canCoordinateCap());
  const btnExport = document.getElementById("btnExport");
  const btnForceExport = document.getElementById("btnForceExport");
  const showExport = exportOk && !!lastResult && bothTeamsConfirmed();
  const showForceExport = exportOk && splitOk && !!lastResult && lineupPublishedToHlv && !matchLocked &&
    !bothTeamsConfirmed() && !currentImageFilename;
  if(btnExport){
    btnExport.style.display = (showExport && !capHlv) ? "" : "none";
    if(showExport){
      if(currentImageFilename){
        btnExport.textContent = "Đã xuất ảnh — chờ kết quả";
        btnExport.disabled = true;
      }else{
        btnExport.textContent = lineupExportButtonLabel();
        btnExport.disabled = false;
      }
    }
  }
  if(btnForceExport){
    btnForceExport.style.display = showForceExport ? "" : "none";
    if(showForceExport){
      btnForceExport.disabled = false;
      btnForceExport.textContent = "Chốt & xuất hình";
      btnForceExport.classList.remove("btnDone");
    }
  }

  updateTeamConfirmBadges();

  const hintA = document.getElementById("hlvHintA");
  const hintB = document.getElementById("hlvHintB");
  if(hintA) hintA.style.display = canEditTeamLineup("A") && showTeamControls ? "" : "none";
  if(hintB) hintB.style.display = canEditTeamLineup("B") && showTeamControls ? "" : "none";

  if(!lineupDragSession){
    if(isHlvPanelTeam("A") && !lastResult) renderHlvTeamLineupView("A", false);
    if(isHlvPanelTeam("B") && !lastResult) renderHlvTeamLineupView("B", false);
    const capHlvDone = capHlv && teamConfirmState.Main && teamConfirmState.Sub;
    if((capHlv || (canCapHlvEdit() && lineupMode === "cap")) && lastResult && isCapLineupPublished()){
      if(!capHlv || capHlvDone){
        refreshTeamLineupUI("Main");
        refreshTeamLineupUI("Sub");
      }
    }
  }

  const capTeams = document.getElementById("capTeams");
  const capHlvActions = document.getElementById("capHlvActions");
  const panelCapMain = document.getElementById("teamPanelCapMain");
  const panelCapSub = document.getElementById("teamPanelCapSub");
  if(capTeams) capTeams.classList.toggle("capHlvView", capHlv);
  if(capHlvActions) capHlvActions.style.display = capHlv ? "" : "none";
  if(panelCapMain){
    panelCapMain.classList.toggle("hlvPanel", capHlv);
    panelCapMain.classList.toggle("hlvConfirmed", capHlv && teamConfirmState.Main);
  }
  if(panelCapSub){
    panelCapSub.classList.toggle("hlvPanel", capHlv);
    panelCapSub.classList.toggle("hlvConfirmed", capHlv && teamConfirmState.Sub);
  }
  const formCapMain = document.getElementById("formationSelectCapMain");
  const formCapSub = document.getElementById("formationSelectCapSub");
  const capCoord = canCoordinateCap() && isCapMode();
  if(formCapMain) formCapMain.disabled = capHlv ? (matchLocked || !lineupPublishedToHlv) : (coordinatorLocked || matchLocked || !capCoord);
  if(formCapSub) formCapSub.disabled = capHlv ? (matchLocked || !lineupPublishedToHlv) : (coordinatorLocked || matchLocked || !capCoord);
  const btnOptimizeCap = document.getElementById("btnOptimizeCap");
  if(btnOptimizeCap){
    const showOptimizeCap = capCoord && lineupMode === "cap" && !matchLocked && !lineupPublishedToHlv;
    btnOptimizeCap.style.display = showOptimizeCap ? "" : "none";
    if(showOptimizeCap && lastResult){
      btnOptimizeCap.textContent = "Sắp xếp lại";
    }else if(showOptimizeCap){
      btnOptimizeCap.textContent = "Sắp xếp đội hình tối ưu";
    }
  }
  const btnConfirmCap = document.getElementById("btnConfirmCap");
  const btnResultCap = document.getElementById("btnResultCap");
  const showCapConfirm = capHlv && !!lastResult && lineupPublishedToHlv && !matchLocked &&
    !(teamConfirmState.Main && teamConfirmState.Sub);
  if(btnConfirmCap){
    btnConfirmCap.style.display = showCapConfirm ? "" : "none";
    if(showCapConfirm) setWorkflowBtn(btnConfirmCap, false, "✓ Đã chốt", "✓ Chốt đội hình");
  }
  if(btnResultCap){
    const showCapResult = capHlv && matchLocked && !!currentImageFilename && canResultCap();
    btnResultCap.style.display = showCapResult ? "" : "none";
    if(showCapResult){
      btnResultCap.disabled = false;
      btnResultCap.textContent = "Nhập kết quả trận";
    }
  }

  const banner = document.getElementById("roleTaskBanner");
  if(banner){
    if(isLoggedIn() && (isSplitWorkflow() || full || isCapWorkflow())){
      banner.style.display = "";
      banner.textContent = getRoleTaskLabel();
    }else{
      banner.style.display = "none";
    }
  }

  updateHlvResultStatusUI();
  updateResultModalPerms();
  initLineupTeamSwitchers();
  syncAllFormationSegs();
}

function canUseLineupTab(){
  return hasPerm(PERMS.EXPORT) || hasPerm(PERMS.LINEUP_INTERNAL) || canManageCapLineup() ||
    canSplitTeams() || canManageTeamA() || canManageTeamB() || canImportRoster();
}

function shouldRestorePending(){
  return isLoggedIn() && (
    hasPerm(PERMS.MATCH_RESULT) || hasPerm(PERMS.MATCH_RESULT_A) || hasPerm(PERMS.MATCH_RESULT_B) ||
    hasPerm(PERMS.EXPORT) || hasPerm(PERMS.ALL) ||
    canSplitTeams() || canManageTeamA() || canManageTeamB() ||
    canCoordinateCap() || canCapHlvEdit()
  );
}
