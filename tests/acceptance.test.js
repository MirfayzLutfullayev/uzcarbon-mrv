/*
 * Qabul sinovlari — TZ-2 Ilova A va boshqa etalon misollar (REJA.md 4.3).
 * Mezon: hisob natijasi etalondan ≤ 0,1% farq qiladi. Etalon jadvallardagi yaxlitlangan qiymatlar
 * (mln USD 2 xonagacha) uchun yaxlitlash xatosi chegarasi ishlatiladi.
 */
"use strict";
const test = require("node:test");
const C = require("../src/core");
const { refStub, within, near } = require("./helpers");

test("A.1 — 2025-yil bazaviy ko'rsatkichlari: EE = m × SEE va 100% CBAM (87 USD/t)", () => {
  const rows = [
    { name: "O'zkimyoimpeks", m: 301163.1, see: 1.99, ee: 599314.6, cbam: 52.14 },
    { name: "Farg'onaazot", m: 209454.5, see: 2.40, ee: 502690.8, cbam: 43.73 },
    { name: "Indorama Kokand", m: 53215.0, see: 0.80, ee: 42572.0, cbam: 3.70 },
    { name: "Toshkent metallurgiya zavodi", m: 1581.6, see: 3.21, ee: 5076.9, cbam: 0.44 },
  ];
  let mSum = 0, eeSum = 0, cbamSum = 0;
  for (const r of rows) {
    const ee = C.embedded({ mass: r.m, see: r.see });
    within(ee, r.ee, 0.001, r.name + " EE");
    const cost = C.cbamSimplified({ ee, pEts: 87, cf: 0 }) / 1e6;
    near(cost, r.cbam, 0.005, r.name + " 100% CBAM");
    mSum += r.m; eeSum += ee; cbamSum += cost;
  }
  within(mSum, 565414.2, 0.001, "Jami eksport");
  within(eeSum, 1149654.3, 0.001, "Jami EE");
  near(cbamSum, 100.02, 0.005, "Jami CBAM");
});

test("A.2 — Farg'onaazot 2026–2034 ssenariysi (P_ETS = 87, s_cov = 1)", () => {
  const ref = refStub();
  const cfByYear = {}, pUzByYear = {};
  for (let y = 2026; y <= 2034; y++) { cfByYear[y] = ref.get(`cbam.cf.${y}`); pUzByYear[y] = ref.get(`tax.rate_usd.${y}`); }
  const table = C.scenarioTable({ ee: 502690.8, pEts: 87, cfByYear, pUzByYear, sCov: 1 });
  const expected = [
    [2026, 2.18, 1.09, 5, 2.51, 0.00, 2.51],
    [2027, 4.35, 2.19, 5, 2.51, 0.00, 2.51],
    [2028, 8.70, 4.37, 5, 2.51, 1.86, 4.37],
    [2029, 19.57, 9.84, 5, 2.51, 7.33, 9.84],
    [2030, 42.20, 21.21, 5, 2.51, 18.70, 21.21],
    [2031, 53.07, 26.68, 10, 5.03, 21.65, 26.68],
    [2032, 63.95, 32.14, 10, 5.03, 27.12, 32.14],
    [2033, 74.82, 37.61, 10, 5.03, 32.58, 37.61],
    [2034, 87.00, 43.73, 10, 5.03, 38.71, 43.73],
  ];
  expected.forEach(([year, eff, gross, puz, ruz, eu, total], i) => {
    const r = table[i];
    if (r.year !== year) throw new Error("yil tartibi");
    near(r.effPrice, eff, 0.0051, `${year} samarali narx`); // 42,195 → 42,20 (yarim birlik yaxlitlash)
    near(r.gross / 1e6, gross, 0.006, `${year} CBAM yalpi`);
    near(pUzByYear[year], puz, 0, `${year} P_UZ`);
    near(r.ruz / 1e6, ruz, 0.005, `${year} UZ to'lov`);
    near(r.eu / 1e6, eu, 0.006, `${year} EI ga to'lov`);
    near(r.total / 1e6, total, 0.006, `${year} umumiy yuk`);
  });
  // 2026–2027: milliy to'lov EI samarali narxidan oshadi → siyosat signali, yuk 1,4 va 0,3 mln ga oshadi
  near(table[0].extraBurden / 1e6, 1.42, 0.01, "2026 qo'shimcha yuk");
  near(table[1].extraBurden / 1e6, 0.32, 0.01, "2027 qo'shimcha yuk");
  if (!table[0].signal || !table[1].signal || table[2].signal) throw new Error("siyosat signali noto'g'ri");
});

test("A.3 — 1 000 t kulrang portlandsement, 2027, standart qiymat: SEE 1,692; EE 1 692", () => {
  const ref = refStub();
  const tif = ref.get("tif.2523290000");
  const mu = C.markupFor("cement", 2027, k => ref.get(k));
  const see = C.defaultSee({ dv: tif.dvTot, mu });
  within(see, 1.692, 0.001, "SEE");
  within(C.embedded({ mass: 1000, see }), 1692, 0.001, "EE");
});

test("5.7 misoli — kulrang portlandsement 1,41 → 2026: 1,551; 2028: 1,833; 2030 ham 1,833", () => {
  const ref = refStub(); const get = k => ref.get(k);
  within(C.defaultSee({ dv: 1.41, mu: C.markupFor("cement", 2026, get) }), 1.551);
  within(C.defaultSee({ dv: 1.41, mu: C.markupFor("cement", 2028, get) }), 1.833);
  within(C.defaultSee({ dv: 1.41, mu: C.markupFor("cement", 2030, get) }), 1.833);
  within(C.defaultSee({ dv: 2.67, mu: C.markupFor("fertilizer", 2028, get) }), 2.6967, 0.001, "o'g'it 1%");
});

test("A.4 — benzin: EF = 3,26 t CO2/t; 5 USD va 12 100 so'mda T ≈ 197 000 so'm/t", () => {
  const ref = refStub();
  const f = ref.get("fuel.petrol");
  const ef = C.fuelEfPerTonne({ ncvGJ: f.ncvGJ, efKgGJ: f.efKgGJ, densityTperM3: f.densityTperM3, perVolume: true });
  within(ef, 1000 / 0.74 * 2.409 / 1000, 0.001, "EF");
  near(ef, 3.26, 0.005, "EF yaxlitlangan");
  within(C.fuelRate({ pUsd: 5, efPerUnit: ef, fx: 12100 }), 197000, 0.001, "T_f");
});

test("6.2 — dizel misoli: 10 000 l × 2,68 kg/l × 5 USD × 12 800 = 1 715 200 so'm", () => {
  const em = 10000 * 2.68 / 1000;
  within(C.upstreamTax([{ q: em, rate: C.toUzs({ pUsd: 5, fx: 12800 }) }]), 1715200, 0.000001);
});

test("6.2 — AI-80 yashirin uglerod narxi ≈ 27 USD/t CO2", () => {
  const p = C.implicitPrice({ exciseUzsPerT: 375000 + 700000, fx: 12100, efPerT: 3.26 });
  near(p, 27.25, 0.01);
});

test("Ilova B — yonish emissiyasi koeffitsientlari (kg/m³, kg/t)", () => {
  const ref = refStub();
  const cases = [["petrol", 2409], ["diesel", 2738], ["lpg", 1512], ["mazut", 3080], ["coal", 2940], ["natural_gas", 2128]];
  for (const [k, expected] of cases) {
    const f = ref.get("fuel." + k);
    // 1 birlik yoqilg'i: Em (t) = 1 · NCV(TJ) · EF(t/TJ) → kg
    const kg = C.combustion({ ad: 1, ncv: f.ncvGJ / 1000, ef: f.efKgGJ }) * 1000;
    within(kg, expected, 0.0001, k);
  }
});

test("ITMO (F-6.7): ER = BE − PE − LE, 80% savdoga, 20% bufer", () => {
  const r = C.itmo({ be: 1000, pe: 600, le: 50 });
  within(r.er, 350); within(r.trade, 280); within(r.buffer, 70);
});
