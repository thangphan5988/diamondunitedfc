/* Constants, API URLs, global state */

const POS = ["GK","DEF","MID","FWD"];
const MAX_LINEUP_DP_POOL = 18;
window.MAX_LINEUP_DP_POOL = MAX_LINEUP_DP_POOL;
const FORMATIONS = {
  "3-2-1": [
    {pos:"GK", side:"CENTER"},
    {pos:"DEF", side:"LEFT"}, {pos:"DEF", side:"CENTER"}, {pos:"DEF", side:"RIGHT"},
    {pos:"MID", side:"LEFT"}, {pos:"MID", side:"RIGHT"},
    {pos:"FWD", side:"CENTER"}
  ],
  "3-1-2": [
    {pos:"GK", side:"CENTER"},
    {pos:"DEF", side:"LEFT"}, {pos:"DEF", side:"CENTER"}, {pos:"DEF", side:"RIGHT"},
    {pos:"MID", side:"CENTER"},
    {pos:"FWD", side:"LEFT"}, {pos:"FWD", side:"RIGHT"}
  ],
  "2-3-1": [
    {pos:"GK", side:"CENTER"},
    {pos:"DEF", side:"CENTER"}, {pos:"DEF", side:"CENTER"},
    {pos:"MID", side:"LEFT"}, {pos:"MID", side:"CENTER"}, {pos:"MID", side:"RIGHT"},
    {pos:"FWD", side:"CENTER"}
  ],
  "2-2-2": [
    {pos:"GK", side:"CENTER"},
    {pos:"DEF", side:"CENTER"}, {pos:"DEF", side:"CENTER"},
    {pos:"MID", side:"LEFT"}, {pos:"MID", side:"RIGHT"},
    {pos:"FWD", side:"LEFT"}, {pos:"FWD", side:"RIGHT"}
  ]
};
let formationA = "3-1-2";
let formationB = "3-1-2";
let formationCapMain = "3-1-2";
let formationCapSub = "3-1-2";
let lineupMode = "internal";
/** Main-nav workspace for lineup UI: "split" (Chia đội) | "hlv" (HLV) */
let lineupWorkspace = "split";
/** User clicked Nội bộ / Cáp — don't let polling snap mode away */
let lineupModePinned = false;
let lastPendingPollFingerprint = "";
let opponentTeamName = "";
const FORMATION_COORDS = {
  "3-2-1": {
    GK:[[50,91]], DEF:[[25,69],[50,72],[75,69]], MID:[[35,46],[65,46]], FWD:[[50,24]]
  },
  "3-1-2": {
    GK:[[50,91]], DEF:[[25,69],[50,72],[75,69]], MID:[[50,48]], FWD:[[35,24],[65,24]]
  },
  "2-3-1": {
    GK:[[50,91]], DEF:[[35,70],[65,70]], MID:[[25,48],[50,51],[75,48]], FWD:[[50,24]]
  },
  "2-2-2": {
    GK:[[50,91]], DEF:[[35,70],[65,70]], MID:[[35,48],[65,48]], FWD:[[35,24],[65,24]]
  }
};
let players = [];
let lastResult = null;
let pendingDetectedNames = new Set();
let matchLocked = false;
let currentMatchId = null;
let currentMatchLabel = null;
let currentMatchDate = null;
let currentMatchStartTime = "19:30";
let currentImageFilename = null;
let playerMatchScores = {};
let playerMatchGoals = {};
let playerMatchAssists = {};
let highlightVideoUrl = "";
let playerGoalVideoUrls = {};
let cachedHistoryMatches = [];
const PENDING_MATCH_KEY = "dufc_pending_match";
const AUTH_SESSION_KEY = "dufc_admin_session";
const MATCH_VENUE = {
  name: "Sân Bóng Đồng Tâm",
  address: "275 Lê Tấn Bê, Bình Tân",
  mapsUrl: "https://www.google.com/maps?rlz=1C5CHFA_enVN1021VN1023&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIICAEQABgWGB4yCAgCEAAYFhgeMggIAxAAGBYYHjIICAQQABgWGB4yCAgFEAAYFhgeMggIBhAAGBYYHjIICAcQABgWGB4yCAgIEAAYFhgeMggICRAAGBYYHtIBCDI2MTFqMGo3qAIAsAIA&um=1&ie=UTF-8&fb=1&gl=vn&sa=X&geocode=KX1V7ic8LXUxMfow_pPijLn3&daddr=275+L%C3%AA+T%E1%BA%A5n+B%C3%AA,+B%C3%ACnh+T%C3%A2n,+H%E1%BB%93+Ch%C3%AD+Minh+70000"
};
const PERMS = {
  ALL: "all",
  LINEUP_INTERNAL: "lineup_internal",
  LINEUP_CAP: "lineup_cap",
  LINEUP_CAP_HLV: "lineup_cap_hlv",
  ROSTER_IMPORT: "roster_import",
  LINEUP_SPLIT: "lineup_split",
  LINEUP_TEAM_A: "lineup_team_a",
  LINEUP_TEAM_B: "lineup_team_b",
  EXPORT: "export",
  MATCH_RESULT: "match_result",
  MATCH_RESULT_A: "match_result_a",
  MATCH_RESULT_B: "match_result_b",
  CANCEL_MATCH: "cancel_match",
  DELETE_MATCH: "delete_match",
  MANAGE_USERS: "manage_users",
  MANAGE_ROSTER: "manage_roster",
  MANAGE_SPONSORS: "manage_sponsors"
};
const PERM_OPTIONS = [
  { id: PERMS.LINEUP_INTERNAL, label: "Chia đội nội bộ (toàn quyền)" },
  { id: PERMS.ROSTER_IMPORT, label: "Import danh sách cầu thủ" },
  { id: PERMS.LINEUP_SPLIT, label: "Random chia 2 đội" },
  { id: PERMS.LINEUP_TEAM_A, label: "Chốt Đội A" },
  { id: PERMS.LINEUP_TEAM_B, label: "Chốt Đội B" },
  { id: PERMS.LINEUP_CAP, label: "Điều phối Cáp (import/sắp/gửi HLV)" },
  { id: PERMS.LINEUP_CAP_HLV, label: "HLV Cáp (kéo thả Chính/Phụ)" },
  { id: PERMS.EXPORT, label: "Xuất ảnh & lưu lineup" },
  { id: PERMS.MATCH_RESULT, label: "Nhập kết quả (cả 2 đội)" },
  { id: PERMS.MATCH_RESULT_A, label: "Nhập kết quả Đội A" },
  { id: PERMS.MATCH_RESULT_B, label: "Nhập kết quả Đội B" },
  { id: PERMS.CANCEL_MATCH, label: "Hủy trận" },
  { id: PERMS.DELETE_MATCH, label: "Xóa trận lịch sử" },
  { id: PERMS.MANAGE_USERS, label: "Quản lý tài khoản" },
  { id: PERMS.MANAGE_ROSTER, label: "Quản lý danh sách cầu thủ" },
  { id: PERMS.MANAGE_SPONSORS, label: "Quản lý nhà tài trợ / quảng cáo" },
  { id: PERMS.ALL, label: "Toàn quyền (all)" }
];
let teamConfirmState = { A: false, B: false, Main: false, Sub: false };
let matchCaptains = { A: null, B: null };
let teamResultSaved = { A: false, B: false };
let pendingTeamAScore = "";
let pendingTeamBScore = "";
let lineupPublishedToHlv = false;
let lineupDragSession = null;
let confirmPollTimer = null;
let authSession = null;
const WEEKDAYS_VI = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
// Cloudflare Worker API (D1) — frontend localhost vẫn gọi API production (data thật)
const API_BASE_URL = "https://api.diamondunitedfc.com";
const MATCH_HISTORY_WEB_APP_URL = API_BASE_URL;

/** Liên hệ đá giao hữu — SĐT VN (0xxx / 84xxx) hoặc URL Zalo đầy đủ (https://zalo.me/...) */
const ZALO_FRIENDLY_MATCH_CONTACT = "0909197819";
/** Liên hệ đặt quảng cáo / nhà tài trợ */
const ZALO_AD_CONTACT = ZALO_FRIENDLY_MATCH_CONTACT;

const SITE_URL = "https://diamondunitedfc.com";
const SITE_NAME = "Diamond United FC";
const SITE_AREA = "Diamond Riverside, Bình Phú, TP. Hồ Chí Minh";

function zaloContactUrl(raw){
  const value = String(raw || "").trim();
  if(!value) return "";
  if(/^https?:\/\//i.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  if(!digits) return "";
  let phone = digits;
  if(phone.startsWith("0")) phone = "84" + phone.slice(1);
  else if(!phone.startsWith("84")) phone = "84" + phone;
  return `https://zalo.me/${phone}`;
}

function zaloFriendlyMatchUrl(){
  return zaloContactUrl(ZALO_FRIENDLY_MATCH_CONTACT);
}

function zaloAdUrl(){
  return zaloContactUrl(ZALO_AD_CONTACT);
}

function openZaloAdContact(event){
  if(event?.preventDefault) event.preventDefault();
  if(typeof trackSiteEvent === "function"){
    trackSiteEvent("cta_dat_quang_cao", { source: event?.currentTarget?.id || event?.target?.id || "zalo_quang_cao" });
  }
  const url = zaloAdUrl();
  if(!url){
    alert("Chưa cấu hình Zalo liên hệ quảng cáo. Cập nhật ZALO_AD_CONTACT trong js/config.js.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function openZaloFriendlyMatch(event){
  if(event?.preventDefault) event.preventDefault();
  if(typeof trackSiteEvent === "function"){
    trackSiteEvent("cta_giao_huu", { source: event?.currentTarget?.id || event?.target?.id || "zalo_giao_huu" });
  }
  const url = zaloFriendlyMatchUrl();
  if(!url){
    alert("Chưa cấu hình Zalo liên hệ. Cập nhật ZALO_FRIENDLY_MATCH_CONTACT trong js/config.js.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function initFriendlyMatchButton(){
  const btn = document.getElementById("btnFriendlyMatch");
  if(btn){
    const url = zaloFriendlyMatchUrl();
    if(url) btn.href = url;
  }
  const adBtn = document.getElementById("btnAdContact");
  if(adBtn){
    const adUrl = zaloAdUrl();
    if(adUrl) adBtn.href = adUrl;
  }
}
