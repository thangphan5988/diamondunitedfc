import { fetchWikiTeamSquad, fetchWikiPlayerProfile, enrichWikiSquadPlayers, wikiPlayerCacheKey } from "./wc2026-wiki.js";

const RSS_URL = "https://www.24h.com.vn/upload/rss/bongda.rss";
const WC26_API_BASE = "https://worldcup26.ir/get";
const NEWS_SOURCE = "https://www.24h.com.vn/world-cup-2026-c860.html";
const STATS_SOURCE = "https://worldcup26.ir";
const WIKI_SQUADS_SOURCE = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_squads";

const CACHE_PREFIX = "wc2026:";
const TTL = {
  news: 600,
  newsArticle: 3600,
  fixtures: 300,
  live: 60,
  standings: 600,
  teams: 3600,
  squad: 86400
};

const WC_KEYWORDS = [
  "world cup",
  "world cup 2026",
  "wc 2026",
  "fifa 2026"
];

function extractXmlTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(re);
  if (!match) return "";
  return decodeXmlEntities(match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1").trim());
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html) {
  return decodeXmlEntities(String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml))) {
    const block = match[1];
    const title = extractXmlTag(block, "title");
    const link = extractXmlTag(block, "link");
    const pubDate = extractXmlTag(block, "pubDate");
    const description = extractXmlTag(block, "description");
    const imgMatch = description.match(/src=['"]([^'"]+)['"]/i);
    items.push({
      title,
      link,
      pubDate,
      image: imgMatch ? imgMatch[1] : "",
      summary: stripHtml(description).slice(0, 220)
    });
  }
  return items;
}

function isWorldCupNews(item) {
  const hay = `${item.title} ${item.link} ${item.summary}`.toLowerCase();
  return WC_KEYWORDS.some((kw) => hay.includes(kw));
}

const ALLOWED_24H_HOSTS = new Set(["www.24h.com.vn", "24h.com.vn"]);
const ALLOWED_MEDIA_HOSTS = new Set(["cdn.24h.com.vn", "icdn.24h.com.vn", "www.24h.com.vn", "24h.com.vn"]);

function isAllowed24hUrl(url) {
  try {
    return ALLOWED_24H_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isAllowedMediaUrl(url) {
  try {
    return ALLOWED_MEDIA_HOSTS.has(new URL(url, "https://www.24h.com.vn").hostname);
  } catch {
    return false;
  }
}

function abs24hUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `https://www.24h.com.vn${raw}`;
  return raw;
}

function extractInnerById(html, id) {
  const re = new RegExp(`<[^>]+id="${id}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  const match = html.match(re);
  return match ? match[1].trim() : "";
}

function extractTagInner(html, openPattern, tagName) {
  const open = html.match(openPattern);
  if (!open) return "";
  const start = open.index + open[0].length;
  const tagRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagRe.lastIndex = start;
  let depth = 1;
  let match;
  while ((match = tagRe.exec(html)) && depth > 0) {
    const token = match[0];
    if (token.startsWith(`</${tagName}`)) depth -= 1;
    else depth += 1;
    if (depth === 0) return html.slice(start, match.index).trim();
  }
  return "";
}

function extractMetaContent(html, property) {
  const re1 = new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]+)"`, "i");
  const m1 = html.match(re1);
  if (m1) return m1[1];
  const re2 = new RegExp(`<meta[^>]+content="([^"]+)"[^>]+property="${property}"`, "i");
  const m2 = html.match(re2);
  return m2 ? m2[1] : "";
}

function sanitizeInlineHtml(raw) {
  return String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(?!strong|em|b|i|u|br)\w+[^>]*>/gi, "")
    .trim();
}

const ARTICLE_JUNK_DIV_CLASS =
  "popup|btn-save|btn-share|bv-lq|box-24h|bnrPtn|zplayer|minigame|linkOrigin|source-time|nguontin|see-now|readmore|sohatv-player-embed|v-24h-media|iframe-video|viewVideoPlay|viewVideo|box_bxh|box-24h-tntd|box-wc|cate-olym|professor_prebid";

function isPromoWidgetImage(url) {
  const s = String(url || "").toLowerCase();
  return /wc2026-\d|\/ltd-\d|\/bxh-\d|width210height39|width243height39|width230height39/.test(s);
}

function isVideoCaptionText(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/^video\b/i.test(t)) return true;
  if (/bản quyền thuộc về\s*vtv/i.test(t)) return true;
  if (/nội dung video trong bài/i.test(t)) return true;
  return false;
}

function removeJunkArticleBlocks(html) {
  let out = String(html || "");
  out = out.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  out = out.replace(/<video[\s\S]*?<\/video>/gi, "");
  out = out.replace(/<object[\s\S]*?<\/object>/gi, "");
  out = out.replace(/<embed\b[^>]*\/?>/gi, "");
  const junkDivRe = new RegExp(
    `<div[^>]*(?:class="[^"]*(?:${ARTICLE_JUNK_DIV_CLASS})[^"]*"|id="(?:ADS_[^"]*|professor_prebid-root)"[^>]*)>[\\s\\S]*?<\\/div>`,
    "gi"
  );
  for (let i = 0; i < 8; i++) {
    const next = out.replace(junkDivRe, "");
    if (next === out) break;
    out = next;
  }
  return out;
}

function removeVideoCaptionBlocks(html) {
  return String(html || "").replace(/<(p|div|figure|blockquote)[^>]*>[\s\S]*?<\/\1>/gi, (block) => {
    const text = stripHtml(block).replace(/\u00a0/g, " ");
    return isVideoCaptionText(text) ? "" : block;
  });
}

function sanitizeArticleHtml(raw) {
  let html = String(raw || "");
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = removeJunkArticleBlocks(html);
  html = html.replace(/<h2[^>]*id="article_sapo"[\s\S]*?<\/h2>/gi, "");
  html = html.replace(/<(?:nav|form|button|svg|section)[\s\S]*?<\/(?:nav|form|button|svg|section)>/gi, "");
  html = html.replace(/\s(on\w+|data-[\w-]+|style|class|id|align|width|height|onclick)\s*=\s*("[^"]*"|'[^']*')/gi, "");

  html = html.replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, (tag, src) => {
    const abs = abs24hUrl(src);
    if (!isAllowedMediaUrl(abs) || isPromoWidgetImage(abs)) return "";
    const altMatch = tag.match(/\balt=["']([^"']*)["']/i);
    const alt = altMatch ? ` alt="${altMatch[1].replace(/"/g, "&quot;")}"` : "";
    return `<img src="${abs.replace(/"/g, "&quot;")}"${alt} loading="lazy">`;
  });

  for (let i = 0; i < 6; i++) {
    html = html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  }
  html = html.replace(/<a\b[^>]*\/>/gi, "");
  html = html.replace(/<p[^>]*>\s*(?:Xem thêm|Đọc thêm|Xem chi tiết|Đọc trên 24h)[^<]*<\/p>/gi, "");
  html = removeVideoCaptionBlocks(html);

  html = html.replace(/<\/?(?!p|br|strong|em|b|i|u|img|h2|h3|h4|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|div|figure|figcaption)\w+[^>]*>/gi, "");
  html = html.replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, "");
  html = html.replace(/<div>\s*<\/div>/gi, "");
  return html.replace(/\n{3,}/g, "\n\n").trim();
}

function parse24hArticlePage(html, url) {
  const title = stripHtml(extractInnerById(html, "article_title"));
  const sapo = sanitizeInlineHtml(extractInnerById(html, "article_sapo"));
  const dateMatch = html.match(/class="cate-24h-foot-arti-deta-cre-post"[^>]*>([\s\S]*?)<\//i);
  const pubDate = dateMatch ? stripHtml(dateMatch[1]) : "";
  const image = abs24hUrl(extractMetaContent(html, "og:image"));
  const infoHtml = extractTagInner(html, /<article[^>]*class="[^"]*cate-24h-foot-arti-deta-info[^"]*"/i, "article");
  const content = sanitizeArticleHtml(infoHtml);

  return {
    title,
    sapo,
    content,
    pubDate,
    image,
    link: url
  };
}

const NEWS_AJAX_QS = "v_is_ajax=1&v_device_global=pc&v_max_row=10&fk_listing_template=1074&pk_listing_template_box=12538&v_type_box_template=tin_bai_noi_bat_khac&v_show_date=0&v_show_event=0&v_show_icon_special_news=1&p_date=&v_view=5";
const NEWS_HUB_MAX_PAGE = 10;

function extractNewsImgSrc(block) {
  const original = block.match(/data-original=["']([^"']+)["']/i);
  if (original && !original[1].startsWith("data:image/gif")) return abs24hUrl(original[1]);
  const src = block.match(/\bsrc=["']([^"']+)["']/i);
  if (src && !src[1].startsWith("data:image/gif")) return abs24hUrl(src[1]);
  return "";
}

function extractNewsLink(block) {
  const m = block.match(/href=["'](https:\/\/www\.24h\.com\.vn\/[^"']+)["']/i);
  return m && isAllowed24hUrl(m[1]) ? m[1] : "";
}

function extractNewsTitle(block) {
  const alt = block.match(/alt=["']([^"']+)["']/i);
  if (alt) return decodeXmlEntities(alt[1].replace(/&quot;/g, '"'));
  const anchors = [...block.matchAll(/<a[^>]+href=["']https:\/\/www\.24h\.com\.vn\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const last = anchors[anchors.length - 1];
  return last ? stripHtml(last[1]) : "";
}

function isNewsVideoBlock(block) {
  return /icon-tags|data-classgitvideo|vidIco/i.test(block);
}

function isVideoNewsItem(item) {
  if (!item?.link) return true;
  const title = String(item.title || "").toLowerCase();
  const link = String(item.link || "").toLowerCase();
  if (/\bvideo\b/.test(title) || /\/video-/.test(link)) return true;
  if (/\bclip\b/.test(title)) return true;
  if (/trực tiếp/.test(title)) return true;
  return false;
}

function filterVideoNewsItems(items) {
  return (items || []).filter((item) => !isVideoNewsItem(item));
}

function sanitizeNewsHub(hub) {
  const nonVideoList = filterVideoNewsItems(hub.items);
  let left = filterVideoNewsItems(hub.hero?.left);
  let center = hub.hero?.center && !isVideoNewsItem(hub.hero.center) ? hub.hero.center : null;
  let right = filterVideoNewsItems(hub.hero?.right);

  const usedLinks = new Set(
    [center?.link, ...left.map((item) => item.link), ...right.map((item) => item.link)].filter(Boolean)
  );
  const pool = nonVideoList.filter((item) => !usedLinks.has(item.link));

  if (!center && pool.length) {
    center = pool.shift();
    usedLinks.add(center.link);
  }
  while (left.length < 2 && pool.length) left.push(pool.shift());
  while (right.length < 2 && pool.length) right.push(pool.shift());

  const items = nonVideoList.filter((item) => !usedLinks.has(item.link));
  return {
    hero: { left, center, right },
    items,
    maxPage: hub.maxPage || NEWS_HUB_MAX_PAGE
  };
}

function parseHeroNewsArticle(block) {
  const link = extractNewsLink(block);
  if (!link) return null;
  return {
    title: extractNewsTitle(block),
    link,
    image: extractNewsImgSrc(block),
    isVideo: isNewsVideoBlock(block)
  };
}

function parseListNewsArticle(block) {
  const link = extractNewsLink(block);
  if (!link) return null;
  const sumM = block.match(/cate-24h-foot-home-latest-list__sum[^>]*>([\s\S]*?)<\//i);
  return {
    title: extractNewsTitle(block),
    link,
    image: extractNewsImgSrc(block),
    summary: sumM ? stripHtml(sumM[1]) : "",
    isVideo: isNewsVideoBlock(block)
  };
}

function parse24hNewsHubPage(html) {
  const heroSection = html.match(/<section[^>]*class="[^"]*box-news-hightl-ftb[^"]*"[\s\S]*?<\/section>/i)?.[0] || "";
  const leftBlock = heroSection.match(/<div class="coll-left">([\s\S]*?)<\/div>\s*<!-- end left -->/i)?.[1] || "";
  const middleBlock = heroSection.match(/<div class="coll-middle[^"]*">([\s\S]*?)<\/div>\s*<!-- End: news -->/i)?.[1] || "";
  const rightBlock = heroSection.match(/<div class="coll-right">([\s\S]*?)<\/div>\s*<!-- End: right -->/i)?.[1] || "";
  const smallRe = /<article class="cate-24h-foot-box-news-hightl-small[^"]*"[\s\S]*?<\/article>/gi;
  const bigRe = /<article class="cate-24h-foot-box-news-hightl-big"[\s\S]*?<\/article>/i;
  const listRe = /<article class="cate-24h-foot-home-latest-list__box[\s\S]*?<\/article>/gi;

  const left = [...leftBlock.matchAll(smallRe)].map((m) => parseHeroNewsArticle(m[0])).filter(Boolean);
  const right = [...rightBlock.matchAll(smallRe)].map((m) => parseHeroNewsArticle(m[0])).filter(Boolean);
  const centerMatch = middleBlock.match(bigRe);
  const center = centerMatch ? parseHeroNewsArticle(centerMatch[0]) : null;
  const items = [...html.matchAll(listRe)].map((m) => parseListNewsArticle(m[0])).filter(Boolean);

  return {
    hero: { left, center, right },
    items,
    maxPage: NEWS_HUB_MAX_PAGE
  };
}

function parse24hNewsListAjax(html) {
  const listRe = /<article class="cate-24h-foot-home-latest-list__box[\s\S]*?<\/article>/gi;
  return [...html.matchAll(listRe)].map((m) => parseListNewsArticle(m[0])).filter(Boolean);
}

async function fetch24hNewsHubPage(page) {
  if (page <= 1) {
    const res = await fetch(NEWS_SOURCE, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DUFC/1.0; +https://diamondunitedfc.com)",
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (!res.ok) throw new Error(`24h HTTP ${res.status}`);
    return parse24hNewsHubPage(await res.text());
  }

  const url = `https://24h.24hstatic.com/ajax/box_template_tin_bai_noi_bat_khac/index/860/${page}/10/0/0/0/0?${NEWS_AJAX_QS}&t=${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DUFC/1.0; +https://diamondunitedfc.com)",
      Accept: "text/html,application/xhtml+xml"
    }
  });
  if (!res.ok) throw new Error(`24h AJAX HTTP ${res.status}`);
  return { items: parse24hNewsListAjax(await res.text()), maxPage: NEWS_HUB_MAX_PAGE };
}

async function getCachedWikiPlayerProfile(kv, name, teamName) {
  const key = wikiPlayerCacheKey(name);
  const cacheKey = CACHE_PREFIX + key;

  if (kv) {
    try {
      const raw = await kv.get(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.expires > Date.now() && parsed.data) return parsed.data;
      }
    } catch (_) {
      /* ignore cache read errors */
    }
  }

  const data = await fetchWikiPlayerProfile(name, teamName);
  const hasData = !!(data.image || data.height || data.weight);
  if (kv && hasData) {
    try {
      await kv.put(
        cacheKey,
        JSON.stringify({ expires: Date.now() + TTL.squad * 1000, data }),
        { expirationTtl: TTL.squad + 120 }
      );
    } catch (_) {
      /* ignore cache write errors */
    }
  }
  return data;
}

async function getCached(kv, key, ttlSec, loader) {
  const cacheKey = CACHE_PREFIX + key;
  if (kv) {
    try {
      const raw = await kv.get(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.expires > Date.now()) return parsed.data;
      }
    } catch (_) {
      /* ignore cache read errors */
    }
  }

  const data = await loader();
  if (kv) {
    try {
      await kv.put(
        cacheKey,
        JSON.stringify({ expires: Date.now() + ttlSec * 1000, data }),
        { expirationTtl: ttlSec + 120 }
      );
    } catch (_) {
      /* ignore cache write errors */
    }
  }
  return data;
}

async function fetchWc26(path) {
  const res = await fetch(`${WC26_API_BASE}${path}`, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) throw new Error(`WorldCup26 API HTTP ${res.status}`);
  return res.json();
}

function parseUsLocalDate(value) {
  const m = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return { date: String(value || ""), timestamp: null };
  const [, mm, dd, yyyy, hh, min] = m;
  const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${hh.padStart(2, "0")}:${min.padStart(2, "0")}:00`;
  const ts = Date.parse(iso);
  return {
    date: iso,
    timestamp: Number.isFinite(ts) ? Math.floor(ts / 1000) : null
  };
}

function stadiumTimezone(stadium) {
  const country = String(stadium?.country_en || "").trim().toLowerCase();
  const city = String(stadium?.city_en || "").trim().toLowerCase();
  const region = String(stadium?.region || "").trim().toLowerCase();
  if (country.includes("mexico")) {
    if (city.includes("monterrey")) return "America/Monterrey";
    return "America/Mexico_City";
  }
  if (country.includes("canada")) {
    if (city.includes("vancouver")) return "America/Vancouver";
    return "America/Toronto";
  }
  if (country.includes("united states")) {
    if (region === "western") return "America/Los_Angeles";
    if (region === "central") return "America/Chicago";
    if (region === "eastern") return "America/New_York";
    return "America/New_York";
  }
  return "UTC";
}

function zonedLocalToTimestamp(localDateStr, timeZone) {
  const m = String(localDateStr || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (!timeZone || timeZone === "UTC") {
    return Math.floor(Date.UTC(year, month - 1, day, hour, minute) / 1000);
  }
  let ms = Date.UTC(year, month - 1, day, hour, minute);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  for (let i = 0; i < 6; i++) {
    const parts = fmt.formatToParts(new Date(ms));
    const pick = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
    const got = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"));
    const want = Date.UTC(year, month - 1, day, hour, minute);
    const diff = want - got;
    if (diff === 0) break;
    ms += diff;
  }
  return Math.floor(ms / 1000);
}

function parseMatchDate(localDateStr, stadium) {
  const timeZone = stadiumTimezone(stadium);
  const timestamp = zonedLocalToTimestamp(localDateStr, timeZone);
  if (!timestamp) return parseUsLocalDate(localDateStr);
  return {
    date: new Date(timestamp * 1000).toISOString(),
    timestamp
  };
}

function mapGameStatus(game) {
  const finished = String(game.finished).toUpperCase() === "TRUE";
  const elapsedRaw = String(game.time_elapsed || "").toLowerCase();
  if (finished || elapsedRaw === "finished") {
    return { status: "FT", statusLong: "Kết thúc", elapsed: null };
  }
  if (elapsedRaw === "notstarted") {
    return { status: "NS", statusLong: "Chưa đá", elapsed: null };
  }
  const minute = Number.parseInt(elapsedRaw, 10);
  return { status: "LIVE", statusLong: "Đang đá", elapsed: Number.isFinite(minute) ? minute : null };
}

function scoreNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseScorers(raw) {
  if (!raw || String(raw).toLowerCase() === "null") return [];
  return String(raw)
    .replace(/^[\[{]+|[\]}]+$/g, "")
    .split(/[,،]/)
    .map((part) => part.replace(/["'“”{}]/g, "").trim())
    .filter(Boolean);
}

function normalizeGame(game, teamById, stadiumById) {
  const homeId = String(game.home_team_id);
  const awayId = String(game.away_team_id);
  const homeTeam = teamById.get(homeId) || {};
  const awayTeam = teamById.get(awayId) || {};
  const stadium = stadiumById.get(String(game.stadium_id)) || {};
  const { date, timestamp } = parseMatchDate(game.local_date, stadium);
  const st = mapGameStatus(game);

  return {
    id: game.id,
    date,
    timestamp,
    localLabel: game.local_date || "",
    status: st.status,
    statusLong: st.statusLong,
    elapsed: st.elapsed,
    matchday: game.matchday || "",
    type: game.type || "group",
    round: game.type === "knockout"
      ? "Vòng loại trực tiếp"
      : `Vòng bảng · Lượt ${game.matchday || "?"}`,
    group: game.group || "",
    venue: stadium.name_en || "",
    city: [stadium.city_en, stadium.country_en].filter(Boolean).join(", "),
    stadium: {
      id: stadium.id || game.stadium_id || "",
      name: stadium.name_en || "",
      fifaName: stadium.fifa_name || "",
      city: stadium.city_en || "",
      country: stadium.country_en || "",
      capacity: stadium.capacity || null,
      region: stadium.region || ""
    },
    home: {
      id: homeId,
      name: game.home_team_name_en || homeTeam.name_en || "",
      logo: homeTeam.flag || "",
      score: scoreNum(game.home_score),
      scorers: parseScorers(game.home_scorers)
    },
    away: {
      id: awayId,
      name: game.away_team_name_en || awayTeam.name_en || "",
      logo: awayTeam.flag || "",
      score: scoreNum(game.away_score),
      scorers: parseScorers(game.away_scorers)
    }
  };
}

async function loadWc26Dataset(env) {
  return getCached(env.AVATARS, "wc26:dataset:v2", TTL.fixtures, async () => {
    const [gamesRes, teamsRes, groupsRes, stadiumsRes] = await Promise.all([
      fetchWc26("/games"),
      fetchWc26("/teams"),
      fetchWc26("/groups"),
      fetchWc26("/stadiums")
    ]);

    const teams = teamsRes.teams || [];
    const stadiums = stadiumsRes.stadiums || [];
    const teamById = new Map(teams.map((t) => [String(t.id), t]));
    const stadiumById = new Map(stadiums.map((s) => [String(s.id), s]));

    const fixtures = (gamesRes.games || []).map((game) => normalizeGame(game, teamById, stadiumById));

    const groups = buildStandings(groupsRes.groups || [], teamById);
    const teamItems = teams.map((t) => ({
      id: t.id,
      name: t.name_en || "",
      logo: t.flag || "",
      country: t.iso2 || "",
      group: t.groups || "",
      fifaCode: t.fifa_code || ""
    })).sort((a, b) => a.name.localeCompare(b.name, "vi"));

    return { fixtures, groups, teamItems };
  });
}

function buildStandings(rawGroups, teamById) {
  return rawGroups
    .map((group) => {
      const rows = (group.teams || []).map((row) => {
        const team = teamById.get(String(row.team_id)) || {};
        return {
          team: {
            id: row.team_id,
            name: team.name_en || "",
            logo: team.flag || ""
          },
          played: Number(row.mp) || 0,
          win: Number(row.w) || 0,
          draw: Number(row.d) || 0,
          lose: Number(row.l) || 0,
          goalsFor: Number(row.gf) || 0,
          goalsAgainst: Number(row.ga) || 0,
          goalsDiff: Number(row.gd) || 0,
          points: Number(row.pts) || 0,
          group: group.name ? `Bảng ${group.name}` : ""
        };
      });

      rows.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalsDiff !== a.goalsDiff) return b.goalsDiff - a.goalsDiff;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.team.name.localeCompare(b.team.name);
      });

      return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
    })
    .sort((a, b) => String(a[0]?.group || "").localeCompare(String(b[0]?.group || ""), "vi"));
}

function fixtureScopeFilter(scope) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return (fx) => {
    const ts = fx.timestamp ? fx.timestamp * 1000 : Date.parse(fx.date);
    const status = fx.status;
    if (scope === "live") return status === "LIVE";
    if (scope === "results") return status === "FT";
    if (scope === "upcoming") {
      if (status === "FT") return false;
      if (!Number.isFinite(ts)) return status === "NS";
      return ts >= now - 3 * 60 * 60 * 1000 && ts <= now + weekMs;
    }
    return true;
  };
}

export async function wc2026News(env, params = {}) {
  const page = Math.max(1, Math.min(Number(params.page) || 1, NEWS_HUB_MAX_PAGE));

  if (page === 1) {
    const raw = await getCached(env.AVATARS, "news_hub:v3", TTL.news, () => fetch24hNewsHubPage(1));
    const hub = sanitizeNewsHub(raw);
    return {
      ok: true,
      source: "24h.com.vn",
      source_url: NEWS_SOURCE,
      page: 1,
      hasMore: page < (hub.maxPage || NEWS_HUB_MAX_PAGE),
      maxPage: hub.maxPage || NEWS_HUB_MAX_PAGE,
      hero: hub.hero || { left: [], center: null, right: [] },
      items: hub.items || [],
      updated_at: new Date().toISOString()
    };
  }

  const ajax = await getCached(env.AVATARS, `news_hub:v3:page:${page}`, TTL.news, () => fetch24hNewsHubPage(page));
  const items = filterVideoNewsItems(ajax.items);
  return {
    ok: true,
    source: "24h.com.vn",
    source_url: NEWS_SOURCE,
    page,
    hasMore: page < (ajax.maxPage || NEWS_HUB_MAX_PAGE),
    maxPage: ajax.maxPage || NEWS_HUB_MAX_PAGE,
    items,
    updated_at: new Date().toISOString()
  };
}

export async function wc2026NewsArticle(env, params = {}) {
  const url = String(params.url || "").trim();
  if (!isAllowed24hUrl(url)) {
    return { ok: false, error: "URL tin không hợp lệ" };
  }
  if (/\/video-/.test(url.toLowerCase()) || /\bclip\b/i.test(url)) {
    return { ok: false, error: "Bài video không được hỗ trợ" };
  }

  const cacheId = encodeURIComponent(url).slice(0, 180);
  const article = await getCached(env.AVATARS, `news_article:v3:${cacheId}`, TTL.newsArticle, async () => {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DUFC/1.0; +https://diamondunitedfc.com)",
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (!res.ok) throw new Error(`Không tải được bài 24h (${res.status})`);
    const html = await res.text();
    const parsed = parse24hArticlePage(html, url);
    if (!parsed.title && !parsed.content && !parsed.sapo) {
      throw new Error("Không đọc được nội dung bài viết");
    }
    if (isVideoNewsItem({ link: url, title: parsed.title })) {
      throw new Error("Bài video không được hỗ trợ");
    }
    return parsed;
  });

  if (isVideoNewsItem({ link: url, title: article.title })) {
    return { ok: false, error: "Bài video không được hỗ trợ" };
  }

  return {
    ok: true,
    source: "24h.com.vn",
    source_url: url,
    updated_at: new Date().toISOString(),
    ...article
  };
}

export async function wc2026Fixtures(env, params = {}) {
  const scope = String(params.scope || "upcoming").toLowerCase();
  const ttl = scope === "live" ? TTL.live : TTL.fixtures;
  const dataset = await getCached(env.AVATARS, `wc26:fixtures:${scope}`, ttl, () => loadWc26Dataset(env));

  const filtered = dataset.fixtures.filter(fixtureScopeFilter(scope));
  filtered.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  return {
    ok: true,
    source: "worldcup26.ir",
    source_url: STATS_SOURCE,
    scope,
    updated_at: new Date().toISOString(),
    items: filtered
  };
}

export async function wc2026Standings(env) {
  const dataset = await getCached(env.AVATARS, "wc26:standings", TTL.standings, () => loadWc26Dataset(env));

  return {
    ok: true,
    source: "worldcup26.ir",
    source_url: STATS_SOURCE,
    updated_at: new Date().toISOString(),
    groups: dataset.groups
  };
}

export async function wc2026Teams(env) {
  const dataset = await getCached(env.AVATARS, "wc26:teams", TTL.teams, () => loadWc26Dataset(env));

  return {
    ok: true,
    source: "worldcup26.ir",
    source_url: STATS_SOURCE,
    updated_at: new Date().toISOString(),
    items: dataset.teamItems
  };
}

export async function wc2026Match(env, params = {}) {
  const id = String(params.id || "").trim();
  if (!id) return { ok: false, error: "Thiếu id trận đấu" };

  const dataset = await loadWc26Dataset(env);
  const item = dataset.fixtures.find((fx) => String(fx.id) === id);
  if (!item) return { ok: false, error: "Không tìm thấy trận đấu" };

  return {
    ok: true,
    source: "worldcup26.ir",
    source_url: STATS_SOURCE,
    updated_at: new Date().toISOString(),
    item
  };
}

function findGroupStandings(dataset, groupLetter) {
  if (!groupLetter) return [];
  const label = `Bảng ${groupLetter}`;
  return dataset.groups.find((group) => String(group[0]?.group || "") === label) || [];
}

export async function wc2026Team(env, params = {}) {
  const id = String(params.id || "").trim();
  if (!id) return { ok: false, error: "Thiếu id đội bóng" };

  const dataset = await loadWc26Dataset(env);
  const team = dataset.teamItems.find((t) => String(t.id) === id);
  if (!team) return { ok: false, error: "Không tìm thấy đội bóng" };

  let standing = null;
  const groupStandings = findGroupStandings(dataset, team.group);
  for (const row of groupStandings) {
    if (String(row.team.id) === id) {
      standing = row;
      break;
    }
  }

  const matches = dataset.fixtures
    .filter((fx) => String(fx.home.id) === id || String(fx.away.id) === id)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const squad = await getCached(env.AVATARS, `wiki:squad:v4:${id}`, TTL.squad, async () => {
    const squadRaw = await fetchWikiTeamSquad(team.name);
    const squadPlayers = await enrichWikiSquadPlayers(squadRaw.players, team.name, async (name, teamLabel) =>
      getCachedWikiPlayerProfile(env.AVATARS, name, teamLabel)
    );
    return { ...squadRaw, players: squadPlayers };
  });

  return {
    ok: true,
    source: "worldcup26.ir",
    source_url: STATS_SOURCE,
    updated_at: new Date().toISOString(),
    item: {
      ...team,
      standing,
      groupStandings,
      groupLabel: team.group ? `Bảng ${team.group}` : "",
      squad,
      upcoming: matches.filter((fx) => fx.status !== "FT"),
      results: matches.filter((fx) => fx.status === "FT").reverse()
    }
  };
}

export async function wc2026PlayerProfile(env, params = {}) {
  const name = String(params.name || "").trim();
  const team = String(params.team || "").trim();
  if (!name) return { ok: false, error: "Thiếu tên cầu thủ" };

  const profile = await getCachedWikiPlayerProfile(env.AVATARS, name, String(params.team || "").trim());
  return {
    ok: true,
    source: "wikipedia.org",
    updated_at: new Date().toISOString(),
    item: profile
  };
}

export async function wc2026Hub(env) {
  const [news, fixtures, standings, teams] = await Promise.allSettled([
    wc2026News(env, { page: 1 }),
    wc2026Fixtures(env, { scope: "upcoming" }),
    wc2026Standings(env),
    wc2026Teams(env)
  ]);

  const pick = (result) => (result.status === "fulfilled" ? result.value : { ok: false, error: result.reason?.message || "error" });

  return {
    ok: true,
    news: pick(news),
    fixtures: pick(fixtures),
    live: await wc2026Fixtures(env, { scope: "live" }).catch((err) => ({ ok: false, error: String(err.message || err) })),
    standings: pick(standings),
    teams: pick(teams),
    sources: {
      news: "24h.com.vn",
      stats: "worldcup26.ir"
    }
  };
}
