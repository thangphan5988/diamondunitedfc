/* HLV drag-drop lineup editor */

function getLineupTeamMeta(team){
  if(team === "A"){
    return { pitchId: "pitchA", benchId: "benchA", getFormation: () => formationA, teamClass: "redTeam" };
  }
  if(team === "B"){
    return { pitchId: "pitchB", benchId: "benchB", getFormation: () => formationB, teamClass: "yellowTeam" };
  }
  if(team === "Main"){
    return { pitchId: "pitchCapMain", benchId: "benchCapMain", getFormation: () => formationCapMain, teamClass: "capTeam" };
  }
  if(team === "Sub"){
    return { pitchId: "pitchCapSub", benchId: "benchCapSub", getFormation: () => formationCapSub, teamClass: "capSubTeam" };
  }
  return null;
}

function isHlvEditor(){
  return isLoggedIn() && (lineupWorkspace === "hlv_a" || lineupWorkspace === "hlv_b");
}

function isHlvPanelTeam(team){
  if(team === "Main" || team === "Sub") return isCapHlvView();
  if(!isLoggedIn()) return false;
  if(lineupWorkspace === "hlv_a") return team === "A" && canManageTeamA();
  if(lineupWorkspace === "hlv_b") return team === "B" && canManageTeamB();
  return false;
}

function isHlvTeamView(team){
  return isHlvPanelTeam(team) && !!lastResult;
}

function canEditTeamLineup(team){
  if(team === "Main" || team === "Sub"){
    const capDone = team === "Main" ? teamConfirmState.Main : teamConfirmState.Sub;
    return isCapHlvView() && !!lastResult && isCapLineupPublished() && !matchLocked && !capDone;
  }
  if(!isHlvTeamView(team)) return false;
  if(matchLocked || teamConfirmState[team]) return false;
  return true;
}

function getTeamLineup(team){
  if(!lastResult) return null;
  if(team === "A") return lastResult.lineupA;
  if(team === "B") return lastResult.lineupB;
  if(team === "Main") return lastResult.lineupMain || lastResult.lineupA;
  if(team === "Sub") return lastResult.lineupSub || lastResult.lineupB;
  return null;
}

function getStarterCoords(p, indexByPos, formation){
  if(p.hasCustomPosition && Number.isFinite(p.customX) && Number.isFinite(p.customY)){
    return [p.customX, p.customY];
  }
  return getPosCoord(p.assigned, p.assignedSide, indexByPos, formation);
}

function ensureStarterPositions(lineup, formation){
  if(!lineup?.starters?.length) return;
  const slots = slotOrderForFormation(resolveFormation(formation, "3-1-2"));
  const usedSlotIdx = new Set();

  lineup.starters.forEach((p, idx) => {
    if(p.hasCustomPosition) return;
    const pos = normalizePos(p.assigned);
    if(pos && p.assignedSide){
      const matchIdx = slots.findIndex((s, i) => s.pos === pos && s.side === p.assignedSide && !usedSlotIdx.has(i));
      if(matchIdx >= 0) usedSlotIdx.add(matchIdx);
      return;
    }
    if(pos){
      const slotIdx = slots.findIndex((s, i) => s.pos === pos && !usedSlotIdx.has(i));
      if(slotIdx >= 0){
        usedSlotIdx.add(slotIdx);
        p.assignedSide = slots[slotIdx].side;
      }
      return;
    }
    const freeIdx = slots.findIndex((_, i) => !usedSlotIdx.has(i));
    if(freeIdx < 0) return;
    usedSlotIdx.add(freeIdx);
    p.assigned = slots[freeIdx].pos;
    p.assignedSide = slots[freeIdx].side;
  });
}

function clearTeamConfirmAfterEdit(team){
  lineupDragSession = null;
  const uiTeam = lineupTeamUiKey(team);
  if(!teamConfirmState[uiTeam]) return;
  teamConfirmState[uiTeam] = false;
  setTeamConfirmOnServer(lineupTeamServerKey(uiTeam), false).catch(console.error);
  updateTeamConfirmBadges();
  persistTeamWorkflowState();
}

function clearLineupDropHighlights(team){
  const meta = getLineupTeamMeta(team);
  if(!meta) return;
  document.querySelectorAll(`#${meta.pitchId} .slotDropTarget`).forEach(el => el.classList.remove("slotDropTarget"));
  document.querySelectorAll(`#${meta.benchId} .benchDropTarget`).forEach(el => el.classList.remove("benchDropTarget"));
}

function clearLineupSwapGhost(team){
  const meta = getLineupTeamMeta(team);
  if(!meta) return;
  document.querySelectorAll(`#${meta.pitchId} .slotGhost`).forEach(el => el.remove());
  if(lineupDragSession) lineupDragSession.ghostEl = null;
}

function showLineupSwapGhost(team, player, left, top, teamClass){
  const meta = getLineupTeamMeta(team);
  if(!meta) return;
  const pitchId = meta.pitchId;
  const pitch = document.getElementById(pitchId);
  if(!pitch || left == null || top == null) return;
  let ghost = pitch.querySelector(".slotGhost");
  if(!ghost){
    ghost = document.createElement("div");
    ghost.className = "slot show slotGhost";
    pitch.appendChild(ghost);
    if(lineupDragSession) lineupDragSession.ghostEl = ghost;
  }
  ghost.style.left = left;
  ghost.style.top = top;
  ghost.innerHTML = cardHtml(player, teamClass);
}

function assignedFromPitchCoord(x, y){
  let assigned = "FWD";
  if(y >= 76) assigned = "GK";
  else if(y >= 52) assigned = "DEF";
  else if(y >= 28) assigned = "MID";
  const assignedSide = assigned === "GK" ? "CENTER" : (x < 38 ? "LEFT" : x > 62 ? "RIGHT" : "CENTER");
  return { assigned, assignedSide };
}

function updateDraggedCardMeta(el, player, assigned){
  const ppos = el.querySelector(".ppos");
  const fitEl = el.querySelector(".fit");
  if(ppos) ppos.textContent = assigned;
  if(fitEl){
    const f = fit(player, assigned);
    fitEl.textContent = f === 2 ? "✓ Đúng sở trường" : f === 1 ? "↔ Vị trí phụ" : "⚠ Trái vị trí";
  }
}

function benchItemInnerHtml(p){
  return `<span class="benchRating">${p.rating || 5}</span><img src="${escapeAttr(avatarSrc(p.avatar, p.name))}" onerror="this.src='${defaultAvatar(p.name)}'">${escapeHtml(playerDisplayName(p))} · ${p.main}`;
}

function isPointerOnPitch(team, clientX, clientY){
  const meta = getLineupTeamMeta(team);
  const pitch = meta ? document.getElementById(meta.pitchId) : null;
  if(!pitch) return false;
  const r = pitch.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function isPointerOnBenchArea(team, clientX, clientY){
  const meta = getLineupTeamMeta(team);
  const bench = meta ? document.getElementById(meta.benchId) : null;
  if(!bench) return false;
  const r = bench.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function pitchPercentFromClient(team, clientX, clientY){
  const meta = getLineupTeamMeta(team);
  const pitch = meta ? document.getElementById(meta.pitchId) : null;
  if(!pitch) return { x: 50, y: 50 };
  const rect = pitch.getBoundingClientRect();
  const x = Math.max(4, Math.min(96, ((clientX - rect.left) / rect.width) * 100));
  const y = Math.max(4, Math.min(96, ((clientY - rect.top) / rect.height) * 100));
  return { x, y };
}

function applyDragFlyoutBenchVisual(flyout, player){
  flyout.className = "lineupDragFlyout benchItem benchEditable benchDragging";
  flyout.style.width = "auto";
  flyout.style.minWidth = "148px";
  flyout.innerHTML = benchItemInnerHtml(player);
}

function applyDragFlyoutPitchVisual(flyout, player, teamClass, assigned){
  const pos = assigned || player.assigned || player.main || "MID";
  const display = Object.assign({}, player, { assigned: pos, fit: fit(player, pos) });
  flyout.className = "lineupDragFlyout slot show slotDragging";
  flyout.style.width = "83px";
  flyout.style.minWidth = "";
  flyout.innerHTML = cardHtml(display, teamClass);
}

function positionDragFlyout(s, clientX, clientY){
  const fly = s.el;
  fly.style.position = "fixed";
  fly.style.pointerEvents = "none";
  if(s.dragVisual === "pitch"){
    fly.style.left = clientX + "px";
    fly.style.top = clientY + "px";
    fly.style.transform = "translate(-50%, -50%)";
  }else{
    fly.style.left = (clientX - s.offsetX) + "px";
    fly.style.top = (clientY - s.offsetY) + "px";
    fly.style.transform = "";
  }
}

function resolveDragVisual(s, clientX, clientY, target){
  const onPitch = isPointerOnPitch(s.team, clientX, clientY);
  const onBench = isPointerOnBenchArea(s.team, clientX, clientY);
  if(s.kind === "bench"){
    if(target?.type === "starter" || onPitch) return "pitch";
    return "bench";
  }
  if(target?.type === "bench" || (onBench && !onPitch)) return "bench";
  return "pitch";
}

function measureDropDistance(clientX, clientY, el){
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return Math.hypot(clientX - cx, clientY - cy);
}

function findNearestLineupTarget(team, targetKind, clientX, clientY, excludeName){
  const meta = getLineupTeamMeta(team);
  if(!meta) return null;
  const selector = targetKind === "starter"
    ? `#${meta.pitchId} .slotEditable`
    : `#${meta.benchId} .benchEditable`;
  let best = null;
  let bestDist = Infinity;
  document.querySelectorAll(selector).forEach(el => {
    const name = el.dataset.playerName;
    if(!name || name === excludeName) return;
    const dist = measureDropDistance(clientX, clientY, el);
    const r = el.getBoundingClientRect();
    const threshold = Math.max(r.width, r.height) * 0.9;
    if(dist <= threshold && dist < bestDist){
      bestDist = dist;
      best = { type: targetKind, playerName: name, el, dist };
    }
  });
  return best;
}

function pickLineupDropTarget(team, clientX, clientY, excludeName){
  const nearStarter = findNearestLineupTarget(team, "starter", clientX, clientY, excludeName);
  const nearBench = findNearestLineupTarget(team, "bench", clientX, clientY, excludeName);
  if(nearStarter && nearBench){
    return nearStarter.dist <= nearBench.dist ? nearStarter : nearBench;
  }
  return nearStarter || nearBench || null;
}

function updateLineupDropHighlights(team, hit){
  clearLineupDropHighlights(team);
  if(!hit) return;
  if(hit.type === "starter" && hit.el) hit.el.classList.add("slotDropTarget");
  if(hit.type === "bench" && hit.el) hit.el.classList.add("benchDropTarget");
}

function swapStarterSlots(team, nameA, nameB){
  const lineup = getTeamLineup(team);
  if(!lineup) return false;
  const si = lineup.starters.findIndex(p => p.name === nameA);
  const sj = lineup.starters.findIndex(p => p.name === nameB);
  if(si < 0 || sj < 0 || si === sj) return false;
  const a = lineup.starters[si];
  const b = lineup.starters[sj];
  const aMeta = {
    assigned: a.assigned,
    assignedSide: a.assignedSide,
    hasCustomPosition: !!a.hasCustomPosition,
    customX: a.customX,
    customY: a.customY
  };
  const bMeta = {
    assigned: b.assigned,
    assignedSide: b.assignedSide,
    hasCustomPosition: !!b.hasCustomPosition,
    customX: b.customX,
    customY: b.customY
  };
  lineup.starters[si] = Object.assign({}, a, bMeta, { fit: fit(a, b.assigned) });
  lineup.starters[sj] = Object.assign({}, b, aMeta, { fit: fit(b, a.assigned) });
  clearTeamConfirmAfterEdit(team);
  return true;
}

function swapStarterWithBench(team, starterName, benchName){
  const lineup = getTeamLineup(team);
  if(!lineup) return false;
  const si = lineup.starters.findIndex(p => p.name === starterName);
  const bi = lineup.bench.findIndex(p => p.name === benchName);
  if(si < 0 || bi < 0) return false;

  const starter = lineup.starters[si];
  const benchPlayer = lineup.bench[bi];
  const pos = starter.assigned;

  lineup.starters[si] = Object.assign({}, benchPlayer, {
    assigned: starter.assigned,
    assignedSide: starter.assignedSide,
    hasCustomPosition: !!starter.hasCustomPosition,
    customX: starter.hasCustomPosition ? starter.customX : undefined,
    customY: starter.hasCustomPosition ? starter.customY : undefined,
    fit: fit(benchPlayer, pos),
    captain: !!benchPlayer.captain || !!starter.captain
  });

  const toBench = Object.assign({}, starter);
  delete toBench.assigned;
  delete toBench.assignedSide;
  delete toBench.hasCustomPosition;
  delete toBench.customX;
  delete toBench.customY;
  delete toBench.captain;
  lineup.bench[bi] = toBench;

  clearTeamConfirmAfterEdit(team);
  return true;
}

function findLineupPlayer(team, kind, playerName){
  const lineup = getTeamLineup(team);
  if(!lineup) return null;
  const list = kind === "bench" ? lineup.bench : lineup.starters;
  return list.find(p => p.name === playerName) || null;
}

function finishLineupDrag(ev){
  const s = lineupDragSession;
  if(!s) return;
  const dropTarget = s.hoverTarget
    ? { type: s.hoverTargetType, playerName: s.hoverTarget }
    : pickLineupDropTarget(s.team, ev.clientX, ev.clientY, s.playerName);
  let committed = false;
  let toastMsg = "";

  if(dropTarget?.playerName && dropTarget.playerName !== s.playerName){
    if(s.kind === "starter" && dropTarget.type === "starter"){
      committed = swapStarterSlots(s.team, s.playerName, dropTarget.playerName);
      toastMsg = "✓ Đã hoán đổi 2 vị trí trên sân";
    }else if(s.kind === "starter" && dropTarget.type === "bench"){
      committed = swapStarterWithBench(s.team, s.playerName, dropTarget.playerName);
      toastMsg = "✓ Đã hoán đổi ra sân / dự bị";
    }else if(s.kind === "bench" && dropTarget.type === "starter"){
      committed = swapStarterWithBench(s.team, dropTarget.playerName, s.playerName);
      toastMsg = "✓ Đã hoán đổi ra sân / dự bị";
    }
  }else if(s.kind === "starter" && s.moved && isPointerOnPitch(s.team, ev.clientX, ev.clientY) && !dropTarget?.playerName){
    const player = findLineupPlayer(s.team, "starter", s.playerName);
    if(player){
      const pct = pitchPercentFromClient(s.team, ev.clientX, ev.clientY);
      player.customX = Math.round(pct.x * 10) / 10;
      player.customY = Math.round(pct.y * 10) / 10;
      player.hasCustomPosition = true;
      const meta = assignedFromPitchCoord(player.customX, player.customY);
      player.assigned = meta.assigned;
      player.assignedSide = meta.assignedSide;
      player.fit = fit(player, meta.assigned);
      clearTeamConfirmAfterEdit(s.team);
      persistTeamWorkflowState();
      committed = true;
      toastMsg = `✓ Đã đổi vị trí → ${meta.assigned}`;
    }
  }

  clearLineupSwapGhost(s.team);
  clearLineupDropHighlights(s.team);
  if(s.sourceEl){
    s.sourceEl.classList.remove("slotDragging", "benchDragging");
    s.sourceEl.style.visibility = "";
  }
  if(s.el && s.el !== s.sourceEl) s.el.remove();
  if(s.captureEl?.releasePointerCapture) s.captureEl.releasePointerCapture(ev.pointerId);
  window.removeEventListener("pointermove", s.onMove);
  window.removeEventListener("pointerup", s.onUp);
  window.removeEventListener("pointercancel", s.onUp);
  lineupDragSession = null;

  if(committed && toastMsg){
    refreshTeamLineupUI(s.team);
    showToast(toastMsg, toastMsg.includes("→") ? "info" : "success", 2200);
  }else if(s.moved){
    refreshTeamLineupUI(s.team);
  }
}

function moveLineupDrag(ev){
  const s = lineupDragSession;
  if(!s) return;
  s.moved = true;

  const target = s.kind === "starter"
    ? pickLineupDropTarget(s.team, ev.clientX, ev.clientY, s.playerName)
    : findNearestLineupTarget(s.team, "starter", ev.clientX, ev.clientY, null);
  s.hoverTarget = target?.playerName || null;
  s.hoverTargetType = target?.type || null;
  updateLineupDropHighlights(s.team, target);

  const visual = resolveDragVisual(s, ev.clientX, ev.clientY, target);
  let displayAssigned = s.player.assigned || s.player.main || "MID";

  if(visual === "pitch"){
    if(s.kind === "bench" && target?.type === "starter"){
      const sp = findLineupPlayer(s.team, "starter", target.playerName);
      if(sp) displayAssigned = sp.assigned;
    }else if(isPointerOnPitch(s.team, ev.clientX, ev.clientY)){
      const pct = pitchPercentFromClient(s.team, ev.clientX, ev.clientY);
      const meta = assignedFromPitchCoord(pct.x, pct.y);
      displayAssigned = meta.assigned;
      if(s.kind === "starter" && (!target || target.type !== "starter")){
        s.pendingAssigned = meta.assigned;
        s.pendingAssignedSide = meta.assignedSide;
      }
    }
    if(s.dragVisual !== "pitch"){
      applyDragFlyoutPitchVisual(s.el, s.player, s.teamClass, displayAssigned);
      s.dragVisual = "pitch";
    }else if(s.kind === "starter" && target?.type !== "starter"){
      updateDraggedCardMeta(s.el, s.player, displayAssigned);
    }else if(s.kind === "bench"){
      updateDraggedCardMeta(s.el, s.player, displayAssigned);
    }
  }else if(s.dragVisual !== "bench"){
    applyDragFlyoutBenchVisual(s.el, s.player);
    s.dragVisual = "bench";
  }
  positionDragFlyout(s, ev.clientX, ev.clientY);

  if(s.kind === "starter" && target?.type === "bench"){
    const benchPlayer = findLineupPlayer(s.team, "bench", target.playerName);
    if(benchPlayer) showLineupSwapGhost(s.team, benchPlayer, s.originLeft, s.originTop, s.teamClass);
  }else if(s.kind === "bench" && target?.type === "starter"){
    showLineupSwapGhost(s.team, s.player, target.el.style.left, target.el.style.top, s.teamClass);
  }else{
    clearLineupSwapGhost(s.team);
  }
}

function bindLineupDrag(el, team, kind, player){
  const onPointerDown = (e) => {
    if(!canEditTeamLineup(team) || e.button > 0 || lineupDragSession) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const teamClass = getLineupTeamMeta(team)?.teamClass || "redTeam";
    const flyout = document.createElement("div");
    flyout.dataset.playerName = player.name;
    document.body.appendChild(flyout);
    el.style.visibility = "hidden";

    lineupDragSession = {
      team,
      kind,
      playerName: player.name,
      player,
      teamClass,
      sourceEl: el,
      el: flyout,
      captureEl: el,
      dragVisual: kind === "bench" ? "bench" : "pitch",
      moved: false,
      hoverTarget: null,
      hoverTargetType: null,
      pendingAssigned: player.assigned || null,
      pendingAssignedSide: player.assignedSide || null,
      originLeft: kind === "starter" ? el.style.left : null,
      originTop: kind === "starter" ? el.style.top : null,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      onMove: moveLineupDrag,
      onUp: finishLineupDrag
    };

    if(kind === "bench") applyDragFlyoutBenchVisual(flyout, player);
    else applyDragFlyoutPitchVisual(flyout, player, teamClass, player.assigned);
    positionDragFlyout(lineupDragSession, e.clientX, e.clientY);

    if(el.setPointerCapture) el.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", moveLineupDrag);
    window.addEventListener("pointerup", finishLineupDrag);
    window.addEventListener("pointercancel", finishLineupDrag);
  };
  el.addEventListener("pointerdown", onPointerDown);
}

function renderHlvTeamLineupView(team, editable){
  const meta = getLineupTeamMeta(team);
  const lineup = getTeamLineup(team);
  if(!meta) return;
  const pitchId = meta.pitchId;
  const benchId = meta.benchId;
  const safeFormation = resolveFormation(meta.getFormation(), "3-1-2");
  const teamClass = meta.teamClass;
  clearPitch(pitchId);
  if(!lineup?.starters?.length){
    const root = document.getElementById(benchId);
    if(root){
      const msg = lastResult ? "Không có dự bị" : "Chờ điều phối chia đội";
      root.innerHTML = `<div class="benchItem benchEmpty">${msg}</div>`;
    }
    return;
  }

  ensureStarterPositions(lineup, safeFormation);
  clearLineupSwapGhost(team);
  const indexByPos = {};
  lineup.starters.forEach(p => {
    const [x, y] = getStarterCoords(p, indexByPos, safeFormation);
    const el = document.createElement("div");
    el.className = "slot show" + (editable ? " slotEditable" : " slotLocked");
    el.style.left = x + "%";
    el.style.top = y + "%";
    el.dataset.playerName = p.name;
    el.innerHTML = cardHtml(p, teamClass);
    if(editable) bindLineupDrag(el, team, "starter", p);
    document.getElementById(pitchId).appendChild(el);
  });
  setBench(benchId, lineup.bench, editable ? team : null);
  if(editable) clearLineupDropHighlights(team);
}

function refreshTeamLineupUI(team){
  const capTeam = team === "Main" || team === "Sub";
  const useCapHlv = capTeam && canCapHlvEdit() && lineupMode === "cap";
  if(useCapHlv || isHlvPanelTeam(team)){
    renderHlvTeamLineupView(team, canEditTeamLineup(team));
  }else{
    const meta = getLineupTeamMeta(team);
    const lineup = getTeamLineup(team);
    if(meta && lineup){
      renderLineupInstant(meta.pitchId, lineup, meta.getFormation(), meta.teamClass);
      setBench(meta.benchId, lineup.bench);
    }
  }
  if(lastResult){
    const totalSelected = players.filter(p => p.selected).length || getAllMatchPlayers().length;
    if(isCapMode()){
      updateCapResultStats(lastResult);
      document.getElementById("textResult").textContent = textResultCap(lastResult);
    }else{
      updateResultStats(lastResult, totalSelected);
      document.getElementById("textResult").textContent = textResult(lastResult);
    }
  }
  persistTeamWorkflowState();
}
