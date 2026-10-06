import {
  normalizeName,
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
  const baseRating = Math.max(0, Math.round(Number(player.base_rating ?? player.rating) || 0));
  const lastAt = lastMatchMap.get(key) || player.last_match_at || player.joined_at || "";
  const daysInactive = daysSinceTimestamp(lastAt, nowMs);
  return {
    base_rating: baseRating,
    rating: baseRating,
    days_inactive: daysInactive,
    inactivity_penalty: 0,
    last_match_at: lastAt || null
  };
}

export async function applyInactivityDecay(db, options = {}) {
  if (options.syncLastMatch !== false) {
    await syncPlayerLastMatchDates(db);
  }
  return { ok: true, scanned: 0, changed: 0 };
}
