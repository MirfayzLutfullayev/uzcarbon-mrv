/* Sozlamalar: .env fayli (kutubxonasiz o'qiladi) va muhit o'zgaruvchilari. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

(function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    // Qo'shtirnoqsiz qiymatdagi qator ichidagi izoh (" # ...") olib tashlanadi
    const val = /^['"]/.test(m[2]) ? m[2].replace(/^(['"])(.*)\1.*$/, "$2") : m[2].replace(/\s+#.*$/, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
})(path.join(ROOT, ".env"));

const env = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : process.env[k]);
const DATA_DIR = env("DATA_DIR", path.join(ROOT, "data"));

/** Imzo kaliti (mock ERI imzosi va ulashish havolalari uchun). Berilmasa data/ ichida bir marta yaratiladi. */
function signingKey() {
  if (env("SIGNING_KEY")) return env("SIGNING_KEY");
  const f = path.join(DATA_DIR, "signing.key");
  try { return fs.readFileSync(f, "utf8").trim(); } catch { /* yaratiladi */ }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const k = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(f, k, { mode: 0o600 });
  return k;
}

/**
 * Mantiqiy sozlama: 0, false, no, off, bo'sh — o'chiq; 1, true, yes, on — yoqiq.
 * Katta-kichik harf va ortiqcha bo'shliqlar hisobga olinmaydi, shunda server
 * sozlamasidagi kichik farq (masalan "False") kutilmagan xatti-harakatga olib kelmaydi.
 */
function flag(name, dflt) {
  const v = String(env(name, dflt)).trim().toLowerCase();
  if (["0", "false", "no", "off", ""].includes(v)) return false;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  console.warn(`Ogohlantirish: ${name}="${v}" tushunarsiz qiymat, standart (${dflt}) ishlatiladi.`);
  return String(dflt) === "1";
}

module.exports = {
  ROOT,
  PORT: Number(env("PORT", 3000)),
  DATA_DIR,
  DB_FILE: env("DB_FILE", path.join(DATA_DIR, "uzcarbon.db")),
  MFA_ENFORCE: flag("MFA_ENFORCE", "1"),
  SESSION_TTL_HOURS: Number(env("SESSION_TTL_HOURS", 8)),
  SECURE_COOKIES: flag("SECURE_COOKIES", "0"),
  AI_EXTERNAL_ALLOWED: flag("AI_EXTERNAL_ALLOWED", "0"),
  ANTHROPIC_API_KEY: env("ANTHROPIC_API_KEY", ""),
  ANTHROPIC_MODEL: env("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
  PUBLIC_URL: env("PUBLIC_URL", ""),
  signingKey,
};
