/* Random animation flow */

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
  const overlay = document.getElementById("overlay");

  try{
    const selected = players.filter(p=>p.selected);
    if(selected.length<14){
      showError("Cần tối thiểu 14 cầu thủ để chia đủ 2 đội sân 7.");
      return;
    }

    clearPitch("pitchA");
    clearPitch("pitchB");
    setBench("benchA",[]);
    setBench("benchB",[]);

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
    rolling.innerHTML=`<img src="${escapeAttr(p.avatar)}"><span>${escapeHtml(p.name)}</span>`;
    await wait(120);
  }

  overlay.classList.remove("show");
  syncModalOpenState();
}
