/* Pitch render, cards, cap lineups */

function renderInternalLineups(){
  if(!lastResult || isCapMode()) return;
  if(isHlvPanelTeam("A")) refreshTeamLineupUI("A");
  else if(lastResult.lineupA) {
    renderLineupInstant("pitchA", lastResult.lineupA, formationA, "redTeam");
    setBench("benchA", lastResult.lineupA.bench);
  }
  if(isHlvPanelTeam("B")) refreshTeamLineupUI("B");
  else if(lastResult.lineupB) {
    renderLineupInstant("pitchB", lastResult.lineupB, formationB, "yellowTeam");
    setBench("benchB", lastResult.lineupB.bench);
  }
}

function renderLineupInstant(pitchId, lineup, formation, teamClass){
  if(!lineup?.starters?.length) return;
  clearPitch(pitchId);
  const safeFormation = resolveFormation(formation, "3-1-2");
  ensureStarterPositions(lineup, safeFormation);
  const indexByPos = {};
  for(const p of lineup.starters){
    const [x,y] = getStarterCoords(p, indexByPos, safeFormation);
    const el = document.createElement("div");
    el.className = "slot show";
    el.style.left = x + "%";
    el.style.top = y + "%";
    el.innerHTML = cardHtml(p, teamClass);
    document.getElementById(pitchId).appendChild(el);
  }
}

async function revealBothLineups(lineupA, lineupB){
  const indexA = {};
  const indexB = {};

  const captainA = lineupA.starters.find(p => p.captain);
  const captainB = lineupB.starters.find(p => p.captain);

  // Random hiện 2 đội trưởng trước.
  if(captainA){
    await addPlayerToPitch("pitchA", captainA, indexA, formationA, "redTeam");
    await wait(1100);
  }
  if(captainB){
    await addPlayerToPitch("pitchB", captainB, indexB, formationB, "yellowTeam");
    await wait(1300);
  }

  const restA = lineupA.starters.filter(p => !p.captain);
  const restB = lineupB.starters.filter(p => !p.captain);
  const max = Math.max(restA.length, restB.length);

  // Sau đội trưởng, lần lượt bốc thành viên Đội A rồi Đội B.
  for(let i = 0; i < max; i++){
    if(restA[i]){
      await addPlayerToPitch("pitchA", restA[i], indexA, formationA, "redTeam");
      await wait(760);
    }

    if(restB[i]){
      await addPlayerToPitch("pitchB", restB[i], indexB, formationB, "yellowTeam");
      await wait(920);
    }
  }
}

async function addPlayerToPitch(pitchId, p, indexByPos, formation, teamClass){
  const [x,y] = getPosCoord(p.assigned, p.assignedSide, indexByPos, formation);
  const el = document.createElement("div");
  el.className = "slot";
  el.style.left = x + "%";
  el.style.top = y + "%";
  el.innerHTML = cardHtml(p, teamClass);
  document.getElementById(pitchId).appendChild(el);
  await wait(80);
  el.classList.add("show");
}

function getPosCoord(assigned, assignedSide, indexByPos, formation, coordsMap){
  const safeFormation = resolveFormation(formation, "3-1-2");
  const pos = normalizePos(assigned || "MID");
  const coords = coordsMap || FORMATION_COORDS;
  const coordsByPos = (coords[safeFormation] && coords[safeFormation][pos]) || [];
  const slotsByPos = FORMATIONS[safeFormation].filter(slot => slot.pos === pos);

  const key = pos + "_" + (assignedSide || "ANY");
  const currentIndex = indexByPos[key] || 0;

  // Nếu có nhiều slot cùng pos + same side, ví dụ 2-3-1 có DEF CENTER + DEF CENTER,
  // lấy tọa độ theo thứ tự để không bị chồng lên nhau.
  if(assignedSide){
    const matchingIndexes = [];
    slotsByPos.forEach((slot, idx) => {
      if(slot.side === assignedSide) matchingIndexes.push(idx);
    });

    if(matchingIndexes.length > 1){
      const coordIndex = matchingIndexes[Math.min(currentIndex, matchingIndexes.length - 1)];
      indexByPos[key] = currentIndex + 1;
      if(coordsByPos[coordIndex]) return coordsByPos[coordIndex];
    }

    if(matchingIndexes.length === 1 && coordsByPos[matchingIndexes[0]]){
      indexByPos[key] = currentIndex + 1;
      return coordsByPos[matchingIndexes[0]];
    }
  }

  // Fallback nếu thiếu assignedSide.
  const fallbackKey = pos + "_fallback";
  const idx = indexByPos[fallbackKey] || 0;
  indexByPos[fallbackKey] = idx + 1;
  return coordsByPos[Math.min(idx, coordsByPos.length - 1)] || [50,50];
}
function cardHtml(p, teamClass){
  const fitClass = p.fit === 2 ? "fitOk" : p.fit === 1 ? "fitAlt" : "fitBad";
  const fitText = p.fit === 2 ? "✓ Đúng sở trường" : p.fit === 1 ? "↔ Vị trí phụ" : "⚠ Trái vị trí";
  return `<div class="cardPlayer ${teamClass || ""} ${p.captain ? "captainCard" : ""}"><img src="${escapeAttr(avatarSrc(p.avatar, p.name))}" onerror="this.src='${defaultAvatar(p.name)}'"><div class="pname">${escapeHtml(playerDisplayName(p))}</div><div class="ppos">${p.assigned}</div><div class="fit ${fitClass}">${fitText}</div>${p.captain ? '<div class="captainBadge">C</div>' : ''}<div class="ratingBadge">${p.rating || 5}</div></div>`;
}
function setBench(id,bench,editTeam){
  const root = document.getElementById(id);
  if(!bench.length){
    root.innerHTML = `<div class="benchItem">Không có dự bị</div>`;
    return;
  }
  root.innerHTML = bench.map(p => {
    const editable = editTeam && canEditTeamLineup(editTeam);
    const cls = editable ? "benchItem benchEditable" : "benchItem";
    const attrs = editable ? ` data-player-name="${escapeAttr(p.name)}"` : "";
    return `<div class="${cls}"${attrs}><span class="benchRating">${p.rating || 5}</span><img src="${escapeAttr(avatarSrc(p.avatar, p.name))}">${escapeHtml(playerDisplayName(p))} · ${p.main}</div>`;
  }).join("");
  if(editTeam && canEditTeamLineup(editTeam)){
    root.querySelectorAll(".benchEditable").forEach(el => {
      const player = bench.find(p => p.name === el.dataset.playerName);
      if(player) bindLineupDrag(el, editTeam, "bench", player);
    });
  }
}
function clearPitch(id){
  [...document.getElementById(id).querySelectorAll(".slot")].forEach(x=>x.remove());
}
function updateStats(){
  const selectedCount = players.filter(p => p.selected).length;
  document.getElementById("total").textContent = players.length;
  document.getElementById("selected").textContent = selectedCount;
  document.getElementById("totalCap").textContent = players.length;
  document.getElementById("selectedCap").textContent = selectedCount;
}

function resetCapLineupDraftState(){
  lineupPublishedToHlv = false;
  teamConfirmState.Main = false;
  teamConfirmState.Sub = false;
}

function maybeAutoOptimizeCapAfterImport(){
  if(lineupMode !== "cap" || matchLocked || !canCoordinateCap()) return false;
  const selected = players.filter(p => p.selected);
  if(selected.length < 5 || !hasRequiredPositions(selected)) return false;
  const capPoolLimit = window.MAX_LINEUP_DP_POOL || 18;
  if(selected.length > capPoolLimit){
    showError(`Chọn tối đa ${capPoolLimit} cầu thủ đá Cáp, rồi bấm "Sắp xếp đội hình tối ưu".`);
    return false;
  }
  setTimeout(() => {
    if(lineupMode !== "cap" || matchLocked) return;
    try{
      lastResult = optimizeCapDual(selected);
      lastResult.matchMode = "cap";
      renderCapLineups(lastResult);
      updateCapResultStats(lastResult);
      document.getElementById("textResult").textContent = textResultCap(lastResult);
      applyLineupRoleUI();
      showToast("✓ Đã sắp xếp đội hình Cáp — bấm Gửi HLV", "success");
    }catch(e){
      console.error(e);
      showError(e.message || "Có lỗi khi sắp xếp đội hình Cáp.");
      applyLineupRoleUI();
    }
  }, 0);
  return true;
}

function renderCapLineups(result){
  const r = result || lastResult;
  if(!r) return;
  if(isCapHlvView() || (canCapHlvEdit() && lineupMode === "cap" && isCapLineupPublished())){
    refreshTeamLineupUI("Main");
    refreshTeamLineupUI("Sub");
    return;
  }
  const lineupMain = r.lineupMain || r.lineupA || { starters: [], bench: [] };
  const lineupSub = r.lineupSub || r.lineupB || { starters: [], bench: [] };
  clearPitch("pitchCapMain");
  clearPitch("pitchCapSub");
  renderLineupInstant("pitchCapMain", lineupMain, formationCapMain, "capTeam");
  renderLineupInstant("pitchCapSub", lineupSub, formationCapSub, "capSubTeam");
  setBench("benchCapMain", lineupMain.bench);
  setBench("benchCapSub", lineupSub.bench);
}

function updateCapResultStats(r){
  const pool = r.teamCap || r.teamMain || r.teamA || [];
  const lineupMain = r.lineupMain || r.lineupA || {starters: [], score: 0};
  const lineupSub = r.lineupSub || r.lineupB || {starters: [], score: 0};
  document.getElementById("selectedCap").textContent = pool.length;
  document.getElementById("sizesCap").textContent = `${lineupMain.starters.length} / ${lineupSub.starters.length}`;
  document.getElementById("scoreCap").textContent = r.score ?? 0;
  document.getElementById("scoreCapMain").textContent =
    `score ${lineupMain.score ?? 0} · ${lineupMain.starters.length} RS`;
  document.getElementById("scoreCapSub").textContent =
    `score ${lineupSub.score ?? 0} · ${lineupSub.starters.length} RS`;
}

function textResultCap(r){
  function block(title, lineup, formation){
    const starters = (lineup.starters || []).map(p =>
      `${p.assigned}${p.assignedSide ? " " + sideLabel(p.assignedSide) : ""}: ${p.name}${p.captain ? " (Đội trưởng)" : ""}`
    ).join("\n");
    const bench = lineup.bench?.length
      ? lineup.bench.map(p => `${p.name} (${p.main})`).join(", ")
      : "Không có";
    return `${title} (${formation})\nĐội hình ra sân:\n${starters}\nDự bị: ${bench}`;
  }

  const lineupMain = r.lineupMain || r.lineupA || { starters: [], bench: [] };
  const lineupSub = r.lineupSub || r.lineupB || { starters: [], bench: [] };
  const sharedGk = lineupMain.starters.find(p => p.assigned === "GK" && lineupSub.starters.some(s => s.name === p.name));
  const gkNote = sharedGk ? `\n(GK chung: ${sharedGk.name})\n` : "";
  return `SƠ ĐỒ RA SÂN: ${formationCapMain} · SƠ ĐỒ PHỤ: ${formationCapSub}${gkNote}\n` +
    block("⚽ ĐỘI HÌNH RA SÂN", lineupMain, formationCapMain) + "\n\n" +
    block("🔄 ĐỘI HÌNH PHỤ (dự bị Chính ưu tiên)", lineupSub, formationCapSub);
}

async function startOptimizeCap(){
  clearError();
  if(!isLoggedIn() || !canCoordinateCap()){
    showError("Bạn cần quyền điều phối đội hình Cáp.");
    return;
  }
  if(lineupMode !== "cap"){
    showError("Chuyển sang chế độ Đội hình đá Cáp để sắp xếp.");
    return;
  }
  if(matchLocked){
    showError("Đang chờ kết quả trận trước. Nhập kết quả trước khi lên đội hình mới.");
    return;
  }

  try{
    const selected = players.filter(p => p.selected);
    if(selected.length < 5){
      showError("Cần tối thiểu 5 cầu thủ để lên đội hình Cáp.");
      return;
    }
    if(!hasRequiredPositions(selected)){
      showError("Danh sách cần có đủ GK, DEF, MID, FWD (có thể cùng 1 người đá nhiều vị trí).");
      return;
    }
    const capPoolLimit = window.MAX_LINEUP_DP_POOL || 18;
    if(selected.length > capPoolLimit){
      showError(`Chọn tối đa ${capPoolLimit} cầu thủ đá Cáp (bỏ tick người không đá).`);
      return;
    }

    resetCapLineupDraftState();
    lastResult = optimizeCapDual(selected);
    lastResult.matchMode = "cap";
    renderCapLineups(lastResult);
    updateCapResultStats(lastResult);
    document.getElementById("textResult").textContent = textResultCap(lastResult);
    applyLineupRoleUI();
    showToast("✓ Đã sắp xếp đội hình Cáp — bấm Gửi HLV", "success");
  }catch(e){
    console.error(e);
    showError(e.message || "Có lỗi khi sắp xếp đội hình Cáp.");
    applyLineupRoleUI();
  }
}

function setCapFormation(team, value){
  if(canCoordinateCap() && !isCapHlvEditor() && lineupPublishedToHlv && !matchLocked){
    showError("Đã gửi HLV — không đổi sơ đồ trên màn điều phối.");
    const sel = document.getElementById(team === "main" ? "formationSelectCapMain" : "formationSelectCapSub");
    if(sel) sel.value = team === "main" ? formationCapMain : formationCapSub;
    return;
  }
  if(isCapHlvEditor()){
    const uiTeam = team === "main" ? "Main" : "Sub";
    if(teamConfirmState[uiTeam]){
      showError(`Đội hình ${team === "main" ? "ra sân" : "Phụ"} đã chốt — không đổi sơ đồ nữa.`);
      const sel = document.getElementById(team === "main" ? "formationSelectCapMain" : "formationSelectCapSub");
      if(sel) sel.value = team === "main" ? formationCapMain : formationCapSub;
      return;
    }
  }
  if(team === "main") formationCapMain = value;
  if(team === "sub") formationCapSub = value;
  if(!lastResult || !isCapMode()) return;

  const pool = lastResult.teamCap || lastResult.teamMain || lastResult.teamA || players.filter(p => p.selected);

  if(isCapHlvEditor()){
    if(team === "main"){
      lastResult.lineupMain = build(pool, formationCapMain);
      (lastResult.lineupMain.starters || []).forEach(p => {
        p.hasCustomPosition = false;
        delete p.customX;
        delete p.customY;
      });
    }else{
      const estimateMain = lastResult.lineupMain || build(pool, formationCapMain);
      const benchNames = new Set((estimateMain.bench || []).map(p => normalizeName(p.name)));
      const mainStarterNames = new Set((estimateMain.starters || []).map(p => normalizeName(p.name)));
      lastResult.lineupSub = buildSubLineup(pool, formationCapSub, benchNames, mainStarterNames, estimateMain);
    }
    renderCapLineups(lastResult);
    updateCapResultStats(lastResult);
    document.getElementById("textResult").textContent = textResultCap(lastResult);
    return;
  }

  Object.assign(lastResult, optimizeCapDual(pool));
  renderCapLineups(lastResult);
  updateCapResultStats(lastResult);
  document.getElementById("textResult").textContent = textResultCap(lastResult);
}
function updateResultStats(r,totalSelected){
  document.getElementById("selected").textContent=totalSelected;
  document.getElementById("sizes").textContent=`${r.teamA.length} - ${r.teamB.length}`;
  document.getElementById("score").textContent=r.score;
  document.getElementById("scoreA").textContent=`score ${r.lineupA.score} · rating ${sumRating(r.teamA)}`;
  document.getElementById("scoreB").textContent=`score ${r.lineupB.score} · rating ${sumRating(r.teamB)}`;
}
function textResult(r){
  function block(title,l){
    return `${title}\nĐội hình ra sân:\n${l.starters.map(p=>`${p.assigned}${p.assignedSide ? " " + sideLabel(p.assignedSide) : ""}: ${p.name}${p.captain ? " (Đội trưởng)" : ""}`).join("\n")}\nDự bị: ${l.bench.length?l.bench.map(p=>`${p.name} (${p.main})`).join(", "):"Không có"}`;
  }
  return `SƠ ĐỒ ĐỘI A: ${formationA}\nSƠ ĐỒ ĐỘI B: ${formationB}\n\n` + block("🔴 ĐỘI A (ÁO ĐỎ)",r.lineupA)+"\n\n"+block("🟡 ĐỘI B (ÁO VÀNG)",r.lineupB);
}

function updateLineupSegVisibility(wrap){
  if(!wrap) return;
  const seg = wrap.querySelector(".lmTeamSeg");
  const visible = [...wrap.querySelectorAll(".lmTeamPanel[data-lm-team]")].filter(p => p.style.display !== "none");
  if(seg) seg.style.display = visible.length >= 2 ? "" : "none";
  wrap._lmApply?.();
}

function setLineupTeamFocus(team){
  const wrapId = team === "Main" || team === "Sub" ? "capTeamsWrap" : "internalTeamsWrap";
  const wrap = document.getElementById(wrapId);
  if(!wrap) return;
  const seg = wrap.querySelector(".lmTeamSeg");
  const btn = seg?.querySelector(`.lmSegBtn[data-team="${team}"]`);
  if(btn){
    seg.querySelectorAll(".lmSegBtn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }
  wrap._lmApply?.();
}

function initLineupTeamSwitchers(){
  ["internalTeamsWrap", "capTeamsWrap"].forEach(id => {
    const wrap = document.getElementById(id);
    if(!wrap) return;
    initLmTeamSwitcher(wrap);
    updateLineupSegVisibility(wrap);
  });
}

function syncFormationSeg(ctrl, value){
  if(!ctrl) return;
  ctrl.querySelectorAll(".formationSegBtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
}

function syncAllFormationSegs(){
  document.querySelectorAll(".formationControl").forEach(ctrl => {
    const sel = ctrl.querySelector("select");
    if(!sel) return;
    syncFormationSeg(ctrl, sel.value);
    ctrl.querySelectorAll(".formationSegBtn").forEach(btn => {
      btn.disabled = sel.disabled;
    });
  });
}

function initFormationSegControls(){
  document.querySelectorAll(".formationControl").forEach(ctrl => {
    const sel = ctrl.querySelector("select");
    if(!sel || ctrl.querySelector(".formationSeg")) return;

    const seg = document.createElement("div");
    seg.className = "formationSeg";
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", ctrl.querySelector("label")?.textContent || "Sơ đồ");

    [...sel.options].forEach(opt => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "formationSegBtn";
      btn.textContent = opt.value;
      btn.dataset.value = opt.value;
      if(opt.selected) btn.classList.add("active");
      btn.addEventListener("click", () => {
        if(sel.disabled || sel.value === opt.value) return;
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", {bubbles: true}));
        syncFormationSeg(ctrl, opt.value);
      });
      seg.appendChild(btn);
    });

    sel.insertAdjacentElement("afterend", seg);
    sel.addEventListener("change", () => syncFormationSeg(ctrl, sel.value));
  });
  syncAllFormationSegs();
}
