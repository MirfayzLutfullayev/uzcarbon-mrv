/* Hisob yadrosining birlik testlari: formulalar (F-5.x, F-6.x) va jarayon hisobi. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core");
const { refStub, within } = require("./helpers");

test("F-5.3b massa balansi: 44/12 · (kirish C − chiqish C)", () => {
  within(C.massBalance({ inputs: [{ ad: 100, c: 0.9 }], outputs: [{ ad: 1000, c: 0.002 }] }), 3.664 * (90 - 2));
});

test("F-5.3c klinker EF: CaO/MgO bo'yicha va standart", () => {
  within(C.clinkerEf({ wCaO: 0.65, wMgO: 0.02, defaultEf: 0.525 }), 0.65 * 0.785 + 0.02 * 1.092);
  within(C.clinkerEf({ defaultEf: 0.525 }), 0.525);
});

test("F-5.3d CO2e: N2O, CF4, C2F6 GWP bilan", () => {
  within(C.co2e({ co2: 10, n2o: 1, cf4: 0.01, c2f6: 0.001 }, { N2O: 265, CF4: 6630, C2F6: 11100 }), 10 + 265 + 66.3 + 11.1);
});

test("F-5.4 CEMS: Σ c·V·10⁻⁶", () => {
  within(C.cems([{ c: 2, v: 1e6 }, { c: 1, v: 5e5 }]), 2.5);
});

test("F-5.5b va F-5.6a: o'z generatsiyasi EF va issiqlik EF", () => {
  within(C.ownElectricityEf({ fuelEm: 500, produced: 1000 }), 0.5);
  within(C.heatEf({ fuelEm: 56.1, qProd: 0.9, eta: 0.9 }), 56.1);
});

test("F-5.6e: bilvosita emissiya faqat sement va o'g'itda CBAM ga kiradi", () => {
  assert.equal(C.seeCbam("cement", { seeDir: 1, seeInd: 0.1 }), 1.1);
  assert.equal(C.seeCbam("fertilizer", { seeDir: 1, seeInd: 0.1 }), 1.1);
  for (const g of ["iron_steel", "aluminium", "hydrogen"]) assert.equal(C.seeCbam(g, { seeDir: 1, seeInd: 0.1 }), 1);
});

test("F-5.9 konservativ to'ldirish: max (emissiya) va min (mahsulot)", () => {
  const a = C.conservativeFill([10, null, 30, 20, null, 10, 10, 10, 10, 10, 10, 10]);
  assert.deepEqual(a.filled, [2, 5]); assert.equal(a.values[1], 30);
  const b = C.conservativeFill([10, null, 30], "min");
  assert.equal(b.values[1], 10); assert.equal(b.missing, 10);
});

test("Haqiqiy/standart tanlash qoidasi (M4.4)", () => {
  const tif = { dvStatus: "value", dvTot: 1.41 };
  assert.equal(C.selectSee({ actual: 0.9, verified: true, tif, mu: 0.1 }).basis, "actual");
  const d = C.selectSee({ actual: 0.9, verified: false, tif, mu: 0.1 });
  assert.equal(d.basis, "default"); within(d.applied, 1.551);
  const none = C.selectSee({ actual: 3, verified: false, tif: { dvStatus: "none" }, mu: 0.1 });
  assert.equal(none.basis, "actual_unverified"); assert.ok(none.warnings.length >= 2);
});

test("F-6.3 va F-6.4: quyi oqim variantlari, qaytarish, samarali narx", () => {
  within(C.downstreamTax1({ emProc: 1000, pUsd: 5, fx: 12100 }), 60_500_000);
  within(C.downstreamTax2({ emComb: 500, emProc: 1000, pUsd: 5, fx: 12100, upPaid: 30_250_000 }), 60_500_000);
  within(C.feedstockRefund({ upPaid: 100, sFeed: 0.7 }), 70);
  within(C.effectivePrice({ payments: [{ paidUsd: 5000, rebateUsd: 1000 }], emCovered: 1000 }), 4);
  const { cp, sCov } = C.carbonPricePerGood({ seeCov: 0.5, seeCbam: 2, pEff: 4 });
  within(cp, 2); within(sCov, 0.25);
});

test("F-6.5a aniq formula: benchmark va milliy narx chegirmasi", () => {
  const r = C.cbamExact({ batches: [{ m: 1000, see: 2, bm: 1.5, cpUsd: 5 }], cf: 0.9, pCbamEur: 75, usdToEur: 12100 / 14500 });
  const gross = 1000 * (2 - 1.5 * 0.9), ded = 1000 * 5 * (12100 / 14500) / 75;
  within(r.nCert, gross - ded); within(r.cost, (gross - ded) * 75);
});

test("Ta'sirchanlik tahlili: ETS narxi +10% → xarajat +10%", () => {
  const s = C.sensitivity(p => C.cbamSimplified({ ee: p.ee, pEts: p.pEts, cf: 0.5 }), { ee: 1000, pEts: 80 }, { pEts: [-0.1, 0.1] });
  within(s.rows[1].changePct, 0.1);
});

/* ---------- Jarayon hisobi ---------- */
const months = (v) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, { value: typeof v === "function" ? v(i + 1) : v }]));

test("Jarayon hisobi: sement — yoqish, klinker (lab CaO/MgO), elektr, mahsulot; standart qiymat bilan taqqoslash", () => {
  const ref = refStub();
  const process = { id: "p1", name: "Sement", goodsGroup: "cement", tifCode: "2523290000" };
  const streams = [
    { id: "s1", name: "Tabiiy gaz", type: "fuel", fuelKey: "natural_gas", unit: "1000m3" },
    { id: "s2", name: "Klinker", type: "clinker" },
    { id: "s3", name: "Elektr", type: "electricity", efSource: "grid" },
    { id: "s4", name: "Sement", type: "product" },
  ];
  const clinker = months(100000);
  for (const m of Object.keys(clinker)) clinker[m].extra = { wCaO: 65, wMgO: 2 };
  const activity = { s1: months(10000), s2: clinker, s3: months(12000), s4: months(125000) };
  const r = C.calculateProcess({ process, streams, activity, year: 2026, ref });
  const comb = 120000 * 0.038 * 56, proc = 1.2e6 * (0.65 * 0.785 + 0.02 * 1.092), el = 144000 * 0.5;
  within(r.totals.combustion, comb); within(r.totals.process, proc); within(r.totals.emEl, el);
  within(r.see.seeDir, (comb + proc) / 1.5e6); within(r.see.seeCbam, (comb + proc + el) / 1.5e6);
  assert.equal(r.selection.basis, "default"); within(r.selection.default, 1.551);
  assert.ok(r.trace.length > 5);
});

test("Jarayon hisobi: bo'sh oylar konservativ to'ldiriladi va ogohlantiriladi", () => {
  const ref = refStub();
  const process = { id: "p1", name: "Po'lat", goodsGroup: "iron_steel", tifCode: "7214200000" };
  const streams = [{ id: "f", name: "Gaz", type: "fuel", fuelKey: "natural_gas" }, { id: "o", name: "Prokat", type: "product" }];
  const gas = months(m => (m === 3 ? 200 : 100)); delete gas[5];
  const out = months(1000); delete out[5];
  const r = C.calculateProcess({ process, streams, activity: { f: gas, o: out }, year: 2026, ref });
  within(r.lines[0].annual, 100 * 10 + 200 + 200); // 5-oy max (200) bilan
  within(r.totals.al, 12000);
  assert.ok(r.warnings.some(w => w.includes("konservativ")));
  assert.equal(r.dataQuality.monthsMissing, 2);
});

test("Jarayon hisobi: rekursiv prekursor zanjiri va sikl aniqlash", () => {
  const ref = refStub();
  const procs = {
    ammonia: { process: { id: "ammonia", name: "Ammiak", goodsGroup: "fertilizer", tifCode: "2814100000" },
      streams: [{ id: "g", name: "Gaz", type: "fuel", fuelKey: "natural_gas" }, { id: "a", name: "Ammiak", type: "product" }],
      activity: { g: months(100), a: months(10) } },
    an: { process: { id: "an", name: "Ammiakli selitra", goodsGroup: "fertilizer", tifCode: "3102300000" },
      streams: [{ id: "n", name: "N2O", type: "gas", gas: "N2O" }, { id: "pa", name: "Ammiak", type: "precursor", precursorSource: "internal", precursorProcessId: "ammonia" },
        { id: "o", name: "AS", type: "product" }],
      activity: { n: months(0.1), pa: months(5), o: months(20) } },
  };
  const run = (id, visited) => {
    const d = procs[id];
    return C.calculateProcess({ ...d, year: 2026, ref, visited, resolvePrecursor: (pid, v) => { const r = run(pid, v); return { seeDir: r.see.seeDir, seeInd: r.see.seeInd, name: r.processName }; } });
  };
  const amm = run("ammonia");
  const an = run("an");
  const ammSee = (1200 * 0.038 * 56) / 120;
  within(amm.see.seeDir, ammSee);
  within(an.see.seeDir, (1.2 * 265 + 60 * ammSee) / 240);
  // sikl
  procs.ammonia.streams.push({ id: "x", name: "AS qaytadan", type: "precursor", precursorSource: "internal", precursorProcessId: "an" });
  procs.ammonia.activity.x = months(1);
  assert.throws(() => run("an"), /sikl/);
});

test("Jarayon hisobi: standart qiymati \"−\" bo'lgan kod faqat haqiqiy ma'lumot bilan", () => {
  const ref = refStub();
  const r = C.calculateProcess({
    process: { id: "pi", name: "Cho'yan", goodsGroup: "iron_steel", tifCode: "7201100000" },
    streams: [{ id: "c", name: "Koks", type: "fuel", fuelKey: "coke" }, { id: "o", name: "Cho'yan", type: "product" }],
    activity: { c: months(50), o: months(100) }, year: 2026, ref,
  });
  assert.equal(r.selection.basis, "actual_unverified");
  assert.ok(r.warnings.some(w => w.includes("−")));
});
