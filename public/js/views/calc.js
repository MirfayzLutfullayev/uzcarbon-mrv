/* M4 — hisob-kitob: jonli hisob, hisob izi (har bir formula), haqiqiy/standart tanlov, versiyalar va solishtirish, milliy MRV va CBAM chegarasi. */
import { get, post } from "../api.js";
import { $, $$, esc, fmt, pct, table, toast, errToast, basisPill, sevName, dt } from "../ui.js";
import { processPicker, bindPicker, route } from "../app.js";

const val = v => (typeof v === "number" ? fmt(v, Math.abs(v) < 10 ? 4 : 2) : esc(v ?? "—"));

export default async function (el, params, S) {
  const pick = await processPicker();
  if (!pick.current) { el.innerHTML = `<div class="view"><h1>Hisob-kitob</h1><div class="empty">Jarayon yo'q.</div></div>`; return; }
  const y = S.year, pid = pick.current.id;
  let c, err = null;
  try { c = await get(`/api/processes/${pid}/calc?year=${y}`); } catch (e) { err = e; }
  const [versions, summary] = await Promise.all([get(`/api/processes/${pid}/results?year=${y}`).catch(() => []), get(`/api/installations/${pick.current.instId}/summary?year=${y}`).catch(() => null)]);
  if (err) {
    el.innerHTML = `<div class="view"><div class="head"><div><h1>Hisob-kitob · ${y}</h1></div><div class="row">${pick.html}</div></div><div class="banner crit">Hisoblab bo'lmadi: ${esc(err.message)}</div><p class="note">Monitoring rejasidagi oqim sozlamalarini (yoqilg'i, EF, prekursor manbasi) tekshiring. <a href="#/registry/${pick.current.instId}">Reyestr →</a></p></div>`;
    bindPicker(); return;
  }
  const T = c.totals, sel = c.selection;
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Hisob-kitob · ${y}</h1><p class="sub">Har bir raqamning formulasi va kirish qiymatlari ko'rinadi — verifikator hisobni qadamma-qadam tekshiradi (M4.5). Ma'lumotnoma versiyalari natijaga bog'lanadi (FT-3.5).</p></div>
      <div class="row">${pick.html}</div></div>
    ${c.warnings.length ? `<div class="banner"><b>Ogohlantirishlar:</b><ul style="margin:6px 0 0;padding-left:18px">${c.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
    <div class="kpis">
      <div class="kpi"><span class="l">SEE to'g'ridan-to'g'ri</span><span class="v">${fmt(c.see.seeDir, 4)}<small>t CO₂e/t</small></span><span class="n">AttrEm ${fmt(T.attrDir)} t</span></div>
      <div class="kpi"><span class="l">SEE bilvosita</span><span class="v">${fmt(c.see.seeInd, 4)}<small>t CO₂e/t</small></span><span class="n">elektr ${fmt(T.emEl)} t</span></div>
      <div class="kpi"><span class="l">SEE (CBAM, haqiqiy)</span><span class="v">${fmt(c.see.seeCbam, 4)}</span><span class="n">mahsulot ${fmt(T.al)} t</span></div>
      <div class="kpi hl"><span class="l">Rasmiy hisobda qo'llanadi</span><span class="v">${fmt(sel.applied, 4)}</span><span class="n">${basisPill(sel.basis)}</span></div>
    </div>
    <div class="grid2">
      <section class="panel"><h2>Manba oqimlari bo'yicha</h2>${table([
        { h: "Oqim", v: l => `${esc(l.name)}${l.filledMonths.length ? `<br><span class="pill mid">to'ldirilgan: ${l.filledMonths.join(", ")}</span>` : ""}${l.estimatedMonths?.length ? `<br><span class="pill mid">taxminiy: ${l.estimatedMonths.join(", ")}</span>` : ""}`, html: true },
        { h: "Yillik miqdor", v: l => `${fmt(l.annual, 2)} <span class="note">${esc(l.unit)}</span>`, html: true },
        { h: "t CO₂e", v: l => (l.type === "product" ? "—" : fmt(l.emission, 1)), html: true },
      ], c.lines)}</section>
      <section class="panel"><h2>Jamlanma (5-bo'lim, 5 bosqich)</h2>
        <dl class="kv"><dt>Yoqilg'i yonishi (F-5.2)</dt><dd>${fmt(T.combustion, 1)}</dd><dt>Texnologik (F-5.3)</dt><dd>${fmt(T.process, 1)}</dd><dt>Massa balansi (F-5.3b)</dt><dd>${fmt(T.massBalance, 1)}</dd>
        <dt>CO₂ dan boshqa gazlar (F-5.3d)</dt><dd>${fmt(T.nonCo2, 1)}</dd><dt>CEMS (F-5.4)</dt><dd>${fmt(T.cems, 1)}</dd><dt>Qo'lda (CKD va b.)</dt><dd>${fmt(T.directManual, 1)}</dd>
        <dt><b>DirEm</b></dt><dd><b>${fmt(T.dirEm, 1)}</b></dd><dt>Issiqlik: qabul / berilgan</dt><dd>${fmt(T.heatImp, 1)} / ${fmt(T.heatExp, 1)}</dd><dt>WG tuzatmasi / berilgan elektr</dt><dd>${fmt(T.wgCorr, 1)} / ${fmt(T.elExp, 1)}</dd>
        <dt><b>AttrEm (F-5.6b)</b></dt><dd><b>${fmt(T.attrDir, 1)}</b></dd><dt>Elektr (F-5.5)</dt><dd>${fmt(T.emEl, 1)}</dd><dt>Prekursorlar (F-5.6d)</dt><dd>${fmt(T.precDir + T.precInd, 1)}</dd>
        <dt>Jami kiritilgan</dt><dd>${fmt(T.totalEmbedded, 1)}</dd></dl>
        <h3 style="margin:14px 0 6px">Standart qiymat bilan taqqoslash (F-5.7)</h3>
        <dl class="kv"><dt>TIF TN</dt><dd>${esc(c.tif?.code || "—")} ${c.tif?.sample ? '<span class="pill mid">misol qiymat</span>' : ""}</dd><dt>Nomi</dt><dd>${esc(c.tif?.name || "—")}</dd>
        <dt>DV_tot</dt><dd>${c.tif?.dvStatus === "value" ? fmt(c.tif.dvTot, 3) : c.tif?.dvStatus === "none" ? "“−” (ruxsat yo'q)" : "jadvalda yo'q"}</dd><dt>Mark-up ${y}</dt><dd>${pct(c.markup)}</dd>
        <dt>Standart SEE</dt><dd>${fmt(sel.default, 4)}</dd><dt>Haqiqiy SEE</dt><dd>${fmt(sel.actual, 4)}</dd>
        <dt>Farq</dt><dd>${sel.default != null && sel.actual != null ? fmt(sel.default - sel.actual, 4) + " t CO₂e/t" : "—"}</dd></dl></section>
    </div>
    ${c.anomalies?.length ? `<section class="panel"><h2>Anomaliyalar (AI-3) <span class="ai-label">AI tavsiyasi — inson qarori</span></h2><div class="list">${c.anomalies.map(a => `<div class="sev ${a.sev}"><b><span class="pill ${a.sev}">${sevName[a.sev]}</span> ${esc(a.title)}${a.decision ? ` <span class="pill ${a.decision.status === "confirmed" ? "hi" : "lo"}">${a.decision.status === "confirmed" ? "tasdiqlangan" : "rad etilgan"}</span>` : ""}</b><span>${esc(a.detail)}</span><span class="note">Model: ${esc(a.model)} ${esc(a.modelVersion)}</span>
      ${!a.decision && (S.can("data.write") || S.can("verification.work")) ? `<span class="row"><button class="btn small" data-dec="confirmed" data-id="${a.id}">Xato deb tasdiqlash</button><button class="btn ghost small" data-dec="dismissed" data-id="${a.id}">Asossiz (rad etish)</button></span>` : ""}</div>`).join("")}</div></section>` : ""}
    <section class="panel"><h2>Hisob izi <span class="pill ok">${c.trace.length} qadam</span></h2>
      <details><summary>Barcha formulalar va kirish qiymatlari</summary>${table([{ h: "Formula", v: s => `<span class="mono">${esc(s.id)}</span>`, html: true }, { h: "Qadam", k: "label" },
        { h: "Ifoda", v: s => `<span class="mono">${esc(s.formula)}</span>`, html: true },
        { h: "Kirish", v: s => `<span class="mono">${Object.entries(s.inputs || {}).map(([k, v]) => `${esc(k)} = ${val(v)}`).join("; ")}</span>`, html: true },
        { h: "Natija", v: s => `${val(s.result)} <span class="note">${esc(s.unit)}</span>`, html: true }], c.trace)}</details>
      <details style="margin-top:8px"><summary>Ishlatilgan ma'lumotnoma versiyalari (${c.refs.length})</summary>${table([{ h: "Kalit", v: r => `<span class="mono">${esc(r.key)}</span>`, html: true }, { h: "Versiya", k: "version", num: true }, { h: "ID", k: "id", num: true }], c.refs)}</details></section>
    <section class="panel"><h2>Natija versiyalari (FT-3.6)</h2>${table([{ h: "Versiya", k: "version", num: true }, { h: "Holat", v: r => `<span class="pill ${r.status === "verified" ? "ok" : r.status === "submitted" ? "mid" : "lo"}">${esc({ draft: "qoralama", submitted: "topshirilgan", verified: "verifikatsiyalangan" }[r.status])}</span>`, html: true },
      { h: "SEE CBAM", k: "seeCbam", num: true, d: 4 }, { h: "Qo'llangan", k: "seeApplied", num: true, d: 4 }, { h: "Yaratilgan", v: r => dt(r.createdAt) },
      { h: "", v: r => `<label class="inline"><input type="checkbox" data-cmp="${r.id}"> solishtirish</label>${r.status === "draft" && S.can("calc.submit") ? ` <button class="btn small" data-sub="${r.id}">Verifikatsiyaga topshirish</button>` : ""}`, html: true }], versions, { empty: "Saqlangan natija yo'q." })}
      <div class="row" style="margin-top:10px">${S.can("calc.run") ? `<button class="btn" id="saveRes">Joriy hisobni yangi versiya sifatida saqlash</button>` : ""}<button class="btn ghost" id="cmpBtn">Tanlangan 2 versiyani solishtirish</button></div>
      <div id="cmpOut" style="margin-top:10px"></div></section>
    ${summary ? `<section class="panel"><h2>Inshoot: milliy MRV va CBAM chegarasi (FT-3.8)</h2>
      <div class="grid2"><dl class="kv"><dt>Milliy MRV: to'g'ridan-to'g'ri</dt><dd>${fmt(summary.national.direct)}</dd><dt>Milliy MRV: elektr</dt><dd>${fmt(summary.national.indirect)}</dd><dt><b>Milliy MRV jami</b></dt><dd><b>${fmt(summary.national.total)}</b></dd></dl>
      <dl class="kv"><dt>CBAM: taqsimlangan</dt><dd>${fmt(summary.cbam.direct)}</dd><dt>CBAM: bilvosita</dt><dd>${fmt(summary.cbam.indirect)}</dd><dt>CBAM: prekursorlar</dt><dd>${fmt(summary.cbam.precursors)}</dd><dt><b>CBAM jami</b></dt><dd><b>${fmt(summary.cbam.total)}</b></dd></dl></div>
      <ul class="note">${summary.explanations.map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
  </div>`;
  bindPicker();
  $$("[data-dec]").forEach(b => b.onclick = async () => { try { await post(`/api/ai/anomalies/${b.dataset.id}/decision`, { status: b.dataset.dec, processId: pid, year: y }); toast("Qaror saqlandi"); route(); } catch (x) { errToast(x); } });
  const sr = $("#saveRes"); if (sr) sr.onclick = async () => { try { const r = await post(`/api/processes/${pid}/results`, { year: y }); toast(`Versiya ${r.version} saqlandi`); route(); } catch (x) { errToast(x); } };
  $$("[data-sub]").forEach(b => b.onclick = async () => { try { await post(`/api/results/${b.dataset.sub}/submit`); toast("Topshirildi"); route(); } catch (x) { errToast(x); } });
  $("#cmpBtn").onclick = async () => {
    const ids = $$("[data-cmp]:checked").map(x => x.dataset.cmp);
    if (ids.length !== 2) return toast("Ikkita versiyani belgilang");
    try {
      const r = await get(`/api/results/compare?a=${ids[1]}&b=${ids[0]}`);
      $("#cmpOut").innerHTML = `<p class="note">v${r.a.version} → v${r.b.version}. Kirish ma'lumotlari ${r.inputsChanged ? "o'zgargan" : "o'zgarmagan"}.</p>` +
        table([{ h: "Ko'rsatkich", k: "metric" }, { h: `v${r.a.version}`, k: "a", num: true, d: 4 }, { h: `v${r.b.version}`, k: "b", num: true, d: 4 }, { h: "Farq", k: "diff", num: true, d: 4 }, { h: "%", v: m => pct(m.diffPct, 2), html: true }], r.metrics) +
        (r.refs.length ? `<h3 style="margin:10px 0 6px">O'zgargan ma'lumotnomalar</h3>` + table([{ h: "Kalit", k: "key" }, { h: "Oldin", k: "a" }, { h: "Keyin", k: "b" }], r.refs) : "");
    } catch (x) { errToast(x); }
  };
}
