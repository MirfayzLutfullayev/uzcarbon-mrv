/*
 * Kirish bloklashini bekor qiladi (xato urinishlar hisobini tozalaydi).
 * Ishga tushirish: node scripts/unlock-login.js  [login]
 *
 * Login berilmasa — barcha bloklar. Bu parolni o'zgartirmaydi va 2FA ga tegmaydi,
 * faqat "Juda ko'p urinish" cheklovini olib tashlaydi.
 */
"use strict";
const config = require("../src/config");
const { Db } = require("../src/db/db");

const login = process.argv[2];
const db = new Db(config.DB_FILE);
let r;
if (login) {
  // Kalit `ip|login` ko'rinishida saqlanadi — barcha IP lar bo'yicha tozalanadi.
  r = db.run("DELETE FROM login_attempts WHERE key LIKE ?", `%|${login.toLowerCase()}`);
} else {
  r = db.run("DELETE FROM login_attempts");
}
console.log(login
  ? `"${login}" uchun blok olib tashlandi (${r.changes} yozuv).`
  : `Barcha bloklar olib tashlandi (${r.changes} yozuv).`);
db.close();
