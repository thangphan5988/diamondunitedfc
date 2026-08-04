import { APP_VERSION } from "./utils.js";
import {
  fetchEspnLeagueEvents,
  isOddsQuotaBlocked,
  withOddsApiKey
} from "./espn-fallback.js";

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const CACHE_PREFIX = "livescore:v3:";
const TTL_SEC = 5 * 60;
/** Giữ bản cache cũ trên KV để fallback khi hết quota / API lỗi */
const STALE_KEEP_SEC = 7 * 24 * 3600;

const LEAGUES = [
  { key: "soccer_epl", label: "Ngoại hạng Anh", short: "EPL" },
  { key: "soccer_spain_la_liga", label: "La Liga", short: "La Liga" },
  { key: "soccer_italy_serie_a", label: "Serie A", short: "Serie A" },
  { key: "soccer_germany_bundesliga", label: "Bundesliga", short: "Bundesliga" },
  { key: "soccer_france_ligue_one", label: "Ligue 1", short: "Ligue 1" },
  { key: "soccer_uefa_champs_league_qualification", label: "Champions League", short: "C1" },
  { key: "soccer_japan_j_league", label: "J League", short: "J League" },
  { key: "soccer_korea_kleague1", label: "K League 1", short: "K League" },
  { key: "soccer_china_superleague", label: "Chinese Super League", short: "CSL" }
];

const LEAGUE_MAP = Object.fromEntries(LEAGUES.map((l) => [l.key, l]));

async function throwOddsApiError(res, fallback) {
  let code = "";
  let message = "";
  try {
    const body = await res.json();
    code = String(body?.error_code || "");
    message = String(body?.message || "");
  } catch (_) {
    // ignore
  }
  if (code === "OUT_OF_USAGE_CREDITS" || /quota|usage credits/i.test(message)) {
    throw new Error("Đã hết quota The Odds API (free ~500 request/tháng). Tạo key mới hoặc nâng plan tại the-odds-api.com.");
  }
  if (code === "INVALID_KEY" || res.status === 401 || res.status === 403) {
    throw new Error("ODDS_API_KEY không hợp lệ.");
  }
  if (res.status === 429) {
    throw new Error("The Odds API đang giới hạn tốc độ. Thử lại sau.");
  }
  throw new Error(`${fallback} (${res.status})${message ? `: ${message.slice(0, 120)}` : ""}`);
}

async function getCached(kv, key, ttlSec, loader) {
  const cacheKey = CACHE_PREFIX + key;
  let staleData = null;
  let staleCachedAt = null;

  if (kv) {
    try {
      const raw = await kv.get(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.data != null && parsed.expires > Date.now()) {
          return {
            data: parsed.data,
            fromCache: true,
            stale: false,
            cachedAt: parsed.cachedAt || null
          };
        }
        if (parsed?.data != null) {
          staleData = parsed.data;
          staleCachedAt = parsed.cachedAt || null;
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  try {
    const data = await loader();
    const cachedAt = new Date().toISOString();
    const isEspn = Array.isArray(data) && data.some((m) => m?.source === "espn");
    const writeTtl = isEspn ? Math.min(90, ttlSec) : ttlSec;
    if (kv) {
      try {
        await kv.put(
          cacheKey,
          JSON.stringify({ expires: Date.now() + writeTtl * 1000, cachedAt, data }),
          { expirationTtl: Math.max(writeTtl + 60, isEspn ? 300 : STALE_KEEP_SEC) }
        );
      } catch (_) {
        /* ignore */
      }
    }
    return { data, fromCache: false, stale: isEspn, cachedAt };
  } catch (err) {
    if (staleData != null) {
      return {
        data: staleData,
        fromCache: true,
        stale: true,
        cachedAt: staleCachedAt,
        error: err?.message || String(err)
      };
    }
    throw err;
  }
}

function parseScorePair(raw) {
  const homeName = String(raw?.home_team || "").trim();
  const awayName = String(raw?.away_team || "").trim();
  const scores = Array.isArray(raw?.scores) ? raw.scores : [];
  let home = null;
  let away = null;
  for (const s of scores) {
    const name = String(s?.name || "").trim();
    const val = s?.score == null || s.score === "" ? null : Number(s.score);
    if (!Number.isFinite(val)) continue;
    if (name === homeName) home = val;
    else if (name === awayName) away = val;
  }
  return { home, away };
}

function deriveStatus(raw) {
  if (raw?.completed) return "finished";
  const { home, away } = parseScorePair(raw);
  if (home != null || away != null) return "live";
  const t = Date.parse(raw?.commence_time);
  if (Number.isFinite(t) && t <= Date.now() + 5 * 60 * 1000 && t >= Date.now() - 3 * 3600 * 1000) {
    // gần giờ đá / vừa bắt đầu nhưng chưa có score
    if (t <= Date.now()) return "live";
  }
  return "scheduled";
}

function normalizeMatch(raw, leagueKey) {
  const league = LEAGUE_MAP[leagueKey] || { key: leagueKey, label: leagueKey, short: leagueKey };
  const { home, away } = parseScorePair(raw);
  const status = deriveStatus(raw);
  return {
    id: String(raw?.id || ""),
    league: league.key,
    league_label: league.label,
    league_short: league.short,
    home: String(raw?.home_team || "").trim(),
    away: String(raw?.away_team || "").trim(),
    commence_time: String(raw?.commence_time || ""),
    status,
    score_home: home,
    score_away: away,
    last_update: raw?.last_update || null,
    completed: Boolean(raw?.completed)
  };
}

async function fetchLeagueScores(apiKey, leagueKey, daysFrom) {
  const qs = new URLSearchParams({
    apiKey,
    daysFrom: String(daysFrom),
    dateFormat: "iso"
  });
  const url = `${ODDS_BASE}/sports/${encodeURIComponent(leagueKey)}/scores/?${qs}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DUFC-Livescore/1.0 (+https://diamondunitedfc.com)"
    }
  });
  if (res.status === 404) {
    // sport key inactive / unknown
    return [];
  }
  if (!res.ok) {
    await throwOddsApiError(res, "Không tải được livescore");
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((ev) => normalizeMatch(ev, leagueKey));
}

async function loadLeagueScoresWithFallback(env, leagueKey, daysFrom) {
  const kv = env.AVATARS;
  const league = LEAGUE_MAP[leagueKey] || { key: leagueKey, label: leagueKey, short: leagueKey };
  const blocked = await isOddsQuotaBlocked(kv);
  if (blocked) {
    return fetchEspnLeagueEvents(league);
  }
  try {
    return await withOddsApiKey(env, kv, (apiKey) => fetchLeagueScores(apiKey, leagueKey, daysFrom));
  } catch (_) {
    return fetchEspnLeagueEvents(league);
  }
}

function parseLeagueParam(value) {
  const raw = String(value || "all").trim().toLowerCase();
  if (!raw || raw === "all") return LEAGUES.map((l) => l.key);
  if (LEAGUE_MAP[raw]) return [raw];
  const parts = raw.split(",").map((s) => s.trim()).filter((s) => LEAGUE_MAP[s]);
  return parts.length ? parts : LEAGUES.map((l) => l.key);
}

function parseStatusFilter(value) {
  const s = String(value || "all").trim().toLowerCase();
  if (s === "live" || s === "finished" || s === "scheduled") return s;
  return "all";
}

function parseDaysFrom(params) {
  const n = Math.round(Number(params.daysFrom || params.days || 1));
  if (!Number.isFinite(n)) return 1;
  return Math.min(3, Math.max(1, n));
}

async function loadScores(env, leagueKeys, daysFrom) {
  const kv = env.AVATARS;
  const quotaBlocked = await isOddsQuotaBlocked(kv);
  const chunks = await Promise.all(
    leagueKeys.map((key) =>
      getCached(kv, `scores:${key}:d${daysFrom}`, TTL_SEC, () =>
        loadLeagueScoresWithFallback(env, key, daysFrom)
      ).catch((err) => ({
        data: [],
        fromCache: false,
        stale: false,
        cachedAt: null,
        failed: true,
        error: err?.message || String(err)
      }))
    )
  );

  let stale = quotaBlocked;
  let cachedAt = null;
  let cacheError = "";
  let usedFallback = false;
  const matches = [];
  for (const chunk of chunks) {
    if (chunk.stale) stale = true;
    if (chunk.error) cacheError = chunk.error;
    if (chunk.cachedAt && (!cachedAt || chunk.cachedAt < cachedAt)) cachedAt = chunk.cachedAt;
    const rows = chunk.data || [];
    if (rows.some((m) => m?.source === "espn")) usedFallback = true;
    matches.push(...rows);
  }
  if (!matches.length && cacheError) {
    throw new Error(cacheError);
  }
  if (usedFallback || quotaBlocked) stale = true;
  return {
    matches,
    stale,
    cachedAt,
    cacheError: usedFallback || quotaBlocked ? "" : cacheError
  };
}

function sortMatches(matches) {
  const rank = { live: 0, scheduled: 1, finished: 2 };
  return [...matches].sort((a, b) => {
    const ra = rank[a.status] ?? 9;
    const rb = rank[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.commence_time).localeCompare(String(b.commence_time));
  });
}

/** Livescore hub — list trận + tỉ số live/FT */
export async function livescoreHub(env, params = {}) {
  const leagueKeys = parseLeagueParam(params.league);
  const status = parseStatusFilter(params.status);
  const daysFrom = parseDaysFrom(params);
  const loaded = await loadScores(env, leagueKeys, daysFrom);
  const all = sortMatches(loaded.matches);
  const matches = status === "all" ? all : all.filter((m) => m.status === status);

  const counts = {
    all: all.length,
    live: all.filter((m) => m.status === "live").length,
    scheduled: all.filter((m) => m.status === "scheduled").length,
    finished: all.filter((m) => m.status === "finished").length
  };

  let message = matches.length ? "" : "Chưa có trận trong bộ lọc hiện tại.";

  return {
    ok: true,
    version: APP_VERSION,
    source: loaded.stale ? "cache-or-fallback" : "the-odds-api",
    stale: loaded.stale,
    cached_at: loaded.cachedAt,
    disclaimer: "Tỉ số mang tính tham khảo, có thể chậm vài chục giây so với sóng trực tiếp.",
    days_from: daysFrom,
    status,
    leagues: LEAGUES,
    counts,
    updated_at: loaded.cachedAt || new Date().toISOString(),
    count: matches.length,
    matches,
    empty: !matches.length,
    message
  };
}
