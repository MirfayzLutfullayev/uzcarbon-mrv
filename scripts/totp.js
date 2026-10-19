/*
 * Ishlab chiqish yordamchisi: demo foydalanuvchining joriy 2FA kodini chiqaradi.
 * Foydalanish: npm run totp -- <login>
 * Ishlab chiqarish muhitida (NODE_ENV=production) ishlamaydi.
 */
"use strict";
if (process.env.NODE_ENV === "production") { console.error("Bu skript ishlab chiqarish muhitida ishlatilmaydi."); process.exit(1); }
const config = require("../src/config");
const { Db } = require("../src/db/db");
const { totp } = require("../src/auth/crypto");

const login = process.argv[2];
if (!login) { console.log("Foydalanish: npm run totp -- <login>"); process.exit(1); }
const db = new Db(config.DB_FILE);
const u = db.get("SELECT login, totp_secret, totp_enabled FROM users WHERE lower(login) = lower(?)", login);
if (!u) { console.error("Foydalanuvchi topilmadi."); process.exit(1); }
if (!u.totp_secret) { console.error("Bu foydalanuvchida 2FA kaliti yo'q (birinchi kirishda sozlanadi)."); process.exit(1); }
const left = 30 - (Math.floor(Date.now() / 1000) % 30);
console.log(`${u.login}: ${totp(u.totp_secret)}  (${left} s amal qiladi)${u.totp_enabled ? "" : " — 2FA hali tasdiqlanmagan"}`);
db.close();
