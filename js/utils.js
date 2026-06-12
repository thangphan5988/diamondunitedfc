/* Shared utilities: toast, escape, wait */

function lineupTeamServerKey(team){
  const t = String(team || "").trim();
  if(t === "Main") return "MAIN";
  if(t === "Sub") return "SUB";
  return t.toUpperCase();
}

function lineupTeamUiKey(team){
  const t = String(team || "").trim().toUpperCase();
  if(t === "MAIN") return "Main";
  if(t === "SUB") return "Sub";
  return team;
}

function wait(ms){return new Promise(r=>setTimeout(r,ms))}
let toastSeq = 0;
function showToast(message, type = "success", duration = 3500){
  const stack = document.getElementById("toastStack");
  if(!stack || !message) return;
  const el = document.createElement("div");
  el.className = "toast " + (type || "success");
  el.textContent = message;
  stack.appendChild(el);
  while(stack.children.length > 4) stack.firstChild?.remove();
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    el.style.transition = "all .2s ease";
    setTimeout(() => el.remove(), 220);
  }, duration);
}
function showError(msg){
  const e=document.getElementById("error");
  e.textContent=msg;
  e.style.display="block";
  showToast(msg, "error", 4500);
}
function clearError(){const e=document.getElementById("error");e.textContent="";e.style.display="none"}

function dismissLineupDragLayers(){
  document.querySelectorAll(".lineupDragFlyout").forEach(el => el.remove());
  document.querySelectorAll(".slotDragging, .benchDragging").forEach(el => {
    el.classList.remove("slotDragging", "benchDragging");
    el.style.visibility = "";
  });
  if(typeof lineupDragSession !== "undefined") lineupDragSession = null;
}

function syncModalOpenState(){
  const open = !!document.querySelector(".confirmModal.show, .overlay.show");
  document.body.classList.toggle("modal-open", open);
  if(open) dismissLineupDragLayers();
}
function escapeHtml(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function escapeAttr(s){return escapeHtml(s)}

function normalizeVideoUrlInput(value){
  return String(value || "").trim();
}

function isLikelyVideoUrl(value){
  const s = normalizeVideoUrlInput(value);
  return !s || /^https?:\/\/.+/i.test(s);
}

function parseGoalVideoUrlsInput(value){
  if(value == null) return [];
  if(Array.isArray(value)) return value.map(u => normalizeVideoUrlInput(u)).filter(Boolean);
  const s = normalizeVideoUrlInput(value);
  if(!s) return [];
  if(s.startsWith("[")){
    try{
      const arr = JSON.parse(s);
      if(Array.isArray(arr)) return arr.map(u => normalizeVideoUrlInput(u)).filter(Boolean);
    }catch(e){ /* legacy */ }
  }
  return [s];
}

function normalizeGoalVideoUrlsForSave(value, maxGoals){
  let urls = parseGoalVideoUrlsInput(value);
  const n = Math.max(0, Math.round(Number(maxGoals) || 0));
  urls = urls.slice(0, n).map(u => normalizeVideoUrlInput(u)).filter(Boolean);
  return urls;
}
