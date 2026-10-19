/* M9 — monitoring paneli: eksportyor (FT-8.1), davlat (FT-8.2), boshqa rollar uchun ish stoli. */
import { get } from "../api.js";
import { esc, fmt, pct, mln, table, hbar, line, basisPill, sevName } from "../ui.js";

const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
const deadlinesHtml = list => list?.length ? `<div class="list">${list.map(d => `<div class="sev ${d.daysLeft < 30 ? "hi" : d.daysLeft < 90 ? "mid" : "lo"}"><b>${esc(d.title)}</b><span>${esc(d.date)} · ${d.daysLeft} kun qoldi</span></div>`).join("")}</div>` : `<p class="note">Yaqin muddatlar yo'q.</p>`;

export default async function (el, _p, S) {
  if (S.can("dashboard.exporter")) return exporter(el, S);
  if (S.can("dashboard.gov")) return gov(el, S);
  return roleHome(el, S);
}

async function exporter(el, S) {
  const y = S.year;
  const [d, an] = await Promise.all([get(`/api/dashboard/exporter?year=${y}`), get(`/api/ai/anomalies?year=${y}`).catch(() => [])]);
  const procs = d.processes.filter(p => !p.error);
  const em = procs.reduce((a, p) => a + (p.emissions || 0), 0);
  const series = [];
  for (const [i, p] of procs.slice(0, 4).entries()) {
    const f = await get(`/api/ai/forecast?processId=${p.processId}&year=${y}`).catch(() => null);
    if (f?.series?.length) series.push({ name: p.name, color: COLORS[i], points: f.series.map(s => ({ x: s.t.slice(2), y: s.dirEm / 1000 })) });
  }
  const t = d.cbam.totals;
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Monitoring paneli · ${y}</h1><p class="sub">Emissiyalar, solishtirma emissiya (SEE) standart qiymat va benchmark bilan, CBAM xarajati va ma'lumot to'liqligi (FT-8.1).</p></div></div>
    ${procs.some(p => p.warnings) ? "" : ""}
    <div class="kpis">
      <div class="kpi"><span class="l">Emissiyalar (CBAM chegarasi)</span><span class="v">${fmt(em / 1000, 1)}<small>ming t CO₂e</small></span><span class="n">${procs.length} ta jarayon</span></div>
      <div class="kpi"><span class="l">EI ga eksport</span><span class="v">${fmt(t.netT / 1000, 1)}<small>ming t</small></span><span class="n">kiritilgan emissiya ${fmt(t.ee / 1000, 1)} ming t</span></div>
      <div class="kpi hl"><span class="l">CBAM to'lovi (EI ga)</span><span class="v">${fmt(t.euEur)}<small>€</small></span><span class="n">${d.cbam.transitional ? "o'tish davri — to'lov yo'q" : `CF ${pct(d.cbam.cf, 1)}, milliy chegirma ${fmt(t.ruzEur)} €`}</span></div>
      <div class="kpi ok"><span class="l">Haqiqiy ma'lumot samarasi</span><span class="v">${fmt(t.savingEur)}<small>€</small></span><span class="n">standart qiymatga nisbatan tejam</span></div>
    </div>
    <div class="grid2">
      <section class="panel"><h2>SEE: haqiqiy va standart qiymat <span class="pill ok">t CO₂e / t</span></h2>
        ${hbar(procs.flatMap((p, i) => [{ label: p.name, value: p.seeCbam, color: COLORS[i % 4] }, ...(p.defaultSee ? [{ label: "↳ standart (ustama bilan)", value: p.defaultSee, color: "var(--amber)" }] : [])]), { d: 3 })}
        <p class="note">Benchmark (BM) ma'lumotnomada bo'lsa, CBAM aniq formula bilan hisoblanadi; yo'q bo'lsa soddalashtirilgan formula (F-6.5b).</p></section>
      <section class="panel"><h2>Emissiyalar dinamikasi <span class="pill ok">ming t CO₂e / oy</span></h2>${line(series, { d: 1 })}</section>
    </div>
    <section class="panel"><h2>Jarayonlar</h2>${table([
      { h: "Jarayon", v: p => `<b>${esc(p.name)}</b><br><span class="note">${esc(p.installation)} · ${esc(p.tifCode || "—")}</span>`, html: true },
      { h: "Mahsulot, t", k: "al", num: true },
      { h: "SEE", v: p => p.seeCbam, num: true, d: 4 },
      { h: "Oldingi yil", v: p => p.seePrev, num: true, d: 4 },
      { h: "Qo'llangan", v: p => `${fmt(p.applied, 4)}<br>${basisPill(p.basis)}`, html: true },
      { h: "CCI", v: p => (p.cci == null ? "—" : pct(p.cci, 1)), html: true },
      { h: "To'liqlik", v: p => `<div class="bar" title="${pct(p.quality?.completeness)}"><i style="width:${Math.round((p.quality?.completeness || 0) * 100)}%"></i></div><span class="note">${pct(p.quality?.completeness)}</span>`, html: true },
    ], d.processes.filter(p => !p.error))}
    ${d.processes.filter(p => p.error).map(p => `<div class="banner crit">${esc(p.name)}: ${esc(p.error)}</div>`).join("")}</section>
    <div class="grid2">
      <section class="panel"><h2>Avtomatik tahlil (AI-3) <span class="pill ${an.some(a => a.sev === "hi") ? "hi" : an.length ? "mid" : "ok"}">${an.length} ta</span></h2>
        <p class="ai-label">AI tavsiyasi — inson tasdig'i talab qilinadi</p>
        ${an.length ? `<div class="list">${an.slice(0, 5).map(a => `<div class="sev ${a.sev}"><b><span class="pill ${a.sev}">${sevName[a.sev]}</span> ${esc(a.title)}</b><span>${esc(a.processName)}: ${esc(a.detail)}</span></div>`).join("")}</div><p class="note"><a href="#/ai">Barchasi va qaror qabul qilish →</a></p>` : `<p class="note">Anomaliya topilmadi.</p>`}</section>
      <section class="panel"><h2>Muddatlar (MRV sikli)</h2>${deadlinesHtml(d.deadlines)}</section>
    </div>
    <section class="panel"><h2>Importyorlar kesimida (M6.3)</h2>${table([
      { h: "Importyor", v: r => `${esc(r.name)}${r.eori ? `<br><span class="note mono">${esc(r.eori)}</span>` : ""}`, html: true },
      { h: "Partiyalar", k: "batches", num: true }, { h: "Netto, t", k: "netT", num: true }, { h: "EE, t CO₂e", k: "ee", num: true },
      { h: "Milliy chegirma, €", k: "ruzEur", num: true }, { h: "EI ga to'lov, €", k: "euEur", num: true },
    ], d.cbam.byImporter, { empty: "Bu yil uchun eksport partiyalari yo'q." })}</section>
  </div>`;
}

async function gov(el, S) {
  const y = S.year;
  const [g, rev, risk] = await Promise.all([get(`/api/dashboard/gov?year=${y}`), get(`/api/tax/revenue?baseYear=${y}`).catch(() => null), get(`/api/ai/risk?year=${y}`).catch(() => null)]);
  const T = g.totals;
  const hid = v => (v == null ? `<span class="note">yashirin (&lt; ${g.minGroup})</span>` : null);
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Davlat paneli · ${y}</h1><p class="sub">Uglerod soliqi tushumi, CBAM xavfi tarmoq va hudud kesimida, verifikatsiya ulushi (FT-8.2). Tijorat siri: ${g.minGroup} tadan kam korxonali guruhlar ko'rsatilmaydi.</p></div></div>
    <div class="kpis">
      <div class="kpi"><span class="l">Korxonalar / inshootlar</span><span class="v">${g.operators}<small>/ ${g.installations}</small></span><span class="n">CBAM qamrovida</span></div>
      <div class="kpi"><span class="l">EI ga eksport</span><span class="v">${fmt(T.exported / 1000, 1)}<small>ming t</small></span><span class="n">kiritilgan emissiya ${fmt(T.ee / 1000, 1)} ming t CO₂e</span></div>
      <div class="kpi hl"><span class="l">CBAM xavfi (${y})</span><span class="v">${mln(T.cbamRiskUsd)}<small>mln USD</small></span><span class="n">100% to'lovda ${mln(T.cbamRisk100Usd)} mln USD</span></div>
      <div class="kpi ok"><span class="l">Uglerod soliqi tushumi</span><span class="v">${fmt(T.taxPaidUzs / 1e9, 2)}<small>mlrd so'm</small></span><span class="n">verifikatsiyalangan eksport ${pct(T.verifiedShare)}</span></div>
    </div>
    <div class="grid2">
      <section class="panel"><h2>Tarmoqlar kesimida</h2>${table([{ h: "Tarmoq", k: "name" }, { h: "Korxonalar", k: "operators", num: true },
        { h: "Emissiya, t", v: r => hid(r.emissions) ?? fmt(r.emissions), html: true }, { h: "Eksport, t", v: r => hid(r.exported) ?? fmt(r.exported), html: true },
        { h: "Verifikatsiyalangan", v: r => hid(r.verifiedShare) ?? pct(r.verifiedShare), html: true }], g.bySector)}</section>
      <section class="panel"><h2>Hududlar kesimida</h2>${table([{ h: "Hudud", k: "key" }, { h: "Korxonalar", k: "operators", num: true },
        { h: "Emissiya, t", v: r => hid(r.emissions) ?? fmt(r.emissions), html: true }, { h: "Eksport, t", v: r => hid(r.exported) ?? fmt(r.exported), html: true }], g.byRegion)}</section>
    </div>
    ${rev ? `<section class="panel"><h2>Uglerod soliqi tushumi prognozi (F-6.2c) <span class="pill ok">rejim: ${esc(rev.mode)}</span></h2>
      <p class="note">Asos: ${rev.baseYear}-yil qamrab olingan emissiya ${fmt(rev.baseCovered)} t CO₂e; yig'iluvchanlik koeffitsiyenti k_comp bilan.</p>
      ${table([{ h: "Yil", k: "year" }, { h: "Stavka, USD/t", k: "pUsd", num: true }, { h: "k_comp", k: "kComp", num: true, d: 3 }, { h: "Kurs", k: "fx", num: true }, { h: "Tushum, mlrd so'm", v: r => fmt(r.revenueUzs / 1e9, 2), html: true, num: true }], rev.rows)}</section>` : ""}
    ${risk ? `<section class="panel"><h2>Risk-skoring (AI-9) <span class="ai-label">AI tavsiyasi</span></h2>${table([
      { h: "Korxona", v: r => `${esc(r.name)}<br><span class="note mono">${esc(r.stir)}</span>`, html: true },
      { h: "Ball", v: r => `<span class="pill ${r.level}">${r.score}</span>`, html: true },
      { h: "Asosiy omillar", v: r => esc(r.factors.filter(f => f.points).map(f => `${f.name} (+${f.points})`).join("; ") || "—"), html: true }], risk)}</section>` : ""}
    <section class="panel"><h2>NDC ko'rsatkichi</h2><p class="note">Maqsad: ${g.ndc.target2030 ? pct(g.ndc.target2030) : "—"} kamaytirish (YaIM birligiga, ${g.ndc.baseYear}-yilga nisbatan). ${esc(g.ndc.note)}</p></section>
  </div>`;
}

async function roleHome(el, S) {
  const r = S.user.role;
  let body = "";
  if (r === "verifier") {
    const v = await get("/api/verifications");
    body = `<section class="panel"><h2>Topshiriqlarim</h2>${table([{ h: "Inshoot", k: "installationName" }, { h: "Yil", k: "year" }, { h: "Holat", k: "status" }, { h: "", v: x => `<a href="#/verification/${x.id}">Ochish</a>`, html: true }], v)}</section>`;
  } else if (r === "importer") {
    const sh = await get("/api/share");
    body = `<section class="panel"><h2>Sizga ulashilgan CBAM ma'lumotlari</h2>${table([{ h: "Yil", k: "year" }, { h: "Muddati", v: x => x.expiresAt.slice(0, 10) },
      { h: "", v: x => `<a href="/api/importer/package/${x.id}?format=html" target="_blank" rel="noopener">Ko'rish</a> · <a href="/api/importer/package/${x.id}?format=xlsx">XLSX</a> · <a href="/api/importer/package/${x.id}?format=xml">XML</a>`, html: true }], sh, { empty: "Hozircha ulashilgan paket yo'q." })}</section>`;
  } else if (S.can("refdata.approve")) {
    const p = await get("/api/refdata/proposals");
    body = `<section class="panel"><h2>Tasdiq kutayotgan ma'lumotnoma takliflari <span class="pill ${p.length ? "mid" : "ok"}">${p.length}</span></h2>${table([{ h: "Kalit", k: "key" }, { h: "Qiymat", v: x => JSON.stringify(x.value).slice(0, 60) }, { h: "Amal qilish", k: "validFrom" }, { h: "Taklif", k: "proposedBy" }], p, { empty: "Taklif yo'q." })}<p class="note"><a href="#/refdata">Ma'lumotnomalarga o'tish →</a></p></section>`;
  } else {
    body = `<section class="panel"><h2>Xush kelibsiz</h2><p class="note">Rolingiz uchun mavjud bo'limlar chap menyuda.</p></section>`;
  }
  el.innerHTML = `<div class="view"><div class="head"><div><h1>${esc(S.user.roleName)}</h1><p class="sub">${esc(S.user.name)}</p></div></div>${body}</div>`;
}
