/* KQXS 3 miền UI */

const KQXS_API = typeof API_BASE_URL !== "undefined" ? API_BASE_URL : "https://api.diamondunitedfc.com";
const KQXS_REGIONS = ["mb", "mt", "mn"];
const KQXS_REGION_LABEL = { mb: "Miền Bắc", mt: "Miền Trung", mn: "Miền Nam", all: "Cả 3 miền" };

let kqxsState = {
  view: "all",
  date: "",
  today: "",
  data: null,
  loading: false,
  pollTimer: null
};

function kqxsEsc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kqxsVnToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function kqxsShiftDate(ymd, deltaDays) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return kqxsVnToday();
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function kqxsFormatDateVi(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

async function kqxsFetch(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`${KQXS_API}?${qs.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Lỗi tải KQXS (${res.status})`);
  }
  return data;
}

function kqxsSetLoading(on, message) {
  const el = document.getElementById("kqxsContent");
  if (!el) return;
  if (on) {
    el.innerHTML = `<div class="kqxsLoading">${kqxsEsc(message || "Đang tải kết quả xổ số...")}</div>`;
  }
}

function kqxsNumsHtml(numbers, prizeKey) {
  const list = numbers || [];
  if (!list.length) return `<span class="kqxsNum">—</span>`;
  return `<div class="kqxsNums">${list.map((n) =>
    `<span class="kqxsNum"${prizeKey === "db" ? ' data-db="1"' : ""}>${kqxsEsc(n)}</span>`
  ).join("")}</div>`;
}

function kqxsLotoHtml(station) {
  const chips = (station.loto || []).map((n) => `<span class="kqxsLotoChip">${kqxsEsc(n)}</span>`).join("");
  const heads = station.loto_table?.heads || [];
  const tails = station.loto_table?.tails || [];
  const headRows = heads.map((arr, i) =>
    `<tr><th>${i}</th><td>${(arr || []).map((n) => kqxsEsc(n)).join("; ") || "—"}</td></tr>`
  ).join("");
  const tailRows = tails.map((arr, i) =>
    `<tr><th>${i}</th><td>${(arr || []).map((n) => kqxsEsc(n)).join("; ") || "—"}</td></tr>`
  ).join("");
  return `<div class="kqxsLotoBlock">
    <h3>Lô tô · ${kqxsEsc(station.name)}</h3>
    <div class="kqxsLotoChips">${chips || "<span class='meta'>—</span>"}</div>
    <div class="kqxsHeadTail">
      <table class="kqxsHtTable"><thead><tr><th>Đầu</th><th>Lô tô</th></tr></thead><tbody>${headRows}</tbody></table>
      <table class="kqxsHtTable"><thead><tr><th>Đuôi</th><th>Lô tô</th></tr></thead><tbody>${tailRows}</tbody></table>
    </div>
  </div>`;
}

function kqxsBoardHtml(regionKey, board) {
  if (!board || !(board.stations || []).length) {
    return `<section class="kqxsBoard kqxsBoard--${regionKey}">
      <div class="kqxsBoardHead">
        <h2>${kqxsEsc(KQXS_REGION_LABEL[regionKey])}</h2>
        <div class="kqxsBoardMeta">Chưa có kết quả</div>
      </div>
      <div class="kqxsEmpty" style="margin:12px;border:0">Không có dữ liệu đài mở thưởng ngày này.</div>
    </section>`;
  }

  const stations = board.stations || [];
  const isMb = regionKey === "mb";
  const prizeCount = Math.max(...stations.map((s) => (s.prizes || []).length), 0);
  const prizeRows = [];
  for (let i = 0; i < prizeCount; i += 1) {
    const label = stations[0]?.prizes?.[i]?.label || `Giải`;
    const key = stations[0]?.prizes?.[i]?.key || `g${i}`;
    const cells = stations.map((st) => {
      const prize = st.prizes?.[i] || { numbers: [] };
      return `<td class="kqxsStationCell">${kqxsNumsHtml(prize.numbers, prize.key || key)}</td>`;
    }).join("");
    prizeRows.push(`<tr data-prize="${kqxsEsc(key)}"><td class="kqxsPrizeLabel">${kqxsEsc(label)}</td>${cells}</tr>`);
  }

  const headCells = stations.map((st) =>
    `<th><div class="kqxsStationName">${kqxsEsc(st.name)}</div></th>`
  ).join("");

  const dateLabel = [
    board.weekday_label,
    kqxsFormatDateVi(board.date)
  ].filter(Boolean).join(" · ");

  const lotoBlocks = isMb
    ? kqxsLotoHtml(stations[0])
    : stations.map((st) => kqxsLotoHtml(st)).join("");

  return `<section class="kqxsBoard kqxsBoard--${regionKey}">
    <div class="kqxsBoardHead">
      <h2>Xổ số ${kqxsEsc(board.region_label || KQXS_REGION_LABEL[regionKey])}</h2>
      <div class="kqxsBoardMeta">${kqxsEsc(dateLabel)}</div>
    </div>
    <div class="kqxsTableWrap">
      <table class="kqxsTable">
        <thead><tr><th>Giải</th>${headCells}</tr></thead>
        <tbody>${prizeRows.join("")}</tbody>
      </table>
    </div>
    ${lotoBlocks}
  </section>`;
}

function kqxsRender() {
  const data = kqxsState.data;
  const root = document.getElementById("kqxsContent");
  const status = document.getElementById("kqxsStatus");
  if (!root) return;

  document.querySelectorAll(".kqxsTab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.region === kqxsState.view);
  });
  document.querySelectorAll(".kqxsQuickBtn").forEach((btn) => {
    const mode = btn.dataset.quick;
    const latest = kqxsState.data?.date || kqxsState.date;
    let active = false;
    if (mode === "today") active = !!kqxsState.data?.from_live || latest === kqxsState.today;
    if (mode === "yesterday") active = latest === kqxsShiftDate(kqxsState.today, -1);
    btn.classList.toggle("active", active);
  });

  const dateInput = document.getElementById("kqxsDate");
  if (dateInput && document.activeElement !== dateInput) {
    dateInput.value = kqxsState.date || kqxsState.today || kqxsVnToday();
  }

  if (!data) {
    root.innerHTML = `<div class="kqxsEmpty">Chưa có dữ liệu.</div>`;
    return;
  }

  if (status) {
    const live = data.active
      ? `<span class="kqxsLiveChip"><span class="kqxsLiveDot" aria-hidden="true"></span>Đang quay</span> `
      : "";
    const updated = data.updated_at
      ? `Cập nhật ${kqxsEsc(String(data.updated_at).replace("T", " ").replace(/\+07:00$/, " (GMT+7)"))}`
      : `Ngày ${kqxsEsc(kqxsFormatDateVi(data.date))}`;
    status.innerHTML = `${live}<strong>${updated}</strong>`;
  }

  if (data.empty) {
    root.innerHTML = `<div class="kqxsEmpty">${kqxsEsc(data.message || "Chưa có kết quả.")}</div>`;
    return;
  }

  const regions = data.regions || {};
  const keys = kqxsState.view === "all" ? KQXS_REGIONS : [kqxsState.view];
  const gridClass = kqxsState.view === "all" ? "kqxsBoardGrid kqxsBoardGrid--all" : "kqxsBoardGrid";
  root.innerHTML = `<div class="${gridClass}">${keys.map((k) => kqxsBoardHtml(k, regions[k])).join("")}</div>
    <p class="kqxsNote">Kết quả mang tính tham khảo, tổng hợp tự động. Giờ quay thường lệ: Miền Nam ~16:10 · Miền Trung ~17:15 · Miền Bắc ~18:15 (GMT+7). Nguồn dữ liệu công khai qua API DUFC.</p>`;
}

function kqxsClearPoll() {
  if (kqxsState.pollTimer) {
    clearInterval(kqxsState.pollTimer);
    kqxsState.pollTimer = null;
  }
}

function kqxsMaybePoll() {
  kqxsClearPoll();
  if (!kqxsState.data?.active) return;
  if (kqxsState.date && kqxsState.date !== kqxsState.today) return;
  kqxsState.pollTimer = setInterval(() => {
    kqxsLoad({ silent: true });
  }, 20000);
}

async function kqxsLoad(options = {}) {
  if (kqxsState.loading) return;
  kqxsState.loading = true;
  if (!options.silent) kqxsSetLoading(true);

  try {
    const params = {};
    if (kqxsState.date && kqxsState.date !== kqxsState.today) params.date = kqxsState.date;
    const data = await kqxsFetch("kqxs_hub", params);
    kqxsState.data = data;
    kqxsState.today = data.today || kqxsVnToday();
    if (!kqxsState.date) kqxsState.date = data.date || kqxsState.today;
    kqxsRender();
    kqxsMaybePoll();
  } catch (err) {
    const root = document.getElementById("kqxsContent");
    if (root) {
      root.innerHTML = `<div class="kqxsError">${kqxsEsc(err.message || "Không tải được kết quả xổ số.")}</div>`;
    }
    kqxsClearPoll();
  } finally {
    kqxsState.loading = false;
  }
}

function kqxsSetView(region) {
  kqxsState.view = region || "all";
  kqxsRender();
}

function kqxsSetQuick(mode) {
  const today = kqxsState.today || kqxsVnToday();
  if (mode === "yesterday") {
    kqxsState.date = kqxsShiftDate(today, -1);
    kqxsLoad();
    return;
  }
  // Hôm nay = kết quả mới nhất từ live (có thể là ngày quay gần nhất)
  kqxsState.date = "";
  kqxsLoad();
}

function kqxsOnDateChange(value) {
  const ymd = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
  kqxsState.date = ymd;
  kqxsLoad();
}

async function kqxsLoad(options = {}) {
  if (kqxsState.loading) return;
  kqxsState.loading = true;
  if (!options.silent) kqxsSetLoading(true);

  try {
    const params = {};
    if (kqxsState.date) params.date = kqxsState.date;
    const data = await kqxsFetch("kqxs_hub", params);
    kqxsState.data = data;
    kqxsState.today = data.today || kqxsVnToday();
    kqxsState.date = data.date || kqxsState.today;
    kqxsRender();
    kqxsMaybePoll();
  } catch (err) {
    const root = document.getElementById("kqxsContent");
    if (root) {
      root.innerHTML = `<div class="kqxsError">${kqxsEsc(err.message || "Không tải được kết quả xổ số.")}</div>`;
    }
    kqxsClearPoll();
  } finally {
    kqxsState.loading = false;
  }
}

function kqxsInit() {
  kqxsState.today = kqxsVnToday();
  kqxsState.date = "";
  const dateInput = document.getElementById("kqxsDate");
  if (dateInput) {
    dateInput.max = kqxsState.today;
  }
  kqxsLoad();
}

document.addEventListener("DOMContentLoaded", kqxsInit);
window.addEventListener("beforeunload", kqxsClearPoll);
