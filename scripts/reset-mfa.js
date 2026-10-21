/*
 * Barcha foydalanuvchilarning ikki bosqichli tasdig'ini tiklaydi (kalitlarni tozalaydi).
 * Ishga tushirish: node scripts/reset-mfa.js  [login]
 *
 * Login berilmasa — hammasi. Kalit o'chgach, foydalanuvchi keyingi kirishda
 * o'z autentifikator ilovasini qaytadan ulaydi (2FA o'chmaydi, qayta sozlanadi).
 *
 * Kerak bo'ladigan holat: eski bazada kalit yo'qolgan yoki hech kimga ma'lum bo'lmasa.
 */
"use strict";
const config = require("../src/config");
const { Db } = require("../src/db/db");

const login = process.argv[2];
const db = new Db(config.DB_FILE);
const where = login ? "WHERE lower(login) = lower(?)" : "";
const args = login ? [login] : [];
const before = db.all(`SELECT login FROM users ${where}`, ...args);
if (!before.length) {
  console.error(login ? `Foydalanuvchi topilmadi: ${login}` : "Bazada foydalanuvchi yo'q.");
  process.exit(1);
}
const r = db.run(`UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL ${where}`, ...args);
db.run("DELETE FROM sessions");
console.log(`2FA tiklandi: ${r.changes} foydalanuvchi (${before.map(u => u.login).join(", ")}).`);
console.log("Keyingi kirishda autentifikator ilovasi qaytadan ulanadi. Barcha sessiyalar yopildi.");
db.close();
