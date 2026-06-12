/* Public site analytics tracking */

const ANALYTICS_PAGE_VIEW_KEY = "dufc_analytics_pv";

async function trackSiteEvent(eventType, meta){
  if(!eventType) return;
  try{
    await apiPost("track_site_event", {
      event_type: eventType,
      page_path: `${location.pathname || "/"}${location.search || ""}`,
      meta: meta || {}
    });
  }catch{}
}

function trackPageViewOnce(){
  const path = `${location.pathname || "/"}${location.search || ""}`;
  let seen = [];
  try{
    seen = JSON.parse(sessionStorage.getItem(ANALYTICS_PAGE_VIEW_KEY) || "[]");
    if(!Array.isArray(seen)) seen = [];
  }catch{
    seen = [];
  }
  if(seen.includes(path)) return;
  seen.push(path);
  try{
    sessionStorage.setItem(ANALYTICS_PAGE_VIEW_KEY, JSON.stringify(seen.slice(-40)));
  }catch{}
  trackSiteEvent("page_view", { path });
}

function trackSiteInteraction(name, meta){
  trackSiteEvent("interaction", Object.assign({ name: String(name || "unknown") }, meta || {}));
}

let siteInteractionTrackingBound = false;

function ensureSiteInteractionTracking(){
  if(siteInteractionTrackingBound) return;
  siteInteractionTrackingBound = true;

  document.addEventListener("click", (event) => {
    const tabBtn = event.target.closest(".tabs .tab");
    if(tabBtn?.id){
      trackSiteInteraction("tab", { tab: tabBtn.id.replace(/^tab/, "").toLowerCase() || tabBtn.textContent?.trim() });
      return;
    }

    const statsTab = event.target.closest(".statsTab");
    if(statsTab && !statsTab.closest("#adminSectionTabs")){
      trackSiteInteraction("stats_tab", { label: statsTab.textContent?.trim() || "" });
      return;
    }

    const seoLink = event.target.closest(".siteFooterSeo a");
    if(seoLink){
      trackSiteInteraction("seo_link", { href: seoLink.getAttribute("href") || "" });
    }
  }, true);
}

function initSiteAnalytics(){
  ensureSiteInteractionTracking();
  trackPageViewOnce();
}
