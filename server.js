/*
 * UZ-Carbon MRV — server.
 * Ishga tushirish: npm start  →  http://localhost:3000
 * Tashqi kutubxonalar talab qilinmaydi: Node.js 22.13+ (o'rnatilgan SQLite bilan).
 * Bo'sh bazada demo foydalanuvchilar va namuna ma'lumotlar yo'q — ularni `npm run seed` yaratadi.
 */
"use strict";
const config = require("./src/config");
const { createApp } = require("./src/app");

const app = createApp();
const users = app.s.db.get("SELECT COUNT(*) AS c FROM users").c;

app.server.listen(config.PORT, () => {
  console.log(`UZ-Carbon MRV ishlayapti: http://localhost:${config.PORT}`);
  console.log(`Ma'lumotlar bazasi: ${config.DB_FILE}`);
  if (!users) console.log("Bazada foydalanuvchi yo'q. Demo ma'lumotlar uchun: npm run seed");
  console.log(`2FA majburiyligi: ${config.MFA_ENFORCE ? "yoqilgan" : "o'chirilgan (MFA_ENFORCE=0)"}; tashqi LLM: ${config.AI_EXTERNAL_ALLOWED && config.ANTHROPIC_API_KEY ? "ruxsat etilgan" : "o'chiq (ma'lumot tashqariga chiqmaydi)"}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { app.server.close(); app.s.db.close(); process.exit(0); });
