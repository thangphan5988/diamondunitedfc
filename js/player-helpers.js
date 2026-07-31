/* Position/side normalization helpers */

function isAnonymousPlayer(p){
  if(!p) return false;
  return p.anonymous === true || p.is_anonymous === true || p.is_anonymous === 1 || p.is_anonymous === "1";
}

function findRosterPlayerByName(name){
  const key = typeof normalizeName === "function" ? normalizeName(name) : String(name || "").trim().toLowerCase();
  if(!key || typeof players === "undefined" || !Array.isArray(players)) return null;
  return players.find(p => {
    const n = typeof normalizeName === "function" ? normalizeName(p.name) : String(p.name || "").trim().toLowerCase();
    return n === key;
  }) || null;
}

/** Ẩn danh trong trận: lấy từ object hoặc roster hiện tại */
function isAnonymousMatchPlayer(p){
  if(isAnonymousPlayer(p)) return true;
  return isAnonymousPlayer(findRosterPlayerByName(p?.name || p?.player_name));
}

function publicPlayers(list){
  return (list || players || []).filter(p => !isAnonymousPlayer(p));
}

/** Cầu thủ tham gia chấm điểm / MVP (bỏ ẩn danh) */
function scoreablePlayers(list){
  return (list || []).filter(p => !isAnonymousMatchPlayer(p));
}

function anonymousLineupRating(){
  return 5;
}

function jerseyLabel(jerseyNumber){
  if(jerseyNumber == null || jerseyNumber === "") return "";
  const n = Number(jerseyNumber);
  if(!Number.isFinite(n) || n < 0) return "";
  return `#${Math.round(n)}`;
}

function formatBirthDateDisplay(value){
  const s = String(value || "").trim();
  if(!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const vn = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(vn) return `${String(vn[1]).padStart(2, "0")}/${String(vn[2]).padStart(2, "0")}/${vn[3]}`;
  return s;
}

function playerAgeFromBirthDate(value){
  const s = String(value || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!iso) return null;
  const y = Number(iso[1]);
  const m = Number(iso[2]);
  const d = Number(iso[3]);
  if(!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if(monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
  return age >= 0 && age < 120 ? age : null;
}

function birthDateLabel(value){
  const formatted = formatBirthDateDisplay(value);
  if(!formatted) return "";
  const age = playerAgeFromBirthDate(value);
  return age != null ? `${formatted} (${age} tuổi)` : formatted;
}

function playerEventDateLabel(value){
  return formatBirthDateDisplay(value);
}

function playerPosDisplayLabel(pos){
  return ({ GK: "Thủ môn", DEF: "Hậu vệ", MID: "Tiền vệ", FWD: "Tiền đạo" })[pos] || String(pos || "").trim();
}

function playerDisplayName(pOrName){
  if(pOrName && typeof pOrName === "object"){
    const dn = String(pOrName.display_name || "").trim();
    if(dn) return dn;
    return String(pOrName.name || "").trim();
  }
  const key = normalizeName(pOrName);
  if(typeof players !== "undefined" && Array.isArray(players)){
    const found = players.find(p => normalizeName(p.name) === key);
    if(found) return playerDisplayName(found);
  }
  return String(pOrName || "").trim();
}

const AVATAR_CACHE_BUST = "zalo-v1";

function defaultAvatar(name){
  const initials = encodeURIComponent((name||"?").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase());
  return `https://ui-avatars.com/api/?name=${initials}&background=0f172a&color=ffffff&bold=true`;
}

/** Bust browser cache when avatar PNG files are replaced at the same path. */
function avatarSrc(url, fallbackName){
  const u = String(url || "").trim();
  if(!u) return fallbackName ? defaultAvatar(fallbackName) : defaultAvatar("?");
  if(u.startsWith("data:")) return u;
  if(u.startsWith("http://") || u.startsWith("https://")) {
    if(u.includes("ui-avatars.com")) return u;
  }
  const base = u.split("?")[0];
  return `${base}?v=${AVATAR_CACHE_BUST}`;
}
function normalizePos(v){return String(v||"").trim().toUpperCase();}

function splitPositions(v){
  return String(v || "")
    .toUpperCase()
    .split(/[\/,;|]/)
    .map(x => x.trim())
    .filter(x => POS.includes(x));
}

function formatPositionChain(position, secondary){
  const main = normalizePos(position);
  const secList = splitPositions(secondary).filter(x => x !== main);
  const seen = new Set();
  const all = [main, ...secList].filter(x => {
    if(!x || !POS.includes(x) || seen.has(x)) return false;
    seen.add(x);
    return true;
  });
  return all.join(", ");
}

function parsePositionChain(raw){
  const list = splitPositions(raw);
  if(!list.length) return { position: "", secondary_positions: "" };
  return {
    position: list[0],
    secondary_positions: list.slice(1).join(", ")
  };
}

function formatSideChain(preferredSide){
  return normalizeSideList(preferredSide).join(", ");
}

function parseSideChain(raw){
  return normalizeSideList(raw).join(", ");
}

function splitSecond(v){
  return splitPositions(v);
}

function removeVietnameseAccent(text){
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizeSideOne(v){
  const s = removeVietnameseAccent(v).trim().toUpperCase().replace(/\s+/g, " ");
  if(["LEFT", "L", "TRAI"].includes(s)) return "LEFT";
  if(["RIGHT", "R", "PHAI"].includes(s)) return "RIGHT";
  if(["CENTER", "CENTRE", "C", "TRUNG TAM", "GIUA"].includes(s)) return "CENTER";
  return "";
}

function normalizeSideList(v){
  const seen = new Set();
  const result = String(v || "")
    .split(/[\/,;|]/)
    .map(x => normalizeSideOne(x))
    .filter(Boolean)
    .filter(x => {
      if(seen.has(x)) return false;
      seen.add(x);
      return true;
    });
  return result;
}

function sideLabel(side){
  const arr = Array.isArray(side) ? side : (side ? [side] : []);
  return arr.map(s => {
    if(s === "LEFT") return "Trái";
    if(s === "RIGHT") return "Phải";
    if(s === "CENTER") return "Trung tâm";
    return s;
  }).filter(Boolean).join("/");
}

function sideFit(playerSide, slotSide){
  const sides = Array.isArray(playerSide) ? playerSide : (playerSide ? [playerSide] : []);
  if(!sides.length || !slotSide) return 0;

  const exactIndex = sides.indexOf(slotSide);
  if(exactIndex >= 0){
    // Giá trị đầu tiên là sở trường chính, các giá trị sau là phụ theo thứ tự.
    return [18, 10, 6, 4][exactIndex] || 4;
  }

  const primary = sides[0];
  if(primary === "CENTER" && (slotSide === "LEFT" || slotSide === "RIGHT")) return 3;
  if(slotSide === "CENTER" && (primary === "LEFT" || primary === "RIGHT")) return -3;
  return -8;
}

function playerDescSeed(text){
  const s = normalizeName(text);
  let h = 0;
  for(let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function playerDescPick(seed, salt, arr){
  if(!arr?.length) return "";
  return arr[Math.abs((seed + salt * 9973) | 0) % arr.length];
}

function playerFirstName(name){
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(name || "").trim();
}

function playerHasFullCard(p){
  return !!String(p?.profile_card || "").trim();
}

function playerPosLabel(pos){
  return ({ GK: "thủ môn", DEF: "hậu vệ", MID: "tiền vệ", FWD: "tiền đạo" })[pos] || "cầu thủ";
}

function generatePlayerDescription(p){
  return lookupPlayerLegendQuote(p);
}

function playerDescription(p){
  const custom = String(p?.description || "").trim();
  if(custom) return custom;
  return generatePlayerDescription(p);
}
