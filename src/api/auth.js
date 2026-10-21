/*
 * Autentifikatsiya (M1.1, X1) va foydalanuvchilar (M1.9, M10.4).
 * OneID/ERI integratsiyasi I10 adapteri orqali ulanadi; hozircha lokal login + TOTP 2FA.
 */
"use strict";
const C = require("../auth/crypto");
const { ROLES, PERMS, can, mfaRequired, needsMfa } = require("../auth/rbac");
const audit = require("../db/audit");
const { now, newId } = require("../db/db");
const { HttpError, bad, forbidden, notFound } = require("../http/app");
const { clean } = require("../http/validate");

const COOKIE = "uzc_sess";
const MAX_ATTEMPTS = 10, WINDOW_MIN = 15;

function publicUser(u, config) {
  return {
    id: u.id, login: u.login, name: u.name, role: u.role, roleName: ROLES[u.role]?.name, operatorId: u.operator_id,
    verifierId: u.verifier_id, importerId: u.importer_id, totpEnabled: !!u.totp_enabled,
    mfaRequired: mfaRequired(u.role, config.MFA_ENFORCE), perms: PERMS[u.role] || [],
  };
}
function setCookie(ctx, token, maxAgeSec) {
  const secure = ctx.s.config.SECURE_COOKIES ? "; Secure" : "";
  ctx.res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${secure}`);
}
function tooManyAttempts(db, key) {
  const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
  db.run("DELETE FROM login_attempts WHERE at < ?", since);
  return db.get("SELECT COUNT(*) AS c FROM login_attempts WHERE key = ? AND at >= ?", key, since).c >= MAX_ATTEMPTS;
}

function register(app) {
  const { db, config } = app.s;

  app.post("/api/auth/login", { auth: false }, ctx => {
    const b = clean(ctx.body, { login: { t: "str", req: true, max: 80 }, password: { t: "str", req: true, max: 200 } });
    const key = `${ctx.ip}|${b.login.toLowerCase()}`;
    if (tooManyAttempts(db, key)) throw new HttpError(429, `Juda ko'p urinish. ${WINDOW_MIN} daqiqadan so'ng qayta urinib ko'ring.`);
    const u = db.get("SELECT * FROM users WHERE lower(login) = lower(?) AND disabled = 0", b.login);
    if (!u || !C.verifyPassword(b.password, u.password_hash)) {
      db.run("INSERT INTO login_attempts (key, at) VALUES (?, ?)", key, now());
      audit.log(db, { actor: b.login, action: "auth.login_failed", ip: ctx.ip });
      throw new HttpError(401, "Login yoki parol noto'g'ri.");
    }
    const token = C.randomToken();
    const needMfa = needsMfa(u, config.MFA_ENFORCE);
    const exp = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600e3).toISOString();
    db.run("INSERT INTO sessions (id, user_id, mfa_ok, created_at, expires_at, ip) VALUES (?,?,?,?,?,?)", C.sha256(token), u.id, needMfa ? 0 : 1, now(), exp, ctx.ip);
    setCookie(ctx, token, config.SESSION_TTL_HOURS * 3600);
    audit.log(db, { actor: u.id, role: u.role, action: "auth.login", ip: ctx.ip });
    return { user: publicUser(u, config), mfa: needMfa ? (u.totp_enabled ? "verify" : "setup") : null };
  });

  app.post("/api/auth/logout", { auth: false }, ctx => {
    if (ctx.session) db.run("DELETE FROM sessions WHERE id = ?", ctx.session.id);
    setCookie(ctx, "", 0);
    return { ok: true };
  });

  app.get("/api/auth/me", { auth: false }, ctx => {
    if (!ctx.user) return { user: null };
    const needMfa = needsMfa(ctx.user, config.MFA_ENFORCE);
    return { user: publicUser(ctx.user, config), mfa: needMfa && !ctx.session.mfa_ok ? (ctx.user.totp_enabled ? "verify" : "setup") : null };
  });

  // 2FA: kodni tekshirish
  app.post("/api/auth/mfa", { mfaPending: true }, ctx => {
    const b = clean(ctx.body, { code: { t: "str", req: true, max: 6, re: /^\d{6}$/, msg: "Kod 6 ta raqam bo'lishi kerak." } });
    const u = ctx.user;
    if (!u.totp_enabled) throw bad("2FA hali sozlanmagan.");
    const key = `mfa|${u.id}`;
    if (tooManyAttempts(db, key)) throw new HttpError(429, "Juda ko'p noto'g'ri kod. Keyinroq urinib ko'ring.");
    const step = C.verifyTotp(u.totp_secret, b.code, u.totp_last_step);
    if (step == null) { db.run("INSERT INTO login_attempts (key, at) VALUES (?, ?)", key, now()); throw new HttpError(401, "Kod noto'g'ri yoki eskirgan."); }
    db.run("UPDATE users SET totp_last_step = ? WHERE id = ?", step, u.id);
    db.run("UPDATE sessions SET mfa_ok = 1 WHERE id = ?", ctx.session.id);
    audit.log(db, { actor: u.id, role: u.role, action: "auth.mfa_ok", ip: ctx.ip });
    return { ok: true };
  });

  // 2FA sozlash: yangi maxfiy kalit (faqat hali yoqilmagan bo'lsa)
  app.post("/api/auth/mfa/setup", { mfaPending: true }, ctx => {
    const u = ctx.user;
    if (u.totp_enabled && !ctx.session.mfa_ok) throw forbidden("Avval joriy kod bilan tasdiqlang.");
    const secret = C.newTotpSecret();
    db.run("UPDATE users SET totp_secret = ?, totp_enabled = 0, updated_at = ? WHERE id = ?", secret, now(), u.id);
    return { secret, uri: C.otpauthUri(secret, u.login) };
  });
  app.post("/api/auth/mfa/enable", { mfaPending: true }, ctx => {
    const b = clean(ctx.body, { code: { t: "str", req: true, re: /^\d{6}$/, msg: "Kod 6 ta raqam bo'lishi kerak." } });
    const u = db.get("SELECT * FROM users WHERE id = ?", ctx.user.id);
    if (!u.totp_secret) throw bad("Avval maxfiy kalit yarating.");
    const step = C.verifyTotp(u.totp_secret, b.code, null);
    if (step == null) throw new HttpError(401, "Kod noto'g'ri. Ilovadagi vaqt to'g'riligini tekshiring.");
    db.run("UPDATE users SET totp_enabled = 1, totp_last_step = ?, updated_at = ? WHERE id = ?", step, now(), u.id);
    db.run("UPDATE sessions SET mfa_ok = 1 WHERE id = ?", ctx.session.id);
    audit.log(db, { actor: u.id, role: u.role, action: "auth.mfa_enabled", ip: ctx.ip });
    return { ok: true };
  });

  app.post("/api/auth/password", {}, ctx => {
    const b = clean(ctx.body, { current: { t: "str", req: true, max: 200 }, next: { t: "str", req: true, max: 200 } });
    if (!C.verifyPassword(b.current, ctx.user.password_hash)) throw new HttpError(401, "Joriy parol noto'g'ri.");
    const p = C.passwordProblem(b.next); if (p) throw bad(p);
    db.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", C.hashPassword(b.next), now(), ctx.user.id);
    db.run("DELETE FROM sessions WHERE user_id = ? AND id <> ?", ctx.user.id, ctx.session.id);
    audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action: "auth.password_changed", ip: ctx.ip });
    return { ok: true };
  });

  /* ---------- Foydalanuvchilar ---------- */
  const EXPORTER_ROLES = ["exporter_admin", "exporter_specialist"];
  const userSchema = {
    login: { t: "str", req: true, max: 60, re: /^[a-z0-9._-]{3,60}$/i, msg: "Login: 3–60 belgi (lotin harflari, raqam, . _ -)." },
    name: { t: "str", req: true, max: 120 },
    role: { t: "enum", req: true, vals: Object.keys(ROLES) },
    operatorId: { t: "str", max: 60 }, verifierId: { t: "str", max: 60 }, importerId: { t: "str", max: 60 },
    password: { t: "str", req: true, max: 200 },
  };

  app.get("/api/users", { perm: ["users.manage_all", "users.manage_own"] }, ctx => {
    const own = !can(ctx.user, "users.manage_all");
    const rows = own ? db.all("SELECT * FROM users WHERE operator_id = ? ORDER BY login", ctx.user.operator_id) : db.all("SELECT * FROM users ORDER BY login");
    return rows.map(u => ({ ...publicUser(u, config), disabled: !!u.disabled, createdAt: u.created_at, perms: undefined }));
  });
  app.get("/api/roles", {}, () => Object.entries(ROLES).map(([k, v]) => ({ key: k, ...v, perms: PERMS[k] })));

  app.post("/api/users", { perm: ["users.manage_all", "users.manage_own"] }, ctx => {
    const b = clean(ctx.body, userSchema);
    const own = !can(ctx.user, "users.manage_all");
    if (own) {
      if (!EXPORTER_ROLES.includes(b.role)) throw forbidden("Korxona administratori faqat korxona foydalanuvchilarini qo'sha oladi.");
      b.operatorId = ctx.user.operator_id;
    }
    if (EXPORTER_ROLES.includes(b.role) && !(b.operatorId && db.get("SELECT id FROM operators WHERE id = ?", b.operatorId))) throw bad("Korxona foydalanuvchisi uchun korxona tanlanishi shart.");
    if (b.role === "verifier" && !(b.verifierId && db.get("SELECT id FROM verifiers WHERE id = ?", b.verifierId))) throw bad("Verifikator foydalanuvchisi verifikatorlar reyestridagi tashkilotga bog'lanishi shart.");
    if (b.role === "importer" && !(b.importerId && db.get("SELECT id FROM importers WHERE id = ?", b.importerId))) throw bad("Importyor foydalanuvchisi importyorga bog'lanishi shart.");
    const p = C.passwordProblem(b.password); if (p) throw bad(p);
    if (db.get("SELECT id FROM users WHERE lower(login) = lower(?)", b.login)) throw bad("Bu login band.");
    const id = newId("usr"), t = now();
    db.run(`INSERT INTO users (id, login, name, role, operator_id, verifier_id, importer_id, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id, b.login, b.name, b.role, EXPORTER_ROLES.includes(b.role) ? b.operatorId : null, b.role === "verifier" ? b.verifierId : null,
      b.role === "importer" ? b.importerId : null, C.hashPassword(b.password), t, t);
    audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action: "user.create", entity: "user", entityId: id, after: { login: b.login, role: b.role, operatorId: b.operatorId } });
    return publicUser(db.get("SELECT * FROM users WHERE id = ?", id), config);
  });

  app.patch("/api/users/:id", { perm: ["users.manage_all", "users.manage_own"] }, ctx => {
    const u = db.get("SELECT * FROM users WHERE id = ?", ctx.params.id);
    if (!u) throw notFound();
    const own = !can(ctx.user, "users.manage_all");
    if (own && u.operator_id !== ctx.user.operator_id) throw forbidden();
    const b = clean(ctx.body, { name: { t: "str", max: 120 }, disabled: { t: "bool" }, resetMfa: { t: "bool" }, password: { t: "str", max: 200 } }, { partial: true });
    if (u.id === ctx.user.id && b.disabled) throw bad("O'zingizni bloklay olmaysiz.");
    if (b.password) { const p = C.passwordProblem(b.password); if (p) throw bad(p); }
    db.tx(() => {
      if (b.name) db.run("UPDATE users SET name = ?, updated_at = ? WHERE id = ?", b.name, now(), u.id);
      if (b.disabled != null) { db.run("UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?", b.disabled ? 1 : 0, now(), u.id); if (b.disabled) db.run("DELETE FROM sessions WHERE user_id = ?", u.id); }
      if (b.resetMfa) db.run("UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL, updated_at = ? WHERE id = ?", now(), u.id);
      if (b.password) { db.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", C.hashPassword(b.password), now(), u.id); db.run("DELETE FROM sessions WHERE user_id = ?", u.id); }
      audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action: "user.update", entity: "user", entityId: u.id, after: { ...b, password: b.password ? "***" : undefined } });
    });
    return publicUser(db.get("SELECT * FROM users WHERE id = ?", u.id), config);
  });
}

module.exports = { register, publicUser };
