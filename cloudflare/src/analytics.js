import { APP_VERSION } from "./utils.js";

export const ANALYTICS_EVENT_TYPES = [
  "page_view",
  "interaction",
  "ad_click",
  "cta_giao_huu",
  "cta_dat_quang_cao",
  "kqxs_view",
  "affcup_view"
];

const ALLOWED_EVENTS = new Set(ANALYTICS_EVENT_TYPES);

const EVENT_LABELS = {
  page_view: "Traffic (lượt xem)",
  interaction: "Tương tác",
  ad_click: "Click quảng cáo",
  cta_giao_huu: "Giao hữu",
  cta_dat_quang_cao: "Đặt quảng cáo",
  kqxs_view: "KQXS",
  affcup_view: "AFF Cup"
};

function emptyTotals() {
  const totals = {};
  for (const type of ANALYTICS_EVENT_TYPES) totals[type] = 0;
  return totals;
}

function parseIsoDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseAnalyticsQuery(params = {}) {
  const groupBy = String(params.group_by || "day").trim().toLowerCase() === "month" ? "month" : "day";
  const now = new Date();
  let fromDate = parseIsoDate(params.from);
  let toDate = parseIsoDate(params.to);

  if (!fromDate && !toDate) {
    toDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    fromDate = new Date(toDate.getTime());
    fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  } else if (fromDate && !toDate) {
    toDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  } else if (!fromDate && toDate) {
    fromDate = new Date(toDate.getTime());
    fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  }

  if (fromDate.getTime() > toDate.getTime()) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }

  const fromIso = fromDate.toISOString();
  const toExclusive = new Date(toDate.getTime());
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const toIso = toExclusive.toISOString();

  return {
    group_by: groupBy,
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
    from_iso: fromIso,
    to_iso: toIso
  };
}

function bucketExpr(groupBy) {
  return groupBy === "month"
    ? "strftime('%Y-%m', created_at)"
    : "date(created_at)";
}

export async function trackSiteEvent(db, payload) {
  let eventType = String(payload.event_type || "").trim();
  // Alias cũ / typo từ frontend
  if (eventType === "aff2026_page_view") eventType = "affcup_view";
  if (eventType === "kqxs_page_view") eventType = "kqxs_view";
  if (!ALLOWED_EVENTS.has(eventType)) {
    throw new Error("Loại sự kiện analytics không hợp lệ.");
  }

  const pagePath = String(payload.page_path || "").trim().slice(0, 240);
  let metaJson = "";
  if (payload.meta != null) {
    try {
      metaJson = JSON.stringify(payload.meta).slice(0, 1000);
    } catch {
      metaJson = "";
    }
  }

  await db.prepare(`
    INSERT INTO site_analytics_events (event_type, page_path, meta_json, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(eventType, pagePath, metaJson, new Date().toISOString()).run();

  return { ok: true, version: APP_VERSION, event_type: eventType };
}

export async function adminGetAnalytics(db, params) {
  const range = parseAnalyticsQuery(params);
  const bucket = bucketExpr(range.group_by);

  const rows = await db.prepare(`
    SELECT ${bucket} AS bucket, event_type, COUNT(*) AS count
    FROM site_analytics_events
    WHERE datetime(created_at) >= datetime(?)
      AND datetime(created_at) < datetime(?)
    GROUP BY bucket, event_type
    ORDER BY bucket ASC
  `).bind(range.from_iso, range.to_iso).all();

  const totals = emptyTotals();
  const seriesMap = new Map();

  for (const row of rows.results || []) {
    const type = String(row.event_type || "");
    const count = Number(row.count) || 0;
    const key = String(row.bucket || "");
    if (!ALLOWED_EVENTS.has(type) || !key) continue;

    totals[type] += count;
    if (!seriesMap.has(key)) seriesMap.set(key, { bucket: key, ...emptyTotals() });
    seriesMap.get(key)[type] = count;
  }

  const series = Array.from(seriesMap.values()).sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));

  return {
    ok: true,
    version: APP_VERSION,
    from: range.from,
    to: range.to,
    group_by: range.group_by,
    labels: EVENT_LABELS,
    event_types: ANALYTICS_EVENT_TYPES,
    totals,
    series
  };
}
