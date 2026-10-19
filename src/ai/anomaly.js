/*
 * AI-3 — anomaliyalarni aniqlash: qoidalar (diapazon, massa balansi, eksport > ishlab chiqarish, standart qiymatdan og'ish),
 * statistik nazorat (oylik SEE ning median/MAD bo'yicha og'ishi) va Isolation Forest (ko'p o'lchovli).
 * AI-5 — bo'shliqlarni to'ldirish takliflari; AI-4 — manbalarni moslashtirish.
 * Har bir natija asosiy omillar bilan tushuntiriladi; inson tasdiqlaydi yoki rad etadi (ai_log).
 */
"use strict";
const crypto = require("crypto");
const core = require("../core");
const { isolationForest } = require("./iforest");
const { streamsOf, activityOf } = require("../services/calc");

const MODEL = { name: "uzc-anomaly", version: "1.0.0" };
const idOf = (...parts) => crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);

/** Oylik ko'rsatkichlar: har oy uchun alohida hisob (to'ldirishsiz). */
function monthlyMetrics(s, processId, year) {
  const pr = s.db.get("SELECT * FROM processes WHERE id = ?", processId);
  // Prekursorlar oylik intensivlik ko'rsatkichlariga kirmaydi (ular boshqa jarayon anomaliyasi sifatida tekshiriladi).
  const streams = streamsOf(s.db, processId).filter(st => st.type !== "precursor");
  const activity = activityOf(s.db, processId, year);
  const ref = s.ref.snapshot(`${year}-12-31`);
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const has = streams.some(st => activity[st.id] && activity[st.id][m]);
    if (!has) continue;
    try {
      const r = core.calculateProcess({ process: { id: pr.id, name: pr.name, goodsGroup: pr.goods_group, tifCode: pr.tif_code }, streams, activity, year, ref, months: [m],
        resolvePrecursor: () => ({ seeDir: 0, seeInd: 0 }) });
      const T = r.totals;
      const tj = r.lines.filter(l => l.type === "fuel").reduce((a, l) => a + (l.tj || 0), 0);
      const mwh = r.lines.filter(l => l.type === "electricity").reduce((a, l) => a + l.annual, 0);
      const clinker = r.lines.filter(l => l.type === "clinker").reduce((a, l) => a + l.annual, 0);
      out.push({ year, month: m, al: T.al, dirEm: T.dirEm, see: T.al > 0 ? (T.attrDir + T.emEl) / T.al : NaN, tjPerT: T.al > 0 ? tj / T.al : NaN,
        kwhPerT: T.al > 0 ? (mwh * 1000) / T.al : NaN, clinker, gjPerClinker: clinker > 0 ? (tj * 1000) / clinker : NaN, mb: T.massBalance });
    } catch { /* oylik hisob mumkin bo'lmasa o'tkaziladi */ }
  }
  return { process: pr, months: out };
}

function median(a) { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; }

/** Jarayon-yil uchun anomaliyalar. */
function processAnomalies(s, processId, year) {
  const { process: pr, months } = monthlyMetrics(s, processId, year);
  const out = [];
  const add = (sev, code, title, detail, factors = [], month = null, model = "rules") =>
    out.push({ id: idOf(processId, year, code, month ?? ""), sev, code, title, detail, factors, month, year, processId, processName: pr.name, model, modelVersion: MODEL.version });
  if (!months.length) return out;

  // 1) Tarmoq diapazonlari (sement)
  if (pr.goods_group === "cement") {
    for (const m of months) {
      const cr = m.al > 0 ? m.clinker / m.al : NaN;
      if (Number.isFinite(cr) && m.clinker > 0 && (cr < 0.5 || cr > 0.97)) add("mid", "clinker_ratio", "Klinker koeffitsiyenti odatiy oraliqdan tashqarida", `${m.month}-oy: ${cr.toFixed(2)} (odatda 0,50–0,97).`, [{ name: "klinker/sement", value: cr, expected: "0,50–0,97" }], m.month);
      if (Number.isFinite(m.gjPerClinker) && (m.gjPerClinker < 2.9 || m.gjPerClinker > 4.8)) add("mid", "fuel_per_clinker", "Klinker uchun yoqilg'i sarfi odatiy emas", `${m.month}-oy: ${m.gjPerClinker.toFixed(2)} GJ/t klinker (quruq usulda 2,9–4,8). Hisoblagich va hisob-fakturalarni tekshiring.`, [{ name: "GJ/t klinker", value: m.gjPerClinker, expected: "2,9–4,8" }], m.month);
      if (Number.isFinite(m.kwhPerT) && m.kwhPerT > 0 && (m.kwhPerT < 60 || m.kwhPerT > 160)) add("lo", "kwh_per_t", "Elektr sarfi odatiy emas", `${m.month}-oy: ${m.kwhPerT.toFixed(0)} kVt·soat/t (odatda 60–160).`, [{ name: "kVt·soat/t", value: m.kwhPerT, expected: "60–160" }], m.month);
    }
  }
  // 2) Massa balansi yopilishi: chiqish uglerodi kirishdan katta bo'lmasligi kerak
  for (const m of months) if (m.mb < 0) add("hi", "mass_balance", "Massa balansi yopilmayapti", `${m.month}-oy: chiqishdagi uglerod kirishdagidan ko'p (${m.mb.toFixed(1)} t CO2). O'lchovlar yoki uglerod ulushini tekshiring.`, [{ name: "Em_MB", value: m.mb, expected: "≥ 0" }], m.month);
  // 3) Mahsulot hajmi yo'q, lekin emissiya bor
  for (const m of months) if (!(m.al > 0) && m.dirEm > 0) add("hi", "no_output", "Mahsulot hajmi kiritilmagan", `${m.month}-oy: emissiya ${m.dirEm.toFixed(1)} t, mahsulot hajmi 0 — SEE hisoblanmaydi.`, [{ name: "AL", value: m.al, expected: "> 0" }], m.month);

  // 4) Statistik nazorat (SPC): har bir intensivlik ko'rsatkichi median/MAD bo'yicha; baza — o'tgan yil va joriy yil oylari
  let baseline = months;
  try { baseline = monthlyMetrics(s, processId, year - 1).months.concat(months); } catch { /* o'tgan yil ma'lumoti yo'q */ }
  const SPC = [
    { k: "see", name: "SEE", unit: "t CO2e/t", d: 4, why: "hisoblagich xatosi, birlik xatosi yoki texnologik rejim o'zgarishi" },
    { k: "tjPerT", name: "Yoqilg'i intensivligi", unit: "TJ/t", d: 5, why: "yoqilg'i hisoblagichi, hisob-faktura yoki birlik (ming m³ / m³) xatosi" },
    { k: "gjPerClinker", name: "Klinker uchun yoqilg'i", unit: "GJ/t", d: 2, why: "yoqilg'i yoki klinker hajmi noto'g'ri kiritilgan" },
    { k: "kwhPerT", name: "Elektr intensivligi", unit: "kVt·soat/t", d: 0, why: "elektr hisoblagichi yoki mahsulot hajmi xatosi" },
  ];
  const flagged = new Set();
  for (const c of SPC) {
    const vals = baseline.map(m => m[c.k]).filter(v => Number.isFinite(v) && v > 0);
    if (vals.length < 6) continue;
    const med = median(vals), mad = median(vals.map(v => Math.abs(v - med))) || med * 0.02;
    for (const m of months) {
      const v = m[c.k];
      if (!Number.isFinite(v) || v <= 0) continue;
      const z = 0.6745 * (v - med) / mad, dev = (v - med) / med;
      if (Math.abs(z) > 3.5 && Math.abs(dev) > 0.08 && !flagged.has(m.month)) {
        flagged.add(m.month);
        add(Math.abs(dev) > 0.3 ? "hi" : "mid", c.k === "see" ? "see_jump" : "intensity_jump", `${c.name} boshqa oylardan keskin farq qiladi`,
          `${m.month}-oy: ${v.toFixed(c.d)} ${c.unit} vs mediana ${med.toFixed(c.d)} (${dev > 0 ? "+" : ""}${(dev * 100).toFixed(0)}%, robust z = ${z.toFixed(1)}). Ehtimoliy sabab: ${c.why}.`,
          [{ name: c.name, value: v, expected: med }, { name: "robust z", value: z, expected: "|z| ≤ 3,5" }], m.month, "spc");
      }
    }
  }
  // 5) Isolation Forest — ko'p o'lchovli (SEE, yoqilg'i intensivligi, elektr intensivligi, hajm)
  const feats = months.filter(m => Number.isFinite(m.see) && m.al > 0);
  if (feats.length >= 8) {
    const X = feats.map(m => [m.see, m.tjPerT || 0, m.kwhPerT || 0, m.al]);
    const scores = isolationForest(X, { seed: 7 });
    const names = ["SEE", "TJ/t", "kVt·soat/t", "AL"];
    scores.forEach((sc, i) => {
      if (sc > 0.62 && !flagged.has(feats[i].month)) {
        const meds = names.map((_, j) => median(X.map(x => x[j])));
        const factors = names.map((n, j) => ({ name: n, value: X[i][j], expected: meds[j], dev: meds[j] ? Math.abs(X[i][j] - meds[j]) / Math.abs(meds[j]) : 0 })).sort((a, b) => b.dev - a.dev).slice(0, 2);
        add(sc > 0.7 ? "mid" : "lo", "iforest", "Ko'p o'lchovli g'ayrioddiy oy (Isolation Forest)", `${feats[i].month}-oy: anomaliya balli ${sc.toFixed(2)}. Eng ta'sirli omillar: ${factors.map(f => f.name).join(", ")}.`, factors, feats[i].month, "iforest");
      }
    });
  }
  // 6) Yillik: standart qiymatdan og'ish va eksport > ishlab chiqarish
  try {
    const ref = s.ref.snapshot(`${year}-12-31`);
    const tif = pr.tif_code ? ref.get("tif." + pr.tif_code) : null;
    const totalAl = months.reduce((a, m) => a + (m.al || 0), 0);
    const annualSee = totalAl > 0 ? months.reduce((a, m) => a + (Number.isFinite(m.see) ? m.see * m.al : 0), 0) / totalAl : NaN;
    if (tif && tif.dvStatus === "value" && Number.isFinite(annualSee)) {
      if (annualSee > tif.dvTot * 1.3) add("mid", "above_default", "SEE standart qiymatdan ancha yuqori", `Yillik SEE ${annualSee.toFixed(3)} > standart ${tif.dvTot} × 1,3. Ma'lumotni tekshiring; tasdiqlansa, standart qiymat arzonroq bo'lishi mumkin.`, [{ name: "SEE", value: annualSee, expected: `≤ ${(tif.dvTot * 1.3).toFixed(3)}` }]);
      if (annualSee < tif.dvTot * 0.3) add("lo", "below_default", "SEE juda past", `Yillik SEE ${annualSee.toFixed(3)} < standart × 0,3. Barcha yoqilg'i, prekursor va jarayon oqimlari kiritilganini tekshiring.`, [{ name: "SEE", value: annualSee, expected: `≥ ${(tif.dvTot * 0.3).toFixed(3)}` }]);
    }
    const exported = s.db.all("SELECT net_t FROM batches WHERE process_id = ? AND substr(date,1,4) = ?", processId, String(year)).reduce((a, b) => a + b.net_t, 0);
    if (exported > totalAl * 1.02 && totalAl > 0) add("hi", "export_gt_output", "Eksport hajmi ishlab chiqarishdan katta", `${year}: EI ga eksport ${exported.toFixed(0)} t, ishlab chiqarish ${totalAl.toFixed(0)} t (kiritilgan oylar). Zaxiradan sotilgan bo'lsa, izoh qo'shing.`, [{ name: "eksport/ishlab chiqarish", value: exported / totalAl, expected: "≤ 1,02" }]);
  } catch { /* ma'lumotnoma yo'q bo'lsa o'tkaziladi */ }

  // Inson qarori (tasdiqlangan / rad etilgan) qo'shiladi
  const decisions = new Map(s.db.all("SELECT subject, status, decided_by, decided_at FROM ai_log WHERE kind = 'anomaly' AND subject IN (" + (out.map(() => "?").join(",") || "''") + ")", ...out.map(o => o.id)).map(d => [d.subject, d]));
  const order = { hi: 0, mid: 1, lo: 2 };
  return out.map(o => ({ ...o, decision: decisions.get(o.id) || null })).sort((a, b) => order[a.sev] - order[b.sev] || (a.month || 0) - (b.month || 0));
}

/** AI-5 — bo'sh oylar uchun taklif (qo'shni oylar interpolyatsiyasi, konservativ chegara bilan). Faqat taklif: inson tasdiqlaydi. */
function gapSuggestions(s, processId, year) {
  const streams = streamsOf(s.db, processId);
  const activity = activityOf(s.db, processId, year);
  const lower = new Set(["product", "heat_export", "el_export", "mass_out", "wg_corr"]);
  const today = new Date(); const lastMonth = year < today.getUTCFullYear() ? 12 : year === today.getUTCFullYear() ? today.getUTCMonth() : 0;
  const out = [];
  for (const st of streams) {
    const vals = Array.from({ length: 12 }, (_, i) => activity[st.id]?.[i + 1]?.value ?? null);
    const known = vals.filter(v => v != null);
    if (known.length < 3) continue;
    const med = median(known), max = Math.max(...known), min = Math.min(...known);
    for (let i = 0; i < lastMonth; i++) {
      if (vals[i] != null) continue;
      let a = null, b = null;
      for (let j = i - 1; j >= 0; j--) if (vals[j] != null) { a = vals[j]; break; }
      for (let j = i + 1; j < 12; j++) if (vals[j] != null) { b = vals[j]; break; }
      const interp = a != null && b != null ? (a + b) / 2 : a ?? b ?? med;
      // Konservativ chegara: emissiyani oshiruvchi oqimda mediana va interpolyatsiyadan kattasi, kamaytiruvchida kichigi
      const suggested = lower.has(st.type) ? Math.min(interp, med) : Math.max(interp, med);
      out.push({ streamId: st.id, streamName: st.name, month: i + 1, suggested, method: "interpolyatsiya + konservativ chegara", bounds: { min, max, median: med }, model: MODEL.name, modelVersion: MODEL.version });
    }
  }
  return out;
}

/** AI-6 — oylik emissiya prognozi (chiziqli trend + 95% oraliq) va orqaga sinov (oxirgi 3 oy). */
function forecast(s, processId, years) {
  const series = [];
  for (const y of years) for (const m of monthlyMetrics(s, processId, y).months) series.push({ t: `${y}-${String(m.month).padStart(2, "0")}`, dirEm: m.dirEm, see: m.see, al: m.al });
  if (series.length < 6) return { enough: false, series };
  const fit = ys => {
    const n = ys.length, xs = ys.map((_, i) => i);
    const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx, a = my - b * mx;
    const resid = Math.sqrt(ys.reduce((acc, y, i) => acc + (y - (a + b * i)) ** 2, 0) / Math.max(1, n - 2));
    return { a, b, resid, n };
  };
  const ys = series.map(p => p.dirEm);
  // Orqaga sinov: oxirgi 3 oyni yashirib prognoz qilish (MAPE)
  let mape = null;
  if (ys.length >= 9) {
    const train = ys.slice(0, -3), f = fit(train);
    const errs = ys.slice(-3).map((y, k) => (y ? Math.abs(y - (f.a + f.b * (train.length + k))) / Math.abs(y) : 0));
    mape = errs.reduce((a, b) => a + b, 0) / errs.length;
  }
  const f = fit(ys);
  const next = Array.from({ length: 12 }, (_, k) => { const x = f.n + k; const v = f.a + f.b * x; return { step: k + 1, value: Math.max(0, v), lo: Math.max(0, v - 1.96 * f.resid), hi: v + 1.96 * f.resid }; });
  return { enough: true, series, slopePerMonth: f.b, residual: f.resid, next12: next, next12Total: next.reduce((a, x) => a + x.value, 0), backtestMape: mape, mapeTarget: 0.10, model: "linear-trend", modelVersion: MODEL.version };
}

/** AI-4 — manbalarni moslashtirish: bojxona va korxona ma'lumotlari, eksport va ishlab chiqarish (farq > 2% → signal). */
function reconcile(s, operatorId, year) {
  const signals = [];
  const batches = s.db.all("SELECT tif_code, source, SUM(net_t) AS t FROM batches WHERE operator_id = ? AND substr(date,1,4) = ? GROUP BY tif_code, source", operatorId, String(year));
  const byTif = {};
  for (const b of batches) (byTif[b.tif_code] ||= {})[b.source] = b.t;
  for (const [tif, src] of Object.entries(byTif)) {
    const customs = src.customs || 0, own = (src.manual || 0) + (src.csv || 0);
    if (customs && own) {
      const diff = Math.abs(customs - own) / Math.max(customs, own);
      if (diff > 0.02) signals.push({ sev: "mid", code: "customs_vs_company", title: "Bojxona va korxona ma'lumotlari mos emas", detail: `TIF ${tif}: bojxona ${customs.toFixed(1)} t, korxona ${own.toFixed(1)} t (farq ${(diff * 100).toFixed(1)}% > 2%).` });
    }
  }
  return { year, signals, sources: byTif, checkedAt: new Date().toISOString() };
}

module.exports = { processAnomalies, gapSuggestions, forecast, reconcile, monthlyMetrics, MODEL };
