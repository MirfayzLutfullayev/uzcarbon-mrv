/* Uglerod soliqi: yoqilg'i stavkalari va yashirin narx, deklaratsiya loyihasi (3 rejim), to'lovlar va tasdiq, P_eff va CP_g, choraklik byulleten. */
import { get, post, download } from "../api.js";
import { $, $$, esc, fmt, pct, table, toast, errToast, formData, opt } from "../ui.js";
import { route } from "../app.js";

const MODE = { up: "Yuqori oqim: yoqilg'i orqali", down1: "Quyi oqim, 1-variant: texnologik emissiya", down2: "Quyi oqim, 2-variant: jami emissiya, yuqori oqim chegiriladi" };
const QUARTER = { Q1: "1-chorak (yanvar–mart)", Q2: "2-chorak (aprel–iyun)", Q3: "3-chorak (iyul–sentabr)", Q4: "4-chorak (oktabr–dekabr)" };
const UNIT = { m3: "m³", "1000m3": "1000 m³" };
const unitName = u => UNIT[u] || u;
const fmtAuto = v => (Math.abs(+v) >= 100 ? fmt(v) : fmt(v, 4));
const mlnUzs = v => fmt(v / 1e6, 1);
const emptyBox = (title, text, action = "") => `<div class="empty"><h3>${title}</h3><p class="note">${text}</p>${action}</div>`;

export default async function (el, _p, S) {
  const y = Math.max(2026, Math.min(2035, S.year));
  const insts = S.can("registry.read") ? await S.insts() : [];
  const [rates, pays, coex] = await Promise.all([get(`/api/tax/rates?year=${y}`), get("/api/tax/payments").catch(() => []), get(`/api/reports/coexistence?year=${y}`).catch(() => null)]);
  const bulletin = S.can("dashboard.gov") ? await get(`/api/reports/bulletin?year=${y}`).catch(() => null) : null;
  const canConfirm = S.can("tax.confirm"), canWrite = S.can("tax.write");

  const net = p => (+p.amountUzs || 0) - (+p.rebateUzs || 0);
  const yPays = pays.filter(p => +p.year === y);
  const paidY = yPays.reduce((a, p) => a + net(p), 0);
  const pending = pays.filter(p => p.status !== "confirmed").length;
  const instOpts = insts.map(i => opt(i.id, i.name)).join("");

  const kpis = `<div class="kpis">
      <div class="kpi"><span class="l">Soliq stavkasi, ${y}</span><span class="v">${fmt(rates.pUsd)}<small>USD / t CO₂e</small></span><span class="n">1 USD = ${fmt(rates.fx)} so'm kursida</span></div>
      <div class="kpi"><span class="l">So'mdagi stavka</span><span class="v">${fmt(rates.pUzs)}<small>so'm / t CO₂e</small></span><span class="n">Yoqilg'i birligiga quyidagi jadvalda</span></div>
      <div class="kpi"><span class="l">To'langan soliq, ${y}</span><span class="v">${mlnUzs(paidY)}<small>mln so'm</small></span><span class="n">${yPays.length ? `${yPays.length} ta to'lov, qaytarishlar chegirilgan` : "Bu yil to'lovlar qayd etilmagan"}</span></div>
      <div class="kpi ${pending ? "hl" : "ok"}"><span class="l">Tasdiq kutilmoqda</span><span class="v">${pending}<small>ta to'lov</small></span><span class="n">${!pays.length ? "To'lovlar hali yo'q" : pending ? "Soliq qo'mitasi tasdig'i kerak" : "Barcha to'lovlar tasdiqlangan"}</span></div>
    </div>`;

  const ratesPanel = `<section class="panel"><h2>Yoqilg'i bo'yicha soliq stavkalari</h2>
      <div class="stack">
        <div class="formula">${fmt(rates.pUzs)} so'm / t CO₂e = ${fmt(rates.pUsd)} USD / t CO₂e × ${fmt(rates.fx)} so'm / USD</div>
        <div class="note">Yoqilg'i birligiga stavka uning emissiya omiliga ko'paytirib topiladi. Hajmda o'lchanadigan yoqilg'ilar uchun tonnaga qayta hisoblangan qiymat ham keltirilgan.</div>
        ${table([
          { h: "Yoqilg'i", k: "name" },
          { h: "Birlik", v: f => esc(unitName(f.unit)), html: true },
          { h: "Omil, t CO₂ / birlik", k: "efPerUnit", num: true, d: 4 },
          { h: "Stavka, so'm / birlik", v: f => `<b>${fmt(f.ratePerUnit)}</b>`, html: true, num: true },
          { h: "Omil, t CO₂ / t", k: "efPerT", num: true, d: 3 },
          { h: "Stavka, so'm / t", k: "ratePerT", num: true },
        ], rates.fuels, { empty: "Yoqilg'i emissiya omillari ma'lumotnomada yo'q." })}
      </div></section>`;

  const implicitPanel = rates.implicit.length || coex ? `<section class="panel"><h2>Amaldagi aksizning yashirin uglerod narxi${coex ? `<div class="row"><button class="btn ghost small" type="button" id="coexBtn">Eslatmani yuklab olish (XLSX)</button></div>` : ""}</h2>
      <div class="stack">
        <div class="note">Aksiz stavkasi yoqilg'ining emissiya omiliga bo'linib, bir tonna CO₂ uchun yashirin narx olinadi. Birgalikda mavjudlik eslatmasi aksiz va uglerod soliqi yuklamasini yoqilg'i kesimida taqqoslaydi.</div>
        ${table([
          { h: "Yoqilg'i", k: "fuel" },
          { h: "Aksiz, so'm / t", k: "exciseUzsPerT", num: true },
          { h: "Aksiz tarkibi", k: "note" },
          { h: "Yashirin narx, USD / t CO₂", v: x => `<b>${fmt(x.implicitUsdPerT, 2)}</b>`, html: true, num: true },
        ], rates.implicit, { empty: "Uglerod tarkibiga bog'langan aksiz stavkalari ma'lumotnomada yo'q." })}
        <div class="note">Ad valorem aksiz (masalan, tabiiy gaz uchun 12%) uglerod tarkibiga bog'lanmagani sababli CBAM chegirmasiga kiritilmaydi.</div>
      </div></section>` : "";

  const declPanel = insts.length ? `<section class="panel"><h2>Soliq deklaratsiyasi loyihasi</h2>
      <p class="section-intro">Inshoot, davr va soliq rejimini tanlang. Loyiha kiritilgan emissiya ma'lumotlaridan tuziladi; XML faylini Soliq qo'mitasiga taqdim etish uchun yuklab olish mumkin.</p>
      <div class="stack">
        <form id="decForm" novalidate><div class="fields">
          <label>Inshoot<select name="installationId">${instOpts}</select></label>
          <label>Davr<select name="quarter"><option value="">Butun yil</option>${Object.entries(QUARTER).map(([k, v]) => opt(k, v)).join("")}</select></label>
          <label>Soliq rejimi<select name="variant">${Object.entries(MODE).map(([k, v]) => opt(k, v)).join("")}</select></label>
        </div><div class="row"><button class="btn" type="submit" id="decBtn">Loyihani hisoblash</button><button class="btn ghost" type="button" id="decXml">XML faylini yuklab olish</button></div></form>
        <div id="decOut" hidden></div>
      </div></section>` : "";

  const effPanel = insts.length ? `<section class="panel"><h2>Samarali to'langan narx</h2>
      <p class="section-intro">To'langan uglerod soliqi va qamrab olingan emissiya asosida samarali narx (P_eff) hamda mahsulot birligiga to'g'ri keladigan narx (CP_g) hisoblanadi. Shu qiymat CBAM to'lovidan chegiriladi.</p>
      <div class="stack">
        <div class="fields"><label>Inshoot<select id="effInst">${instOpts}</select></label></div>
        <div class="row"><button class="btn" type="button" id="effBtn">Narxni hisoblash</button></div>
        <div id="effOut" hidden></div>
      </div></section>` : "";

  const payTable = pays.length ? table([
      { h: "Korxona va inshoot", v: p => `${esc(p.operatorName)}<span class="cell-sub">${esc(p.installationName || "—")}</span>`, html: true },
      { h: "Davr", k: "period" },
      { h: "Soliq turi", v: p => (p.kind === "up" ? "Yuqori oqim" : "Quyi oqim") },
      { h: "Summa, so'm", k: "amountUzs", num: true },
      { h: "Qaytarish, so'm", k: "rebateUzs", num: true },
      { h: "Summa, USD", k: "amountUsd", num: true, d: 2 },
      { h: "Qamrov, t CO₂e", k: "coveredT", num: true },
      { h: "Holat", v: p => (p.status === "confirmed" ? `<span class="pill ok" title="Soliq qo'mitasi tasdiqlagan">Tasdiqlangan</span>` : `<span class="pill mid">Tasdiq kutilmoqda</span>`), html: true },
      ...(canConfirm ? [{ h: "Amal", v: p => (p.status !== "confirmed" ? `<button class="btn small" type="button" data-conf="${esc(p.id)}">Tasdiqlash</button>` : `<span class="muted">—</span>`), html: true }] : []),
    ], pays)
    : emptyBox("To'lovlar hali qayd etilmagan", canWrite ? "Uglerod soliqi to'langach, to'lov topshiriqnomasi ma'lumotlarini kiriting. Tasdiqlangan to'lovlar samarali narx hisobiga asos bo'ladi." : "To'lovlar korxona tomonidan yoki Soliq qo'mitasi integratsiyasi orqali kiritiladi.",
      canWrite ? `<button class="btn" type="button" id="payOpen">To'lovni qayd etish</button>` : "");

  const payPanel = `<section class="panel"><h2>To'lovlar</h2>
      ${canConfirm ? `<p class="section-intro">To'lovni bank ma'lumoti bilan solishtiring, so'ng tasdiqlang. Tasdiqlangan to'lovlar eksportyor hujjatlarida va CBAM chegirmasida qo'llanadi.</p>` : ""}
      <div class="stack">${payTable}
      ${canWrite ? `<details id="payDetails"><summary>To'lovni qayd etish</summary><form id="payForm" novalidate><div class="fields">
        <label>Inshoot<select name="installationId">${instOpts}</select></label>
        <label>Yil<input name="year" type="number" min="2026" max="2035" value="${y}"></label>
        <label>Davr<input name="period" value="${y}-Q1"><em>YYYY yoki YYYY-Q1 shaklida</em></label>
        <label>Soliq turi<select name="kind">${opt("up", "Yuqori oqim")}${opt("down", "Quyi oqim")}</select></label>
        <label>Summa, so'm<input name="amountUzs" type="number" min="0" step="any" required inputmode="decimal"><em>Majburiy</em></label>
        <label>Qaytarish, so'm<input name="rebateUzs" type="number" min="0" step="any" inputmode="decimal"><em>Bo'lmasa, bo'sh qoldiring</em></label>
        <label>Qamrab olingan emissiya, t<input name="coveredT" type="number" min="0" step="any" inputmode="decimal"></label>
        <label>Byudjet kodi<input name="budgetCode"><em>Masalan, UGL-01</em></label>
      </div><div class="row"><button class="btn" type="submit">To'lovni saqlash</button></div></form></details>` : ""}
      </div></section>`;

  const bulPanel = bulletin ? (() => {
    const met = bulletin.collection != null && bulletin.collection >= bulletin.collectionTarget;
    const tot = k => bulletin.periods.reduce((a, x) => a + (+x[k] || 0), 0);
    return `<section class="panel"><h2>Choraklik byulleten</h2>
      <p class="section-intro">Uglerod soliqi tushumlari va yig'iluvchanlik, ${y}-yil. Faqat agregatsiyalangan ko'rsatkichlar.</p>
      <div class="stack">
        <div class="grid3">
          <div class="kpi"><span class="l">To'langan</span><span class="v">${mlnUzs(bulletin.paidUzs)}<small>mln so'm</small></span><span class="n">Qaytarishlar chegirilgan</span></div>
          <div class="kpi"><span class="l">Hisoblangan, yuqori oqim</span><span class="v">${mlnUzs(bulletin.estimatedDueUzs)}<small>mln so'm</small></span><span class="n">Barcha inshootlar bo'yicha</span></div>
          <div class="kpi ${met ? "ok" : "hl"}"><span class="l">Yig'iluvchanlik</span><span class="v">${pct(bulletin.collection, 1)}</span>
            <div class="bar" role="img" aria-label="Yig'iluvchanlik ${pct(bulletin.collection, 1)}"><i style="width:${Math.min(100, Math.max(0, (bulletin.collection || 0) * 100)).toFixed(1)}%"></i></div>
            <span class="n">Maqsad ${pct(bulletin.collectionTarget)}</span></div>
        </div>
        ${table([
          { h: "Davr", k: "period" },
          { h: "Yuqori oqim, so'm", k: "up", num: true },
          { h: "Quyi oqim, so'm", k: "down", num: true },
          { h: "To'lovlar", k: "payments", num: true },
          { h: "Tasdiqlangan", k: "confirmed", num: true },
        ], bulletin.periods, { empty: `${y}-yil uchun to'lovlar hali tushmagan.`, foot: ["Jami", fmt(tot("up")), fmt(tot("down")), fmt(tot("payments")), fmt(tot("confirmed"))] })}
      </div></section>`;
  })() : "";

  const sections = canConfirm
    ? [payPanel, bulPanel, declPanel, effPanel, ratesPanel, implicitPanel]
    : [declPanel, effPanel, payPanel, bulPanel, ratesPanel, implicitPanel];

  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Uglerod soliqi</h1><p class="sub">Milliy uglerod soliqi stavkalari, deklaratsiya loyihasi, to'lovlar va CBAM chegirmasi uchun samarali to'langan narx.</p></div></div>
    ${S.year < 2026 ? `<div class="banner info">${S.year}-yil uchun milliy uglerod soliqi stavkasi belgilanmagan. Quyida 2026-yil ko'rsatkichlari keltirilgan.</div>` : ""}
    ${kpis}
    ${sections.join("")}
  </div>`;

  const df = $("#decForm");
  if (df) {
    df.onsubmit = async e => {
      e.preventDefault();
      const q = new URLSearchParams({ ...formData(df), year: y });
      const out = $("#decOut"), btn = $("#decBtn");
      btn.disabled = true;
      try {
        const d = await get(`/api/tax/declaration?${q}`);
        const warns = d.lines.flatMap(l => l.warnings);
        out.innerHTML = `<div class="stack">
          <div class="callout"><div><h3>To'lanadi: ${fmt(d.due)} so'm</h3><ul class="meta"><li>Taxminan <b>${fmt(d.dueUsd, 2)} USD</b></li><li>Davr <b>${esc(d.period)}</b></li><li>Byudjet kodi <b>${esc(d.budgetCode)}</b></li></ul></div></div>
          <div class="grid2">
            <div class="stack"><h3>Emissiya</h3><dl class="kv">
              <dt>Soliq rejimi</dt><dd>${esc(MODE[d.mode] || d.mode)}</dd>
              <dt>Yonish emissiyasi</dt><dd>${fmt(d.emComb, 1)} t CO₂e</dd>
              <dt>Texnologik emissiya</dt><dd>${fmt(d.emProc, 1)} t CO₂e</dd>
              <dt>Soliq qamrab oladi</dt><dd>${fmt(d.covered, 1)} t CO₂e</dd></dl></div>
            <div class="stack"><h3>Soliq summasi</h3><dl class="kv">
              <dt>Yuqori oqim, hisoblangan</dt><dd>${fmt(d.upstreamEstimate)} so'm</dd>
              <dt>Yuqori oqim, to'langan</dt><dd>${fmt(d.upstreamPaid)} so'm</dd>
              <dt>To'lanadi</dt><dd><b>${fmt(d.due)} so'm</b></dd>
              <dt>Qaytarish arizasi</dt><dd>${fmt(d.potentialRefund)} so'm</dd></dl></div>
          </div>
          ${warns.length ? `<div class="banner"><b>Ma'lumotlar to'liq emas.</b><ul>${warns.map(w => `<li>${esc(w)}</li>`).join("")}</ul>Ma'lumot kiritish bo'limida yetishmayotgan oylarni to'ldiring, so'ng loyihani qayta hisoblang.</div>` : ""}
          <details><summary>Hisob izi</summary>${table([
            { h: "Formula", v: s => `<span class="mono">${esc(s.id)}</span>`, html: true },
            { h: "Ko'rsatkich", k: "label" },
            { h: "Ifoda", v: s => `<span class="mono">${esc(s.formula)}</span>`, html: true },
            { h: "Natija", v: s => fmtAuto(s.result), html: true, num: true },
            { h: "Birlik", k: "unit" },
          ], d.trace)}</details>
        </div>`;
      } catch (x) {
        out.innerHTML = `<div class="banner crit" role="alert"><b>Deklaratsiya loyihasini hisoblab bo'lmadi.</b> ${esc(x.message)} Inshoot uchun shu davr emissiya ma'lumotlari kiritilganini tekshiring.</div>`;
        errToast(x);
      } finally { out.hidden = false; btn.disabled = false; }
    };
    $("#decXml").onclick = () => { const q = new URLSearchParams({ ...formData(df), year: y }); download(`/api/reports/tax-declaration?${q}`).catch(errToast); };
  }
  const eb = $("#effBtn");
  if (eb) eb.onclick = async () => {
    const out = $("#effOut");
    eb.disabled = true;
    try {
      const r = await get(`/api/tax/effective?installationId=${$("#effInst").value}&year=${y}`);
      out.innerHTML = `<div class="stack">
        <div class="grid3">
          <div class="kpi ok"><span class="l">Samarali narx P_eff</span><span class="v">${fmt(r.pEff, 4)}<small>USD / t CO₂e</small></span><span class="n">${esc(MODE[r.mode] || r.mode)}</span></div>
          <div class="kpi"><span class="l">To'langan soliq</span><span class="v">${fmt(r.paidUsd, 2)}<small>USD</small></span><span class="n">${r.payments} ta to'lov, qaytarishlar chegirilgan</span></div>
          <div class="kpi"><span class="l">Qamrab olingan emissiya</span><span class="v">${fmt(r.emCovered, 1)}<small>t CO₂e</small></span><span class="n">${y}-yil</span></div>
        </div>
        ${table([
          { h: "Jarayon", k: "processName" },
          { h: "Qamralgan SEE, t CO₂e / t", k: "seeCov", num: true, d: 4 },
          { h: "CBAM SEE, t CO₂e / t", k: "seeCbam", num: true, d: 4 },
          { h: "Qamrov ulushi", v: x => pct(x.sCov, 1), html: true, num: true },
          { h: "CP_g, USD / t mahsulot", v: x => `<b>${fmt(x.cpUsdPerT, 4)}</b>`, html: true, num: true },
        ], r.processes, { empty: "Inshootda jarayonlar yo'q." })}
      </div>`;
    } catch (x) {
      out.innerHTML = `<div class="banner crit" role="alert"><b>Samarali narxni hisoblab bo'lmadi.</b> ${esc(x.message)} Inshoot uchun emissiya hisobi va to'lovlar mavjudligini tekshiring.</div>`;
      errToast(x);
    } finally { out.hidden = false; eb.disabled = false; }
  };
  const pf = $("#payForm"); if (pf) pf.onsubmit = async e => { e.preventDefault(); try { await post("/api/tax/payments", formData(pf)); toast("To'lov qayd etildi"); route(); } catch (x) { errToast(x); } };
  const po = $("#payOpen"); if (po) po.onclick = () => { const d = $("#payDetails"); if (d) { d.open = true; d.querySelector("select,input")?.focus(); } };
  $$("[data-conf]").forEach(b => b.onclick = async () => { try { await post(`/api/tax/payments/${b.dataset.conf}/confirm`); toast("Tasdiqlandi"); route(); } catch (x) { errToast(x); } });
  const cx = $("#coexBtn"); if (cx) cx.onclick = () => download(`/api/reports/coexistence?year=${y}&format=xlsx`).catch(errToast);
}
