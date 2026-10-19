/*
 * UzCarbon MVP — server.
 * Ishga tushirish: npm start  (yoki: node server.js)  →  http://localhost:3000
 * Tashqi kutubxonalar talab qilinmaydi — faqat Node.js 18+.
 *
 * Ma'lumotlar data/db.json faylida saqlanadi (birinchi ishga tushishda
 * data/seed.json dagi namuna ma'lumotlar bilan yaratiladi).
 * AI-yordamchi uchun .env faylida ANTHROPIC_API_KEY ko'rsatiladi.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

/* .env faylini o'qish (dotenv o'rniga, kutubxonasiz) */
(function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const val = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
})(path.join(__dirname, ".env"));

const UzCalc = require("./public/js/calc.js");

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SEED_FILE = path.join(__dirname, "data", "seed.json");
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

/* ---------------- Fayl asosidagi ma'lumotlar ombori ---------------- */
function emptyDb() {
  return { installations: {}, records: {}, params: null };
}
function dbFromSeed() {
  const db = emptyDb();
  if (!fs.existsSync(SEED_FILE)) return db;
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  for (const i of seed.inst || []) { const { id, ...rest } = i; db.installations[id] = rest; }
  for (const r of seed.recs || []) { const { id, ...rest } = r; db.records[id] = rest; }
  return db;
}
function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const db = dbFromSeed();
    writeDb(db);
    console.log("data/db.json yaratildi (namuna ma'lumotlar bilan).");
    return db;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function writeDb(db) {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE); // atomar almashtirish: yozish paytida fayl buzilmaydi
}
let DB = loadDb();
const persist = () => writeDb(DB);
const toList = obj => Object.entries(obj).map(([id, d]) => ({ id, ...d }));

/* ---------------- Tekshiruv (validatsiya) ---------------- */
const ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;
const isNum = v => typeof v === "number" && Number.isFinite(v) && v >= 0;
const str = (v, max = 200) => typeof v === "string" && v.length <= max;

function validateInstallation(d) {
  if (!str(d.name) || !d.name.trim()) return "Inshoot nomi kiritilmagan.";
  if (!str(d.exporter) || !d.exporter.trim()) return "Eksportyor nomi kiritilmagan.";
  if (!UzCalc.SECTORS[d.sector]) return "Tarmoq noto'g'ri.";
  if (d.stir && !/^\d{9}$/.test(d.stir)) return "STIR 9 ta raqamdan iborat bo'lishi kerak.";
  if (d.cn && !/^\d{8}$/.test(d.cn)) return "CN kodi 8 ta raqam bo'lishi kerak.";
  return null;
}
const REC_NUM_FIELDS = ["clinker", "cao", "mgo", "limestone", "electrode", "anode", "pfc", "n2o", "precursors", "electricity", "output", "exportEU"];
function validateRecord(d) {
  if (!DB.installations[d.instId]) return "Bunday inshoot reyestrda yo'q.";
  if (!Number.isInteger(d.year) || d.year < 2020 || d.year > 2040) return "Yil noto'g'ri.";
  if (!UzCalc.Q.includes(d.q)) return "Davr noto'g'ri.";
  for (const k of REC_NUM_FIELDS) if (d[k] != null && !isNum(d[k])) return `${k} manfiy bo'lmagan son bo'lishi kerak.`;
  if (d.fuels != null) {
    if (typeof d.fuels !== "object") return "Yoqilg'i ma'lumotlari noto'g'ri.";
    for (const [k, v] of Object.entries(d.fuels)) {
      if (!UzCalc.FUELS.some(F => F.k === k)) return `Noma'lum yoqilg'i turi: ${k}`;
      if (!isNum(v)) return "Yoqilg'i sarfi manfiy bo'lmagan son bo'lishi kerak.";
    }
  }
  if (!(d.output > 0)) return "Ishlab chiqarilgan mahsulot hajmini kiriting.";
  return null;
}

/* ---------------- Kichik HTTP marshrutizator ---------------- */
const PUBLIC_DIR = path.join(__dirname, "public");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const SEC_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" };

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SEC_HEADERS });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(Object.assign(new Error("So'rov hajmi juda katta."), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => {
      if (!chunks.length) return resolve(undefined);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("JSON formati noto'g'ri."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: "Ruxsat yo'q." });
  fs.readFile(file, (err, buf) => {
    if (err) return sendJson(res, 404, { error: "Topilmadi." });
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", ...SEC_HEADERS });
    res.end(buf);
  });
}

/* ---------------- API ---------------- */
function getState() {
  return {
    installations: toList(DB.installations),
    records: toList(DB.records),
    params: DB.params,
    aiEnabled: Boolean(ANTHROPIC_API_KEY),
  };
}
const COLLS = { installations: validateInstallation, records: validateRecord };

function putDoc(coll, id, body) {
  const validate = COLLS[coll];
  if (!validate) return [404, { error: "Bunday bo'lim yo'q." }];
  if (!ID_RE.test(id)) return [400, { error: "Identifikator noto'g'ri." }];
  if (!body || typeof body !== "object" || Array.isArray(body)) return [400, { error: "Ma'lumot obyekt bo'lishi kerak." }];
  const { id: _ignored, ...data } = body;
  const err = validate(data);
  if (err) return [400, { error: err }];
  data.updatedAt = new Date().toISOString();
  DB[coll][id] = data;
  persist();
  return [200, { id, ...data }];
}
function deleteDoc(coll, id) {
  if (!COLLS[coll]) return [404, { error: "Bunday bo'lim yo'q." }];
  delete DB[coll][id];
  if (coll === "installations") {
    for (const [rid, r] of Object.entries(DB.records)) if (r.instId === id) delete DB.records[rid];
  }
  persist();
  return [200, { ok: true }];
}
function putParams(p) {
  if (!p || typeof p !== "object") return [400, { error: "Parametrlar noto'g'ri." }];
  for (const k of ["year", "etsPrice", "eurRate", "natRate", "natCoverage", "gridEf", "markup"]) {
    if (!isNum(p[k])) return [400, { error: `${k} manfiy bo'lmagan son bo'lishi kerak.` }];
  }
  if (!(p.eurRate > 0)) return [400, { error: "Yevro kursi noldan katta bo'lishi kerak." }];
  DB.params = { ...p, updatedAt: new Date().toISOString() };
  persist();
  return [200, DB.params];
}

/* ---------------- AI-yordamchi (Anthropic Messages API) ---------------- */
const hits = new Map(); // oddiy cheklov: IP bo'yicha daqiqasiga 20 so'rov
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 20;
}
function extractJson(text) {
  const m = text.match(/[\[{][\s\S]*[\]}]/);
  if (!m) throw new Error("Javobda JSON topilmadi.");
  return JSON.parse(m[0]);
}

async function aiChat(body, ip) {
  if (!ANTHROPIC_API_KEY) return [503, { error: "AI o'chirilgan: .env faylida ANTHROPIC_API_KEY ko'rsatilmagan." }];
  if (rateLimited(ip)) return [429, { error: "Juda ko'p so'rov. Bir daqiqadan so'ng urinib ko'ring." }];
  const { messages, json } = body || {};
  const ok = Array.isArray(messages) && messages.length > 0 && messages.length <= 20 &&
    messages.every(m => (m.role === "user" || m.role === "assistant") && str(m.content, 120_000)) &&
    messages[messages.length - 1].role === "user";
  if (!ok) return [400, { error: "So'rov formati noto'g'ri." }];

  const system = "Sen UzCarbon platformasining AI-yordamchisisan. O'zbek tilida (lotin yozuvi) javob ber. " +
    "Raqamlarni faqat foydalanuvchi bergan ma'lumotlardan ol, o'zingdan to'qima." +
    (json ? " Faqat yaroqli JSON qaytar, boshqa matn yozma." : "");
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1500, system, messages }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message || `Anthropic API xatosi (${r.status})`;
      return [r.status === 429 ? 429 : 502, { error: msg }];
    }
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    if (json) return [200, { data: extractJson(text) }];
    return [200, { text }];
  } catch (e) {
    return [502, { error: "AI xizmatiga ulanib bo'lmadi: " + e.message }];
  }
}

/* ---------------- So'rovlarni yo'naltirish ---------------- */
async function handle(req, res) {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    if (!pathname.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Ruxsat etilmagan usul." });
      return serveStatic(req, res, pathname);
    }
    if (req.method === "GET" && pathname === "/api/state") return sendJson(res, 200, getState());
    if (req.method === "PUT" && pathname === "/api/params") return sendJson(res, ...putParams(await readBody(req)));
    if (req.method === "POST" && pathname === "/api/ai/chat") return sendJson(res, ...(await aiChat(await readBody(req), req.socket.remoteAddress)));
    const m = pathname.match(/^\/api\/([a-z]+)\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[2]);
      if (req.method === "PUT") return sendJson(res, ...putDoc(m[1], id, await readBody(req)));
      if (req.method === "DELETE") return sendJson(res, ...deleteDoc(m[1], id));
    }
    sendJson(res, 404, { error: "Topilmadi." });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.status ? e.message : "Serverda kutilmagan xato." });
    if (!e.status) console.error(e);
  }
}
const app = http.createServer(handle);

/* ---------------- Ishga tushirish ---------------- */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`UzCarbon ishlayapti: http://localhost:${PORT}`);
    console.log(ANTHROPIC_API_KEY ? `AI-yordamchi yoqilgan (model: ${ANTHROPIC_MODEL}).` : "AI-yordamchi o'chirilgan (.env da ANTHROPIC_API_KEY yo'q).");
  });
}
module.exports = { app, reload: () => { DB = loadDb(); } };
