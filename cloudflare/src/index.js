import {
  APP_VERSION,
  normalizeName,
  normalizeMatchDate,
  normalizeMatchStartTime,
  calcRatingDelta,
  clampRating,
  clampBaseRating,
  clampStatCount,
  parseJerseyNumber,
  parseBirthDate,
  clampPositiveIntScore,
  formatSummaryScore,
  boolish,
  applyTeamMvpRules,
  mapHistoryPlayer,
  mapSummary,
  hasPermission,
  parseCustomCoord,
  normalizeVideoUrl,
  normalizeGoalVideoUrls,
  json,
  corsPreflight,
  slugifyAvatarFilename,
  decodeBase64Image
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
import { applyInactivityDecay, inactivityMetaForPlayer } from "./inactivity.js";
import { trackSiteEvent, adminGetAnalytics } from "./analytics.js";
import { wc2026News, wc2026NewsArticle, wc2026Fixtures, wc2026Standings, wc2026Teams, wc2026Match, wc2026Team, wc2026PlayerProfile, wc2026Hub } from "./wc2026.js";

export default {
  async scheduled(event, env) {
    try {
      await applyInactivityDecay(env.DB);
    } catch (err) {
      console.error("inactivity_decay_failed", err);
    }
  },

  async fetch(request, env) {
    if (request.method === "OPTIONS") return corsPreflight();

    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname.startsWith("/avatars/") || url.pathname.startsWith("/sponsors/"))) {
      return serveAvatarObject(env, url.pathname.slice(1));
    }
    if (request.method === "HEAD" && (url.pathname.startsWith("/avatars/") || url.pathname.startsWith("/sponsors/"))) {
      return serveAvatarObject(env, url.pathname.slice(1));
    }

    const db = env.DB;
    const pepper = env.AUTH_PEPPER || "dufc-auth-pepper-v1";

    try {
      await ensureDefaultAdmin(db, pepper);

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
            "save_match_history", "update_match_image", "save_match_result", "edit_match_result", "confirm_team_lineup", "cancel_match", "delete_match",
            "admin_login", "admin_logout", "admin_save_user", "admin_delete_user",
            "get_roster", "get_match_list", "get_match_detail", "get_pending_match",
            "get_latest_lineup", "get_latest_result", "get_player_stats", "get_sponsors",
            "track_sponsor_view", "track_sponsor_click", "track_site_event",
            "admin_validate_session", "admin_list_users", "admin_list_players",
            "admin_save_player", "admin_delete_player", "admin_upload_avatar",
            "admin_list_sponsors", "admin_save_sponsor", "admin_delete_sponsor", "admin_upload_sponsor_image",
            "admin_get_analytics",
            "import_data",
            "wc2026_news", "wc2026_news_article", "wc2026_fixtures", "wc2026_standings", "wc2026_teams", "wc2026_match", "wc2026_team", "wc2026_player", "wc2026_hub"
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
        case "get_sponsors":
          return json(await getSponsors(db));
        case "track_sponsor_view":
          return json(await trackSponsorStat(db, payload, "view"));
        case "track_sponsor_click":
          return json(await trackSponsorStat(db, payload, "click"));
        case "track_site_event":
          return json(await trackSiteEvent(db, payload));
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
        case "admin_list_players":
          await requireAuth(db, token, ["manage_roster"]);
          return json(await adminListPlayers(db));
        case "admin_save_player":
          await requireAuth(db, token, ["manage_roster"]);
          return json(await adminSavePlayer(db, payload));
        case "admin_delete_player":
          await requireAuth(db, token, ["manage_roster"]);
          return json(await adminDeletePlayer(db, payload));
        case "admin_upload_avatar":
          await requireAuth(db, token, ["manage_roster"]);
          return json(await adminUploadAvatar(env, payload, url.origin));
        case "admin_list_sponsors":
          await requireAuth(db, token, ["manage_sponsors"]);
          return json(await adminListSponsors(db));
        case "admin_save_sponsor":
          await requireAuth(db, token, ["manage_sponsors"]);
          return json(await adminSaveSponsor(db, payload));
        case "admin_delete_sponsor":
          await requireAuth(db, token, ["manage_sponsors"]);
          return json(await adminDeleteSponsor(db, payload));
        case "admin_upload_sponsor_image":
          await requireAuth(db, token, ["manage_sponsors"]);
          return json(await adminUploadSponsorImage(env, payload, url.origin));
        case "admin_get_analytics":
          await requireAuth(db, token, ["manage_sponsors"]);
          return json(await adminGetAnalytics(db, params));
        case "save_match_history":
          await requireAuth(db, token, ["export", "lineup_internal", "lineup_cap", "lineup_split"]);
          return json(await saveMatchHistory(db, payload));
        case "update_match_image":
          await requireAuth(db, token, ["export", "lineup_internal", "lineup_cap", "lineup_split"]);
          return json(await updateMatchImage(db, payload));
        case "confirm_team_lineup": {
          const confirmSession = await requireAuth(db, token, [
            "lineup_team_a", "lineup_team_b", "lineup_internal", "lineup_cap", "lineup_cap_hlv", "all"
          ]);
          return json(await confirmTeamLineup(db, payload, confirmSession));
        }
        case "save_match_result": {
          const resultSession = await requireAuth(db, token, [
            "match_result", "match_result_a", "match_result_b", "lineup_cap_hlv"
          ]);
          return json(await saveMatchResult(db, payload, resultSession));
        }
        case "edit_match_result":
          await requireAuth(db, token, ["match_result"]);
          return json(await editMatchResult(db, payload));
        case "cancel_match":
          await requireAuth(db, token, ["cancel_match"]);
          return json(await cancelMatch(db, payload));
        case "delete_match":
          await requireAuth(db, token, ["delete_match"]);
          return json(await deleteCompletedMatch(db, payload));
        case "import_data":
          return json(await importData(db, payload, env.MIGRATE_SECRET, pepper));
        case "wc2026_news":
          return json(await wc2026News(env, params));
        case "wc2026_news_article":
          return json(await wc2026NewsArticle(env, params));
        case "wc2026_fixtures":
          return json(await wc2026Fixtures(env, params));
        case "wc2026_standings":
          return json(await wc2026Standings(env));
        case "wc2026_teams":
          return json(await wc2026Teams(env));
        case "wc2026_match":
          return json(await wc2026Match(env, params));
        case "wc2026_team":
          return json(await wc2026Team(env, params));
        case "wc2026_player":
          return json(await wc2026PlayerProfile(env, params));
        case "wc2026_hub":
          return json(await wc2026Hub(env));
        default:
          return json({ ok: false, error: "Invalid action: " + action }, 400);
      }
    } catch (err) {
      return json({ ok: false, error: String(err.message || err) }, 400);
    }
  }
};

async function getRoster(db) {
  await applyInactivityDecay(db);
  const rows = await db.prepare(
    `SELECT name, display_name, position, secondary_positions, preferred_side, rating, base_rating,
      mvp_count, avatar, profile_card, jersey_number, description, birth_date, last_match_at, joined_at,
      COALESCE(is_anonymous, 0) AS is_anonymous
     FROM players ORDER BY name COLLATE NOCASE`
  ).all();
  const lastRows = await db.prepare(`
    SELECT player_name_norm, MAX(COALESCE(NULLIF(result_saved_at, ''), created_at)) AS last_at
    FROM match_history WHERE status = 'completed' GROUP BY player_name_norm
  `).all();
  const lastMatchMap = new Map(
    (lastRows.results || []).map((row) => [row.player_name_norm, String(row.last_at || "")])
  );

  const players = (rows.results || []).map((row) => {
    const isAnonymous = Number(row.is_anonymous) === 1;
    if (isAnonymous) {
      return {
        name: row.name,
        display_name: row.display_name || "",
        position: row.position,
        secondary_positions: row.secondary_positions,
        preferred_side: row.preferred_side,
        rating: 5,
        base_rating: 5,
        mvp_count: 0,
        avatar: row.avatar,
        profile_card: row.profile_card || "",
        jersey_number: row.jersey_number != null ? row.jersey_number : null,
        description: row.description || "",
        birth_date: row.birth_date || null,
        last_match_at: row.last_match_at || null,
        joined_at: row.joined_at || null,
        inactivity_penalty: 0,
        days_inactive: 0,
        is_anonymous: true
      };
    }
    const meta = inactivityMetaForPlayer(row, lastMatchMap);
    return {
      name: row.name,
      display_name: row.display_name || "",
      position: row.position,
      secondary_positions: row.secondary_positions,
      preferred_side: row.preferred_side,
      rating: meta.rating,
      base_rating: meta.base_rating,
      mvp_count: row.mvp_count,
      avatar: row.avatar,
      profile_card: row.profile_card || "",
      jersey_number: row.jersey_number != null ? row.jersey_number : null,
      description: row.description || "",
      birth_date: row.birth_date || null,
      last_match_at: meta.last_match_at,
      joined_at: row.joined_at || null,
      inactivity_penalty: meta.inactivity_penalty,
      days_inactive: meta.days_inactive,
      is_anonymous: false
    };
  });
  return { ok: true, version: APP_VERSION, players };
}

function mapPlayerRow(row) {
  const isAnonymous = Number(row.is_anonymous) === 1;
  const meta = row._inactivityMeta;
  const base = {
    id: row.id,
    name: row.name,
    display_name: row.display_name || "",
    position: row.position,
    secondary_positions: row.secondary_positions || "",
    preferred_side: row.preferred_side || "",
    base_rating: isAnonymous ? 5 : (row.base_rating != null ? row.base_rating : row.rating),
    mvp_count: isAnonymous ? 0 : row.mvp_count,
    avatar: row.avatar || "",
    profile_card: row.profile_card || "",
    jersey_number: row.jersey_number != null ? row.jersey_number : null,
    description: row.description || "",
    birth_date: row.birth_date || null,
    joined_at: row.joined_at || "",
    last_match_at: row.last_match_at || "",
    is_anonymous: isAnonymous
  };
  if (isAnonymous) {
    return {
      ...base,
      rating: 5,
      inactivity_penalty: 0,
      days_inactive: 0
    };
  }
  if (meta) {
    return {
      ...base,
      rating: meta.rating,
      inactivity_penalty: meta.inactivity_penalty,
      days_inactive: meta.days_inactive,
      last_match_at: meta.last_match_at
    };
  }
  return {
    ...base,
    rating: row.rating,
    inactivity_penalty: 0,
    days_inactive: 0
  };
}

async function adminListPlayers(db) {
  await applyInactivityDecay(db);
  const rows = await db.prepare(
    `SELECT id, name, display_name, position, secondary_positions, preferred_side,
      rating, base_rating, mvp_count, avatar, profile_card, jersey_number, description, birth_date, last_match_at, joined_at,
      COALESCE(is_anonymous, 0) AS is_anonymous
     FROM players ORDER BY name COLLATE NOCASE`
  ).all();
  const lastRows = await db.prepare(`
    SELECT player_name_norm, MAX(COALESCE(NULLIF(result_saved_at, ''), created_at)) AS last_at
    FROM match_history WHERE status = 'completed' GROUP BY player_name_norm
  `).all();
  const lastMatchMap = new Map(
    (lastRows.results || []).map((row) => [row.player_name_norm, String(row.last_at || "")])
  );

  const players = (rows.results || []).map((row) => {
    const meta = inactivityMetaForPlayer(row, lastMatchMap);
    return mapPlayerRow({ ...row, _inactivityMeta: meta });
  });
  return { ok: true, version: APP_VERSION, players };
}

async function adminSavePlayer(db, payload) {
  const id = payload.id != null && String(payload.id).trim() !== "" ? Number(payload.id) : null;
  const name = String(payload.name || "").trim();
  const displayName = String(payload.display_name || "").trim();
  const position = String(payload.position || payload.main || "").trim().toUpperCase();
  const secondaryPositions = String(payload.secondary_positions || "").trim();
  const preferredSide = String(payload.preferred_side || "").trim();
  const isAnonymous = payload.is_anonymous === true || payload.is_anonymous === 1 || payload.is_anonymous === "1" ? 1 : 0;
  const baseRating = isAnonymous
    ? 5
    : clampBaseRating(payload.base_rating ?? payload.rating ?? 5);
  const mvpCount = isAnonymous ? 0 : Math.max(0, Math.round(Number(payload.mvp_count) || 0));
  const avatar = String(payload.avatar || "").trim();
  const profileCard = String(payload.profile_card || "").trim();
  const jerseyNumber = parseJerseyNumber(payload.jersey_number);
  const description = String(payload.description || "").trim();
  const birthDate = parseBirthDate(payload.birth_date);
  const joinedAt = String(payload.joined_at || "").trim();
  const lastMatchAt = String(payload.last_match_at || "").trim();
  const nowIso = new Date().toISOString();

  if (!name) throw new Error("Tên cầu thủ (name) là bắt buộc.");
  if (!position) throw new Error("Vị trí chính là bắt buộc.");

  const nameNorm = normalizeName(name);

  if (id) {
    const existing = await db.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
    if (!existing) throw new Error("Không tìm thấy cầu thủ.");

    if (nameNorm !== existing.name_norm) {
      const dup = await db.prepare("SELECT id FROM players WHERE name_norm = ? AND id != ?").bind(nameNorm, id).first();
      if (dup) throw new Error("Tên cầu thủ đã tồn tại.");

      await db.prepare(
        "UPDATE match_history SET player_name = ?, player_name_norm = ? WHERE player_name_norm = ?"
      ).bind(name, nameNorm, existing.name_norm).run();
      await db.prepare(
        "UPDATE rating_log SET player_name = ? WHERE player_name = ?"
      ).bind(name, existing.name).run();
    }

    await db.prepare(`
      UPDATE players SET
        name = ?, name_norm = ?, display_name = ?, position = ?,
        secondary_positions = ?, preferred_side = ?,
        rating = ?, base_rating = ?, mvp_count = ?, avatar = ?, profile_card = ?,
        jersey_number = ?, description = ?, birth_date = ?,
        joined_at = CASE WHEN ? != '' THEN ? ELSE joined_at END,
        last_match_at = ?, is_anonymous = ?
      WHERE id = ?
    `).bind(
      name, nameNorm, displayName, position,
      secondaryPositions, preferredSide,
      baseRating, baseRating, mvpCount, avatar, profileCard, jerseyNumber, description, birthDate,
      joinedAt, joinedAt, lastMatchAt, isAnonymous, id
    ).run();

    return { ok: true, version: APP_VERSION, id, name };
  }

  const dup = await db.prepare("SELECT id FROM players WHERE name_norm = ?").bind(nameNorm).first();
  if (dup) throw new Error("Tên cầu thủ đã tồn tại.");

  const result = await db.prepare(`
    INSERT INTO players (
      name, name_norm, display_name, position, secondary_positions, preferred_side,
      rating, base_rating, mvp_count, avatar, profile_card, jersey_number, description, birth_date, joined_at, last_match_at, is_anonymous
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    name, nameNorm, displayName, position,
    secondaryPositions, preferredSide,
    baseRating, baseRating, mvpCount, avatar, profileCard, jerseyNumber, description, birthDate,
    joinedAt || nowIso, lastMatchAt, isAnonymous
  ).run();

  return {
    ok: true,
    version: APP_VERSION,
    id: result.meta?.last_row_id,
    name
  };
}

async function adminDeletePlayer(db, payload) {
  const id = Number(payload.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error("id cầu thủ không hợp lệ.");

  const existing = await db.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
  if (!existing) throw new Error("Không tìm thấy cầu thủ.");

  const hist = await db.prepare(
    "SELECT COUNT(*) AS c FROM match_history WHERE player_name_norm = ?"
  ).bind(existing.name_norm).first();
  if (Number(hist?.c) > 0) {
    throw new Error("Không thể xóa cầu thủ đã tham gia trận đấu.");
  }

  await db.prepare("DELETE FROM players WHERE id = ?").bind(id).run();
  return { ok: true, version: APP_VERSION, id, name: existing.name };
}

async function serveAvatarObject(env, key) {
  if (!env.AVATARS) {
    return new Response("Avatar storage chưa cấu hình.", { status: 503 });
  }
  const safeKey = String(key || "").replace(/^\/+/, "");
  const allowedPrefix = safeKey.startsWith("avatars/") || safeKey.startsWith("sponsors/");
  if (!allowedPrefix || safeKey.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const stored = await env.AVATARS.getWithMetadata(safeKey, "arrayBuffer");
  if (!stored?.value) return new Response("Not found", { status: 404 });

  const contentType = stored.metadata?.contentType || "image/png";
  return new Response(stored.value, {
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300"
    }
  });
}

function publicAssetBaseUrl(origin) {
  let base = String(origin || "https://api.diamondunitedfc.com").replace(/\/$/, "");
  if (!/localhost|127\.0\.0\.1/i.test(base)) {
    base = base.replace(/^http:/i, "https:");
  }
  return base;
}

async function adminUploadAvatar(env, payload, origin) {
  if (!env.AVATARS) throw new Error("Avatar storage chưa cấu hình trên server.");

  const contentType = String(payload.content_type || "image/png").trim().toLowerCase();
  const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
  if (!allowed.has(contentType)) {
    throw new Error("Chỉ hỗ trợ PNG, JPG hoặc WebP.");
  }

  const bytes = decodeBase64Image(payload.image_base64);
  if (!bytes.length) throw new Error("File ảnh trống.");
  if (bytes.length > 2 * 1024 * 1024) throw new Error("Ảnh tối đa 2MB.");

  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
  const slug = slugifyAvatarFilename(payload.filename_base || payload.name || "player");
  const kind = String(payload.upload_kind || payload.kind || "full").trim().toLowerCase();
  const isZalo = kind === "zalo" || kind === "avatar";
  const key = isZalo ? `avatars/${slug}.${ext}` : `avatars/full/${slug}.${ext}`;

  await env.AVATARS.put(key, bytes, {
    metadata: { contentType }
  });

  const baseUrl = `${publicAssetBaseUrl(origin)}/${key}`;
  if (isZalo) {
    return { ok: true, version: APP_VERSION, avatar: baseUrl, key };
  }
  return { ok: true, version: APP_VERSION, profile_card: baseUrl, key };
}

function mapSponsorRow(row) {
  return {
    id: row.id,
    name: row.name || "",
    link_url: row.link_url || "",
    image_side: row.image_side || "",
    image_mobile: row.image_mobile || "",
    sort_order: row.sort_order != null ? row.sort_order : 0,
    active: row.active ? 1 : 0,
    end_at: row.end_at || "",
    view_count: Number(row.view_count) || 0,
    click_count: Number(row.click_count) || 0,
    created_at: row.created_at || "",
    updated_at: row.updated_at || ""
  };
}

function defaultSponsorEndAtIso(fromDate = new Date()) {
  const d = new Date(fromDate.getTime());
  d.setDate(d.getDate() + 14);
  return d.toISOString();
}

function parseSponsorEndAt(value, fallbackIso = null) {
  const raw = String(value || "").trim();
  if (!raw) return fallbackIso;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error("Ngày kết thúc không hợp lệ.");
  return d.toISOString();
}

async function getSponsors(db) {
  const rows = await db.prepare(
    `SELECT id, name, link_url, image_side, image_mobile, sort_order, active, end_at, updated_at
     FROM sponsors
     WHERE active = 1
       AND (end_at IS NULL OR end_at = '' OR datetime(end_at) > datetime('now'))
     ORDER BY sort_order ASC, id ASC`
  ).all();
  return {
    ok: true,
    version: APP_VERSION,
    sponsors: (rows.results || []).map(mapSponsorRow)
  };
}

async function adminListSponsors(db) {
  const rows = await db.prepare(
    `SELECT id, name, link_url, image_side, image_mobile, sort_order, active, end_at,
            view_count, click_count, created_at, updated_at
     FROM sponsors ORDER BY sort_order ASC, id ASC`
  ).all();
  return {
    ok: true,
    version: APP_VERSION,
    sponsors: (rows.results || []).map(mapSponsorRow)
  };
}

async function adminSaveSponsor(db, payload) {
  const id = payload.id != null && String(payload.id).trim() !== "" ? Number(payload.id) : null;
  const name = String(payload.name || "").trim();
  const linkUrl = String(payload.link_url || "").trim();
  const imageSide = String(payload.image_side || "").trim();
  const imageMobile = String(payload.image_mobile || "").trim();
  const sortOrder = Math.round(Number(payload.sort_order) || 0);
  const active = payload.active === false || payload.active === 0 || payload.active === "0" ? 0 : 1;
  const nowIso = new Date().toISOString();

  if (!name) throw new Error("Tên nhà tài trợ là bắt buộc.");

  if (id) {
    const existing = await db.prepare("SELECT id, end_at FROM sponsors WHERE id = ?").bind(id).first();
    if (!existing) throw new Error("Không tìm thấy nhà tài trợ.");
    const endAt = parseSponsorEndAt(payload.end_at, existing.end_at || defaultSponsorEndAtIso());
    await db.prepare(`
      UPDATE sponsors SET
        name = ?, link_url = ?, image_side = ?, image_mobile = ?,
        sort_order = ?, active = ?, end_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(name, linkUrl, imageSide, imageMobile, sortOrder, active, endAt, nowIso, id).run();
    return { ok: true, version: APP_VERSION, id, name };
  }

  const endAt = parseSponsorEndAt(payload.end_at, defaultSponsorEndAtIso());
  const result = await db.prepare(`
    INSERT INTO sponsors (name, link_url, image_side, image_mobile, sort_order, active, end_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(name, linkUrl, imageSide, imageMobile, sortOrder, active, endAt, nowIso, nowIso).run();

  return {
    ok: true,
    version: APP_VERSION,
    id: result.meta?.last_row_id,
    name
  };
}

async function adminDeleteSponsor(db, payload) {
  const id = Number(payload.id);
  if (!Number.isFinite(id)) throw new Error("ID nhà tài trợ không hợp lệ.");
  const existing = await db.prepare("SELECT id FROM sponsors WHERE id = ?").bind(id).first();
  if (!existing) throw new Error("Không tìm thấy nhà tài trợ.");
  await db.prepare("DELETE FROM sponsors WHERE id = ?").bind(id).run();
  return { ok: true, version: APP_VERSION, id };
}

async function trackSponsorStat(db, payload, kind) {
  const id = Number(payload.sponsor_id);
  if (!Number.isFinite(id)) throw new Error("sponsor_id không hợp lệ.");
  const column = kind === "click" ? "click_count" : "view_count";

  const row = await db.prepare("SELECT id FROM sponsors WHERE id = ?").bind(id).first();
  if (!row) throw new Error("Không tìm thấy nhà tài trợ.");

  await db.prepare(`UPDATE sponsors SET ${column} = COALESCE(${column}, 0) + 1 WHERE id = ?`).bind(id).run();
  const updated = await db.prepare(`SELECT view_count, click_count FROM sponsors WHERE id = ?`).bind(id).first();
  return {
    ok: true,
    version: APP_VERSION,
    id,
    view_count: Number(updated?.view_count) || 0,
    click_count: Number(updated?.click_count) || 0
  };
}

async function adminUploadSponsorImage(env, payload, origin) {
  if (!env.AVATARS) throw new Error("Storage chưa cấu hình trên server.");

  const contentType = String(payload.content_type || "image/png").trim().toLowerCase();
  const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
  if (!allowed.has(contentType)) throw new Error("Chỉ hỗ trợ PNG, JPG hoặc WebP.");

  const bytes = decodeBase64Image(payload.image_base64);
  if (!bytes.length) throw new Error("File ảnh trống.");
  if (bytes.length > 2 * 1024 * 1024) throw new Error("Ảnh tối đa 2MB.");

  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
  const slug = slugifyAvatarFilename(payload.filename_base || payload.name || "sponsor");
  const kind = String(payload.upload_kind || payload.kind || "side").trim().toLowerCase();
  const slot = kind === "mobile" ? "mobile" : "side";
  const key = `sponsors/${slot}/${slug}.${ext}`;

  await env.AVATARS.put(key, bytes, { metadata: { contentType } });

  const baseUrl = `${publicAssetBaseUrl(origin)}/${key}?v=${Date.now()}`;
  return {
    ok: true,
    version: APP_VERSION,
    key,
    image_side: slot === "side" ? baseUrl : undefined,
    image_mobile: slot === "mobile" ? baseUrl : undefined,
    url: baseUrl
  };
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
    team_a_score: formatSummaryScore(r.team_a_score),
    team_b_score: formatSummaryScore(r.team_b_score),
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
    `SELECT * FROM match_summary WHERE status IN ('lineup_published', 'lineup_exported')
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
    `SELECT MAX(h.player_name) AS player_name, SUM(h.goals) AS goals, SUM(h.assists) AS assists
     FROM match_history h
     INNER JOIN match_summary s ON s.match_id = h.match_id
     WHERE h.status = 'completed' AND LOWER(COALESCE(s.match_type, 'internal')) = 'cap'
     GROUP BY h.player_name_norm
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

async function deletePendingByMatchId(db, matchId) {
  if (!matchId) return { deletedRows: 0, deletedSummary: 0 };

  const delHist = await db.prepare(
    `DELETE FROM match_history WHERE match_id = ? AND (status IS NULL OR status = '' OR status != 'completed')`
  ).bind(matchId).run();

  const delSum = await db.prepare(
    `DELETE FROM match_summary WHERE match_id = ? AND status != 'completed'`
  ).bind(matchId).run();

  return {
    deletedRows: delHist.meta?.changes || 0,
    deletedSummary: delSum.meta?.changes || 0
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
  const prevSummary = await db.prepare(
    "SELECT team_a_lineup_confirmed, team_b_lineup_confirmed, match_start_time FROM match_summary WHERE match_id = ?"
  ).bind(matchId).first();
  const matchStartTime = normalizeMatchStartTime(
    payload.match_start_time ?? prevSummary?.match_start_time ?? "19:30"
  );
  const deletedByMatchId = await deletePendingByMatchId(db, matchId);
  const deleted = await deletePendingByDate(db, matchDate);

  const matchType = String(payload.match_type || "internal").trim().toLowerCase();
  const summaryStatus = String(payload.status || rows[0]?.status || "lineup_exported").trim();
  const now = new Date().toISOString();
  let teamAConfirmed = Number(prevSummary?.team_a_lineup_confirmed) || 0;
  let teamBConfirmed = Number(prevSummary?.team_b_lineup_confirmed) || 0;
  if (payload.team_a_lineup_confirmed != null) {
    teamAConfirmed = boolish(payload.team_a_lineup_confirmed) ? 1 : 0;
  }
  if (payload.team_b_lineup_confirmed != null) {
    teamBConfirmed = boolish(payload.team_b_lineup_confirmed) ? 1 : 0;
  }

  const insert = db.prepare(`
    INSERT INTO match_history (
      match_id, match_date, match_date_norm, created_at, team, shirt, formation,
      player_name, player_name_norm, rating, starter, lineup_order,
      assigned_position, assigned_side, main_position, secondary_positions,
      preferred_side, fit_label, captain, image_filename, status, custom_x, custom_y
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmts = [];
  for (const row of rows) {
    const status = row.status || summaryStatus;
    const customX = parseCustomCoord(row.custom_x);
    const customY = parseCustomCoord(row.custom_y);
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
      status,
      customX,
      customY
    ));
  }
  await db.batch(stmts);

  await db.prepare(`
    INSERT INTO match_summary (
      match_id, match_label, match_date, match_date_norm, created_at, match_type,
      opponent_name, formation_a, formation_b, player_count, status, image_filename,
      team_a_lineup_confirmed, team_b_lineup_confirmed, match_start_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      match_label = excluded.match_label,
      match_date = excluded.match_date,
      match_date_norm = excluded.match_date_norm,
      created_at = excluded.created_at,
      match_type = excluded.match_type,
      opponent_name = excluded.opponent_name,
      formation_a = excluded.formation_a,
      formation_b = excluded.formation_b,
      player_count = excluded.player_count,
      status = excluded.status,
      image_filename = CASE
        WHEN excluded.image_filename != '' THEN excluded.image_filename
        ELSE match_summary.image_filename
      END,
      team_a_lineup_confirmed = excluded.team_a_lineup_confirmed,
      team_b_lineup_confirmed = excluded.team_b_lineup_confirmed,
      match_start_time = excluded.match_start_time
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
    summaryStatus,
    rows[0]?.image_filename || payload.image_filename || "",
    teamAConfirmed,
    teamBConfirmed,
    matchStartTime
  ).run();

  return {
    ok: true,
    version: APP_VERSION,
    match_id: matchId,
    match_date: matchDate,
    normalized_match_date: matchDateNorm,
    deleted_old_rows: deleted.deletedRows + deletedByMatchId.deletedRows,
    deleted_pending_summary: deleted.deletedSummary + deletedByMatchId.deletedSummary,
    inserted_rows: rows.length,
    status: summaryStatus,
    team_a_lineup_confirmed: !!teamAConfirmed,
    team_b_lineup_confirmed: !!teamBConfirmed,
    match_start_time: matchStartTime
  };
}

async function updateMatchImage(db, payload) {
  const matchId = String(payload.match_id || "").trim();
  const filename = String(payload.image_filename || "").trim();
  if (!matchId) throw new Error("match_id is required");
  if (!filename) throw new Error("image_filename is required");

  const summary = await db.prepare("SELECT status FROM match_summary WHERE match_id = ?").bind(matchId).first();
  if (!summary) throw new Error("Không tìm thấy trận: " + matchId);
  if (summary.status === "completed") throw new Error("Trận đã hoàn tất.");

  await db.prepare("UPDATE match_summary SET image_filename = ? WHERE match_id = ?")
    .bind(filename, matchId).run();
  await db.prepare("UPDATE match_history SET image_filename = ? WHERE match_id = ?")
    .bind(filename, matchId).run();

  return { ok: true, version: APP_VERSION, match_id: matchId, image_filename: filename };
}

async function confirmTeamLineup(db, payload, session) {
  const matchId = String(payload.match_id || "").trim();
  const team = String(payload.team || "").trim().toUpperCase();
  const confirmed = payload.confirmed == null ? true : boolish(payload.confirmed);
  const formation = String(payload.formation || "").trim();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  if (!matchId) throw new Error("match_id is required");
  if (team !== "A" && team !== "B" && team !== "MAIN" && team !== "SUB") {
    throw new Error("team must be A, B, MAIN or SUB");
  }

  const perms = session?.permissions || [];
  const canAll = hasPermission(perms, ["all", "lineup_internal"]);
  const canCoordinator = hasPermission(perms, ["lineup_split"]);
  const canCap = canAll || hasPermission(perms, ["lineup_cap", "lineup_cap_hlv"]) || canCoordinator;
  const canA = canAll || hasPermission(perms, ["lineup_team_a"]) || canCoordinator;
  const canB = canAll || hasPermission(perms, ["lineup_team_b"]) || canCoordinator;
  if (team === "A" && !canA) throw new Error("Không có quyền chốt Đội A");
  if (team === "B" && !canB) throw new Error("Không có quyền chốt Đội B");
  if ((team === "MAIN" || team === "SUB") && !canCap) throw new Error("Không có quyền chốt đội hình Cáp");

  const summary = await db.prepare(
    "SELECT * FROM match_summary WHERE match_id = ?"
  ).bind(matchId).first();
  if (!summary) throw new Error("Không tìm thấy trận để cập nhật");

  if (confirmed && rows.length) {
    const matchDate = String(rows[0].match_date || summary.match_date || "").trim();
    const matchDateNorm = normalizeMatchDate(matchDate || summary.match_date_norm);
    const now = new Date().toISOString();
    const status = String(rows[0].status || summary.status || "lineup_published").trim();

    await db.prepare(
      "DELETE FROM match_history WHERE match_id = ? AND team = ?"
    ).bind(matchId, team).run();

    const insert = db.prepare(`
      INSERT INTO match_history (
        match_id, match_date, match_date_norm, created_at, team, shirt, formation,
        player_name, player_name_norm, rating, starter, lineup_order,
        assigned_position, assigned_side, main_position, secondary_positions,
        preferred_side, fit_label, captain, image_filename, status, custom_x, custom_y
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const stmts = [];
    for (const row of rows) {
      const customX = parseCustomCoord(row.custom_x);
      const customY = parseCustomCoord(row.custom_y);
      stmts.push(insert.bind(
        matchId,
        matchDate || summary.match_date,
        matchDateNorm || summary.match_date_norm,
        row.created_at || now,
        team,
        row.shirt || (team === "A" ? "Áo Đỏ" : team === "B" ? "Áo Vàng" : team === "MAIN" ? "Chính" : "Phụ"),
        row.formation || formation || (team === "A" || team === "MAIN" ? summary.formation_a : summary.formation_b),
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
        row.image_filename || summary.image_filename || "",
        row.status || status,
        customX,
        customY
      ));
    }
    await db.batch(stmts);

    const formCol = team === "A" || team === "MAIN" ? "formation_a" : "formation_b";
    const formValue = formation || rows[0]?.formation || (team === "A" || team === "MAIN" ? summary.formation_a : summary.formation_b);
    await db.prepare(
      `UPDATE match_summary SET ${formCol} = ? WHERE match_id = ?`
    ).bind(formValue, matchId).run();

    const countRow = await db.prepare(
      "SELECT COUNT(*) AS total FROM match_history WHERE match_id = ?"
    ).bind(matchId).first();
    await db.prepare(
      "UPDATE match_summary SET player_count = ? WHERE match_id = ?"
    ).bind(Number(countRow?.total) || rows.length, matchId).run();
  }

  const col = team === "A" || team === "MAIN" ? "team_a_lineup_confirmed" : "team_b_lineup_confirmed";
  await db.prepare(
    `UPDATE match_summary SET ${col} = ? WHERE match_id = ?`
  ).bind(confirmed ? 1 : 0, matchId).run();

  const updated = await db.prepare(
    "SELECT team_a_lineup_confirmed, team_b_lineup_confirmed, formation_a, formation_b FROM match_summary WHERE match_id = ?"
  ).bind(matchId).first();

  return {
    ok: true,
    version: APP_VERSION,
    match_id: matchId,
    team,
    confirmed,
    formation: team === "A" || team === "MAIN" ? updated?.formation_a : updated?.formation_b,
    saved_rows: confirmed ? rows.length : 0,
    team_a_lineup_confirmed: !!updated?.team_a_lineup_confirmed,
    team_b_lineup_confirmed: !!updated?.team_b_lineup_confirmed
  };
}

function goalVideoUrlsFromPlayer(item, goalsFallback = 0) {
  if (!item) return "";
  const raw = item.goal_video_urls != null ? item.goal_video_urls : item.goal_video_url;
  if (raw == null || raw === "") return "";
  return normalizeGoalVideoUrls(raw, clampStatCount(item.goals ?? goalsFallback));
}

async function loadAnonymousNameNorms(db) {
  const rows = await db.prepare(
    "SELECT name_norm FROM players WHERE COALESCE(is_anonymous, 0) = 1"
  ).all();
  return new Set((rows.results || []).map((r) => r.name_norm));
}

function tagAnonymousResultPlayers(players, anonNorms) {
  return (players || []).map((p) => {
    const anon = anonNorms.has(normalizeName(p.player_name));
    if (!anon) return { ...p, is_anonymous: false };
    return {
      ...p,
      is_anonymous: true,
      match_score: 5,
      is_mvp: false,
      rating_before: 5,
      mvp_count_before: 0
    };
  });
}

function historyRatingFields(item, anonNorms) {
  const anon = !!item?.is_anonymous || anonNorms.has(normalizeName(item.player_name));
  if (anon) {
    return {
      match_score: 5,
      rating_before: 5,
      delta: 0,
      rating_after: 5,
      is_mvp: 0
    };
  }
  const ratingBefore = clampRating(item.rating_before);
  const delta = calcRatingDelta(item.match_score);
  return {
    match_score: Number(item.match_score) || 8,
    rating_before: ratingBefore,
    delta,
    rating_after: clampRating(ratingBefore + delta),
    is_mvp: item.is_mvp ? 1 : 0
  };
}

async function saveMatchResult(db, payload, session) {
  const matchId = String(payload.match_id || "").trim();
  let players = Array.isArray(payload.players) ? payload.players : [];

  if (!matchId) throw new Error("match_id is required");

  const perms = session?.permissions || [];
  const canHost = hasPermission(perms, ["all", "match_result"]);
  const canAOnly = hasPermission(perms, ["match_result_a"]) && !canHost;
  const canBOnly = hasPermission(perms, ["match_result_b"]) && !canHost;
  const matchType = String(payload.match_type || "internal").trim().toLowerCase();
  const isCapMatch = matchType === "cap";
  const canCapHlvOnly = isCapMatch && hasPermission(perms, ["lineup_cap_hlv"]) && !canHost;
  const canCapResult = isCapMatch && (canCapHlvOnly || canHost);
  if (!canHost && !canAOnly && !canBOnly && !canCapResult) {
    throw new Error("Tài khoản không có quyền nhập kết quả.");
  }

  const finalizeMatch = payload.finalize_match === true && canHost;
  if (!players.length && !finalizeMatch) throw new Error("players is required");
  const anonNorms = await loadAnonymousNameNorms(db);
  players = tagAnonymousResultPlayers(players, anonNorms);
  players = applyTeamMvpRules(players, matchType, { anonymousNorms: anonNorms });

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

  const savedAt = new Date().toISOString();
  const matchDate = summary.match_date || "";
  const historyRows = await db.prepare("SELECT * FROM match_history WHERE match_id = ?").bind(matchId).all();
  const playerMap = {};
  players.forEach((p) => { playerMap[normalizeName(p.player_name)] = p; });

  const prevAScore = clampPositiveIntScore(summary.team_a_score, 0);
  const prevBScore = clampPositiveIntScore(summary.team_b_score, 0);
  let nextAScore = payload.team_a_score == null || String(payload.team_a_score).trim() === ""
    ? prevAScore
    : clampPositiveIntScore(payload.team_a_score, prevAScore);
  let nextBScore = payload.team_b_score == null || String(payload.team_b_score).trim() === ""
    ? prevBScore
    : clampPositiveIntScore(payload.team_b_score, prevBScore);
  if (canAOnly) nextBScore = prevBScore;
  if (canBOnly) nextAScore = prevAScore;
  if (finalizeMatch) {
    if (payload.team_a_score == null || String(payload.team_a_score).trim() === "") nextAScore = prevAScore;
    if (payload.team_b_score == null || String(payload.team_b_score).trim() === "") nextBScore = prevBScore;
  }

  let teamAFlag = summary.team_a_result_saved || 0;
  let teamBFlag = summary.team_b_result_saved || 0;
  if (canAOnly) teamAFlag = 1;
  if (canBOnly) teamBFlag = 1;
  if (canCapHlvOnly) teamAFlag = 1;

  const updatePartialHist = db.prepare(`
    UPDATE match_history SET
      team_a_score = ?, team_b_score = ?, match_score = ?,
      goals = ?, assists = ?, is_mvp = ?,
      goal_video_url = COALESCE(?, goal_video_url)
    WHERE id = ?
  `);

  const partialStmts = [];
  for (const row of historyRows.results || []) {
    const teamKey = String(row.team || "").toUpperCase();
    const allowed = isCapMatch && canCapHlvOnly
      ? (teamKey === "MAIN" || teamKey === "SUB")
      : ((teamKey === "A" && canAOnly) || (teamKey === "B" && canBOnly));
    if (!allowed) continue;
    const item = playerMap[normalizeName(row.player_name)];
    if (!item) continue;
    partialStmts.push(updatePartialHist.bind(
      nextAScore, nextBScore, item.match_score,
      clampStatCount(item.goals), clampStatCount(item.assists),
      item.is_mvp ? 1 : 0,
      item.goal_video_urls != null || item.goal_video_url != null
        ? goalVideoUrlsFromPlayer(item, item.goals)
        : null,
      row.id
    ));
  }
  if (partialStmts.length) await db.batch(partialStmts);

  const nextAFlag = teamAFlag;
  const nextBFlag = teamBFlag;
  let finalize = finalizeMatch;
  const allHlvSaved = isCapMatch ? !!nextAFlag : (!!nextAFlag && !!nextBFlag);
  if (!finalize && allHlvSaved) finalize = true;

  const highlightVideo = payload.highlight_video_url != null
    ? normalizeVideoUrl(payload.highlight_video_url)
    : null;

  await db.prepare(`
    UPDATE match_summary SET
      team_a_score = ?, team_b_score = ?,
      team_a_result_saved = ?, team_b_result_saved = ?,
      opponent_name = COALESCE(?, opponent_name),
      match_type = COALESCE(?, match_type),
      highlight_video_url = COALESCE(?, highlight_video_url)
    WHERE match_id = ?
  `).bind(
    String(nextAScore), String(nextBScore), nextAFlag, nextBFlag,
    payload.opponent_name || null, matchType || null, highlightVideo, matchId
  ).run();

  if (!finalize) {
    const waiting = [];
    if (isCapMatch) {
      if (!nextAFlag) waiting.push("HLV Cáp");
    } else {
      if (!nextAFlag) waiting.push("Đội A");
      if (!nextBFlag) waiting.push("Đội B");
    }
    return {
      ok: true,
      version: APP_VERSION,
      match_id: matchId,
      match_label: summary.match_label,
      status: "lineup_exported",
      partial: true,
      team_a_result_saved: !!nextAFlag,
      team_b_result_saved: !!nextBFlag,
      waiting_teams: waiting,
      saved_at: savedAt
    };
  }

  const capHlvConfirmed = isCapMatch && !!nextAFlag;
  const mergedPlayers = [];
  for (const row of historyRows.results || []) {
    const incoming = playerMap[normalizeName(row.player_name)];
    const teamKey = String(row.team || "").toUpperCase();
    const teamHlvLocked = (teamKey === "A" && nextAFlag) || (teamKey === "B" && nextBFlag);
    const ratingLocked = capHlvConfirmed || teamHlvLocked;
    const statsLocked = !finalize && (capHlvConfirmed || teamHlvLocked);
    const matchScore = ratingLocked
      ? Number(row.match_score) || 8
      : (incoming ? Number(incoming.match_score) : Number(row.match_score) || 8);
    const anon = anonNorms.has(normalizeName(row.player_name));
    mergedPlayers.push({
      player_name: row.player_name,
      team: teamKey,
      starter: !!row.starter,
      match_score: anon ? 5 : matchScore,
      goals: incoming && !statsLocked ? clampStatCount(incoming.goals) : Number(row.goals) || 0,
      assists: incoming && !statsLocked ? clampStatCount(incoming.assists) : Number(row.assists) || 0,
      rating_before: anon ? 5 : (incoming ? clampRating(incoming.rating_before) : clampRating(row.rating_before || row.rating)),
      mvp_count_before: anon ? 0 : (incoming ? Math.max(0, Math.round(Number(incoming.mvp_count_before) || 0)) : Math.max(0, Math.round(Number(row.mvp_count) || 0))),
      is_mvp: anon ? false : (ratingLocked ? !!row.is_mvp : (incoming ? !!incoming.is_mvp : !!row.is_mvp)),
      is_anonymous: anon,
      goal_video_url: incoming && (incoming.goal_video_urls != null || incoming.goal_video_url != null)
        ? goalVideoUrlsFromPlayer(incoming, incoming.goals ?? row.goals)
        : (row.goal_video_url || "")
    });
  }

  const finalized = applyTeamMvpRules(mergedPlayers, matchType, { anonymousNorms: anonNorms });
  const mvpNames = finalized.filter((p) => p.is_mvp).map((p) => p.player_name);
  const playerMapFinal = {};
  finalized.forEach((p) => { playerMapFinal[normalizeName(p.player_name)] = p; });

  const finalizeHighlightVideo = payload.highlight_video_url != null
    ? normalizeVideoUrl(payload.highlight_video_url)
    : null;

  const updateHist = db.prepare(`
    UPDATE match_history SET
      status = 'completed', team_a_score = ?, team_b_score = ?, match_score = ?,
      goals = ?, assists = ?, is_mvp = ?, rating_before = ?, rating_delta = ?,
      rating_after = ?, result_saved_at = ?, goal_video_url = ?
    WHERE id = ?
  `);

  const histStmts = [];
  for (const row of historyRows.results || []) {
    const item = playerMapFinal[normalizeName(row.player_name)];
    if (!item) continue;
    const ratingFields = historyRatingFields(item, anonNorms);
    histStmts.push(updateHist.bind(
      nextAScore, nextBScore, ratingFields.match_score,
      clampStatCount(item.goals), clampStatCount(item.assists),
      ratingFields.is_mvp, ratingFields.rating_before, ratingFields.delta, ratingFields.rating_after, savedAt,
      item.goal_video_url || "", row.id
    ));
  }
  if (histStmts.length) await db.batch(histStmts);

  await db.prepare(`
    UPDATE match_summary SET
      mvp_players = ?, status = 'completed', result_saved_at = ?,
      highlight_video_url = COALESCE(?, highlight_video_url)
    WHERE match_id = ?
  `).bind(mvpNames.join(", "), savedAt, finalizeHighlightVideo, matchId).run();

  await updateRosterFromResult(db, finalized, matchId, matchDate, savedAt);

  return {
    ok: true,
    version: APP_VERSION,
    match_id: matchId,
    match_label: summary.match_label,
    status: "completed",
    team_a_score: nextAScore,
    team_b_score: nextBScore,
    mvp_players: mvpNames,
    saved_at: savedAt
  };
}

async function editMatchResult(db, payload) {
  const matchId = String(payload.match_id || "").trim();
  let players = Array.isArray(payload.players) ? payload.players : [];
  if (!matchId) throw new Error("match_id is required");
  if (!players.length) throw new Error("players is required");

  const summary = await db.prepare("SELECT * FROM match_summary WHERE match_id = ?").bind(matchId).first();
  if (!summary) throw new Error("Không tìm thấy trận: " + matchId);
  if (summary.status !== "completed") {
    throw new Error("Chỉ sửa được trận đã hoàn tất trong lịch sử.");
  }

  const matchType = String(payload.match_type || summary.match_type || "internal").trim().toLowerCase();
  const anonNorms = await loadAnonymousNameNorms(db);
  players = tagAnonymousResultPlayers(players, anonNorms);
  players = applyTeamMvpRules(players, matchType, { anonymousNorms: anonNorms });

  const removedLogs = (await db.prepare("SELECT * FROM rating_log WHERE match_id = ?").bind(matchId).all()).results || [];
  await db.prepare("DELETE FROM rating_log WHERE match_id = ?").bind(matchId).run();
  await recalculateRosterFromLogs(db, removedLogs);

  const rosterRows = await db.prepare("SELECT * FROM players").all();
  const rosterMap = {};
  for (const r of rosterRows.results || []) {
    rosterMap[normalizeName(r.name)] = r;
  }

  const savedAt = new Date().toISOString();
  const matchDate = summary.match_date || "";
  const nextAScore = clampPositiveIntScore(payload.team_a_score, summary.team_a_score);
  const nextBScore = clampPositiveIntScore(payload.team_b_score, summary.team_b_score);
  const opponentName = payload.opponent_name != null ? String(payload.opponent_name).trim() : summary.opponent_name;

  const historyRows = await db.prepare("SELECT * FROM match_history WHERE match_id = ?").bind(matchId).all();
  const playerMap = {};
  players.forEach((p) => { playerMap[normalizeName(p.player_name)] = p; });

  const mergedPlayers = [];
  for (const row of historyRows.results || []) {
    const incoming = playerMap[normalizeName(row.player_name)];
    if (!incoming) continue;
    const roster = rosterMap[normalizeName(row.player_name)];
    const anon = anonNorms.has(normalizeName(row.player_name)) || Number(roster?.is_anonymous) === 1;
    mergedPlayers.push({
      player_name: row.player_name,
      team: String(row.team || "").toUpperCase(),
      starter: !!row.starter,
      match_score: anon ? 5 : (Number(incoming.match_score) || 8),
      goals: clampStatCount(incoming.goals),
      assists: clampStatCount(incoming.assists),
      rating_before: anon ? 5 : clampRating(roster?.base_rating ?? roster?.rating ?? row.rating_before),
      mvp_count_before: anon ? 0 : Math.max(0, Math.round(Number(roster?.mvp_count) || 0)),
      is_mvp: anon ? false : !!incoming.is_mvp,
      is_anonymous: anon,
      goal_video_url: (incoming.goal_video_urls != null || incoming.goal_video_url != null)
        ? goalVideoUrlsFromPlayer(incoming, incoming.goals)
        : (row.goal_video_url || "")
    });
  }
  if (!mergedPlayers.length) throw new Error("Không có cầu thủ để cập nhật.");

  const finalized = applyTeamMvpRules(mergedPlayers, matchType, { anonymousNorms: anonNorms });
  const mvpNames = finalized.filter((p) => p.is_mvp).map((p) => p.player_name);
  const playerMapFinal = {};
  finalized.forEach((p) => { playerMapFinal[normalizeName(p.player_name)] = p; });

  const editHighlightVideo = payload.highlight_video_url != null
    ? normalizeVideoUrl(payload.highlight_video_url)
    : null;

  const updateHist = db.prepare(`
    UPDATE match_history SET
      status = 'completed', team_a_score = ?, team_b_score = ?, match_score = ?,
      goals = ?, assists = ?, is_mvp = ?, rating_before = ?, rating_delta = ?,
      rating_after = ?, result_saved_at = ?, goal_video_url = ?
    WHERE id = ?
  `);

  const histStmts = [];
  for (const row of historyRows.results || []) {
    const item = playerMapFinal[normalizeName(row.player_name)];
    if (!item) continue;
    const ratingFields = historyRatingFields(item, anonNorms);
    histStmts.push(updateHist.bind(
      nextAScore, nextBScore, ratingFields.match_score,
      clampStatCount(item.goals), clampStatCount(item.assists),
      ratingFields.is_mvp, ratingFields.rating_before, ratingFields.delta, ratingFields.rating_after, savedAt,
      item.goal_video_url || "", row.id
    ));
  }
  if (histStmts.length) await db.batch(histStmts);

  await db.prepare(`
    UPDATE match_summary SET
      team_a_score = ?, team_b_score = ?, opponent_name = ?,
      mvp_players = ?, result_saved_at = ?,
      highlight_video_url = COALESCE(?, highlight_video_url)
    WHERE match_id = ?
  `).bind(String(nextAScore), String(nextBScore), opponentName || null, mvpNames.join(", "), savedAt, editHighlightVideo, matchId).run();

  await updateRosterFromResult(db, finalized, matchId, matchDate, savedAt);

  return {
    ok: true,
    version: APP_VERSION,
    match_id: matchId,
    match_label: summary.match_label,
    status: "completed",
    edited: true,
    team_a_score: nextAScore,
    team_b_score: nextBScore,
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

  const updatePlayer = db.prepare(
    "UPDATE players SET base_rating = ?, rating = ?, mvp_count = ?, last_match_at = ? WHERE id = ?"
  );
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
    const isAnonymous = Number(roster?.is_anonymous) === 1
      || p.is_anonymous === true
      || p.is_anonymous === 1
      || p.is_anonymous === "1";

    // Ẩn danh: luôn rating 5, không cộng/trừ rating, không MVP, không ghi rating_log
    if (isAnonymous) {
      if (roster) {
        stmts.push(updatePlayer.bind(5, 5, 0, savedAt, roster.id));
      }
      continue;
    }

    const baseBefore = clampBaseRating(Number(roster?.base_rating ?? roster?.rating ?? p.rating_before) || 5);
    const delta = calcRatingDelta(p.match_score);
    const baseAfter = clampBaseRating(baseBefore + delta);
    const mvpBefore = Math.max(0, Math.round(Number(p.mvp_count_before) || roster?.mvp_count || 0));
    const mvpAfter = mvpBefore + (p.is_mvp ? 1 : 0);

    if (roster) {
      stmts.push(updatePlayer.bind(baseAfter, baseAfter, mvpAfter, savedAt, roster.id));
    }

    stmts.push(insertLog.bind(
      matchId, matchDate, p.player_name, Number(p.match_score),
      baseBefore, delta, baseAfter, p.is_mvp ? 1 : 0,
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

  const updatePlayer = db.prepare("UPDATE players SET base_rating = ?, rating = ?, mvp_count = ? WHERE id = ?");
  const stmts = [];

  for (const r of rosterRows.results || []) {
    if (Number(r.is_anonymous) === 1) {
      stmts.push(updatePlayer.bind(5, 5, 0, r.id));
      continue;
    }

    const key = normalizeName(r.name);
    const logs = logsByPlayer[key] || [];
    let rating;
    let mvpCount;

    if (logs.length) {
      const last = logs[logs.length - 1];
      rating = clampBaseRating(last.rating_after);
      mvpCount = Math.max(0, Math.round(Number(last.mvp_count_after) || 0));
    } else if (removedByPlayer[key]) {
      rating = clampBaseRating(removedByPlayer[key].rating_before);
      mvpCount = Math.max(0, Math.round(Number(removedByPlayer[key].mvp_count_before) || 0));
    } else {
      continue;
    }

    stmts.push(updatePlayer.bind(rating, rating, mvpCount, r.id));
  }

  if (stmts.length) await db.batch(stmts);
  await applyInactivityDecay(db);
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
    const nowIso = new Date().toISOString();
    const ins = db.prepare(`
      INSERT OR REPLACE INTO players (
        name, name_norm, display_name, position, secondary_positions, preferred_side,
        rating, base_rating, mvp_count, avatar, profile_card, jersey_number, description, birth_date, joined_at, last_match_at, is_anonymous
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stmts = payload.players.map((p) => {
      const base = clampBaseRating(p.rating || 5);
      const anon = p.is_anonymous === true || p.is_anonymous === 1 || p.is_anonymous === "1" ? 1 : 0;
      return ins.bind(
        p.name,
        normalizeName(p.name),
        String(p.display_name || "").trim(),
        p.position || p.main || "MID",
        p.secondary_positions || "",
        p.preferred_side || "",
        base,
        base,
        Math.max(0, Math.round(Number(p.mvp_count) || 0)),
        p.avatar || "",
        p.profile_card || "",
        parseJerseyNumber(p.jersey_number),
        String(p.description || "").trim(),
        parseBirthDate(p.birth_date),
        p.joined_at || nowIso,
        p.last_match_at || "",
        anon
      );
    });
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
