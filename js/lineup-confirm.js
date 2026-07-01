/* HLV confirm team, formation change */


async function confirmTeamLineup(team){
  clearError();
  if(matchLocked){
    showError("Trận đã chốt — không chốt đội hình nữa.");
    return;
  }
  if(!lastResult){
    showError("Chưa có đội hình để chốt.");
    return;
  }
  if(!currentMatchId){
    showError("Chưa có mã trận trên server. Anh Phương cần bấm Xác nhận & gửi HLV trước.");
    return;
  }
  if(team === "A" && !canManageTeamA()){
    showError("Bạn không có quyền chốt Đội A.");
    return;
  }
  if(team === "B" && !canManageTeamB()){
    showError("Bạn không có quyền chốt Đội B.");
    return;
  }
  const lineup = team === "A" ? lastResult.lineupA : lastResult.lineupB;
  if(!lineup?.starters?.length){
    showError(`Đội ${team} chưa có đội hình ra sân.`);
    return;
  }
  ensureStarterPositions(lineup, team === "A" ? formationA : formationB);
  const btn = document.getElementById(team === "A" ? "btnConfirmA" : "btnConfirmB");
  if(btn){ btn.disabled = true; btn.textContent = "Đang chốt..."; btn.classList.remove("btnDone"); }
  try{
    const data = await setTeamConfirmOnServer(team, true);
    teamConfirmState[team] = true;
    updateTeamConfirmBadges();
    persistTeamWorkflowState();
    document.getElementById("textResult").textContent = textResult(lastResult);
    document.getElementById("ocrStatus").innerHTML =
      `Đội ${team === "A" ? "🔴 A" : "🟡 B"} đã chốt & lưu sơ đồ ${team === "A" ? formationA : formationB}.`;
    maybeAutoLockFromConfirm();
    showToast(`✓ Đội ${team === "A" ? "A" : "B"} đã chốt & lưu đội hình`, "success");
    refreshTeamLineupUI(team);
    applyLineupRoleUI();
  }catch(e){
    console.error(e);
    showError(e.message || "Không lưu được trạng thái chốt lên server.");
    applyLineupRoleUI();
  }
}

function buildTeamLineupRows(team, options = {}){
  if(!lastResult || !currentMatchId) return [];
  const formation = team === "A" ? formationA : formationB;
  const lineup = team === "A" ? lastResult.lineupA : lastResult.lineupB;
  ensureStarterPositions(lineup, formation);
  const shirt = team === "A" ? "Áo Đỏ" : "Áo Vàng";
  const status = options.status || "lineup_published";
  const now = new Date();
  const matchDate = getMatchDateForSave();
  const rows = [];

  lineup.starters.forEach((p, index) => {
    rows.push({
      match_id: currentMatchId,
      match_date: matchDate,
      created_at: now.toISOString(),
      team,
      shirt,
      formation,
      player_name: p.name,
      rating: Number(p.rating) || 5,
      starter: true,
      lineup_order: index + 1,
      assigned_position: p.assigned || "",
      assigned_side: p.assignedSide || "",
      main_position: p.main || "",
      secondary_positions: (p.secondary || []).join("/"),
      preferred_side: Array.isArray(p.side) ? p.side.join("/") : (p.side || ""),
      fit_label: p.fit === 2 ? "main_position" : p.fit === 1 ? "secondary_position" : "wrong_position",
      captain: !!p.captain,
      custom_x: p.hasCustomPosition && isValidPitchCoord(p.customX, p.customY) ? p.customX : null,
      custom_y: p.hasCustomPosition && isValidPitchCoord(p.customX, p.customY) ? p.customY : null,
      status
    });
  });

  lineup.bench.forEach((p, index) => {
    rows.push({
      match_id: currentMatchId,
      match_date: matchDate,
      created_at: now.toISOString(),
      team,
      shirt,
      formation,
      player_name: p.name,
      rating: Number(p.rating) || 5,
      starter: false,
      lineup_order: index + 1,
      assigned_position: "BENCH",
      assigned_side: "",
      main_position: p.main || "",
      secondary_positions: (p.secondary || []).join("/"),
      preferred_side: Array.isArray(p.side) ? p.side.join("/") : (p.side || ""),
      fit_label: "bench",
      captain: false,
      custom_x: null,
      custom_y: null,
      status
    });
  });

  return rows;
}

function buildCapTeamLineupRows(teamKey, options = {}){
  if(!lastResult || !currentMatchId) return [];
  const isMain = teamKey === "MAIN";
  const formation = isMain ? formationCapMain : formationCapSub;
  const lineup = isMain
    ? (lastResult.lineupMain || lastResult.lineupA)
    : (lastResult.lineupSub || lastResult.lineupB);
  ensureStarterPositions(lineup, formation);
  const status = options.status || "lineup_published";
  const now = new Date();
  const matchDate = getMatchDateForSave();
  const rows = [];
  const team = isMain ? "MAIN" : "SUB";
  const shirt = isMain ? "Chính" : "Phụ";

  (lineup.starters || []).forEach((p, index) => {
    rows.push({
      match_id: currentMatchId,
      match_date: matchDate,
      created_at: now.toISOString(),
      team,
      shirt,
      formation,
      player_name: p.name,
      rating: Number(p.rating) || 5,
      starter: true,
      lineup_order: index + 1,
      assigned_position: p.assigned || "",
      assigned_side: p.assignedSide || "",
      main_position: p.main || "",
      secondary_positions: (p.secondary || []).join("/"),
      preferred_side: Array.isArray(p.side) ? p.side.join("/") : (p.side || ""),
      fit_label: p.fit === 2 ? "main_position" : p.fit === 1 ? "secondary_position" : "wrong_position",
      captain: !!p.captain,
      custom_x: p.hasCustomPosition && isValidPitchCoord(p.customX, p.customY) ? p.customX : null,
      custom_y: p.hasCustomPosition && isValidPitchCoord(p.customX, p.customY) ? p.customY : null,
      status
    });
  });

  if(isMain){
    (lineup.bench || []).forEach((p, index) => {
      rows.push({
        match_id: currentMatchId,
        match_date: matchDate,
        created_at: now.toISOString(),
        team,
        shirt,
        formation,
        player_name: p.name,
        rating: Number(p.rating) || 5,
        starter: false,
        lineup_order: index + 1,
        assigned_position: "BENCH",
        assigned_side: "",
        main_position: p.main || "",
        secondary_positions: (p.secondary || []).join("/"),
        preferred_side: Array.isArray(p.side) ? p.side.join("/") : (p.side || ""),
        fit_label: "bench",
        captain: false,
        custom_x: null,
        custom_y: null,
        status
      });
    });
  }

  return rows;
}

async function confirmCapTeamLineup(team){
  clearError();
  const uiTeam = lineupTeamUiKey(team);
  const serverTeam = uiTeam === "Main" ? "MAIN" : "SUB";
  const label = uiTeam === "Main" ? "Chính" : "Phụ";
  const formation = uiTeam === "Main" ? formationCapMain : formationCapSub;

  if(!isCapHlvEditor()){
    showError("Bạn không có quyền chốt đội hình Cáp.");
    return;
  }
  if(matchLocked){
    showError("Trận đã chốt — không chốt đội hình nữa.");
    return;
  }
  if(!lastResult){
    showError("Chưa có đội hình Cáp để chốt.");
    return;
  }
  if(!currentMatchId){
    showError("Chưa có mã trận trên server. Anh Phương cần bấm Gửi HLV trước.");
    return;
  }
  if(!lineupPublishedToHlv){
    showError("Chờ điều phối gửi HLV trước khi chốt.");
    return;
  }
  if(teamConfirmState[uiTeam]){
    showError(`Đội hình ${label} đã chốt.`);
    return;
  }

  const lineup = getTeamLineup(uiTeam);
  if(!lineup?.starters?.length){
    showError(`Đội hình ${label} chưa có cầu thủ ra sân.`);
    return;
  }

  const btn = document.getElementById("btnConfirmCap");
  if(btn){ btn.disabled = true; btn.textContent = "Đang chốt..."; btn.classList.remove("btnDone"); }
  try{
    await setTeamConfirmOnServer(serverTeam, true);
    teamConfirmState[uiTeam] = true;
    persistTeamWorkflowState();
    document.getElementById("textResult").textContent = textResultCap(lastResult);
    document.getElementById("ocrStatus").innerHTML =
      `HLV Cáp đã chốt <b>${label} ${formation}</b>` +
      (teamConfirmState.Main && teamConfirmState.Sub ? " · đủ cả 2 sân." : ".");
    maybeAutoLockFromConfirm();
    showToast(`✓ Đã chốt đội hình ${label}`, "success");
    refreshTeamLineupUI(uiTeam);
    applyLineupRoleUI();
  }catch(e){
    console.error(e);
    showError(e.message || "Không lưu được trạng thái chốt lên server.");
    applyLineupRoleUI();
  }
}

async function confirmCapLineup(){
  clearError();
  if(!isCapHlvEditor()){
    showError("Bạn không có quyền chốt đội hình Cáp.");
    return;
  }
  if(matchLocked){
    showError("Trận đã chốt — không chốt đội hình nữa.");
    return;
  }
  if(!lastResult){
    showError("Chưa có đội hình Cáp để chốt.");
    return;
  }
  if(!currentMatchId){
    showError("Chưa có mã trận trên server. Anh Phương cần bấm Gửi HLV trước.");
    return;
  }
  if(!lineupPublishedToHlv){
    showError("Chờ điều phối gửi HLV trước khi chốt.");
    return;
  }
  if(teamConfirmState.Main && teamConfirmState.Sub){
    showError("Đội hình Cáp đã chốt.");
    return;
  }
  const lineupMain = getTeamLineup("Main");
  const lineupSub = getTeamLineup("Sub");
  if(!lineupMain?.starters?.length || !lineupSub?.starters?.length){
    showError("Cần đủ cầu thủ ra sân cho cả Chính và Phụ.");
    return;
  }

  const btn = document.getElementById("btnConfirmCap");
  if(btn){ btn.disabled = true; btn.textContent = "Đang chốt..."; btn.classList.remove("btnDone"); }
  try{
    await setTeamConfirmOnServer("MAIN", true);
    teamConfirmState.Main = true;
    await setTeamConfirmOnServer("SUB", true);
    teamConfirmState.Sub = true;
    persistTeamWorkflowState();
    document.getElementById("textResult").textContent = textResultCap(lastResult);
    document.getElementById("ocrStatus").innerHTML =
      `HLV Cáp đã chốt <b>Chính ${formationCapMain}</b> · <b>Phụ ${formationCapSub}</b> · đủ cả 2 sân.`;
    maybeAutoLockFromConfirm();
    showToast("✓ Đã chốt đội hình Cáp", "success");
    refreshTeamLineupUI("Main");
    refreshTeamLineupUI("Sub");
    applyLineupRoleUI();
  }catch(e){
    console.error(e);
    teamConfirmState.Main = false;
    teamConfirmState.Sub = false;
    showError(e.message || "Không lưu được đội hình lên server.");
    applyLineupRoleUI();
  }
}

async function setTeamConfirmOnServer(team, confirmed){
  if(!currentMatchId) return;
  const serverTeam = lineupTeamServerKey(team);
  const payload = {
    match_id: currentMatchId,
    team: serverTeam,
    confirmed: !!confirmed
  };
  if(confirmed){
    const capTeam = serverTeam === "MAIN" || serverTeam === "SUB";
    const formation = capTeam
      ? (serverTeam === "MAIN" ? formationCapMain : formationCapSub)
      : (serverTeam === "A" ? formationA : formationB);
    const rows = capTeam ? buildCapTeamLineupRows(serverTeam) : buildTeamLineupRows(serverTeam);
    if(!rows.length) throw new Error(`Đội ${serverTeam} chưa có dữ liệu đội hình để lưu.`);
    payload.formation = formation;
    payload.rows = rows;
  }
  return apiPost("confirm_team_lineup", payload);
}

function setFormation(team, value){
  if(isCapMode()) return;
  if(canSplitTeams() && lineupPublishedToHlv && !matchLocked){
    showError("Đã gửi HLV — không đổi sơ đồ trên màn điều phối.");
    const sel = document.getElementById(team === "A" ? "formationSelectA" : "formationSelectB");
    if(sel) sel.value = team === "A" ? formationA : formationB;
    return;
  }
  if(isHlvPanelTeam(team) && teamConfirmState[team]){
    showError(`Đội ${team} đã chốt — không đổi sơ đồ nữa.`);
    const sel = document.getElementById(team === "A" ? "formationSelectA" : "formationSelectB");
    if(sel) sel.value = team === "A" ? formationA : formationB;
    return;
  }
  if(team === "A" && !canManageTeamA() && !isFullLineupRole()){
    showError("Bạn không có quyền đổi sơ đồ Đội A.");
    return;
  }
  if(team === "B" && !canManageTeamB() && !isFullLineupRole()){
    showError("Bạn không có quyền đổi sơ đồ Đội B.");
    return;
  }
  if(team === "A") formationA = value;
  if(team === "B") formationB = value;

  // Nếu chưa random thì chỉ đổi mặc định, chưa cần render.
  if(!lastResult){
    clearPitch("pitchA");
    clearPitch("pitchB");
    setBench("benchA", []);
    setBench("benchB", []);
    document.getElementById("textResult").textContent = "";
    return;
  }

  if(team === "A" || isFullLineupRole()){
    lastResult.lineupA = build(lastResult.teamA, formationA, "A");
    (lastResult.lineupA.starters || []).forEach(p => { p.hasCustomPosition = false; delete p.customX; delete p.customY; });
    if(teamConfirmState.A){
      teamConfirmState.A = false;
      setTeamConfirmOnServer("A", false).catch(console.error);
    }
  }
  if(team === "B" || isFullLineupRole()){
    lastResult.lineupB = build(lastResult.teamB, formationB, "B");
    (lastResult.lineupB.starters || []).forEach(p => { p.hasCustomPosition = false; delete p.customX; delete p.customY; });
    if(teamConfirmState.B){
      teamConfirmState.B = false;
      setTeamConfirmOnServer("B", false).catch(console.error);
    }
  }
  if(isFullLineupRole()){
    const optimized = evalSplit(lastResult.teamA, lastResult.teamB);
    lastResult.lineupA = optimized.lineupA;
    lastResult.lineupB = optimized.lineupB;
    lastResult.score = optimized.score;
  }
  lineupDragSession = null;
  renderInternalLineups();
  updateResultStats(lastResult, players.filter(p=>p.selected).length);
  document.getElementById("textResult").textContent = textResult(lastResult);
  updateTeamConfirmBadges();
  persistTeamWorkflowState();
  applyLineupRoleUI();
}
