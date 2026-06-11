#!/usr/bin/env node
/**
 * Migrate data from Google Sheets + Apps Script → Cloudflare D1
 *
 * Usage:
 *   MIGRATE_SECRET=xxx WORKER_URL=https://dufc-api.xxx.workers.dev node scripts/migrate-from-sheets.mjs
 */

const WORKER_URL = (process.env.WORKER_URL || "").replace(/\/$/, "");
const MIGRATE_SECRET = process.env.MIGRATE_SECRET || "";
const SHEETS_CSV = process.env.SHEETS_CSV ||
  "https://docs.google.com/spreadsheets/d/1Ffv-98Ld8jW2AKu-1NmGXFbhsuWJogw83F5p0q0HRGU/gviz/tq?tqx=out:csv&gid=545791527";
const LEGACY_API = process.env.LEGACY_API ||
  "https://script.google.com/macros/s/AKfycbzBU3DIXutU2WkAKGgeBvUMaLllR_CowJtiPr92Flpdqo3qXaYCH_xZDDjOpMi0kvqH/exec";

if (!WORKER_URL || !MIGRATE_SECRET) {
  console.error("Set WORKER_URL and MIGRATE_SECRET env vars.");
  process.exit(1);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ""; });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.replace(/^"|"$/g, "").trim());
}

async function apiGet(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

async function main() {
  console.log("1/4 Loading roster from Google Sheet CSV...");
  const csvRes = await fetch(SHEETS_CSV + "&ts=" + Date.now());
  const csvText = await csvRes.text();
  const csvRows = parseCsv(csvText);

  const players = csvRows.map((row) => ({
    name: String(row.name || row["tên"] || row.ten || "").trim(),
    position: String(row.position || row["vị trí"] || row.vi_tri || "").trim(),
    preferred_side: String(row.preferred_side || row["khu vực"] || "").trim(),
    rating: Number(row.rating || row["điểm"] || row.diem || 5) || 5,
    mvp_count: Number(row.mvp_count || row.mvp || 0) || 0,
    avatar: String(row.avatar || row["ảnh"] || "").trim()
  })).filter((p) => p.name);

  console.log(`   → ${players.length} players`);

  console.log("2/4 Loading completed matches from legacy API...");
  const listData = await apiGet(`${LEGACY_API}?action=get_match_list&limit=100`);
  const matches = listData.matches || [];
  console.log(`   → ${matches.length} matches`);

  const summaries = [];
  const history = [];

  console.log("3/4 Loading match details...");
  for (const m of matches) {
    const detail = await apiGet(`${LEGACY_API}?action=get_match_detail&match_id=${encodeURIComponent(m.match_id)}`);
    const summary = detail.summary
      ? { ...m, ...detail.summary, match_id: m.match_id, status: detail.summary.status || "completed" }
      : { ...m, status: "completed" };
    summaries.push(summary);
    for (const p of detail.players || []) {
      history.push({
        match_id: m.match_id,
        match_date: detail.summary?.match_date || m.match_date,
        created_at: detail.summary?.created_at || "",
        team: p.team,
        shirt: p.shirt,
        formation: "",
        player_name: p.player_name,
        rating: p.rating,
        starter: p.starter,
        lineup_order: p.lineup_order,
        assigned_position: p.assigned_position,
        assigned_side: p.assigned_side,
        main_position: p.main_position,
        fit_label: p.fit_label,
        captain: p.captain,
        status: "completed",
        team_a_score: detail.summary?.team_a_score,
        team_b_score: detail.summary?.team_b_score,
        match_score: p.match_score,
        goals: p.goals,
        assists: p.assists,
        is_mvp: p.is_mvp,
        rating_before: p.rating_before,
        rating_delta: p.rating_delta,
        rating_after: p.rating_after,
        result_saved_at: detail.summary?.result_saved_at
      });
    }
  }

  // Pending match if any
  try {
    const pending = await apiGet(`${LEGACY_API}?action=get_pending_match`);
    if (pending.pending && pending.summary) {
      summaries.push(pending.summary);
      for (const p of pending.players || []) {
        history.push({
          match_id: pending.summary.match_id,
          match_date: pending.summary.match_date,
          created_at: pending.summary.created_at,
          team: p.team,
          shirt: p.shirt,
          player_name: p.player_name,
          rating: p.rating,
          starter: p.starter,
          lineup_order: p.lineup_order,
          assigned_position: p.assigned_position,
          assigned_side: p.assigned_side,
          main_position: p.main_position,
          fit_label: p.fit_label,
          captain: p.captain,
          status: pending.summary.status || "lineup_exported"
        });
      }
    }
  } catch (_) {}

  console.log(`   → ${history.length} history rows`);

  console.log("4/4 Importing to Cloudflare D1...");
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "import_data",
      migrate_secret: MIGRATE_SECRET,
      clear_history: true,
      players,
      summaries,
      history,
      seed_admin: true
    })
  });

  const result = await res.json();
  if (!result.ok) {
    console.error("Import failed:", result.error);
    process.exit(1);
  }

  console.log("Done!", result.imported);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
