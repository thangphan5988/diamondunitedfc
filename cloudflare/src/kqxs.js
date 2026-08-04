import { APP_VERSION, json } from "./utils.js";

const SOURCE_BASE = "https://api.383.im/lottery";
const CACHE_PREFIX = "kqxs:v1:";
const TTL = {
  live: 45,
  liveIdle: 180,
  region: 900
};

const REGION_LABELS = {
  mb: "Miền Bắc",
  mt: "Miền Trung",
  mn: "Miền Nam"
};

const WEEKDAY_VI = {
  mon: "Thứ Hai",
  tue: "Thứ Ba",
  wed: "Thứ Tư",
  thu: "Thứ Năm",
  fri: "Thứ Sáu",
  sat: "Thứ Bảy",
  sun: "Chủ Nhật"
};

const PROVINCE_NAMES = {
  "ha-noi": "Hà Nội",
  "thai-binh": "Thái Bình",
  "nam-dinh": "Nam Định",
  "quang-ninh": "Quảng Ninh",
  "bac-ninh": "Bắc Ninh",
  "hai-phong": "Hải Phòng",
  "hung-yen": "Hưng Yên",
  "ha-nam": "Hà Nam",
  "hai-duong": "Hải Dương",
  "ninh-binh": "Ninh Bình",
  "phu-tho": "Phú Thọ",
  "hoa-binh": "Hòa Bình",
  "tp-hcm": "TP. Hồ Chí Minh",
  "dong-thap": "Đồng Tháp",
  "ca-mau": "Cà Mau",
  "ben-tre": "Bến Tre",
  "vung-tau": "Vũng Tàu",
  "bac-lieu": "Bạc Liêu",
  "dong-nai": "Đồng Nai",
  "can-tho": "Cần Thơ",
  "soc-trang": "Sóc Trăng",
  "tay-ninh": "Tây Ninh",
  "an-giang": "An Giang",
  "binh-thuan": "Bình Thuận",
  "vinh-long": "Vĩnh Long",
  "binh-duong": "Bình Dương",
  "tra-vinh": "Trà Vinh",
  "long-an": "Long An",
  "binh-phuoc": "Bình Phước",
  "hau-giang": "Hậu Giang",
  "tien-giang": "Tiền Giang",
  "kien-giang": "Kiên Giang",
  "lam-dong": "Lâm Đồng",
  "da-lat": "Đà Lạt",
  "phu-yen": "Phú Yên",
  "thua-thien-hue": "Thừa Thiên Huế",
  "dak-lak": "Đắk Lắk",
  "quang-nam": "Quảng Nam",
  "da-nang": "Đà Nẵng",
  "khanh-hoa": "Khánh Hòa",
  "binh-dinh": "Bình Định",
  "quang-tri": "Quảng Trị",
  "quang-binh": "Quảng Bình",
  "gia-lai": "Gia Lai",
  "ninh-thuan": "Ninh Thuận",
  "quang-ngai": "Quảng Ngãi",
  "dak-nong": "Đắk Nông",
  "kon-tum": "Kon Tum"
};

const MB_PRIZE_ORDER = [
  { key: "db", label: "Đặc biệt" },
  { key: "g1", label: "Giải nhất" },
  { key: "g2", label: "Giải nhì" },
  { key: "g3", label: "Giải ba" },
  { key: "g4", label: "Giải tư" },
  { key: "g5", label: "Giải năm" },
  { key: "g6", label: "Giải sáu" },
  { key: "g7", label: "Giải bảy" }
];

const SOUTH_PRIZE_ORDER = [
  { key: "g8", label: "Giải tám" },
  { key: "g7", label: "Giải bảy" },
  { key: "g6", label: "Giải sáu" },
  { key: "g5", label: "Giải năm" },
  { key: "g4", label: "Giải tư" },
  { key: "g3", label: "Giải ba" },
  { key: "g2", label: "Giải nhì" },
  { key: "g1", label: "Giải nhất" },
  { key: "db", label: "Đặc biệt" }
];

function vnTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function weekdayFromYmd(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 5, 0, 0));
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return keys[d.getUTCDay()] || "";
}

function provinceName(id) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) return "";
  if (PROVINCE_NAMES[key]) return PROVINCE_NAMES[key];
  return key
    .split("-")
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : ""))
    .join(" ");
}

function asNumberList(value) {
  if (Array.isArray(value)) return value.map((n) => String(n || "").trim()).filter(Boolean);
  if (value == null || value === "") return [];
  return [String(value).trim()].filter(Boolean);
}

function prizeRows(order, bag) {
  const src = bag || {};
  return order.map(({ key, label }) => ({
    key,
    label,
    numbers: asNumberList(src[key])
  }));
}

function collectLoto(numbers) {
  const set = new Set();
  for (const n of numbers || []) {
    const digits = String(n).replace(/\D/g, "");
    if (digits.length >= 2) set.add(digits.slice(-2));
  }
  return [...set].sort((a, b) => a.localeCompare(b, "vi"));
}

function lotoHeadTail(lotoList) {
  const heads = Array.from({ length: 10 }, () => []);
  const tails = Array.from({ length: 10 }, () => []);
  for (const pair of lotoList || []) {
    const h = Number(pair[0]);
    const t = Number(pair[1]);
    if (Number.isFinite(h)) heads[h].push(pair);
    if (Number.isFinite(t)) tails[t].push(pair);
  }
  return { heads, tails };
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
      /* ignore */
    }
  }
  const data = await loader();
  if (kv) {
    try {
      await kv.put(
        cacheKey,
        JSON.stringify({ expires: Date.now() + ttlSec * 1000, data }),
        { expirationTtl: Math.max(60, ttlSec + 120) }
      );
    } catch (_) {
      /* ignore */
    }
  }
  return data;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DUFC-KQXS/1.0 (+https://diamondunitedfc.com)"
    },
    cf: { cacheTtl: 30, cacheEverything: true }
  });
  if (!res.ok) throw new Error(`Không tải được KQXS (${res.status})`);
  return res.json();
}

function normalizeMbBoard(item) {
  const date = String(item?.d || "").trim();
  const weekday = item?.w || weekdayFromYmd(date);
  const drawId = item?.draw_i || item?.pr?.draw_i || "";
  const rows = prizeRows(MB_PRIZE_ORDER, item?.pr || {});
  const allNums = rows.flatMap((r) => r.numbers);
  const loto = collectLoto(allNums);
  return {
    region: "mb",
    region_label: REGION_LABELS.mb,
    date,
    weekday,
    weekday_label: WEEKDAY_VI[weekday] || "",
    state: item?.state || "complete",
    stations: [
      {
        id: drawId || "mien-bac",
        name: provinceName(drawId) || "Miền Bắc",
        prizes: rows,
        loto,
        loto_table: lotoHeadTail(loto)
      }
    ]
  };
}

function normalizeMultiBoard(region, item) {
  const date = String(item?.d || "").trim();
  const weekday = item?.w || weekdayFromYmd(date);
  const stations = (item?.ps || []).map((p) => {
    const rows = prizeRows(SOUTH_PRIZE_ORDER, p?.g || {});
    const allNums = rows.flatMap((r) => r.numbers);
    const loto = collectLoto(allNums);
    return {
      id: p.i,
      name: provinceName(p.i),
      prizes: rows,
      loto,
      loto_table: lotoHeadTail(loto)
    };
  });
  return {
    region,
    region_label: REGION_LABELS[region] || region,
    date,
    weekday,
    weekday_label: WEEKDAY_VI[weekday] || "",
    state: item?.state || "complete",
    stations
  };
}

function boardFromLiveRegion(region, payload) {
  const block = payload?.[region];
  if (!block) return null;
  if (region === "mb") {
    return normalizeMbBoard({
      d: block.d || payload.d,
      w: weekdayFromYmd(block.d || payload.d),
      draw_i: block.draw_i,
      pr: block.pr,
      state: block.state
    });
  }
  return normalizeMultiBoard(region, {
    d: block.d || payload.d,
    w: weekdayFromYmd(block.d || payload.d),
    ps: block.ps,
    state: block.state
  });
}

async function fetchLiveRaw(kv) {
  return getCached(kv, "live", TTL.live, () => fetchJson(`${SOURCE_BASE}/live.json`));
}

async function fetchRegionItems(kv, region) {
  const id = String(region || "").toLowerCase();
  if (!REGION_LABELS[id]) throw new Error("region phải là mb, mt hoặc mn");
  const data = await getCached(kv, `region:${id}`, TTL.region, () =>
    fetchJson(`${SOURCE_BASE}/region/${id}.json`)
  );
  return Array.isArray(data?.items) ? data.items : [];
}

function findRegionItem(items, date) {
  const ymd = String(date || "").trim();
  return (items || []).find((it) => String(it.d || "") === ymd) || null;
}

function normalizeDateParam(value) {
  const s = String(value || "").trim();
  if (!s || s === "today" || s === "latest") return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("date phải dạng YYYY-MM-DD");
  return s;
}

export async function kqxsLive(env) {
  const kv = env.AVATARS;
  const raw = await fetchLiveRaw(kv);
  const active = !!raw?.active;
  const date = String(raw?.d || vnTodayYmd());
  return {
    ok: true,
    version: APP_VERSION,
    source: "383.im",
    date,
    active,
    live_region: raw?.region || null,
    updated_at: raw?.updated_at || null,
    schedule: {
      start: raw?.start || null,
      end: raw?.end || null,
      next: raw?.next || null
    },
    regions: {
      mb: boardFromLiveRegion("mb", raw),
      mt: boardFromLiveRegion("mt", raw),
      mn: boardFromLiveRegion("mn", raw)
    }
  };
}

export async function kqxsResults(env, params = {}) {
  const kv = env.AVATARS;
  const date = normalizeDateParam(params.date);
  const today = vnTodayYmd();
  const live = await kqxsLive(env);
  const liveDate = String(live.date || today);

  // Mặc định / latest: luôn lấy bản live (có thể vẫn là ngày hôm trước trước giờ quay)
  if (!date) {
    return {
      ok: true,
      version: APP_VERSION,
      source: live.source,
      date: liveDate,
      from_live: true,
      active: live.active,
      updated_at: live.updated_at,
      schedule: live.schedule,
      regions: live.regions
    };
  }

  if (date === liveDate) {
    return {
      ok: true,
      version: APP_VERSION,
      source: live.source,
      date,
      from_live: true,
      active: live.active,
      updated_at: live.updated_at,
      schedule: live.schedule,
      regions: live.regions
    };
  }

  const [mbItems, mtItems, mnItems] = await Promise.all([
    fetchRegionItems(kv, "mb"),
    fetchRegionItems(kv, "mt"),
    fetchRegionItems(kv, "mn")
  ]);

  const mbItem = findRegionItem(mbItems, date);
  const mtItem = findRegionItem(mtItems, date);
  const mnItem = findRegionItem(mnItems, date);

  if (!mbItem && !mtItem && !mnItem) {
    return {
      ok: true,
      version: APP_VERSION,
      source: "383.im",
      date,
      from_live: false,
      active: false,
      updated_at: null,
      regions: { mb: null, mt: null, mn: null },
      empty: true,
      message: `Chưa có kết quả ngày ${date}`
    };
  }

  return {
    ok: true,
    version: APP_VERSION,
    source: "383.im",
    date,
    from_live: false,
    active: false,
    updated_at: null,
    regions: {
      mb: mbItem ? normalizeMbBoard(mbItem) : null,
      mt: mtItem ? normalizeMultiBoard("mt", mtItem) : null,
      mn: mnItem ? normalizeMultiBoard("mn", mnItem) : null
    }
  };
}

export async function kqxsHub(env, params = {}) {
  const results = await kqxsResults(env, params);
  const today = vnTodayYmd();
  return {
    ...results,
    today,
    region_labels: REGION_LABELS,
    prize_orders: {
      mb: MB_PRIZE_ORDER,
      mt: SOUTH_PRIZE_ORDER,
      mn: SOUTH_PRIZE_ORDER
    }
  };
}
