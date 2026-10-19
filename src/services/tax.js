/*
 * M5 — milliy uglerod narxi va soliq: yoqilg'i stavkalari (F-6.2), deklaratsiya loyihasi (F-6.2/6.3),
 * samarali to'langan narx P_eff va tovar birligiga CP_g (F-6.4), daromad prognozi (F-6.2c).
 */
"use strict";
const core = require("../core");
const { computeProcess } = require("./calc");

const QUARTER_MONTHS = { Q1: [1, 2, 3], Q2: [4, 5, 6], Q3: [7, 8, 9], Q4: [10, 11, 12] };

function rateUsd(ref, year) {
  const v = ref.get(`tax.rate_usd.${year}`);
  if (typeof v !== "number") throw Object.assign(new Error(`${year}-yil uchun milliy stavka ma'lumotnomada yo'q.`), { status: 400 });
  return v;
}

/** Barcha yoqilg'ilar uchun birlikka stavka (F-6.2a/b) va amaldagi aksizning yashirin narxi (F-6.2d). */
function fuelRates(s, year) {
  const ref = s.ref.snapshot(`${year}-12-31`);
  const pUsd = rateUsd(ref, year), fx = ref.get("fx.USD");
  const fuels = ref.keys("fuel.").map(k => {
    const f = ref.get(k);
    const perUnitT = f.ncvGJ * f.efKgGJ / 1000; // t CO2 / ma'lumotnoma birligi
    const efPerT = f.unit === "t" ? perUnitT : f.unit === "m3" && f.densityTperM3 ? core.fuelEfPerTonne({ ncvGJ: f.ncvGJ, efKgGJ: f.efKgGJ, densityTperM3: f.densityTperM3, perVolume: true }) : null;
    return { key: k.slice(5), name: f.name, unit: f.unit, efPerUnit: perUnitT, ratePerUnit: core.fuelRate({ pUsd, efPerUnit: perUnitT, fx }),
      efPerT, ratePerT: efPerT != null ? core.fuelRate({ pUsd, efPerUnit: efPerT, fx }) : null, source: f.source };
  });
  const implicit = ref.keys("excise.").map(k => {
    const e = ref.get(k), f = ref.get("fuel." + e.fuelKey);
    const efPerT = f && f.unit === "m3" ? core.fuelEfPerTonne({ ncvGJ: f.ncvGJ, efKgGJ: f.efKgGJ, densityTperM3: f.densityTperM3, perVolume: true }) : f ? f.ncvGJ * f.efKgGJ / 1000 : null;
    return { key: k, fuel: f?.name, exciseUzsPerT: e.uzsPerT, note: e.note, implicitUsdPerT: efPerT ? core.implicitPrice({ exciseUzsPerT: e.uzsPerT, fx, efPerT }) : null };
  });
  return { year, pUsd, fx, pUzs: core.toUzs({ pUsd, fx }), fuels, implicit, refs: ref.usedList() };
}

/** Jarayon natijasidan soliq qamrab oladigan emissiya (rejimga qarab). */
function coveredEmission(r, mode) {
  const t = r.totals;
  const proc = t.process + t.massBalance + t.nonCo2 + t.cems + t.directManual;
  if (mode === "up") return t.combustion;
  if (mode === "down1") return proc;
  return t.combustion + proc; // down2
}

/**
 * Uglerod soliqi deklaratsiyasi loyihasi (M5.3): inshoot, yil, chorak (ixtiyoriy), variant.
 */
function declaration(s, installationId, year, quarter, variant) {
  const ref = s.ref.snapshot(`${year}-12-31`);
  const mode = variant || ref.get("tax.mode") || "up";
  const pUsd = rateUsd(ref, year), fx = ref.get("fx.USD"), sFeed = ref.get("tax.s_feed");
  const months = quarter ? QUARTER_MONTHS[quarter] : null;
  const procs = s.db.all("SELECT id FROM processes WHERE installation_id = ? ORDER BY name", installationId);
  const lines = [];
  let emComb = 0, emProc = 0;
  for (const p of procs) {
    const r = computeProcess(s, p.id, year, { months });
    const proc = r.totals.process + r.totals.massBalance + r.totals.nonCo2 + r.totals.cems + r.totals.directManual;
    emComb += r.totals.combustion; emProc += proc;
    lines.push({ processId: p.id, processName: r.processName, emComb: r.totals.combustion, emProc: proc, warnings: r.warnings.filter(w => w.includes("konservativ") || w.includes("kiritilmagan")) });
  }
  const period = quarter ? `${year}-${quarter}` : String(year);
  const paidUp = s.db.all("SELECT amount_uzs, rebate_uzs FROM tax_payments WHERE installation_id = ? AND year = ? AND kind = 'up' AND status IN ('paid','confirmed') AND (? IS NULL OR period = ?)",
    installationId, year, quarter ? period : null, period).reduce((a, x) => a + x.amount_uzs - x.rebate_uzs, 0);
  const trace = new core.Trace();
  const up = core.upstreamTax([{ q: emComb, rate: core.toUzs({ pUsd, fx }, trace) }], trace);
  let due;
  if (mode === "up") due = up;
  else if (mode === "down1") due = core.downstreamTax1({ emProc, pUsd, fx }, trace);
  else due = core.downstreamTax2({ emComb, emProc, pUsd, fx, upPaid: paidUp }, trace);
  const refund = core.feedstockRefund({ upPaid: paidUp, sFeed }, trace);
  return {
    installationId, year, quarter: quarter || null, period, mode, pUsd, fx, lines,
    emComb, emProc, covered: mode === "up" ? emComb : mode === "down1" ? emProc : emComb + emProc,
    upstreamEstimate: up, upstreamPaid: paidUp, due, dueUsd: due / fx, potentialRefund: refund,
    budgetCode: mode === "up" ? "UGL-01 (yuqori oqim)" : "UGL-02 (quyi oqim)", trace: trace.steps, refs: ref.usedList(),
  };
}

/** P_eff (F-6.4) va har bir jarayon uchun CP_g, s_cov — inshoot va yil bo'yicha. */
function effective(s, installationId, year, results) {
  const ref = s.ref.snapshot(`${year}-12-31`);
  const mode = ref.get("tax.mode") || "up";
  const pays = s.db.all("SELECT * FROM tax_payments WHERE installation_id = ? AND year = ? AND status IN ('paid','confirmed')", installationId, year);
  const res = results || s.db.all("SELECT id FROM processes WHERE installation_id = ?", installationId).map(p => computeProcess(s, p.id, year));
  const coveredTotal = res.reduce((a, r) => a + coveredEmission(r, mode), 0);
  const declaredCovered = pays.reduce((a, x) => a + (x.covered_t || 0), 0);
  const emCovered = declaredCovered > 0 ? declaredCovered : coveredTotal;
  const trace = new core.Trace();
  const pEff = core.effectivePrice({ payments: pays.map(x => ({ paidUsd: x.amount_uzs / x.fx, rebateUsd: x.rebate_uzs / x.fx })), emCovered }, trace);
  const processes = res.map(r => {
    const seeCov = r.totals.al > 0 ? coveredEmission(r, mode) / r.totals.al : 0;
    // s_cov = SEE_cov / SEE_CBAM — korxonaning haqiqiy emissiyasiga nisbatan (standart qiymat soliq qamrovini o'lchamaydi)
    const seeCbam = Number.isFinite(r.see.seeCbam) ? r.see.seeCbam : r.selection.applied;
    const { cp, sCov } = core.carbonPricePerGood({ seeCov, seeCbam, pEff }, trace);
    return { processId: r.processId, processName: r.processName, seeCov, seeCbam, cpUsdPerT: cp, sCov };
  });
  return { installationId, year, mode, pEff, emCovered, payments: pays.length, paidUsd: pays.reduce((a, x) => a + (x.amount_uzs - x.rebate_uzs) / x.fx, 0), processes, trace: trace.steps };
}

/** Daromad prognozi (F-6.2c): barcha inshootlarning qamrab olingan emissiyasi × stavka × yig'iluvchanlik. */
function revenueForecast(s, baseYear, years) {
  const ref = s.ref.snapshot(`${baseYear}-12-31`);
  const mode = ref.get("tax.mode") || "up";
  let base = 0;
  for (const p of s.db.all("SELECT id FROM processes")) {
    try { base += coveredEmission(computeProcess(s, p.id, baseYear), mode); } catch { /* ma'lumoti yo'q jarayon o'tkazib yuboriladi */ }
  }
  const start = ref.get("tax.k_comp.start_year") || 2026;
  return {
    baseYear, mode, baseCovered: base,
    rows: years.map(y => {
      const r = s.ref.snapshot(`${y}-12-31`);
      const k = r.get(`tax.k_comp.${Math.min(5, Math.max(1, y - start + 1))}`);
      const p = r.get(`tax.rate_usd.${y}`) || 0, fx = r.get("fx.USD");
      return { year: y, pUsd: p, kComp: k, fx, revenueUzs: core.revenueForecast({ emissions: base, pUsd: p, kComp: k, fx }) };
    }),
  };
}

module.exports = { fuelRates, declaration, effective, revenueForecast, coveredEmission, QUARTER_MONTHS };
