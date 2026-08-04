/** ESPN public scoreboard — fallback khi The Odds API hết quota / lỗi */

export {
  isOddsQuotaBlocked,
  isQuotaErrorMessage,
  markOddsQuotaBlocked,
  shouldRotateOddsKey,
  withOddsApiKey,
  listOddsApiKeys,
  getOrderedOddsApiKeys,
  clearOddsQuotaBlocked
} from "./odds-keys.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

const ESPN_PATH = {
  soccer_epl: "eng.1",
  soccer_spain_la_liga: "esp.1",
  soccer_italy_serie_a: "ita.1",
  soccer_germany_bundesliga: "ger.1",
  soccer_france_ligue_one: "fra.1",
  soccer_uefa_champs_league: "uefa.champions",
  soccer_uefa_champs_league_qualification: "uefa.champions",
  soccer_japan_j_league: "jpn.1",
  soccer_korea_kleague1: "kor.1",
  soccer_china_superleague: "chn.1"
};

function mapEspnStatus(event) {
  const type = event?.status?.type || {};
  const state = String(type.state || "").toLowerCase();
  const name = String(type.name || "").toUpperCase();
  if (state === "in" || name.includes("STATUS_IN") || (type.completed === false && state === "in")) {
    return "live";
  }
  if (state === "post" || type.completed === true || name.includes("FINAL") || name.includes("FT")) {
    return "finished";
  }
  return "scheduled";
}

function pickSide(competitors, side) {
  return (competitors || []).find((c) => c?.homeAway === side) || null;
}

export function normalizeEspnEvent(raw, leagueMeta) {
  const comp = (raw?.competitions || [])[0] || {};
  const competitors = comp.competitors || [];
  const home = pickSide(competitors, "home");
  const away = pickSide(competitors, "away");
  const status = mapEspnStatus(raw);
  const homeScore = home?.score;
  const awayScore = away?.score;
  const scoreHome = homeScore === "" || homeScore == null ? null : Number(homeScore);
  const scoreAway = awayScore === "" || awayScore == null ? null : Number(awayScore);

  return {
    id: String(raw?.id || comp?.id || ""),
    league: leagueMeta.key,
    league_label: leagueMeta.label,
    league_short: leagueMeta.short,
    home: String(home?.team?.displayName || home?.team?.name || "").trim(),
    away: String(away?.team?.displayName || away?.team?.name || "").trim(),
    commence_time: String(raw?.date || comp?.date || ""),
    status,
    score_home: Number.isFinite(scoreHome) ? scoreHome : null,
    score_away: Number.isFinite(scoreAway) ? scoreAway : null,
    last_update: null,
    completed: status === "finished",
    markets: { h2h: [], ah: [], ou: [] },
    source: "espn"
  };
}

export async function fetchEspnLeagueEvents(leagueMeta) {
  const path = ESPN_PATH[leagueMeta.key];
  if (!path) return [];
  const url = `${ESPN_BASE}/${encodeURIComponent(path)}/scoreboard`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DUFC-Livescore/1.0 (+https://diamondunitedfc.com)"
    }
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const events = Array.isArray(data?.events) ? data.events : [];
  return events
    .map((ev) => normalizeEspnEvent(ev, leagueMeta))
    .filter((m) => m.id && m.home && m.away);
}
