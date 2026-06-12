/**
 * Cập nhật avatar cầu thủ từ members.csv lên D1 qua API.
 * Usage: node cloudflare/scripts/sync-avatars-from-csv.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CSV_PATH = resolve(ROOT, "members.csv");
const WORKER_URL = process.env.WORKER_URL || "https://api.diamondunitedfc.com";
const PASSWORD = process.env.DUFC_PASSWORD || "dufc2026";
const USERNAME = process.env.DUFC_USERNAME || "admin";

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

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = line.split(",");
    const row = {};
    header.forEach((h, i) => { row[h] = (cols[i] || "").trim(); });
    return row;
  }).filter(r => r.name);
}

async function apiPost(action, payload) {
  const res = await fetch(`${WORKER_URL}?action=${action}`, {
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

async function main() {
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const { token } = await apiPost("admin_login", { username: USERNAME, password: PASSWORD });
  const current = await apiGet("admin_list_players", { session_token: token });
  const byNorm = new Map((current.players || []).map(p => [normalizeName(p.name), p]));

  let updated = 0;
  for (const row of rows) {
    const existing = byNorm.get(normalizeName(row.name));
    if (!existing) {
      console.log(`   ⚠ Không tìm thấy trên server: ${row.name}`);
      continue;
    }
    const avatar = String(row.avatar || "").trim();
    if (!avatar) continue;
    await apiPost("admin_save_player", {
      session_token: token,
      id: existing.id,
      name: existing.name,
      display_name: existing.display_name || "",
      position: existing.position || existing.main_position || "MID",
      secondary_positions: existing.secondary_positions || "",
      preferred_side: existing.preferred_side || "",
      base_rating: Number(existing.base_rating ?? existing.rating) || 5,
      mvp_count: Number(existing.mvp_count) || 0,
      joined_at: existing.joined_at || "",
      last_match_at: existing.last_match_at || "",
      avatar
    });
    updated++;
    console.log(`   ✓ ${row.name} → ${avatar}`);
  }
  console.log(`\n✅ Đã cập nhật avatar ${updated}/${rows.length} cầu thủ`);
}

main().catch(err => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
