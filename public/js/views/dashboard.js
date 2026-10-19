/* Monitoring paneli: eksportyor, davlat organlari va boshqa rollar uchun ish stoli. */
import { get } from "../api.js";
import { esc, fmt, pct, mln, table, hbar, line, basisPill, sevName } from "../ui.js";

const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];

const deadlines = list => list?.length
  ? `<div class="stack">${list.map(d => {
      const [, m, day] = d.date.split("-");
      return `<div class="deadline${d.daysLeft < 30 ? " soon" : ""}"><time datetime="${esc(d.date)}">${day}<small>${MONTHS[+m - 1]}</small></time><b>${esc(d.title)}</b><span>${esc(d.date)}, ${d.daysLeft} kun qoldi</span></div>`;
    }).join("")}</div>`
  : `<p class="note">Yaqin oylarda muddat yo'q.</p>`;

export default async function (el, _p, S) {
  if (S.can("dashboard.exporter")) return exporter(el, S);
  if (S.can("dashboard.gov")) return gov(el, S);
  return roleHome(el, S);
}

async function exporter(el, S) {
  const y = S.year;
  const [d, an] = await Promise.all([get(`/api/dashboard/exporter?year=${y}`), get(`/api/ai/anomalies?year=${y}`).catch(() => [])]);
  const procs = d.processes.filter(p => !p.error);
  const failed = d.processes.filter(p => p.error);
  const em = procs.reduce((a, p) => a + (p.emissions || 0), 0);
  const series = [];
  for (const [i, p] of procs.slice(0, 4).entries()) {
    const f = await get(`/api/ai/forecast?processId=${p.processId}&year=${y}`).catch(() => null);
    if (f?.series?.length) series.push({ name: p.name, color: COLORS[i], points: f.series.map(s => ({ x: s.t.slice(2), y: s.dirEm / 1000 })) });
  }
  const t = d.cbam.totals;
  const seeItems = procs.flatMap((p, i) => [
    { label: p.name, value: p.seeCbam, color: COLORS[i % 4] },
    ...(p.defaultSee ? [{ label: "shu jarayonning standart qiymati", value: p.defaultSee, color: "var(--amber)" }] : []),
  ]);
  if (!procs.length) {
    el.innerHTML = `<div class="view">
      <div class="head"><div><h1>Monitoring paneli</h1><p class="sub">Korxonangizning emissiyalari, CBAM to'lovi va hisobot muddatlari bir sahifada.</p></div></div>
      <section class="panel"><div class="empty"><h3>${y}-yil uchun hisob hali yo'q</h3>
        <p class="note" style="margin:8px auto 16px;max-width:52ch">Monitoring panelini to'ldirish uchun avval inshoot va ishlab chiqarish jarayonini ro'yxatga oling, so'ng oylik faoliyat ma'lumotlarini kiriting.</p>
        <div class="row" style="justify-content:center"><a class="btn" href="#/registry">Inshoot qo'shish</a><a class="btn ghost" href="#/data">Ma'lumot kiritish</a></div></div></section>
      <section class="panel"><h2>Hisobot muddatlari</h2>${deadlines(d.deadlines)}</section></div>`;
    return;
  }
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Monitoring paneli</h1><p class="sub">Korxonangizning emissiyalari, solishtirma emissiya ko'rsatkichi, CBAM to'lovi va hisobot muddatlari bir sahifada.</p></div></div>
    ${failed.length ? `<div class="banner crit"><b>Hisoblab bo'lmagan jarayonlar:</b><ul>${failed.map(p => `<li>${esc(p.name)}: ${esc(p.error)}</li>`).join("")}</ul></div>` : ""}
    <div class="kpis">
      <div class="kpi"><span class="l">Emissiyalar, CBAM chegarasi</span><span class="v">${fmt(em / 1000, 1)}<small>ming t CO₂e</small></span><span class="n">${procs.length} ta ishlab chiqarish jarayoni</span></div>
      <div class="kpi"><span class="l">Yevropa Ittifoqiga eksport</span><span class="v">${fmt(t.netT / 1000, 1)}<small>ming t</small></span><span class="n">kiritilgan emissiya ${fmt(t.ee / 1000, 1)} ming t CO₂e</span></div>
      <div class="kpi hl"><span class="l">CBAM to'lovi</span><span class="v">${fmt(t.euEur)}<small>€</small></span><span class="n">${d.cbam.transitional ? "o'tish davri, to'lov yo'q" : `bepul kvota ${pct(d.cbam.cf, 1)}, milliy narx chegirmasi ${fmt(t.ruzEur)} €`}</span></div>
      <div class="kpi ok"><span class="l">Haqiqiy ma'lumot tejami</span><span class="v">${fmt(t.savingEur)}<small>€</small></span><span class="n">standart qiymat o'rniga haqiqiy ma'lumotdan foydalanish</span></div>
    </div>
    <div class="grid2">
      <section class="panel"><h2>Solishtirma emissiya: haqiqiy va standart <span class="unit">t CO₂e / t</span></h2>
        <p class="section-intro">Haqiqiy ko'rsatkich standart qiymatdan past bo'lsa, CBAM to'lovi shunga mos kamayadi.</p>
        ${hbar(seeItems, { d: 3 })}</section>
      <section class="panel"><h2>Emissiyalar dinamikasi <span class="unit">ming t CO₂e / oy</span></h2>
        <p class="section-intro">Oylik to'g'ridan-to'g'ri emissiyalar, kiritilgan ma'lumot asosida.</p>
        ${line(series, { d: 1 })}</section>
    </div>
    <section class="panel"><h2>Ishlab chiqarish jarayonlari</h2>${table([
      { h: "Jarayon", v: p => `<b>${esc(p.name)}</b><span class="cell-sub">${esc(p.installation)}${p.tifCode ? `, TIF TN ${esc(p.tifCode)}` : ""}</span>`, html: true },
      { h: "Mahsulot, t", k: "al", num: true },
      { h: "SEE", v: p => p.seeCbam, num: true, d: 4 },
      { h: "Oldingi yil", v: p => p.seePrev, num: true, d: 4 },
      { h: "Hisobda qo'llangan", v: p => `${fmt(p.applied, 4)}<span class="cell-sub">${basisPill(p.basis)}</span>`, html: true },
      { h: "Eksport narxiga ulush", v: p => (p.cci == null ? "—" : pct(p.cci, 1)), html: true, num: true },
      { h: "Ma'lumot to'liqligi", v: p => `<div class="bar" title="${pct(p.quality?.completeness)}"><i style="width:${Math.round((p.quality?.completeness || 0) * 100)}%"></i></div><span class="cell-sub">${pct(p.quality?.completeness)}</span>`, html: true },
    ], procs)}</section>
    <div class="grid2">
      <section class="panel"><h2>Ma'lumotlardagi anomaliyalar <span class="pill ${an.some(a => a.sev === "hi") ? "hi" : an.length ? "mid" : "ok"}">${an.length} ta</span></h2>
        <p class="section-intro"><span class="ai-label">AI tavsiyasi</span> Model shubhali qiymatlarni belgilaydi; qarorni mutaxassis qabul qiladi.</p>
        ${an.length ? `<div class="list">${an.slice(0, 4).map(a => `<div class="sev ${a.sev}"><b><span class="pill ${a.sev}">${sevName[a.sev]}</span> ${esc(a.title)}</b><span>${esc(a.processName)}: ${esc(a.detail)}</span></div>`).join("")}</div>
          <p class="note" style="margin-top:12px"><a class="link-more" href="#/ai">Barcha anomaliyalarni ko'rish va qaror qabul qilish</a></p>`
          : `<p class="note">Anomaliya topilmadi.</p>`}</section>
      <section class="panel"><h2>Hisobot muddatlari</h2>${deadlines(d.deadlines)}</section>
    </div>
    <section class="panel"><h2>Importyorlar kesimida</h2>
      <p class="section-intro">Har bir Yevropa Ittifoqi importyori uchun kiritilgan emissiya va CBAM to'lovi.</p>
      ${table([
        { h: "Importyor", v: r => `${esc(r.name)}${r.eori ? `<span class="cell-sub mono">${esc(r.eori)}</span>` : ""}`, html: true },
        { h: "Partiyalar", k: "batches", num: true }, { h: "Netto, t", k: "netT", num: true }, { h: "Kiritilgan emissiya, t CO₂e", k: "ee", num: true },
        { h: "Milliy narx chegirmasi, €", k: "ruzEur", num: true }, { h: "CBAM to'lovi, €", k: "euEur", num: true },
      ], d.cbam.byImporter, { empty: "Bu yil uchun eksport partiyasi kiritilmagan." })}</section>
  </div>`;
}

async function gov(el, S) {
  const y = S.year;
  const [g, rev, risk] = await Promise.all([get(`/api/dashboard/gov?year=${y}`), get(`/api/tax/revenue?baseYear=${y}`).catch(() => null), get(`/api/ai/risk?year=${y}`).catch(() => null)]);
  const T = g.totals;
  const hid = v => (v == null ? `<span class="muted">yashirin</span>` : null);
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Davlat paneli</h1><p class="sub">Uglerod soliqi tushumi, CBAM xavfi va verifikatsiya qamrovi tarmoq hamda hudud kesimida.</p></div></div>
    <div class="kpis">
      <div class="kpi"><span class="l">Korxonalar</span><span class="v">${g.operators}<small>${g.installations} inshoot</small></span><span class="n">CBAM qamrovida hisob yuritmoqda</span></div>
      <div class="kpi"><span class="l">Yevropa Ittifoqiga eksport</span><span class="v">${fmt(T.exported / 1000, 1)}<small>ming t</small></span><span class="n">kiritilgan emissiya ${fmt(T.ee / 1000, 1)} ming t CO₂e</span></div>
      <div class="kpi hl"><span class="l">CBAM xavfi, ${y}-yil</span><span class="v">${mln(T.cbamRiskUsd)}<small>mln USD</small></span><span class="n">bepul kvotalar tugaganda ${mln(T.cbamRisk100Usd)} mln USD</span></div>
      <div class="kpi ok"><span class="l">Uglerod soliqi tushumi</span><span class="v">${fmt(T.taxPaidUzs / 1e9, 2)}<small>mlrd so'm</small></span><span class="n">verifikatsiyalangan eksport ulushi ${pct(T.verifiedShare)}</span></div>
    </div>
    <div class="callout"><div><h3>Tijorat siri himoyasi</h3><p class="note" style="margin:0">Tarkibida ${g.minGroup} tadan kam korxona bo'lgan guruhlar bo'yicha raqamlar ko'rsatilmaydi.</p></div></div>
    <div class="grid2">
      <section class="panel"><h2>Tarmoqlar kesimida</h2>${table([{ h: "Tarmoq", k: "name" }, { h: "Korxonalar", k: "operators", num: true },
        { h: "Emissiya, t CO₂e", v: r => hid(r.emissions) ?? fmt(r.emissions), html: true, num: true }, { h: "Eksport, t", v: r => hid(r.exported) ?? fmt(r.exported), html: true, num: true },
        { h: "Verifikatsiyalangan", v: r => hid(r.verifiedShare) ?? pct(r.verifiedShare), html: true, num: true }], g.bySector)}</section>
      <section class="panel"><h2>Hududlar kesimida</h2>${table([{ h: "Hudud", k: "key" }, { h: "Korxonalar", k: "operators", num: true },
        { h: "Emissiya, t CO₂e", v: r => hid(r.emissions) ?? fmt(r.emissions), html: true, num: true }, { h: "Eksport, t", v: r => hid(r.exported) ?? fmt(r.exported), html: true, num: true }], g.byRegion)}</section>
    </div>
    ${rev ? `<section class="panel"><h2>Uglerod soliqi tushumi prognozi <span class="unit">${esc(rev.mode === "up" ? "yuqori oqim" : rev.mode === "down1" ? "quyi oqim, 1-variant" : "quyi oqim, 2-variant")}</span></h2>
      <p class="section-intro">Asos: ${rev.baseYear}-yilda qamrab olingan ${fmt(rev.baseCovered)} t CO₂e emissiya. Prognoz yig'iluvchanlik koeffitsiyentini hisobga oladi.</p>
      ${table([{ h: "Yil", k: "year" }, { h: "Stavka, USD/t", k: "pUsd", num: true }, { h: "Yig'iluvchanlik", k: "kComp", num: true, d: 3 }, { h: "Kurs, so'm/USD", k: "fx", num: true }, { h: "Tushum, mlrd so'm", v: r => fmt(r.revenueUzs / 1e9, 2), html: true, num: true }], rev.rows)}</section>` : ""}
    ${risk ? `<section class="panel"><h2>Korxonalar bo'yicha xavf darajasi</h2>
      <p class="section-intro"><span class="ai-label">AI tavsiyasi</span> Soliq va verifikatsiya tekshiruvlarini rejalashtirish uchun saralash.</p>
      ${table([
        { h: "Korxona", v: r => `${esc(r.name)}<span class="cell-sub mono">STIR ${esc(r.stir)}</span>`, html: true },
        { h: "Ball", v: r => `<span class="pill ${r.level}">${r.score}</span>`, html: true },
        { h: "Asosiy omillar", v: r => esc(r.factors.filter(f => f.points).map(f => `${f.name} (+${f.points})`).join("; ") || "—"), html: true }], risk)}</section>` : ""}
    <section class="panel"><h2>Milliy ko'rsatkich</h2>
      <p class="note">Maqsad: yalpi ichki mahsulot birligiga to'g'ri keladigan emissiyani ${g.ndc.baseYear}-yilga nisbatan ${g.ndc.target2030 ? pct(g.ndc.target2030) : "—"} kamaytirish. ${esc(g.ndc.note)}</p></section>
  </div>`;
}

async function roleHome(el, S) {
  const r = S.user.role;
  let body = "";
  if (r === "verifier") {
    const v = await get("/api/verifications");
    const open = v.filter(x => x.status !== "concluded");
    body = `<section class="panel"><h2>Verifikatsiya topshiriqlari <span class="pill ${open.length ? "mid" : "ok"}">${open.length} ta ochiq</span></h2>
      ${table([{ h: "Inshoot", v: x => `<b>${esc(x.installationName)}</b><span class="cell-sub">${esc(x.verifierName || "")}</span>`, html: true },
        { h: "Hisobot yili", k: "year" },
        { h: "Holat", v: x => `<span class="pill ${x.status === "concluded" ? "ok" : x.status === "in_progress" ? "mid" : "lo"}">${esc({ assigned: "tayinlangan", in_progress: "jarayonda", concluded: "yakunlangan" }[x.status] || x.status)}</span>`, html: true },
        { h: "Ochiq bandlar", v: x => x.findings.filter(f => f.status !== "closed").length, num: true },
        { h: "", v: x => `<a class="btn ghost small" href="#/verification/${x.id}">Ochish</a>`, html: true }], v,
        { empty: "Sizga hali topshiriq tayinlanmagan. Eksportyor verifikatorni tayinlagach, topshiriq shu yerda paydo bo'ladi." })}</section>`;
  } else if (r === "importer") {
    const sh = await get("/api/share");
    body = `<section class="panel"><h2>Sizga ulashilgan CBAM ma'lumotlari</h2>
      <p class="section-intro">Eksportyor yuborgan hujjatlar paketi: kiritilgan emissiya, to'langan uglerod narxi va verifikatsiya xulosasi.</p>
      ${table([{ h: "Hisobot yili", k: "year" }, { h: "Amal qilish muddati", v: x => x.expiresAt.slice(0, 10) },
        { h: "Formatlar", v: x => `<a class="btn ghost small" href="/api/importer/package/${x.id}?format=html" target="_blank" rel="noopener">Ko'rish</a> <a class="btn ghost small" href="/api/importer/package/${x.id}?format=xlsx">XLSX</a> <a class="btn ghost small" href="/api/importer/package/${x.id}?format=xml">XML</a>`, html: true }], sh,
        { empty: "Hozircha paket ulashilmagan. Eksportyor havola yuborgach, u shu yerda ko'rinadi." })}</section>`;
  } else if (S.can("refdata.approve")) {
    const p = await get("/api/refdata/proposals");
    body = `<section class="panel"><h2>Tasdiq kutayotgan ma'lumotnoma takliflari <span class="pill ${p.length ? "mid" : "ok"}">${p.length} ta</span></h2>
      <p class="section-intro">Uslubiyot parametri kuchga kirishi uchun uni taklif kiritgan shaxsdan boshqa administrator tasdiqlashi kerak.</p>
      ${table([{ h: "Kalit", v: x => `<span class="mono">${esc(x.key)}</span>`, html: true }, { h: "Yangi qiymat", v: x => JSON.stringify(x.value).slice(0, 60) },
        { h: "Amal qilish sanasi", k: "validFrom" }, { h: "Taklif kiritgan", k: "proposedBy" }], p, { empty: "Tasdiq kutayotgan taklif yo'q." })}
      <p class="note" style="margin-top:12px"><a class="link-more" href="#/refdata">Ma'lumotnomalar bo'limini ochish</a></p></section>`;
  } else {
    body = `<section class="panel"><h2>Ish stoli</h2><p class="note">Rolingiz uchun ochiq bo'limlar yuqoridagi menyuda. Savol bo'lsa, uslubiyot administratoriga murojaat qiling.</p></section>`;
  }
  el.innerHTML = `<div class="view"><div class="head"><div><h1>${esc(S.user.roleName)}</h1><p class="sub">${esc(S.user.name)} uchun ish stoli.</p></div></div>${body}</div>`;
}
