/*
 * Parol xeshi (scrypt) va TOTP (RFC 6238) — tashqi kutubxonasiz.
 */
"use strict";
const crypto = require("crypto");

/* ---------- Parol ---------- */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${h.toString("base64")}`;
}
function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || "").split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const h = crypto.scryptSync(String(pw), Buffer.from(salt, "base64"), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(h, expected);
}
/** Parol siyosati: kamida 10 belgi, harf va raqam. */
function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 10) return "Parol kamida 10 belgidan iborat bo'lishi kerak.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Parolda harf va raqam bo'lishi kerak.";
  return null;
}

/* ---------- Base32 ---------- */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

/* ---------- TOTP (RFC 6238, HMAC-SHA1, 30 s, 6 raqam) ---------- */
const STEP = 30;
function hotp(secretB32, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1e6).padStart(6, "0");
}
const currentStep = (t = Date.now()) => Math.floor(t / 1000 / STEP);
function totp(secretB32, t = Date.now()) { return hotp(secretB32, currentStep(t)); }
/**
 * Kodni tekshirish (±1 qadam). Qayta ishlatishning oldini olish uchun mos kelgan qadam qaytariladi.
 * @returns {number|null} qadam yoki null
 */
function verifyTotp(secretB32, code, lastStep = null, t = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ""))) return null;
  const s = currentStep(t);
  for (const d of [0, -1, 1]) {
    const step = s + d;
    if (lastStep != null && step <= lastStep) continue;
    const c = hotp(secretB32, step);
    if (crypto.timingSafeEqual(Buffer.from(c), Buffer.from(String(code)))) return step;
  }
  return null;
}
const newTotpSecret = () => base32Encode(crypto.randomBytes(20));
const otpauthUri = (secret, login, issuer = "UZ-Carbon") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(login)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");

module.exports = { hashPassword, verifyPassword, passwordProblem, base32Encode, base32Decode, hotp, totp, verifyTotp, newTotpSecret, otpauthUri, randomToken, sha256 };
