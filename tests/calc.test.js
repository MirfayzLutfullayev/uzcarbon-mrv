/* Hisoblash yadrosi testlari: npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const U = require("../public/js/calc.js");
const seed = require("../data/seed.json");

const P = structuredClone(U.DEFAULT_PARAMS);
const inst = id => seed.inst.find(i => i.id === id);
const rec = id => seed.recs.find(r => r.id === id);
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("tabiiy gaz: 1 ming m³ ≈ 1,924 t CO₂ (IPCC 2006)", () => {
  const c = U.calc({ year: 2026, q: "Q1", fuels: { gas: 1000 }, output: 1 }, { sector: "steel" }, P);
  close(c.combustion, 1000 * 0.0343 * 56.1);
});

test("sement: klinker koeffitsiyenti CaO/MgO dan hisoblanadi", () => {
  const c = U.calc({ year: 2026, q: "Q1", clinker: 100, cao: 65, mgo: 2, output: 100 }, { sector: "cement" }, P);
  close(c.process, 100 * (0.65 * 0.785 + 0.02 * 1.092));
});

test("sement: CaO kiritilmasa IPCC standart qiymati 0,52 ishlatiladi", () => {
  const c = U.calc({ year: 2026, q: "Q1", clinker: 100, output: 100 }, { sector: "cement" }, P);
  close(c.process, 52);
});

test("po'latda elektr energiyasi CBAM ga kirmaydi, sementda kiradi", () => {
  const r = { year: 2026, q: "Q1", electricity: 1000, output: 100 };
  assert.equal(U.calc(r, { sector: "steel" }, P).indirect, 0);
  close(U.calc(r, { sector: "cement" }, P).indirect, 1000 * P.gridEf);
});

test("namuna sement zavodi, 2026 II chorak: SEE va CBAM sertifikatlari", () => {
  const c = U.calc(rec("ex-cement_2026_Q2"), inst("ex-cement"), P);
  close(c.see, 0.68714055, 1e-6);
  close(c.certs, 3537.1375, 1e-3);
  assert.ok(c.net > 0 && c.net < c.gross, "milliy narx chegirmasi CBAM xarajatini kamaytiradi");
  assert.ok(c.saving > 0, "haqiqiy ma'lumot standart qiymatdan arzon");
});

test("2025-yil (o'tish davri): CBAM to'lovi yo'q", () => {
  const c = U.calc(rec("ex-cement_2025_Q1"), inst("ex-cement"), P);
  assert.equal(c.cfPct, null);
  assert.equal(c.net, 0);
});

test("milliy stavka oshsa YeIga to'lov kamayadi, byudjet tushumi oshadi", () => {
  const r = rec("ex-cement_2026_Q1"), i = inst("ex-cement");
  const a = U.calc(r, i, { ...P, natRate: 0 }), b = U.calc(r, i, { ...P, natRate: 200000 });
  assert.ok(b.net < a.net);
  assert.ok(b.natTax > a.natTax);
});

test("avtomatik tahlil: namunadagi ataylab kiritilgan anomaliya topiladi", () => {
  const out = U.analyze(seed.inst, seed.recs, P);
  const hit = out.filter(a => a.inst.id === "ex-cement" && a.r.q === "Q2" && a.r.year === 2026);
  assert.ok(hit.length >= 1, "sement 2026 II chorak belgilanishi kerak");
  assert.ok(!out.some(a => a.inst.id === "ex-fert"), "o'g'it korxonasida soxta signal bo'lmasligi kerak");
});

test("prognoz: 3 ta va undan ko'p chorakda raqam qaytaradi", () => {
  const f = U.forecast(inst("ex-steel"), seed.recs, P);
  assert.ok(f && Number.isFinite(f.next));
  assert.equal(U.forecast(inst("ex-steel"), seed.recs.slice(0, 1), P), null);
});
