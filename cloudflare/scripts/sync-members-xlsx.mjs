/**
 * Đồng bộ roster từ DiamondUnitedFC-Members.xlsx
 * - position: mục đầu = vị trí sở trường, các mục sau = phụ
 * - preferred_side: mục đầu = cánh sở trường, các mục sau = phụ
 *
 * Usage:
 *   node cloudflare/scripts/sync-members-xlsx.mjs [/path/to/file.xlsx]
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const WORKER_URL = process.env.WORKER_URL || "https://api.diamondunitedfc.com";
const PASSWORD = process.env.DUFC_PASSWORD || "dufc2026";
const USERNAME = process.env.DUFC_USERNAME || "admin";
const XLSX_PATH = process.argv[2] || "/Users/thangphan/Downloads/DiamondUnitedFC-Members.xlsx";

const POS = new Set(["GK", "DEF", "MID", "FWD"]);

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitPositions(raw) {
  const out = [];
  for (const part of String(raw || "").toUpperCase().split(/[\/,;|]/)) {
    const x = part.trim();
    if (POS.has(x) && !out.includes(x)) out.push(x);
  }
  return out;
}

function splitSides(raw) {
  const map = {
    LEFT: "LEFT", L: "LEFT", TRAI: "LEFT",
    RIGHT: "RIGHT", R: "RIGHT", PHAI: "RIGHT",
    CENTER: "CENTER", CENTRE: "CENTER", C: "CENTER",
    "TRUNG TAM": "CENTER", GIUA: "CENTER"
  };
  const out = [];
  for (const part of String(raw || "").split(/[\/,;|]/)) {
    const n = map[String(part || "").trim().toUpperCase().replace(/\s+/g, " ")] || "";
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function parsePlayerRow(row) {
  const name = String(row.name || "").trim();
  if (!name) return null;
  const positions = splitPositions(row.position);
  const sides = splitSides(row.preferred_side);
  const ratingRaw = row.rating;
  const rating = Number.isFinite(Number(ratingRaw)) ? Math.max(0, Math.round(Number(ratingRaw))) : 5;
  return {
    name,
    position: positions[0] || "MID",
    secondary_positions: positions.slice(1).join(", "),
    preferred_side: sides.join(", "),
    base_rating: rating,
    avatar: String(row.avatar || "").trim()
  };
}

function parseXlsxWithPython(filePath) {
  const py = `
import zipfile, xml.etree.ElementTree as ET, json, sys
path = sys.argv[1]
with zipfile.ZipFile(path) as z:
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        for si in root.findall('m:si', ns):
            texts = [(t.text or '') for t in si.findall('.//m:t', ns)]
            shared.append(''.join(texts))
    sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows = []
    for row in sheet.findall('m:sheetData/m:row', ns):
        vals = []
        for c in row.findall('m:c', ns):
            t = c.get('t')
            v = c.find('m:v', ns)
            if v is None: vals.append('')
            elif t == 's': vals.append(shared[int(v.text)])
            else: vals.append(v.text)
        rows.append(vals)
header = [h.strip().lower() for h in rows[0]]
out = []
for r in rows[1:]:
    if not r or not str(r[0]).strip(): continue
    obj = {}
    for i, h in enumerate(header):
        obj[h] = r[i] if i < len(r) else ''
    out.append(obj)
print(json.dumps(out, ensure_ascii=False))
`;
  const result = spawnSync("python3", ["-c", py, filePath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Không đọc được file Excel.");
  }
  return JSON.parse(result.stdout);
}

async function apiPost(action, payload = {}) {
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `API error: ${action}`);
  return data;
}

async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params, ts: String(Date.now()) });
  const res = await fetch(`${WORKER_URL}?${qs}`, { cache: "no-store" });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `API error: ${action}`);
  return data;
}

async function login() {
  const data = await apiPost("admin_login", { username: USERNAME, password: PASSWORD });
  return data.token;
}

async function main() {
  if (!existsSync(XLSX_PATH)) {
    throw new Error(`Không tìm thấy file: ${XLSX_PATH}`);
  }

  console.log(`📄 Đọc file: ${XLSX_PATH}`);
  const rawRows = parseXlsxWithPython(XLSX_PATH);
  const sheetPlayers = rawRows.map(parsePlayerRow).filter(Boolean);
  if (!sheetPlayers.length) throw new Error("File Excel không có dữ liệu cầu thủ.");

  console.log(`   → ${sheetPlayers.length} cầu thủ trong Excel`);

  console.log("🔐 Đăng nhập API...");
  const token = await login();

  console.log("📥 Tải roster hiện tại...");
  const current = await apiGet("admin_list_players", { session_token: token });
  const byNorm = new Map(
    (current.players || []).map((p) => [normalizeName(p.name), p])
  );

  let updated = 0;
  let created = 0;

  for (const row of sheetPlayers) {
    const key = normalizeName(row.name);
    const existing = byNorm.get(key);
    const payload = {
      session_token: token,
      name: row.name,
      position: row.position,
      secondary_positions: row.secondary_positions,
      preferred_side: row.preferred_side,
      base_rating: row.base_rating,
      avatar: row.avatar
    };

    if (existing) {
      payload.id = existing.id;
      payload.display_name = existing.display_name || "";
      payload.mvp_count = Number(existing.mvp_count) || 0;
      payload.joined_at = existing.joined_at || "";
      payload.last_match_at = existing.last_match_at || "";
      await apiPost("admin_save_player", payload);
      updated++;
      console.log(`   ✓ Cập nhật: ${row.name} · ${row.position}${row.secondary_positions ? ", " + row.secondary_positions : ""} · ${row.preferred_side || "—"}`);
    } else {
      await apiPost("admin_save_player", payload);
      created++;
      console.log(`   + Thêm mới: ${row.name}`);
    }
  }

  console.log(`\n✅ Xong — cập nhật ${updated}, thêm mới ${created}, tổng ${sheetPlayers.length}`);
}

main().catch((err) => {
  console.error("Sync failed:", err.message || err);
  process.exit(1);
});
