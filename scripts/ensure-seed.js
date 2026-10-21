/*
 * Bazada foydalanuvchi bo'lmasa, demo ma'lumotlarni bir marta yuklaydi.
 * Serverdan oldin ishga tushadi (npm start), shuning uchun yangi joyga joylashtirilganda
 * (masalan, Railway) qo'lda "npm run seed" berish shart emas.
 *
 * MUHIM: mavjud ma'lumotlarga tegmaydi — faqat foydalanuvchilar jadvali bo'sh bo'lsagina seed qiladi.
 */
"use strict";
const path = require("path");
const { execFileSync } = require("child_process");
const config = require("../src/config");
const { Db } = require("../src/db/db");

let empty = true;
try {
  const db = new Db(config.DB_FILE);
  empty = db.get("SELECT COUNT(*) AS c FROM users").c === 0;
  db.close();
} catch (e) {
  console.error("Bazani tekshirib bo'lmadi:", e.message);
  process.exit(1);
}

if (!empty) {
  console.log("Baza tayyor (foydalanuvchilar mavjud) — seed o'tkazib yuborildi.");
  process.exit(0);
}

console.log("Baza bo'sh — demo ma'lumotlar yuklanmoqda...");
try {
  execFileSync(process.execPath, [path.join(__dirname, "seed-demo.js"), "--force"], { stdio: "inherit" });
} catch (e) {
  console.error("Seed bajarilmadi:", e.message);
  process.exit(1);
}
