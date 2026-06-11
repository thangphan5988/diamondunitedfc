/* Position/side normalization helpers */

function defaultAvatar(name){
  const initials = encodeURIComponent((name||"?").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase());
  return `https://ui-avatars.com/api/?name=${initials}&background=0f172a&color=ffffff&bold=true`;
}
function normalizePos(v){return String(v||"").trim().toUpperCase();}

function splitPositions(v){
  return String(v || "")
    .toUpperCase()
    .split(/[\/,;|]/)
    .map(x => x.trim())
    .filter(x => POS.includes(x));
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
