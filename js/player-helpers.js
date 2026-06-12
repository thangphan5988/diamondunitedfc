/* Position/side normalization helpers */

function jerseyLabel(jerseyNumber){
  if(jerseyNumber == null || jerseyNumber === "") return "";
  const n = Number(jerseyNumber);
  if(!Number.isFinite(n) || n < 0) return "";
  return `#${Math.round(n)}`;
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

function playerDescSeed(name){
  const s = normalizeName(name);
  let h = 0;
  for(let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function playerHasFullCard(p){
  return !!String(p?.profile_card || "").trim();
}

function generatePlayerDescription(p){
  const name = playerDisplayName(p);
  const pos = normalizePos(p?.main || p?.position || "MID");
  const seed = playerDescSeed(p?.name || name);
  const jersey = p?.jersey_number != null && p?.jersey_number !== "" ? Number(p.jersey_number) : null;
  const poster = playerHasFullCard(p);
  const rating = Number(p?.rating ?? p?.base_rating) || 5;

  const avatarHints = poster ? [
    "ảnh poster full chất như MV bóng đá",
    "face card full HD — nhìn phát biết main character",
    "avatar full oai, đăng story không cần filter"
  ] : [
    "avatar Zalo tròn nhưng skill vuông vức",
    "nút like Zalo nhiều, xứng đáng like trên sân",
    "chụp Zalo thì hiền, vào sân thì hơi ác"
  ];

  const byPos = {
    GK: [
      "{name} – thủ thành {hint}. Tay bắt bóng nhanh hơn tay rep tin nhắn nhóm.",
      "{name} – khung thành là vùng cấm, kể cả drama. {hint}.",
      "{name} – người duy nhất được phép dùng tay mà vẫn ngầu. {hint}.",
      "{name} – catwalk giữa cột dọc, {hint}."
    ],
    DEF: [
      "{name} – hậu vệ {hint}. Phá bóng sạch, phá vibe đối thủ cũng sạch.",
      "{name} – bức tường sân 7, {hint}. Đối phương muốn qua thì xin phép trước.",
      "{name} – thích chơi đùa nhưng không thích đùa với tiền đạo. {hint}.",
      "{name} – clear bóng mạnh như clear lịch cuối tuần. {hint}."
    ],
    MID: [
      "{name} – tiền vệ {hint}. Chuyền bóng như share vibe, chuyền trách nhiệm thì hạn chế.",
      "{name} – engine sân cỏ, {hint}. Chạy nhiều nhưng than trời thì ít.",
      "{name} – nhìn map sân như nhìn bàn nhậu: ai cũng phải có bóng. {hint}.",
      "{name} – kiêm DJ sân 7, {hint}. Drop beat bằng đường chọc khe."
    ],
    FWD: [
      "{name} – máy dội biên người, {hint}. Thỉnh thoảng quên bóng ở… lưới đối phương.",
      "{name} – tiền đạo {hint}. Sút xa được, sức hút spotlight cũng xa được.",
      "{name} – vào vòng cấm như vào trend: tự nhiên mà cháy. {hint}.",
      "{name} – ăn bóng như ăn vạ… à không, ăn bóng như ăn cơm. {hint}."
    ]
  };

  const templates = byPos[pos] || byPos.MID;
  const hint = avatarHints[(seed >> 2) % avatarHints.length];
  let line = templates[seed % templates.length]
    .replace("{name}", name)
    .replace("{hint}", hint);

  if(Number.isFinite(jersey) && jersey > 0){
    const jerseyLines = [
      ` Áo #${jersey} — mang vào auto +2 swagger.`,
      ` Số ${jersey} trên lưng, tên trên caption.`,
      ` #${jersey} là mật mã, đối thủ tự hiểu.`
    ];
    line += jerseyLines[(seed >> 4) % jerseyLines.length];
  }

  if(rating >= 9) line += " Rating cỡ này thì hơi bị gian lận luật đẹp trai.";
  else if(rating >= 7) line += " Form ổn, meme ổn hơn.";

  return line;
}

function playerDescription(p){
  const custom = String(p?.description || "").trim();
  if(custom) return custom;
  return generatePlayerDescription(p);
}
