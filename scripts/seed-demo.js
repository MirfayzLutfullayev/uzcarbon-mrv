/*
 * Demo ma'lumotlar: npm run seed
 * DIQQAT: data/uzcarbon.db o'chirilib, qaytadan yaratiladi. Barcha korxonalar SHARTLI (haqiqiy emas).
 * Har bir rol uchun demo foydalanuvchi yaratiladi; 2FA talab qilinadigan rollar uchun TOTP yoqiladi —
 * joriy kodni `npm run totp -- <login>` chiqaradi (faqat ishlab chiqish muhitida).
 */
"use strict";
const fs = require("fs");
const config = require("../src/config");
const { createApp } = require("../src/app");
const { now, newId } = require("../src/db/db");
const audit = require("../src/db/audit");
const C = require("../src/auth/crypto");
const { saveResult } = require("../src/services/calc");
const { signPayload } = require("../src/api/verification");
const { TEMPLATES } = require("../src/api/registry");

if (!process.argv.includes("--force")) { console.log("Bazani qayta yaratish uchun: npm run seed"); process.exit(0); }
for (const f of [config.DB_FILE, config.DB_FILE + "-wal", config.DB_FILE + "-shm"]) fs.rmSync(f, { force: true });

const app = createApp();
const { db } = app.s;
const S = app.s;
const PASSWORD = "Demo2026parol";
const T = now();
const ins = (table, obj) => {
  const keys = Object.keys(obj);
  db.run(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`, ...keys.map(k => obj[k]));
  return obj.id;
};
const sysLog = (action, entity, entityId, after) => audit.log(db, { actor: "system:seed", action, entity, entityId, after });

// Deterministik "tasodif" (namuna har safar bir xil bo'lishi uchun)
let seed = 20261019;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const jitter = (v, p = 0.04) => +(v * (1 + (rnd() * 2 - 1) * p)).toFixed(2);

db.tx(() => {
  /* ---------- Korxonalar ---------- */
  const ops = {
    cement: ins("operators", { id: "op_cement", stir: "300000001", name: "\"A Sement\" AJ (shartli)", oked: "23.51", address: "Jizzax viloyati (shartli manzil)", o3ci_operator_id: "UZ-OP-DEMO-001", contact_person: "Bosh ekolog", example: 1, created_at: T, updated_at: T }),
    steel: ins("operators", { id: "op_steel", stir: "300000002", name: "\"B Metall\" MChJ (shartli)", oked: "24.10", address: "Toshkent viloyati (shartli manzil)", o3ci_operator_id: "UZ-OP-DEMO-002", example: 1, created_at: T, updated_at: T }),
    fert: ins("operators", { id: "op_fert", stir: "300000003", name: "\"C Kimyo\" AJ (shartli)", oked: "20.15", address: "Navoiy viloyati (shartli manzil)", o3ci_operator_id: "UZ-OP-DEMO-003", example: 1, created_at: T, updated_at: T }),
  };
  const inst = {
    cement: ins("installations", { id: "inst_cement", operator_id: ops.cement, name: "Klinker-sement zavodi №1", address: "Jizzax", region: "Jizzax", lat: 40.12, lon: 67.84, unlocode: "UZJIZ", capacity_t: 1500000, o3ci_installation_id: "UZ-IN-DEMO-001", created_at: T, updated_at: T }),
    steel: ins("installations", { id: "inst_steel", operator_id: ops.steel, name: "Prokat sexi", address: "Bekobod", region: "Toshkent vil.", lat: 40.22, lon: 69.27, unlocode: "UZBKB", capacity_t: 500000, o3ci_installation_id: "UZ-IN-DEMO-002", created_at: T, updated_at: T }),
    fert: ins("installations", { id: "inst_fert", operator_id: ops.fert, name: "Azotli o'g'itlar majmuasi", address: "Navoiy", region: "Navoiy", lat: 40.10, lon: 65.37, unlocode: "UZNVI", capacity_t: 600000, o3ci_installation_id: "UZ-IN-DEMO-003", created_at: T, updated_at: T }),
  };
  const proc = {
    cement: ins("processes", { id: "proc_cement", installation_id: inst.cement, name: "Portlandsement ishlab chiqarish", goods_group: "cement", route: "Quruq usul, aylanma pech", tif_code: "2523290000", boundary: "Xomashyo tayyorlash → pech → tegirmon", export_price_usd: 55, created_at: T, updated_at: T }),
    steel: ins("processes", { id: "proc_steel", installation_id: inst.steel, name: "Armatura prokati", goods_group: "iron_steel", route: "Zagotovkadan issiq prokat", tif_code: "7214200000", boundary: "Isitish pechi → prokat stani", export_price_usd: 560, created_at: T, updated_at: T }),
    ammonia: ins("processes", { id: "proc_ammonia", installation_id: inst.fert, name: "Ammiak sintezi", goods_group: "fertilizer", route: "Bug'li reforming (SMR)", tif_code: "2814100000", boundary: "Reforming → sintez", created_at: T, updated_at: T }),
    an: ins("processes", { id: "proc_an", installation_id: inst.fert, name: "Ammiakli selitra", goods_group: "fertilizer", route: "Nitrat kislota + neytrallash", tif_code: "3102300000", boundary: "Nitrat kislota → neytrallash → granulyatsiya", export_price_usd: 320, created_at: T, updated_at: T }),
  };
  const st = {};
  const addStream = (key, processId, o) => { st[key] = ins("streams", { id: "st_" + key, process_id: processId, created_at: T, updated_at: T, active: 1, ...o }); };
  // Sement: tarmoq shabloni
  TEMPLATES.cement.forEach((t, i) => addStream(["c_gas", "c_clk", "c_el", "c_out"][i], proc.cement, { name: t.name, type: t.type, fuel_key: t.fuelKey || null, unit: t.unit, method: t.method || null, ef_source: t.efSource || null, source_level: t.sourceLevel }));
  // Po'lat
  addStream("s_gas", proc.steel, { name: "Tabiiy gaz (isitish pechi)", type: "fuel", fuel_key: "natural_gas", unit: "1000m3", method: "calculation", source_level: "measured" });
  addStream("s_el", proc.steel, { name: "Elektr energiyasi", type: "electricity", unit: "MWh", ef_source: "grid", source_level: "measured" });
  addStream("s_bil", proc.steel, { name: "Po'lat zagotovka (xarid, prekursor)", type: "precursor", unit: "t", precursor_source: "supplier", supplier_see_dir: 1.92, supplier_see_ind: 0.21, source_level: "supplier" });
  addStream("s_out", proc.steel, { name: "Armatura (mahsulot)", type: "product", unit: "t", source_level: "measured" });
  // Ammiak
  addStream("a_gas", proc.ammonia, { name: "Tabiiy gaz (yoqilg'i)", type: "fuel", fuel_key: "natural_gas", unit: "1000m3", method: "calculation", source_level: "measured" });
  addStream("a_feed", proc.ammonia, { name: "Tabiiy gaz (xomashyo)", type: "mass_in", unit: "t", carbon: 0.73, method: "mass_balance", source_level: "lab" });
  addStream("a_el", proc.ammonia, { name: "Elektr energiyasi", type: "electricity", unit: "MWh", ef_source: "grid", source_level: "measured" });
  addStream("a_out", proc.ammonia, { name: "Ammiak (mahsulot)", type: "product", unit: "t", source_level: "measured" });
  // Ammiakli selitra
  addStream("n_gas", proc.an, { name: "Tabiiy gaz (yoqilg'i)", type: "fuel", fuel_key: "natural_gas", unit: "1000m3", method: "calculation", source_level: "measured" });
  addStream("n_n2o", proc.an, { name: "N2O (nitrat kislota, CEMS)", type: "cems", gas: "N2O", unit: "t", method: "measurement", source_level: "measured" });
  addStream("n_el", proc.an, { name: "Elektr energiyasi", type: "electricity", unit: "MWh", ef_source: "grid", source_level: "measured" });
  addStream("n_nh3", proc.an, { name: "Ammiak (ichki prekursor)", type: "precursor", unit: "t", precursor_source: "internal", precursor_process_id: proc.ammonia, source_level: "measured" });
  addStream("n_out", proc.an, { name: "Ammiakli selitra (mahsulot)", type: "product", unit: "t", source_level: "measured" });

  /* ---------- Oylik faoliyat ma'lumotlari: 2025 (12 oy), 2026 (yanvar–sentabr) ---------- */
  const act = (streamKey, year, month, value, extra = null, status = "actual") => ins("activity", { id: newId("act"), stream_id: st[streamKey], year, month, value, extra: extra ? JSON.stringify(extra) : null,
    source_level: null, status, entered_by: "system:seed", entered_at: `${year}-${String(Math.min(12, month + 1)).padStart(2, "0")}-10T09:00:00.000Z` });
  for (const [year, last] of [[2025, 12], [2026, 9]]) {
    for (let m = 1; m <= last; m++) {
      const season = 1 + 0.08 * Math.sin(((m - 3) / 12) * 2 * Math.PI);
      // Sement
      const clk = jitter(95000 * season);
      act("c_gas", year, m, year === 2026 && m === 5 ? 12650 : jitter(clk * 3.3 / 38)); // 2026-may: ataylab kiritilgan anomaliya (hisoblagich xatosi)
      act("c_clk", year, m, clk, { wCaO: jitter(65.2, 0.005), wMgO: jitter(1.6, 0.05) });
      act("c_el", year, m, jitter(clk * 0.125));
      act("c_out", year, m, jitter(clk / 0.79));
      // Po'lat (2026-mart gaz ma'lumoti yo'q — konservativ to'ldirish namunasi)
      const out = jitter(40000 * season);
      if (!(year === 2026 && m === 3)) act("s_gas", year, m, jitter(out * 0.15));
      act("s_el", year, m, jitter(out * 0.12));
      act("s_bil", year, m, jitter(out * 1.03));
      act("s_out", year, m, out);
      // Ammiak va selitra
      const nh3 = jitter(40000);
      act("a_gas", year, m, jitter(nh3 * 0.38));
      act("a_feed", year, m, jitter(nh3 * 0.45));
      act("a_el", year, m, jitter(nh3 * 0.12));
      act("a_out", year, m, nh3);
      const an = jitter(42000);
      act("n_gas", year, m, jitter(an * 0.048));
      act("n_n2o", year, m, jitter(an * 0.0006), { cems: { hours: 720, expected: 720 } });
      act("n_el", year, m, jitter(an * 0.21));
      act("n_nh3", year, m, jitter(an * 0.215));
      act("n_out", year, m, an);
    }
  }
  sysLog("seed.activity", "activity", null, { years: [2025, 2026] });

  /* ---------- Importyorlar va eksport partiyalari ---------- */
  const imp = {
    c1: ins("importers", { id: "imp_c1", operator_id: ops.cement, name: "Baltic Building Materials OU (shartli)", eori: "EE100000000001", country: "EE", created_at: T, updated_at: T }),
    s1: ins("importers", { id: "imp_s1", operator_id: ops.steel, name: "Vistula Steel Trading Sp. z o.o. (shartli)", eori: "PL100000000002", country: "PL", created_at: T, updated_at: T }),
    f1: ins("importers", { id: "imp_f1", operator_id: ops.fert, name: "Danube Agro SRL (shartli)", eori: "RO100000000003", country: "RO", created_at: T, updated_at: T }),
    f2: ins("importers", { id: "imp_f2", operator_id: ops.fert, name: "Thrace Fertilizers EOOD (shartli)", eori: "BG100000000004", country: "BG", created_at: T, updated_at: T }),
  };
  let n = 1;
  const batch = (opId, date, tif, t, importer, eori, country, processId, source = "customs") =>
    ins("batches", { id: newId("bat"), operator_id: opId, declaration_no: `DEMO-${date.slice(0, 4)}-${String(n++).padStart(5, "0")}`, date, tif_code: tif, net_t: t, importer_id: importer, eori, country, process_id: processId, source, created_at: T, updated_at: T });
  for (const year of [2025, 2026]) {
    const qs = year === 2025 ? [1, 2, 3, 4] : [1, 2, 3];
    for (const q of qs) {
      const d = `${year}-${String(q * 3 - 1).padStart(2, "0")}-15`;
      batch(ops.cement, d, "2523290000", jitter(18000), imp.c1, "EE100000000001", "EE", proc.cement);
      batch(ops.steel, d, "7214200000", jitter(9000), imp.s1, "PL100000000002", "PL", proc.steel);
      batch(ops.fert, d, "3102300000", jitter(12000), imp.f1, "RO100000000003", "RO", proc.an);
      batch(ops.fert, `${year}-${String(q * 3).padStart(2, "0")}-05`, "3102300000", jitter(6000), imp.f2, "BG100000000004", "BG", proc.an);
    }
  }
  // Korxona o'zi kiritgan, bojxona bilan farq qiladigan partiya (AI-4 moslashtirish namunasi)
  batch(ops.fert, "2026-08-20", "3102300000", 6400, imp.f1, "RO100000000003", "RO", proc.an, "manual");
  sysLog("seed.batches", "batch", null, { count: n - 1 });

  /* ---------- Verifikator va foydalanuvchilar ---------- */
  ins("verifiers", { id: "ver_demo", name: "\"Green Verify\" MChJ (shartli)", accreditation_no: "UZ-ACC-DEMO-01", accredited_until: "2028-12-31", sectors: "sement, o'g'itlar, po'lat", created_at: T, updated_at: T });
  const hash = C.hashPassword(PASSWORD);
  const users = [
    ["admin", "Tizim administratori", "sysadmin"], ["metod1", "Uslubiyot administratori 1", "methodology_admin"], ["metod2", "Uslubiyot administratori 2", "methodology_admin"],
    ["imv", "IMV mutaxassisi", "imv"], ["soliq", "Soliq qo'mitasi xodimi", "tax"], ["ekologiya", "Ekologiya vazirligi xodimi", "ecology"], ["bojxona", "Bojxona xodimi", "customs"],
    ["energetika", "Energetika vazirligi xodimi", "energy"], ["tahlilchi", "Davlat tahlilchisi", "gov_analyst"],
    ["sement_admin", "A Sement — administrator", "exporter_admin", ops.cement], ["sement", "A Sement — ekolog", "exporter_specialist", ops.cement],
    ["metall_admin", "B Metall — administrator", "exporter_admin", ops.steel], ["metall", "B Metall — energetik", "exporter_specialist", ops.steel],
    ["kimyo_admin", "C Kimyo — administrator", "exporter_admin", ops.fert], ["kimyo", "C Kimyo — ekolog", "exporter_specialist", ops.fert],
    ["verifikator", "Green Verify — bosh verifikator", "verifier", null, "ver_demo"], ["importyor", "Baltic BM — CBAM menejeri", "importer", null, null, imp.c1],
  ];
  const { ROLES } = require("../src/auth/rbac");
  for (const [login, name, role, op, ver, im] of users) {
    const mfa = ROLES[role].mfa;
    ins("users", { id: "usr_" + login, login, name, role, operator_id: op || null, verifier_id: ver || null, importer_id: im || null, password_hash: hash,
      totp_secret: mfa ? C.newTotpSecret() : null, totp_enabled: mfa ? 1 : 0, created_at: T, updated_at: T });
  }
  sysLog("seed.users", "user", null, { count: users.length });

  /* ---------- Monitoring rejalari ---------- */
  for (const [k, status] of [["cement", "approved"], ["steel", "submitted"], ["fert", "draft"]]) {
    const snap = db.all("SELECT * FROM processes WHERE installation_id = ?", inst[k]).map(p => ({ ...p, streams: db.all("SELECT * FROM streams WHERE process_id = ?", p.id) }));
    ins("monitoring_plans", { id: "plan_" + k, installation_id: inst[k], version: 1, status, snapshot: JSON.stringify(snap), created_by: "system:seed", created_at: "2025-01-15T09:00:00.000Z",
      submitted_at: status !== "draft" ? "2025-01-20T09:00:00.000Z" : null, decided_by: status === "approved" ? "usr_verifikator" : null, decided_at: status === "approved" ? "2025-01-28T09:00:00.000Z" : null });
  }
});

/* ---------- Hisob natijalari va 2025-yil sement verifikatsiyasi ---------- */
const seedUser = { id: "usr_sement_admin", role: "exporter_admin" };
const r1 = saveResult(S, "proc_cement", 2025, seedUser);
db.run("UPDATE calc_results SET status = 'submitted' WHERE id = ?", r1.id);
for (const p of ["proc_steel", "proc_ammonia", "proc_an"]) saveResult(S, p, 2025, { id: "usr_" + (p === "proc_steel" ? "metall_admin" : "kimyo_admin"), role: "exporter_admin" });
const vId = "vfy_cement_2025";
db.run("INSERT INTO verifications (id, installation_id, year, verifier_id, status, assigned_by, created_at) VALUES (?, 'inst_cement', 2025, 'ver_demo', 'in_progress', 'usr_sement_admin', ?)", vId, "2026-04-02T09:00:00.000Z");
db.run("INSERT INTO findings (id, verification_id, kind, text, status, response, created_by, created_at, responded_by, responded_at, closed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  newId("fnd"), vId, "request", "Iyul oyi tabiiy gaz hisoblagichining kalibrovka sertifikatini yuklang.", "closed", "Sertifikat yuklandi (2025-06-14 dagi kalibrovka).", "usr_verifikator", "2026-04-10T09:00:00.000Z", "usr_sement", "2026-04-12T09:00:00.000Z", "2026-04-15T09:00:00.000Z");
const signedAt = "2026-05-20T10:00:00.000Z";
const payload = { verificationId: vId, installationId: "inst_cement", year: 2025, opinion: "positive", results: [{ id: r1.id, inputsHash: r1.inputsHash, seeCbam: r1.seeCbam }], signedAt, signer: "verifikator" };
db.run("UPDATE verifications SET status = 'concluded', opinion = 'positive', conclusion = ?, signed_at = ?, signed_by = 'usr_verifikator', signature = ? WHERE id = ?",
  "Monitoring rejasiga muvofiq hisoblangan; jiddiy nomuvofiqlik aniqlanmadi. SEE hisob-kitobi namunaviy tekshiruvda tasdiqlandi.", signedAt, signPayload(config.signingKey(), payload), vId);
db.run("UPDATE calc_results SET status = 'verified', locked = 1 WHERE id = ?", r1.id);
audit.log(db, { actor: "system:seed", action: "seed.verification", entity: "verification", entityId: vId, after: { opinion: "positive" } });
// 2026-yil uchun ochiq verifikatsiya topshirig'i (po'lat)
db.run("INSERT INTO verifications (id, installation_id, year, verifier_id, status, assigned_by, created_at) VALUES ('vfy_steel_2026', 'inst_steel', 2026, 'ver_demo', 'assigned', 'usr_metall_admin', ?)", now());

/* ---------- Uglerod soliqi to'lovlari (2026, yuqori oqim) va ITMO loyihasi ---------- */
const tax = require("../src/services/tax");
for (const [instId, opId] of [["inst_cement", "op_cement"], ["inst_fert", "op_fert"]]) {
  for (const q of ["Q1", "Q2"]) {
    const d = tax.declaration(S, instId, 2026, q, "up");
    db.run(`INSERT INTO tax_payments (id, operator_id, installation_id, year, period, kind, amount_uzs, fx, rebate_uzs, covered_t, budget_code, status, source, confirmed_by, confirmed_at, created_at, updated_at)
      VALUES (?,?,?,?,?, 'up', ?, ?, 0, ?, ?, ?, 'seed', ?, ?, ?, ?)`, newId("tax"), opId, instId, 2026, `2026-${q}`, Math.round(d.due), d.fx, d.covered, d.budgetCode,
      q === "Q1" ? "confirmed" : "paid", q === "Q1" ? "usr_soliq" : null, q === "Q1" ? now() : null, now(), now());
  }
}
db.run(`INSERT INTO itmo_projects (id, operator_id, name, year, be, pe, le, scope, linked_process_id, status, created_at, updated_at)
  VALUES ('itmo_demo', 'op_fert', 'N2O uchlamchi katalizatori (nitrat kislota)', 2026, 60000, 12000, 500, 'cbam_goods', 'proc_an', 'draft', ?, ?)`, now(), now());
audit.log(db, { actor: "system:seed", action: "seed.done" });
app.s.db.close();

console.log("Demo ma'lumotlar yaratildi (shartli korxonalar).");
console.log(`Barcha demo foydalanuvchilar paroli: ${PASSWORD}`);
console.log("Loginlar (2FA belgisi bo'lganlarga kod: npm run totp -- <login>):");
const { ROLES } = require("../src/auth/rbac");
const list = [["sement", "exporter_specialist"], ["sement_admin", "exporter_admin"], ["metall", "exporter_specialist"], ["kimyo", "exporter_specialist"], ["kimyo_admin", "exporter_admin"],
  ["verifikator", "verifier"], ["importyor", "importer"], ["metod1", "methodology_admin"], ["metod2", "methodology_admin"], ["imv", "imv"], ["soliq", "tax"], ["ekologiya", "ecology"],
  ["bojxona", "customs"], ["energetika", "energy"], ["tahlilchi", "gov_analyst"], ["admin", "sysadmin"]];
for (const [l, r] of list) console.log(`  ${l.padEnd(14)} ${ROLES[r].name}${ROLES[r].mfa ? "  [2FA]" : ""}`);
