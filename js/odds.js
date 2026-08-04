/* So kèo — frontend */

const ODDS_API = typeof API_BASE_URL !== "undefined" ? API_BASE_URL : "https://api.diamondunitedfc.com";

const ODDS_LEAGUES = [
  { key: "all", label: "Tất cả" },
  { key: "soccer_epl", label: "EPL" },
  { key: "soccer_spain_la_liga", label: "La Liga" },
  { key: "soccer_italy_serie_a", label: "Serie A" },
  { key: "soccer_germany_bundesliga", label: "Bundesliga" },
  { key: "soccer_france_ligue_one", label: "Ligue 1" },
  { key: "soccer_uefa_champs_league", label: "C1" }
];

let oddsState = {
  league: "all",
  window: "14d",
  data: null,
  openId: "",
  loading: false
};

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatOdds(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function formatPoint(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  if (v > 0) return `+${v}`;
  return String(v);
}

function formatKickoff(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

async function oddsFetch(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`${ODDS_API}?${qs.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `Lỗi so kèo (${res.status})`);
  return data;
}

function bestValues(rows, keys) {
  const best = {};
  for (const key of keys) {
    let max = -Infinity;
    for (const row of rows) {
      const v = Number(row[key]);
      if (Number.isFinite(v) && v > max) max = v;
    }
    best[key] = Number.isFinite(max) && max > -Infinity ? max : null;
  }
  return best;
}

function h2hTable(rows) {
  if (!rows?.length) return `<div class="oddsEmpty">Chưa có kèo 1X2.</div>`;
  const best = bestValues(rows, ["home", "draw", "away"]);
  const body = rows.map((r) => `<tr>
    <td class="oddsBook">${esc(r.book_label || r.book)}</td>
    <td class="${best.home != null && r.home === best.home ? "is-best" : ""}">${esc(formatOdds(r.home))}</td>
    <td class="${best.draw != null && r.draw === best.draw ? "is-best" : ""}">${esc(formatOdds(r.draw))}</td>
    <td class="${best.away != null && r.away === best.away ? "is-best" : ""}">${esc(formatOdds(r.away))}</td>
  </tr>`).join("");
  return `<div class="oddsTableWrap"><table class="oddsTable">
    <thead><tr><th>Nhà cái</th><th>Chủ</th><th>Hòa</th><th>Khách</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function ahTable(rows) {
  if (!rows?.length) return `<div class="oddsEmpty">Chưa có kèo Châu Á.</div>`;
  const best = bestValues(rows, ["home", "away"]);
  const body = rows.map((r) => `<tr>
    <td class="oddsBook">${esc(r.book_label || r.book)}</td>
    <td class="${best.home != null && r.home === best.home ? "is-best" : ""}">${esc(formatPoint(r.home_point))} ${esc(formatOdds(r.home))}</td>
    <td class="${best.away != null && r.away === best.away ? "is-best" : ""}">${esc(formatPoint(r.away_point))} ${esc(formatOdds(r.away))}</td>
  </tr>`).join("");
  return `<div class="oddsTableWrap"><table class="oddsTable">
    <thead><tr><th>Nhà cái</th><th>Chủ (AH)</th><th>Khách (AH)</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function ouTable(rows) {
  if (!rows?.length) return `<div class="oddsEmpty">Chưa có kèo Tài/Xỉu.</div>`;
  const best = bestValues(rows, ["over", "under"]);
  const body = rows.map((r) => `<tr>
    <td class="oddsBook">${esc(r.book_label || r.book)}</td>
    <td>${esc(formatPoint(r.point) || "—")}</td>
    <td class="${best.over != null && r.over === best.over ? "is-best" : ""}">${esc(formatOdds(r.over))}</td>
    <td class="${best.under != null && r.under === best.under ? "is-best" : ""}">${esc(formatOdds(r.under))}</td>
  </tr>`).join("");
  return `<div class="oddsTableWrap"><table class="oddsTable">
    <thead><tr><th>Nhà cái</th><th>Mốc</th><th>Tài</th><th>Xỉu</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function matchCard(m) {
  const open = oddsState.openId === m.id ? " is-open" : "";
  const markets = m.markets || {};
  return `<article class="oddsMatch${open}" data-id="${esc(m.id)}">
    <button type="button" class="oddsMatchHead" data-toggle="${esc(m.id)}">
      <div>
        <div class="oddsMatchMeta">
          <span class="oddsBadge">${esc(m.league_short || m.league_label || m.league)}</span>
          <span class="oddsTime">${esc(formatKickoff(m.commence_time))}</span>
        </div>
        <div class="oddsTeams">${esc(m.home)} <span>vs</span> ${esc(m.away)}</div>
      </div>
      <span class="oddsChevron" aria-hidden="true">▾</span>
    </button>
    <div class="oddsMatchBody">
      <div class="oddsMarket"><h3>1X2</h3>${h2hTable(markets.h2h)}</div>
      <div class="oddsMarket"><h3>Châu Á</h3>${ahTable(markets.ah)}</div>
      <div class="oddsMarket"><h3>Tài / Xỉu</h3>${ouTable(markets.ou)}</div>
    </div>
  </article>`;
}

function renderFilters() {
  const root = document.getElementById("oddsLeagueFilters");
  if (!root) return;
  root.innerHTML = ODDS_LEAGUES.map((l) =>
    `<button type="button" class="oddsChip${oddsState.league === l.key ? " active" : ""}" data-league="${esc(l.key)}">${esc(l.label)}</button>`
  ).join("");

  document.querySelectorAll("[data-window]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-window") === oddsState.window);
  });
}

function render() {
  renderFilters();
  const status = document.getElementById("oddsStatus");
  const list = document.getElementById("oddsList");
  if (!list) return;
  const data = oddsState.data;
  if (!data) {
    list.innerHTML = `<div class="oddsEmpty">Chưa có dữ liệu.</div>`;
    return;
  }
  if (status) {
    const updated = data.updated_at
      ? `Cập nhật ${esc(String(data.updated_at).replace("T", " ").slice(0, 16))} · ${data.count || 0} trận`
      : `${data.count || 0} trận`;
    status.textContent = updated;
  }
  if (data.empty || !(data.matches || []).length) {
    list.innerHTML = `<div class="oddsEmpty">${esc(data.message || "Chưa có trận trong khung giờ đã chọn.")}</div>`;
    return;
  }
  list.innerHTML = data.matches.map(matchCard).join("");
  bindMatchToggles();
}

function bindMatchToggles() {
  document.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-toggle");
      oddsState.openId = oddsState.openId === id ? "" : id;
      if (oddsState.openId && typeof trackOddsEvent === "function") {
        trackOddsEvent("expand", { match_id: id });
      }
      render();
    };
  });
}

async function loadOdds() {
  if (oddsState.loading) return;
  oddsState.loading = true;
  const list = document.getElementById("oddsList");
  if (list) list.innerHTML = `<div class="oddsLoading">Đang tải tỷ lệ kèo...</div>`;
  try {
    const params = { window: oddsState.window };
    if (oddsState.league && oddsState.league !== "all") params.league = oddsState.league;
    const data = await oddsFetch("odds_hub", params);
    oddsState.data = data;
    render();
  } catch (err) {
    if (list) list.innerHTML = `<div class="oddsError">${esc(err.message || "Không tải được so kèo.")}</div>`;
  } finally {
    oddsState.loading = false;
  }
}

function bindOddsUi() {
  document.getElementById("oddsLeagueFilters")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-league]");
    if (!btn) return;
    oddsState.league = btn.getAttribute("data-league") || "all";
    oddsState.openId = "";
    if (typeof trackOddsEvent === "function") trackOddsEvent("filter_league", { league: oddsState.league });
    loadOdds();
  });

  document.querySelectorAll("[data-window]").forEach((btn) => {
    btn.addEventListener("click", () => {
      oddsState.window = btn.getAttribute("data-window") || "48h";
      oddsState.openId = "";
      if (typeof trackOddsEvent === "function") trackOddsEvent("filter_window", { window: oddsState.window });
      loadOdds();
    });
  });

  document.getElementById("oddsRefresh")?.addEventListener("click", () => {
    if (typeof trackOddsEvent === "function") trackOddsEvent("refresh");
    loadOdds();
  });

  document.getElementById("oddsThemeBtn")?.addEventListener("click", () => {
    if (typeof toggleTheme === "function") toggleTheme();
    else {
      const root = document.documentElement;
      const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      if (next === "light") root.setAttribute("data-theme", "light");
      else root.removeAttribute("data-theme");
      try { localStorage.setItem("dufc_theme", next); } catch (_) {}
    }
  });
}

function initOddsPage() {
  bindOddsUi();
  renderFilters();
  loadOdds();
}

document.addEventListener("DOMContentLoaded", initOddsPage);
