/* Position/side normalization helpers */

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

const AVATAR_CACHE_BUST = "20260612";

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

function isFallbackAvatarUrl(url){
  return String(url || "").includes("ui-avatars.com");
}

function playerCardFitMeta(p){
  const fitClass = p.fit === 2 ? "fitOk" : p.fit === 1 ? "fitAlt" : "fitBad";
  const fitSym = p.fit === 2 ? "✓" : p.fit === 1 ? "↔" : "⚠";
  const fitTitle = p.fit === 2 ? "Đúng sở trường" : p.fit === 1 ? "Vị trí phụ" : "Trái vị trí";
  return { fitClass, fitSym, fitTitle };
}

/** Full-card portrait art block (avatar PNG + overlay badges). */
function playerCardArtHtml(p, opts = {}){
  const src = avatarSrc(p.avatar, p.name);
  const fallback = defaultAvatar(p.name);
  const fallbackCls = isFallbackAvatarUrl(p.avatar) ? " playerCardArt--fallback" : "";
  const assigned = opts.assigned ?? p.assigned ?? p.main ?? "";
  const rating = opts.rating ?? p.rating ?? 5;
  const captain = opts.captain ?? !!p.captain;
  const showFit = opts.showFit !== false && p.fit !== undefined;
  const { fitClass, fitSym, fitTitle } = playerCardFitMeta(p);
  const captainEl = captain ? `<span class="captainBadge">C</span>` : "";
  const ratingEl = `<span class="ratingBadge">${rating}</span>`;
  const posEl = assigned ? `<span class="ppos">${escapeHtml(assigned)}</span>` : "";
  const fitEl = showFit
    ? `<span class="fit ${fitClass}" title="${escapeAttr(fitTitle)}"${p.fit === 2 ? ' style="display:none"' : ""}>${fitSym}</span>`
    : "";
  const topExtra = opts.topExtra || "";
  return `<div class="playerCardArt${fallbackCls}">
    <img class="playerCardImg" src="${escapeAttr(src)}" alt="" onerror="this.src='${fallback}'">
    <div class="playerCardShade"></div>
    ${topExtra}
    ${captainEl}${ratingEl}${posEl}${fitEl}
  </div>`;
}

function pitchCardHtml(p, teamClass){
  const captainCls = p.captain ? " captainCard" : "";
  const showName = isFallbackAvatarUrl(p.avatar);
  const nameEl = showName
    ? `<div class="playerCardMeta"><div class="pname">${escapeHtml(playerDisplayName(p))}</div></div>`
    : "";
  return `<div class="cardPlayer ${teamClass || ""}${captainCls}">${playerCardArtHtml(p, { captain: p.captain })}${nameEl}</div>`;
}

function benchItemHtml(p){
  return `<span class="benchRating">${p.rating || 5}</span>
    <span class="benchThumb">${playerCardArtHtml(p, { showFit: false, captain: false })}</span>
    <span class="benchItemText">${escapeHtml(playerDisplayName(p))} · ${escapeHtml(p.main || "")}</span>`;
}

function rosterThumbHtml(p){
  const src = avatarSrc(p.avatar, p.name);
  return `<span class="rosterThumb">${playerCardArtHtml(p, { showFit: false, captain: false, assigned: p.main })}</span>`;
}
