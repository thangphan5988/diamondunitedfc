/* Publish, export image, save history */

async function publishLineupDraft(){
  clearError();
  const capFlow = isCapMode();
  if(!isLoggedIn() || (!canSplitTeams() && !(capFlow && canCoordinateCap()))){
    showError(capFlow ? "Bạn cần quyền điều phối đội hình Cáp." : "Bạn cần quyền random chia đội.");
    return;
  }
  if(!lastResult){
    showError(capFlow ? "Chưa có đội hình Cáp. Import và sắp xếp trước." : "Chưa có kết quả chia đội. Bấm Random trước.");
    return;
  }
  if(matchLocked){
    showError("Trận đã xuất ảnh — không gửi lại được.");
    return;
  }
  if(lineupPublishedToHlv){
    showToast("✓ Đã gửi HLV rồi", "info");
    return;
  }
  const btnPublish = document.getElementById("btnPublish");
  if(btnPublish){ btnPublish.disabled = true; btnPublish.textContent = "Đang gửi..."; btnPublish.classList.remove("btnDone"); }
  try{
    if(capFlow){
      teamConfirmState.Main = false;
      teamConfirmState.Sub = false;
    }
    const saved = await saveMatchHistoryToServer({
      status: "lineup_published",
      team_a_lineup_confirmed: capFlow ? false : teamConfirmState.A,
      team_b_lineup_confirmed: capFlow ? false : teamConfirmState.B
    });
    currentMatchId = saved.matchId;
    currentMatchLabel = saved.matchLabel;
    lineupPublishedToHlv = true;
    persistTeamWorkflowState();
    finishPendingMatchRestore(capFlow ? "đã gửi HLV Cáp" : "đã gửi cho HLV", { lock: false, status: "lineup_published" });
    showToast(capFlow ? "✓ Đã gửi HLV Cáp" : "✓ Đã gửi HLV", "success");
    applyLineupRoleUI();
    startConfirmPolling();
  }catch(e){
    console.error(e);
    showError(e.message || "Không gửi được đội hình lên server.");
    applyLineupRoleUI();
  }
}

async function syncLineupToServer(){
  if(!currentMatchId || !lastResult || matchLocked) return;
  if(!canManageTeamA() && !canManageTeamB() && !canSplitTeams() && !isFullLineupRole()) return;
  try{
    await saveMatchHistoryToServer({
      status: "lineup_published",
      matchId: currentMatchId,
      matchLabel: currentMatchLabel,
      team_a_lineup_confirmed: teamConfirmState.A,
      team_b_lineup_confirmed: teamConfirmState.B
    });
  }catch(e){
    console.error("syncLineupToServer:", e);
  }
}

async function forceConfirmAndExport(){
  clearError();
  if(!isLoggedIn() || !canSplitTeams() || !hasPerm(PERMS.EXPORT)){
    showError("Chỉ Anh Phương (điều phối) mới dùng được Chốt & xuất hình.");
    return;
  }
  if(matchLocked){
    if(currentImageFilename) openResultModal();
    else showError("Trận đã khóa.");
    return;
  }
  if(!lastResult || !currentMatchId){
    showError("Chưa có đội hình trên server. Cần Gửi HLV trước.");
    return;
  }
  if(!lineupPublishedToHlv){
    showError("Cần bấm Gửi HLV trước khi chốt & xuất hình.");
    return;
  }
  const btn = document.getElementById("btnForceExport");
  if(btn){ btn.disabled = true; btn.textContent = "Đang chốt..."; }
  try{
    await refreshTeamConfirmFromServer();
    for(const team of ["A", "B"]){
      if(!teamConfirmState[team]){
        await setTeamConfirmOnServer(team, true);
        teamConfirmState[team] = true;
      }
    }
    updateTeamConfirmBadges();
    persistTeamWorkflowState();
    maybeAutoLockFromConfirm();
    showToast("✓ Đã chốt cả 2 đội — đang xuất hình...", "info", 2800);
    await exportImage({ skipConfirmCheck: true });
  }catch(e){
    console.error(e);
    showError(e.message || "Không chốt & xuất hình được.");
    applyLineupRoleUI();
  }
}

async function exportImage(options = {}){
  if(!isLoggedIn() || !hasPerm(PERMS.EXPORT)){
    showError("Bạn cần quyền xuất ảnh & lưu đội hình.");
    return;
  }
  if(currentImageFilename){
    if(canEnterAnyResult()) openResultModal();
    else showToast("Đã xuất hình — chờ người có quyền nhập kết quả.", "info", 3200);
    return;
  }
  if(!lastResult){
    alert("Chưa có kết quả để xuất hình.");
    return;
  }
  if(!options.skipConfirmCheck && !bothTeamsConfirmed()){
    showError(isCapMode()
      ? "Chờ HLV Cáp chốt đội hình trước khi xuất hình."
      : "Chờ 2 HLV chốt đội hình trước khi xuất hình.");
    return;
  }

  const source = document.getElementById("exportArea");
  const text = document.getElementById("textResult");
  const oldDisplay = text.style.display;
  text.style.display = "none";

  let cloneWrap = null;

  const now = new Date();
  const stamp = `${now.getDate()}-${now.getMonth()+1}`;
  const filename = `diamondunitedfc-${stamp}.png`;

  try{
    cloneWrap = document.createElement("div");
    cloneWrap.style.position = "fixed";
    cloneWrap.style.left = "-99999px";
    cloneWrap.style.top = "0";
    cloneWrap.style.width = source.offsetWidth + "px";
    cloneWrap.style.background = "#0f172a";
    cloneWrap.style.padding = "0";
    cloneWrap.style.zIndex = "-1";

    const clone = source.cloneNode(true);
    clone.id = "exportAreaClone";
    cloneWrap.appendChild(clone);
    document.body.appendChild(cloneWrap);

    await makeImagesExportSafe(clone);

    const canvas = await html2canvas(clone, {
      backgroundColor: "#0f172a",
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 8000
    });

    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();

    const savedMatch = await saveMatchHistoryToServer({
      imageFilename: filename,
      status: "lineup_exported",
      matchId: currentMatchId,
      matchLabel: currentMatchLabel
    });
    lockMatchState(savedMatch.matchId, savedMatch.matchLabel, filename);
    document.getElementById("ocrStatus").innerHTML =
      `Đã xuất hình trận <b>${displayMatchLabel()}</b>. Có thể nhập kết quả sau trận.`;
    showToast("✓ Đã xuất hình & khóa trận", "success");
    updateLockBannerContent();
    applyLineupRoleUI();
  }catch(e){
    console.error(e);
    alert("Không xuất được hình hoặc chưa lưu được lịch sử. Chi tiết lỗi đã hiện trong Console.");
  }finally{
    if(cloneWrap) cloneWrap.remove();
    text.style.display = oldDisplay;
  }
}


async function makeImagesExportSafe(root){
  const imgs = Array.from(root.querySelectorAll("img"));

  await Promise.all(imgs.map(async img => {
    const originalSrc = img.getAttribute("src") || "";
    try{
      if(!originalSrc || originalSrc.startsWith("data:")) return;

      const absoluteUrl = new URL(originalSrc, window.location.href).href;
      const res = await fetch(absoluteUrl, {mode:"cors", cache:"force-cache"});
      if(!res.ok) throw new Error("image fetch failed");

      const blob = await res.blob();
      const dataUrl = await blobToDataURL(blob);
      img.setAttribute("src", dataUrl);
      img.removeAttribute("srcset");
      img.crossOrigin = "anonymous";
    }catch(e){
      const fallbackText =
        img.closest(".cardPlayer")?.querySelector(".pname")?.textContent ||
        img.closest(".benchItem")?.textContent ||
        "DUFC";
      img.setAttribute("src", fallbackAvatarDataURL(fallbackText));
      img.removeAttribute("srcset");
    }
  }));

  await Promise.all(imgs.map(img => {
    if(img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
      setTimeout(resolve, 1200);
    });
  }));
}

function blobToDataURL(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function fallbackAvatarDataURL(text){
  const clean = String(text || "DUFC").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const label = escapeHtml(clean.split(/\s+/).map(x=>x[0] || "").join("").slice(0,2).toUpperCase() || "D");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
    <rect width="100%" height="100%" rx="40" fill="#0f172a"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
      font-family="Arial" font-size="22" font-weight="700" fill="#ffffff">${label}</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}


async function saveMatchHistoryToServer(options = {}){
  if(!lastResult) throw new Error("Chưa có kết quả chia đội.");

  if(!MATCH_HISTORY_WEB_APP_URL){
    throw new Error("API chưa được cấu hình.");
  }

  const imageFilename = options.imageFilename || "";
  const status = options.status || "lineup_exported";
  const now = new Date();
  const matchId = options.matchId || currentMatchId || generateMatchId(now);
  const cap = isCapMode();
  const matchLabel = options.matchLabel || currentMatchLabel || (cap ? formatCapMatchLabel(now) : formatMatchLabel(now));

  const rows = [];

  function addTeamRows(teamName, shirt, lineup, formation){
    lineup.starters.forEach((p, index) => {
      rows.push({
        match_id: matchId,
        match_date: `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`,
        created_at: now.toISOString(),
        team: teamName,
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
        image_filename: imageFilename,
        status
      });
    });

    lineup.bench.forEach((p, index) => {
      rows.push({
        match_id: matchId,
        match_date: `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`,
        created_at: now.toISOString(),
        team: teamName,
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
        image_filename: imageFilename,
        status
      });
    });
  }

  if(cap){
    const lineupMain = lastResult.lineupMain || lastResult.lineupA;
    const lineupSub = lastResult.lineupSub || lastResult.lineupB;
    addTeamRows("MAIN", "Chính", lineupMain, formationCapMain);
    lineupSub.starters.forEach((p, index) => {
      rows.push({
        match_id: matchId,
        match_date: `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`,
        created_at: now.toISOString(),
        team: "SUB",
        shirt: "Phụ",
        formation: formationCapSub,
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
        captain: false,
        image_filename: imageFilename,
        status
      });
    });
  }else{
    addTeamRows("A", "Áo Đỏ", lastResult.lineupA, formationA);
    addTeamRows("B", "Áo Vàng", lastResult.lineupB, formationB);
  }

  await apiPost("save_match_history", {
    spreadsheet_id: "1Ffv-98Ld8jW2AKu-1NmGXFbhsuWJogw83F5p0q0HRGU",
    sheet_gid: "228928781",
    match_id: matchId,
    match_label: matchLabel,
    match_type: cap ? "cap" : "internal",
    formation_a: cap ? formationCapMain : formationA,
    formation_b: cap ? formationCapSub : formationB,
    status,
    image_filename: imageFilename,
    team_a_lineup_confirmed: options.team_a_lineup_confirmed != null
      ? options.team_a_lineup_confirmed
      : (cap ? teamConfirmState.Main : teamConfirmState.A),
    team_b_lineup_confirmed: options.team_b_lineup_confirmed != null
      ? options.team_b_lineup_confirmed
      : (cap ? teamConfirmState.Sub : teamConfirmState.B),
    rows
  });

  if(status === "lineup_exported"){
    document.getElementById("ocrStatus").innerHTML =
      `Đã xuất ảnh và lưu lịch sử trận <b>${matchLabel}</b>. Nhập kết quả bên dưới.`;
  }

  return { matchId, matchLabel, status };
}
