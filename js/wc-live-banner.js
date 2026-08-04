/* Banner AFF Cup 2026 — trận đang diễn ra + sắp đá (trang chủ + hub) */

(function initWcLiveBanner() {
  const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "P", "LIVE", "BT"];
  const POLL_MS = 60000;
  const BANNER_IDS = ["homeWcLiveBanner", "wcLiveBanner"];
  const MOBILE_MQ = window.matchMedia("(max-width:760px)");
  let pollTimer = null;
  let lastLiveData = null;
  let lastUpcomingData = null;

  /** Tổng số trận hiện trên banner: 2 mobile · 3 desktop (ưu tiên live) */
  function slotLimit() {
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
    const opts = {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    };
    if (fx?.timestamp) {
      const d = new Date(fx.timestamp * 1000);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString("vi-VN", opts);
    }
    if (fx?.date) {
      const d = new Date(fx.date);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString("vi-VN", opts);
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
    const href = `/aff-cup-2026.html?match=${encodeURIComponent(String(fx.id))}`;
    const onHub = /aff-cup-2026\.html$/i.test(location.pathname);
    if (onHub && typeof window.wcOpenMatchDetail === "function") {
      return `href="${href}" onclick="event.preventDefault();wcOpenMatchDetail('${id}')"`;
    }
    return `href="${escapeHtml(href)}"`;
  }

  function isVietnamTeam(teamOrName) {
    if (!teamOrName) return false;
    if (typeof teamOrName === "object") {
      const id = String(teamOrName.id || "").toLowerCase();
      const code = String(teamOrName.code || teamOrName.fifaCode || "").toUpperCase();
      if (id === "vietnam" || code === "VIE" || code === "VN") return true;
      return isVietnamTeam(teamOrName.name);
    }
    const name = String(teamOrName).trim().toLowerCase();
    return name === "việt nam" || name === "vietnam" || name === "viet nam";
  }

  function teamNameClass(team, base) {
    return [base || "", isVietnamTeam(team) ? "wcTeamVn" : ""].filter(Boolean).join(" ");
  }

  function slotHtml(slot) {
    const fx = slot.fx;
    const live = slot.kind === "live";
    const head = live ? "🔴 Đang đá" : "⏰ Sắp đá";
    const meta = live
      ? escapeHtml(statusLabel(fx.status, fx.elapsed))
      : escapeHtml(formatMatchTime(fx));
    const score = live ? escapeHtml(scoreLine(fx)) : "vs";
    return `<a class="wcBannerCol ${live ? "wcBannerCol--live" : "wcBannerCol--upcoming"} wcLiveItem--click" ${matchLinkAttrs(fx)}>
      <div class="${live ? "wcLiveHead" : "wcUpcomingHead"}">${head}</div>
      <div class="wcBannerMatchTeams">
        <span class="${teamNameClass(fx.home, "wcBannerTeam wcBannerTeam--home")}">${escapeHtml(fx.home?.name)}</span>
        <span class="wcBannerScore">${score}</span>
        <span class="${teamNameClass(fx.away, "wcBannerTeam wcBannerTeam--away")}">${escapeHtml(fx.away?.name)}</span>
      </div>
      <span class="${live ? "wcMatchStatus" : "wcMatchTime"}">${meta}</span>
    </a>`;
  }

  function getBannerElements() {
    return BANNER_IDS.map((id) => document.getElementById(id)).filter(Boolean);
  }

  function buildSlots(liveData, upcomingData) {
    const limit = slotLimit();
    const live = (liveData?.items || []).filter((fx) => LIVE_STATUSES.includes(fx.status));
    const liveIds = new Set(live.map((fx) => String(fx.id)));
    const upcoming = (upcomingData?.items || []).filter(
      (fx) => !liveIds.has(String(fx.id)) && fx.status !== "FT" && !LIVE_STATUSES.includes(fx.status)
    );

    const slots = [
      ...live.map((fx) => ({ kind: "live", fx })),
      ...upcoming.map((fx) => ({ kind: "upcoming", fx }))
    ].slice(0, limit);

    return slots;
  }

  function renderBanner(el, liveData, upcomingData) {
    if (!el) return;

    const slots = buildSlots(liveData, upcomingData);
    if (!slots.length) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }

    const liveCount = slots.filter((s) => s.kind === "live").length;
    const upcomingCount = slots.length - liveCount;

    el.hidden = false;
    el.classList.toggle("wcLiveBanner--liveOnly", liveCount > 0 && !upcomingCount);
    el.classList.toggle("wcLiveBanner--upcomingOnly", !liveCount && upcomingCount > 0);
    el.classList.toggle("wcLiveBanner--mixed", liveCount > 0 && upcomingCount > 0);
    el.classList.toggle("wcLiveBanner--cols2", slots.length === 2);
    el.classList.toggle("wcLiveBanner--cols3", slots.length >= 3);
    el.classList.remove("wcLiveBanner--upcomingCols2", "wcLiveBanner--upcomingCols3");

    el.innerHTML = `<div class="wcBannerGrid">${slots.map(slotHtml).join("")}</div>`;
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
