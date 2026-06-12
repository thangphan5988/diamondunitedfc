/* Public sponsor ad display */

let cachedSponsors = [];
const trackedSponsorViews = new Set();

async function trackSponsorView(id){
  const sid = Number(id);
  if(!Number.isFinite(sid) || trackedSponsorViews.has(sid)) return;
  trackedSponsorViews.add(sid);
  try{
    await apiPost("track_sponsor_view", { sponsor_id: sid });
  }catch{}
}

async function trackSponsorClick(id){
  const sid = Number(id);
  if(!Number.isFinite(sid)) return;
  if(typeof trackSiteEvent === "function"){
    trackSiteEvent("ad_click", { sponsor_id: sid });
  }
  try{
    await apiPost("track_sponsor_click", { sponsor_id: sid });
  }catch{}
}

let sponsorClickTrackingBound = false;

function ensureSponsorClickTracking(){
  if(sponsorClickTrackingBound) return;
  sponsorClickTrackingBound = true;
  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-sponsor-id]");
    if(!el) return;
    const id = Number(el.dataset.sponsorId);
    if(Number.isFinite(id)) trackSponsorClick(id);
  }, true);
}

function bindSponsorAdTracking(){
  ensureSponsorClickTracking();
  document.querySelectorAll("[data-sponsor-id]").forEach(el => {
    const id = Number(el.dataset.sponsorId);
    if(Number.isFinite(id)) trackSponsorView(id);
  });
}

ensureSponsorClickTracking();

const DEMO_SPONSORS = [
  { id: 1, name: "Diamond Coffee", link_url: "#", image_side: "", image_mobile: "", sort_order: 1, active: 1 },
  { id: 2, name: "Riverside Gym", link_url: "#", image_side: "", image_mobile: "", sort_order: 2, active: 1 },
  { id: 3, name: "Saigon Water", link_url: "#", image_side: "", image_mobile: "", sort_order: 3, active: 1 }
];

function isLocalHost(){
  const h = String(location.hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1";
}

function resolveSponsorImageUrl(url){
  const u = String(url || "").trim();
  if(!u) return "";
  if(u.startsWith("data:")) return u;

  let path = "";
  if(/^https?:\/\//i.test(u)){
    try{
      const parsed = new URL(u);
      const host = parsed.hostname.toLowerCase();
      if(host === "api.diamondunitedfc.com" || host === "localhost" || host === "127.0.0.1"){
        path = parsed.pathname.replace(/^\/+/, "");
      }else{
        return u.replace(/^http:\/\//i, "https://");
      }
    }catch{
      return u;
    }
  }else{
    path = u.replace(/^\/+/, "");
  }

  if(path.startsWith("sponsors/") || path.startsWith("avatars/")){
    return `${API_BASE_URL.replace(/\/$/, "")}/${path}`;
  }
  return u;
}

function sponsorImageUrlWithBust(url, updatedAt){
  const raw = String(url || "").trim();
  if(!raw) return "";
  const base = raw.split("?")[0];
  if(raw.includes("?v=")) return raw;
  if(updatedAt) return `${base}?v=${encodeURIComponent(String(updatedAt))}`;
  return raw;
}

function sponsorImageSrc(sponsor, slot){
  const side = resolveSponsorImageUrl(sponsor?.image_side);
  const mobile = resolveSponsorImageUrl(sponsor?.image_mobile);
  const picked = slot === "mobile" ? mobile || side : side || mobile;
  return sponsorImageUrlWithBust(picked, sponsor?.updated_at);
}

function isSponsorLive(s){
  if(s.active === 0 || s.active === false) return false;
  const end = s?.end_at;
  if(!end) return true;
  return Date.parse(end) > Date.now();
}

function sponsorItemHtml(sponsor, slot, className){
  const img = sponsorImageSrc(sponsor, slot);
  const name = escapeHtml(sponsor.name || "Nhà tài trợ");
  const sid = Number(sponsor?.id);
  const trackAttrs = Number.isFinite(sid) ? ` data-sponsor-id="${sid}"` : "";
  const inner = img
    ? `<img src="${escapeAttr(img)}" alt="${name}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'adPlaceholder',innerHTML:'<span>${name}</span>'}))">`
    : `<div class="adPlaceholder"><span>${name}</span></div>`;
  const link = String(sponsor.link_url || "").trim();
  if(link && link !== "#"){
    return `<a class="${className}" href="${escapeAttr(link)}" target="_blank" rel="noopener sponsored"${trackAttrs}>${inner}</a>`;
  }
  return `<div class="${className}"${trackAttrs}>${inner}</div>`;
}

function buildMarqueeTrack(sponsors, slot, className){
  if(!sponsors.length) return "";
  const items = sponsors.map(s => sponsorItemHtml(s, slot, className)).join("");
  return `<div class="${slot === "mobile" ? "adMobileTrack" : "adRailTrack adRailTrack--static"}">${items}${slot === "mobile" ? items : ""}</div>`;
}

function sideRailItemsHtml(sponsors){
  return sponsors.map(s => sponsorItemHtml(s, "side", "adRailItem")).join("");
}

function syncDesktopSideRailScroll(){
  if(window.innerWidth < 1120) return;

  const rails = [
    document.getElementById("adRailLeft"),
    document.getElementById("adRailRight")
  ];
  const list = cachedSponsors.filter(isSponsorLive);
  const singleHtml = sideRailItemsHtml(list);

  rails.forEach(rail => {
    const inner = rail?.querySelector(".adRailInner");
    if(!inner) return;

    let track = inner.querySelector(".adRailTrack");
    if(!track){
      track = document.createElement("div");
      inner.appendChild(track);
    }

    track.className = "adRailTrack adRailTrack--static";
    track.innerHTML = singleHtml;

    const overflows = track.scrollHeight > inner.clientHeight + 2;
    if(overflows){
      track.className = "adRailTrack adRailTrack--marquee";
      track.innerHTML = singleHtml + singleHtml;
    }
  });

  document.querySelectorAll(".adRail img").forEach(img => {
    if(!img.complete) img.addEventListener("load", () => {
      syncDesktopSideRailScroll();
      bindSponsorAdTracking();
    }, { once: true });
  });
  bindSponsorAdTracking();
}

let sideRailScrollBound = false;
function syncMobileAdOffset(){
  const ad = document.getElementById("adMobileTop");
  if(!ad || window.innerWidth >= 1120){
    document.documentElement.style.removeProperty("--ad-mobile-offset");
    return;
  }
  const h = ad.offsetHeight || 0;
  document.documentElement.style.setProperty("--ad-mobile-offset", h ? `${h}px` : "0px");
}

function bindSideRailScrollSync(){
  if(sideRailScrollBound) return;
  sideRailScrollBound = true;
  window.addEventListener("resize", () => {
    window.requestAnimationFrame(() => {
      syncDesktopSideRailScroll();
      syncMobileAdOffset();
    });
  });
}

function renderSponsorAds(){
  const left = document.getElementById("adRailLeft");
  const right = document.getElementById("adRailRight");
  const mobile = document.getElementById("adMobileTop");
  const list = cachedSponsors.filter(isSponsorLive);
  if(!list.length){
    if(left) left.innerHTML = "";
    if(right) right.innerHTML = "";
    if(mobile) mobile.innerHTML = "";
    syncMobileAdOffset();
    return;
  }

  const sideInner = `<div class="adRailInner"><div class="adRailTrack adRailTrack--static">${sideRailItemsHtml(list)}</div></div>`;
  if(left) left.innerHTML = sideInner;
  if(right) right.innerHTML = sideInner;
  if(mobile){
    mobile.innerHTML = `<div class="adMobileTopInner">${buildMarqueeTrack(list, "mobile", "adMobileItem")}</div>`;
  }

  bindSideRailScrollSync();
  window.requestAnimationFrame(() => {
    syncDesktopSideRailScroll();
    syncMobileAdOffset();
    bindSponsorAdTracking();
  });
  document.querySelectorAll("#adMobileTop img, .adRail img").forEach(img => {
    if(!img.complete) img.addEventListener("load", () => {
      syncDesktopSideRailScroll();
      syncMobileAdOffset();
      bindSponsorAdTracking();
    }, { once: true });
  });
}

async function loadSponsors(){
  try{
    const data = await apiGet("get_sponsors");
    cachedSponsors = data.sponsors || [];
  }catch(e){
    cachedSponsors = [];
  }
  if(!cachedSponsors.length && isLocalHost()) cachedSponsors = DEMO_SPONSORS.slice();
  renderSponsorAds();
}

function refreshSponsorAdsFromAdmin(list){
  cachedSponsors = Array.isArray(list) ? list.filter(isSponsorLive) : cachedSponsors.filter(isSponsorLive);
  renderSponsorAds();
}
