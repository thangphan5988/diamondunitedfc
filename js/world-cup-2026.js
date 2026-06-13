/* World Cup 2026 hub — tin 24h + số liệu API-Football qua DUFC Worker */

let wcActiveTab = "news";
let wcNewsListCache = null;
let wcNewsLoadingMore = false;

function wcNewsCardAttrs(url) {
  return `data-news-url="${wcEscapeHtml(url)}" onclick="wcOpenNewsArticle(this.dataset.newsUrl)" onkeydown="wcCardKey(event,'news',this.dataset.newsUrl)" role="button" tabindex="0"`;
}

function wcIsVideoNews(item) {
  if (!item?.link) return true;
  const title = String(item.title || "").toLowerCase();
  const link = String(item.link || "").toLowerCase();
  return /\bvideo\b/.test(title) || /\/video-/.test(link) || /\bclip\b/.test(title) || /trực tiếp/.test(title);
}

function wcFilterVideoNews(items) {
  return (items || []).filter((item) => !wcIsVideoNews(item));
}

function wcNewsHeroItemHtml(item, featured) {
  if (!item?.link) return "";
  const cls = featured ? "wcNewsHeroItem wcNewsHeroItem--featured" : "wcNewsHeroItem";
  const img = item.image
    ? `<img src="${wcEscapeHtml(item.image)}" alt="" loading="lazy">`
    : `<div class="wcNewsHeroPlaceholder">⚽</div>`;
  return `<article class="${cls}" ${wcNewsCardAttrs(item.link)}>
    <figure class="wcNewsHeroThumb">${img}</figure>
    <h3>${wcEscapeHtml(item.title)}</h3>
  </article>`;
}

function wcNewsListItemHtml(item) {
  if (!item?.link) return "";
  const img = item.image
    ? `<img src="${wcEscapeHtml(item.image)}" alt="" loading="lazy">`
    : `<div class="wcNewsListPlaceholder">⚽</div>`;
  const summary = item.summary ? `<p>${wcEscapeHtml(item.summary)}</p>` : "";
  return `<article class="wcNewsListItem" ${wcNewsCardAttrs(item.link)}>
    <figure class="wcNewsListThumb">${img}</figure>
    <div class="wcNewsListBody">
      <h3>${wcEscapeHtml(item.title)}</h3>
      ${summary}
    </div>
  </article>`;
}

function wcSanitizeNewsData(data) {
  const hero = data.hero || { left: [], center: null, right: [] };
  let left = wcFilterVideoNews(hero.left);
  let center = hero.center && !wcIsVideoNews(hero.center) ? hero.center : null;
  let right = wcFilterVideoNews(hero.right);
  const items = wcFilterVideoNews(data.items);
  const used = new Set([center?.link, ...left.map((i) => i.link), ...right.map((i) => i.link)].filter(Boolean));
  const pool = items.filter((i) => !used.has(i.link));
  if (!center && pool.length) {
    center = pool.shift();
    used.add(center.link);
  }
  while (left.length < 2 && pool.length) left.push(pool.shift());
  while (right.length < 2 && pool.length) right.push(pool.shift());
  return {
    ...data,
    hero: { left, center, right },
    items: items.filter((i) => !used.has(i.link))
  };
}

function wcRenderNewsHub(data, append) {
  const el = wcEl("wcPanelNews");
  if (!el) return;
  const clean = append ? data : wcSanitizeNewsData(data);
  if (!append) {
    wcNewsListCache = {
      hero: clean.hero || { left: [], center: null, right: [] },
      items: clean.items || [],
      page: clean.page || 1,
      hasMore: !!clean.hasMore,
      maxPage: clean.maxPage || 10
    };
  } else if (wcNewsListCache) {
    const seen = new Set((wcNewsListCache.items || []).map((item) => item.link));
    const extra = wcFilterVideoNews(clean.items || []).filter((item) => item.link && !seen.has(item.link));
    wcNewsListCache.items = [...(wcNewsListCache.items || []), ...extra];
    wcNewsListCache.page = clean.page || wcNewsListCache.page;
    wcNewsListCache.hasMore = !!clean.hasMore;
  }

  const hub = wcNewsListCache;
  const hero = hub?.hero || { left: [], center: null, right: [] };
  const items = hub?.items || [];
  const hasHero = hero.center || hero.left?.length || hero.right?.length;

  if (!hasHero && !items.length) {
    el.innerHTML = `<div class="wcEmpty">Chưa có tin World Cup 2026.</div>`;
    return;
  }

  const heroHtml = hasHero
    ? `<section class="wcNewsHero" aria-label="Tin nổi bật">
        <div class="wcNewsHeroCol wcNewsHeroCol--left">${(hero.left || []).map((item) => wcNewsHeroItemHtml(item, false)).join("")}</div>
        <div class="wcNewsHeroCol wcNewsHeroCol--center">${wcNewsHeroItemHtml(hero.center, true)}</div>
        <div class="wcNewsHeroCol wcNewsHeroCol--right">${(hero.right || []).map((item) => wcNewsHeroItemHtml(item, false)).join("")}</div>
      </section>`
    : "";

  const listHtml = items.length
    ? `<section class="wcNewsLatest">
        <h2 class="wcNewsSectionTitle">Tin mới World Cup 2026</h2>
        <div class="wcNewsList" id="wcNewsList">${items.map(wcNewsListItemHtml).join("")}</div>
      </section>`
    : "";

  const moreBtn = hub?.hasMore
    ? `<div class="wcNewsMoreWrap"><button type="button" class="wcNewsMoreBtn" id="wcNewsMoreBtn" onclick="wcLoadMoreNews()">Xem thêm tin mới ↓</button></div>`
    : "";

  el.innerHTML = `<div class="wcNewsHub">${heroHtml}${listHtml}${moreBtn}</div>`;
}

async function wcLoadMoreNews() {
  if (wcNewsLoadingMore || !wcNewsListCache?.hasMore) return;
  const nextPage = (wcNewsListCache.page || 1) + 1;
  const btn = wcEl("wcNewsMoreBtn");
  wcNewsLoadingMore = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang tải…";
  }
  try {
    const data = await wcApiGet("wc2026_news", { page: nextPage });
    wcRenderNewsHub(data, true);
  } catch (err) {
    if (btn) btn.textContent = "Không tải được — thử lại";
  } finally {
    wcNewsLoadingMore = false;
    const freshBtn = wcEl("wcNewsMoreBtn");
    if (freshBtn && !freshBtn.disabled) freshBtn.textContent = "Xem thêm tin mới ↓";
  }
}

function wcRenderNews(data) {
  wcRenderNewsHub(data, false);
}

function wcEl(id) {
  return document.getElementById(id);
}

function wcEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wcFormatDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function wcFormatMatchTime(fx) {
  if (!fx) return "";
  if (fx.timestamp) {
    const d = new Date(fx.timestamp * 1000);
    if (!Number.isNaN(d.getTime())) return wcFormatDate(d);
  }
  if (fx.date) {
    const d = new Date(fx.date);
    if (!Number.isNaN(d.getTime())) return wcFormatDate(d);
  }
  return String(fx.localLabel || "").trim();
}

function wcStatusLabel(status, elapsed) {
  const map = {
    NS: "Chưa đá",
    LIVE: "Đang đá",
    "1H": "Hiệp 1",
    HT: "Giữa hiệp",
    "2H": "Hiệp 2",
    ET: "Hiệp phụ",
    BT: "Nghỉ HP",
    P: "Penalty",
    FT: "Kết thúc",
    AET: "Hết HP",
    PEN: "Hết pen",
    LIVE: "Đang đá"
  };
  const base = map[status] || status || "";
  if (elapsed != null && ["1H", "2H", "ET", "P", "LIVE"].includes(status)) {
    return `${base} · ${elapsed}'`;
  }
  return base;
}

function wcScoreLine(fx) {
  const hasScore = fx.home?.score != null && fx.away?.score != null;
  if (hasScore) return `${fx.home.score} - ${fx.away.score}`;
  return "vs";
}

async function wcApiGet(action, params) {
  const query = Object.assign({ action }, params || {}, { ts: Date.now() });
  const qs = new URLSearchParams(query);
  const res = await fetch(`${API_BASE_URL}?${qs.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API HTTP ${res.status}`);
  if (!data.ok) throw new Error(data.error || "API error");
  return data;
}

function wcSetLoading(panelId, message) {
  const el = wcEl(panelId);
  if (el) {
    el.innerHTML = `<div class="wcLoading">${wcEscapeHtml(message || "Đang tải…")}</div>`;
  }
}

function wcSetError(panelId, err) {
  const el = wcEl(panelId);
  if (el) {
    el.innerHTML = `<div class="wcError">${wcEscapeHtml(String(err?.message || err || "Không tải được dữ liệu."))}</div>`;
  }
}

function wcNewsArticleHtml(article) {
  const hero = article.image
    ? `<img class="wcNewsArticleHero" src="${wcEscapeHtml(article.image)}" alt="" loading="lazy">`
    : "";
  const sapo = article.sapo
    ? `<div class="wcNewsArticleSapo">${article.sapo}</div>`
    : "";
  const content = article.content
    ? `<div class="wcNewsArticleBody">${article.content}</div>`
    : `<div class="wcEmpty">Không tải được nội dung chi tiết.</div>`;
  return `<article class="wcNewsArticlePage">
    <button type="button" class="wcNewsBackBtn" onclick="wcBackToNewsList()">← Danh sách tin</button>
    <header class="wcNewsArticleHead">
      <h2 class="wcNewsArticleTitle">${wcEscapeHtml(article.title || "Tin tức")}</h2>
      ${article.pubDate ? `<p class="wcNewsArticleDate">${wcEscapeHtml(article.pubDate)}</p>` : ""}
    </header>
    ${hero}${sapo}${content}
  </article>`;
}

function wcRenderNewsDetail(article) {
  const el = wcEl("wcPanelNews");
  if (!el) return;
  el.innerHTML = wcNewsArticleHtml(article);
}

function wcScrollToNewsPanel() {
  wcEl("wcPanelWrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function wcSetNewsUrl(url) {
  const next = url
    ? `${location.pathname}?news=${encodeURIComponent(url)}`
    : location.pathname;
  history.replaceState(null, "", next);
}

async function wcOpenNewsArticle(url) {
  if (!url) return;
  wcSetLoading("wcPanelNews", "Đang tải bài…");
  wcScrollToNewsPanel();
  try {
    wcRenderNewsDetail(await wcApiGet("wc2026_news_article", { url }));
    wcSetNewsUrl(url);
  } catch (err) {
    const el = wcEl("wcPanelNews");
    if (el) {
      el.innerHTML = `<div class="wcNewsArticlePage">
        <button type="button" class="wcNewsBackBtn" onclick="wcBackToNewsList()">← Danh sách tin</button>
        <div class="wcError">${wcEscapeHtml(String(err.message || err))}</div>
      </div>`;
    }
  }
}

function wcBackToNewsList() {
  if (wcNewsListCache) wcRenderNewsHub(wcNewsListCache, false);
  else wcLoadTab("news");
  wcSetNewsUrl("");
  wcScrollToNewsPanel();
}

function wcRenderFixtures(items, panelId, emptyText) {
  const el = wcEl(panelId);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="wcEmpty">${wcEscapeHtml(emptyText)}</div>`;
    return;
  }
  el.innerHTML = items.map((fx) => wcMatchCardHtml(fx)).join("");
}

function wcMatchCardHtml(fx, compact) {
  const homeLogo = fx.home?.logo ? `<img src="${wcEscapeHtml(fx.home.logo)}" alt="">` : "";
  const awayLogo = fx.away?.logo ? `<img src="${wcEscapeHtml(fx.away.logo)}" alt="">` : "";
  const round = [fx.round, fx.group ? `Bảng ${fx.group}` : ""].filter(Boolean).join(" · ");
  const hint = compact ? "" : `<div class="wcMatchCardHint">Xem chi tiết →</div>`;
  return `<article class="wcMatchCard" role="button" tabindex="0" onclick="wcOpenMatchDetail('${wcEscapeHtml(String(fx.id))}')" onkeydown="wcCardKey(event,'match','${wcEscapeHtml(String(fx.id))}')">
    <div class="wcMatchMeta">
      <span>${wcEscapeHtml(wcFormatMatchTime(fx))}</span>
      <span class="wcMatchStatus">${wcEscapeHtml(wcStatusLabel(fx.status, fx.elapsed))}</span>
    </div>
    <div class="wcMatchTeams">
      <div class="wcMatchTeam">${homeLogo}<span>${wcEscapeHtml(fx.home?.name || "")}</span></div>
      <div class="wcMatchScore">${wcEscapeHtml(wcScoreLine(fx))}</div>
      <div class="wcMatchTeam wcMatchTeam--away">${awayLogo}<span>${wcEscapeHtml(fx.away?.name || "")}</span></div>
    </div>
    <div class="wcMatchFoot">${wcEscapeHtml([round, fx.venue, fx.city].filter(Boolean).join(" · "))}</div>
    ${hint}
  </article>`;
}

function wcRenderStandings(data) {
  const el = wcEl("wcPanelStandings");
  if (!el) return;
  const groups = data.groups || [];
  if (!groups.length) {
    el.innerHTML = `<div class="wcEmpty">Chưa có bảng xếp hạng.</div>`;
    return;
  }
  el.innerHTML = groups.map((rows, idx) => {
    const groupName = rows[0]?.group || `Bảng ${String.fromCharCode(65 + idx)}`;
    const body = rows.map((row) => `<tr>
      <td>${row.rank}</td>
      <td class="wcStandTeam"><button type="button" class="wcStandTeamBtn" onclick="wcOpenTeamDetail('${wcEscapeHtml(String(row.team.id))}')"><img src="${wcEscapeHtml(row.team.logo)}" alt="">${wcEscapeHtml(row.team.name)}</button></td>
      <td>${row.played}</td>
      <td>${row.win}</td>
      <td>${row.draw}</td>
      <td>${row.lose}</td>
      <td>${row.goalsDiff}</td>
      <td><strong>${row.points}</strong></td>
    </tr>`).join("");
    return `<section class="wcStandGroup">
      <h3>${wcEscapeHtml(groupName)}</h3>
      <div class="wcTableWrap">
        <table class="wcTable">
          <thead><tr><th>#</th><th>Đội</th><th>Tr</th><th>T</th><th>H</th><th>B</th><th>HS</th><th>Đ</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
  }).join("");
}

function wcRenderTeams(data) {
  const el = wcEl("wcPanelTeams");
  if (!el) return;
  const items = data.items || [];
  if (!items.length) {
    el.innerHTML = `<div class="wcEmpty">Chưa có danh sách đội.</div>`;
    return;
  }
  el.innerHTML = `<div class="wcTeamGrid">${items.map((team) => `
    <article class="wcTeamCard" role="button" tabindex="0" onclick="wcOpenTeamDetail('${wcEscapeHtml(String(team.id))}')" onkeydown="wcCardKey(event,'team','${wcEscapeHtml(String(team.id))}')">
      <img src="${wcEscapeHtml(team.logo)}" alt="${wcEscapeHtml(team.name)}">
      <div>
        <strong>${wcEscapeHtml(team.name)}</strong>
        <span>${wcEscapeHtml([team.group ? `Bảng ${team.group}` : "", team.fifaCode].filter(Boolean).join(" · "))}</span>
      </div>
    </article>`).join("")}</div>`;
}

function wcRenderLiveBanner(data) {
  const el = wcEl("wcLiveBanner");
  if (!el) return;
  const live = (data.items || []).filter((fx) => ["1H", "HT", "2H", "ET", "P", "LIVE"].includes(fx.status));
  if (!live.length) {
    el.innerHTML = "";
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = `<div class="wcLiveHead">🔴 Đang diễn ra</div>${live.slice(0, 3).map((fx) => `
    <div class="wcLiveItem wcLiveItem--click" role="button" tabindex="0" onclick="wcOpenMatchDetail('${wcEscapeHtml(String(fx.id))}')">
      <span>${wcEscapeHtml(fx.home?.name)} ${wcScoreLine(fx)} ${wcEscapeHtml(fx.away?.name)}</span>
      <span class="wcMatchStatus">${wcEscapeHtml(wcStatusLabel(fx.status, fx.elapsed))}</span>
    </div>`).join("")}`;
}

function wcCardKey(event, type, id) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  if (type === "match") wcOpenMatchDetail(id);
  else if (type === "news") wcOpenNewsArticle(id);
  else wcOpenTeamDetail(id);
}

function wcShowDetailModal(title, subtitle) {
  const modal = wcEl("wcDetailModal");
  const titleEl = wcEl("wcDetailTitle");
  const subEl = wcEl("wcDetailSubtitle");
  const body = wcEl("wcDetailBody");
  if (titleEl) titleEl.textContent = title || "Chi tiết";
  if (subEl) subEl.textContent = subtitle || "";
  if (body) body.innerHTML = `<div class="wcLoading">Đang tải…</div>`;
  if (modal) modal.classList.add("show");
  document.body.classList.add("modal-open");
}

function wcCloseDetail(event) {
  if (event?.type === "click" && event.target !== event.currentTarget) return;
  const modal = wcEl("wcDetailModal");
  if (modal) modal.classList.remove("show");
  document.body.classList.remove("modal-open");
}

function wcScorersList(scorers, emptyText) {
  if (!scorers?.length) return `<li>${wcEscapeHtml(emptyText)}</li>`;
  return scorers.map((name) => `<li>${wcEscapeHtml(name)}</li>`).join("");
}

function wcMetaItem(label, value) {
  if (!value && value !== 0) return "";
  return `<div class="wcDetailMetaItem"><b>${wcEscapeHtml(label)}</b>${wcEscapeHtml(String(value))}</div>`;
}

function wcRenderMatchDetail(match) {
  const body = wcEl("wcDetailBody");
  if (!body) return;
  const stadium = match.stadium || {};
  body.innerHTML = `
    <div class="wcDetailHero">
      <div class="wcDetailHeroTeam">
        <img src="${wcEscapeHtml(match.home?.logo || "")}" alt="">
        <strong>${wcEscapeHtml(match.home?.name || "")}</strong>
      </div>
      <div class="wcDetailHeroScore">${wcEscapeHtml(wcScoreLine(match))}</div>
      <div class="wcDetailHeroTeam">
        <img src="${wcEscapeHtml(match.away?.logo || "")}" alt="">
        <strong>${wcEscapeHtml(match.away?.name || "")}</strong>
      </div>
    </div>
    <div class="wcDetailSection">
      <div class="wcDetailMetaGrid">
        ${wcMetaItem("Trạng thái", wcStatusLabel(match.status, match.elapsed))}
        ${wcMetaItem("Thời gian", wcFormatMatchTime(match))}
        ${wcMetaItem("Vòng đấu", match.round)}
        ${wcMetaItem("Bảng", match.group ? `Bảng ${match.group}` : "")}
        ${wcMetaItem("Sân", match.venue)}
        ${wcMetaItem("Thành phố", match.city)}
        ${wcMetaItem("Sức chứa", stadium.capacity ? `${Number(stadium.capacity).toLocaleString("vi-VN")} chỗ` : "")}
        ${wcMetaItem("Khu vực", stadium.region)}
      </div>
    </div>
    <div class="wcDetailSection">
      <h3>Cầu thủ ghi bàn</h3>
      <div class="wcDetailScorers">
        <div class="wcDetailScorerCol">
          <h4>${wcEscapeHtml(match.home?.name || "Đội nhà")}</h4>
          <ul>${wcScorersList(match.home?.scorers, "Không có")}</ul>
        </div>
        <div class="wcDetailScorerCol">
          <h4>${wcEscapeHtml(match.away?.name || "Đội khách")}</h4>
          <ul>${wcScorersList(match.away?.scorers, "Không có")}</ul>
        </div>
      </div>
    </div>`;
}

function wcRenderTeamDetail(team) {
  wcCurrentTeam = team;
  wcRenderTeamDetailTab("overview");
}

function wcTeamOverviewHtml(team) {
  const standing = team.standing;
  const upcoming = (team.upcoming || []).map((fx) => `
    <div class="wcDetailMiniMatch" onclick="wcOpenMatchDetail('${wcEscapeHtml(String(fx.id))}')">
      <span>${wcEscapeHtml(fx.home?.name)} ${wcEscapeHtml(wcScoreLine(fx))} ${wcEscapeHtml(fx.away?.name)}</span>
      <span class="wcMatchStatus">${wcEscapeHtml(wcFormatMatchTime(fx))}</span>
    </div>`).join("");
  const results = (team.results || []).map((fx) => `
    <div class="wcDetailMiniMatch" onclick="wcOpenMatchDetail('${wcEscapeHtml(String(fx.id))}')">
      <span>${wcEscapeHtml(fx.home?.name)} ${wcEscapeHtml(wcScoreLine(fx))} ${wcEscapeHtml(fx.away?.name)}</span>
      <span class="wcMatchStatus">${wcEscapeHtml(wcStatusLabel(fx.status, fx.elapsed))}</span>
    </div>`).join("");

  return `
    <div class="wcDetailHero">
      <div class="wcDetailHeroTeam" style="grid-column:1/-1">
        <img src="${wcEscapeHtml(team.logo || "")}" alt="">
        <strong>${wcEscapeHtml(team.name || "")}</strong>
      </div>
    </div>
    <div class="wcDetailSection">
      <div class="wcDetailMetaGrid">
        ${wcMetaItem("Mã FIFA", team.fifaCode)}
        ${wcMetaItem("Bảng", team.groupLabel || (team.group ? `Bảng ${team.group}` : ""))}
        ${wcMetaItem("Quốc gia", team.country)}
        ${standing ? wcMetaItem("Hạng BXH", `#${standing.rank} · ${standing.points} điểm`) : ""}
        ${standing ? wcMetaItem("Thành tích", `${standing.win}T ${standing.draw}H ${standing.lose}B · ${standing.goalsFor}:${standing.goalsAgainst}`) : ""}
      </div>
    </div>
    ${upcoming ? `<div class="wcDetailSection"><h3>Lịch thi đấu</h3><div class="wcDetailMiniList">${upcoming}</div></div>` : ""}
    ${results ? `<div class="wcDetailSection"><h3>Kết quả</h3><div class="wcDetailMiniList">${results}</div></div>` : ""}`;
}

function wcTeamStandingsHtml(team) {
  const rows = team.groupStandings || [];
  if (!rows.length) {
    return `<div class="wcEmpty">Chưa có bảng xếp hạng cho ${wcEscapeHtml(team.groupLabel || "bảng này")}.</div>`;
  }
  const body = rows.map((row) => {
    const highlight = String(row.team.id) === String(team.id) ? " wcDetailStandRow--self" : "";
    return `<tr class="${highlight.trim()}">
      <td>${row.rank}</td>
      <td class="wcStandTeam"><img src="${wcEscapeHtml(row.team.logo)}" alt="">${wcEscapeHtml(row.team.name)}</td>
      <td>${row.played}</td>
      <td>${row.win}</td>
      <td>${row.draw}</td>
      <td>${row.lose}</td>
      <td>${row.goalsDiff}</td>
      <td><strong>${row.points}</strong></td>
    </tr>`;
  }).join("");

  return `
    <div class="wcDetailSection">
      <h3>${wcEscapeHtml(team.groupLabel || "Bảng xếp hạng")}</h3>
      <div class="wcTableWrap">
        <table class="wcTable">
          <thead><tr><th>#</th><th>Đội</th><th>Tr</th><th>T</th><th>H</th><th>B</th><th>HS</th><th>Đ</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>`;
}

function wcPosLabel(code) {
  const raw = String(code || "").trim();
  const key = raw.toUpperCase().replace(/\s+/g, "");
  const map = {
    GK: "Thủ môn",
    DF: "Hậu vệ",
    DEF: "Hậu vệ",
    MF: "Tiền vệ",
    MID: "Tiền vệ",
    FW: "Tiền đạo",
    FWD: "Tiền đạo"
  };
  return map[key] || raw;
}

function wcPlayerInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function wcPlayerPlaceholder(name) {
  const initials = encodeURIComponent(wcPlayerInitials(name));
  return `https://ui-avatars.com/api/?name=${initials}&background=1e3a5f&color=ffffff&size=256&bold=true`;
}

function wcPlayerPhysicalHtml(p) {
  const parts = [];
  if (p.height) parts.push(`📏 ${wcEscapeHtml(p.height)}`);
  if (p.weight) parts.push(`⚖ ${wcEscapeHtml(p.weight)}`);
  if (p.foot) parts.push(`🦶 ${wcEscapeHtml(p.foot)}`);
  if (!parts.length) return "";
  return `<span class="wcPlayerCardPhysical">${parts.join(" · ")}</span>`;
}

function wcPlayerCardHtml(p) {
  const photo = String(p.image || "").trim() || wcPlayerPlaceholder(p.name);
  const placeholder = wcPlayerPlaceholder(p.name);
  return `<article class="wcPlayerCard">
    <div class="wcPlayerCardPhoto">
      <img src="${wcEscapeHtml(photo)}" alt="${wcEscapeHtml(p.name)}" loading="lazy"
        onerror="this.src='${wcEscapeHtml(placeholder)}'">
      ${p.number ? `<span class="wcPlayerCardNum">${wcEscapeHtml(p.number)}</span>` : ""}
      ${p.captain ? `<span class="wcPlayerCardCaptain" title="Đội trưởng">C</span>` : ""}
    </div>
    <div class="wcPlayerCardBody">
      <strong class="wcPlayerCardName">${wcEscapeHtml(p.name)}</strong>
      <span class="wcPlayerCardMeta">${wcEscapeHtml(wcPosLabel(p.position))}${p.club ? ` · ${wcEscapeHtml(p.club)}` : ""}</span>
      ${wcPlayerPhysicalHtml(p)}
      ${p.caps || p.goals ? `<span class="wcPlayerCardStats">${p.caps ? `${wcEscapeHtml(p.caps)} trận` : ""}${p.caps && p.goals ? " · " : ""}${p.goals ? `${wcEscapeHtml(p.goals)} bàn` : ""}</span>` : ""}
    </div>
  </article>`;
}

function wcTeamPlayersHtml(team) {
  const squad = team.squad || {};
  const players = squad.players || [];
  if (!players.length) {
    return `<div class="wcEmpty">Chưa có danh sách cầu thủ cho đội này.${squad.source_url ? ` <a href="${wcEscapeHtml(squad.source_url)}" target="_blank" rel="noopener noreferrer">Xem trên Wikipedia →</a>` : ""}</div>`;
  }

  return `
    <div class="wcDetailSection">
      ${squad.coach ? `<p class="wcDetailCoach"><strong>HLV:</strong> ${wcEscapeHtml(squad.coach)}</p>` : ""}
      <div class="wcPlayerGrid">${players.map((p) => wcPlayerCardHtml(p)).join("")}</div>
      <p class="wcDetailSource">Nguồn: <a href="${wcEscapeHtml(squad.source_url || "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_squads")}" target="_blank" rel="noopener noreferrer">Wikipedia</a> · Ảnh &amp; thông số từ Wikipedia / Wikidata</p>
    </div>`;
}

let wcCurrentTeam = null;

function wcRenderTeamDetailTab(tab) {
  const body = wcEl("wcDetailBody");
  const team = wcCurrentTeam;
  if (!body || !team) return;

  body.innerHTML = `
    <nav class="wcDetailTabs" aria-label="Chi tiết đội bóng">
      <button type="button" class="wcDetailTabBtn${tab === "overview" ? " active" : ""}" onclick="wcRenderTeamDetailTab('overview')">Tổng quan</button>
      <button type="button" class="wcDetailTabBtn${tab === "standings" ? " active" : ""}" onclick="wcRenderTeamDetailTab('standings')">BXH</button>
      <button type="button" class="wcDetailTabBtn${tab === "players" ? " active" : ""}" onclick="wcRenderTeamDetailTab('players')">Cầu thủ (${(team.squad?.players || []).length})</button>
    </nav>
    <div class="wcDetailTabPanel">${
      tab === "standings" ? wcTeamStandingsHtml(team) :
      tab === "players" ? wcTeamPlayersHtml(team) :
      wcTeamOverviewHtml(team)
    }</div>`;
}

async function wcOpenMatchDetail(id) {
  wcShowDetailModal("Chi tiết trận đấu", "");
  try {
    const data = await wcApiGet("wc2026_match", { id });
    const match = data.item;
    wcEl("wcDetailTitle").textContent = `${match.home?.name || ""} vs ${match.away?.name || ""}`;
    wcEl("wcDetailSubtitle").textContent = [wcFormatMatchTime(match), match.venue].filter(Boolean).join(" · ");
    wcRenderMatchDetail(match);
  } catch (err) {
    wcEl("wcDetailBody").innerHTML = `<div class="wcError">${wcEscapeHtml(String(err.message || err))}</div>`;
  }
}

async function wcOpenTeamDetail(id) {
  wcShowDetailModal("Chi tiết đội bóng", "");
  try {
    const data = await wcApiGet("wc2026_team", { id });
    const team = data.item;
    wcEl("wcDetailTitle").textContent = team.name || "Đội bóng";
    wcEl("wcDetailSubtitle").textContent = [team.fifaCode, team.group ? `Bảng ${team.group}` : ""].filter(Boolean).join(" · ");
    wcRenderTeamDetail(team);
  } catch (err) {
    wcEl("wcDetailBody").innerHTML = `<div class="wcError">${wcEscapeHtml(String(err.message || err))}</div>`;
  }
}

window.wcOpenMatchDetail = wcOpenMatchDetail;
window.wcOpenTeamDetail = wcOpenTeamDetail;
window.wcOpenNewsArticle = wcOpenNewsArticle;
window.wcBackToNewsList = wcBackToNewsList;
window.wcLoadMoreNews = wcLoadMoreNews;
window.wcCloseDetail = wcCloseDetail;
window.wcCardKey = wcCardKey;
window.wcRenderTeamDetailTab = wcRenderTeamDetailTab;

async function wcLoadTab(tab) {
  wcActiveTab = tab;
  document.querySelectorAll(".wcTabBtn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".wcPanel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });

  try {
    if (tab === "news") {
      wcSetLoading("wcPanelNews");
      wcRenderNews(await wcApiGet("wc2026_news", { page: 1 }));
      wcSetNewsUrl("");
    } else if (tab === "fixtures") {
      wcSetLoading("wcPanelFixtures");
      const data = await wcApiGet("wc2026_fixtures", { scope: "upcoming" });
      wcRenderFixtures(data.items || [], "wcPanelFixtures", "Không có trận sắp tới trong 7 ngày tới.");
    } else if (tab === "results") {
      wcSetLoading("wcPanelResults");
      const data = await wcApiGet("wc2026_fixtures", { scope: "results" });
      const items = (data.items || []).slice().reverse();
      wcRenderFixtures(items, "wcPanelResults", "Chưa có kết quả.");
    } else if (tab === "standings") {
      wcSetLoading("wcPanelStandings");
      wcRenderStandings(await wcApiGet("wc2026_standings"));
    } else if (tab === "teams") {
      wcSetLoading("wcPanelTeams");
      wcRenderTeams(await wcApiGet("wc2026_teams"));
    }
  } catch (err) {
    const panelMap = {
      news: "wcPanelNews",
      fixtures: "wcPanelFixtures",
      results: "wcPanelResults",
      standings: "wcPanelStandings",
      teams: "wcPanelTeams"
    };
    wcSetError(panelMap[tab], err);
  }
}

function wcInitTabs() {
  document.querySelectorAll(".wcTabBtn").forEach((btn) => {
    btn.addEventListener("click", () => wcLoadTab(btn.dataset.tab));
  });
}

async function wcInitPage() {
  wcInitTabs();
  wcSetLoading("wcPanelNews");
  try {
    const liveData = await wcApiGet("wc2026_fixtures", { scope: "live" });
    wcRenderLiveBanner(liveData);
  } catch (_) {
    /* live banner optional */
  }
  const newsUrl = new URLSearchParams(location.search).get("news");
  if (newsUrl) {
    wcActiveTab = "news";
    document.querySelectorAll(".wcTabBtn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === "news");
    });
    document.querySelectorAll(".wcPanel").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== "news";
    });
    try {
      wcNewsListCache = await wcApiGet("wc2026_news", { page: 1 });
    } catch (_) {
      wcNewsListCache = null;
    }
    await wcOpenNewsArticle(newsUrl);
  } else {
    await wcLoadTab("news");
  }
  const matchId = new URLSearchParams(location.search).get("match");
  if (matchId) wcOpenMatchDetail(matchId);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wcInitPage);
} else {
  wcInitPage();
}
