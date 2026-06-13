/* Banner World Cup 2026 — trận đang diễn ra + sắp đá (trang chủ + hub WC) */

(function initWcLiveBanner() {
  const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "P", "LIVE"];
  const POLL_MS = 60000;
  const BANNER_IDS = ["homeWcLiveBanner", "wcLiveBanner"];
  const MOBILE_MQ = window.matchMedia("(max-width:760px)");
  let pollTimer = null;
  let lastLiveData = null;
  let lastUpcomingData = null;

  function upcomingLimit() {
    return MOBILE_MQ.matches ? 2 : 3;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusLabel(status, elapsed) {
    const map = {
      NS: "Chưa đá",
      LIVE: "Đang đá",
      "1H": "Hiệp 1",
      HT: "Giữa hiệp",
      "2H": "Hiệp 2",
      ET: "Hiệp phụ",
      BT: "Nghỉ HP",
      P: "Penalty",
      FT: "Kết thúc",
      AET: "Hết HP",
      PEN: "Hết pen"
    };
    const base = map[status] || status || "";
    if (elapsed != null && ["1H", "2H", "ET", "P", "LIVE"].includes(status)) {
      return `${base} · ${elapsed}'`;
    }
    return base;
  }

  function scoreLine(fx) {
    const hasScore = fx.home?.score != null && fx.away?.score != null;
    if (hasScore) return `${fx.home.score} - ${fx.away.score}`;
    return "vs";
  }

  function formatMatchTime(fx) {
    if (fx?.timestamp) {
      const d = new Date(fx.timestamp * 1000);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
      }
    }
    if (fx?.date) {
      const d = new Date(fx.date);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
      }
    }
    return String(fx?.localLabel || "").trim() || "Sắp đá";
  }

  async function fetchFixtures(scope) {
    const qs = new URLSearchParams({
      action: "wc2026_fixtures",
      scope,
      ts: Date.now()
    });
    const res = await fetch(`${API_BASE_URL}?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("API HTTP " + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "API error");
    return data;
  }

  function matchLinkAttrs(fx) {
    const id = escapeHtml(String(fx.id));
    const href = `/world-cup-2026.html?match=${encodeURIComponent(String(fx.id))}`;
    const onHub = /world-cup-2026\.html$/i.test(location.pathname);
    if (onHub && typeof window.wcOpenMatchDetail === "function") {
      return `href="${href}" onclick="event.preventDefault();wcOpenMatchDetail('${id}')"`;
    }
    return `href="${escapeHtml(href)}"`;
  }

  function liveItemHtml(fx) {
    return `<a class="wcLiveItem wcLiveItem--click" ${matchLinkAttrs(fx)}>
      <div class="wcBannerMatchTeams">
        <span class="wcBannerTeam wcBannerTeam--home">${escapeHtml(fx.home?.name)}</span>
        <span class="wcBannerScore">${escapeHtml(scoreLine(fx))}</span>
        <span class="wcBannerTeam wcBannerTeam--away">${escapeHtml(fx.away?.name)}</span>
      </div>
      <span class="wcMatchStatus">${escapeHtml(statusLabel(fx.status, fx.elapsed))}</span>
    </a>`;
  }

  function upcomingItemHtml(fx) {
    return `<a class="wcUpcomingItem wcLiveItem--click" ${matchLinkAttrs(fx)}>
      <div class="wcBannerMatchTeams">
        <span class="wcBannerTeam wcBannerTeam--home">${escapeHtml(fx.home?.name)}</span>
        <span class="wcBannerScore">vs</span>
        <span class="wcBannerTeam wcBannerTeam--away">${escapeHtml(fx.away?.name)}</span>
      </div>
      <span class="wcMatchTime">${escapeHtml(formatMatchTime(fx))}</span>
    </a>`;
  }

  function upcomingColHtml(fx) {
    return `<section class="wcBannerCol wcBannerCol--upcoming" aria-label="Trận sắp đá">
      <div class="wcUpcomingHead">⏰ Sắp đá</div>
      ${upcomingItemHtml(fx)}
    </section>`;
  }

  function getBannerElements() {
    return BANNER_IDS.map((id) => document.getElementById(id)).filter(Boolean);
  }

  function renderBanner(el, liveData, upcomingData) {
    if (!el) return;

    const live = (liveData?.items || []).filter((fx) => LIVE_STATUSES.includes(fx.status));
    const liveIds = new Set(live.map((fx) => String(fx.id)));
    const upcoming = (upcomingData?.items || [])
      .filter((fx) => !liveIds.has(String(fx.id)) && fx.status !== "FT" && !LIVE_STATUSES.includes(fx.status))
      .slice(0, upcomingLimit());

    if (!live.length && !upcoming.length) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }

    el.hidden = false;
    el.classList.toggle("wcLiveBanner--liveOnly", live.length > 0 && !upcoming.length);
    el.classList.toggle("wcLiveBanner--upcomingOnly", !live.length && upcoming.length > 0);
    el.classList.toggle("wcLiveBanner--mixed", live.length > 0 && upcoming.length > 0);
    el.classList.toggle("wcLiveBanner--upcomingCols2", upcoming.length === 2);
    el.classList.toggle("wcLiveBanner--upcomingCols3", upcoming.length >= 3);

    const liveCol = live.length
      ? `<section class="wcBannerCol wcBannerCol--live" aria-label="Trận đang diễn ra">
          <div class="wcLiveHead">🔴 Đang diễn ra</div>
          ${live.slice(0, 3).map(liveItemHtml).join("")}
        </section>`
      : "";

    const upcomingCols = upcoming.map(upcomingColHtml).join("");

    el.innerHTML = `<div class="wcBannerGrid">${liveCol}${upcomingCols}</div>`;
  }

  function renderAllBanners(liveData, upcomingData) {
    getBannerElements().forEach((el) => renderBanner(el, liveData, upcomingData));
  }

  async function refreshBanner() {
    try {
      const [liveData, upcomingData] = await Promise.all([
        fetchFixtures("live"),
        fetchFixtures("upcoming")
      ]);
      lastLiveData = liveData;
      lastUpcomingData = upcomingData;
      renderAllBanners(liveData, upcomingData);
    } catch (_) {
      getBannerElements().forEach((el) => {
        el.innerHTML = "";
        el.hidden = true;
      });
    }
  }

  function start() {
    if (!getBannerElements().length) return;
    refreshBanner();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refreshBanner, POLL_MS);
    MOBILE_MQ.addEventListener("change", () => {
      if (lastLiveData || lastUpcomingData) renderAllBanners(lastLiveData, lastUpcomingData);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
