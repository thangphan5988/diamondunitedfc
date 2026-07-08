/* Random animation flow + captain pick before split */

let captainPickResolve = null;

function selectedHasDefaultCaptain(selected, captainName){
  const key = normalizeName(captainName);
  return selected.some(p => normalizeName(p.name) === key);
}

function needsCaptainPickBeforeRandom(selected){
  return !selectedHasDefaultCaptain(selected, DEFAULT_CAPTAIN_A) ||
    !selectedHasDefaultCaptain(selected, DEFAULT_CAPTAIN_B);
}

function findSelectedPlayerByName(selected, name){
  const key = normalizeName(name);
  return selected.find(p => normalizeName(p.name) === key) || null;
}

function setMatchCaptainsFromSelected(selected){
  const capA = findSelectedPlayerByName(selected, DEFAULT_CAPTAIN_A);
  const capB = findSelectedPlayerByName(selected, DEFAULT_CAPTAIN_B);
  matchCaptains = {
    A: capA?.name || null,
    B: capB?.name || null
  };
}

function captainPickOptionsHtml(selected){
  return selected
    .slice()
    .sort((a, b) => playerDisplayName(a).localeCompare(playerDisplayName(b), "vi"))
    .map(p => `<option value="${escapeAttr(p.name)}">${escapeHtml(playerDisplayName(p))} · ${escapeHtml(p.main)} · ⭐${Number(p.rating) || 5}</option>`)
    .join("");
}

function openCaptainPickModal(selected){
  return new Promise(resolve => {
    captainPickResolve = resolve;
    const modal = document.getElementById("captainPickModal");
    const selA = document.getElementById("captainPickA");
    const selB = document.getElementById("captainPickB");
    const hint = document.getElementById("captainPickHint");
    const err = document.getElementById("captainPickError");
    if(!modal || !selA || !selB) return resolve(null);

    const hasDefaultA = selectedHasDefaultCaptain(selected, DEFAULT_CAPTAIN_A);
    const hasDefaultB = selectedHasDefaultCaptain(selected, DEFAULT_CAPTAIN_B);
    const missing = [];
    if(!hasDefaultA) missing.push("Thang Phan (Đội A)");
    if(!hasDefaultB) missing.push("Minh Phat (Đội B)");
    if(hint){
      hint.textContent = missing.length
        ? `Thiếu ${missing.join(" · ")} — chọn đội trưởng mỗi đội trước khi random.`
        : "Chọn đội trưởng mỗi đội trước khi random.";
    }

    const options = captainPickOptionsHtml(selected);
    selA.innerHTML = options;
    selB.innerHTML = options;

    const defaultA = findSelectedPlayerByName(selected, DEFAULT_CAPTAIN_A);
    const defaultB = findSelectedPlayerByName(selected, DEFAULT_CAPTAIN_B);
    if(defaultA) selA.value = defaultA.name;
    if(defaultB) selB.value = defaultB.name;
    if(selA.value && selA.value === selB.value){
      const alt = selected.find(p => normalizeName(p.name) !== normalizeName(selA.value));
      if(alt) selB.value = alt.name;
    }

    if(err) err.style.display = "none";
    modal.classList.add("show");
    syncModalOpenState();
  });
}

function closeCaptainPickModal(){
  const modal = document.getElementById("captainPickModal");
  if(modal) modal.classList.remove("show");
  syncModalOpenState();
  if(captainPickResolve){
    captainPickResolve(null);
    captainPickResolve = null;
  }
}

function confirmCaptainPick(){
  const selA = document.getElementById("captainPickA");
  const selB = document.getElementById("captainPickB");
  const err = document.getElementById("captainPickError");
  const captainA = String(selA?.value || "").trim();
  const captainB = String(selB?.value || "").trim();

  if(!captainA || !captainB){
    if(err){
      err.textContent = "Chọn đội trưởng cho cả 2 đội.";
      err.style.display = "block";
    }
    return;
  }
  if(normalizeName(captainA) === normalizeName(captainB)){
    if(err){
      err.textContent = "Đội trưởng 2 đội phải là 2 người khác nhau.";
      err.style.display = "block";
    }
    return;
  }

  const modal = document.getElementById("captainPickModal");
  if(modal) modal.classList.remove("show");
  syncModalOpenState();
  if(captainPickResolve){
    captainPickResolve({ captainA, captainB });
    captainPickResolve = null;
  }
}

async function runRandomSplit(selected){
  const overlay = document.getElementById("overlay");

  clearPitch("pitchA");
  clearPitch("pitchB");
  setBench("benchA", []);
  setBench("benchB", []);

  await suspense(selected);
  await wait(60);

  lastResult = randomBest(selected);
  if(!lastResult){
    throw new Error("Không tìm được phương án chia đội phù hợp.");
  }
  lastResult.matchMode = "internal";
  teamConfirmState = { A: false, B: false };
  teamResultSaved = { A: false, B: false };
  lineupPublishedToHlv = false;
  currentMatchId = null;
  persistTeamWorkflowState();

  updateResultStats(lastResult, selected.length);
  await revealBothLineups(lastResult.lineupA, lastResult.lineupB);
  setBench("benchA", lastResult.lineupA.bench);
  setBench("benchB", lastResult.lineupB.bench);
  document.getElementById("textResult").textContent = textResult(lastResult);
  applyLineupRoleUI();
  showToast("✓ Đã random chia 2 đội — bấm Gửi HLV", "success");
}

async function startRandom(){
  clearError();
  if(!isLoggedIn() || !canSplitTeams()){
    showError("Bạn cần quyền random chia đội.");
    return;
  }
  if(lineupMode !== "internal"){
    showError("Chuyển sang chế độ Chia đội Nội bộ để random.");
    return;
  }
  if(matchLocked){
    showError("Đang chờ kết quả trận trước. Nhập kết quả trước khi chia đội mới.");
    return;
  }

  const selected = players.filter(p => p.selected);
  if(selected.length < 14){
    showError("Cần tối thiểu 14 cầu thủ để chia đủ 2 đội sân 7.");
    return;
  }

  const overlay = document.getElementById("overlay");
  try{
    if(needsCaptainPickBeforeRandom(selected)){
      const picked = await openCaptainPickModal(selected);
      if(!picked){
        return;
      }
      matchCaptains = { A: picked.captainA, B: picked.captainB };
    }else{
      setMatchCaptainsFromSelected(selected);
    }

    await runRandomSplit(selected);
  }catch(e){
    console.error(e);
    showError(e.message || "Có lỗi khi chia đội.");
  }finally{
    overlay.classList.remove("show");
    syncModalOpenState();
  }
}

async function suspense(list){
  const overlay=document.getElementById("overlay"), count=document.getElementById("count"), rolling=document.getElementById("rolling");
  overlay.classList.add("show");
  syncModalOpenState();

  const seq=["3","2","1","DUFC!"];
  for(const x of seq){
    count.textContent=x;
    rolling.innerHTML="";
    await wait(650);
  }

  const end=Date.now()+1200;
  while(Date.now()<end){
    const p=list[Math.floor(Math.random()*list.length)];
    count.textContent="Đang chia đội...";
    rolling.innerHTML=`<img src="${escapeAttr(avatarSrc(p.avatar, p.name))}"><span>${escapeHtml(playerDisplayName(p))}</span>`;
    await wait(120);
  }

  overlay.classList.remove("show");
  syncModalOpenState();
}
