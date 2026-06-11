import {
  APP_VERSION,
  normalizeName,
  normalizeMatchDate,
  calcRatingDelta,
  clampRating,
  clampStatCount,
  boolish,
  applyTeamMvpRules,
  mapHistoryPlayer,
  mapSummary,
  json,
  corsPreflight
} from "./utils.js";
import {
  ensureDefaultAdmin,
  requireAuth,
  adminLogin,
  adminLogout,
  adminValidateSession,
  adminListUsers,
  adminSaveUser,
  adminDeleteUser
} from "./auth.js";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return corsPreflight();

    const db = env.DB;
    const pepper = env.AUTH_PEPPER || "dufc-auth-pepper-v1";

    try {
      await ensureDefaultAdmin(db, pepper);

      const url = new URL(request.url);
      let payload = {};
      let params = Object.fromEntries(url.searchParams.entries());

      if (request.method === "POST") {
        payload = await request.json().catch(() => ({}));
      }

      const action = String(
        request.method === "POST" ? payload.action : params.action || ""
      ).trim();

      if (!action) {
        return json({
          ok: true,
          service: "DUFC API (Cloudflare D1)",
          version: APP_VERSION,
          storage: "cloudflare-d1",
          actions: [
            "save_match_history", "save_match_result", "cancel_match", "delete_match",
            "admin_login", "admin_logout", "admin_save_user", "admin_delete_user",
            "get_roster", "get_match_list", "get_match_detail", "get_pending_match",
            "get_latest_lineup", "get_latest_result", "get_player_stats",
            "admin_validate_session", "admin_list_users", "import_data"
          ]
        });
      }

      const token = payload.session_token || params.session_token || "";

      switch (action) {
        case "get_roster":
          return json(await getRoster(db));
        case "get_match_list":
          return json(await getMatchList(db, params));
        case "get_match_detail":
          return json(await getMatchDetail(db, params));
        case "get_pending_match":
          return json(await getPendingMatch(db));
        case "get_latest_lineup":
        case "get_latest_result":
          return json(await getLatestResult(db));
        case "get_player_stats":
          return json(await getPlayerStats(db));
        case "admin_validate_session":
          return json(await adminValidateSession(db, token));
        case "admin_list_users":
          await requireAuth(db, token, ["manage_users"]);
          return json(await adminListUsers(db));
        case "admin_login":
          return json(await adminLogin(db, payload, pepper));
        case "admin_logout":
          return json(await adminLogout(db, token));
        case "admin_save_user":
          await requireAuth(db, token, ["manage_users"]);
          return json(await adminSaveUser(db, payload, pepper));
        case "admin_delete_user":
          const session = await requireAuth(db, token, ["manage_users"]);
          return json(await adminDeleteUser(db, session, payload.username));
        case "save_match_history":
          await requireAuth(db, token, ["export", "lineup_internal", "lineup_cap"]);
          return json(await saveMatchHistory(db, payload));
        case "save_match_result":
          await requireAuth(db, token, ["match_result"]);
          return json(await saveMatchResult(db, payload));
        case "cancel_match":
          await requireAuth(db, token, ["cancel_match"]);
          return json(await cancelMatch(db, payload));
        case "delete_match":
          await requireAuth(db, token, ["delete_match"]);
          return json(await deleteCompletedMatch(db, payload));
        case "import_data":
          return json(await importData(db, payload, env.MIGRATE_SECRET, pepper));
        default:
          return json({ ok: false, error: "Invalid action: " + action }, 400);
      }
    } catch (err) {
      return json({ ok: false, error: String(err.message || err) }, 400);
    }
  }
};

async function getRoster(db) {
  const rows = await db.prepare(
    "SELECT name, position, secondary_positions, preferred_side, rating, mvp_count, avatar FROM players ORDER BY name COLLATE NOCASE"
  ).all();
  return { ok: true, version: APP_VERSION, players: rows.results || [] };
}

async function getMatchList(db, params) {
  const limit = Math.max(1, Math.min(100, Number(params.limit) || 30));
  const rows = await db.prepare(
    `SELECT * FROM match_summary WHERE status = 'completed'
     ORDER BY COALESCE(result_saved_at, created_at) DESC LIMIT ?`
  ).bind(limit).all();
  const matches = (rows.results || []).map((r) => ({
    match_id: r.match_id,
    match_label: r.match_label,
    match_date: r.match_date,
    match_type: r.match_type,
    opponent_name: r.opponent_name,
    team_a_score: r.team_a_score,
    team_b_score: r.team_b_score,
    mvp_players: r.mvp_players,
    formation_a: r.formation_a,
    formation_b: r.formation_b,
    player_count: r.player_count,
    image_filename: r.image_filename,
    result_saved_at: r.result_saved_at
  }));
  return { ok: true, version: APP_VERSION, matches };
}

async function getMatchDetail(db, params) {
  const matchId = String(params.match_id || "").trim();
  if (!matchId) throw new Error("match_id is required");

  const summary = await db.prepare("SELECT * FROM match_summary WHERE match_id = ?").bind(matchId).first();
  if (!summary) throw new Error("Match not found: " + matchId);

  const players = await db.prepare(
    "SELECT * FROM match_history WHERE match_id = ? ORDER BY team, starter DESC, player_name"
  ).bind(matchId).all();

  return {
    ok: true,
    version: APP_VERSION,
    summary: mapSummary(summary),
    players: (players.results || []).map(mapHistoryPlayer)
  };
}

async function getPendingMatch(db) {
  const summary = await db.prepare(
    `SELECT * FROM match_summary WHERE status = 'lineup_exported'
     ORDER BY created_at DESC LIMIT 1`
  ).first();

  let matchId = summary?.match_id || "";
  if (!matchId) {
    const row = await db.prepare(
      `SELECT match_id FROM match_history
       WHERE status IS NULL OR status = '' OR status != 'completed'
       ORDER BY created_at DESC LIMIT 1`
    ).first();
    matchId = row?.match_id || "";
  }

  if (!matchId) return { ok: true, version: APP_VERSION, pending: false };

  const detail = await getMatchDetail(db, { match_id: matchId });
  detail.pending = String(detail.summary?.status || "").toLowerCase() !== "completed";
  return detail;
}

async function getLatestResult(db) {
  const summary = await db.prepare(
    `SELECT match_id FROM match_summary WHERE status = 'completed'
     ORDER BY COALESCE(result_saved_at, created_at) DESC LIMIT 1`
  ).first();

  if (!summary) {
    return { ok: true, version: APP_VERSION, found: false, summary: null, players: [] };
  }

  const detail = await getMatchDetail(db, { match_id: summary.match_id });
  detail.found = true;
  return detail;
}

async function getPlayerStats(db) {
  const rows = await db.prepare(
    `SELECT MAX(player_name) AS player_name, SUM(goals) AS goals, SUM(assists) AS assists
     FROM match_history WHERE status = 'completed'
     GROUP BY player_name_norm
     ORDER BY goals DESC, assists DESC, player_name COLLATE NOCASE`
  ).all();

  return {
    ok: true,
    version: APP_VERSION,
    stats: (rows.results || []).map((r) => ({
      player_name: r.player_name,
      goals: Number(r.goals) || 0,
      assists: Number(r.assists) || 0
    }))
  };
}

async function deletePendingByDate(db, matchDate) {
  const norm = normalizeMatchDate(matchDate);
  if (!norm) return { deletedRows: 0, deletedSummary: 0 };

  const delHist = await db.prepare(
    `DELETE FROM match_history WHERE match_date_norm = ? AND (status IS NULL OR status = '' OR status != 'completed')`
  ).bind(norm).run();

  const delSum = await db.prepare(
    `DELETE FROM match_summary WHERE match_date_norm = ? AND status != 'completed'`
  ).bind(norm).run();

  return {
    deletedRows: delHist.meta?.changes || 0,
    deletedSummary: delSum.meta?.changes || 0
  };
}

async function saveMatchHistory(db, payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) return { ok: false, error: "No rows" };

  const matchId = String(payload.match_id || "").trim();
  if (!matchId) return { ok: false, error: "match_id is required" };

  const matchDate = String(rows[0].match_date || "").trim();
  const matchDateNorm = normalizeMatchDate(matchDate);
  const deleted = await deletePendingByDate(db, matchDate);

  const matchType = String(payload.match_type || "internal").trim().toLowerCase();
  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO match_history (
      match_id, match_date, match_date_norm, created_at, team, shirt, formation,
      player_name, player_name_norm, rating, starter, lineup_order,
      assigned_position, assigned_side, main_position, secondary_positions,
      preferred_side, fit_label, captain, image_filename, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmts = [];
  for (const row of rows) {
    const status = row.status || "lineup_exported";
    stmts.push(insert.bind(
      matchId,
      matchDate,
      matchDateNorm,
      row.created_at || now,
      row.team || "",
      row.shirt || "",
      row.formation || "",
      row.player_name || "",
      normalizeName(row.player_name),
      Number(row.rating) || 5,
      boolish(row.starter) ? 1 : 0,
      Number(row.lineup_order) || 0,
      row.assigned_position || "",
      row.assigned_side || "",
      row.main_position || "",
      row.secondary_positions || "",
      row.preferred_side || "",
      row.fit_label || "",
      boolish(row.captain) ? 1 : 0,
      row.image_filename || payload.image_filename || "",
      status
    ));
  }
  await db.batch(stmts);

  await db.prepare(`
    INSERT INTO match_summary (
      match_id, match_label, match_date, match_date_norm, created_at, match_type,
      opponent_name, formation_a, formation_b, player_count, status, image_filename
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lineup_exported', ?)
  `).bind(
    matchId,
    payload.match_label || "",
    matchDate,
    matchDateNorm,
    now,
    matchType,
    payload.opponent_name || "",
    payload.formation_a || "",
    payload.formation_b || "",
    rows.length,
    rows[0]?.image_filename || ""
  ).run();

  return {
    ok: true,
    version: APP_VERSION,
    match_id: matchId,
    match_date: matchDate,
    normalized_match_date: matchDateNorm,
    deleted_old_rows: deleted.deletedRows,
    deleted_pending_summary: deleted.deletedSummary,
    inserted_rows: rows.length,
    status: "lineup_exported"
  };
}

async function saveMatchResult(db, payload) {
  const matchId = String(payload.match_id || "").trim();
  const teamAScore = Number(payload.team_a_score);
  const teamBScore = Number(payload.team_b_score);
  let players = Array.isArray(payload.players) ? payload.players : [];

  if (!matchId) throw new Error("match_id is required");
  if (!Number.isFinite(teamAScore) || !Number.isFinite(teamBScore)) {
    throw new Error("team_a_score and team_b_score are required");
  }
  if (!players.length) throw new Error("players is required");

  const matchType = String(payload.match_type || "internal").trim().toLowerCase();
  players = applyTeamMvpRules(players, matchType);

  let summary = await db.prepare("SELECT * FROM match_summary WHERE match_id = ?").bind(matchId).first();
  if (!summary) {
    const byLabel = payload.match_label
      ? await db.prepare(
          `SELECT * FROM match_summary WHERE match_label = ? AND status != 'completed' ORDER BY created_at DESC LIMIT 1`
        ).bind(payload.match_label).first()
      : null;
    if (byLabel) {
      await db.prepare("UPDATE match_summary SET match_id = ? WHERE match_id = ?").bind(matchId, byLabel.match_id).run();
      await db.prepare("UPDATE match_history SET match_id = ? WHERE match_id = ?").bind(matchId, byLabel.match_id).run();
      summary = await db.prepare("SELECT * FROM match_summary WHERE match_id = ?").bind(matchId).first();
    }
  }

  if (!summary) {
    const hist = await db.prepare("SELECT * FROM match_history WHERE match_id = ? LIMIT 1").bind(matchId).first();
    if (!hist) throw new Error("Không tìm thấy trận. Vui lòng xuất ảnh đội hình lại.");
    await db.prepare(`
      INSERT INTO match_summary (match_id, match_label, match_date, match_date_norm, created_at, match_type, status, player_count)
      VALUES (?, ?, ?, ?, ?, ?, 'lineup_exported', ?)
    `).bind(
      matchId,
      payload.match_label || "",
      hist.match_date,
      hist.match_date_norm,
      hist.created_at,
      matchType,
      (await db.prepare("SELECT COUNT(*) AS c FROM match_history WHERE match_id = ?").bind(matchId).first())?.c || 0
    ).run();
    summary = await db.prepare("SELECT * FROM match_summary WHERE match_id = ?").bind(matchId).first();
  }

  if (summary.status === "completed") throw new Error("Match already completed and cannot be edited");

  const mvpNames = players.filter((p) => p.is_mvp).map((p) => p.player_name);
  const savedAt = new Date().toISOString();
  const matchDate = summary.match_date || "";

  await db.prepare(`
    UPDATE match_summary SET
      team_a_score = ?, team_b_score = ?, mvp_players = ?, status = 'completed',
      result_saved_at = ?, opponent_name = COALESCE(?, opponent_name),
      match_type = COALESCE(?, match_type)
    WHERE match_id = ?
  `).bind(
    teamAScore, teamBScore, mvpNames.join(", "),
    savedAt, payload.opponent_name || null, matchType || null, matchId
  ).run();

  const historyRows = await db.prepare("SELECT * FROM match_history WHERE match_id = ?").bind(matchId).all();
  const playerMap = {};
  players.forEach((p) => { playerMap[normalizeName(p.player_name)] = p; });

  const updateHist = db.prepare(`
    UPDATE match_history SET
      status = 'completed', team_a_score = ?, team_b_score = ?, match_score = ?,
      goals = ?, assists = ?, is_mvp = ?, rating_before = ?, rating_delta = ?,
      rating_after = ?, result_saved_at = ?
    WHERE id = ?
  `);

  const histStmts = [];
  for (const row of historyRows.results || []) {
    const item = playerMap[normalizeName(row.player_name)];
    if (!item) continue;
    const ratingBefore = clampRating(item.rating_before);
    const delta = calcRatingDelta(item.match_score);
    const ratingAfter = clampRating(ratingBefore + delta);
    histStmts.push(updateHist.bind(
      teamAScore, teamBScore, item.match_score,
      clampStatCount(item.goals), clampStatCount(item.assists),
      item.is_mvp ? 1 : 0, ratingBefore, delta, ratingAfter, savedAt, row.id
    ));
  }
  if (histStmts.length) await db.batch(histStmts);

  await updateRosterFromResult(db, players, matchId, matchDate, savedAt);

  return {
    ok: true,
    version: APP_VERSION,
    match_id: matchId,
    match_label: summary.match_label,
    status: "completed",
    mvp_players: mvpNames,
    saved_at: savedAt
  };
}

async function updateRosterFromResult(db, players, matchId, matchDate, savedAt) {
  const rosterRows = await db.prepare("SELECT * FROM players").all();
  const rosterMap = {};
  for (const r of rosterRows.results || []) {
    rosterMap[normalizeName(r.name)] = r;
  }

  const updatePlayer = db.prepare("UPDATE players SET rating = ?, mvp_count = ? WHERE id = ?");
  const insertLog = db.prepare(`
    INSERT INTO rating_log (
      match_id, match_date, player_name, match_score, rating_before, rating_delta,
      rating_after, is_mvp, mvp_count_before, mvp_count_after, saved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmts = [];
  for (const p of players) {
    const key = normalizeName(p.player_name);
    const roster = rosterMap[key];
    const ratingBefore = clampRating(p.rating_before);
    const delta = calcRatingDelta(p.match_score);
    const ratingAfter = clampRating(ratingBefore + delta);
    const mvpBefore = Math.max(0, Math.round(Number(p.mvp_count_before) || roster?.mvp_count || 0));
    const mvpAfter = mvpBefore + (p.is_mvp ? 1 : 0);

    if (roster) {
      stmts.push(updatePlayer.bind(ratingAfter, mvpAfter, roster.id));
    }

    stmts.push(insertLog.bind(
      matchId, matchDate, p.player_name, Number(p.match_score),
      ratingBefore, delta, ratingAfter, p.is_mvp ? 1 : 0,
      mvpBefore, mvpAfter, savedAt
    ));
  }
  if (stmts.length) await db.batch(stmts);
}

async function recalculateRosterFromLogs(db, removedLogs = []) {
  const rosterRows = await db.prepare("SELECT * FROM players").all();
  const remainingLogs = await db.prepare(
    "SELECT * FROM rating_log ORDER BY saved_at ASC, id ASC"
  ).all();

  const logsByPlayer = {};
  for (const log of remainingLogs.results || []) {
    const key = normalizeName(log.player_name);
    if (!logsByPlayer[key]) logsByPlayer[key] = [];
    logsByPlayer[key].push(log);
  }

  const removedByPlayer = {};
  for (const log of removedLogs) {
    const key = normalizeName(log.player_name);
    if (!removedByPlayer[key]) removedByPlayer[key] = log;
  }

  const updatePlayer = db.prepare("UPDATE players SET rating = ?, mvp_count = ? WHERE id = ?");
  const stmts = [];

  for (const r of rosterRows.results || []) {
    const key = normalizeName(r.name);
    const logs = logsByPlayer[key] || [];
    let rating;
    let mvpCount;

    if (logs.length) {
      const last = logs[logs.length - 1];
      rating = clampRating(last.rating_after);
      mvpCount = Math.max(0, Math.round(Number(last.mvp_count_after) || 0));
    } else if (removedByPlayer[key]) {
      rating = clampRating(removedByPlayer[key].rating_before);
      mvpCount = Math.max(0, Math.round(Number(removedByPlayer[key].mvp_count_before) || 0));
    } else {
      continue;
    }

    stmts.push(updatePlayer.bind(rating, mvpCount, r.id));
  }

  if (stmts.length) await db.batch(stmts);
}

async function deleteCompletedMatch(db, payload) {
  const matchId = String(payload.match_id || "").trim();
  if (!matchId) throw new Error("match_id is required");

  const summary = await db.prepare("SELECT status FROM match_summary WHERE match_id = ?").bind(matchId).first();
  if (!summary) throw new Error("Không tìm thấy trận: " + matchId);
  if (summary.status !== "completed") {
    throw new Error("Chỉ xóa được trận đã hoàn tất trong lịch sử.");
  }

  const removedLogs = (await db.prepare("SELECT * FROM rating_log WHERE match_id = ?").bind(matchId).all()).results || [];

  await db.prepare("DELETE FROM rating_log WHERE match_id = ?").bind(matchId).run();
  const delHist = await db.prepare("DELETE FROM match_history WHERE match_id = ?").bind(matchId).run();
  const delSum = await db.prepare("DELETE FROM match_summary WHERE match_id = ?").bind(matchId).run();

  await recalculateRosterFromLogs(db, removedLogs);

  return {
    ok: true,
    version: APP_VERSION,
    match_id: matchId,
    deleted_history_rows: delHist.meta?.changes || 0,
    deleted_summary_rows: delSum.meta?.changes || 0,
    status: "deleted"
  };
}

async function cancelMatch(db, payload) {
  const matchId = String(payload.match_id || "").trim();
  if (!matchId) throw new Error("match_id is required");

  const summary = await db.prepare("SELECT status FROM match_summary WHERE match_id = ?").bind(matchId).first();
  if (summary?.status === "completed") throw new Error("Không thể hủy trận đã hoàn tất.");

  const delHist = await db.prepare(
    `DELETE FROM match_history WHERE match_id = ? AND (status IS NULL OR status != 'completed')`
  ).bind(matchId).run();

  const delSum = await db.prepare(
    `DELETE FROM match_summary WHERE match_id = ? AND status != 'completed'`
  ).bind(matchId).run();

  return {
    ok: true,
    version: APP_VERSION,
    match_id: matchId,
    deleted_history_rows: delHist.meta?.changes || 0,
    deleted_summary_rows: delSum.meta?.changes || 0,
    status: "cancelled"
  };
}

async function importData(db, payload, secret, pepper) {
  if (!secret || payload.migrate_secret !== secret) {
    throw new Error("Unauthorized migration");
  }

  let imported = { players: 0, summaries: 0, history: 0 };

  if (Array.isArray(payload.players)) {
    await db.prepare("DELETE FROM players").run();
    const ins = db.prepare(`
      INSERT OR REPLACE INTO players (name, name_norm, position, secondary_positions, preferred_side, rating, mvp_count, avatar)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stmts = payload.players.map((p) => ins.bind(
      p.name,
      normalizeName(p.name),
      p.position || p.main || "MID",
      p.secondary_positions || "",
      p.preferred_side || "",
      clampRating(p.rating || 5),
      Math.max(0, Math.round(Number(p.mvp_count) || 0)),
      p.avatar || ""
    ));
    if (stmts.length) await db.batch(stmts);
    imported.players = stmts.length;
  }

  if (Array.isArray(payload.summaries)) {
    for (const s of payload.summaries) {
      await db.prepare(`
        INSERT OR REPLACE INTO match_summary (
          match_id, match_label, match_date, match_date_norm, created_at, match_type,
          opponent_name, formation_a, formation_b, team_a_score, team_b_score,
          mvp_players, player_count, status, image_filename, result_saved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        s.match_id, s.match_label || "", s.match_date || "", normalizeMatchDate(s.match_date),
        s.created_at || "", s.match_type || "internal", s.opponent_name || "",
        s.formation_a || "", s.formation_b || "", String(s.team_a_score ?? ""),
        String(s.team_b_score ?? ""), s.mvp_players || "", Number(s.player_count) || 0,
        s.status || "lineup_exported", s.image_filename || "", s.result_saved_at || ""
      ).run();
      imported.summaries++;
    }
  }

  if (payload.clear_history) {
    await db.prepare("DELETE FROM match_history").run();
    await db.prepare("DELETE FROM match_summary").run();
    await db.prepare("DELETE FROM rating_log").run();
  }

  if (Array.isArray(payload.history)) {
    const ins = db.prepare(`
      INSERT INTO match_history (
        match_id, match_date, match_date_norm, created_at, team, shirt, formation,
        player_name, player_name_norm, rating, starter, lineup_order,
        assigned_position, assigned_side, main_position, secondary_positions,
        preferred_side, fit_label, captain, image_filename, status,
        team_a_score, team_b_score, match_score, goals, assists, is_mvp,
        rating_before, rating_delta, rating_after, result_saved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stmts = payload.history.map((h) => ins.bind(
      h.match_id, h.match_date || "", normalizeMatchDate(h.match_date), h.created_at || "",
      h.team || "", h.shirt || "", h.formation || "", h.player_name || "",
      normalizeName(h.player_name), Number(h.rating) || 5, boolish(h.starter) ? 1 : 0,
      Number(h.lineup_order) || 0, h.assigned_position || "", h.assigned_side || "",
      h.main_position || "", h.secondary_positions || "", h.preferred_side || "",
      h.fit_label || "", boolish(h.captain) ? 1 : 0, h.image_filename || "",
      h.status || "lineup_exported", String(h.team_a_score ?? ""), String(h.team_b_score ?? ""),
      String(h.match_score ?? ""), clampStatCount(h.goals), clampStatCount(h.assists),
      boolish(h.is_mvp) ? 1 : 0, Number(h.rating_before) || 0, Number(h.rating_delta) || 0,
      Number(h.rating_after) || 0, h.result_saved_at || ""
    ));
    if (stmts.length) await db.batch(stmts);
    imported.history = stmts.length;
  }

  if (payload.seed_admin !== false) await ensureDefaultAdmin(db, pepper);

  return { ok: true, version: APP_VERSION, imported };
}
