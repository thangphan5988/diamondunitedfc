/* MVP / rating / goals rankings */

let currentStatsTab = "mvp";

function switchStatsTab(tab){
  currentStatsTab = tab;
  const panels = {
    mvp: "statPanelMvp",
    rating: "statPanelRating",
    goals: "statPanelGoals",
    assists: "statPanelAssists"
  };
  const tabs = {
    mvp: "statTabMvp",
    rating: "statTabRating",
    goals: "statTabGoals",
    assists: "statTabAssists"
  };
  Object.keys(panels).forEach(key => {
    const panel = document.getElementById(panels[key]);
    const btn = document.getElementById(tabs[key]);
    if(panel) panel.style.display = key === tab ? "" : "none";
    if(btn) btn.classList.toggle("active", key === tab);
  });
}

async function renderStats(){
  const mvpEl = document.getElementById("mvpRanking");
  const ratingEl = document.getElementById("ratingRanking");
  const goalsEl = document.getElementById("goalsRanking");
  const assistsEl = document.getElementById("assistsRanking");
  if(!mvpEl || !ratingEl || !goalsEl || !assistsEl) return;

  const loading = `<div class="meta">Đang tải...</div>`;
  if(!players.length){
    const empty = `<div class="meta">Chưa có dữ liệu thành viên.</div>`;
    mvpEl.innerHTML = empty;
    ratingEl.innerHTML = empty;
    goalsEl.innerHTML = empty;
    assistsEl.innerHTML = empty;
    return;
  }

  goalsEl.innerHTML = loading;
  assistsEl.innerHTML = loading;

  const statMap = new Map();
  let statsError = null;
  try{
    const data = await apiGet("get_player_stats");
    (data.stats || []).forEach(s => {
      statMap.set(normalizeName(s.player_name), {
        goals: Number(s.goals) || 0,
        assists: Number(s.assists) || 0
      });
    });
  }catch(e){
    console.error(e);
    statsError = e.message || "Không tải được thống kê BT/KT.";
  }

  const enriched = publicPlayers().map(p => {
    const totals = statMap.get(normalizeName(p.name)) || { goals: 0, assists: 0 };
    return Object.assign({}, p, {
      total_goals: totals.goals,
      total_assists: totals.assists
    });
  });

  const byMvp = [...enriched].sort((a, b) => {
    const diff = (Number(b.mvp_count) || 0) - (Number(a.mvp_count) || 0);
    return diff || a.name.localeCompare(b.name, "vi");
  });

  const byRating = [...enriched].sort((a, b) => {
    const diff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
    return diff || a.name.localeCompare(b.name, "vi");
  });

  const byGoals = [...enriched].sort((a, b) => {
    const diff = (Number(b.total_goals) || 0) - (Number(a.total_goals) || 0);
    return diff || a.name.localeCompare(b.name, "vi");
  });

  const byAssists = [...enriched].sort((a, b) => {
    const diff = (Number(b.total_assists) || 0) - (Number(a.total_assists) || 0);
    return diff || a.name.localeCompare(b.name, "vi");
  });

  mvpEl.innerHTML = byMvp.map((p, i) => statRowHtml(p, i + 1, "mvp")).join("");
  ratingEl.innerHTML = byRating.map((p, i) => statRowHtml(p, i + 1, "rating")).join("");
  if(statsError){
    const err = `<div class="error" style="display:block">${escapeHtml(statsError)}</div>`;
    goalsEl.innerHTML = err;
    assistsEl.innerHTML = err;
  }else{
    goalsEl.innerHTML = byGoals.map((p, i) => statRowHtml(p, i + 1, "goals")).join("");
    assistsEl.innerHTML = byAssists.map((p, i) => statRowHtml(p, i + 1, "assists")).join("");
  }
}
