/* M6 — CBAM kalkulyatori: partiya va importyor kesimi, haqiqiy va standart samarasi, 2026–2034 ssenariylari, ta'sirchanlik, siyosat signali. */
import { get } from "../api.js";
import { $, esc, fmt, pct, mln, table, errToast, basisPill, opt, line } from "../ui.js";
import { processPicker, bindPicker, route } from "../app.js";

let chosenOp = null;

export default async function (el, _p, S) {
  const y = S.year;
  const ops = await get("/api/operators").catch(() => []);
  const pick = await processPicker();
  const opId = S.user.operatorId || (ops.some(o => o.id === chosenOp) ? chosenOp : ops[0]?.id);
  const cb = opId ? await get(`/api/cbam/operator/${opId}?year=${y}`).catch(e => ({ error: e.message })) : null;
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>CBAM kalkulyatori · ${y}</h1><p class="sub">Aniq formula (benchmark ma'lum bo'lsa, F-6.5a) yoki soddalashtirilgan formula (F-6.5b). O'zbekistonda to'langan uglerod narxi EI to'lovidan chegiriladi (CBAM 9-modda).</p></div>
      ${!S.user.operatorId && ops.length > 1 ? `<label class="inline">Korxona <select id="opSel" style="width:auto">${ops.map(o => opt(o.id, o.name, opId)).join("")}</select></label>` : ""}</div>
    ${cb?.error ? `<div class="banner crit">${esc(cb.error)}</div>` : cb ? `
    <div class="kpis">
      <div class="kpi"><span class="l">Kiritilgan emissiya (EE)</span><span class="v">${fmt(cb.totals.ee)}<small>t CO₂e</small></span><span class="n">${fmt(cb.totals.netT)} t eksport</span></div>
      <div class="kpi"><span class="l">CBAM yalpi</span><span class="v">${fmt(cb.totals.grossEur)}<small>€</small></span><span class="n">${cb.transitional ? "o'tish davri" : `P = ${fmt(cb.pEts)} €/t, CF = ${pct(cb.cf, 1)}`}</span></div>
      <div class="kpi hl"><span class="l">EI ga to'lov</span><span class="v">${fmt(cb.totals.euEur)}<small>€</small></span><span class="n">milliy chegirma ${fmt(cb.totals.ruzEur)} €</span></div>
      <div class="kpi ok"><span class="l">Haqiqiy ma'lumot tejami</span><span class="v">${fmt(cb.totals.savingEur)}<small>€</small></span><span class="n">standartda ${fmt(cb.totals.euDefaultEur)} €</span></div>
    </div>
    ${cb.warnings.length ? `<div class="banner">${cb.warnings.map(esc).join("<br>")}</div>` : ""}
    <section class="panel"><h2>Partiyalar bo'yicha (FT-4.4)</h2>${table([
      { h: "Deklaratsiya", v: b => `<span class="mono">${esc(b.declarationNo)}</span><br><span class="note">${esc(b.date)}</span>`, html: true },
      { h: "Netto, t", k: "netT", num: true, d: 1 }, { h: "SEE", v: b => `${fmt(b.see, 4)}<br>${basisPill(b.basis)}`, html: true },
      { h: "EE, t", k: "ee", num: true, d: 1 }, { h: "Usul", v: b => esc(b.method === "exact" ? "aniq (BM)" : b.method === "simplified" ? "soddalashtirilgan" : "o'tish davri") },
      { h: "Yalpi, €", k: "grossEur", num: true }, { h: "Milliy chegirma, €", k: "ruzEur", num: true }, { h: "EI ga, €", k: "euEur", num: true },
      { h: "Standartda, €", k: "euDefaultEur", num: true }], cb.batches, { empty: "Partiyalar yo'q." })}</section>
    <section class="panel"><h2>Importyorlar kesimida (M6.3)</h2>${table([{ h: "Importyor", v: r => `${esc(r.name)} <span class="note mono">${esc(r.eori || "")}</span>`, html: true }, { h: "Partiyalar", k: "batches", num: true }, { h: "Netto, t", k: "netT", num: true }, { h: "EE, t", k: "ee", num: true }, { h: "EI ga, €", k: "euEur", num: true }], cb.byImporter)}</section>` : `<div class="empty">Korxona tanlanmagan.</div>`}
    <section class="panel"><h2>2026–2034 ssenariysi (M6.2, Ilova A.2 yondashuvi)</h2>
      <form id="scForm" novalidate><div class="fields">
        <div>${pick.html}</div>
        <label>Bazaviy yil<select name="baseYear">${[2024, 2025, 2026].map(v => opt(v, v, 2025)).join("")}</select></label>
        <label>EU ETS narxi, USD/t<input name="etsUsd" type="number" step="any" min="0" value="87"></label>
        <label>Eksport o'zgarishi / yil <em>masalan 0.05</em><input name="exportGrowth" type="number" step="any" value="0"></label>
        <label>SEE o'zgarishi / yil <em>masalan −0.02</em><input name="seeChange" type="number" step="any" value="0"></label>
        <label>Soliq qamrovi s_cov <em>0..1</em><input name="sCov" type="number" step="any" min="0" max="1" value="1"></label>
      </div><div class="row"><button class="btn" type="submit">Hisoblash</button><span class="note">s_cov = 1 — milliy soliq barcha EE ni qamraydi (yuqori chegara); faqat yuqori oqim soliqida yonish ulushi.</span></div></form>
      <div id="scOut" style="margin-top:12px"></div></section>
  </div>`;
  bindPicker();
  const os = $("#opSel"); if (os) os.onchange = () => { chosenOp = os.value; route(); };
  const run = async () => {
    const f = $("#scForm");
    const q = new URLSearchParams({ processId: $("#procSel")?.value || "", baseYear: f.baseYear.value, etsUsd: f.etsUsd.value, exportGrowth: f.exportGrowth.value || 0, seeChange: f.seeChange.value || 0, sCov: f.sCov.value || 1 });
    try {
      const r = await get(`/api/cbam/scenario?${q}`);
      $("#scOut").innerHTML = `<p class="note">Asos: ${esc(r.processName || "")} — eksport ${fmt(r.exportT)} t × SEE ${fmt(r.see, 4)} = EE ${fmt(r.ee)} t CO₂e; P_ETS ${fmt(r.pEts)} USD/t.</p>
        ${r.signals.length ? `<div class="banner">Siyosat signali (M6.8): ${r.signals.join(", ")}-yillarda milliy soliq EI dagi samarali narxdan yuqori — eksportyorning umumiy yuki oshadi.</div>` : ""}
        ${table([{ h: "Yil", k: "year" }, { h: "EI samarali narx, USD/t", k: "effPrice", num: true, d: 2 }, { h: "CBAM yalpi, mln USD", v: x => mln(x.gross), html: true, num: true },
          { h: "O'zbekistonda, mln USD", v: x => mln(x.ruz), html: true, num: true }, { h: "EI ga, mln USD", v: x => mln(x.eu), html: true, num: true }, { h: "Umumiy yuk, mln USD", v: x => `${x.signal ? '<span class="pill mid">signal</span> ' : ""}<b>${mln(x.total)}</b>`, html: true, num: true }], r.rows)}
        ${line([{ name: "O'zbekistonda qoladi", color: "var(--s1)", points: r.rows.map(x => ({ x: String(x.year), y: x.ruz / 1e6 })) }, { name: "EI ga to'lov", color: "var(--s2)", points: r.rows.map(x => ({ x: String(x.year), y: x.eu / 1e6 })) }], { d: 2, unit: "mln USD" })}
        <h3 style="margin:14px 0 6px">Ta'sirchanlik, 2030-yil umumiy yuk (TZ-2 6.6)</h3>
        ${table([{ h: "Parametr", v: x => esc({ ee: "Eksport hajmi (EE)", pEts: "EU ETS narxi", sCov: "Soliq qamrovi" }[x.param]) }, { h: "O'zgarish", v: x => pct(x.delta), html: true }, { h: "Yuk, mln USD", v: x => mln(x.value), html: true }, { h: "Farq", v: x => pct(x.changePct, 1), html: true }], r.sensitivity.rows)}
        <h3 style="margin:14px 0 6px">EU ETS ssenariylari, 2034</h3>${table([{ h: "P_ETS, USD/t", k: "pEts", num: true }, { h: "Umumiy yuk, mln USD", v: x => mln(x.total2034), html: true }], r.etsScenarios)}`;
    } catch (x) { errToast(x); }
  };
  $("#scForm").onsubmit = e => { e.preventDefault(); run(); };
  if (pick.current) run();
}
