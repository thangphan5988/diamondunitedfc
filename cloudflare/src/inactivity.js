import {
  normalizeName,
  clampBaseRating,
  effectiveRating,
  calcInactivityPenalty,
  daysSinceTimestamp
} from "./utils.js";

export async function syncPlayerLastMatchDates(db) {
  const rows = await db.prepare(`
    SELECT player_name_norm, MAX(COALESCE(NULLIF(result_saved_at, ''), created_at)) AS last_at
    FROM match_history
    WHERE status = 'completed'
    GROUP BY player_name_norm
  `).all();

  const update = db.prepare("UPDATE players SET last_match_at = ? WHERE name_norm = ?");
  const stmts = (rows.results || [])
    .filter((row) => row.last_at)
    .map((row) => update.bind(String(row.last_at), row.player_name_norm));
  if (stmts.length) await db.batch(stmts);
}

export function inactivityMetaForPlayer(player, lastMatchMap, nowMs = Date.now()) {
  if (Number(player?.is_anonymous) === 1 || player?.is_anonymous === true || player?.is_anonymous === "1") {
    const key = normalizeName(player.name);
    const lastAt = lastMatchMap.get(key) || player.last_match_at || player.joined_at || "";
    return {
      base_rating: 5,
      rating: 5,
      days_inactive: 0,
      inactivity_penalty: 0,
      last_match_at: lastAt || null
    };
  }
  const key = normalizeName(player.name);
  const baseRating = clampBaseRating(player.base_rating ?? player.rating ?? 5);
  const lastAt = lastMatchMap.get(key) || player.last_match_at || player.joined_at || "";
  const daysInactive = daysSinceTimestamp(lastAt, nowMs);
  const penalty = calcInactivityPenalty(daysInactive);
  const rating = effectiveRating(baseRating, penalty);
  return {
    base_rating: baseRating,
    rating,
    days_inactive: daysInactive,
    inactivity_penalty: penalty,
    last_match_at: lastAt || null
  };
}

export async function applyInactivityDecay(db, options = {}) {
  const nowMs = options.nowMs || Date.now();
  if (options.syncLastMatch !== false) {
    await syncPlayerLastMatchDates(db);
  }

  const players = await db.prepare("SELECT * FROM players ORDER BY name COLLATE NOCASE").all();
  const lastRows = await db.prepare(`
    SELECT player_name_norm, MAX(COALESCE(NULLIF(result_saved_at, ''), created_at)) AS last_at
    FROM match_history
    WHERE status = 'completed'
    GROUP BY player_name_norm
  `).all();
  const lastMatchMap = new Map(
    (lastRows.results || []).map((row) => [row.player_name_norm, String(row.last_at || "")])
  );

  const update = db.prepare(`
    UPDATE players
    SET base_rating = ?, rating = ?, last_match_at = COALESCE(NULLIF(?, ''), last_match_at)
    WHERE id = ?
  `);

  const stmts = [];
  let changed = 0;
  for (const player of players.results || []) {
    const meta = inactivityMetaForPlayer(player, lastMatchMap, nowMs);
    const prevBase = clampBaseRating(player.base_rating ?? player.rating ?? 5);
    const prevRating = Math.round(Number(player.rating) || 0);
    const lastAt = meta.last_match_at || player.last_match_at || player.joined_at || "";

    if (meta.rating !== prevRating || meta.base_rating !== prevBase) changed += 1;
    stmts.push(update.bind(
      meta.base_rating,
      meta.rating,
      lastAt,
      player.id
    ));
  }

  if (stmts.length) await db.batch(stmts);

  return {
    ok: true,
    scanned: players.results?.length || 0,
    changed
  };
}
