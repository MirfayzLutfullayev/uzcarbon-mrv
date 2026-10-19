/*
 * Namuna ma'lumotlarni qayta yuklash: npm run seed
 * DIQQAT: data/db.json dagi barcha ma'lumotlar namunalar bilan almashtiriladi.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const dbFile = path.join(dataDir, "db.json");
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "seed.json"), "utf8"));

if (fs.existsSync(dbFile) && !process.argv.includes("--force")) {
  console.log("data/db.json allaqachon mavjud. Almashtirish uchun: npm run seed");
  process.exit(0);
}
const db = { installations: {}, records: {}, params: null };
for (const { id, ...rest } of seed.inst) db.installations[id] = rest;
for (const { id, ...rest } of seed.recs) db.records[id] = rest;
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf8");
console.log(`Yuklandi: ${seed.inst.length} ta inshoot, ${seed.recs.length} ta hisobot davri.`);
