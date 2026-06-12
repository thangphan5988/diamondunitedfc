/* Admin traffic analytics dashboard */

const ANALYTICS_EVENT_ORDER = [
  "page_view",
  "interaction",
  "ad_click",
  "cta_giao_huu",
  "cta_dat_quang_cao"
];

const ANALYTICS_EVENT_LABELS = {
  page_view: "Traffic",
  interaction: "Tương tác",
  ad_click: "Click QC",
  cta_giao_huu: "Giao hữu",
  cta_dat_quang_cao: "Đặt QC"
};

let analyticsLabels = { ...ANALYTICS_EVENT_LABELS };
let analyticsRange = { from: "", to: "", group_by: "day" };

function analyticsTodayIso(){
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function analyticsShiftDays(iso, days){
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function analyticsMonthStartIso(){
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function setAnalyticsPreset(kind){
  const today = analyticsTodayIso();
  const fromEl = document.getElementById("analyticsFrom");
  const toEl = document.getElementById("analyticsTo");
  const groupEl = document.getElementById("analyticsGroupBy");
  if(!fromEl || !toEl) return;

  if(kind === "today"){
    fromEl.value = today;
    toEl.value = today;
  }else if(kind === "7d"){
    fromEl.value = analyticsShiftDays(today, -6);
    toEl.value = today;
  }else if(kind === "30d"){
    fromEl.value = analyticsShiftDays(today, -29);
    toEl.value = today;
  }else if(kind === "month"){
    fromEl.value = analyticsMonthStartIso();
    toEl.value = today;
  }
  if(groupEl && kind === "month") groupEl.value = "day";
  loadAdminAnalytics();
}

function readAnalyticsFilters(){
  const from = document.getElementById("analyticsFrom")?.value || "";
  const to = document.getElementById("analyticsTo")?.value || "";
  const group_by = document.getElementById("analyticsGroupBy")?.value === "month" ? "month" : "day";
  analyticsRange = { from, to, group_by };
  return analyticsRange;
}

function formatAnalyticsBucket(bucket, groupBy){
  const s = String(bucket || "");
  if(groupBy === "month"){
    const [y, m] = s.split("-");
    return m && y ? `Tháng ${m}/${y}` : s;
  }
  const parts = s.split("-");
  if(parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return s;
}

function analyticsCountCell(n){
  const v = Number(n) || 0;
  return v > 0 ? v.toLocaleString("vi-VN") : "—";
}

function renderAnalyticsSummary(totals){
  const el = document.getElementById("analyticsSummary");
  if(!el) return;
  el.innerHTML = ANALYTICS_EVENT_ORDER.map(type => {
    const label = analyticsLabels[type] || ANALYTICS_EVENT_LABELS[type] || type;
    const value = Number(totals?.[type]) || 0;
    return `<div class="analyticsMetric">
      <span class="analyticsMetricLabel">${escapeHtml(label)}</span>
      <b class="analyticsMetricValue">${value.toLocaleString("vi-VN")}</b>
    </div>`;
  }).join("");
}

function renderAnalyticsTable(series, groupBy){
  const el = document.getElementById("analyticsSeriesTable");
  if(!el) return;

  if(!series?.length){
    el.innerHTML = `<div class="meta">Không có dữ liệu trong khoảng thời gian đã chọn.</div>`;
    return;
  }

  const head = `<tr>
    <th>${groupBy === "month" ? "Tháng" : "Ngày"}</th>
    ${ANALYTICS_EVENT_ORDER.map(type => `<th>${escapeHtml(analyticsLabels[type] || ANALYTICS_EVENT_LABELS[type] || type)}</th>`).join("")}
  </tr>`;

  const body = series.map(row => `<tr>
    <td>${escapeHtml(formatAnalyticsBucket(row.bucket, groupBy))}</td>
    ${ANALYTICS_EVENT_ORDER.map(type => `<td>${analyticsCountCell(row[type])}</td>`).join("")}
  </tr>`).join("");

  el.innerHTML = `<div class="analyticsTableWrap"><table class="analyticsTable">${head}${body}</table></div>`;
}

async function loadAdminAnalytics(){
  const summary = document.getElementById("analyticsSummary");
  const table = document.getElementById("analyticsSeriesTable");
  if(!summary || !table) return;

  summary.innerHTML = `<div class="meta">Đang tải...</div>`;
  table.innerHTML = "";

  const filters = readAnalyticsFilters();
  try{
    const data = await apiGet("admin_get_analytics", {
      session_token: authSession?.token,
      from: filters.from,
      to: filters.to,
      group_by: filters.group_by,
      ts: Date.now()
    });
    analyticsLabels = Object.assign({}, ANALYTICS_EVENT_LABELS, data.labels || {});
    renderAnalyticsSummary(data.totals || {});
    renderAnalyticsTable(data.series || [], data.group_by || filters.group_by);
  }catch(e){
    summary.innerHTML = `<div class="error" style="display:block">${escapeHtml(e.message || "Không tải được thống kê traffic.")}</div>`;
  }
}

function initAnalyticsAdminFilters(){
  const today = analyticsTodayIso();
  const fromEl = document.getElementById("analyticsFrom");
  const toEl = document.getElementById("analyticsTo");
  if(fromEl && !fromEl.value) fromEl.value = analyticsShiftDays(today, -6);
  if(toEl && !toEl.value) toEl.value = today;
}
