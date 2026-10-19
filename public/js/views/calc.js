/* Emissiya hisobi: jonli hisob, hisob izi (har bir formula), haqiqiy va standart qiymat tanlovi, natija versiyalari va solishtirish, milliy MRV va CBAM chegarasi. */
import { get, post } from "../api.js";
import { $, $$, esc, fmt, pct, table, toast, errToast, basisPill, basisName, sevName, dt } from "../ui.js";
import { processPicker, bindPicker, route } from "../app.js";

const val = v => (typeof v === "number" ? fmt(v, Math.abs(v) < 10 ? 4 : 2) : esc(v ?? "—"));
const SEE_UNIT = "t CO₂e/t";
/** Kimyoviy formulalar va birliklar: CO2 → CO₂, m3 → m³. */
const pretty = s => esc(s ?? "").replace(/CO2/g, "CO₂").replace(/^1000m3$/, "ming m³").replace(/m3\b/g, "m³");
/** Nol qiymat jadvalda sokin ko'rinadi, boshqalari odatiy. */
const q1 = v => (Math.abs(+v || 0) < 1e-9 ? `<span class="muted">${fmt(0, 1)}</span>` : fmt(v, 1));
const months = m => `${m.join(", ")}-oy`;
const STATUS = { draft: ["lo", "Qoralama"], submitted: ["mid", "Topshirilgan"], verified: ["ok", "Verifikatsiyalangan"] };

const head = (actions = "") => `<div class="head"><div><h1>Emissiya hisobi</h1><p class="sub">Jarayon emissiyasi EI CBAM usulida hisoblanadi; har bir raqamning formulasi va kirish qiymatlari verifikator uchun ochiq.</p></div>${actions ? `<div class="row">${actions}</div>` : ""}</div>`;

/** Jamlanma jadvali: oddiy qator, oraliq jami va jadval. */
const tRow = (label, f, v) => `<tr><td>${label}</td><td>${f ? `<span class="mono">${f}</span>` : ""}</td><td class="num">${q1(v)}</td></tr>`;
const tTotal = (label, f, v) => `<tr class="total"><td>${label}</td><td>${f ? `<span class="mono">${f}</span>` : ""}</td><td class="num">${fmt(v, 1)}</td></tr>`;
const tTable = (title, rows) => `<div class="tablewrap"><table><thead><tr><th>${title}</th><th>Formula</th><th class="num">t CO₂e</th></tr></thead><tbody>${rows}</tbody></table></div>`;

export default async function (el, params, S) {
  const pick = await processPicker();
  if (!pick.current) {
    el.innerHTML = `<div class="view">${head()}
      <div class="empty"><p><b>Hisob uchun jarayon topilmadi.</b></p><p>Avval reyestrda inshoot va ishlab chiqarish jarayonini, so'ng uning manba oqimlarini qo'shing.</p>${S.can("registry.read") ? `<a class="btn" href="#/registry">Reyestrni ochish</a>` : ""}</div></div>`;
    return;
  }
  const y = S.year, pid = pick.current.id;
  let c, err = null;
  try { c = await get(`/api/processes/${pid}/calc?year=${y}`); } catch (e) { err = e; }
  const [versions, summary] = await Promise.all([get(`/api/processes/${pid}/results?year=${y}`).catch(() => []), get(`/api/installations/${pick.current.instId}/summary?year=${y}`).catch(() => null)]);
  if (err) {
    el.innerHTML = `<div class="view">${head(pick.html)}
      <div class="banner crit" role="alert"><b>Hisobni bajarib bo'lmadi.</b> ${esc(err.message)}</div>
      <section class="panel"><h2>Hisobni qanday tiklash mumkin</h2>
        <div class="stack">
          <ol class="steps">
            <li><span>Reyestrda <b>${esc(pick.current.inst)}</b> inshootini va <b>${esc(pick.current.name)}</b> jarayonini oching.</span></li>
            <li><span>Monitoring rejasidagi oqim sozlamalarini to'ldiring: yoqilg'i turi, emissiya koeffitsiyenti, prekursor manbasi.</span></li>
            <li><span>Shu sahifaga qayting, hisob avtomatik qayta bajariladi.</span></li>
          </ol>
          <div class="row"><a class="btn" href="#/registry/${esc(pick.current.instId)}">Reyestrda jarayonni ochish</a>${S.can("data.read") ? `<a class="btn ghost" href="#/data">Ma'lumot kiritishga o'tish</a>` : ""}</div>
        </div>
      </section></div>`;
    bindPicker(); return;
  }

  const T = c.totals, sel = c.selection, qa = c.quality || {};
  const groups = S.meta?.goodsGroups || {}, types = S.meta?.streamTypes || {};
  const group = groups[c.goodsGroup];
  const ytd = c.ytdMonths;
  const warns = ytd ? c.warnings.slice(1) : c.warnings;
  const period = ytd ? `${y}-yil, 1–${ytd}-oylar` : `${y}-yil, 12 oy`;
  const anomalies = c.anomalies || [];
  const canDecide = S.can("data.write") || S.can("verification.work");
  const canRun = S.can("calc.run"), canSub = S.can("calc.submit");

  /* Standart qiymat bilan taqqoslash */
  const act = sel.actual, def = sel.default;
  const top = Math.max(act || 0, def || 0) || 1;
  const bar = (label, sub, v, color) => `<div><div class="toolbar"><span>${label}<span class="cell-sub">${sub}</span></span><b class="num">${v != null ? fmt(v, 4) : "—"}</b></div>
    <div class="bar" style="margin-top:8px" aria-hidden="true"><i style="width:${v != null ? Math.max(0.5, (v / top) * 100).toFixed(1) : 0}%${color ? `;background:${color}` : ""}"></i></div></div>`;
  const dvText = c.tif?.dvStatus === "value" ? fmt(c.tif.dvTot, 3) : c.tif?.dvStatus === "none" ? "Belgilanmagan (“−”)" : "Jadvalda yo'q";
  let verdict;
  if (act != null && def != null) {
    const d = def - act;
    verdict = d > 0
      ? `Haqiqiy SEE standart qiymatdan ${fmt(d, 4)} ${SEE_UNIT} past. ${sel.basis === "actual" ? "Rasmiy hisobda verifikatsiyalangan haqiqiy qiymat qo'llanmoqda." : "Haqiqiy qiymat verifikatsiyadan o'tgach rasmiy hisobda qo'llanadi."}`
      : `Haqiqiy SEE standart qiymatdan ${fmt(-d, 4)} ${SEE_UNIT} yuqori.`;
  } else if (act == null) verdict = "Haqiqiy SEE hisoblanmadi: mahsulot hajmi va manba oqimlari kiritilganini tekshiring.";
  else verdict = c.tif?.dvStatus === "none"
    ? "Bu TIF TN kodi uchun standart qiymat belgilanmagan: rasmiy hisobda faqat verifikatsiyalangan haqiqiy ma'lumot qo'llanishi mumkin."
    : "Standart qiymat ma'lumotnomada yo'q: haqiqiy ma'lumot qo'llanadi va CBAM hujjatidan oldin verifikatsiya talab qilinadi.";
  const intro = c.tif
    ? `TIF TN ${esc(c.tif.code)} (${esc(c.tif.name || "nomi ko'rsatilmagan")}) uchun EI standart qiymati jarayonning haqiqiy ko'rsatkichi bilan solishtiriladi.${c.tif.sample ? " Jadvaldagi qiymat misol sifatida kiritilgan." : ""}`
    : "Jarayonga TIF TN kodi biriktirilmagan, shuning uchun standart qiymat aniqlanmaydi. Kodni reyestrdagi jarayon kartasida kiriting.";

  /* Manba oqimlari */
  const streamCols = [
    { h: "Manba oqimi", html: true, v: l => `${esc(l.name)}<span class="cell-sub">${esc(types[l.type] || l.type)}</span>${
      l.filledMonths.length ? `<span class="cell-sub"><span class="pill mid">${months(l.filledMonths)} to'ldirilgan</span></span>` : ""}${
      l.estimatedMonths?.length ? `<span class="cell-sub"><span class="pill mid">${months(l.estimatedMonths)} taxminiy</span></span>` : ""}` },
    { h: "Yillik miqdor", k: "annual", num: true, d: 2 },
    { h: "Birlik", html: true, v: l => pretty(l.unit) || "—" },
    { h: "Emissiya, t CO₂e", num: true, html: true, v: l => (l.type === "product" ? `<span class="muted">—</span>` : fmt(l.emission, 1)) },
  ];

  /* Natija versiyalari */
  const saveBtn = canRun ? `<button class="btn" type="button" id="saveRes">Joriy hisobni saqlash</button>` : "";
  const versionCols = [
    { h: "Versiya", html: true, v: r => `<b>v${esc(r.version)}</b>` },
    { h: "Holat", html: true, v: r => { const [k, n] = STATUS[r.status] || ["lo", r.status]; return `<span class="pill ${k}">${esc(n)}</span>`; } },
    { h: "Haqiqiy SEE (CBAM)", k: "seeCbam", num: true, d: 4 },
    { h: "Qo'llangan SEE", num: true, html: true, v: r => `${fmt(r.seeApplied, 4)}<span class="cell-sub">${esc(basisName[r.basis] || "")}</span>` },
    { h: "Saqlangan", v: r => dt(r.createdAt) },
    { h: "Amallar", html: true, v: r => `<div class="row"><label class="inline"><input type="checkbox" data-cmp="${esc(r.id)}" aria-label="v${esc(r.version)} versiyani solishtirishga tanlash"> Solishtirish</label>${
      r.status === "draft" && canSub ? `<button class="btn ghost small" type="button" data-sub="${esc(r.id)}">Verifikatsiyaga topshirish</button>` : ""}</div>` },
  ];

  /* Milliy MRV va CBAM chegarasi */
  const boundary = summary ? `<section class="panel"><h2>Milliy MRV va CBAM chegarasi <span class="unit">t CO₂e</span></h2>
      <p class="section-intro">${esc(summary.installation?.name || pick.current.inst)} inshootining barcha jarayonlari bo'yicha. Bir xil emissiya ikki tizimda turli chegarada hisobga olinadi.</p>
      <div class="stack">
        <div class="split">
          <div class="tablewrap"><table>
            <thead><tr><th>Tarkib</th><th class="num">Milliy MRV</th><th class="num">CBAM</th></tr></thead>
            <tbody>
              <tr><td>To'g'ridan-to'g'ri emissiya</td><td class="num">${fmt(summary.national.direct)}</td><td class="num">${fmt(summary.cbam.direct)}</td></tr>
              <tr><td>Bilvosita emissiya (elektr)</td><td class="num">${fmt(summary.national.indirect)}</td><td class="num">${fmt(summary.cbam.indirect)}</td></tr>
              <tr><td>Prekursorlar</td><td class="num"><span class="muted">—</span></td><td class="num">${fmt(summary.cbam.precursors)}</td></tr>
              <tr class="total"><td>Jami</td><td class="num">${fmt(summary.national.total)}</td><td class="num">${fmt(summary.cbam.total)}</td></tr>
            </tbody></table></div>
          <div class="callout"><div><h3>Farq qayerdan kelib chiqadi</h3><ul class="note" style="margin:6px 0 0;padding-left:18px">${summary.explanations.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
        </div>
        ${summary.processes?.length > 1 ? `<details><summary>Jarayonlar bo'yicha taqsimot (${summary.processes.length})</summary>${table([
          { h: "Jarayon", html: true, v: p => `${esc(p.name)}<span class="cell-sub">${esc(groups[p.goodsGroup]?.name || p.goodsGroup || "")}${p.tifCode ? `, TIF TN ${esc(p.tifCode)}` : ""}</span>` },
          { h: "DirEm, t", k: "dirEm", num: true },
          { h: "AttrEm, t", k: "attrDir", num: true },
          { h: "Elektr, t", k: "emEl", num: true },
          { h: "Prekursorlar, t", num: true, html: true, v: p => fmt((p.precDir || 0) + (p.precInd || 0)) },
          { h: "Qo'llangan SEE", num: true, html: true, v: p => `${fmt(p.applied, 4)}<span class="cell-sub">${esc(basisName[p.basis] || "")}</span>` },
        ], summary.processes)}</details>` : ""}
        ${summary.errors?.length ? `<p class="note">${summary.errors.length} ta jarayonni hisoblab bo'lmadi va ular jamiga kirmagan. Ularning oqim sozlamalarini reyestrda tekshiring.</p>` : ""}
      </div></section>` : "";

  el.innerHTML = `<div class="view">
    ${head(pick.html)}
    ${ytd ? `<div class="banner info"><b>Hisob davri: 1–${ytd}-oylar.</b> Joriy yil tugamagan, shuning uchun hisob yil boshidan oxirgi tugagan oygacha bajarilgan. Yillik yakuniy natija yil tugagach hisoblanadi.</div>` : ""}
    ${warns.length ? `<div class="banner" role="status"><b>Hisobni topshirishdan oldin tekshiring</b><ul>${warns.map(w => `<li>${esc(w)}</li>`).join("")}</ul>${
      S.can("data.read") ? `<p style="margin:8px 0 0"><a class="link-more" href="#/data">Ma'lumot kiritish sahifasini ochish</a></p>` : ""}</div>` : ""}

    <div class="kpis">
      <div class="kpi"><span class="l">To'g'ridan-to'g'ri SEE</span><span class="v">${fmt(c.see.seeDir, 4)}<small>${SEE_UNIT}</small></span><span class="n">Taqsimlangan emissiya ${fmt(T.attrDir)} t</span></div>
      <div class="kpi"><span class="l">Bilvosita SEE</span><span class="v">${fmt(c.see.seeInd, 4)}<small>${SEE_UNIT}</small></span><span class="n">Elektr emissiyasi ${fmt(T.emEl)} t</span></div>
      <div class="kpi"><span class="l">Haqiqiy SEE (CBAM)</span><span class="v">${fmt(c.see.seeCbam, 4)}<small>${SEE_UNIT}</small></span><span class="n">${group && !group.indirect ? "Bilvosita qo'shilmaydi; mahsulot" : "Mahsulot hajmi"} ${fmt(T.al)} t</span></div>
      <div class="kpi ${sel.basis === "actual" ? "ok" : "hl"}"><span class="l">Rasmiy hisobda qo'llanadi</span><span class="v">${fmt(sel.applied, 4)}<small>${SEE_UNIT}</small></span><span class="n">${basisPill(sel.basis)}</span></div>
    </div>

    <div class="split">
      <section class="panel"><h2>Manba oqimlari <span class="unit">${c.lines.length} ta oqim</span></h2>
        ${c.lines.length ? table(streamCols, c.lines) : `<div class="empty"><p>Monitoring rejasida faol manba oqimi yo'q.</p>${S.can("registry.read") ? `<a class="btn" href="#/registry/${esc(pick.current.instId)}">Oqim qo'shish</a>` : ""}</div>`}
      </section>
      <section class="panel"><h2>Hisob rekvizitlari</h2>
        <dl class="kv">
          <dt>Inshoot</dt><dd>${esc(pick.current.inst)}</dd>
          <dt>Jarayon</dt><dd>${esc(c.processName || pick.current.name)}</dd>
          <dt>Tovar guruhi</dt><dd>${esc(group?.name || c.goodsGroup || "—")}</dd>
          <dt>TIF TN kodi</dt><dd>${c.tifCode ? `<span class="mono">${esc(c.tifCode)}</span>${c.tif?.name ? `<span class="cell-sub">${esc(c.tif.name)}</span>` : ""}` : "Ko'rsatilmagan"}</dd>
          <dt>Hisob davri</dt><dd>${period}</dd>
          <dt>Verifikatsiya</dt><dd>${c.verified ? `<span class="pill ok">O'tgan</span>` : `<span class="pill mid">O'tmagan</span>`}</dd>
          <dt>Ma'lumot to'liqligi</dt><dd>${qa.expected ? `${pct(qa.completeness)}<span class="cell-sub">${fmt(qa.entered)} / ${fmt(qa.expected)} oylik yozuv</span>` : "—"}</dd>
          <dt>Ma'lumotnomalar</dt><dd>${c.refs.length} ta versiya qayd etilgan</dd>
        </dl>
      </section>
    </div>

    <section class="panel"><h2>Emissiyalar jamlanmasi <span class="unit">t CO₂e</span></h2>
      <p class="section-intro">To'g'ridan-to'g'ri emissiya jarayonga taqsimlanadi, so'ng bilvosita emissiya va prekursorlar qo'shiladi.</p>
      <div class="grid2">
        ${tTable("To'g'ridan-to'g'ri emissiya",
          tRow("Yoqilg'i yonishi", "F-5.2", T.combustion) +
          tRow("Texnologik emissiya", "F-5.3a/c", T.process) +
          tRow("Massa balansi", "F-5.3b", T.massBalance) +
          tRow("CO₂ dan boshqa gazlar", "F-5.3d", T.nonCo2) +
          tRow("Uzluksiz o'lchov (CEMS)", "F-5.4", T.cems) +
          tRow("Qo'lda kiritilgan (CKD va boshqalar)", "F-5.3a", T.directManual) +
          tTotal("Jami to'g'ridan-to'g'ri (DirEm)", "F-5.2–5.4", T.dirEm))}
        ${tTable("Taqsimlash va kiritilgan emissiya",
          tRow("To'g'ridan-to'g'ri emissiya (DirEm)", "", T.dirEm) +
          tRow("Qabul qilingan issiqlik", "F-5.6a", T.heatImp) +
          tRow("Berilgan issiqlik", "F-5.6a", -T.heatExp) +
          tRow("Chiqindi gazlar tuzatmasi", "F-5.6b", T.wgCorr) +
          tRow("Berilgan elektr", "F-5.5a", -T.elExp) +
          tTotal("Jarayonga taqsimlangan (AttrEm)", "F-5.6b", T.attrDir) +
          tRow("Bilvosita: iste'mol qilingan elektr", "F-5.5a", T.emEl) +
          tRow("Prekursorlarning kiritilgan emissiyasi", "F-5.6d", T.precDir + T.precInd) +
          tTotal("Jami kiritilgan emissiya", "", T.totalEmbedded))}
      </div>
    </section>

    <section class="panel"><h2>Standart qiymat bilan taqqoslash <span class="unit">${SEE_UNIT}</span></h2>
      <p class="section-intro">${intro}</p>
      <div class="grid2">
        <div class="stack">
          ${bar("Haqiqiy SEE", "Jarayon ma'lumotlari bo'yicha", act, "")}
          ${bar("Standart SEE", "DV × (1 + mark-up)", def, "var(--amber)")}
          <p class="note" style="margin:0">${verdict}</p>
        </div>
        <dl class="kv">
          <dt>Standart qiymat (DV)</dt><dd>${dvText}</dd>
          <dt>Mark-up, ${y}</dt><dd>${pct(c.markup)}</dd>
          <dt>Standart SEE</dt><dd>${fmt(def, 4)}</dd>
          <dt>Haqiqiy SEE</dt><dd>${fmt(act, 4)}</dd>
          <dt>Farq</dt><dd>${def != null && act != null ? `${fmt(def - act, 4)} ${SEE_UNIT}${def ? `<span class="cell-sub">standart qiymatning ${pct(Math.abs(def - act) / def)} qismi</span>` : ""}` : "—"}</dd>
        </dl>
      </div>
    </section>

    <section class="panel"><h2>Ma'lumotlardagi anomaliyalar <span class="ai-label">AI tavsiyasi</span></h2>
      <p class="section-intro">Model odatiy bo'lmagan qiymatlarni belgilaydi. Har bir holat bo'yicha qarorni mutaxassis qabul qiladi, qaror audit jurnaliga yoziladi.</p>
      ${anomalies.length ? `<div class="list">${anomalies.map(a => `<div class="sev ${esc(a.sev)}">
        <b><span class="pill ${esc(a.sev)}">${esc(sevName[a.sev] || a.sev)}</span>${esc(a.title)}${a.decision ? (a.decision.status === "confirmed" ? `<span class="pill hi">Xato tasdiqlangan</span>` : `<span class="pill lo">Asossiz deb topilgan</span>`) : ""}</b>
        <span>${esc(a.detail)}</span>
        <ul class="meta">${a.month ? `<li><b>Oy:</b> ${esc(a.month)}</li>` : ""}<li><b>Model:</b> ${esc(a.model)} ${esc(a.modelVersion)}</li></ul>
        ${!a.decision && canDecide ? `<div class="row"><button class="btn small" type="button" data-dec="confirmed" data-id="${esc(a.id)}">Xato deb tasdiqlash</button><button class="btn ghost small" type="button" data-dec="dismissed" data-id="${esc(a.id)}">Asossiz deb belgilash</button></div>` : ""}
      </div>`).join("")}</div>` : `<p class="note" style="margin:0">Ushbu jarayon va yil ma'lumotlarida odatiy bo'lmagan qiymat aniqlanmadi.</p>`}
    </section>

    <section class="panel"><h2>Hisob izi <span class="unit">${c.trace.length} qadam</span></h2>
      <p class="section-intro">Har bir qadam formula, kirish qiymatlari va natija bilan qayd etiladi. Verifikator hisobni shu jadval bo'yicha qayta bajara oladi.</p>
      <div class="stack">
        <details><summary>Formulalar va kirish qiymatlari</summary>${table([
          { h: "Formula", html: true, v: s => `<span class="mono">${esc(s.id)}</span>` },
          { h: "Qadam", k: "label" },
          { h: "Ifoda", html: true, v: s => `<span class="mono">${pretty(s.formula)}</span>` },
          { h: "Kirish qiymatlari", html: true, v: s => { const e = Object.entries(s.inputs || {}); return e.length ? e.map(([k, v]) => `<div class="mono">${esc(k)} = ${val(v)}</div>`).join("") : `<span class="muted">—</span>`; } },
          { h: "Natija", num: true, html: true, v: s => `${val(s.result)}${s.unit ? `<span class="cell-sub">${pretty(s.unit)}</span>` : ""}` },
        ], c.trace, { empty: "Hisob izi bo'sh: manba oqimlari kiritilgach qadamlar shu yerda ko'rinadi." })}</details>
        <details><summary>Ishlatilgan ma'lumotnoma versiyalari (${c.refs.length})</summary>${table([
          { h: "Kalit", html: true, v: r => `<span class="mono">${esc(r.key)}</span>` },
          { h: "Versiya", k: "version", num: true },
          { h: "Yozuv ID", k: "id", num: true },
        ], c.refs, { empty: "Hisobda ma'lumotnoma qiymatlari ishlatilmagan." })}</details>
      </div>
    </section>

    <section class="panel"><h2>Natija versiyalari</h2>
      <p class="section-intro">Saqlangan versiya o'zgarmaydi va ishlatilgan ma'lumotnomalar bilan birga arxivlanadi. Verifikatsiyaga bitta versiya topshiriladi.</p>
      ${versions.length ? `<div class="stack">${table(versionCols, versions)}
        <div class="row">${saveBtn}${versions.length > 1 ? `<button class="btn ghost" type="button" id="cmpBtn">Belgilangan versiyalarni solishtirish</button>` : `<span class="note">Solishtirish uchun kamida ikkita versiya kerak.</span>`}</div></div>`
        : `<div class="empty"><p><b>${y}-yil uchun natija hali saqlanmagan.</b></p><p>${canRun ? "Joriy hisobni versiya sifatida saqlang, so'ng uni verifikatsiyaga topshiring." : "Natijani korxona mutaxassisi saqlaydi va verifikatsiyaga topshiradi."}</p>${saveBtn}</div>`}
      <div id="cmpOut"></div>
    </section>

    ${boundary}
  </div>`;

  bindPicker();
  const busy = async (b, fn) => { b.disabled = true; try { await fn(); } catch (x) { errToast(x); b.disabled = false; } };
  $$("[data-dec]").forEach(b => b.onclick = () => busy(b, async () => { await post(`/api/ai/anomalies/${b.dataset.id}/decision`, { status: b.dataset.dec, processId: pid, year: y }); toast("Qaror saqlandi"); route(); }));
  const sr = $("#saveRes"); if (sr) sr.onclick = () => busy(sr, async () => { const r = await post(`/api/processes/${pid}/results`, { year: y }); toast(`v${r.version} versiya saqlandi`); route(); });
  $$("[data-sub]").forEach(b => b.onclick = () => busy(b, async () => { await post(`/api/results/${b.dataset.sub}/submit`); toast("Versiya verifikatsiyaga topshirildi"); route(); }));
  const cb = $("#cmpBtn");
  if (cb) cb.onclick = async () => {
    const ids = $$("[data-cmp]:checked").map(x => x.dataset.cmp);
    if (ids.length !== 2) return toast("Solishtirish uchun aynan ikkita versiyani belgilang");
    try {
      const r = await get(`/api/results/compare?a=${ids[1]}&b=${ids[0]}`);
      const out = $("#cmpOut");
      out.innerHTML = `<div class="stack" style="margin-top:22px">
        <h3>v${esc(r.a.version)} va v${esc(r.b.version)} solishtirmasi</h3>
        <ul class="meta"><li><b>Kirish ma'lumotlari:</b> ${r.inputsChanged ? "o'zgargan" : "o'zgarmagan"}</li><li><b>Ma'lumotnomalar:</b> ${r.refs.length ? `${r.refs.length} ta o'zgargan` : "o'zgarmagan"}</li></ul>
        ${table([{ h: "Ko'rsatkich", k: "metric" }, { h: `v${r.a.version}`, k: "a", num: true, d: 4 }, { h: `v${r.b.version}`, k: "b", num: true, d: 4 }, { h: "Farq", k: "diff", num: true, d: 4 }, { h: "Farq, %", num: true, html: true, v: m => pct(m.diffPct, 2) }], r.metrics)}
        ${r.refs.length ? `<h3>O'zgargan ma'lumotnomalar</h3>${table([{ h: "Kalit", html: true, v: x => `<span class="mono">${esc(x.key)}</span>` }, { h: `v${r.a.version}`, k: "a", num: true }, { h: `v${r.b.version}`, k: "b", num: true }], r.refs)}` : ""}
      </div>`;
      out.scrollIntoView({ block: "nearest" });
    } catch (x) { errToast(x); }
  };
}
