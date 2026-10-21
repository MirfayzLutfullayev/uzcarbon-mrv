/*
 * Kichik HTTP freymvork: marshrutlar (:param), JSON tana, cookie-sessiya, CSRF, xavfsizlik sarlavhalari, statik fayllar.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { sha256 } = require("../auth/crypto");
const { can, needsMfa } = require("../auth/rbac");
const { now } = require("../db/db");

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (msg, extra) => new HttpError(400, msg, extra);
const forbidden = (msg = "Ruxsat yo'q.") => new HttpError(403, msg);
const notFound = (msg = "Topilmadi.") => new HttpError(404, msg);

const SEC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

function parseCookies(h) {
  const out = {};
  for (const part of String(h || "").split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new HttpError(413, "So'rov hajmi juda katta.")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

class App {
  /** @param {{db:any, config:any, publicDir:string}} s */
  constructor(s) {
    this.s = s;
    this.routes = [];
    this.server = http.createServer((req, res) => this.handle(req, res));
  }
  route(method, pattern, opts, handler) {
    if (typeof opts === "function") { handler = opts; opts = {}; }
    const keys = [];
    const re = new RegExp("^" + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return "/([^/]+)"; }) + "$");
    this.routes.push({ method, re, keys, opts: { auth: true, ...opts }, handler });
  }
  get(p, o, h) { this.route("GET", p, o, h); }
  post(p, o, h) { this.route("POST", p, o, h); }
  put(p, o, h) { this.route("PUT", p, o, h); }
  patch(p, o, h) { this.route("PATCH", p, o, h); }
  del(p, o, h) { this.route("DELETE", p, o, h); }

  /** Sessiya cookie sidan foydalanuvchini aniqlash. */
  loadSession(cookies) {
    const token = cookies.uzc_sess;
    if (!token) return {};
    const sess = this.s.db.get("SELECT * FROM sessions WHERE id = ?", sha256(token));
    if (!sess || sess.expires_at < now()) return {};
    const user = this.s.db.get("SELECT * FROM users WHERE id = ? AND disabled = 0", sess.user_id);
    if (!user) return {};
    return { session: sess, user };
  }

  async handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const ctx = { req, res, url, path: url.pathname, query: Object.fromEntries(url.searchParams), ip: req.socket.remoteAddress, s: this.s };
    try {
      if (!ctx.path.startsWith("/api/") && !ctx.path.startsWith("/share/")) return this.serveStatic(req, res, ctx.path);
      const route = this.routes.find(r => r.method === req.method && r.re.test(ctx.path));
      if (!route) {
        if (this.routes.some(r => r.re.test(ctx.path))) throw new HttpError(405, "Ruxsat etilmagan usul.");
        throw notFound();
      }
      const m = ctx.path.match(route.re);
      ctx.params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const cookies = parseCookies(req.headers.cookie);
      Object.assign(ctx, this.loadSession(cookies));

      // CSRF: holatni o'zgartiruvchi so'rovlar faqat ilovaning o'zidan (maxsus sarlavha + SameSite=Strict cookie).
      if (req.method !== "GET" && req.method !== "HEAD" && req.headers["x-uzc"] !== "1") throw forbidden("So'rov manbasi tasdiqlanmadi (CSRF).");

      const o = route.opts;
      if (o.auth) {
        if (!ctx.user) throw new HttpError(401, "Tizimga kiring.");
        const needMfa = needsMfa(ctx.user, this.s.config.MFA_ENFORCE);
        if (needMfa && !ctx.session.mfa_ok && !o.mfaPending) throw new HttpError(401, "Ikki bosqichli tasdiq talab qilinadi.", { mfa: true });
        if (o.perm) {
          const perms = Array.isArray(o.perm) ? o.perm : [o.perm];
          if (!perms.some(p => can(ctx.user, p))) throw forbidden();
        }
      }
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !o.raw) {
        const buf = await readBody(req, o.bodyLimit || 1024 * 1024);
        if (buf.length) {
          try { ctx.body = JSON.parse(buf.toString("utf8")); } catch { throw bad("JSON formati noto'g'ri."); }
        } else ctx.body = {};
      }
      const out = await route.handler(ctx);
      if (res.writableEnded || res.headersSent) return;
      if (out && out.__raw) return this.sendRaw(res, out);
      this.json(res, 200, out === undefined ? { ok: true } : out);
    } catch (e) {
      if (res.headersSent) { res.end(); return; }
      if (e instanceof HttpError || e.status) {
        this.json(res, e.status, { error: e.message, ...(e.extra || {}) });
      } else {
        console.error(e);
        this.json(res, 500, { error: "Serverda kutilmagan xato." });
      }
    }
  }

  json(res, status, obj) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SEC_HEADERS });
    res.end(JSON.stringify(obj));
  }
  sendRaw(res, { body, type, filename, status = 200, headers = {} }) {
    const h = { "Content-Type": type, "Cache-Control": "no-store", ...SEC_HEADERS, ...headers };
    if (filename) h["Content-Disposition"] = `attachment; filename="${filename.replace(/[^\w.\-]/g, "_")}"`;
    res.writeHead(status, h);
    res.end(body);
  }
  serveStatic(req, res, pathname) {
    if (req.method !== "GET" && req.method !== "HEAD") return this.json(res, 405, { error: "Ruxsat etilmagan usul." });
    let rel = decodeURIComponent(pathname);
    if (rel === "/" || !path.extname(rel)) rel = "/index.html"; // SPA
    const root = this.s.publicDir;
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root + path.sep)) return this.json(res, 403, { error: "Ruxsat yo'q." });
    fs.readFile(file, (err, buf) => {
      if (err) return this.json(res, 404, { error: "Topilmadi." });
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache", ...SEC_HEADERS });
      res.end(buf);
    });
  }
}

const raw = (body, type, filename, extra = {}) => ({ __raw: true, body, type, filename, ...extra });

module.exports = { App, HttpError, bad, forbidden, notFound, raw, SEC_HEADERS };
