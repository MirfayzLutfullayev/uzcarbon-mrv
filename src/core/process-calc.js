/*
 * Jarayon (production process) bo'yicha yillik hisob — TZ-2 5-bo'limning 5 bosqichi:
 * (1) korxona emissiyalari, (2) issiqlik va elektr oqimlari, (3) jarayonga taqsimlash, (4) SEE, (5) partiya emissiyasi.
 *
 * Manba oqimi turlari (stream.type):
 *   fuel         — yoqilg'i yonishi (F-5.2)
 *   material     — texnologik emissiya, hisoblash usuli (F-5.3a)
 *   clinker      — klinker kalsinatsiyasi, oylik CaO/MgO bilan (F-5.3c)
 *   mass_in / mass_out — massa balansi (F-5.3b)
 *   gas          — CO2 dan boshqa gazlar, t gaz (F-5.3d)
 *   cems         — o'lchash usuli, oylik t gaz (F-5.4 dan yig'ilgan)
 *   direct       — qo'lda kiritilgan to'g'ridan-to'g'ri emissiya, t CO2e (masalan, CKD)
 *   electricity  — iste'mol qilingan elektr, MWh (F-5.5)
 *   heat_import / heat_export — issiqlik oqimlari, TJ (F-5.6a)
 *   el_export    — tashqariga berilgan elektr, MWh
 *   wg_corr      — chiqindi gazlar tuzatmasi, t CO2e (ishorali)
 *   product      — mahsulot hajmi AL, t
 *   precursor    — iste'mol qilingan prekursor, t (F-5.6d)
 */
"use strict";
const E = require("./emissions");
const D = require("./defaults");
const { Trace } = require("./trace");

const STREAM_TYPES = {
  fuel: "Yoqilg'i yonishi", material: "Texnologik material", clinker: "Klinker", mass_in: "Massa balansi (kirish)",
  mass_out: "Massa balansi (chiqish)", gas: "CO2 dan boshqa gaz", cems: "CEMS o'lchovi", direct: "To'g'ridan-to'g'ri (qo'lda)",
  electricity: "Elektr iste'moli", heat_import: "Qabul qilingan issiqlik", heat_export: "Berilgan issiqlik",
  el_export: "Berilgan elektr", wg_corr: "Chiqindi gazlar tuzatmasi", product: "Mahsulot (AL)", precursor: "Prekursor",
};
// Emissiyani kamaytiruvchi oqimlar uchun konservativ to'ldirish — eng kichik qiymat (F-5.9 izohi).
const FILL_MIN = new Set(["product", "heat_export", "el_export", "mass_out", "wg_corr"]);
const STREAM_UNITS = {
  material: "t", clinker: "t", mass_in: "t", mass_out: "t", gas: "t", cems: "t", direct: "t CO2e", electricity: "MWh",
  heat_import: "TJ", heat_export: "TJ", el_export: "MWh", wg_corr: "t CO2e", product: "t", precursor: "t",
};

const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const sum = a => a.reduce((x, y) => x + y, 0);

/** Yoqilg'i miqdorini oqim birligidan ma'lumotnoma birligiga o'tkazish (zichlik orqali). */
function toFuelUnit(value, streamUnit, fuel) {
  if (!streamUnit || streamUnit === fuel.unit) return value;
  if (streamUnit === "t" && fuel.unit === "m3" && fuel.densityTperM3 > 0) return value / fuel.densityTperM3;
  if (streamUnit === "m3" && fuel.unit === "t" && fuel.densityTperM3 > 0) return value * fuel.densityTperM3;
  throw new Error(`Yoqilg'i birligi mos emas: oqim "${streamUnit}", ma'lumotnoma "${fuel.unit}"`);
}

/** Oqimning 12 oylik qiymatlarini va qo'shimcha maydonlarini olish. */
function monthlySeries(stream, activity) {
  const rows = activity[stream.id] || {};
  const values = [], extras = [], statuses = [];
  for (let m = 1; m <= 12; m++) {
    const r = rows[m];
    values.push(r ? num(r.value) : null);
    extras.push((r && r.extra) || {});
    statuses.push(r ? r.status || "actual" : null);
  }
  return { values, extras, statuses };
}

/**
 * @param {object} p
 * @param {{id:string,name:string,goodsGroup:string,tifCode:string}} p.process
 * @param {Array<object>} p.streams
 * @param {Record<string, Record<number, {value:number, extra?:object, status?:string}>>} p.activity  streamId → oy → yozuv
 * @param {number} p.year
 * @param {{get:(key:string)=>any}} p.ref  ma'lumotnoma (hisob sanasiga muvofiq versiya)
 * @param {boolean} [p.verified]  shu jarayon-yil natijasi verifikatsiyadan o'tganmi
 * @param {(processId:string, visited:Set<string>)=>{seeDir:number, seeInd:number, name?:string}} [p.resolvePrecursor]
 * @param {Set<string>} [p.visited]
 * @param {number[]} [p.months] hisob davri oylari (berilmasa — butun yil)
 */
function calculateProcess(p) {
  const { process, streams, activity, year, ref } = p;
  const trace = new Trace();
  const warnings = [];
  const group = process.goodsGroup;
  if (!E.GOODS_GROUPS[group]) throw new Error(`Noma'lum tovar guruhi: ${group}`);
  const gwp = { N2O: ref.get("gwp.N2O"), CF4: ref.get("gwp.CF4"), C2F6: ref.get("gwp.C2F6") };
  const gridEf = ref.get("grid.ef");
  const heatDefaultEf = ref.get("heat.default_ef");
  const visited = p.visited || new Set();
  visited.add(process.id);

  const lines = [];
  const T = { combustion: 0, process: 0, massBalance: 0, nonCo2: 0, cems: 0, directManual: 0, heatImp: 0, heatExp: 0, wgCorr: 0, elExp: 0, emEl: 0, al: 0 };
  const mbIn = [], mbOut = [], precursors = [];
  let monthsMissing = 0;

  // Davr cheklovi (masalan, chorak uchun soliq deklaratsiyasi): davrdan tashqaridagi oylar nol, to'ldirilmaydi.
  const period = Array.isArray(p.months) && p.months.length ? new Set(p.months) : null;

  for (const s of streams.filter(x => x.active !== false && x.active !== 0)) {
    const ser = monthlySeries(s, activity);
    if (period) for (let i = 0; i < 12; i++) if (!period.has(i + 1)) { ser.values[i] = 0; ser.extras[i] = {}; ser.statuses[i] = null; }
    const fill = E.conservativeFill(ser.values, FILL_MIN.has(s.type) ? "min" : "max");
    if (!fill.known) {
      warnings.push(`"${s.name}" oqimi uchun ${year}-yilda ma'lumot kiritilmagan.`);
    } else if (fill.missing) {
      monthsMissing += fill.missing;
      warnings.push(`"${s.name}": ${fill.filled.join(", ")}-oylar ma'lumoti yo'q — konservativ to'ldirildi (${FILL_MIN.has(s.type) ? "eng kichik" : "eng yuqori"} oylik qiymat), "taxminiy" belgisi bilan.`);
      trace.add("F-5.9", `Bo'shliqlarni to'ldirish: ${s.name}`, "Yetishmagan oy = " + (FILL_MIN.has(s.type) ? "min" : "max") + "(ma'lum oylar)",
        { oylar: fill.filled.join(","), qiymat: fill.fillValue }, fill.fillValue, "");
    }
    const vals = fill.values;
    const annual = sum(vals);
    const filledSet = new Set(fill.filled);
    const line = { streamId: s.id, name: s.name, type: s.type, unit: s.unit || STREAM_UNITS[s.type] || "", annual, filledMonths: fill.filled,
      estimatedMonths: ser.statuses.map((st, i) => (st === "estimated" ? i + 1 : null)).filter(Boolean), emission: 0, sourceLevel: s.sourceLevel || null };

    switch (s.type) {
      case "fuel": {
        const fuel = ref.get("fuel." + s.fuelKey);
        if (!fuel) throw new Error(`Ma'lumotnomada yoqilg'i yo'q: ${s.fuelKey}`);
        // Har oy alohida: laboratoriya NCV/EF (oylik extra) → oqim darajasidagi qiymat → ma'lumotnoma.
        // NCV — TJ / oqim birligi; EF — t CO2/TJ (≡ kg/GJ). To'ldirilgan oylar ma'lum oylarning eng yuqori koeffitsientini oladi.
        const unitToRef = toFuelUnit(1, s.unit, fuel);
        const refNcv = (fuel.ncvGJ / 1000) * unitToRef, refEf = fuel.efKgGJ, of = num(s.of) ?? 1;
        const params = [];
        for (let i = 0; i < 12; i++) {
          if (filledSet.has(i + 1)) continue;
          const x = ser.extras[i], ncvGJ = num(x.ncv) ?? num(s.ncv);
          params[i] = { ncv: ncvGJ != null ? ncvGJ / 1000 : refNcv, ef: num(x.ef) ?? num(s.ef) ?? refEf };
        }
        const known = params.filter(Boolean);
        const worst = { ncv: known.length ? Math.max(...known.map(q => q.ncv)) : refNcv, ef: known.length ? Math.max(...known.map(q => q.ef)) : refEf };
        let em = 0, tj = 0;
        for (let i = 0; i < 12; i++) {
          const q = params[i] || worst;
          tj += vals[i] * q.ncv;
          em += vals[i] * q.ncv * q.ef * of;
        }
        trace.add("F-5.2", `Yonish: ${s.name}`, "Em = Σ AD · NCV · EF · OF",
          { AD: annual, birlik: line.unit || fuel.unit, "Σ AD·NCV (TJ)": tj, "EF (t/TJ, o'rtacha)": tj > 0 ? em / tj / of : refEf, OF: of, manba: fuel.source || "" }, em, "t CO2");
        line.emission = em; line.tj = tj; T.combustion += em;
        break;
      }
      case "material": {
        const efRef = s.materialKey ? ref.get("material." + s.materialKey) : null;
        const ef = num(s.ef) ?? (efRef && efRef.ef);
        if (ef == null) throw new Error(`"${s.name}" uchun emissiya koeffitsiyenti ko'rsatilmagan.`);
        line.emission = E.processEmission({ ad: annual, ef, cf: num(s.cf) ?? 1 }, trace, `Texnologik: ${s.name}`);
        T.process += line.emission;
        break;
      }
      case "clinker": {
        const defaultEf = ref.get("clinker.default_ef");
        // Oylik laboratoriya tahlili (CaO, MgO — %). To'ldirilgan oylar uchun konservativ: max(standart EF, ma'lum oylar EF).
        const efs = [];
        for (let i = 0; i < 12; i++) {
          if (filledSet.has(i + 1)) continue;
          const x = ser.extras[i];
          const wCaO = num(x.wCaO) != null ? x.wCaO / 100 : 0, wMgO = num(x.wMgO) != null ? x.wMgO / 100 : 0;
          efs[i] = wCaO > 0 ? 0.785 * wCaO + 1.092 * wMgO : defaultEf;
        }
        const labEfs = efs.filter((v, i) => v != null && num(ser.extras[i].wCaO) > 0);
        const worstEf = Math.max(defaultEf, ...efs.filter(v => v != null));
        let em = 0;
        for (let i = 0; i < 12; i++) em += vals[i] * (efs[i] ?? worstEf);
        const efAvg = annual > 0 ? em / annual : defaultEf;
        trace.add("F-5.3c", `Klinker: ${s.name}`, "Em = Σ Q_klinker · (0,785·w_CaO + 1,092·w_MgO)  [yo'q bo'lsa EF_standart]",
          { Q_klinker: annual, "EF (o'rtacha)": efAvg, EF_standart: defaultEf, "lab ma'lumotli oylar": labEfs.length }, em, "t CO2");
        line.emission = em; line.ef = efAvg; T.process += em;
        break;
      }
      case "mass_in": case "mass_out": {
        let ct = 0;
        for (let i = 0; i < 12; i++) ct += vals[i] * (num(ser.extras[i].carbon) ?? num(s.carbon) ?? 0);
        const c = annual > 0 ? ct / annual : num(s.carbon) || 0;
        (s.type === "mass_in" ? mbIn : mbOut).push({ ad: annual, c, name: s.name });
        line.carbonT = ct; line.c = c;
        line.emission = (s.type === "mass_in" ? 1 : -1) * E.C_TO_CO2 * ct;
        break;
      }
      case "gas": case "cems": {
        const gas = (s.gas || "CO2").toUpperCase();
        const parts = { co2: 0, n2o: 0, cf4: 0, c2f6: 0 };
        const k = { CO2: "co2", N2O: "n2o", CF4: "cf4", C2F6: "c2f6" }[gas];
        if (!k) throw new Error(`Noma'lum gaz: ${gas}`);
        parts[k] = annual;
        const em = E.co2e(parts, gwp, trace, `${s.type === "cems" ? "CEMS" : "Gaz"}: ${s.name} (${gas})`);
        line.emission = em; line.gas = gas;
        if (s.type === "cems") T.cems += em; else T.nonCo2 += em;
        break;
      }
      case "direct": {
        line.emission = trace.add("F-5.3a", `Qo'lda: ${s.name}`, "Em = kiritilgan qiymat (t CO2e)", { qiymat: annual }, annual, "t CO2e");
        T.directManual += annual;
        break;
      }
      case "electricity": {
        let ef;
        if (s.efSource === "own") {
          const fuelEm = sum(ser.extras.map(x => num(x.genFuelEm) || 0)), produced = sum(ser.extras.map(x => num(x.genMwh) || 0));
          ef = E.ownElectricityEf({ fuelEm, produced }, trace);
        } else if (s.efSource === "ppa" || s.efSource === "direct") {
          ef = num(s.ef);
          if (ef == null) throw new Error(`"${s.name}": PPA/to'g'ridan-to'g'ri ulanish uchun manba EF ko'rsatilmagan.`);
        } else ef = gridEf;
        line.emission = E.electricity({ mwh: annual, ef }, trace, `Elektr: ${s.name}`);
        line.ef = ef; line.efSource = s.efSource || "grid";
        T.emEl += line.emission;
        break;
      }
      case "heat_import": {
        const ef = num(s.ef) ?? heatDefaultEf;
        line.emission = E.heatEmission({ q: annual, ef }, trace, `Qabul qilingan issiqlik: ${s.name}`);
        T.heatImp += line.emission; line.ef = ef;
        break;
      }
      case "heat_export": {
        const fuelEm = sum(ser.extras.map(x => num(x.fuelEm) || 0)), qProd = sum(ser.extras.map(x => num(x.qProd) || 0));
        const eta = num(s.eta) ?? num(ser.extras.find(x => num(x.eta) != null)?.eta);
        const ef = fuelEm > 0 && qProd > 0 && eta ? E.heatEf({ fuelEm, qProd, eta }, trace) : (num(s.ef) ?? heatDefaultEf);
        line.emission = E.heatEmission({ q: annual, ef }, trace, `Berilgan issiqlik: ${s.name}`);
        T.heatExp += line.emission; line.ef = ef;
        break;
      }
      case "el_export": {
        const ef = num(s.ef) ?? gridEf;
        line.emission = E.electricity({ mwh: annual, ef }, trace, `Berilgan elektr: ${s.name}`);
        T.elExp += line.emission; line.ef = ef;
        break;
      }
      case "wg_corr": {
        // Ishorali qiymat: konservativ to'ldirishdan keyin ham o'z ishorasini saqlaydi.
        line.emission = trace.add("F-5.6b", `WG tuzatmasi: ${s.name}`, "WG_corr = kiritilgan qiymat", { qiymat: annual }, annual, "t CO2e");
        T.wgCorr += annual;
        break;
      }
      case "product": {
        T.al += annual;
        break;
      }
      case "precursor": {
        const pr = resolvePrecursorSee(s, year, ref, p, visited, trace, warnings);
        precursors.push({ m: annual, seeDir: pr.seeDir, seeInd: pr.seeInd, name: s.name, source: pr.source });
        line.seeDir = pr.seeDir; line.seeInd = pr.seeInd; line.precSource = pr.source;
        line.emission = annual * (pr.seeDir + pr.seeInd);
        break;
      }
      default:
        throw new Error(`Noma'lum oqim turi: ${s.type}`);
    }
    lines.push(line);
  }

  if (mbIn.length || mbOut.length) T.massBalance = E.massBalance({ inputs: mbIn, outputs: mbOut }, trace);
  const dirEm = trace.add("5.2–5.4", "To'g'ridan-to'g'ri emissiya (DirEm)", "DirEm = Em_comb + Em_proc + Em_MB + Em_gaz + Em_CEMS + Em_qo'lda",
    { Em_comb: T.combustion, Em_proc: T.process, Em_MB: T.massBalance, Em_gaz: T.nonCo2, Em_CEMS: T.cems, "Em_qo'lda": T.directManual },
    T.combustion + T.process + T.massBalance + T.nonCo2 + T.cems + T.directManual, "t CO2e");
  const attrDir = E.attributedDirect({ dirEm, heatImp: T.heatImp, heatExp: T.heatExp, wgCorr: T.wgCorr, elExp: T.elExp }, trace);
  if (!(T.al > 0)) warnings.push("Mahsulot hajmi (AL) kiritilmagan yoki nol — SEE hisoblanmaydi.");
  const see = E.specificEmissions({ attrDir, emEl: T.emEl, al: T.al, precursors }, trace);
  const seeCbam = Number.isFinite(see.seeDir) ? E.seeCbam(group, see, trace) : NaN;

  // Standart qiymat va tanlov (M4.4)
  const tif = process.tifCode ? ref.get("tif." + process.tifCode) : null;
  let mu = 0;
  try { mu = D.markupFor(tif?.group || group, year, k => ref.get(k)); } catch (e) { warnings.push(e.message); }
  const selection = D.selectSee({ actual: seeCbam, verified: !!p.verified, tif, mu }, trace);
  warnings.push(...selection.warnings);
  if (tif && tif.group && tif.group !== group) warnings.push(`TIF TN kodi ${process.tifCode} "${tif.group}" guruhiga tegishli, jarayon esa "${group}".`);

  return {
    processId: process.id, processName: process.name, year, goodsGroup: group, tifCode: process.tifCode || null,
    tif: tif ? { code: process.tifCode, name: tif.name, dvTot: tif.dvTot ?? null, dvStatus: tif.dvStatus, bm: tif.bm ?? null, sample: !!tif.sample } : null,
    markup: mu, lines,
    totals: { ...T, dirEm, attrDir, precDir: see.precDir, precInd: see.precInd, totalEmbedded: attrDir + T.emEl + see.precDir + see.precInd },
    see: { seeDir: see.seeDir, seeInd: see.seeInd, seeTotal: see.seeTotal, seeCbam },
    selection, verified: !!p.verified,
    dataQuality: { monthsMissing, streams: lines.length, filledStreams: lines.filter(l => l.filledMonths.length).length },
    warnings, trace: trace.steps,
  };
}

/** Prekursorning SEE si: ichki jarayon (rekursiv), yetkazib beruvchi ma'lumoti yoki standart qiymat. */
function resolvePrecursorSee(s, year, ref, p, visited, trace, warnings) {
  const src = s.precursorSource || "default";
  if (src === "internal") {
    if (!s.precursorProcessId) throw new Error(`"${s.name}": ichki prekursor jarayoni ko'rsatilmagan.`);
    if (visited.has(s.precursorProcessId)) throw new Error(`Prekursor zanjirida sikl aniqlandi: "${s.name}".`);
    if (!p.resolvePrecursor) throw new Error("Ichki prekursorni hisoblash funksiyasi berilmagan.");
    const r = p.resolvePrecursor(s.precursorProcessId, new Set(visited));
    if (!Number.isFinite(r.seeDir)) throw new Error(`Ichki prekursor "${s.name}" uchun SEE hisoblanmadi.`);
    trace.add("F-5.6d", `Prekursor (ichki): ${s.name}`, "SEE_p = ichki jarayon natijasi (rekursiv)", { jarayon: r.name || s.precursorProcessId, SEE_dir: r.seeDir, SEE_ind: r.seeInd }, r.seeDir + r.seeInd, "t CO2e/t");
    return { seeDir: r.seeDir, seeInd: r.seeInd, source: "internal" };
  }
  if (src === "supplier") {
    const seeDir = num(s.supplierSeeDir), seeInd = num(s.supplierSeeInd) || 0;
    if (seeDir == null) throw new Error(`"${s.name}": yetkazib beruvchi SEE qiymati kiritilmagan.`);
    trace.add("F-5.6d", `Prekursor (yetkazib beruvchi): ${s.name}`, "SEE_p = yetkazib beruvchi ma'lumoti", { SEE_dir: seeDir, SEE_ind: seeInd }, seeDir + seeInd, "t CO2e/t");
    return { seeDir, seeInd, source: "supplier" };
  }
  // default
  const tif = ref.get("tif." + s.precursorTif);
  if (!tif || tif.dvStatus !== "value") throw new Error(`"${s.name}": prekursor TIF ${s.precursorTif || "?"} uchun standart qiymat yo'q.`);
  const mu = D.markupFor(tif.group, year, k => ref.get(k));
  const see = D.defaultSee({ dv: tif.dvTot, mu }, trace);
  warnings.push(`Prekursor "${s.name}" standart qiymat bilan hisoblandi (${tif.dvTot} × (1 + ${mu})).`);
  return { seeDir: see, seeInd: 0, source: "default" };
}

module.exports = { calculateProcess, STREAM_TYPES, STREAM_UNITS, toFuelUnit };
