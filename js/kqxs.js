/* KQXS UI/UX — bám layout kqxs.vn */

const KQXS_API = typeof API_BASE_URL !== "undefined" ? API_BASE_URL : "https://api.diamondunitedfc.com";
/** Thứ tự trang chủ kqxs.vn: Bắc → Nam → Trung */
const KQXS_HOME_ORDER = ["mb", "mn", "mt"];
const KQXS_LABEL = { mb: "Miền Bắc", mn: "Miền Nam", mt: "Miền Trung" };

const KQXS_SIDE_MN = [
  { id: "tp-hcm", name: "Hồ Chí Minh" },
  { id: "dong-thap", name: "Đồng Tháp" },
  { id: "ca-mau", name: "Cà Mau" },
  { id: "ben-tre", name: "Bến Tre" },
  { id: "vung-tau", name: "Vũng Tàu" },
  { id: "bac-lieu", name: "Bạc Liêu" },
  { id: "dong-nai", name: "Đồng Nai" },
  { id: "can-tho", name: "Cần Thơ" },
  { id: "soc-trang", name: "Sóc Trăng" },
  { id: "tay-ninh", name: "Tây Ninh" },
  { id: "an-giang", name: "An Giang" },
  { id: "binh-thuan", name: "Bình Thuận" },
  { id: "vinh-long", name: "Vĩnh Long" },
  { id: "binh-duong", name: "Bình Dương" },
  { id: "tra-vinh", name: "Trà Vinh" },
  { id: "long-an", name: "Long An" },
  { id: "binh-phuoc", name: "Bình Phước" },
  { id: "hau-giang", name: "Hậu Giang" },
  { id: "tien-giang", name: "Tiền Giang" },
  { id: "kien-giang", name: "Kiên Giang" },
  { id: "da-lat", name: "Đà Lạt" }
];
const KQXS_SIDE_MT = [
  { id: "phu-yen", name: "Phú Yên" },
  { id: "thua-thien-hue", name: "Thừa Thiên Huế" },
  { id: "dak-lak", name: "Đắk Lắk" },
  { id: "quang-nam", name: "Quảng Nam" },
  { id: "da-nang", name: "Đà Nẵng" },
  { id: "khanh-hoa", name: "Khánh Hòa" },
  { id: "quang-binh", name: "Quảng Bình" },
  { id: "binh-dinh", name: "Bình Định" },
  { id: "quang-tri", name: "Quảng Trị" },
  { id: "gia-lai", name: "Gia Lai" },
  { id: "ninh-thuan", name: "Ninh Thuận" },
  { id: "quang-ngai", name: "Quảng Ngãi" },
  { id: "dak-nong", name: "Đắk Nông" },
  { id: "kon-tum", name: "Kon Tum" }
];

const KQXS_SHORT = {
  "TP. Hồ Chí Minh": "Hồ Chí Minh",
  "Thừa Thiên Huế": "Thừa Thiên Huế"
};

let kqxsState = {
  mode: "hub", // hub | province
  view: "all",
  date: "",
  today: "",
  quickMode: "today", // today | yesterday | date
  province: "",
  data: null,
  loading: false,
  pollTimer: null,
  digitMode: "full",
  zoom: "",
  station: { mn: 0, mt: 0 }
};

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function vnToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

function shiftDate(ymd, delta) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return vnToday();
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatDateVi(ymd, sep = "-") {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd || "";
  return `${m[3]}${sep}${m[2]}${sep}${m[1]}`;
}

function weekdayLongVi() {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric"
  }).format(new Date());
}

function stationName(name) {
  const n = String(name || "").trim();
  return KQXS_SHORT[n] || n;
}

function formatNum(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "—";
  if (kqxsState.digitMode === "2") return digits.slice(-2).padStart(2, "0");
  if (kqxsState.digitMode === "3") {
    const slice = digits.slice(-3);
    return slice.padStart(Math.min(3, digits.length), "0");
  }
  return String(raw);
}

async function apiFetch(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`${KQXS_API}?${qs.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `Lỗi KQXS (${res.status})`);
  return data;
}

function fillSideLists() {
  const mn = document.getElementById("kqxsSideMn");
  const mt = document.getElementById("kqxsSideMt");
  if (mn) {
    mn.innerHTML = KQXS_SIDE_MN.map((p) =>
      `<li><a href="#province-${esc(p.id)}" data-province="${esc(p.id)}" data-region="mn">${esc("Xổ số " + p.name)}</a></li>`
    ).join("");
  }
  if (mt) {
    mt.innerHTML = KQXS_SIDE_MT.map((p) =>
      `<li><a href="#province-${esc(p.id)}" data-province="${esc(p.id)}" data-region="mt">${esc("Xổ số " + p.name)}</a></li>`
    ).join("");
  }
}

function numsInline(numbers, prizeKey) {
  const list = numbers || [];
  if (!list.length) return `<span class="kqxsNum">—</span>`;
  const cls = prizeKey === "db" ? "kqxsNum kqxsNum--db"
    : prizeKey === "g8" ? "kqxsNum kqxsNum--g8"
      : "kqxsNum";
  return `<div class="kqxsNums">${list.map((n, i) =>
    `${i ? '<span class="kqxsDot">.</span>' : ""}<span class="${cls}">${esc(formatNum(n))}</span>`
  ).join("")}</div>`;
}

function numsColumn(numbers, prizeKey) {
  const list = numbers || [];
  if (!list.length) return `<div class="kqxsNumCol"><span class="kqxsNum">—</span></div>`;
  const cls = prizeKey === "db" ? "kqxsNum kqxsNum--db"
    : prizeKey === "g8" ? "kqxsNum kqxsNum--g8"
      : "kqxsNum";
  return `<div class="kqxsNumCol">${list.map((n) =>
    `<span class="${cls}">${esc(formatNum(n))}</span>`
  ).join("")}</div>`;
}

function footHtml(region) {
  const mode = kqxsState.digitMode;
  return `<div class="kqxsBoardFoot">
    <div class="kqxsDigits">
      <button type="button" class="kqxsDigit${mode === "full" ? " active" : ""}" data-digit="full"><i></i>Đầy đủ</button>
      <button type="button" class="kqxsDigit${mode === "2" ? " active" : ""}" data-digit="2"><i></i>2 số</button>
      <button type="button" class="kqxsDigit${mode === "3" ? " active" : ""}" data-digit="3"><i></i>3 số</button>
    </div>
    <button type="button" class="kqxsZoom" data-zoom="${esc(region)}">${kqxsState.zoom === region ? "Thu nhỏ" : "Phóng to"}</button>
  </div>`;
}

function lotoBlockHtml(region, board, station, uid) {
  const datePart = [
    board.weekday_label,
    formatDateVi(board.date)
  ].filter(Boolean).join(" ");
  const title = region === "mb"
    ? `Lô tô ${KQXS_LABEL[region]} ${datePart}`
    : `Lô tô ${stationName(station.name)} ${datePart}`;

  const loto = station.loto || [];
  const grid = loto.map((n, i) =>
    `<span class="${i === 0 ? "is-hot" : ""}">${esc(n)}</span>`
  ).join("");

  const heads = station.loto_table?.heads || [];
  const tails = station.loto_table?.tails || [];
  const headRows = heads.map((arr, i) =>
    `<tr><th>${i}</th><td>${(arr || []).length ? arr.map(esc).join("; ") : "—"}</td></tr>`
  ).join("");
  const tailRows = tails.map((arr, i) =>
    `<tr><th>${i}</th><td>${(arr || []).length ? arr.map(esc).join("; ") : "—"}</td></tr>`
  ).join("");

  return `<div class="kqxsLoto" id="loto-${esc(uid || region)}">
    <div class="kqxsLotoHead">${esc(title)}</div>
    <div class="kqxsLotoGrid">${grid}</div>
    <div class="kqxsHtWrap">
      <table class="kqxsHtTable">
        <thead><tr><th>Đầu</th><th>Lô tô</th></tr></thead>
        <tbody>${headRows}</tbody>
      </table>
      <table class="kqxsHtTable">
        <thead><tr><th>Đuôi</th><th>Lô tô</th></tr></thead>
        <tbody>${tailRows}</tbody>
      </table>
    </div>
  </div>`;
}

function provinceTabsHtml(region, stations, activeIdx) {
  if (stations.length < 2) return "";
  return `<div class="kqxsProvinceTabs">${stations.map((st, i) =>
    `<button type="button" class="kqxsProvinceTab${i === activeIdx ? " active" : ""}" data-region="${region}" data-station="${i}">${esc(stationName(st.name))}</button>`
  ).join("")}</div>`;
}

function mbTableHtml(board) {
  const st = board.stations[0];
  let alt = false;
  const rows = (st.prizes || []).map((p) => {
    alt = !alt;
    return `<tr class="${alt ? "kqxsAlt" : ""}" data-prize="${esc(p.key)}">
      <td class="kqxsPrize">${esc(p.label)}</td>
      <td>${numsInline(p.numbers, p.key)}</td>
    </tr>`;
  }).join("");
  return `<div class="kqxsTableWrap"><table class="kqxsTable"><tbody>${rows}</tbody></table></div>`;
}

function multiTableHtml(board) {
  const stations = board.stations || [];
  const prizes = stations[0]?.prizes || [];
  const head = stations.map((st) => `<th>${esc(stationName(st.name))}</th>`).join("");
  let alt = false;
  const body = prizes.map((meta, prizeIdx) => {
    alt = !alt;
    const maxRows = Math.max(1, ...stations.map((st) => (st.prizes?.[prizeIdx]?.numbers || []).length));
    const chunks = [];
    for (let r = 0; r < maxRows; r += 1) {
      const cells = stations.map((st) => {
        const nums = st.prizes?.[prizeIdx]?.numbers || [];
        const n = nums[r];
        if (n == null) return r === 0 ? `<td>${numsColumn([], meta.key)}</td>` : `<td></td>`;
        const cls = meta.key === "db" ? "kqxsNum kqxsNum--db"
          : meta.key === "g8" ? "kqxsNum kqxsNum--g8"
            : "kqxsNum";
        return `<td><span class="${cls}">${esc(formatNum(n))}</span></td>`;
      }).join("");
      if (r === 0) {
        chunks.push(`<tr class="${alt ? "kqxsAlt" : ""}" data-prize="${esc(meta.key)}">
          <td class="kqxsPrize" rowspan="${maxRows}">${esc(meta.label)}</td>${cells}
        </tr>`);
      } else {
        chunks.push(`<tr class="${alt ? "kqxsAlt" : ""}" data-prize="${esc(meta.key)}">${cells}</tr>`);
      }
    }
    return chunks.join("");
  }).join("");

  return `<div class="kqxsTableWrap">
    <table class="kqxsTable">
      <thead><tr><th style="width:100px">Giải</th>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function boardHtml(region, board, opts = {}) {
  const uid = opts.uid || region;
  const boardId = opts.id || `board-${region}`;
  if (!board?.stations?.length) {
    return `<section class="kqxsBoard" id="${esc(boardId)}">
      <div class="kqxsBoardHead">Xổ số ${esc(opts.title || KQXS_LABEL[region])}</div>
      <div class="kqxsEmpty">Chưa có kết quả ngày này.</div>
    </section>`;
  }

  const datePart = [board.weekday_label, formatDateVi(board.date)].filter(Boolean).join(" ");
  const title = opts.title
    ? `${opts.title} ${datePart}`
    : `Xổ số ${board.region_label || KQXS_LABEL[region]} ${datePart}`;
  const zoomClass = kqxsState.zoom === uid ? " is-zoom" : "";

  let stationIdx = 0;
  if (!opts.singleStation && (region === "mn" || region === "mt")) {
    stationIdx = Number(kqxsState.station[region]) || 0;
    if (stationIdx >= board.stations.length) stationIdx = 0;
    kqxsState.station[region] = stationIdx;
  }
  const lotoStation = board.stations[stationIdx];
  const tableHtml = region === "mb" ? mbTableHtml(board) : multiTableHtml(board);

  return `<section class="kqxsBoard${zoomClass}" id="${esc(boardId)}">
    <div class="kqxsBoardHead"><a href="#${esc(boardId)}">${esc(title)}</a></div>
    ${tableHtml}
    ${footHtml(uid)}
    ${opts.singleStation ? "" : provinceTabsHtml(region, board.stations, stationIdx)}
    ${lotoBlockHtml(region, board, lotoStation, uid)}
  </section>`;
}

function updateChrome() {
  const top = document.getElementById("kqxsTopDate");
  if (top) top.textContent = `Hôm nay ${weekdayLongVi()}`;

  document.querySelectorAll(".kqxsNavLink[data-jump]").forEach((btn) => {
    const jump = btn.getAttribute("data-jump");
    const active = kqxsState.mode === "hub" && (jump === "all" ? kqxsState.view === "all" : kqxsState.view === jump);
    btn.classList.toggle("active", active);
  });

  document.querySelectorAll(".kqxsBtn[data-quick]").forEach((btn) => {
    const mode = btn.getAttribute("data-quick");
    btn.classList.toggle("active", kqxsState.mode === "hub" && kqxsState.quickMode === mode);
  });

  document.querySelectorAll("[data-province]").forEach((a) => {
    a.classList.toggle("is-active", kqxsState.mode === "province" && a.getAttribute("data-province") === kqxsState.province);
  });

  const sel = document.getElementById("kqxsRegionSelect");
  if (sel && document.activeElement !== sel) {
    sel.value = kqxsState.mode === "hub" ? kqxsState.view : "all";
  }

  const dateInput = document.getElementById("kqxsDate");
  if (dateInput && document.activeElement !== dateInput && kqxsState.date) {
    dateInput.value = kqxsState.date;
  }

  const status = document.getElementById("kqxsStatus");
  if (status && kqxsState.data) {
    if (kqxsState.mode === "province") {
      const name = kqxsState.data.province_name || kqxsState.province;
      const n = (kqxsState.data.draws || []).length;
      status.innerHTML = `${esc(name)} · ${n} kỳ gần nhất`;
      return;
    }
    const live = kqxsState.data.active
      ? `<span class="kqxsLive"><i></i>Đang quay</span>`
      : "";
    const updated = kqxsState.data.updated_at
      ? `Cập nhật ${esc(String(kqxsState.data.updated_at).replace("T", " ").slice(0, 16))}`
      : `Ngày ${esc(formatDateVi(kqxsState.data.date, "/"))}`;
    status.innerHTML = `${live}${updated}`;
  }
}

function render() {
  updateChrome();
  const root = document.getElementById("kqxsContent");
  if (!root) return;
  const data = kqxsState.data;
  if (!data) {
    root.innerHTML = `<div class="kqxsEmpty">Chưa có dữ liệu.</div>`;
    return;
  }
  if (data.empty) {
    root.innerHTML = `<div class="kqxsEmpty">${esc(data.message || "Chưa có kết quả.")}</div>`;
    return;
  }

  if (kqxsState.mode === "province") {
    const region = data.region || "mn";
    const name = data.province_name || "Tỉnh";
    const draws = data.draws || [];
    root.innerHTML = `
      <div class="kqxsProvinceBanner">
        Xổ số ${esc(name)}
        <small>3 kỳ quay gần nhất</small>
      </div>
      <div class="kqxsBoardStack">${draws.map((board, i) => boardHtml(region, board, {
        uid: `p${i}`,
        id: `board-p${i}`,
        title: `Xổ số ${name}`,
        singleStation: true
      })).join("")}</div>`;
    bindBoardEvents();
    return;
  }

  const regions = data.regions || {};
  const keys = kqxsState.view === "all" ? KQXS_HOME_ORDER : [kqxsState.view];
  root.innerHTML = `<div class="kqxsBoardStack">${keys.map((k) => boardHtml(k, regions[k])).join("")}</div>`;
  bindBoardEvents();
}

function bindBoardEvents() {
  document.querySelectorAll("[data-digit]").forEach((btn) => {
    btn.onclick = () => {
      kqxsState.digitMode = btn.getAttribute("data-digit") || "full";
      render();
    };
  });
  document.querySelectorAll("[data-zoom]").forEach((btn) => {
    btn.onclick = () => {
      const r = btn.getAttribute("data-zoom");
      kqxsState.zoom = kqxsState.zoom === r ? "" : r;
      render();
      if (kqxsState.zoom) {
        document.getElementById(`board-${r}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
  });
  document.querySelectorAll(".kqxsProvinceTab").forEach((btn) => {
    btn.onclick = () => {
      const region = btn.getAttribute("data-region");
      const idx = Number(btn.getAttribute("data-station")) || 0;
      if (region === "mn" || region === "mt") kqxsState.station[region] = idx;
      render();
    };
  });
}

function jumpTo(region) {
  kqxsState.mode = "hub";
  kqxsState.province = "";
  if (region && region !== "all") kqxsState.view = region;
  else kqxsState.view = "all";
  render();
  const id = region && region !== "all" ? `board-${region}` : "kqxsContent";
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("kqxsNav")?.classList.remove("is-open");
}

function setQuick(mode) {
  kqxsState.mode = "hub";
  kqxsState.province = "";
  const today = kqxsState.today || vnToday();
  if (mode === "yesterday") {
    kqxsState.quickMode = "yesterday";
    kqxsState.date = shiftDate(today, -1);
  } else {
    kqxsState.quickMode = "today";
    kqxsState.date = "";
  }
  load();
}

async function loadProvince(provinceId) {
  if (kqxsState.loading) return;
  kqxsState.loading = true;
  kqxsState.mode = "province";
  kqxsState.province = provinceId;
  kqxsState.zoom = "";
  clearPoll();
  const root = document.getElementById("kqxsContent");
  if (root) root.innerHTML = `<div class="kqxsLoading">Đang tải 3 kỳ gần nhất...</div>`;
  try {
    const data = await apiFetch("kqxs_province", { province: provinceId, limit: 3 });
    kqxsState.data = data;
    kqxsState.today = data.today || vnToday();
    render();
    document.getElementById("kqxsContent")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    if (root) root.innerHTML = `<div class="kqxsError">${esc(err.message || "Không tải được KQXS tỉnh.")}</div>`;
  } finally {
    kqxsState.loading = false;
  }
}

async function load(options = {}) {
  if (kqxsState.loading) return;
  kqxsState.loading = true;
  kqxsState.mode = "hub";
  kqxsState.province = "";
  const root = document.getElementById("kqxsContent");
  if (!options.silent && root) {
    root.innerHTML = `<div class="kqxsLoading">Đang tải kết quả xổ số...</div>`;
  }
  try {
    const params = {};
    if (kqxsState.date) params.date = kqxsState.date;
    const data = await apiFetch("kqxs_hub", params);
    kqxsState.data = data;
    kqxsState.today = data.today || vnToday();
    kqxsState.date = data.date || kqxsState.today;
    render();
    clearPoll();
    if (data.active) {
      kqxsState.pollTimer = setInterval(() => load({ silent: true }), 20000);
    }
  } catch (err) {
    if (root) root.innerHTML = `<div class="kqxsError">${esc(err.message || "Không tải được KQXS.")}</div>`;
    clearPoll();
  } finally {
    kqxsState.loading = false;
  }
}

function clearPoll() {
  if (kqxsState.pollTimer) {
    clearInterval(kqxsState.pollTimer);
    kqxsState.pollTimer = null;
  }
}

function bindGlobal() {
  document.getElementById("kqxsNavToggle")?.addEventListener("click", () => {
    document.getElementById("kqxsNav")?.classList.toggle("is-open");
  });

  document.querySelectorAll("[data-province]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const id = el.getAttribute("data-province");
      if (!id) return;
      loadProvince(id);
      document.getElementById("kqxsNav")?.classList.remove("is-open");
    });
  });

  document.querySelectorAll("[data-jump]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const jump = el.getAttribute("data-jump");
      if (!jump) return;
      if (el.getAttribute("data-quick")) {
        e.preventDefault();
        const mode = el.getAttribute("data-quick");
        const today = kqxsState.today || vnToday();
        kqxsState.mode = "hub";
        kqxsState.province = "";
        if (mode === "yesterday") {
          kqxsState.quickMode = "yesterday";
          kqxsState.date = shiftDate(today, -1);
        } else {
          kqxsState.quickMode = "today";
          kqxsState.date = "";
        }
        kqxsState.view = jump === "all" ? "all" : jump;
        load().then(() => jumpTo(jump));
        return;
      }
      e.preventDefault();
      if (kqxsState.mode === "province") {
        kqxsState.date = "";
        kqxsState.quickMode = "today";
        load().then(() => jumpTo(jump));
      } else {
        jumpTo(jump);
      }
    });
  });

  document.querySelectorAll("[data-quick]").forEach((el) => {
    if (el.hasAttribute("data-jump")) return;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      setQuick(el.getAttribute("data-quick"));
    });
  });

  document.querySelectorAll("[data-scroll]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const mode = el.getAttribute("data-scroll");
      if (mode === "loto") {
        if (kqxsState.mode === "province") {
          document.getElementById("loto-p0")?.scrollIntoView({ behavior: "smooth" });
        } else {
          const first = kqxsState.view === "all" ? "mb" : kqxsState.view;
          document.getElementById(`loto-${first}`)?.scrollIntoView({ behavior: "smooth" });
        }
      } else {
        document.getElementById("kqxsContent")?.scrollIntoView({ behavior: "smooth" });
      }
    });
  });

  document.getElementById("kqxsRegionSelect")?.addEventListener("change", (e) => {
    const view = e.target.value || "all";
    if (kqxsState.mode === "province") {
      kqxsState.quickMode = "today";
      kqxsState.date = "";
      kqxsState.view = view;
      load().then(() => jumpTo(view));
      return;
    }
    kqxsState.view = view;
    render();
    jumpTo(kqxsState.view);
  });

  document.getElementById("kqxsDate")?.addEventListener("change", (e) => {
    const ymd = String(e.target.value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    kqxsState.mode = "hub";
    kqxsState.province = "";
    kqxsState.quickMode = "date";
    kqxsState.date = ymd;
    load();
  });

  document.getElementById("kqxsRefresh")?.addEventListener("click", () => {
    if (kqxsState.mode === "province" && kqxsState.province) loadProvince(kqxsState.province);
    else load();
  });
}

function init() {
  kqxsState.today = vnToday();
  kqxsState.date = "";
  const dateInput = document.getElementById("kqxsDate");
  if (dateInput) dateInput.max = kqxsState.today;
  fillSideLists();
  bindGlobal();
  updateChrome();
  load();
}

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("beforeunload", clearPoll);
