/*
 * Milliy uglerod narxi, uglerod soliqi va CBAM to'lovi — TZ-2 6-bo'lim (REJA.md 4.2, F-6.x).
 * Valyutalar: milliy stavka USD/t CO2e, so'm kursi FX (UZS/USD), CBAM sertifikat narxi EUR yoki USD (ssenariyda).
 */
"use strict";
const { NOOP } = require("./trace");

const n = v => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** F-6.1 — stavkani so'mga o'tkazish: P_UZS = P_USD · FX. */
function toUzs({ pUsd, fx }, trace = NOOP) {
  return trace.add("F-6.1", "Stavka so'mda", "P_UZS = P_USD · FX", { P_USD: pUsd, FX: fx }, n(pUsd) * n(fx), "so'm/t CO2e");
}

/**
 * F-6.2a — yoqilg'i birligiga emissiya koeffitsiyenti: EF_f (t CO2/t) = NCV (GJ/t) · EF (kg CO2/GJ) / 1000.
 * Hajm birligida berilgan yoqilg'i uchun zichlik (t/m³) orqali tonnaga o'tkaziladi.
 * @param {{ncvGJ:number, efKgGJ:number, densityTperM3?:number, perVolume?:boolean}} f
 */
function fuelEfPerTonne(f, trace = NOOP) {
  const ncvPerT = f.perVolume ? n(f.ncvGJ) / n(f.densityTperM3) : n(f.ncvGJ);
  const r = ncvPerT * n(f.efKgGJ) / 1000;
  return trace.add("F-6.2a", "Yoqilg'i birligiga EF", "EF_f = NCV_f · EF_f / 1000", { "NCV (GJ/t)": ncvPerT, "EF (kg/GJ)": f.efKgGJ }, r, "t CO2/t");
}

/** F-6.2b — yoqilg'i birligiga stavka: T_f = P_USD · EF_f · FX. */
function fuelRate({ pUsd, efPerUnit, fx }, trace = NOOP) {
  return trace.add("F-6.2b", "Yoqilg'i birligiga stavka", "T_f = P_USD · EF_f · FX", { P_USD: pUsd, EF_f: efPerUnit, FX: fx }, n(pUsd) * n(efPerUnit) * n(fx), "so'm/birlik");
}

/** F-6.2c — yuqori oqim soliq majburiyati: Tax_up = Σ Q_f · T_f. */
function upstreamTax(fuels, trace = NOOP) {
  const r = (fuels || []).reduce((a, f) => a + n(f.q) * n(f.rate), 0);
  return trace.add("F-6.2c", "Yuqori oqim soliq majburiyati", "Tax_up = Σ Q_f · T_f", { yoqilg_ilar: (fuels || []).length }, r, "so'm");
}

/** F-6.2c — daromad prognozi yig'iluvchanlik bilan: R_t = Σ Em_f · P_t · k_comp · FX. */
function revenueForecast({ emissions, pUsd, kComp, fx }, trace = NOOP) {
  return trace.add("F-6.2c", "Daromad prognozi", "R_t = Σ Em_f,t · P_t · k_comp,t · FX_t", { Em: emissions, P: pUsd, k_comp: kComp, FX: fx },
    n(emissions) * n(pUsd) * n(kComp) * n(fx), "so'm");
}

/** F-6.2d — amaldagi aksizning yashirin uglerod narxi: P_impl = Excise / (FX · EF_f). */
function implicitPrice({ exciseUzsPerT, fx, efPerT }, trace = NOOP) {
  const d = n(fx) * n(efPerT);
  return trace.add("F-6.2d", "Yashirin uglerod narxi", "P_impl = Excise_f / (FX · EF_f)", { Excise: exciseUzsPerT, FX: fx, EF_f: efPerT }, d > 0 ? n(exciseUzsPerT) / d : 0, "USD/t CO2");
}

/** F-6.3a — quyi oqim, 1-variant (faqat texnologik emissiya): Tax = Em_proc · P_UZ · FX. */
function downstreamTax1({ emProc, pUsd, fx }, trace = NOOP) {
  return trace.add("F-6.3a", "Quyi oqim soliq (1-variant)", "Tax_down,1 = Em_proc · P_UZ · FX", { Em_proc: emProc, P_UZ: pUsd, FX: fx }, n(emProc) * n(pUsd) * n(fx), "so'm");
}

/** F-6.3b — quyi oqim, 2-variant (barcha emissiya, yuqori oqimda to'langan qism chegiriladi). */
function downstreamTax2({ emComb, emProc, pUsd, fx, upPaid }, trace = NOOP) {
  const r = Math.max(0, (n(emComb) + n(emProc)) * n(pUsd) * n(fx) - n(upPaid));
  return trace.add("F-6.3b", "Quyi oqim soliq (2-variant)", "Tax_down,2 = (Em_comb + Em_proc) · P_UZ · FX − Tax_up,paid",
    { Em_comb: emComb, Em_proc: emProc, P_UZ: pUsd, FX: fx, Tax_up_paid: upPaid }, r, "so'm");
}

/** F-6.3c — xomashyo sifatidagi yoqilg'i bo'yicha qaytarish: Refund = Tax_up,paid · s_feed. */
function feedstockRefund({ upPaid, sFeed }, trace = NOOP) {
  return trace.add("F-6.3c", "Xomashyo yoqilg'isi bo'yicha qaytarish", "Refund = Tax_up,paid · s_feed", { Tax_up_paid: upPaid, s_feed: sFeed }, n(upPaid) * n(sFeed), "so'm");
}

/**
 * F-6.4 — samarali to'langan uglerod narxi (CBAM 9-modda):
 * P_eff = Σ (Tax_paid − Rebate) / Em_covered   (USD/t CO2e)
 * @param {{payments:Array<{paidUsd:number, rebateUsd?:number}>, emCovered:number}} p
 */
function effectivePrice({ payments, emCovered }, trace = NOOP) {
  const net = (payments || []).reduce((a, x) => a + n(x.paidUsd) - n(x.rebateUsd), 0);
  const r = n(emCovered) > 0 ? net / n(emCovered) : 0;
  return trace.add("F-6.4", "Samarali to'langan narx", "P_eff = Σ (Tax_paid − Rebate) / Em_covered", { "Σ (Tax − Rebate), USD": net, Em_covered: emCovered }, r, "USD/t CO2e");
}

/** F-6.4 — tovar birligiga to'langan narx va qamrov ulushi: CP_g = SEE_cov · P_eff; s_cov = SEE_cov / SEE_CBAM. */
function carbonPricePerGood({ seeCov, seeCbam, pEff }, trace = NOOP) {
  const cp = trace.add("F-6.4", "Tovar birligiga to'langan narx", "CP_g = SEE_cov · P_eff", { SEE_cov: seeCov, P_eff: pEff }, n(seeCov) * n(pEff), "USD/t");
  const sCov = n(seeCbam) > 0 ? n(seeCov) / n(seeCbam) : 0;
  trace.add("F-6.4", "Qamrov ulushi", "s_cov = SEE_cov / SEE_CBAM", { SEE_cov: seeCov, SEE_CBAM: seeCbam }, sCov, "");
  return { cp, sCov };
}

/**
 * F-6.5a — CBAM majburiyati (aniq formula, benchmark ma'lum):
 * N_cert = Σ m_s·(SEE_CBAM − BM_g·CF_t) − Σ m_s·CP_g·FX_EUR / P_CBAM ;  Cost = max(0, N_cert) · P_CBAM
 * @param {{batches:Array<{m:number, see:number, bm:number, cpUsd?:number}>, cf:number, pCbamEur:number, usdToEur:number}} p
 */
function cbamExact({ batches, cf, pCbamEur, usdToEur }, trace = NOOP) {
  const gross = (batches || []).reduce((a, b) => a + n(b.m) * (n(b.see) - n(b.bm) * n(cf)), 0);
  const ded = n(pCbamEur) > 0 ? (batches || []).reduce((a, b) => a + n(b.m) * n(b.cpUsd) * n(usdToEur), 0) / n(pCbamEur) : 0;
  const nCert = trace.add("F-6.5a", "CBAM sertifikatlari soni", "N_cert = Σ m·(SEE − BM·CF) − Σ m·CP·FX_EUR / P_CBAM",
    { "Σ m·(SEE − BM·CF)": gross, "chegirma (sertifikat)": ded, CF_t: cf, P_CBAM: pCbamEur }, gross - ded, "dona");
  const cost = trace.add("F-6.5a", "CBAM xarajati", "Cost = max(0, N_cert) · P_CBAM", { N_cert: nCert, P_CBAM: pCbamEur }, Math.max(0, nCert) * n(pCbamEur), "EUR");
  return { nCert, cost, grossCerts: gross, deductionCerts: ded };
}

/** F-6.5b — soddalashtirilgan (ssenariy) formula: Cost_t = EE · P_ETS · (1 − CF_t). */
function cbamSimplified({ ee, pEts, cf }, trace = NOOP) {
  return trace.add("F-6.5b", "CBAM yalpi (soddalashtirilgan)", "Cost_t = EE · P_ETS · (1 − CF_t)", { EE: ee, P_ETS: pEts, CF_t: cf }, n(ee) * n(pEts) * (1 - n(cf)), "valyuta");
}

/**
 * F-6.5b + F-6.5c — bir yil ssenariysi (TZ-2 Ilova A.2 yondashuvi).
 * O'zbekistonda to'lov R_UZ = EE · P_UZ · s_cov; EI ga to'lov = max(0, yalpi − R_UZ); umumiy yuk = R_UZ + EI ga to'lov.
 * Milliy to'lov EI dagi samarali narxdan oshsa — siyosat signali (M6.8).
 */
function scenarioYear({ year, ee, pEts, cf, pUz, sCov = 1 }) {
  const effPrice = n(pEts) * (1 - n(cf));
  const gross = cbamSimplified({ ee, pEts, cf });
  const ruz = n(ee) * n(pUz) * n(sCov);
  const eu = Math.max(0, gross - ruz);
  const total = ruz + eu;
  return { year, effPrice, gross, ruz, eu, total, signal: ruz > gross, extraBurden: Math.max(0, ruz - gross) };
}

/**
 * 2026–2034 ssenariy jadvali.
 * @param {{ee:number, pEts:number, cfByYear:Record<number,number>, pUzByYear:Record<number,number>, sCov?:number,
 *          years?:number[], exportGrowth?:number, seeChange?:number}} p
 *  exportGrowth — yillik eksport hajmi o'zgarishi (0.05 = +5%), seeChange — yillik SEE o'zgarishi (−0.02 = −2%)
 */
function scenarioTable({ ee, pEts, cfByYear, pUzByYear, sCov = 1, years, exportGrowth = 0, seeChange = 0, baseYear }) {
  const ys = years || [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034];
  const y0 = baseYear || ys[0];
  return ys.map(year => {
    const k = Math.pow(1 + exportGrowth, year - y0) * Math.pow(1 + seeChange, year - y0);
    return scenarioYear({ year, ee: ee * k, pEts, cf: n(cfByYear[year]), pUz: n(pUzByYear[year]), sCov });
  });
}

/** F-6.6 — uglerod xarajati intensivligi: CCI = SEE · P / p_g;  RCCI = (SEE_firm − SEE_EU) · P / p_g. */
function cci({ see, price, exportPrice }, trace = NOOP) {
  return trace.add("F-6.6", "Uglerod xarajati intensivligi", "CCI = SEE · P / p_g", { SEE: see, P: price, p_g: exportPrice }, n(exportPrice) > 0 ? n(see) * n(price) / n(exportPrice) : 0, "");
}
function rcci({ seeFirm, seeEu, price, exportPrice }, trace = NOOP) {
  return trace.add("F-6.6", "Nisbiy uglerod xarajati intensivligi", "RCCI = (SEE_firm − SEE_EU) · P / p_g",
    { SEE_firm: seeFirm, SEE_EU: seeEu, P: price, p_g: exportPrice }, n(exportPrice) > 0 ? (n(seeFirm) - n(seeEu)) * n(price) / n(exportPrice) : 0, "");
}

/**
 * Ta'sirchanlik tahlili (TZ-2 6.6): bitta parametrni ± o'zgartirib, natijaning o'zgarishini hisoblaydi.
 * @param {(params:object)=>number} fn
 * @param {object} base
 * @param {Record<string, number[]>} variations parametr → nisbiy o'zgarishlar (masalan [-0.1, 0.1])
 */
function sensitivity(fn, base, variations) {
  const baseValue = fn(base);
  const rows = [];
  for (const [param, deltas] of Object.entries(variations)) {
    for (const d of deltas) {
      const v = fn({ ...base, [param]: base[param] * (1 + d) });
      rows.push({ param, delta: d, value: v, change: v - baseValue, changePct: baseValue ? (v - baseValue) / baseValue : 0 });
    }
  }
  return { baseValue, rows };
}

/** F-6.7 — ITMO: ER = BE − PE − LE; savdoga 80%, bufer (saqlab qolinadi) 20% (PF-110). */
function itmo({ be, pe, le, tradeShare = 0.8 }, trace = NOOP) {
  const er = trace.add("F-6.7", "Emissiya kamayishi", "ER_y = BE_y − PE_y − LE_y", { BE: be, PE: pe, LE: le }, n(be) - n(pe) - n(le), "t CO2e");
  return { er, trade: er * tradeShare, buffer: er * (1 - tradeShare) };
}

module.exports = {
  toUzs, fuelEfPerTonne, fuelRate, upstreamTax, revenueForecast, implicitPrice,
  downstreamTax1, downstreamTax2, feedstockRefund, effectivePrice, carbonPricePerGood,
  cbamExact, cbamSimplified, scenarioYear, scenarioTable, cci, rcci, sensitivity, itmo,
};
