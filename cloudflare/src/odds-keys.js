/** Rotate The Odds API keys when one is out of credits / invalid */

const DEAD_PREFIX = "odds:key:dead:";
const CURSOR_KEY = "odds:keys:cursor";
const QUOTA_FLAG_KEY = "odds:quota_blocked_until";
const ADMIN_KEYS_KV = "odds:keys:admin";
const DEAD_TTL_SEC = 40 * 24 * 3600; // ~tháng free tier
const QUOTA_BLOCK_MS = 6 * 3600 * 1000;

export function isQuotaErrorMessage(msg) {
  const s = String(msg || "");
  return /OUT_OF_USAGE|hết quota|usage credits|quota The Odds/i.test(s);
}

export function isInvalidKeyMessage(msg) {
  const s = String(msg || "");
  return /INVALID_KEY|không hợp lệ/i.test(s);
}

export function shouldRotateOddsKey(msg) {
  return isQuotaErrorMessage(msg) || isInvalidKeyMessage(msg);
}

export function keyFingerprint(key) {
  let h = 2166136261;
  const s = String(key || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function maskOddsKey(key) {
  const s = String(key || "").trim();
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function parseOddsKeysText(raw) {
  return [...new Set(
    String(raw || "")
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  )];
}

function envOddsKeys(env) {
  const multi = String(env?.ODDS_API_KEYS || "").trim();
  const single = String(env?.ODDS_API_KEY || "").trim();
  return parseOddsKeysText(`${multi}\n${single}`);
}

export async function loadAdminOddsKeys(kv) {
  if (!kv) return [];
  try {
    const raw = await kv.get(ADMIN_KEYS_KV);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parseOddsKeysText(parsed.join("\n"));
    if (typeof parsed === "string") return parseOddsKeysText(parsed);
    return [];
  } catch (_) {
    return [];
  }
}

export async function saveAdminOddsKeys(kv, keys) {
  if (!kv) throw new Error("KV chưa sẵn sàng.");
  const cleaned = parseOddsKeysText((keys || []).join("\n"));
  await kv.put(ADMIN_KEYS_KV, JSON.stringify(cleaned));
  for (const key of cleaned) {
    try {
      await kv.delete(DEAD_PREFIX + keyFingerprint(key));
    } catch (_) {
      /* ignore */
    }
  }
  await clearOddsQuotaBlocked(kv);
  return cleaned;
}

/** Admin keys first, then env secrets — deduped */
export async function listOddsApiKeys(env, kv) {
  const admin = await loadAdminOddsKeys(kv);
  const fromEnv = envOddsKeys(env);
  return [...new Set([...admin, ...fromEnv])];
}

async function isKeyDead(kv, key) {
  if (!kv) return false;
  try {
    const raw = await kv.get(DEAD_PREFIX + keyFingerprint(key));
    return Boolean(raw);
  } catch (_) {
    return false;
  }
}

async function markKeyDead(kv, key) {
  if (!kv || !key) return;
  try {
    await kv.put(DEAD_PREFIX + keyFingerprint(key), String(Date.now()), {
      expirationTtl: DEAD_TTL_SEC
    });
  } catch (_) {
    /* ignore */
  }
}

async function getCursor(kv, len) {
  if (!kv || len <= 0) return 0;
  try {
    const n = Number(await kv.get(CURSOR_KEY));
    if (!Number.isFinite(n)) return 0;
    return ((Math.trunc(n) % len) + len) % len;
  } catch (_) {
    return 0;
  }
}

async function setCursor(kv, index) {
  if (!kv) return;
  try {
    await kv.put(CURSOR_KEY, String(index), { expirationTtl: DEAD_TTL_SEC });
  } catch (_) {
    /* ignore */
  }
}

/** Keys still usable, starting from last successful cursor */
export async function getOrderedOddsApiKeys(env, kv) {
  const keys = await listOddsApiKeys(env, kv);
  if (!keys.length) return [];
  const cursor = await getCursor(kv, keys.length);
  const rotated = keys.slice(cursor).concat(keys.slice(0, cursor));
  const usable = [];
  for (const key of rotated) {
    if (!(await isKeyDead(kv, key))) usable.push(key);
  }
  return usable;
}

export async function isOddsQuotaBlocked(kv) {
  if (!kv) return false;
  try {
    const raw = await kv.get(QUOTA_FLAG_KEY);
    const until = Number(raw || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch (_) {
    return false;
  }
}

export async function markOddsQuotaBlocked(kv) {
  if (!kv) return;
  try {
    const until = Date.now() + QUOTA_BLOCK_MS;
    await kv.put(QUOTA_FLAG_KEY, String(until), {
      expirationTtl: Math.ceil(QUOTA_BLOCK_MS / 1000) + 60
    });
  } catch (_) {
    /* ignore */
  }
}

export async function clearOddsQuotaBlocked(kv) {
  if (!kv) return;
  try {
    await kv.delete(QUOTA_FLAG_KEY);
  } catch (_) {
    /* ignore */
  }
}

/**
 * Run Odds API call with automatic key rotation.
 * runner(apiKey) should throw on failure (quota/invalid/etc).
 */
export async function withOddsApiKey(env, kv, runner) {
  const keys = await listOddsApiKeys(env, kv);
  if (!keys.length) {
    throw new Error("Chưa cấu hình Odds API key (Admin hoặc secret Worker).");
  }

  let usable = await getOrderedOddsApiKeys(env, kv);
  if (!usable.length) {
    // All marked dead — try full list once in case monthly reset
    usable = keys.slice();
  }

  let lastErr = null;
  for (const key of usable) {
    try {
      const result = await runner(key);
      const idx = keys.indexOf(key);
      if (idx >= 0) await setCursor(kv, idx);
      await clearOddsQuotaBlocked(kv);
      return result;
    } catch (err) {
      lastErr = err;
      if (shouldRotateOddsKey(err?.message)) {
        await markKeyDead(kv, key);
        continue;
      }
      throw err;
    }
  }

  await markOddsQuotaBlocked(kv);
  throw lastErr || new Error("Đã hết tất cả Odds API key (quota).");
}

/** Admin: list keys (admin full text for edit + env masked) */
export async function adminListOddsKeys(env, kv) {
  const adminKeys = await loadAdminOddsKeys(kv);
  const envKeys = envOddsKeys(env);
  const blocked = await isOddsQuotaBlocked(kv);
  const items = [];
  for (const key of adminKeys) {
    items.push({
      id: keyFingerprint(key),
      hint: maskOddsKey(key),
      source: "admin",
      dead: await isKeyDead(kv, key),
      key
    });
  }
  for (const key of envKeys) {
    if (adminKeys.includes(key)) continue;
    items.push({
      id: keyFingerprint(key),
      hint: maskOddsKey(key),
      source: "env",
      dead: await isKeyDead(kv, key),
      key: null
    });
  }
  return {
    ok: true,
    quota_blocked: blocked,
    admin_count: adminKeys.length,
    env_count: envKeys.length,
    total: items.length,
    usable: items.filter((x) => !x.dead).length,
    admin_keys_text: adminKeys.join("\n"),
    keys: items
  };
}

export async function adminSaveOddsKeys(env, kv, payload = {}) {
  const fromList = Array.isArray(payload.keys) ? payload.keys : null;
  const fromText = payload.keys_text != null ? payload.keys_text : payload.text;
  const next = fromList
    ? parseOddsKeysText(fromList.join("\n"))
    : parseOddsKeysText(fromText);
  const saved = await saveAdminOddsKeys(kv, next);
  return {
    ok: true,
    message: `Đã lưu ${saved.length} Odds API key.`,
    ...(await adminListOddsKeys(env, kv))
  };
}
