import { APP_VERSION } from "./utils.js";
import {
  fetchEspnLeagueEvents,
  isOddsQuotaBlocked,
  withOddsApiKey
} from "./espn-fallback.js";

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const CACHE_PREFIX = "odds:v3:";
/** Fresh TTL dài hơn để tiết kiệm quota free */
const TTL_SEC = 30 * 60;
/** Giữ bản cache cũ trên KV để fallback khi hết quota / API lỗi */
const STALE_KEEP_SEC = 7 * 24 * 3600;
const MAX_BOOKS = 6;

const LEAGUES = [
  { key: "soccer_epl", label: "Ngoại hạng Anh", short: "EPL" },
  { key: "soccer_spain_la_liga", label: "La Liga", short: "La Liga" },
  { key: "soccer_italy_serie_a", label: "Serie A", short: "Serie A" },
  { key: "soccer_germany_bundesliga", label: "Bundesliga", short: "Bundesliga" },
  { key: "soccer_france_ligue_one", label: "Ligue 1", short: "Ligue 1" },
  { key: "soccer_uefa_champs_league", label: "Champions League", short: "C1" },
  { key: "soccer_japan_j_league", label: "J League", short: "J League" },
  { key: "soccer_korea_kleague1", label: "K League 1", short: "K League" },
  { key: "soccer_china_superleague", label: "Chinese Super League", short: "CSL" }
];

const LEAGUE_MAP = Object.fromEntries(LEAGUES.map((l) => [l.key, l]));

const BOOK_PRIORITY = [
  "pinnacle",
  "bet365",
  "williamhill",
  "unibet_eu",
  "unibet",
  "betfair_ex_eu",
  "betfair",
  "draftkings",
  "fanduel",
  "bovada",
  "mybookieag",
  "betonlineag"
];

const BOOK_LABELS = {
  pinnacle: "Pinnacle",
  bet365: "bet365",
  williamhill: "William Hill",
  unibet_eu: "Unibet",
  unibet: "Unibet",
  betfair_ex_eu: "Betfair",
  betfair: "Betfair",
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  bovada: "Bovada",
  mybookieag: "MyBookie",
  betonlineag: "BetOnline"
};

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
          { expirationTtl: Math.max(writeTtl + 120, isEspn ? 300 : STALE_KEEP_SEC) }
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

function bookLabel(key) {
  const k = String(key || "").toLowerCase();
  if (BOOK_LABELS[k]) return BOOK_LABELS[k];
  return k
    .split(/[_-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function bookRank(key) {
  const idx = BOOK_PRIORITY.indexOf(String(key || "").toLowerCase());
  return idx === -1 ? 1000 : idx;
}

function pickOutcomes(outcomes = []) {
  const map = {};
  for (const o of outcomes) {
    const name = String(o?.name || "").trim();
    if (!name) continue;
    map[name] = {
      price: Number(o.price),
      point: o.point == null || o.point === "" ? null : Number(o.point)
    };
  }
  return map;
}

function normalizeBookH2h(book, homeName, awayName) {
  const m = (book.markets || []).find((x) => x.key === "h2h");
  if (!m) return null;
  const out = pickOutcomes(m.outcomes || []);
  const home = out[homeName]?.price;
  const away = out[awayName]?.price;
  const draw = out.Draw?.price ?? out.draw?.price;
  if (![home, draw, away].some((n) => Number.isFinite(n))) return null;
  return {
    book: book.key,
    book_label: bookLabel(book.key),
    home: Number.isFinite(home) ? home : null,
    draw: Number.isFinite(draw) ? draw : null,
    away: Number.isFinite(away) ? away : null
  };
}

function normalizeBookAh(book, homeName, awayName) {
  const m = (book.markets || []).find((x) => x.key === "spreads");
  if (!m) return null;
  const out = pickOutcomes(m.outcomes || []);
  const home = out[homeName];
  const away = out[awayName];
  if (!home && !away) return null;
  return {
    book: book.key,
    book_label: bookLabel(book.key),
    home_point: home?.point ?? null,
    home: Number.isFinite(home?.price) ? home.price : null,
    away_point: away?.point ?? null,
    away: Number.isFinite(away?.price) ? away.price : null
  };
}

function normalizeBookOu(book) {
  const m = (book.markets || []).find((x) => x.key === "totals");
  if (!m) return null;
  const out = pickOutcomes(m.outcomes || []);
  const over = out.Over || out.over;
  const under = out.Under || out.under;
  if (!over && !under) return null;
  return {
    book: book.key,
    book_label: bookLabel(book.key),
    point: over?.point ?? under?.point ?? null,
    over: Number.isFinite(over?.price) ? over.price : null,
    under: Number.isFinite(under?.price) ? under.price : null
  };
}

function selectBooks(bookmakers = []) {
  return [...bookmakers]
    .sort((a, b) => bookRank(a.key) - bookRank(b.key))
    .slice(0, MAX_BOOKS);
}

function normalizeEvent(raw, leagueKey) {
  const league = LEAGUE_MAP[leagueKey] || { key: leagueKey, label: leagueKey, short: leagueKey };
  const home = String(raw?.home_team || "").trim();
  const away = String(raw?.away_team || "").trim();
  const books = selectBooks(raw?.bookmakers || []);
  const h2h = books.map((b) => normalizeBookH2h(b, home, away)).filter(Boolean);
  const ah = books.map((b) => normalizeBookAh(b, home, away)).filter(Boolean);
  const ou = books.map((b) => normalizeBookOu(b)).filter(Boolean);

  return {
    id: String(raw?.id || ""),
    commence_time: String(raw?.commence_time || ""),
    league: league.key,
    league_label: league.label,
    league_short: league.short,
    home,
    away,
    markets: { h2h, ah, ou }
  };
}

async function fetchLeagueOdds(apiKey, leagueKey) {
  const qs = new URLSearchParams({
    apiKey,
    regions: "uk,eu",
    markets: "h2h,spreads,totals",
    oddsFormat: "decimal",
    dateFormat: "iso"
  });
  const url = `${ODDS_BASE}/sports/${encodeURIComponent(leagueKey)}/odds/?${qs}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DUFC-Odds/1.0 (+https://diamondunitedfc.com)"
    }
  });
  if (!res.ok) {
    await throwOddsApiError(res, "Không tải được kèo");
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((ev) => normalizeEvent(ev, leagueKey));
}

async function loadLeagueOddsWithFallback(env, leagueKey) {
  const kv = env.AVATARS;
  const league = LEAGUE_MAP[leagueKey] || { key: leagueKey, label: leagueKey, short: leagueKey };
  const blocked = await isOddsQuotaBlocked(kv);
  if (blocked) {
    return fetchEspnLeagueEvents(league);
  }
  try {
    return await withOddsApiKey(env, kv, (apiKey) => fetchLeagueOdds(apiKey, leagueKey));
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

function parseWindowHours(params) {
  const w = String(params.window || params.range || "14d").trim().toLowerCase();
  if (w === "today" || w === "24h" || w === "1d") return 24;
  if (w === "48h" || w === "2d") return 48;
  if (w === "72h" || w === "3d") return 72;
  if (w === "7d" || w === "week") return 24 * 7;
  if (w === "30d" || w === "month") return 24 * 30;
  if (w === "all" || w === "upcoming") return 24 * 60;
  // default: 14 days — phù hợp giai giải / lịch thưa
  if (w === "14d" || w === "2w") return 24 * 14;
  return 24 * 14;
}

function filterByWindow(matches, hours) {
  const now = Date.now();
  const end = now + hours * 3600 * 1000;
  // include matches started up to 3h ago (still useful)
  const start = now - 3 * 3600 * 1000;
  return (matches || []).filter((m) => {
    const t = Date.parse(m.commence_time);
    if (!Number.isFinite(t)) return false;
    return t >= start && t <= end;
  });
}

async function loadLeagues(env, leagueKeys) {
  const kv = env.AVATARS;
  const quotaBlocked = await isOddsQuotaBlocked(kv);
  const chunks = await Promise.all(
    leagueKeys.map((key) =>
      getCached(kv, `league:${key}`, TTL_SEC, () => loadLeagueOddsWithFallback(env, key)).catch((err) => ({
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

export async function oddsHub(env, params = {}) {
  const leagueKeys = parseLeagueParam(params.league);
  const hours = parseWindowHours(params);
  const loaded = await loadLeagues(env, leagueKeys);
  const matches = filterByWindow(loaded.matches, hours)
    .sort((a, b) => String(a.commence_time).localeCompare(String(b.commence_time)));

  let message = matches.length ? "" : "Chưa có trận trong khung giờ đã chọn.";

  return {
    ok: true,
    version: APP_VERSION,
    source: loaded.stale ? "cache-or-fallback" : "the-odds-api",
    stale: loaded.stale,
    cached_at: loaded.cachedAt,
    disclaimer: "Tỷ lệ mang tính tham khảo, không phải lời mời đặt cược.",
    window_hours: hours,
    leagues: LEAGUES,
    updated_at: loaded.cachedAt || new Date().toISOString(),
    count: matches.length,
    matches,
    empty: !matches.length,
    message
  };
}

export async function oddsMatch(env, params = {}) {
  const id = String(params.id || params.match_id || "").trim();
  if (!id) throw new Error("id is required");
  const loaded = await loadLeagues(env, LEAGUES.map((l) => l.key));
  const item = loaded.matches.find((m) => m.id === id);
  if (!item) {
    return {
      ok: true,
      version: APP_VERSION,
      source: loaded.stale ? "cache" : "the-odds-api",
      stale: loaded.stale,
      cached_at: loaded.cachedAt,
      empty: true,
      message: "Không tìm thấy trận.",
      item: null
    };
  }
  return {
    ok: true,
    version: APP_VERSION,
    source: loaded.stale ? "cache" : "the-odds-api",
    stale: loaded.stale,
    cached_at: loaded.cachedAt,
    disclaimer: "Tỷ lệ mang tính tham khảo, không phải lời mời đặt cược.",
    item
  };
}
