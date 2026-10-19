/*
 * M6 — CBAM kalkulyatori: partiya bo'yicha EE va to'lov (F-5.8, F-6.5a/b), importyor kesimi (M6.3),
 * "haqiqiy va standart" samarasi (M6.4), 2026–2034 ssenariylari (M6.2), ta'sirchanlik (M6.7), siyosat signali (M6.8).
 */
"use strict";
const core = require("../core");
const { officialSee, computeProcess } = require("./calc");
const tax = require("./tax");

/** Partiyani jarayonga bog'lash: korxonaning shu TIF kodli yagona jarayoni. */
function linkProcess(db, operatorId, tifCode) {
  const rows = db.all("SELECT p.id FROM processes p JOIN installations i ON i.id = p.installation_id WHERE i.operator_id = ? AND p.tif_code = ?", operatorId, tifCode);
  return rows.length === 1 ? rows[0].id : null;
}

/**
 * Korxona-yil bo'yicha barcha partiyalarning CBAM hisobi.
 * @returns {{year, batches, byImporter, byProcess, totals, warnings}}
 */
function operatorYear(s, operatorId, year) {
  const ref = s.ref.snapshot(`${year}-12-31`);
  const cf = year < 2026 ? null : ref.get(`cbam.cf.${year}`) ?? 0;
  const pEts = ref.get("ets.price_eur"), usdToEur = ref.get("fx.USD") / ref.get("fx.EUR");
  const batches = s.db.all("SELECT * FROM batches WHERE operator_id = ? AND substr(date,1,4) = ? ORDER BY date", operatorId, String(year));
  const cache = new Map(), effCache = new Map(), warnings = [];
  const procInfo = pid => {
    if (!cache.has(pid)) {
      const o = officialSee(s, pid, year);
      const r = o.result;
      const instId = s.db.get("SELECT installation_id FROM processes WHERE id = ?", pid).installation_id;
      if (!effCache.has(instId)) effCache.set(instId, tax.effective(s, instId, year));
      const eff = effCache.get(instId).processes.find(x => x.processId === pid);
      const tif = r.tif;
      cache.set(pid, { see: r.selection.applied, basis: r.selection.basis, seeActual: r.see.seeCbam, seeDefault: r.selection.default, bm: tif?.bm ?? null,
        cpUsd: eff ? eff.cpUsdPerT : 0, name: r.processName, status: o.status, version: o.version });
    }
    return cache.get(pid);
  };
  const rows = batches.map(b => {
    const pid = b.process_id || linkProcess(s.db, operatorId, b.tif_code);
    if (!pid) { warnings.push(`Partiya ${b.declaration_no}: TIF ${b.tif_code} bo'yicha jarayon aniqlanmadi — bog'lang.`); return { id: b.id, declarationNo: b.declaration_no, date: b.date, tifCode: b.tif_code, netT: b.net_t, importerId: b.importer_id, eori: b.eori, country: b.country, processId: null, error: "jarayon bog'lanmagan" }; }
    const pi = procInfo(pid);
    const ee = Number.isFinite(pi.see) ? core.embedded({ mass: b.net_t, see: pi.see }) : NaN;
    let grossEur = 0, ruzEur = 0, eu = 0, method = "transitional", nCert = 0;
    if (cf != null && Number.isFinite(ee)) {
      ruzEur = b.net_t * pi.cpUsd * usdToEur;
      if (pi.bm != null) {
        const x = core.cbamExact({ batches: [{ m: b.net_t, see: pi.see, bm: pi.bm, cpUsd: pi.cpUsd }], cf, pCbamEur: pEts, usdToEur });
        nCert = x.nCert; eu = x.cost; grossEur = x.grossCerts * pEts; method = "exact";
      } else {
        grossEur = core.cbamSimplified({ ee, pEts, cf });
        eu = Math.max(0, grossEur - ruzEur); nCert = pEts > 0 ? eu / pEts : 0; method = "simplified";
      }
    }
    const eeDef = Number.isFinite(pi.seeDefault) ? b.net_t * pi.seeDefault : null;
    const euDef = eeDef != null && cf != null ? core.cbamSimplified({ ee: eeDef, pEts, cf }) : null; // standart qiymatda milliy narx tasdiqlanmagan deb olinadi
    const euActual = cf != null && Number.isFinite(pi.seeActual) ? Math.max(0, core.cbamSimplified({ ee: b.net_t * pi.seeActual, pEts, cf }) - ruzEur) : null;
    return { id: b.id, declarationNo: b.declaration_no, date: b.date, tifCode: b.tif_code, netT: b.net_t, importerId: b.importer_id, eori: b.eori, country: b.country,
      processId: pid, processName: pi.name, see: pi.see, basis: pi.basis, ee, method, nCert, grossEur, ruzEur, euEur: eu, burdenEur: ruzEur + eu,
      euDefaultEur: euDef, euActualEur: euActual, savingEur: euDef != null && euActual != null ? euDef - euActual : null, resultStatus: pi.status };
  });
  const sum = (arr, k) => arr.reduce((a, x) => a + (Number.isFinite(x[k]) ? x[k] : 0), 0);
  const group = key => {
    const m = new Map();
    for (const r of rows) { const k = r[key] || "—"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return [...m.entries()].map(([k, arr]) => ({ key: k, batches: arr.length, netT: sum(arr, "netT"), ee: sum(arr, "ee"), euEur: sum(arr, "euEur"), ruzEur: sum(arr, "ruzEur") }));
  };
  const importers = new Map(s.db.all("SELECT id, name, eori FROM importers WHERE operator_id = ?", operatorId).map(i => [i.id, i]));
  const byImporter = group("importerId").map(g => ({ ...g, name: importers.get(g.key)?.name || (g.key === "—" ? "Ko'rsatilmagan" : g.key), eori: importers.get(g.key)?.eori || null }));
  return {
    year, cf, pEts, usdToEur, transitional: cf == null, batches: rows, byImporter, byProcess: group("processId"),
    totals: { netT: sum(rows, "netT"), ee: sum(rows, "ee"), grossEur: sum(rows, "grossEur"), ruzEur: sum(rows, "ruzEur"), euEur: sum(rows, "euEur"),
      burdenEur: sum(rows, "burdenEur"), euDefaultEur: sum(rows, "euDefaultEur"), savingEur: sum(rows, "savingEur") },
    warnings, refs: ref.usedList(),
  };
}

/**
 * 2026–2034 ssenariysi (Ilova A.2 yondashuvi, USD). Asos: jarayonning bazaviy yildagi eksport partiyalari va qo'llangan SEE.
 * @param {{processId:string, baseYear:number, etsUsd?:number, exportGrowth?:number, seeChange?:number, sCov?:number, eeOverride?:number}} o
 */
function scenario(s, o) {
  const ref = s.ref.snapshot(`${o.baseYear}-12-31`);
  let ee = o.eeOverride, baseInfo = {};
  if (ee == null) {
    const r = officialSee(s, o.processId, o.baseYear).result;
    const pr = s.db.get("SELECT p.*, i.operator_id FROM processes p JOIN installations i ON i.id = p.installation_id WHERE p.id = ?", o.processId);
    const mass = s.db.all("SELECT net_t, process_id, tif_code FROM batches WHERE operator_id = ? AND substr(date,1,4) = ?", pr.operator_id, String(o.baseYear))
      .filter(b => (b.process_id || linkProcess(s.db, pr.operator_id, b.tif_code)) === o.processId).reduce((a, b) => a + b.net_t, 0);
    const see = Number.isFinite(r.see.seeCbam) ? r.see.seeCbam : r.selection.applied;
    ee = mass * see;
    baseInfo = { exportT: mass, see, processName: r.processName };
  }
  const years = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034];
  const cfByYear = {}, pUzByYear = {};
  for (const y of years) { const r = s.ref.snapshot(`${y}-12-31`); cfByYear[y] = r.get(`cbam.cf.${y}`) ?? 0; pUzByYear[y] = r.get(`tax.rate_usd.${y}`) ?? 0; }
  const pEts = o.etsUsd ?? ref.get("ets.reference_usd");
  const rows = core.scenarioTable({ ee, pEts, cfByYear, pUzByYear, sCov: o.sCov ?? 1, years, exportGrowth: o.exportGrowth || 0, seeChange: o.seeChange || 0, baseYear: 2026 });
  const sens = core.sensitivity(p => core.scenarioYear({ year: 2030, ee: p.ee, pEts: p.pEts, cf: cfByYear[2030], pUz: pUzByYear[2030], sCov: p.sCov }).total,
    { ee, pEts, sCov: o.sCov ?? 1 }, { ee: [-0.1, -0.05, 0.05, 0.1], pEts: [-0.2, 0.15, 0.5], sCov: [-0.5] });
  const etsScenarios = (ref.get("ets.scenarios_usd") || []).map(p => ({ pEts: p, total2034: core.scenarioYear({ year: 2034, ee, pEts: p, cf: cfByYear[2034], pUz: pUzByYear[2034], sCov: o.sCov ?? 1 }).total }));
  return { ee, pEts, sCov: o.sCov ?? 1, ...baseInfo, rows, signals: rows.filter(r => r.signal).map(r => r.year), sensitivity: sens, etsScenarios };
}

module.exports = { operatorYear, scenario, linkProcess };
