import { fetchWikiTeamSquad, fetchWikiPlayerProfile, enrichWikiSquadPlayers, wikiPlayerCacheKey } from "./wc2026-wiki.js";

const NEWS_SOURCE = "https://www.24h.com.vn/aff-cup-2026-c827.html";
const STATS_SOURCE = "https://en.wikipedia.org/wiki/2026_ASEAN_Championship";
const WIKI_EVENT_PAGE = "2026_ASEAN_Championship";
const WIKI_SQUADS_SOURCE = "https://en.wikipedia.org/wiki/2026_ASEAN_Championship_squads";

const CACHE_PREFIX = "aff2026:";
const TTL = {
  news: 600,
  newsArticle: 3600,
  fixtures: 180,
  live: 60,
  standings: 180,
  teams: 3600,
  squad: 86400
};

const AFF_KEYWORDS = [
  "aff cup",
  "aff cup 2026",
  "asean cup",
  "asean cup 2026",
  "asean championship",
  "fifa asean"
];

const AFF_TEAM_META = {
  Vietnam: { id: "vietnam", name: "Việt Nam", flag: "vn", code: "VIE", group: "A" },
  Singapore: { id: "singapore", name: "Singapore", flag: "sg", code: "SGP", group: "A" },
  Indonesia: { id: "indonesia", name: "Indonesia", flag: "id", code: "IDN", group: "A" },
  Cambodia: { id: "cambodia", name: "Campuchia", flag: "kh", code: "CAM", group: "A" },
  "Timor-Leste": { id: "timor-leste", name: "Timor-Leste", flag: "tl", code: "TLS", group: "A" },
  Thailand: { id: "thailand", name: "Thái Lan", flag: "th", code: "THA", group: "B" },
  Malaysia: { id: "malaysia", name: "Malaysia", flag: "my", code: "MAS", group: "B" },
  Philippines: { id: "philippines", name: "Philippines", flag: "ph", code: "PHI", group: "B" },
  Myanmar: { id: "myanmar", name: "Myanmar", flag: "mm", code: "MYA", group: "B" },
  Laos: { id: "laos", name: "Lào", flag: "la", code: "LAO", group: "B" }
};

function extractXmlTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(re);
  if (!match) return "";
  return decodeXmlEntities(match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1").trim());
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#x0*a0;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
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

function isAffCupNews(item) {
  const hay = `${item.title} ${item.link} ${item.summary}`.toLowerCase();
  return AFF_KEYWORDS.some((kw) => hay.includes(kw));
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

const NEWS_AJAX_QS = "v_is_ajax=1&v_device_global=pc&v_max_row=6&fk_listing_template=784&pk_listing_template_box=9935&v_type_box_template=tin_bai_noi_bat_khac&v_show_date=0&v_show_event=0&v_show_icon_special_news=1&p_date=&v_view=5";
const NEWS_HUB_MAX_PAGE = 10;
const NEWS_AJAX_CATEGORY_ID = 827;

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
  // Only trust page video flags when URL/title also look like media.
  if (item.isVideo && (/video|clip|truc-tiep|trực-tiếp/i.test(link) || /trực tiếp|video|clip/i.test(title))) return true;
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

const RSS_URL = "https://www.24h.com.vn/upload/rss/bongda.rss";

async function fetchRssAffNews() {
  const res = await fetch(RSS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DUFC/1.0; +https://diamondunitedfc.com)",
      Accept: "application/rss+xml, application/xml, text/xml"
    }
  });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const items = parseRssItems(await res.text())
    .filter((item) => isAffCupNews(item) && !isVideoNewsItem(item))
    .slice(0, 30)
    .map((item) => ({
      title: item.title,
      link: item.link,
      image: item.image,
      summary: item.summary,
      pubDate: item.pubDate,
      isVideo: false
    }));
  return {
    hero: {
      left: items.slice(1, 3),
      center: items[0] || null,
      right: items.slice(3, 5)
    },
    items: items.slice(5),
    maxPage: 1
  };
}

async function fetch24hNewsHubPage(page) {
  if (page <= 1) {
    try {
      const res = await fetch(NEWS_SOURCE, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DUFC/1.0; +https://diamondunitedfc.com)",
          Accept: "text/html,application/xhtml+xml"
        }
      });
      if (!res.ok) throw new Error(`24h HTTP ${res.status}`);
      const hub = parse24hNewsHubPage(await res.text());
      const cleaned = sanitizeNewsHub(hub);
      const count = (cleaned.items?.length || 0) +
        (cleaned.hero?.center ? 1 : 0) +
        (cleaned.hero?.left?.length || 0) +
        (cleaned.hero?.right?.length || 0);
      if (count >= 3) return cleaned;
    } catch (_) {
      /* fall through to RSS */
    }
    return fetchRssAffNews();
  }

  const url = `https://24h.24hstatic.com/ajax/box_template_tin_bai_noi_bat_khac/index/${NEWS_AJAX_CATEGORY_ID}/${page}/6/0/0/0/0?${NEWS_AJAX_QS}&t=${Date.now()}`;
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

async function fetchWikiEventHtml() {
  const qs = new URLSearchParams({
    action: "parse",
    page: WIKI_EVENT_PAGE,
    prop: "text",
    format: "json",
    origin: "*"
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${qs.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DUFC-AFFCup/1.0 (diamondunitedfc.com)"
    }
  });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const data = await res.json();
  const html = data.parse?.text?.["*"];
  if (!html) throw new Error("Không đọc được trang ASEAN Championship");
  return html;
}

function cleanWikiText(value) {
  return decodeXmlEntities(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function resolveAffTeam(rawName) {
  const name = cleanWikiText(rawName)
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\bv t e\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  if (AFF_TEAM_META[name]) return AFF_TEAM_META[name];
  const found = Object.entries(AFF_TEAM_META).find(([en, meta]) =>
    en.toLowerCase() === name.toLowerCase() ||
    meta.name.toLowerCase() === name.toLowerCase() ||
    meta.code.toLowerCase() === name.toLowerCase() ||
    name.toLowerCase().includes(en.toLowerCase()) ||
    en.toLowerCase().includes(name.toLowerCase())
  );
  return found ? found[1] : null;
}

function teamLogo(meta) {
  return meta?.flag ? `https://flagcdn.com/w80/${meta.flag}.png` : "";
}

function formatVnDateTime(ms) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

function parseAffKickoff(dateLabel, timeLabel) {
  const dateText = cleanWikiText(dateLabel);
  const timeText = cleanWikiText(timeLabel);
  const fallbackLabel = [dateText, timeText].filter(Boolean).join(" ");
  const dm = dateText.match(/(\d{4})-(\d{2})-(\d{2})/);
  const tm = timeText.match(/(\d{1,2}):(\d{2})\s*UTC\s*([+-]\d+)(?::(\d{2}))?/i);
  if (!dm) {
    return { date: "", timestamp: null, localLabel: fallbackLabel };
  }
  const [, y, mo, d] = dm;
  const hour = tm ? Number(tm[1]) : 0;
  const minute = tm ? Number(tm[2]) : 0;
  const offH = tm ? Number(tm[3]) : 7;
  const offM = tm && tm[4] ? Number(tm[4]) : 0;
  const offsetMin = offH * 60 + Math.sign(offH || 1) * offM;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, minute) - offsetMin * 60 * 1000;
  return {
    date: new Date(utcMs).toISOString(),
    timestamp: Math.floor(utcMs / 1000),
    localLabel: formatVnDateTime(utcMs)
  };
}

function parseAffScore(raw) {
  const s = cleanWikiText(raw).replace(/\s+/g, "");
  if (!s || /^v$/i.test(s) || s === "–" || s === "-") {
    return { home: null, away: null, finished: false };
  }
  const m = s.match(/^(\d+)[–\-:](\d+)$/);
  if (!m) return { home: null, away: null, finished: false };
  return { home: Number(m[1]), away: Number(m[2]), finished: true };
}

function mapAffMatchStatus(score, timestamp) {
  if (score.finished) {
    return { status: "FT", statusLong: "Kết thúc", elapsed: null };
  }
  if (!timestamp) {
    return { status: "NS", statusLong: "Chưa đá", elapsed: null };
  }
  const now = Date.now();
  const kick = timestamp * 1000;
  if (now >= kick && now <= kick + 2.5 * 60 * 60 * 1000) {
    const elapsed = Math.max(1, Math.floor((now - kick) / 60000));
    return { status: "LIVE", statusLong: "Đang đá", elapsed: Math.min(elapsed, 120) };
  }
  return { status: "NS", statusLong: "Chưa đá", elapsed: null };
}

function parseAffFixtures(html) {
  const parts = String(html || "").split(/class="footballbox"/i).slice(1);
  const fixtures = [];
  for (const part of parts) {
    const block = part.slice(0, 4000);
    const homeRaw = block.match(/class="fhome"[^>]*>([\s\S]*?)<\/th>/i)?.[1];
    const awayRaw = block.match(/class="faway"[^>]*>([\s\S]*?)<\/th>/i)?.[1];
    const scoreRaw = block.match(/class="fscore"[^>]*>([\s\S]*?)<\/th>/i)?.[1] || "";
    const dateRaw = block.match(/class="fdate"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    const timeRaw = block.match(/class="ftime"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    const venueRaw = block.match(/class="fline"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    const home = resolveAffTeam(homeRaw);
    const away = resolveAffTeam(awayRaw);
    if (!home || !away) continue;
    const score = parseAffScore(scoreRaw);
    const kick = parseAffKickoff(dateRaw, timeRaw);
    const st = mapAffMatchStatus(score, kick.timestamp);
    const group = home.group || away.group || "";
    fixtures.push({
      id: `aff-${kick.date?.slice(0, 10) || "x"}-${home.id}-${away.id}`,
      date: kick.date,
      timestamp: kick.timestamp,
      localLabel: kick.localLabel,
      status: st.status,
      statusLong: st.statusLong,
      elapsed: st.elapsed,
      matchday: "",
      type: "group",
      round: group ? `Vòng bảng · Bảng ${group}` : "Vòng bảng",
      group,
      venue: cleanWikiText(venueRaw),
      city: "",
      stadium: {
        id: "",
        name: cleanWikiText(venueRaw),
        fifaName: "",
        city: "",
        country: "",
        capacity: null,
        region: ""
      },
      home: {
        id: home.id,
        name: home.name,
        logo: teamLogo(home),
        score: score.home,
        scorers: []
      },
      away: {
        id: away.id,
        name: away.name,
        logo: teamLogo(away),
        score: score.away,
        scorers: []
      }
    });
  }
  return fixtures;
}

function parseAffStandings(html) {
  const groups = [];
  const tables = [...String(html || "").matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];
  let groupIdx = 0;
  for (const tableMatch of tables) {
    const table = tableMatch[1];
    if (!/\bPld\b/i.test(table) || !/\bPts\b/i.test(table) || !/\bPos\b/i.test(table)) continue;
    const before = String(html || "").slice(Math.max(0, tableMatch.index - 900), tableMatch.index);
    let letter = "";
    const head = before.match(/id="Group_([AB])"/i) || before.match(/Group\s+([AB])\s*<\/h[23]>/i);
    if (head) letter = String(head[1] || "").toUpperCase();
    if (!letter) letter = groupIdx === 0 ? "A" : "B";
    groupIdx += 1;

    const rows = [];
    for (const tr of table.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells = [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => cleanWikiText(c[1]));
      if (cells.length < 9) continue;
      if (/^pos$/i.test(cells[0])) continue;
      const teamName = String(cells[1] || "").replace(/\bv t e\b/gi, "").trim();
      const team = resolveAffTeam(teamName);
      if (!team?.id || !Number.isFinite(Number(cells[2]))) continue;
      if (!Object.values(AFF_TEAM_META).some((m) => m.id === team.id)) continue;
      rows.push({
        team: {
          id: team.id,
          name: team.name,
          logo: teamLogo(team)
        },
        played: Number(cells[2]) || 0,
        win: Number(cells[3]) || 0,
        draw: Number(cells[4]) || 0,
        lose: Number(cells[5]) || 0,
        goalsFor: Number(cells[6]) || 0,
        goalsAgainst: Number(cells[7]) || 0,
        goalsDiff: Number(String(cells[8] || "0").replace("+", "").replace(/[−–]/g, "-")) ||
          ((Number(cells[6]) || 0) - (Number(cells[7]) || 0)),
        points: Number(cells[9]) || 0,
        group: `Bảng ${letter}`,
        rank: Number(cells[0]) || rows.length + 1
      });
    }
    if (!rows.length) continue;
    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalsDiff !== a.goalsDiff) return b.goalsDiff - a.goalsDiff;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.name.localeCompare(b.team.name, "vi");
    });
    groups.push(rows.map((row, idx) => ({ ...row, rank: idx + 1 })));
  }
  return groups.sort((a, b) => String(a[0]?.group || "").localeCompare(String(b[0]?.group || ""), "vi"));
}

function buildAffTeamItems(groups, fixtures) {
  const byId = new Map();
  Object.values(AFF_TEAM_META).forEach((meta) => {
    byId.set(meta.id, {
      id: meta.id,
      name: meta.name,
      logo: teamLogo(meta),
      country: meta.flag.toUpperCase(),
      group: meta.group,
      fifaCode: meta.code
    });
  });
  for (const group of groups) {
    for (const row of group) {
      const existing = byId.get(row.team.id) || {
        id: row.team.id,
        name: row.team.name,
        logo: row.team.logo,
        country: "",
        group: String(row.group || "").replace(/^Bảng\s+/i, ""),
        fifaCode: ""
      };
      existing.group = String(row.group || "").replace(/^Bảng\s+/i, "") || existing.group;
      byId.set(existing.id, existing);
    }
  }
  for (const fx of fixtures) {
    for (const side of [fx.home, fx.away]) {
      if (!byId.has(side.id)) {
        byId.set(side.id, {
          id: side.id,
          name: side.name,
          logo: side.logo,
          country: "",
          group: fx.group || "",
          fifaCode: ""
        });
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

function emptyStandingRow(team, letter) {
  return {
    team: {
      id: team.id,
      name: team.name,
      logo: teamLogo(team)
    },
    played: 0,
    win: 0,
    draw: 0,
    lose: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalsDiff: 0,
    points: 0,
    group: `Bảng ${letter}`,
    rank: 0
  };
}

function computeStandingsFromFixtures(fixtures) {
  const byGroup = { A: new Map(), B: new Map() };
  Object.values(AFF_TEAM_META).forEach((meta) => {
    if (!byGroup[meta.group]) return;
    byGroup[meta.group].set(meta.id, emptyStandingRow(meta, meta.group));
  });

  for (const fx of fixtures || []) {
    if (fx.status !== "FT") continue;
    const letter = fx.group === "A" || fx.group === "B" ? fx.group : (AFF_TEAM_META[Object.keys(AFF_TEAM_META).find((k) => AFF_TEAM_META[k].id === fx.home.id)]?.group);
    const groupLetter = letter || fx.home?.id && Object.values(AFF_TEAM_META).find((m) => m.id === fx.home.id)?.group;
    if (!groupLetter || !byGroup[groupLetter]) continue;
    const home = byGroup[groupLetter].get(fx.home.id) || emptyStandingRow(resolveAffTeam(fx.home.name) || { id: fx.home.id, name: fx.home.name, flag: "" }, groupLetter);
    const away = byGroup[groupLetter].get(fx.away.id) || emptyStandingRow(resolveAffTeam(fx.away.name) || { id: fx.away.id, name: fx.away.name, flag: "" }, groupLetter);
    const hs = Number(fx.home.score);
    const as = Number(fx.away.score);
    if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
    home.played += 1;
    away.played += 1;
    home.goalsFor += hs;
    home.goalsAgainst += as;
    away.goalsFor += as;
    away.goalsAgainst += hs;
    if (hs > as) {
      home.win += 1;
      home.points += 3;
      away.lose += 1;
    } else if (hs < as) {
      away.win += 1;
      away.points += 3;
      home.lose += 1;
    } else {
      home.draw += 1;
      away.draw += 1;
      home.points += 1;
      away.points += 1;
    }
    home.goalsDiff = home.goalsFor - home.goalsAgainst;
    away.goalsDiff = away.goalsFor - away.goalsAgainst;
    byGroup[groupLetter].set(home.team.id, home);
    byGroup[groupLetter].set(away.team.id, away);
  }

  return ["A", "B"].map((letter) => {
    const rows = [...byGroup[letter].values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalsDiff !== a.goalsDiff) return b.goalsDiff - a.goalsDiff;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.name.localeCompare(b.team.name, "vi");
    });
    return rows.map((row, idx) => ({ ...row, rank: idx + 1, group: `Bảng ${letter}` }));
  }).filter((g) => g.length);
}

async function loadAffDataset(env) {
  return getCached(env.AVATARS, "aff26:dataset:v5", TTL.fixtures, async () => {
    const html = await fetchWikiEventHtml();
    const fixtures = parseAffFixtures(html);
    let groups = parseAffStandings(html);
    if (!groups.length) groups = computeStandingsFromFixtures(fixtures);
    const teamItems = buildAffTeamItems(groups, fixtures);
    return { fixtures, groups, teamItems };
  });
}

async function loadWc26Dataset(env) {
  return loadAffDataset(env);
}

function fixtureScopeFilter(scope) {
  const now = Date.now();
  const weekMs = 21 * 24 * 60 * 60 * 1000;
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
    const raw = await getCached(env.AVATARS, "aff_news_hub:v4", TTL.news, () => fetch24hNewsHubPage(1));
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

  const ajax = await getCached(env.AVATARS, `aff_news_hub:v1:page:${page}`, TTL.news, () => fetch24hNewsHubPage(page));
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
  const dataset = await loadAffDataset(env);

  const filtered = dataset.fixtures.filter(fixtureScopeFilter(scope));
  filtered.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  return {
    ok: true,
    source: "wikipedia.org",
    source_url: STATS_SOURCE,
    scope,
    updated_at: new Date().toISOString(),
    items: filtered
  };
}

export async function wc2026Standings(env) {
  const dataset = await loadAffDataset(env);

  return {
    ok: true,
    source: "wikipedia.org",
    source_url: STATS_SOURCE,
    updated_at: new Date().toISOString(),
    groups: dataset.groups
  };
}

export async function wc2026Teams(env) {
  const dataset = await loadAffDataset(env);

  return {
    ok: true,
    source: "wikipedia.org",
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
    source: "wikipedia.org",
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

  const englishName = Object.entries(AFF_TEAM_META).find(([, meta]) => meta.id === id)?.[0] || team.name;
  const squad = await getCached(env.AVATARS, `wiki:squad:aff:v3:${id}`, TTL.squad, async () => {
    try {
      const squadRaw = await fetchWikiTeamSquad(englishName);
      const players = (Array.isArray(squadRaw.players) ? squadRaw.players : []).map((p) => ({
        ...p,
        image: p.image || "",
        height: p.height || "",
        weight: p.weight || "",
        foot: p.foot || ""
      }));
      return {
        coach: squadRaw.coach || "",
        players,
        source: squadRaw.source || "wikipedia.org",
        source_url: squadRaw.source_url || WIKI_SQUADS_SOURCE
      };
    } catch (_) {
      return { players: [], source_url: WIKI_SQUADS_SOURCE, coach: "", source: "wikipedia.org" };
    }
  });

  return {
    ok: true,
    source: "wikipedia.org",
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
      stats: "wikipedia.org"
    }
  };
}
