/* CBAM kalkulyatori: partiya va importyor kesimi, haqiqiy va standart qiymat samarasi, 2026–2034 prognozi, ta'sirchanlik, EU ETS ssenariylari. */
import { get } from "../api.js";
import { $, esc, fmt, pct, mln, table, errToast, basisPill, opt, line } from "../ui.js";
import { processPicker, bindPicker, route } from "../app.js";

let chosenOp = null;

const METHOD = { exact: "Aniq formula", simplified: "Soddalashtirilgan formula", transitional: "O'tish davri" };
const PARAM = { ee: "Eksport hajmi", pEts: "EU ETS narxi", sCov: "Milliy soliq qamrovi" };
const signed = (v, d = 0) => (v > 0 ? "+" : "") + pct(v, d);
const emptyBox = (title, text, action = "") => `<div class="empty"><h3>${title}</h3><p class="note">${text}</p>${action}</div>`;

export default async function (el, _p, S) {
  const y = S.year;
  const ops = await get("/api/operators").catch(() => []);
  const pick = await processPicker();
  const opId = S.user.operatorId || (ops.some(o => o.id === chosenOp) ? chosenOp : ops[0]?.id);
  const cb = opId ? await get(`/api/cbam/operator/${opId}?year=${y}`).catch(e => ({ error: e.message })) : null;
  const t = cb && !cb.error ? cb.totals : null;

  const noOperator = S.can("registry.read")
    ? emptyBox("Korxona topilmadi", "CBAM hisobi korxona va uning eksport partiyalari asosida tuziladi. Avval reyestrda korxonani ro'yxatdan o'tkazing.", `<a class="btn" href="#/registry">Reyestrni ochish</a>`)
    : emptyBox("Korxona bo'yicha hisob mavjud emas", "Sizning rolingiz uchun alohida korxonalar ma'lumoti ochilmagan. Umumlashtirilgan ko'rsatkichlarni monitoring panelida ko'ring.", `<a class="btn" href="#/dashboard">Monitoring paneliga o'tish</a>`);

  const kpis = () => `<div class="kpis">
      <div class="kpi"><span class="l">Kiritilgan emissiya</span><span class="v">${fmt(t.ee)}<small>t CO₂e</small></span><span class="n">Eksport hajmi ${fmt(t.netT)} t</span></div>
      <div class="kpi"><span class="l">CBAM yalpi majburiyati</span><span class="v">${fmt(t.grossEur)}<small>€</small></span><span class="n">${cb.transitional ? "O'tish davri, sertifikat talab qilinmaydi" : `EU ETS ${fmt(cb.pEts)} €/t, to'lanadigan ulush ${pct(1 - cb.cf, 1)}`}</span></div>
      <div class="kpi hl"><span class="l">EI ga to'lanadi</span><span class="v">${fmt(t.euEur)}<small>€</small></span><span class="n">Milliy narx chegirmasi ${fmt(t.ruzEur)} €</span></div>
      <div class="kpi ok"><span class="l">Haqiqiy ma'lumot tejami</span><span class="v">${fmt(t.savingEur)}<small>€</small></span><span class="n">Standart qiymatlarda EI ga ${fmt(t.euDefaultEur)} €</span></div>
    </div>`;

  const batchesPanel = () => {
    const warn = cb.warnings.length ? `<div class="banner"><b>Ba'zi partiyalar hisobga olinmadi.</b><ul>${cb.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>${S.can("batches.read") ? `Eksport partiyalari bo'limida har bir partiyani jarayonga bog'lang.` : ""}</div>` : "";
    const body = cb.batches.length ? table([
      { h: "Deklaratsiya", v: b => `<span class="mono">${esc(b.declarationNo)}</span><span class="cell-sub">${esc(b.date)}</span>`, html: true },
      { h: "Netto, t", k: "netT", num: true, d: 1 },
      { h: "SEE, t CO₂e / t", k: "see", num: true, d: 4 },
      { h: "EE, t CO₂e", k: "ee", num: true, d: 1 },
      { h: "Usul va asos", v: b => b.error ? `<span class="pill hi">Jarayon bog'lanmagan</span>` : `${esc(METHOD[b.method] || "—")}<span class="cell-sub">${basisPill(b.basis)}</span>`, html: true },
      { h: "Yalpi, €", k: "grossEur", num: true },
      { h: "Milliy chegirma, €", k: "ruzEur", num: true },
      { h: "EI ga, €", v: b => `<b>${fmt(b.euEur)}</b>`, html: true, num: true },
      { h: "Standart qiymatda, €", k: "euDefaultEur", num: true },
    ], cb.batches, { foot: ["Jami", fmt(t.netT, 1), "", fmt(t.ee, 1), "", fmt(t.grossEur), fmt(t.ruzEur), `<b>${fmt(t.euEur)}</b>`, fmt(t.euDefaultEur)] })
      : emptyBox(`${y}-yil uchun eksport partiyalari yo'q`, "CBAM hisobi bojxona deklaratsiyalari asosida tuziladi. Partiyalarni yuklang yoki bojxona ma'lumotlari kelishini kuting.",
        S.can("batches.read") ? `<a class="btn" href="#/batches">Eksport partiyalarini ochish</a>` : "");
    return `<section class="panel"><h2>Eksport partiyalari bo'yicha hisob</h2>
      <div class="stack">${warn}${body}
        ${cb.batches.length && S.can("batches.read") ? `<div class="toolbar"><span class="note">Haqiqiy ma'lumot verifikatsiyadan o'tmaguncha EI standart qiymati qo'llanadi.</span><a class="link-more" href="#/batches">Partiyalar ro'yxatini ochish</a></div>` : ""}
      </div></section>`;
  };

  const importersPanel = () => `<section class="panel"><h2>Importyorlar kesimida</h2>${table([
      { h: "Importyor", v: r => `${esc(r.name)}${r.eori ? `<span class="cell-sub">EORI <span class="mono">${esc(r.eori)}</span></span>` : ""}`, html: true },
      { h: "Partiyalar", k: "batches", num: true },
      { h: "Netto, t", k: "netT", num: true, d: 1 },
      { h: "EE, t CO₂e", k: "ee", num: true, d: 1 },
      { h: "Milliy chegirma, €", k: "ruzEur", num: true },
      { h: "EI ga, €", k: "euEur", num: true },
    ], cb.byImporter, { empty: "Partiyalar hali importyorlarga bog'lanmagan." })}</section>`;

  const paramsPanel = () => `<section class="panel"><h2>Hisob parametrlari</h2>
      <div class="stack">
        <dl class="kv">
          <dt>Hisobot yili</dt><dd>${y}</dd>
          <dt>Davr</dt><dd>${cb.transitional ? "O'tish davri (faqat hisobot)" : "To'liq amal qilish davri"}</dd>
          <dt>EU ETS narxi</dt><dd>${fmt(cb.pEts, 2)} € / t CO₂e</dd>
          <dt>Bepul kvota koeffitsienti</dt><dd>${cb.transitional ? "—" : pct(cb.cf, 1)}</dd>
          <dt>Valyuta kursi</dt><dd>1 USD = ${fmt(cb.usdToEur, 4)} €</dd>
        </dl>
        <div class="note">Benchmark ma'lum bo'lsa aniq formula, aks holda soddalashtirilgan formula qo'llanadi. O'zbekistonda to'langan uglerod narxi EI to'lovidan chegiriladi (CBAM reglamenti, 9-modda).</div>
      </div></section>`;

  const current = !opId ? noOperator
    : cb.error ? `<div class="banner crit" role="alert"><b>CBAM hisobini yuklab bo'lmadi.</b> ${esc(cb.error)} Sahifani yangilang yoki boshqa korxonani tanlang.</div>`
    : `${cb.transitional ? `<div class="banner info">${y}-yil CBAM o'tish davriga to'g'ri keladi: sertifikat sotib olish talab qilinmaydi, faqat kiritilgan emissiya hisobot qilinadi.</div>` : ""}
      ${kpis()}
      ${batchesPanel()}
      <div class="split">${importersPanel()}${paramsPanel()}</div>`;

  const scenarioForm = pick.current ? `<form id="scForm" novalidate>
        <fieldset><legend>Hisob asosi</legend><div class="fields">
          <div>${pick.html}</div>
          <label>Bazaviy yil<select name="baseYear">${[2024, 2025, 2026].map(v => opt(v, v, 2025)).join("")}</select></label>
        </div></fieldset>
        <fieldset><legend>Prognoz taxminlari</legend><div class="stack">
          <div class="fields">
            <label>EU ETS narxi, USD / t CO₂e<input name="etsUsd" type="number" step="any" min="0" value="87" inputmode="decimal"></label>
            <label>Eksport hajmi o'zgarishi<input name="exportGrowth" type="number" step="any" value="0" inputmode="decimal"><em>Yillik ulush: 0.05 = +5%</em></label>
            <label>SEE o'zgarishi<input name="seeChange" type="number" step="any" value="0" inputmode="decimal"><em>Yillik ulush: -0.02 = −2%</em></label>
            <label>Milliy soliq qamrovi (s_cov)<input name="sCov" type="number" step="any" min="0" max="1" value="1" inputmode="decimal"><em>0 dan 1 gacha</em></label>
          </div>
          <div class="note">s_cov = 1 bo'lsa, milliy soliq barcha kiritilgan emissiyani qamraydi (yuqori chegara). Faqat yuqori oqim soliqi qo'llansa, yonish emissiyasi ulushini kiriting.</div>
        </div></fieldset>
        <div class="row"><button class="btn" type="submit" id="scBtn">Prognozni hisoblash</button></div>
      </form>`
    : S.can("registry.read")
      ? emptyBox("Prognoz uchun jarayon kerak", "Prognoz ishlab chiqarish jarayonining eksporti va SEE qiymatiga asoslanadi. Reyestrda inshoot va jarayonni qo'shing.", `<a class="btn" href="#/registry">Reyestrni ochish</a>`)
      : emptyBox("Prognoz uchun jarayon mavjud emas", "Sizning rolingiz uchun korxona jarayonlari ochilmagan. Prognozni korxona mutaxassisi tuzadi.");

  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>CBAM kalkulyatori</h1><p class="sub">Eksport partiyalari bo'yicha EI chegara uglerod to'lovi, O'zbekistonda to'langan narx chegirmasi va 2034-yilgacha prognoz.</p></div>
      ${!S.user.operatorId && ops.length > 1 ? `<label class="inline">Korxona <select id="opSel" style="width:auto">${ops.map(o => opt(o.id, o.name, opId)).join("")}</select></label>` : ""}</div>
    ${current}
    <section class="panel"><h2>2026–2034 yillar prognozi</h2>
      <p class="section-intro">Bazaviy yil eksporti va SEE asosida O'zbekistonda qoladigan soliq hamda EI ga to'lanadigan summa yillar bo'yicha baholanadi. Summalar AQSh dollarida.</p>
      ${scenarioForm}
    </section>
    <div id="scOut" style="display:contents"></div>
  </div>`;

  bindPicker();
  // Jarayon tanlovi shakl ichida boshqa maydonlar kabi ko'rinsin (yorliq ustida, kenglik to'liq)
  const ps = $("#procSel");
  if (ps) { ps.removeAttribute("style"); ps.closest("label")?.classList.remove("inline"); }
  const os = $("#opSel"); if (os) os.onchange = () => { chosenOp = os.value; route(); };

  const run = async () => {
    const f = $("#scForm"), btn = $("#scBtn");
    const q = new URLSearchParams({ processId: $("#procSel")?.value || "", baseYear: f.baseYear.value, etsUsd: f.etsUsd.value, exportGrowth: f.exportGrowth.value || 0, seeChange: f.seeChange.value || 0, sCov: f.sCov.value || 1 });
    if (btn) btn.disabled = true;
    try {
      const r = await get(`/api/cbam/scenario?${q}`);
      const sum = k => r.rows.reduce((a, x) => a + (Number.isFinite(x[k]) ? x[k] : 0), 0);
      const last = r.rows[r.rows.length - 1] || {};
      let prevParam = null;
      $("#scOut").innerHTML = `
        <div class="kpis">
          <div class="kpi"><span class="l">Bazaviy kiritilgan emissiya</span><span class="v">${fmt(r.ee)}<small>t CO₂e</small></span><span class="n">${r.exportT != null ? `Eksport ${fmt(r.exportT)} t, SEE ${fmt(r.see, 4)}` : "Berilgan qiymat"}</span></div>
          <div class="kpi"><span class="l">O'zbekistonda qoladi, 2026–2034</span><span class="v">${mln(sum("ruz"))}<small>mln USD</small></span><span class="n">Milliy uglerod soliqi</span></div>
          <div class="kpi hl"><span class="l">EI ga to'lanadi, 2026–2034</span><span class="v">${mln(sum("eu"))}<small>mln USD</small></span><span class="n">CBAM sertifikatlari</span></div>
          <div class="kpi"><span class="l">Umumiy yuk, ${esc(last.year ?? 2034)}</span><span class="v">${mln(last.total)}<small>mln USD</small></span><span class="n">EU ETS narxi ${fmt(r.pEts)} USD/t</span></div>
        </div>
        ${r.signals.length ? `<div class="banner"><b>Siyosat signali.</b> ${r.signals.join(", ")}-yillarda milliy soliq EI dagi samarali narxdan yuqori, shu sababli eksportyorning umumiy yuki oshadi.</div>` : ""}
        <section class="panel"><h2>Yillar bo'yicha taqsimot <span class="unit">mln USD</span></h2>
          ${r.processName ? `<ul class="meta" style="margin-bottom:14px"><li>Jarayon <b>${esc(r.processName)}</b></li><li>Bazaviy eksport <b>${fmt(r.exportT)} t</b></li><li>SEE <b>${fmt(r.see, 4)} t CO₂e / t</b></li><li>Qamrov <b>${pct(r.sCov)}</b></li></ul>` : ""}
          ${table([
            { h: "Yil", v: x => `${esc(x.year)}${x.signal ? ` <span class="pill mid">Ortiqcha yuk</span>` : ""}`, html: true },
            { h: "EI samarali narxi, USD/t", k: "effPrice", num: true, d: 2 },
            { h: "CBAM yalpi", v: x => mln(x.gross), html: true, num: true },
            { h: "O'zbekistonda", v: x => mln(x.ruz), html: true, num: true },
            { h: "EI ga", v: x => mln(x.eu), html: true, num: true },
            { h: "Umumiy yuk", v: x => `<b>${mln(x.total)}</b>`, html: true, num: true },
          ], r.rows, { foot: ["Jami", "", mln(sum("gross")), mln(sum("ruz")), mln(sum("eu")), `<b>${mln(sum("total"))}</b>`] })}
        </section>
        <div class="split">
          <section class="panel"><h2>To'lovlar dinamikasi <span class="unit">mln USD</span></h2>
            ${line([
              { name: "O'zbekistonda qoladi", color: "var(--s1)", points: r.rows.map(x => ({ x: String(x.year), y: x.ruz / 1e6 })) },
              { name: "EI ga to'lov", color: "var(--s2)", points: r.rows.map(x => ({ x: String(x.year), y: x.eu / 1e6 })) },
              { name: "Umumiy yuk", color: "var(--s4)", dash: true, points: r.rows.map(x => ({ x: String(x.year), y: x.total / 1e6 })) },
            ], { d: 2, unit: "mln USD" })}
          </section>
          <section class="panel"><h2>EU ETS narxi ssenariylari</h2>
            <p class="section-intro">2034-yildagi umumiy yuk EU ETS narxiga qarab.</p>
            ${table([
              { h: "EU ETS, USD/t", v: x => x.pEts === r.pEts ? `<b>${fmt(x.pEts)}</b>` : fmt(x.pEts), html: true, num: true },
              { h: "Umumiy yuk, mln USD", v: x => x.pEts === r.pEts ? `<b>${mln(x.total2034)}</b>` : mln(x.total2034), html: true, num: true },
            ], r.etsScenarios, { empty: "EU ETS ssenariylari ma'lumotnomada belgilanmagan." })}
          </section>
        </div>
        <section class="panel"><h2>Ta'sirchanlik tahlili</h2>
          <p class="section-intro">Bitta parametr o'zgarganda 2030-yildagi umumiy yuk qanday o'zgarishi. Bazaviy qiymat: ${mln(r.sensitivity.baseValue)} mln USD.</p>
          ${table([
            { h: "Parametr", v: x => { const s = x.param === prevParam ? "" : esc(PARAM[x.param] || x.param); prevParam = x.param; return s; }, html: true },
            { h: "Parametr o'zgarishi", v: x => signed(x.delta), html: true, num: true },
            { h: "Umumiy yuk, mln USD", v: x => mln(x.value), html: true, num: true },
            { h: "Natija o'zgarishi", v: x => signed(x.changePct, 1), html: true, num: true },
          ], r.sensitivity.rows)}
        </section>`;
    } catch (x) {
      $("#scOut").innerHTML = `<div class="banner crit" role="alert"><b>Prognozni hisoblab bo'lmadi.</b> ${esc(x.message)} Kiritilgan qiymatlarni tekshirib, qayta urinib ko'ring.</div>`;
      errToast(x);
    } finally { if (btn) btn.disabled = false; }
  };
  const sf = $("#scForm");
  if (sf) sf.onsubmit = e => { e.preventDefault(); run(); };
  if (pick.current && sf) run();
}
