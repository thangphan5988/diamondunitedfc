export const APP_VERSION = "v2.0.0";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeMatchDate(value) {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if (!s) return "";

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }

  const vn = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (vn) {
    return `${vn[3]}-${String(vn[2]).padStart(2, "0")}-${String(vn[1]).padStart(2, "0")}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return "";
}

export function calcRatingDelta(matchScore) {
  const s = Number(matchScore);
  if (!Number.isFinite(s)) return 0;
  if (s >= 8) return 1;
  if (s <= 5) return -1;
  return 0;
}

export function clampBaseRating(rating) {
  const n = Math.round(Number(rating) || 0);
  return Math.max(1, n);
}

export function clampRating(rating) {
  return clampBaseRating(rating);
}

export function effectiveRating(baseRating, penalty) {
  const base = Math.round(Number(baseRating) || 0);
  const cut = Math.max(0, Math.round(Number(penalty) || 0));
  return Math.max(0, base - cut);
}

export function calcInactivityPenalty(daysInactive) {
  const days = Math.max(0, Math.floor(Number(daysInactive) || 0));
  return Math.floor(days / 8);
}

export function parseTimestamp(value) {
  const s = String(value || "").trim();
  if (!s) return null;

  const iso = Date.parse(s);
  if (Number.isFinite(iso) && /^\d{4}-\d{2}-\d{2}/.test(s)) return iso;

  const norm = normalizeMatchDate(s);
  if (norm) {
    const t = Date.parse(`${norm}T12:00:00.000Z`);
    if (Number.isFinite(t)) return t;
  }

  const fallback = Date.parse(s);
  return Number.isFinite(fallback) ? fallback : null;
}

export function daysSinceTimestamp(value, nowMs = Date.now()) {
  const ts = parseTimestamp(value);
  if (ts == null) return 0;
  const diff = nowMs - ts;
  if (diff <= 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

export function clampStatCount(value) {
  return Math.max(0, Math.min(99, Math.round(Number(value) || 0)));
}

export function clampPositiveIntScore(value, fallback = 0) {
  if (value == null || String(value).trim() === "") {
    const fb = Number(fallback);
    return Number.isFinite(fb) && fb >= 0 ? Math.min(99, Math.floor(fb)) : 0;
  }
  const s = String(value).trim().replace(",", ".");
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(99, n);
  }
  const f = Number(s);
  if (!Number.isFinite(f) || f < 0) {
    const fb = Number(fallback);
    return Number.isFinite(fb) && fb >= 0 ? Math.min(99, Math.floor(fb)) : 0;
  }
  return Math.min(99, Math.floor(f));
}

export function formatSummaryScore(value) {
  if (value == null || String(value).trim() === "") return "";
  return clampPositiveIntScore(value, 0);
}

export function parsePermissions(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return [];
  if (raw === "all") return ["all"];
  return raw.split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
}

export function hasPermission(permissions, required) {
  const list = Array.isArray(permissions) ? permissions : parsePermissions(permissions);
  if (list.includes("all")) return true;
  const req = Array.isArray(required) ? required : [required];
  return req.some((r) => list.includes(String(r).toLowerCase()));
}

export function boolish(v) {
  return v === true || v === 1 || String(v).toUpperCase() === "TRUE";
}

export function parseCustomCoord(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeVideoUrl(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^https?:\/\/.+/i.test(s)) return s;
  throw new Error("Link video phải bắt đầu bằng http:// hoặc https://");
}

export function parseGoalVideoUrls(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((u) => String(u || "").trim()).filter(Boolean);
  }
  const s = String(value).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map((u) => String(u || "").trim()).filter(Boolean);
      }
    } catch {
      /* legacy plain URL */
    }
  }
  return [s];
}

export function serializeGoalVideoUrls(value, maxGoals = null) {
  let urls = parseGoalVideoUrls(value);
  if (maxGoals != null) {
    const n = Math.max(0, Math.round(Number(maxGoals) || 0));
    urls = urls.slice(0, n);
  }
  urls = urls.map((u) => normalizeVideoUrl(u)).filter(Boolean);
  if (!urls.length) return "";
  if (urls.length === 1) return urls[0];
  return JSON.stringify(urls);
}

export function normalizeGoalVideoUrls(value, maxGoals = null) {
  return serializeGoalVideoUrls(value, maxGoals);
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

export function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    }
  });
}

export function applyTeamMvpRules(players, matchType) {
  const mvpKeys = new Set();
  const type = String(matchType || "internal").toLowerCase();

  if (type === "cap") {
    let maxScore = -1;
    let winner = null;
    for (const p of players) {
      const s = Number(p.match_score);
      if (!Number.isFinite(s)) continue;
      if (s > maxScore) {
        maxScore = s;
        winner = p;
      } else if (s === maxScore && winner) {
        const aStarter = boolish(p.starter);
        const bStarter = boolish(winner.starter);
        if (aStarter && !bStarter) winner = p;
        else if (aStarter === bStarter && String(p.player_name).localeCompare(String(winner.player_name), "vi") < 0) {
          winner = p;
        }
      }
    }
    if (winner) mvpKeys.add(normalizeName(winner.player_name));
  } else {
    const teams = ["A", "B"];
    for (const team of teams) {
      const list = players.filter((p) => String(p.team || "").toUpperCase() === team);
      let maxScore = -1;
      for (const p of list) {
        const s = Number(p.match_score);
        if (Number.isFinite(s) && s > maxScore) maxScore = s;
      }
      const tied = list.filter((p) => Number(p.match_score) === maxScore);
      tied.sort((a, b) => {
        const aStarter = boolish(a.starter);
        const bStarter = boolish(b.starter);
        if (aStarter !== bStarter) return aStarter ? -1 : 1;
        return String(a.player_name).localeCompare(String(b.player_name), "vi");
      });
      if (tied.length) mvpKeys.add(normalizeName(tied[0].player_name));
    }
  }

  return players.map((p) => ({
    ...p,
    is_mvp: mvpKeys.has(normalizeName(p.player_name))
  }));
}

export function mapHistoryPlayer(row) {
  return {
    team: row.team,
    shirt: row.shirt,
    player_name: row.player_name,
    starter: boolish(row.starter),
    assigned_position: row.assigned_position,
    assigned_side: row.assigned_side,
    main_position: row.main_position,
    fit_label: row.fit_label,
    lineup_order: row.lineup_order,
    rating: row.rating,
    match_score: row.match_score,
    goals: row.goals,
    assists: row.assists,
    is_mvp: boolish(row.is_mvp),
    rating_before: row.rating_before,
    rating_delta: row.rating_delta,
    rating_after: row.rating_after,
    captain: boolish(row.captain),
    custom_x: row.custom_x != null ? Number(row.custom_x) : null,
    custom_y: row.custom_y != null ? Number(row.custom_y) : null,
    goal_video_url: parseGoalVideoUrls(row.goal_video_url)[0] || "",
    goal_video_urls: parseGoalVideoUrls(row.goal_video_url)
  };
}

export function mapSummary(row) {
  if (!row) return null;
  return {
    match_id: row.match_id,
    match_label: row.match_label,
    match_date: row.match_date,
    created_at: row.created_at,
    match_type: row.match_type,
    opponent_name: row.opponent_name,
    formation_a: row.formation_a,
    formation_b: row.formation_b,
    team_a_score: formatSummaryScore(row.team_a_score),
    team_b_score: formatSummaryScore(row.team_b_score),
    mvp_players: row.mvp_players,
    player_count: row.player_count,
    status: row.status,
    image_filename: row.image_filename,
    result_saved_at: row.result_saved_at,
    team_a_result_saved: !!row.team_a_result_saved,
    team_b_result_saved: !!row.team_b_result_saved,
    team_a_lineup_confirmed: !!row.team_a_lineup_confirmed,
    team_b_lineup_confirmed: !!row.team_b_lineup_confirmed,
    highlight_video_url: row.highlight_video_url || ""
  };
}

export function slugifyAvatarFilename(value) {
  return String(value || "player")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "player";
}

export function decodeBase64Image(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Thiếu dữ liệu ảnh.");
  const base64 = text.includes(",") ? text.split(",").pop() : text;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
