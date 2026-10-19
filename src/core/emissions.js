/*
 * IG emissiyalarini hisoblash formulalari — TZ-2 5-bo'lim (REJA.md 4.1, F-5.x).
 * Barcha funksiyalar toza: tashqi holatga bog'liq emas, natijani va (ixtiyoriy) hisob izini qaytaradi.
 * Birliklar: massa — t, energiya — TJ va MWh, emissiya — t CO2 yoki t CO2e.
 */
"use strict";
const { NOOP } = require("./trace");

const C_TO_CO2 = 3.664; // 44/12 (TZ-2 5.3: 44/12 = 3,664)

/** Goods groups (CBAM tovar guruhlari). Bilvosita emissiya faqat sement va o'g'itlarda hisobga olinadi (F-5.6e). */
const GOODS_GROUPS = {
  cement:     { name: "Sement",          indirect: true },
  fertilizer: { name: "O'g'itlar",       indirect: true },
  aluminium:  { name: "Alyuminiy",       indirect: false },
  hydrogen:   { name: "Vodorod",         indirect: false },
  iron_steel: { name: "Temir va po'lat", indirect: false },
};

const n = v => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** F-5.2 — yoqilg'i yonishidan emissiya: Em = AD · NCV · EF · OF  (AD birlikda, NCV TJ/birlik, EF t CO2/TJ). */
function combustion({ ad, ncv, ef, of = 1 }, trace = NOOP, label = "Yoqilg'i yonishi") {
  const r = n(ad) * n(ncv) * n(ef) * (of == null ? 1 : n(of));
  return trace.add("F-5.2", label, "Em = AD · NCV · EF · OF", { AD: ad, NCV: ncv, EF: ef, OF: of ?? 1 }, r, "t CO2");
}

/** F-5.3a — texnologik emissiya (hisoblash usuli): Em = AD · EF · CF. */
function processEmission({ ad, ef, cf = 1 }, trace = NOOP, label = "Texnologik jarayon") {
  const r = n(ad) * n(ef) * (cf == null ? 1 : n(cf));
  return trace.add("F-5.3a", label, "Em = AD · EF · CF", { AD: ad, EF: ef, CF: cf ?? 1 }, r, "t CO2");
}

/** F-5.3b — massa balansi: Em = 44/12 · (Σ AD_in·C_in − Σ AD_out·C_out). */
function massBalance({ inputs = [], outputs = [] }, trace = NOOP, label = "Massa balansi") {
  const cin = inputs.reduce((a, x) => a + n(x.ad) * n(x.c), 0);
  const cout = outputs.reduce((a, x) => a + n(x.ad) * n(x.c), 0);
  const r = C_TO_CO2 * (cin - cout);
  return trace.add("F-5.3b", label, "Em = 44/12 · (Σ AD_in·C_in − Σ AD_out·C_out)", { C_in: cin, C_out: cout, k: C_TO_CO2 }, r, "t CO2");
}

/** F-5.3c — klinker emissiya koeffitsiyenti: EF = 0,785·w_CaO + 1,092·w_MgO (w — massa ulushi, 0..1). Ma'lumot bo'lmasa standart qiymat. */
function clinkerEf({ wCaO, wMgO, defaultEf }, trace = NOOP) {
  if (!(n(wCaO) > 0)) {
    return trace.add("F-5.3c", "Klinker EF (standart)", "EF = standart qiymat", { EF_default: defaultEf }, n(defaultEf), "t CO2/t");
  }
  const r = 0.785 * n(wCaO) + 1.092 * n(wMgO);
  return trace.add("F-5.3c", "Klinker EF (CaO/MgO)", "EF = 0,785·w_CaO + 1,092·w_MgO", { w_CaO: wCaO, w_MgO: wMgO }, r, "t CO2/t");
}

/** F-5.3d — CO2 ekvivalenti: CO2e = CO2 + N2O·GWP + CF4·GWP + C2F6·GWP. */
function co2e({ co2 = 0, n2o = 0, cf4 = 0, c2f6 = 0 }, gwp, trace = NOOP, label = "CO2 ekvivalenti") {
  const r = n(co2) + n(n2o) * n(gwp.N2O) + n(cf4) * n(gwp.CF4) + n(c2f6) * n(gwp.C2F6);
  return trace.add("F-5.3d", label, "CO2e = CO2 + N2O·GWP_N2O + CF4·GWP_CF4 + C2F6·GWP_C2F6",
    { CO2: co2, N2O: n2o, CF4: cf4, C2F6: c2f6, GWP_N2O: gwp.N2O, GWP_CF4: gwp.CF4, GWP_C2F6: gwp.C2F6 }, r, "t CO2e");
}

/** F-5.4 — o'lchash usuli (CEMS): Em = Σ_h c_h · V_h · 10⁻⁶  (c — g/Nm³, V — Nm³, natija t). */
function cems(hours, trace = NOOP, label = "CEMS o'lchovi") {
  let sum = 0, count = 0;
  for (const h of hours || []) { sum += n(h.c) * n(h.v); count++; }
  const r = sum * 1e-6;
  return trace.add("F-5.4", label, "Em = Σ c_h · V_h · 10⁻⁶", { soatlar: count }, r, "t");
}

/** F-5.5a — bilvosita emissiya: Em_el = E_el · EF_el. */
function electricity({ mwh, ef }, trace = NOOP, label = "Elektr energiyasi") {
  const r = n(mwh) * n(ef);
  return trace.add("F-5.5a", label, "Em_el = E_el · EF_el", { E_el: mwh, EF_el: ef }, r, "t CO2");
}

/** F-5.5b — o'z generatsiyasi EF: EF_el,own = Σ AD·NCV·EF / E_el,produced. */
function ownElectricityEf({ fuelEm, produced }, trace = NOOP) {
  const r = n(produced) > 0 ? n(fuelEm) / n(produced) : 0;
  return trace.add("F-5.5b", "O'z elektr generatsiyasi EF", "EF_el,own = Σ AD·NCV·EF / E_el,produced", { "Σ AD·NCV·EF": fuelEm, E_produced: produced }, r, "t CO2/MWh");
}

/** F-5.6a — issiqlik EF: EF_H = Σ AD·NCV·EF / (Q_prod / η). */
function heatEf({ fuelEm, qProd, eta }, trace = NOOP) {
  const denom = n(eta) > 0 ? n(qProd) / n(eta) : 0;
  const r = denom > 0 ? n(fuelEm) / denom : 0;
  return trace.add("F-5.6a", "Issiqlik EF", "EF_H = Σ AD·NCV·EF / (Q_prod / η)", { "Σ AD·NCV·EF": fuelEm, Q_prod: qProd, η: eta }, r, "t CO2/TJ");
}

/** F-5.6a — issiqlik oqimi emissiyasi: Em_H = Q · EF_H. */
function heatEmission({ q, ef }, trace = NOOP, label = "Issiqlik oqimi") {
  const r = n(q) * n(ef);
  return trace.add("F-5.6a", label, "Em_H = Q · EF_H", { Q: q, EF_H: ef }, r, "t CO2");
}

/** F-5.6b — jarayonga taqsimlangan to'g'ridan-to'g'ri emissiya. */
function attributedDirect({ dirEm, heatImp = 0, heatExp = 0, wgCorr = 0, elExp = 0 }, trace = NOOP) {
  const r = n(dirEm) + n(heatImp) - n(heatExp) + n(wgCorr) - n(elExp);
  return trace.add("F-5.6b", "Jarayonga taqsimlangan emissiya", "AttrEm = DirEm + Em_H,imp − Em_H,exp + WG_corr − Em_el,exp",
    { DirEm: dirEm, Em_H_imp: heatImp, Em_H_exp: heatExp, WG_corr: wgCorr, Em_el_exp: elExp }, r, "t CO2e");
}

/**
 * F-5.6c / F-5.6d — solishtirma emissiya.
 * Oddiy tovar: SEE_dir = AttrEm/AL, SEE_ind = Em_el/AL.
 * Murakkab tovar: prekursorlar M_p · SEE_p qo'shiladi (to'g'ridan-to'g'ri va bilvosita qismlari alohida).
 */
function specificEmissions({ attrDir, emEl, al, precursors = [] }, trace = NOOP) {
  const precDir = precursors.reduce((a, p) => a + n(p.m) * n(p.seeDir), 0);
  const precInd = precursors.reduce((a, p) => a + n(p.m) * n(p.seeInd), 0);
  if (!(n(al) > 0)) return { seeDir: NaN, seeInd: NaN, seeTotal: NaN, precDir, precInd };
  const seeDir = trace.add(precursors.length ? "F-5.6d" : "F-5.6c", "SEE (to'g'ridan-to'g'ri)",
    precursors.length ? "SEE_dir = (AttrEm + Σ M_p·SEE_p,dir) / AL" : "SEE_dir = AttrEm / AL",
    { AttrEm: attrDir, "Σ M_p·SEE_p,dir": precDir, AL: al }, (n(attrDir) + precDir) / n(al), "t CO2e/t");
  const seeInd = trace.add(precursors.length ? "F-5.6d" : "F-5.6c", "SEE (bilvosita)",
    precursors.length ? "SEE_ind = (Em_el + Σ M_p·SEE_p,ind) / AL" : "SEE_ind = Em_el / AL",
    { Em_el: emEl, "Σ M_p·SEE_p,ind": precInd, AL: al }, (n(emEl) + precInd) / n(al), "t CO2e/t");
  return { seeDir, seeInd, seeTotal: seeDir + seeInd, precDir, precInd };
}

/** F-5.6e — CBAM bo'yicha hisobga olinadigan SEE (bilvosita faqat sement va o'g'itlarda). */
function seeCbam(group, { seeDir, seeInd }, trace = NOOP) {
  const g = GOODS_GROUPS[group];
  if (!g) throw new Error(`Noma'lum tovar guruhi: ${group}`);
  const r = g.indirect ? seeDir + seeInd : seeDir;
  return trace.add("F-5.6e", "CBAM SEE", g.indirect ? "SEE_CBAM = SEE_dir + SEE_ind" : "SEE_CBAM = SEE_dir",
    { guruh: g.name, SEE_dir: seeDir, SEE_ind: seeInd }, r, "t CO2e/t");
}

/** F-5.8 — partiya kiritilgan emissiyasi: EE_s = m_s · SEE_CBAM. */
function embedded({ mass, see }, trace = NOOP, label = "Partiya emissiyasi") {
  const r = n(mass) * n(see);
  return trace.add("F-5.8", label, "EE_s = m_s · SEE_CBAM", { m_s: mass, SEE_CBAM: see }, r, "t CO2e");
}

/**
 * F-5.9 — oylik bo'shliqlarni konservativ to'ldirish: yetishmagan oy eng yuqori oylik qiymat bilan to'ldiriladi va belgilanadi.
 * Emissiyani kamaytiruvchi oqimlar (mahsulot hajmi, eksport qilingan issiqlik/elektr) uchun konservativ yo'nalish teskari —
 * eng kichik qiymat olinadi (mode = "min"), aks holda SEE sun'iy pasayib ketadi.
 * @param {Array<number|null|undefined>} months 12 ta element (index 0 = yanvar)
 * @param {"max"|"min"} [mode]
 * @returns {{values:number[], filled:number[], missing:number, fillValue:number, known:number}}
 */
function conservativeFill(months, mode = "max") {
  const present = Array.from({ length: 12 }, (_, i) => {
    const v = months[i];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  });
  const known = present.filter(v => v != null);
  const fillValue = known.length ? (mode === "min" ? Math.min(...known) : Math.max(...known)) : 0;
  const filled = [];
  const values = present.map((v, i) => { if (v == null) { if (known.length) filled.push(i + 1); return fillValue; } return v; });
  return { values, filled, missing: filled.length, fillValue, known: known.length };
}

module.exports = {
  C_TO_CO2, GOODS_GROUPS,
  combustion, processEmission, massBalance, clinkerEf, co2e, cems, electricity, ownElectricityEf,
  heatEf, heatEmission, attributedDirect, specificEmissions, seeCbam, embedded, conservativeFill,
};
