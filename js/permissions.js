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

function formatMatchDateFromDate(date = new Date()){
  const d = date instanceof Date ? date : new Date(date);
  if(Number.isNaN(d.getTime())) return "";
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function parseMatchDateFromLabel(label){
  const m = String(label || "").match(/Ngày\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if(!m) return "";
  return `${Number(m[1])}/${Number(m[2])}/${m[3]}`;
}

function parseMatchDateFromMatchId(matchId){
  const m = String(matchId || "").match(/^dufc-(\d{4})(\d{2})(\d{2})-/i);
  if(!m) return "";
  return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
}

function setCurrentMatchDate(value){
  const norm = String(value || "").trim();
  currentMatchDate = norm || null;
}

function getMatchDateForSave(){
  if(currentMatchDate) return currentMatchDate;
  const fromLabel = parseMatchDateFromLabel(currentMatchLabel);
  if(fromLabel){
    currentMatchDate = fromLabel;
    return fromLabel;
  }
  const fromId = parseMatchDateFromMatchId(currentMatchId);
  if(fromId){
    currentMatchDate = fromId;
    return fromId;
  }
  return formatMatchDateFromDate(new Date());
}

const MATCH_START_TIME_OPTIONS = [
  { value: "17:00", label: "17h" },
  { value: "17:30", label: "17h30" },
  { value: "18:00", label: "18h" },
  { value: "18:30", label: "18h30" },
  { value: "19:00", label: "19h" },
  { value: "19:30", label: "19h30" },
  { value: "20:00", label: "20h" },
  { value: "20:30", label: "20h30" }
];
const DEFAULT_MATCH_START_TIME = "19:30";

function normalizeMatchStartTime(value){
  const s = String(value || DEFAULT_MATCH_START_TIME).trim();
  if(MATCH_START_TIME_OPTIONS.some(o => o.value === s)) return s;
  return DEFAULT_MATCH_START_TIME;
}

function formatMatchStartTimeLabel(value){
  const normalized = normalizeMatchStartTime(value);
  const found = MATCH_START_TIME_OPTIONS.find(o => o.value === normalized);
  return found?.label || normalized.replace(":", "h");
}

function matchVenueLineHtml(className = "lrVenue"){
  const title = `${MATCH_VENUE.name} (${MATCH_VENUE.address})`;
  return `<div class="${className} meta">Sân Bóng: <a class="lrVenueLink" href="${escapeAttr(MATCH_VENUE.mapsUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></div>`;
}

function initMatchVenueLine(){
  const el = document.getElementById("matchVenueLine");
  if(el) el.innerHTML = matchVenueLineHtml("matchVenueNote");
}

function initMatchStartTimeSelect(){
  const sel = document.getElementById("matchStartTimeSelect");
  if(!sel || sel.options.length) return;
  MATCH_START_TIME_OPTIONS.forEach(opt => {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    sel.appendChild(o);
  });
  setMatchStartTimeSelect(currentMatchStartTime);
}

function getSelectedMatchStartTime(){
  const sel = document.getElementById("matchStartTimeSelect");
  const value = normalizeMatchStartTime(sel?.value || currentMatchStartTime);
  currentMatchStartTime = value;
  return value;
}

function setMatchStartTimeSelect(value){
  const normalized = normalizeMatchStartTime(value);
  currentMatchStartTime = normalized;
  const sel = document.getElementById("matchStartTimeSelect");
  if(sel) sel.value = normalized;
}

function onMatchStartTimeChange(){
  getSelectedMatchStartTime();
  if(!lastResult) return;
  const raw = localStorage.getItem(PENDING_MATCH_KEY);
  if(!raw) return;
  try{
    const saved = JSON.parse(raw);
    if(!saved?.matchId) return;
    saved.matchStartTime = currentMatchStartTime;
    localStorage.setItem(PENDING_MATCH_KEY, JSON.stringify(saved));
  }catch(_e){}
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

  const nextMode = mode === "cap" ? "cap" : "internal";
  if(!silent) lineupModePinned = true;
  lineupMode = nextMode;
  document.getElementById("modeInternal").classList.toggle("active", lineupMode === "internal");
  document.getElementById("modeCap").classList.toggle("active", lineupMode === "cap");

  syncLineupModeButtons();

  document.getElementById("btnRandom").style.display =
    lineupWorkspace === "split" && lineupMode === "internal" && (!isLoggedIn() || canSplitTeams()) && !matchLocked && !lastResult ? "" : "none";
  document.getElementById("btnOptimizeCap").style.display =
    lineupWorkspace === "split" && lineupMode === "cap" && (!isLoggedIn() || canCoordinateCap()) ? "" : "none";

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
  return isLoggedIn() && lineupMode === "cap" && lineupWorkspace === "split" &&
    (isFullLineupRole() || canCoordinateCap());
}

function isCapHlvView(){
  return isLoggedIn() && lineupMode === "cap" && canCapHlvEdit() && lineupWorkspace === "hlv";
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
  return isLoggedIn() && (canCoordinateCap() || canCapHlvEdit());
}

function canUseSplitTab(){
  return isFullLineupRole() || canSplitTeams() || canCoordinateCap() || canImportRoster() ||
    (hasPerm(PERMS.EXPORT) && !canUseHlvTabOnly());
}

function canUseHlvTab(){
  return canManageTeamA() || canManageTeamB() || canCapHlvEdit();
}

function canUseHlvTabOnly(){
  return canUseHlvTab() && !isFullLineupRole() && !canSplitTeams() && !canCoordinateCap() && !canImportRoster();
}

function canUseLineupTab(){
  return canUseSplitTab() || canUseHlvTab();
}

function preferredLineupTab(){
  if(canUseSplitTab()) return "lineup";
  if(canUseHlvTab()) return "hlv";
  return "latest";
}

function enterLineupWorkspace(workspace, silent){
  const next = workspace === "hlv" ? "hlv" : "split";
  lineupWorkspace = next;

  if(next === "hlv"){
    const showInternal = canManageTeamA() || canManageTeamB();
    const showCap = canCapHlvEdit();
    if(lineupMode === "cap" && !showCap && showInternal){
      switchLineupMode("internal", true);
    }else if(lineupMode === "internal" && !showInternal && showCap){
      switchLineupMode("cap", true);
    }else if(showCap && !showInternal){
      switchLineupMode("cap", true);
    }else if(showInternal && !showCap){
      switchLineupMode("internal", true);
    }
  }else{
    const showInternal = isFullLineupRole() || canSplitTeams() || canImportRoster();
    const showCap = isFullLineupRole() || canCoordinateCap();
    // Default Nội bộ when both modes available and no match loaded yet
    if(showInternal && showCap){
      if(!lineupModePinned && !lastResult && lineupMode !== "internal"){
        switchLineupMode("internal", true);
      }
    }else if(lineupMode === "cap" && !showCap && showInternal){
      switchLineupMode("internal", true);
    }else if(lineupMode === "internal" && !showInternal && showCap){
      switchLineupMode("cap", true);
    }
  }

  syncLineupModeButtons();
  applyLineupRoleUI();
}

function syncLineupModeButtons(){
  const modeInternal = document.getElementById("modeInternal");
  const modeCap = document.getElementById("modeCap");
  const modesWrap = document.querySelector(".lineupModes");
  if(!modeInternal || !modeCap) return;

  let showInternal = false;
  let showCap = false;
  if(lineupWorkspace === "hlv"){
    showInternal = canManageTeamA() || canManageTeamB();
    showCap = canCapHlvEdit();
  }else{
    showInternal = isFullLineupRole() || canSplitTeams() || canImportRoster() || canManageTeamA() || canManageTeamB();
    showCap = isFullLineupRole() || canCoordinateCap();
  }

  modeInternal.style.display = showInternal ? "" : "none";
  modeCap.style.display = showCap ? "" : "none";
  if(modesWrap) modesWrap.style.display = (showInternal || showCap) ? "" : "none";
  modeInternal.classList.toggle("active", lineupMode === "internal");
  modeCap.classList.toggle("active", lineupMode === "cap");
}

function getHlvTabLabel(){
  if(!isLoggedIn()) return "HLV";
  const a = canManageTeamA();
  const b = canManageTeamB();
  const cap = canCapHlvEdit();
  const count = [a, b, cap].filter(Boolean).length;
  if(count > 1) return "HLV";
  if(cap) return "HLV Cáp";
  if(a) return "HLV Đội A";
  if(b) return "HLV Đội B";
  return "HLV";
}

function getLineupTabLabel(){
  return "Chia đội";
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

function canManageSponsors(){
  return hasPerm(PERMS.ALL) || hasPerm(PERMS.MANAGE_SPONSORS);
}

function canManageUsers(){
  return hasPerm(PERMS.ALL) || hasPerm(PERMS.MANAGE_USERS);
}

function canAccessAdminTab(){
  return canManageUsers() || canManageRoster() || canManageSponsors();
}

function canFinalizeMatch(){
  return hasPerm(PERMS.ALL) || hasPerm(PERMS.MATCH_RESULT);
}

function isMatchHost(){
  return isLoggedIn() && canSplitTeams() && canFinalizeMatch();
}

function canHostControlMatch(){
  return isLoggedIn() && canFinalizeMatch() && (canSplitTeams() || canCoordinateCap());
}

function canOpenResultEntry(){
  if(!matchLocked || !lastResult) return false;
  if(!isMatchReadyForResults()) return false;
  return canEnterAnyResult() || canFinalizeMatch();
}

function isSplitWorkflow(){
  return isLoggedIn() && lineupWorkspace === "split" &&
    (canSplitTeams() || canCoordinateCap() || isFullLineupRole());
}

function getRoleTaskLabel(){
  if(!isLoggedIn()) return "";
  if(lineupWorkspace === "hlv"){
    if(canCapHlvEdit() && isCapMode()){
      if(isMatchReadyForResults()) return "⚽ Nhập kết quả trận Cáp";
      if(matchLocked && bothTeamsConfirmed()) return "⚽ Đã chốt đội hình — nhập kết quả sau trận";
      if(!isCapLineupPublished()) return "⏳ Chờ Host gửi đội hình Cáp (bấm Gửi HLV)";
      return "⚽ Kéo thả Chính/Phụ → Chốt đội hình Cáp";
    }
    if(canManageTeamA() && canResultTeamA() && !canManageTeamB()) return "🔴 Chốt đội hình → Sau trận: nhập tỉ số & điểm Đội A → Xác nhận";
    if(canManageTeamB() && canResultTeamB() && !canManageTeamA()) return "🟡 Chốt đội hình → Sau trận: nhập tỉ số & điểm Đội B → Xác nhận";
    if(canManageTeamA() && !canManageTeamB()) return "🔴 Chọn sơ đồ · Kéo thả · Hoán đổi dự bị → Chốt";
    if(canManageTeamB() && !canManageTeamA()) return "🟡 Chọn sơ đồ · Kéo thả · Hoán đổi dự bị → Chốt";
    if(canManageTeamA() || canManageTeamB()) return "⚽ Chỉnh đội hình HLV → Chốt";
    return "HLV";
  }
  if(hasPerm(PERMS.ALL)) return "⚙️ Toàn quyền quản lý trận";
  if(isMatchHost() && isCapMode()) return "📋 Host Cáp: Gửi HLV → HLV chốt hoặc bạn Chốt trận → Nhập KQ";
  if(isMatchHost()) return "📋 Host: Gửi HLV → HLV chốt hoặc bạn Chốt trận → Nhập KQ";
  if(canSplitTeams() && canImportRoster()) return "📋 Random → Gửi HLV → Chốt trận / Lưu ảnh Zalo";
  if(canCoordinateCap() && isCapMode() && isMatchReadyForResults() && canFinalizeMatch()){
    return "📋 Host Cáp: nhập & Xác nhận trận đấu (không cần HLV nhập KQ)";
  }
  if(canCoordinateCap() && isCapMode()) return "📋 Import → Sắp Cáp → Gửi HLV → Chốt trận / Lưu ảnh Zalo";
  return permLabelList(authSession.permissions);
}
