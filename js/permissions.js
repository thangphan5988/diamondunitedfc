/* Auth helpers, role checks, labels */

function formatMatchLabel(date = new Date()){
  const d = date instanceof Date ? date : new Date(date);
  const weekday = WEEKDAYS_VI[d.getDay()];
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `DUFC - ${weekday} Ngày ${day}/${month}/${year}`;
}

function formatCapMatchLabel(date = new Date()){
  const d = date instanceof Date ? date : new Date(date);
  const weekday = WEEKDAYS_VI[d.getDay()];
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `DUFC Cáp - ${weekday} Ngày ${day}/${month}/${year}`;
}

function getMatchMode(){
  return lastResult?.matchMode || lineupMode || "internal";
}

function isCapMode(){
  return getMatchMode() === "cap";
}

function switchLineupMode(mode, silent){
  if(isLoggedIn()){
    if(mode === "cap" && !canManageCapLineup() && !isFullLineupRole()){
      showError("Tài khoản không có quyền đội hình Cáp.");
      return;
    }
    if(mode !== "cap" && !isFullLineupRole() && !canSplitTeams() && !canManageTeamA() && !canManageTeamB()){
      showError("Tài khoản không có quyền chia đội nội bộ.");
      return;
    }
  }
  if(matchLocked && mode !== lineupMode){
    showError("Đang chờ kết quả trận. Hoàn tất trước khi đổi chế độ.");
    return;
  }

  lineupMode = mode === "cap" ? "cap" : "internal";
  document.getElementById("modeInternal").classList.toggle("active", lineupMode === "internal");
  document.getElementById("modeCap").classList.toggle("active", lineupMode === "cap");

  document.getElementById("btnRandom").style.display =
    lineupMode === "internal" && (!isLoggedIn() || hasPerm(PERMS.LINEUP_INTERNAL)) ? "" : "none";
  document.getElementById("btnOptimizeCap").style.display =
    lineupMode === "cap" && (!isLoggedIn() || canCoordinateCap()) ? "" : "none";

  document.getElementById("summaryInternal").style.display = lineupMode === "internal" ? "" : "none";
  document.getElementById("summaryCap").style.display = lineupMode === "cap" ? "" : "none";
  document.getElementById("internalTeamsWrap").style.display = lineupMode === "internal" ? "" : "none";
  document.getElementById("capTeams").style.display = lineupMode === "cap" ? "" : "none";

  document.getElementById("playerCardTitle").textContent =
    lineupMode === "cap" ? "1. Chọn cầu thủ đá Cáp" : "1. Danh sách thành viên";

  if(!silent && !matchLocked){
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
  }

  updateStats();
  applyLineupRoleUI();
  if(lineupMode === "cap" && lastResult){
    renderCapLineups(lastResult);
    updateCapResultStats(lastResult);
  }
}

function generateMatchId(date = new Date()){
  const d = date instanceof Date ? date : new Date(date);
  const pad = n => String(n).padStart(2, "0");
  return `dufc-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function displayMatchLabel(match){
  if(match) return match.match_label || match.matchLabel || match.match_id || match.match_date || "";
  return currentMatchLabel || currentMatchId || "";
}

function isLoggedIn(){
  return !!(authSession && authSession.token);
}

function hasPerm(perm){
  if(!authSession || !authSession.permissions) return false;
  const list = authSession.permissions;
  return list.includes(PERMS.ALL) || list.includes(perm);
}

function isFullLineupRole(){
  return hasPerm(PERMS.ALL) || hasPerm(PERMS.LINEUP_INTERNAL);
}

function canImportRoster(){
  return isFullLineupRole() || hasPerm(PERMS.ROSTER_IMPORT) || hasPerm(PERMS.LINEUP_SPLIT);
}

function canSplitTeams(){
  return isFullLineupRole() || hasPerm(PERMS.LINEUP_SPLIT);
}

function canManageTeamA(){
  return isFullLineupRole() || hasPerm(PERMS.LINEUP_TEAM_A);
}

function canManageTeamB(){
  return isFullLineupRole() || hasPerm(PERMS.LINEUP_TEAM_B);
}

function canCoordinateCap(){
  return isFullLineupRole() || hasPerm(PERMS.LINEUP_CAP) ||
    (canSplitTeams() && hasPerm(PERMS.EXPORT));
}

function canCapHlvEdit(){
  return hasPerm(PERMS.LINEUP_CAP_HLV);
}

function canManageCapLineup(){
  return canCoordinateCap() || canCapHlvEdit();
}

function isCapCoordinatorView(){
  return isLoggedIn() && lineupMode === "cap" &&
    (isFullLineupRole() || (canCoordinateCap() && (canImportRoster() || canSplitTeams())));
}

function isCapHlvView(){
  return isLoggedIn() && lineupMode === "cap" && canCapHlvEdit() && !isCapCoordinatorView();
}

function isCapLineupPublished(){
  return lineupPublishedToHlv;
}

function isServerLineupPublished(summary){
  const status = String(summary?.status || "").toLowerCase();
  return status === "lineup_published" || status === "lineup_exported";
}

function isCapHlvEditor(){
  return isCapHlvView();
}

function isCapWorkflow(){
  return isLoggedIn() && (canCoordinateCap() || isCapHlvEditor());
}

function canResultTeamA(){
  return hasPerm(PERMS.ALL) || hasPerm(PERMS.MATCH_RESULT) || hasPerm(PERMS.MATCH_RESULT_A);
}

function canResultTeamB(){
  return hasPerm(PERMS.ALL) || hasPerm(PERMS.MATCH_RESULT) || hasPerm(PERMS.MATCH_RESULT_B);
}

function canResultCap(){
  return hasPerm(PERMS.ALL) || hasPerm(PERMS.LINEUP_CAP_HLV) || canFinalizeMatch();
}

function isCapHlvResultOnly(){
  return isLoggedIn() && isCapMode() && canCapHlvEdit() && !canFinalizeMatch();
}

function capHlvResultConfirmed(){
  return !!teamResultSaved.A;
}

function canEnterAnyResult(){
  return canResultTeamA() || canResultTeamB() || canResultCap();
}

function canManageRoster(){
  return hasPerm(PERMS.ALL) || hasPerm(PERMS.MANAGE_ROSTER);
}

function canManageUsers(){
  return hasPerm(PERMS.ALL) || hasPerm(PERMS.MANAGE_USERS);
}

function canAccessAdminTab(){
  return canManageUsers() || canManageRoster();
}

function canFinalizeMatch(){
  return hasPerm(PERMS.ALL) || hasPerm(PERMS.MATCH_RESULT);
}

function isMatchHost(){
  return isLoggedIn() && canSplitTeams() && canFinalizeMatch();
}

function isSplitWorkflow(){
  return isLoggedIn() && !isFullLineupRole() &&
    (canSplitTeams() || canManageTeamA() || canManageTeamB());
}

function getLineupTabLabel(){
  if(!isLoggedIn()) return "Chia đội";
  if(canCapHlvEdit() && !canManageTeamA() && !canManageTeamB() && !canSplitTeams() && !isFullLineupRole()){
    return "HLV Cáp";
  }
  if(canManageTeamA() && !canManageTeamB() && !canSplitTeams() && !isFullLineupRole()){
    return "HLV Đội A";
  }
  if(canManageTeamB() && !canManageTeamA() && !canSplitTeams() && !isFullLineupRole()){
    return "HLV Đội B";
  }
  return "Chia đội";
}

function getRoleTaskLabel(){
  if(!isLoggedIn()) return "";
  if(hasPerm(PERMS.ALL)) return "⚙️ Toàn quyền quản lý trận";
  if(isMatchHost() && isCapMode()) return "📋 Host Cáp: Import → Sắp Cáp → Gửi HLV → Xuất hình → Chờ HLV xác nhận KQ → Xác nhận trận";
  if(isMatchHost()) return "📋 Host: Random → Gửi HLV → Xuất hình → Chờ 2 HLV xác nhận KQ → Xác nhận trận đấu";
  if(canSplitTeams() && canImportRoster()) return "📋 Random → Gửi HLV → Chờ 2 HLV chốt → Xuất hình (hoặc Chốt & xuất hình)";
  if(canManageTeamA() && canResultTeamA() && !canManageTeamB()) return "🔴 Chốt đội hình → Sau trận: nhập tỉ số & điểm Đội A → Xác nhận";
  if(canManageTeamB() && canResultTeamB() && !canManageTeamA()) return "🟡 Chốt đội hình → Sau trận: nhập tỉ số & điểm Đội B → Xác nhận";
  if(canManageTeamA() && !canManageTeamB()) return "🔴 Chọn sơ đồ · Kéo thả · Hoán đổi dự bị → Chốt";
  if(canManageTeamB() && !canManageTeamA()) return "🟡 Chọn sơ đồ · Kéo thả · Hoán đổi dự bị → Chốt";
  if(canCoordinateCap() && isCapMode() && matchLocked && currentImageFilename && canFinalizeMatch()){
    return capHlvResultConfirmed()
      ? "📋 Host Cáp: chỉnh tỉ số/tên đội nếu cần → Xác nhận trận đấu"
      : "📋 Host Cáp: chờ HLV Cáp xác nhận KQ → Xác nhận trận đấu";
  }
  if(isCapHlvEditor() && isCapMode()){
    if(matchLocked && currentImageFilename) return "⚽ Nhập KQ → Xác nhận HLV Cáp (chờ Host chốt trận)";
    if(matchLocked && bothTeamsConfirmed()) return "⚽ Đã chốt đội hình — chờ xuất hình rồi nhập kết quả";
    if(!isCapLineupPublished()) return "⏳ Chờ Host gửi đội hình Cáp (bấm Gửi HLV)";
    return "⚽ Kéo thả Chính/Phụ → Chốt đội hình Cáp";
  }
  if(canCoordinateCap() && isCapMode()) return "📋 Import → Sắp Cáp → Gửi HLV → Chờ HLV chốt → Xuất hình";
  return permLabelList(authSession.permissions);
}
