/*
 * Standart (default) qiymatlar va mark-up — TZ-2 5.7 (F-5.7) hamda haqiqiy/standart tanlash qoidasi (M4.4).
 */
"use strict";
const { NOOP } = require("./trace");

/**
 * Yil ustamasi (mark-up). Ma'lumotnomada `cbam.markup.<group>.<year>` kalitlari 2026, 2027, 2028 uchun turadi;
 * 2028 dan keyingi yillar 2028 qiymatini oladi, 2026 dan oldingi yillar — 0 (o'tish davri).
 * @param {(key:string)=>any} get ma'lumotnoma qiymatini olish funksiyasi
 */
function markupFor(group, year, get) {
  if (year < 2026) return 0;
  const y = Math.min(year, 2028);
  const v = get(`cbam.markup.${group}.${y}`);
  if (typeof v !== "number") throw new Error(`Ma'lumotnomada mark-up yo'q: cbam.markup.${group}.${y}`);
  return v;
}

/** F-5.7 — SEE_def(t) = DV_tot · (1 + mu_t). */
function defaultSee({ dv, mu }, trace = NOOP) {
  return trace.add("F-5.7", "Standart SEE (ustama bilan)", "SEE_def = DV_tot · (1 + mu_t)", { DV_tot: dv, mu_t: mu }, dv * (1 + mu), "t CO2e/t");
}

/**
 * Haqiqiy va standart qiymatni tanlash (M4.4):
 *  - verifikatsiyalangan haqiqiy ma'lumot bo'lsa → haqiqiy SEE;
 *  - bo'lmasa → standart qiymat (ustama bilan);
 *  - standart qiymat yo'q ("−" yoki jadvalda mavjud emas) → faqat haqiqiy ma'lumot, ogohlantirish bilan.
 * @param {{actual:number, verified:boolean, tif?:{dvStatus:string, dvTot:number}|null, mu:number}} p
 */
function selectSee({ actual, verified, tif, mu }, trace = NOOP) {
  const hasActual = Number.isFinite(actual);
  const warnings = [];
  let def = null;
  if (tif && tif.dvStatus === "value" && Number.isFinite(tif.dvTot)) def = defaultSee({ dv: tif.dvTot, mu }, trace);
  else if (tif && tif.dvStatus === "none") warnings.push("Bu TIF TN kodi uchun standart qiymat belgilanmagan (\"−\"): faqat haqiqiy ma'lumot bilan hisoblanadi.");
  else warnings.push("TIF TN kodi uchun standart qiymat ma'lumotnomada yo'q (jadval import qilinmagan).");

  let applied, basis;
  if (hasActual && verified) { applied = actual; basis = "actual"; }
  else if (def != null) {
    applied = def; basis = "default";
    if (hasActual) warnings.push("Haqiqiy ma'lumot hali verifikatsiyadan o'tmagan: rasmiy hisobda standart qiymat qo'llanadi.");
  } else if (hasActual) {
    applied = actual; basis = "actual_unverified";
    warnings.push("Verifikatsiyalanmagan haqiqiy ma'lumot ishlatilmoqda — CBAM hujjatiga kiritishdan oldin verifikatsiya talab qilinadi.");
  } else { applied = NaN; basis = "none"; warnings.push("SEE ni aniqlab bo'lmaydi: haqiqiy ma'lumot ham, standart qiymat ham yo'q."); }

  return { applied, basis, actual: hasActual ? actual : null, default: def, warnings };
}

module.exports = { markupFor, defaultSee, selectSee };
