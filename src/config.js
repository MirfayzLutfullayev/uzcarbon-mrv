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
    const val = m[2].replace(/^(['"])(.*)\1$/, "$2");
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

module.exports = {
  ROOT,
  PORT: Number(env("PORT", 3000)),
  DATA_DIR,
  DB_FILE: env("DB_FILE", path.join(DATA_DIR, "uzcarbon.db")),
  MFA_ENFORCE: env("MFA_ENFORCE", "1") !== "0",
  SESSION_TTL_HOURS: Number(env("SESSION_TTL_HOURS", 8)),
  SECURE_COOKIES: env("SECURE_COOKIES", "0") === "1",
  AI_EXTERNAL_ALLOWED: env("AI_EXTERNAL_ALLOWED", "0") === "1",
  ANTHROPIC_API_KEY: env("ANTHROPIC_API_KEY", ""),
  ANTHROPIC_MODEL: env("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
  PUBLIC_URL: env("PUBLIC_URL", ""),
  signingKey,
};
