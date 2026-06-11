/**
 * Import trận nội bộ đầu tiên (lineup từ ảnh xuất) + điểm random 7/8/9.
 * Usage: node cloudflare/scripts/import-first-match.mjs
 */
const WORKER_URL = process.env.WORKER_URL || "https://dufc-api.thangpt5988.workers.dev";
const PASSWORD = process.env.DUFC_PASSWORD || "dufc2026";

const FORMATION = "3-1-2";
const MATCH_ID = "dufc-20260610-match01";
const MATCH_DATE = "10/6/2026";
const MATCH_LABEL = "DUFC · Thứ 4 · 10/6";
const CREATED_AT = "2026-06-10T18:30:00.000Z";

const TEAM_A = {
  shirt: "Áo Đỏ",
  starters: [
    { name: "Duc Hoang", assigned: "FWD", fit: "main_position" },
    { name: "Dinh Van", assigned: "FWD", fit: "secondary_position" },
    { name: "Do Thanh Tan", assigned: "MID", fit: "main_position" },
    { name: "Anh Phuong", assigned: "DEF", fit: "main_position" },
    { name: "Le Phuoc", assigned: "DEF", fit: "main_position" },
    { name: "Hoang", assigned: "DEF", fit: "main_position" },
    { name: "Xuan Diep", assigned: "GK", fit: "secondary_position" }
  ],
  bench: [
    { name: "A Nam - VIB", assigned: "MID", fit: "bench" },
    { name: "Vu Tuan", assigned: "DEF", fit: "bench" }
  ]
};

const TEAM_B = {
  shirt: "Áo Vàng",
  starters: [
    { name: "Phuc", assigned: "FWD", fit: "main_position" },
    { name: "Tuong Bang", assigned: "FWD", fit: "secondary_position" },
    { name: "Bao", assigned: "MID", fit: "main_position" },
    { name: "Minh Phat", assigned: "DEF", fit: "main_position", captain: true },
    { name: "Long", assigned: "DEF", fit: "main_position" },
    { name: "Dat", assigned: "DEF", fit: "main_position" },
    { name: "Nguyen Minh Viet", assigned: "GK", fit: "main_position" }
  ],
  bench: [
    { name: "Thanh Tan", assigned: "DEF", fit: "bench" }
  ]
};

const SCORE_POOL = [7, 8, 9];

function randScore() {
  return SCORE_POOL[Math.floor(Math.random() * SCORE_POOL.length)];
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

async function login(username) {
  const data = await apiPost("admin_login", { username, password: PASSWORD });
  return data.token;
}

function buildHistoryRows(rosterMap) {
  const rows = [];
  function addPlayers(teamKey, teamMeta) {
    teamMeta.starters.forEach((p, index) => {
      const roster = rosterMap.get(p.name);
      if (!roster) throw new Error(`Không tìm thấy cầu thủ: ${p.name}`);
      rows.push({
        match_id: MATCH_ID,
        match_date: MATCH_DATE,
        created_at: CREATED_AT,
        team: teamKey,
        shirt: teamMeta.shirt,
        formation: FORMATION,
        player_name: p.name,
        rating: roster.rating,
        starter: true,
        lineup_order: index + 1,
        assigned_position: p.assigned,
        assigned_side: "",
        main_position: roster.position.split(",")[0].trim(),
        secondary_positions: roster.position.split(",").slice(1).map((x) => x.trim()).join("/"),
        preferred_side: roster.preferred_side || "",
        fit_label: p.fit,
        captain: !!p.captain,
        image_filename: "dufc-lineup-20260610-match01.png",
        status: "lineup_exported"
      });
    });
    teamMeta.bench.forEach((p, index) => {
      const roster = rosterMap.get(p.name);
      if (!roster) throw new Error(`Không tìm thấy cầu thủ: ${p.name}`);
      rows.push({
        match_id: MATCH_ID,
        match_date: MATCH_DATE,
        created_at: CREATED_AT,
        team: teamKey,
        shirt: teamMeta.shirt,
        formation: FORMATION,
        player_name: p.name,
        rating: roster.rating,
        starter: false,
        lineup_order: index + 1,
        assigned_position: "BENCH",
        assigned_side: "",
        main_position: roster.position.split(",")[0].trim(),
        secondary_positions: roster.position.split(",").slice(1).map((x) => x.trim()).join("/"),
        preferred_side: roster.preferred_side || "",
        fit_label: "bench",
        captain: false,
        image_filename: "dufc-lineup-20260610-match01.png",
        status: "lineup_exported"
      });
    });
  }
  addPlayers("A", TEAM_A);
  addPlayers("B", TEAM_B);
  return rows;
}

function buildResultPlayers(teamKey, teamMeta, rosterMap) {
  const players = [];
  function pushPlayer(p, starter) {
    const roster = rosterMap.get(p.name);
    players.push({
      player_name: p.name,
      team: teamKey,
      starter,
      match_score: randScore(),
      goals: 0,
      assists: 0,
      rating_before: roster.rating,
      mvp_count_before: roster.mvp_count || 0,
      is_mvp: false
    });
  }
  teamMeta.starters.forEach((p) => pushPlayer(p, true));
  teamMeta.bench.forEach((p) => pushPlayer(p, false));
  return players;
}

async function main() {
  console.log("1/5 Load roster...");
  const rosterData = await apiGet("get_roster");
  const rosterMap = new Map((rosterData.players || []).map((p) => [p.name, p]));

  const rows = buildHistoryRows(rosterMap);
  const teamAScore = 3;
  const teamBScore = 4;
  const playersA = buildResultPlayers("A", TEAM_A, rosterMap);
  const playersB = buildResultPlayers("B", TEAM_B, rosterMap);

  console.log("2/5 Save lineup...");
  const adminToken = await login("admin");
  await apiPost("save_match_history", {
    session_token: adminToken,
    match_id: MATCH_ID,
    match_label: MATCH_LABEL,
    match_type: "internal",
    formation_a: FORMATION,
    formation_b: FORMATION,
    status: "lineup_exported",
    image_filename: "dufc-lineup-20260610-match01.png",
    team_a_lineup_confirmed: true,
    team_b_lineup_confirmed: true,
    rows
  });

  console.log("3/5 HLV Đội A xác nhận điểm...");
  const tokenA = await login("thangphan");
  await apiPost("save_match_result", {
    session_token: tokenA,
    match_id: MATCH_ID,
    match_label: MATCH_LABEL,
    match_type: "internal",
    team_a_score: teamAScore,
    team_b_score: teamBScore,
    finalize_match: false,
    players: playersA
  });

  console.log("4/5 HLV Đội B xác nhận điểm...");
  const tokenB = await login("minhphat");
  await apiPost("save_match_result", {
    session_token: tokenB,
    match_id: MATCH_ID,
    match_label: MATCH_LABEL,
    match_type: "internal",
    team_a_score: teamAScore,
    team_b_score: teamBScore,
    finalize_match: false,
    players: playersB
  });

  console.log("5/5 Host chốt trận...");
  const finalize = await apiPost("save_match_result", {
    session_token: adminToken,
    match_id: MATCH_ID,
    match_label: MATCH_LABEL,
    match_type: "internal",
    team_a_score: teamAScore,
    team_b_score: teamBScore,
    finalize_match: true,
    players: []
  });

  console.log("\n✓ Import xong!");
  console.log(`   Trận: ${MATCH_LABEL}`);
  console.log(`   Tỉ số: ${finalize.team_a_score} - ${finalize.team_b_score}`);
  console.log(`   MVP: ${(finalize.mvp_players || []).join(", ")}`);
  console.log("\n   Điểm cầu thủ:");
  [...playersA, ...playersB]
    .sort((a, b) => a.team.localeCompare(b.team) || a.player_name.localeCompare(b.player_name, "vi"))
    .forEach((p) => console.log(`   ${p.team} ${p.player_name}: ${p.match_score}`));
}

main().catch((e) => {
  console.error("Import failed:", e.message);
  process.exit(1);
});
