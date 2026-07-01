import {
  APP_VERSION,
  SESSION_TTL_MS,
  normalizeName,
  parsePermissions,
  hasPermission,
  json
} from "./utils.js";

export async function hashPassword(password, pepper) {
  const raw = pepper + String(password || "");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ROLE_USERS = [
  { username: "admin", display_name: "Admin", permissions: "all", password: "dufc2026" },
  { username: "anhphuong", display_name: "Anh Phuong", permissions: "manage_roster,manage_sponsors,roster_import,lineup_split,lineup_cap,export,match_result,cancel_match", password: "dufc2026" },
  { username: "chikha", display_name: "Chi Kha", permissions: "manage_roster,manage_sponsors,roster_import,lineup_split,lineup_cap,export,match_result,cancel_match", password: "dufc2026" },
  { username: "thangphan", display_name: "Thang Phan", permissions: "lineup_team_a,match_result_a", password: "dufc2026" },
  { username: "minhphat", display_name: "Minh Phat", permissions: "lineup_team_b,match_result_b", password: "dufc2026" },
  { username: "tuongbang", display_name: "Tuong Bang", permissions: "lineup_cap_hlv", password: "dufc2026" }
];

export async function ensureDefaultAdmin(db, pepper) {
  for (const user of ROLE_USERS) {
    const row = await db.prepare("SELECT username FROM admin_users WHERE username = ?").bind(user.username).first();
    if (row) continue;
    const hash = await hashPassword(user.password, pepper);
    await db.prepare(
      "INSERT INTO admin_users (username, password_hash, display_name, permissions, active) VALUES (?, ?, ?, ?, 1)"
    ).bind(user.username, hash, user.display_name, user.permissions).run();
  }
}

export async function pruneExpiredSessions(db) {
  const now = new Date().toISOString();
  await db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").bind(now).run();
}

export async function getSessionByToken(db, token) {
  const clean = String(token || "").trim();
  if (!clean) return null;
  const row = await db.prepare("SELECT * FROM admin_sessions WHERE token = ?").bind(clean).first();
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) return null;
  return {
    token: clean,
    username: row.username,
    permissions: parsePermissions(row.permissions),
    expires_at: row.expires_at
  };
}

export async function requireAuth(db, token, requiredPermissions) {
  const session = await getSessionByToken(db, token);
  if (!session) throw new Error("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
  if (!hasPermission(session.permissions, requiredPermissions)) {
    throw new Error("Tài khoản không có quyền thực hiện thao tác này.");
  }
  return session;
}

export async function createSession(db, user) {
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  await db.prepare(
    "INSERT INTO admin_sessions (token, username, permissions, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(token, user.username, user.permissions.join(","), expiresAt, now.toISOString()).run();
  await pruneExpiredSessions(db);
  return { token, expires_at: expiresAt, permissions: user.permissions };
}

export async function adminLogin(db, payload, pepper) {
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");
  if (!username || !password) throw new Error("username và password là bắt buộc");

  const users = await db.prepare("SELECT * FROM admin_users").all();
  const key = normalizeName(username);
  const user = (users.results || []).find((u) => normalizeName(u.username) === key);
  if (!user || !user.active) throw new Error("Sai tên đăng nhập hoặc mật khẩu.");

  const hash = await hashPassword(password, pepper);
  if (user.password_hash !== hash) throw new Error("Sai tên đăng nhập hoặc mật khẩu.");

  const session = await createSession(db, {
    username: user.username,
    permissions: parsePermissions(user.permissions)
  });

  return {
    ok: true,
    version: APP_VERSION,
    token: session.token,
    expires_at: session.expires_at,
    username: user.username,
    display_name: user.display_name || user.username,
    permissions: session.permissions
  };
}

export async function adminLogout(db, token) {
  const clean = String(token || "").trim();
  if (clean) await db.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(clean).run();
  return { ok: true, version: APP_VERSION };
}

export async function adminValidateSession(db, token) {
  const session = await getSessionByToken(db, token);
  if (!session) return { ok: true, version: APP_VERSION, valid: false };

  const user = await db.prepare("SELECT * FROM admin_users WHERE username = ?").bind(session.username).first();
  if (!user || !user.active) return { ok: true, version: APP_VERSION, valid: false };

  const permissions = parsePermissions(user.permissions);
  if (permissions.join(",") !== (session.permissions || []).join(",")) {
    await db.prepare("UPDATE admin_sessions SET permissions = ? WHERE token = ?")
      .bind(permissions.join(","), session.token).run();
  }
  return {
    ok: true,
    version: APP_VERSION,
    valid: true,
    username: user.username,
    display_name: user.display_name || user.username,
    permissions,
    expires_at: session.expires_at
  };
}

export async function adminListUsers(db) {
  const rows = await db.prepare("SELECT username, display_name, permissions, active FROM admin_users").all();
  const users = (rows.results || []).map((u) => ({
    username: u.username,
    display_name: u.display_name,
    permissions: parsePermissions(u.permissions),
    active: !!u.active
  }));
  return { ok: true, version: APP_VERSION, users };
}

export async function adminSaveUser(db, payload, pepper) {
  const username = String(payload.username || "").trim();
  if (!username) throw new Error("username is required");

  const displayName = String(payload.display_name || username).trim();
  const permissions = parsePermissions(payload.permissions).join(",");
  const active = payload.active === false ? 0 : 1;
  const password = String(payload.password || "");

  const existing = await db.prepare("SELECT username FROM admin_users WHERE username = ?").bind(username).first();
  if (existing) {
    if (password) {
      const hash = await hashPassword(password, pepper);
      await db.prepare(
        "UPDATE admin_users SET display_name = ?, permissions = ?, active = ?, password_hash = ? WHERE username = ?"
      ).bind(displayName, permissions, active, hash, username).run();
    } else {
      await db.prepare(
        "UPDATE admin_users SET display_name = ?, permissions = ?, active = ? WHERE username = ?"
      ).bind(displayName, permissions, active, username).run();
    }
  } else {
    if (!password) throw new Error("Mật khẩu bắt buộc khi tạo tài khoản mới.");
    const hash = await hashPassword(password, pepper);
    await db.prepare(
      "INSERT INTO admin_users (username, password_hash, display_name, permissions, active) VALUES (?, ?, ?, ?, ?)"
    ).bind(username, hash, displayName, permissions, active).run();
  }
  return { ok: true, version: APP_VERSION, username };
}

export async function adminDeleteUser(db, session, username) {
  const target = String(username || "").trim();
  if (!target) throw new Error("username is required");
  if (normalizeName(target) === normalizeName(session.username)) {
    throw new Error("Không thể xóa tài khoản đang đăng nhập.");
  }
  await db.prepare("DELETE FROM admin_users WHERE username = ?").bind(target).run();
  return { ok: true, version: APP_VERSION, username: target };
}
