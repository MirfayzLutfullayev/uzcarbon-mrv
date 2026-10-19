/*
 * AI-7 — dekarbonizatsiya tavsiyalari (MACC) va AI-9 — risk-skoring.
 * Chora-tadbirlar kutubxonasidagi kamayish ulushlari va xarajatlar TAXMINIY (ochiq adabiyotdagi oraliqlar o'rtasi);
 * ekspert tomonidan tasdiqlanmaguncha "AI tavsiyasi" sifatida ko'rsatiladi. Har bir tavsiya hisob-kitobi bilan qaytadi.
 */
"use strict";
const core = require("../core");
const { computeProcess, officialSee } = require("../services/calc");
const { processAnomalies } = require("./anomaly");
const { qualityIndex } = require("../api/data");

/** target: qaysi emissiya qismiga ta'sir qiladi; share — shu qismning kamayish ulushi; costUsd — USD/t CO2e (taxminiy). */
const MEASURES = {
  cement: [
    { key: "clinker_factor", name: "Klinker koeffitsiyentini pasaytirish (shlak, kul, ohaktosh qo'shimchalari)", target: ["process", "combustion"], share: 0.08, costUsd: 5 },
    { key: "alt_fuel", name: "Muqobil yoqilg'i (biomassa, chiqindi) — 20% almashtirish", target: ["combustion"], share: 0.20, costUsd: 20 },
    { key: "whr", name: "Chiqindi issiqlikdan elektr (WHR)", target: ["emEl"], share: 0.25, costUsd: -5 },
    { key: "kiln_eff", name: "Pech va sovutgich samaradorligi", target: ["combustion"], share: 0.08, costUsd: 0 },
  ],
  fertilizer: [
    { key: "n2o_catalyst", name: "N2O ni parchalovchi uchlamchi katalizator (nitrat kislota)", target: ["nonCo2", "cems"], share: 0.85, costUsd: 3 },
    { key: "nh3_eff", name: "Ammiak qurilmasi energiya samaradorligi", target: ["combustion"], share: 0.08, costUsd: 10 },
    { key: "ppa", name: "Qayta tiklanuvchi elektr (PPA)", target: ["emEl"], share: 1.0, costUsd: 15 },
  ],
  iron_steel: [
    { key: "fuel_switch", name: "Koksdan tabiiy gazga qisman o'tish", target: ["combustion"], share: 0.15, costUsd: 25 },
    { key: "scrap", name: "Temir-tersak ulushini oshirish", target: ["process", "massBalance"], share: 0.10, costUsd: 10 },
    { key: "furnace_eff", name: "Isitish pechlari samaradorligi", target: ["combustion"], share: 0.07, costUsd: 0 },
  ],
  aluminium: [
    { key: "anode_effect", name: "Anod effektini boshqarish (PFC)", target: ["nonCo2"], share: 0.5, costUsd: 2 },
    { key: "anode_eff", name: "Anod iste'molini kamaytirish", target: ["process"], share: 0.05, costUsd: 15 },
  ],
  hydrogen: [
    { key: "ccs", name: "Uglerodni ushlash va saqlash (CCS)", target: ["massBalance", "process"], share: 0.6, costUsd: 60 },
    { key: "smr_eff", name: "Reforming samaradorligi", target: ["combustion"], share: 0.08, costUsd: 10 },
  ],
};

/**
 * Jarayon uchun MACC: har chora uchun kamayish (t), SEE pasayishi, 2030 va 2034 dagi yillik CBAM tejami (USD).
 */
function recommendations(s, processId, year) {
  const r = computeProcess(s, processId, year);
  const ref = s.ref.snapshot(`${year}-12-31`);
  const T = r.totals;
  const pEts = ref.get("ets.reference_usd");
  const exported = s.db.all("SELECT net_t FROM batches WHERE process_id = ? AND substr(date,1,4) = ?", processId, String(year)).reduce((a, b) => a + b.net_t, 0);
  const indirect = core.GOODS_GROUPS[r.goodsGroup].indirect;
  const cf = y => s.ref.snapshot(`${y}-12-31`).get(`cbam.cf.${y}`) ?? 0;
  const items = (MEASURES[r.goodsGroup] || []).map(m => {
    const base = m.target.reduce((a, k) => a + (T[k] || 0), 0);
    const reduction = base * m.share;
    const cbamRelevant = m.target.includes("emEl") && !indirect ? 0 : reduction;
    const dSee = T.al > 0 ? cbamRelevant / T.al : 0;
    const save = y => exported * dSee * pEts * (1 - cf(y));
    return {
      key: m.key, name: m.name, reductionT: reduction, reductionPct: r.totals.attrDir + T.emEl > 0 ? reduction / (r.totals.attrDir + T.emEl) : 0,
      seeReduction: dSee, costUsdPerT: m.costUsd, annualCostUsd: reduction * m.costUsd, cbamSaving2030Usd: save(2030), cbamSaving2034Usd: save(2034),
      formula: `kamayish = Σ(${m.target.join(" + ")}) × ${m.share};  ΔSEE = kamayish / AL;  tejam_t = eksport × ΔSEE × P_ETS × (1 − CF_t)`,
      basis: { base, share: m.share, al: T.al, exported, pEts }, label: "AI tavsiyasi — taxminiy, ekspert tasdig'i talab qilinadi",
    };
  }).sort((a, b) => a.costUsdPerT - b.costUsdPerT);
  return { processId, processName: r.processName, year, goodsGroup: r.goodsGroup, items, note: "Xarajat va kamayish ulushlari ochiq adabiyotdagi oraliqlarning o'rtacha qiymati; texnik-iqtisodiy asoslash bilan almashtirilishi kerak." };
}

/** AI-9 — korxonalar bo'yicha risk-skoring (soliq va verifikatsiya tekshiruvlari uchun). 0..100, yuqori — xavfli. */
function riskScores(s, year) {
  const ops = s.db.all("SELECT id, name, stir FROM operators ORDER BY name");
  return ops.map(op => {
    let hi = 0, mid = 0, qSum = 0, qN = 0, defaultExport = 0, totalExport = 0, procs = 0;
    for (const p of s.db.all("SELECT p.id FROM processes p JOIN installations i ON i.id = p.installation_id WHERE i.operator_id = ?", op.id)) {
      procs++;
      try {
        for (const a of processAnomalies(s, p.id, year)) { if (a.decision?.status === "dismissed") continue; if (a.sev === "hi") hi++; else if (a.sev === "mid") mid++; }
        const q = qualityIndex(s.db, p.id, year); if (q.expected) { qSum += q.completeness; qN++; }
        const sel = officialSee(s, p.id, year).result.selection;
        const exp = s.db.all("SELECT net_t FROM batches WHERE process_id = ? AND substr(date,1,4) = ?", p.id, String(year)).reduce((a, b) => a + b.net_t, 0);
        totalExport += exp; if (sel.basis !== "actual") defaultExport += exp;
      } catch { /* hisoblab bo'lmaydigan jarayon */ }
    }
    const unverified = !s.db.get("SELECT v.id FROM verifications v JOIN installations i ON i.id = v.installation_id WHERE i.operator_id = ? AND v.year = ? AND v.status = 'concluded'", op.id, year);
    const completeness = qN ? qSum / qN : 0;
    const factors = [
      { name: "Yuqori darajali anomaliyalar", value: hi, points: Math.min(35, hi * 12) },
      { name: "O'rta darajali anomaliyalar", value: mid, points: Math.min(15, mid * 4) },
      { name: "Ma'lumot to'liqligi", value: completeness, points: Math.round((1 - completeness) * 25) },
      { name: "Verifikatsiyadan o'tmagan", value: unverified ? 1 : 0, points: unverified ? 15 : 0 },
      { name: "Standart qiymatdagi eksport ulushi", value: totalExport ? defaultExport / totalExport : 0, points: totalExport ? Math.round((defaultExport / totalExport) * 10) : 0 },
    ];
    const score = Math.min(100, factors.reduce((a, f) => a + f.points, 0));
    return { operatorId: op.id, name: op.name, stir: op.stir, processes: procs, score, level: score >= 50 ? "hi" : score >= 25 ? "mid" : "lo", factors };
  }).sort((a, b) => b.score - a.score);
}

module.exports = { recommendations, riskScores, MEASURES };
