const WIKI_SQUADS_PAGE = "2026_FIFA_World_Cup_squads";
const WIKI_TEAM_ALIASES = {
  "Democratic Republic of the Congo": "DR Congo",
  "Cote d'Ivoire": "Ivory Coast"
};

function stripHtmlTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWikiLookupName(name) {
  const raw = String(name || "").trim();
  return WIKI_TEAM_ALIASES[raw] || raw;
}

function splitWikiPlayerName(raw) {
  let text = stripHtmlTags(raw);
  let captain = false;
  let viceCaptain = false;

  if (/\(\s*vice[- ]?captain\s*\)/i.test(text)) {
    viceCaptain = true;
    text = text.replace(/\(\s*vice[- ]?captain\s*\)/gi, " ");
  }
  if (/\(\s*(captain|c)\s*\)/i.test(text)) {
    captain = true;
    text = text.replace(/\(\s*(captain|c)\s*\)/gi, " ");
  }

  text = text.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return { name: text, captain, viceCaptain };
}

async function fetchWikiJson(params, attempt = 0) {
  const qs = new URLSearchParams({ format: "json", origin: "*", ...params });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${qs.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": "DUFC-WorldCup/1.0 (diamondunitedfc.com)" }
  });
  if (res.status === 429 && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    return fetchWikiJson(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info || "Wikipedia error");
  return data;
}

async function getWikiSquadSectionIndex(teamName) {
  const lookup = normalizeWikiLookupName(teamName).toLowerCase();
  const data = await fetchWikiJson({
    action: "parse",
    page: WIKI_SQUADS_PAGE,
    prop: "sections"
  });
  const sections = data.parse?.sections || [];
  const match = sections.find((section) => {
    const line = String(section.line || "").trim();
    if (!line || line.startsWith("Group")) return false;
    if (["Notes", "References", "External links", "Statistics"].includes(line)) return false;
    if (["Age", "Players", "Outfield players", "Goalkeepers", "Captains", "Coaches"].includes(line)) return false;
    if (line.includes("representation") || line.includes("Average age")) return false;
    return line.toLowerCase() === lookup;
  });
  return match?.index || null;
}

function parseWikiCoach(html) {
  const match = html.match(/Coach:\s*([\s\S]*?)<\/p>/i);
  if (!match) return "";
  return stripHtmlTags(match[1]);
}

function parseWikiSquadRows(html) {
  const players = [];
  const rowRegex = /<tr class="nat-fs-player">([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html))) {
    const row = rowMatch[1];
    const nameMatch = row.match(/<th[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>/i);
    const parsed = splitWikiPlayerName(nameMatch?.[1] || "");
    if (!parsed.name) continue;

    const tdMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripHtmlTags(m[1]));
    players.push({
      number: tdMatches[0] || "",
      position: (tdMatches[1] || "").replace(/^\d+\s*/, "").trim(),
      name: parsed.name,
      captain: parsed.captain,
      vice_captain: parsed.viceCaptain,
      dob: tdMatches[2] || "",
      caps: tdMatches[3] || "",
      goals: tdMatches[4] || "",
      club: tdMatches[5] || ""
    });
  }
  return players;
}

export async function fetchWikiTeamSquad(teamName) {
  const section = await getWikiSquadSectionIndex(teamName);
  if (!section) {
    return { coach: "", players: [], source: "wikipedia.org", source_url: `https://en.wikipedia.org/wiki/${WIKI_SQUADS_PAGE}` };
  }

  const data = await fetchWikiJson({
    action: "parse",
    page: WIKI_SQUADS_PAGE,
    section: String(section),
    prop: "text"
  });
  const html = data.parse?.text?.["*"] || "";
  return {
    coach: parseWikiCoach(html),
    players: parseWikiSquadRows(html),
    source: "wikipedia.org",
    source_url: `https://en.wikipedia.org/wiki/${WIKI_SQUADS_PAGE}#${encodeURIComponent(normalizeWikiLookupName(teamName))}`
  };
}

async function resolveWikiPlayerTitle(playerName, teamName) {
  const name = splitWikiPlayerName(playerName).name;
  if (!name) return "";

  const direct = await fetchWikiJson({
    action: "query",
    titles: name,
    redirects: 1
  });
  const directPage = Object.values(direct.query?.pages || {})[0];
  if (directPage && !directPage.missing) return directPage.title;

  const team = normalizeWikiLookupName(teamName);
  const searches = [
    `"${name}" football ${team}`,
    `"${name}" ${team} footballer`,
    `${name} footballer`
  ];

  for (const srsearch of searches) {
    const search = await fetchWikiJson({
      action: "query",
      list: "search",
      srsearch,
      srlimit: 6
    });
    const hit = (search.query?.search || []).find((row) => {
      const title = String(row.title || "").toLowerCase();
      const needle = name.toLowerCase();
      return title.includes(needle) || needle.split(" ").every((part) => title.includes(part));
    }) || search.query?.search?.[0];
    if (hit?.title) return hit.title;
  }

  return name;
}

function cleanWikiInfoboxValue(raw) {
  return String(raw || "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/\{\{convert\|([^|}]+)\|[^}]+\}\}/gi, "$1")
    .replace(/\{\{height\|([^}]+)\}\}/gi, (_, inner) => {
      const m = String(inner).match(/m=([\d.]+)/i);
      return m ? `${m[1]} m` : inner.replace(/[^0-9.,|]/g, " ").trim();
    })
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/''+/g, "")
    .trim();
}

function parseInfoboxField(wikitext, field) {
  const re = new RegExp(`\\|\\s*${field}\\s*=\\s*([^\\n|]+)`, "i");
  const match = String(wikitext || "").match(re);
  return match ? cleanWikiInfoboxValue(match[1]) : "";
}

function formatWikidataQuantity(claim, kind) {
  const amount = parseFloat(String(claim?.mainsnak?.datavalue?.value?.amount || "").replace("+", ""));
  const unit = String(claim?.mainsnak?.datavalue?.value?.unit || "");
  if (!Number.isFinite(amount)) return "";

  if (kind === "height") {
    if (unit.includes("Q174728") || amount > 10) {
      const meters = amount / 100;
      return `${meters.toFixed(2).replace(/\.?0+$/, "")} m`;
    }
    return `${amount.toFixed(2).replace(/\.?0+$/, "")} m`;
  }

  if (kind === "weight") {
    return `${Math.round(amount)} kg`;
  }

  return "";
}

function normalizeFootLabel(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (v.includes("left") || v.includes("trái")) return "Trái";
  if (v.includes("right") || v.includes("phải")) return "Phải";
  if (v.includes("both") || v.includes("two")) return "Hai chân";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

async function fetchWikidataEntity(wikibaseId) {
  if (!wikibaseId) return null;
  const data = await fetch(`https://www.wikidata.org/w/api.php?${new URLSearchParams({
    action: "wbgetentities",
    ids: wikibaseId,
    props: "claims",
    format: "json",
    origin: "*"
  })}`, {
    headers: { Accept: "application/json", "User-Agent": "DUFC-WorldCup/1.0 (diamondunitedfc.com)" }
  }).then((res) => res.json());
  return data.entities?.[wikibaseId] || null;
}

async function fetchWikiPlayerPageBundle(title) {
  const data = await fetchWikiJson({
    action: "query",
    titles: title,
    redirects: 1,
    prop: "pageimages|pageprops|revisions",
    rvprop: "content",
    rvslots: "main",
    piprop: "thumbnail",
    pithumbsize: 320,
    inprop: "url"
  });
  const page = Object.values(data.query?.pages || {})[0];
  if (!page || page.missing) return null;

  const wikitext = page.revisions?.[0]?.slots?.main?.["*"] || "";
  const wikibaseId = page.pageprops?.wikibase_item || "";
  const entity = await fetchWikidataEntity(wikibaseId);

  const height = formatWikidataQuantity(entity?.claims?.P2048?.[0], "height")
    || parseInfoboxField(wikitext, "height");
  const weight = formatWikidataQuantity(entity?.claims?.P2067?.[0], "weight")
    || parseInfoboxField(wikitext, "weight");
  const foot = normalizeFootLabel(
    parseInfoboxField(wikitext, "foot")
    || parseInfoboxField(wikitext, "Feet")
    || (() => {
      const m = String(wikitext || "").match(/\b(right|left)[- ]footed\b/i);
      return m ? m[1] : "";
    })()
  );

  return {
    wiki_title: page.title,
    wiki_url: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, "_"))}`,
    image: page.thumbnail?.source || "",
    height,
    weight,
    foot
  };
}

export function wikiPlayerCacheKey(playerName) {
  const clean = splitWikiPlayerName(playerName).name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return `wiki:player:v3:${clean}`;
}

export async function fetchWikiPlayerProfile(playerName, teamName) {
  const cleanName = splitWikiPlayerName(playerName).name;
  const title = await resolveWikiPlayerTitle(cleanName, teamName);
  const bundle = await fetchWikiPlayerPageBundle(title);
  if (!bundle) {
    return {
      wiki_title: cleanName,
      wiki_url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(cleanName)}`,
      image: "",
      height: "",
      weight: "",
      foot: ""
    };
  }
  return bundle;
}

export async function enrichWikiSquadPlayers(players, teamName, fetchProfile) {
  const list = Array.isArray(players) ? players : [];
  if (!list.length) return [];

  const batchSize = 2;
  const enriched = [];

  async function loadProfile(player) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const profile = await fetchProfile(player.name, teamName);
        if (profile.image || profile.height || profile.weight || attempt === 2) {
          return profile;
        }
      } catch (_) {
        /* retry */
      }
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
    return { image: "", height: "", weight: "", foot: "", wiki_url: "", wiki_title: player.name };
  }

  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    const rows = await Promise.all(batch.map(async (player) => {
      const profile = await loadProfile(player);
      return {
        ...player,
        image: profile.image || "",
        height: profile.height || "",
        weight: profile.weight || "",
        foot: profile.foot || "",
        wiki_url: profile.wiki_url || "",
        wiki_title: profile.wiki_title || player.name
      };
    }));
    enriched.push(...rows);
    if (i + batchSize < list.length) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  const missing = enriched.filter((p) => !p.image);
  for (const player of missing) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const profile = await loadProfile(player);
    if (profile.image) {
      Object.assign(player, {
        image: profile.image,
        height: profile.height || player.height,
        weight: profile.weight || player.weight,
        foot: profile.foot || player.foot,
        wiki_url: profile.wiki_url || player.wiki_url,
        wiki_title: profile.wiki_title || player.wiki_title
      });
    }
  }

  return enriched;
}
