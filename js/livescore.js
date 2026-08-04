/* Livescore + so kèo — 1 trang: list trận, xổ kèo nếu có data */

const LS_API = typeof API_BASE_URL !== "undefined" ? API_BASE_URL : "https://api.diamondunitedfc.com";

const LS_LEAGUES = [
  { key: "all", label: "Tất cả", emoji: "🌐" },
  { key: "soccer_epl", label: "Ngoại hạng Anh", short: "EPL", flag: "gb-eng" },
  { key: "soccer_spain_la_liga", label: "La Liga", short: "La Liga", flag: "es" },
  { key: "soccer_italy_serie_a", label: "Serie A", short: "Serie A", flag: "it" },
  { key: "soccer_germany_bundesliga", label: "Bundesliga", short: "Bundesliga", flag: "de" },
  { key: "soccer_france_ligue_one", label: "Ligue 1", short: "Ligue 1", flag: "fr" },
  { key: "soccer_uefa_champs_league", label: "Champions League", short: "C1", emoji: "🏆" },
  { key: "soccer_japan_j_league", label: "J League", short: "J League", flag: "jp" },
  { key: "soccer_korea_kleague1", label: "K League 1", short: "K League", flag: "kr" },
  { key: "soccer_china_superleague", label: "Chinese Super League", short: "CSL", flag: "cn" }
];

let lsState = {
  league: "all",
  window: "14d",
  matches: [],
  openId: "",
  loading: false,
  updatedAt: "",
  stale: false,
  statusNote: ""
};

const LS_LOCAL_CACHE = "dufc_ls_hub_v1";

function saveLocalCache(oddsData, scoreData) {
  try {
    localStorage.setItem(LS_LOCAL_CACHE, JSON.stringify({
      savedAt: Date.now(),
      league: lsState.league,
      window: lsState.window,
      oddsData,
      scoreData
    }));
  } catch (_) {
    /* ignore */
  }
}

function readLocalCache() {
  try {
    const raw = localStorage.getItem(LS_LOCAL_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.oddsData) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function hasOdds(m) {
  const markets = m?.markets || {};
  return Boolean(
    (markets.h2h && markets.h2h.length)
    || (markets.ah && markets.ah.length)
    || (markets.ou && markets.ou.length)
  );
}

async function apiAction(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`${LS_API}?${qs.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `Lỗi API (${res.status})`);
  return data;
}

function scoreLabel(m) {
  if (m.score_home != null || m.score_away != null) {
    return `${m.score_home ?? 0} - ${m.score_away ?? 0}`;
  }
  return "vs";
}

function statusLabel(m) {
  if (m.status === "live") return "LIVE";
  if (m.status === "finished") return "FT";
  return "Sắp đá";
}

function flagHtml(league) {
  if (league.flag) {
    return `<img class="lsFlag" src="https://flagcdn.com/w40/${esc(league.flag)}.png" width="22" height="16" alt="" loading="lazy">`;
  }
  return `<span class="lsFlagEmoji" aria-hidden="true">${esc(league.emoji || "⚽")}</span>`;
}

function h2hTable(rows) {
  if (!rows?.length) return `<div class="lsEmptyMini">Chưa có kèo 1X2.</div>`;
  const best = bestValues(rows, ["home", "draw", "away"]);
  const body = rows.map((r) => `<tr>
    <td class="lsBook">${esc(r.book_label || r.book)}</td>
    <td class="${best.home != null && r.home === best.home ? "is-best" : ""}">${esc(formatOdds(r.home))}</td>
    <td class="${best.draw != null && r.draw === best.draw ? "is-best" : ""}">${esc(formatOdds(r.draw))}</td>
    <td class="${best.away != null && r.away === best.away ? "is-best" : ""}">${esc(formatOdds(r.away))}</td>
  </tr>`).join("");
  return `<div class="lsTableWrap"><table class="lsTable">
    <thead><tr><th>Nhà cái</th><th>Chủ</th><th>Hòa</th><th>Khách</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function ahTable(rows) {
  if (!rows?.length) return `<div class="lsEmptyMini">Chưa có kèo Châu Á.</div>`;
  const best = bestValues(rows, ["home", "away"]);
  const body = rows.map((r) => `<tr>
    <td class="lsBook">${esc(r.book_label || r.book)}</td>
    <td class="${best.home != null && r.home === best.home ? "is-best" : ""}">${esc(formatPoint(r.home_point))} ${esc(formatOdds(r.home))}</td>
    <td class="${best.away != null && r.away === best.away ? "is-best" : ""}">${esc(formatPoint(r.away_point))} ${esc(formatOdds(r.away))}</td>
  </tr>`).join("");
  return `<div class="lsTableWrap"><table class="lsTable">
    <thead><tr><th>Nhà cái</th><th>Chủ (AH)</th><th>Khách (AH)</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function ouTable(rows) {
  if (!rows?.length) return `<div class="lsEmptyMini">Chưa có kèo Tài/Xỉu.</div>`;
  const best = bestValues(rows, ["over", "under"]);
  const body = rows.map((r) => `<tr>
    <td class="lsBook">${esc(r.book_label || r.book)}</td>
    <td>${esc(formatPoint(r.point) || "—")}</td>
    <td class="${best.over != null && r.over === best.over ? "is-best" : ""}">${esc(formatOdds(r.over))}</td>
    <td class="${best.under != null && r.under === best.under ? "is-best" : ""}">${esc(formatOdds(r.under))}</td>
  </tr>`).join("");
  return `<div class="lsTableWrap"><table class="lsTable">
    <thead><tr><th>Nhà cái</th><th>Mốc</th><th>Tài</th><th>Xỉu</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function matchCard(m) {
  const canOdds = hasOdds(m);
  const open = canOdds && lsState.openId === m.id;
  const live = m.status === "live";
  const markets = m.markets || {};
  return `<article class="lsCard${open ? " is-open" : ""}" data-id="${esc(m.id)}">
    <button type="button" class="lsCardHead${canOdds ? " is-expandable" : ""}" data-toggle="${esc(m.id)}" data-has-odds="${canOdds ? "1" : "0"}" aria-expanded="${open ? "true" : "false"}">
      <div class="lsCardMeta">
        <span class="lsBadge">${esc(m.league_short || m.league_label || "")}</span>
        <span class="lsKick">${esc(formatKickoff(m.commence_time))}</span>
        ${canOdds ? `<span class="lsOddsTag">Có kèo</span>` : ""}
      </div>
      <div class="lsCardMain">
        <div class="lsTeams">
          <div class="lsTeam">${esc(m.home)}</div>
          <div class="lsTeam">${esc(m.away)}</div>
        </div>
        <div class="lsScoreCol">
          <div class="lsScore${live ? " is-live" : ""}">${esc(scoreLabel(m))}</div>
          <div class="lsState${live ? " is-live" : ""}">${esc(statusLabel(m))}</div>
        </div>
        <span class="lsChevron" aria-hidden="true">▾</span>
      </div>
    </button>
    ${canOdds ? `<div class="lsCardBody"${open ? "" : " hidden"}>
      <div class="lsMarket"><h3>1X2</h3>${h2hTable(markets.h2h)}</div>
      <div class="lsMarket"><h3>Châu Á</h3>${ahTable(markets.ah)}</div>
      <div class="lsMarket"><h3>Tài / Xỉu</h3>${ouTable(markets.ou)}</div>
    </div>` : ""}
  </article>`;
}

function renderFilters() {
  const leagues = document.getElementById("lsLeagueFilters");
  if (leagues) {
    leagues.innerHTML = LS_LEAGUES.map((l) =>
      `<button type="button" class="lsSideItem${lsState.league === l.key ? " active" : ""}" data-league="${esc(l.key)}">
        ${flagHtml(l)}
        <span>${esc(l.short || l.label)}</span>
      </button>`
    ).join("");
  }
  document.querySelectorAll("[data-window]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-window") === lsState.window);
  });
}

function render() {
  renderFilters();
  const status = document.getElementById("lsStatus");
  const list = document.getElementById("lsList");
  if (!list) return;
  if (status) {
    const withOdds = lsState.matches.filter(hasOdds).length;
    const updated = lsState.updatedAt
      ? `${lsState.matches.length} trận · ${withOdds} có kèo · ${esc(String(lsState.updatedAt).replace("T", " ").slice(0, 16))}`
      : `${lsState.matches.length} trận · ${withOdds} có kèo`;
    const note = lsState.statusNote
      ? `<div class="lsStatusNote${lsState.stale ? " is-stale" : ""}">${esc(lsState.statusNote)}</div>`
      : "";
    status.innerHTML = `<div>${updated}</div>${note}`;
  }
  if (!lsState.matches.length) {
    list.innerHTML = `<div class="lsEmpty">${esc(lsState.statusNote || "Chưa có trận trong khung giờ đã chọn.")}</div>`;
    return;
  }
  list.innerHTML = lsState.matches.map(matchCard).join("");
  bindToggles();
}

function applyHubData(oddsData, scoreData, meta = {}) {
  lsState.matches = mergeScores(oddsData?.matches || [], scoreData?.matches || []);
  lsState.updatedAt = oddsData?.updated_at || scoreData?.updated_at || oddsData?.cached_at || "";
  lsState.stale = Boolean(meta.stale || oddsData?.stale || scoreData?.stale);
  lsState.statusNote = meta.note || "";
  render();
}

function bindToggles() {
  document.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.onclick = () => {
      if (btn.getAttribute("data-has-odds") !== "1") return;
      const id = btn.getAttribute("data-toggle");
      lsState.openId = lsState.openId === id ? "" : id;
      if (lsState.openId && typeof trackLivescoreEvent === "function") {
        trackLivescoreEvent("expand_odds", { match_id: id });
      }
      render();
    };
  });
}

function mergeScores(oddsMatches, scoreMatches) {
  const map = new Map((scoreMatches || []).map((m) => [m.id, m]));
  return (oddsMatches || []).map((m) => {
    const s = map.get(m.id);
    if (!s) {
      return Object.assign({}, m, {
        status: "scheduled",
        score_home: null,
        score_away: null
      });
    }
    return Object.assign({}, m, {
      status: s.status || "scheduled",
      score_home: s.score_home,
      score_away: s.score_away,
      completed: s.completed
    });
  });
}

async function loadMatches(options = {}) {
  if (lsState.loading) return;
  lsState.loading = true;
  const list = document.getElementById("lsList");
  if (!options.silent && list) {
    list.innerHTML = `<div class="lsLoading">Đang tải...</div>`;
  }
  try {
    const oddsParams = { window: lsState.window };
    if (lsState.league !== "all") oddsParams.league = lsState.league;

    const scoreParams = { daysFrom: "3", status: "all" };
    if (lsState.league !== "all") {
      scoreParams.league = lsState.league === "soccer_uefa_champs_league"
        ? "soccer_uefa_champs_league_qualification"
        : lsState.league;
    }

    const [oddsData, scoreData] = await Promise.all([
      apiAction("odds_hub", oddsParams),
      apiAction("livescore_hub", scoreParams).catch(() => ({ matches: [] }))
    ]);

    saveLocalCache(oddsData, scoreData);
    applyHubData(oddsData, scoreData);
  } catch (err) {
    const cached = readLocalCache();
    if (cached?.oddsData) {
      applyHubData(cached.oddsData, cached.scoreData || { matches: [] }, {
        stale: true,
        note: ""
      });
    } else if (list) {
      list.innerHTML = `<div class="lsError">${esc(err.message || "Không tải được danh sách trận.")}</div>`;
    }
  } finally {
    lsState.loading = false;
  }
}

function bindUi() {
  document.getElementById("lsLeagueFilters")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-league]");
    if (!btn) return;
    lsState.league = btn.getAttribute("data-league") || "all";
    lsState.openId = "";
    if (typeof trackLivescoreEvent === "function") trackLivescoreEvent("filter_league", { league: lsState.league });
    loadMatches();
  });

  document.querySelectorAll("[data-window]").forEach((btn) => {
    btn.addEventListener("click", () => {
      lsState.window = btn.getAttribute("data-window") || "14d";
      lsState.openId = "";
      if (typeof trackLivescoreEvent === "function") trackLivescoreEvent("filter_window", { window: lsState.window });
      loadMatches();
    });
  });

  document.getElementById("lsRefresh")?.addEventListener("click", () => {
    if (typeof trackLivescoreEvent === "function") trackLivescoreEvent("refresh");
    loadMatches();
  });
}

function initLivescore() {
  bindUi();
  renderFilters();
  loadMatches();
}

document.addEventListener("DOMContentLoaded", initLivescore);
