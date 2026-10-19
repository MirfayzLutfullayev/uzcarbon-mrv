/* Verifikatsiya: tayinlash, so'rovlar va nomuvofiqliklar, javoblar, xulosa va imzo (2FA bilan). */
import { get, post } from "../api.js";
import { $, $$, esc, fmt, table, toast, errToast, formData, opt, dt, basisPill } from "../ui.js";
import { route } from "../app.js";

const ST = { assigned: ["Tayinlangan", "lo"], in_progress: ["Jarayonda", "mid"], concluded: ["Yakunlangan", "ok"] };
const KIND = { request: "So'rov", nonconformity: "Nomuvofiqlik", comment: "Izoh", sample: "Namuna (sampling)" };
const KIND_SEV = { request: "mid", nonconformity: "hi", comment: "lo", sample: "lo" };
const FST = { open: ["Ochiq", "hi"], responded: ["Javob berilgan", "mid"], closed: ["Yopilgan", "ok"] };
const OP = { positive: "Ijobiy", qualified: "Izohli ijobiy", negative: "Salbiy" };
const OP_PILL = { positive: "ok", qualified: "mid", negative: "hi" };
const RES_ST = { submitted: ["Topshirilgan", "mid"], verified: ["Verifikatsiyalangan", "ok"] };

const pill = ([text, cls]) => `<span class="pill ${cls}">${esc(text)}</span>`;
const stPill = s => pill(ST[s] || [s, "lo"]);
const day = s => (s ? esc(String(s).slice(0, 10)) : "—");
const openOf = v => v.findings.filter(f => f.status !== "closed");

/* Importyor yillik deklaratsiyasi muddati: hisobot yilidan keyingi yil 30-sentabr. */
function declDeadline(year) {
  const due = Date.UTC(year + 1, 8, 30), left = Math.ceil((due - Date.now()) / 864e5);
  return `<div class="deadline${left >= 0 && left <= 60 ? " soon" : ""}"><time datetime="${year + 1}-09-30">30<small>sen</small></time>
    <b>${year}-yil uchun importyor deklaratsiyasi</b><span>30-sentabr ${year + 1}, ${left >= 0 ? `${fmt(left)} kun qoldi` : "muddat o'tgan"}</span></div>`;
}

export default async function (el, params, S) {
  if (params[0]) return detail(el, params[0], S);
  const canAssign = S.can("verification.assign"), isVerifier = S.can("verification.work");
  const [list, vers, insts] = await Promise.all([get("/api/verifications"), get("/api/verifiers"), canAssign ? S.insts() : Promise.resolve([])]);
  const emptyText = isVerifier ? "Sizga hali verifikatsiya topshirig'i tayinlanmagan. Eksportyor tayinlaganda bildirishnoma keladi va topshiriq shu ro'yxatda paydo bo'ladi."
    : canAssign ? "Hali verifikatsiya tayinlanmagan. Quyidagi shaklda inshoot, hisobot yili va akkreditatsiyalangan verifikatorni tanlang."
      : "Hali verifikatsiya tayinlanmagan. Verifikatorni korxona administratori tayinlaydi.";
  const listHtml = list.length ? table([
    { h: "Inshoot", v: v => `<b>${esc(v.installationName)}</b><span class="cell-sub">${esc(v.year)}-yil hisobot davri</span>`, html: true },
    { h: "Verifikator", v: v => `${esc(v.verifierName)}<span class="cell-sub">Tayinlangan: ${day(v.createdAt)}</span>`, html: true },
    { h: "Holat", v: v => stPill(v.status), html: true },
    { h: "Xulosa", v: v => (v.opinion ? pill([OP[v.opinion], OP_PILL[v.opinion]]) : `<span class="muted">Kutilmoqda</span>`), html: true },
    { h: "Ochiq bandlar", v: v => openOf(v).length, num: true },
    { h: "", v: v => `<a class="btn ghost small" href="#/verification/${esc(v.id)}" aria-label="${esc(v.installationName)}, ${esc(v.year)}: ishni ochish">Ishni ochish</a>`, html: true, num: true },
  ], list) : `<div class="empty">${esc(emptyText)}</div>`;

  const procedure = `<section class="panel"><h2>Ish tartibi</h2>
      <ol class="steps">
        <li><div><b>Tayinlash</b><span class="cell-sub">Korxona administratori inshoot va yil uchun akkreditatsiyalangan verifikatorni tanlaydi.</span></div></li>
        <li><div><b>Natijalarni topshirish</b><span class="cell-sub">Eksportyor emissiya hisobini tekshirib, verifikatsiyaga topshiradi.</span></div></li>
        <li><div><b>So'rovlar va tuzatishlar</b><span class="cell-sub">Verifikator so'rov yoki nomuvofiqlik qoldiradi, eksportyor javob beradi.</span></div></li>
        <li><div><b>Xulosa va imzo</b><span class="cell-sub">Imzolangan ijobiy xulosadan so'ng shu yil natijalari qulflanadi.</span></div></li>
      </ol></section>`;
  const deadline = `<section class="panel"><h2>Muhim muddat</h2><div class="stack">${declDeadline(S.year)}
      <div class="note">Verifikatsiya xulosasi importyor yillik CBAM deklaratsiyasini topshirishidan oldin tayyor bo'lishi kerak.</div>
      <div class="note">Verifikator faqat tayinlangan inshoot va yil ma'lumotlarini o'qiydi. Har bir amal audit jurnalida qayd etiladi.</div></div></section>`;

  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Verifikatsiya</h1><p class="sub">Akkreditatsiyalangan verifikator emissiya hisobini ISO 14064-3 bo'yicha tekshiradi va imzolangan xulosa beradi.</p></div></div>
    <section class="panel"><h2>Verifikatsiya ishlari ${list.length ? `<span class="unit">${list.length} ta</span>` : ""}</h2>${listHtml}</section>
    ${canAssign ? `<div class="split">
      <section class="panel"><h2>Verifikator tayinlash</h2>
        <form id="asForm" novalidate>
          <div class="note">Har bir inshoot va yil uchun bitta ochiq verifikatsiya bo'lishi mumkin. Akkreditatsiya muddati tugagan verifikatorlar ro'yxatda ko'rsatilmaydi.</div>
          <div class="fields">
            <label>Inshoot<select name="installationId">${insts.map(i => opt(i.id, i.name)).join("")}</select></label>
            <label>Hisobot yili<input name="year" type="number" value="${S.year}" min="2020" max="2040"></label>
            <label>Verifikator<select name="verifierId">${vers.filter(v => v.active).map(v => opt(v.id, `${v.name} (${v.accreditationNo})`)).join("")}</select></label>
          </div>
          <div class="row"><button class="btn" type="submit">Verifikatorni tayinlash</button></div>
        </form>
        ${vers.length ? `<details style="margin-top:18px"><summary>Verifikatorlar reyestri</summary>${table([
          { h: "Verifikator", v: v => `${esc(v.name)}<span class="cell-sub">Guvohnoma: ${esc(v.accreditationNo || "—")}</span>`, html: true },
          { h: "Akkreditatsiya muddati", v: v => day(v.accreditedUntil), html: true },
          { h: "Holat", v: v => pill(v.active ? ["Amalda", "ok"] : ["Muddati tugagan", "hi"]), html: true },
        ], vers)}</details>` : ""}
      </section>
      <div class="stack">${procedure}${deadline}</div>
    </div>` : `<div class="grid2">${procedure}${deadline}</div>`}
  </div>`;
  const f = $("#asForm"); if (f) f.onsubmit = async e => { e.preventDefault(); try { const v = await post("/api/verifications", formData(f)); toast("Verifikator tayinlandi"); location.hash = `#/verification/${v.id}`; } catch (x) { errToast(x); } };
}

async function detail(el, id, S) {
  const [v, vers] = await Promise.all([get(`/api/verifications/${id}`), get("/api/verifiers").catch(() => [])]);
  const work = S.can("verification.work") && v.status !== "concluded";
  const respond = S.can("verification.respond");
  const concluded = v.status === "concluded";
  const ver = vers.find(x => x.id === v.verifierId);
  const open = openOf(v);
  const awaiting = v.findings.filter(f => f.status === "open").length;
  const toClose = v.findings.filter(f => f.status === "responded").length;
  const openNc = v.findings.filter(f => f.kind === "nonconformity" && f.status !== "closed").length;

  /* Ish bosqichlari: birinchi bajarilmagan bosqich — joriy. */
  const stages = [
    { t: "Verifikator tayinlandi", d: `Sana: ${day(v.createdAt)}`, done: true },
    { t: "Natijalar topshirildi", d: v.results.length ? `${v.results.length} ta jarayon natijasi` : "Eksportyor topshirishi kutilmoqda", done: v.results.length > 0 },
    { t: "Bandlar ko'rib chiqildi", d: v.findings.length ? `${v.findings.length - open.length} / ${v.findings.length} band yopilgan` : "Hozircha band yo'q", done: concluded || (v.findings.length > 0 && !open.length) },
    { t: "Xulosa imzolandi", d: concluded ? `Sana: ${esc(dt(v.signedAt))}` : "Verifikator imzosi kutilmoqda", done: concluded },
  ];
  const cur = stages.findIndex(s => !s.done);

  const resultsHtml = v.results.length ? `${table([
      { h: "Jarayon", v: r => `${esc(r.processName)}<span class="cell-sub">Hisob versiyasi: ${esc(r.version)}</span>`, html: true },
      { h: "Holat", v: r => pill(RES_ST[r.status] || [r.status, "lo"]), html: true },
      { h: "SEE (CBAM)", k: "seeCbam", num: true, d: 4 },
      { h: "Asos", v: r => basisPill(r.basis), html: true }], v.results)}
      ${S.can("calc.read") ? `<div class="note" style="margin-top:12px">To'liq hisob izi <a href="#/calc">Emissiya hisobi</a> bo'limida, ${esc(v.year)}-yil tanlanganda ko'rinadi.</div>` : ""}`
    : respond ? `<div class="empty"><p style="margin:0 0 14px">Natija hali topshirilmagan. Emissiya hisobini tekshirib, verifikatsiyaga topshiring: shundan so'ng verifikator ishni boshlaydi.</p>${S.can("calc.read") ? `<a class="btn" href="#/calc">Emissiya hisobini ochish</a>` : ""}</div>`
      : `<div class="empty">Eksportyor hali hisob natijasini topshirmagan. Topshirilgach natijalar shu yerda ko'rinadi; zarur bo'lsa, eksportyorga so'rov qoldiring.</div>`;

  const findingHtml = f => `<article class="sev ${KIND_SEV[f.kind] || "lo"}">
      <b>${esc(KIND[f.kind] || f.kind)} ${pill(FST[f.status] || [f.status, "lo"])}</b>
      <span>${esc(f.text)}</span>
      <ul class="meta"><li>Qo'yilgan: <time>${esc(dt(f.createdAt))}</time></li>${f.respondedAt ? `<li>Javob berilgan: <time>${esc(dt(f.respondedAt))}</time></li>` : ""}${f.closedAt ? `<li>Yopilgan: <time>${esc(dt(f.closedAt))}</time></li>` : ""}</ul>
      ${f.response ? `<div class="banner info" style="margin-top:6px"><strong>Eksportyor javobi.</strong> ${esc(f.response)}</div>` : ""}
      ${respond && f.status === "open" ? `<form data-resp="${esc(f.id)}" novalidate style="margin-top:6px;gap:10px">
        <label>Javob yoki tuzatish tavsifi<textarea name="response" required rows="3"></textarea></label>
        <span class="field-err note" role="alert"></span>
        <div class="row"><button class="btn small" type="submit">Javobni yuborish</button></div></form>` : ""}
      ${work && f.status !== "closed" ? `<div class="row" style="margin-top:6px"><button class="btn ghost small" type="button" data-close="${esc(f.id)}">Bandni yopish</button></div>` : ""}
    </article>`;

  const banner = concluded ? ""
    : respond && awaiting ? `<div class="banner" role="status"><strong>Javobingiz kutilmoqda.</strong> Verifikator ${awaiting} ta bandga javob so'radi. Har bir band ostida javob yoki tuzatish tavsifini yozing.</div>`
      : work && toClose ? `<div class="banner info" role="status"><strong>Ko'rib chiqish kerak.</strong> Eksportyor ${toClose} ta bandga javob berdi. Javobni tekshirib, bandni yoping yoki yangi so'rov qoldiring.</div>` : "";

  const conclusionHtml = concluded ? `<section class="panel"><h2>Verifikatsiya xulosasi ${pill([OP[v.opinion] || v.opinion, OP_PILL[v.opinion] || "lo"])}</h2>
      <div class="stack">
        <div><h3>Xulosa matni</h3><p class="sub">${esc(v.conclusion)}</p></div>
        <dl class="kv"><dt>Xulosa turi</dt><dd>${esc(OP[v.opinion] || v.opinion)}</dd><dt>Imzolangan sana</dt><dd>${esc(dt(v.signedAt))}</dd>
          <dt>Elektron imzo</dt><dd class="mono" style="word-break:break-all">${esc(v.signature)}</dd></dl>
        ${v.opinion === "negative" ? `<div class="banner crit">Salbiy xulosa: natijalar verifikatsiyalanmagan va qulflanmagan. Kamchiliklarni bartaraf etib, yangi verifikatsiya tayinlang.</div>`
          : `<div class="banner info">Topshirilgan natijalar verifikatsiyalangan va qulflangan. Ular eksportyor hujjatlar paketiga kiradi.</div>`}
        ${respond && v.opinion !== "negative" && S.can("docs.read") ? `<div class="row"><a class="btn" href="#/docs">Hujjatlar paketini shakllantirish</a></div>` : ""}
      </div></section>`
    : work ? `<section class="panel"><h2>Yakuniy xulosa va imzo</h2><div class="stack">
        ${openNc ? `<div class="banner">Yopilmagan nomuvofiqliklar bor (${openNc} ta). Ijobiy xulosa berish uchun avval ularni yoping yoki salbiy xulosani tanlang.</div>` : ""}
        ${!v.results.length ? `<div class="banner">Eksportyor hali natija topshirmagan. Ijobiy xulosani natija topshirilgandan keyin imzolash mumkin.</div>` : ""}
        <form id="cForm" novalidate>
          <div class="fields"><label>Xulosa turi<select name="opinion">${Object.entries(OP).map(([k, n]) => opt(k, n)).join("")}</select></label></div>
          <label>Xulosa matni<textarea name="conclusion" required></textarea></label>
          <fieldset><legend>Elektron imzo</legend>
            <div class="fields"><label>Tasdiq kodi<input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"><em>Autentifikator ilovasidagi 6 xonali kod</em></label></div>
            <div class="note" style="margin-top:12px">Imzolangach topshirilgan natijalar verifikatsiyalangan deb belgilanadi va shu yil ma'lumotlari qulflanadi. ERI integratsiyasigacha imzo platforma kaliti bilan qo'yiladi.</div>
          </fieldset>
          <span class="field-err note" id="cErr" role="alert"></span>
          <div class="row"><button class="btn" type="submit">Xulosani imzolash</button></div>
        </form></div></section>`
      : `<section class="panel"><h2>Verifikatsiya xulosasi</h2><div class="empty">Xulosa hali imzolanmagan. Verifikator barcha bandlarni ko'rib chiqqach xulosani imzolaydi; shundan so'ng natijalar qulflanadi.</div></section>`;

  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>${esc(v.installationName)}</h1><p class="sub">${esc(v.year)}-yil hisobot davri bo'yicha verifikatsiya ishi. Verifikator: ${esc(v.verifierName)}.</p></div>
      <div class="row"><a class="btn ghost" href="#/verification">Ro'yxatga qaytish</a></div></div>
    ${banner}
    <section class="panel"><h2>Ish ma'lumotlari ${stPill(v.status)}</h2>
      <div class="grid2">
        <dl class="kv"><dt>Ish raqami</dt><dd class="mono">${esc(v.id)}</dd><dt>Inshoot</dt><dd>${esc(v.installationName)}</dd>
          <dt>Hisobot yili</dt><dd>${esc(v.year)}</dd><dt>Tayinlangan sana</dt><dd>${day(v.createdAt)}</dd></dl>
        <dl class="kv"><dt>Verifikator</dt><dd>${esc(v.verifierName)}</dd><dt>Akkreditatsiya guvohnomasi</dt><dd>${ver ? esc(ver.accreditationNo || "—") : "—"}</dd>
          <dt>Akkreditatsiya muddati</dt><dd>${ver ? day(ver.accreditedUntil) : "—"}</dd><dt>Ochiq bandlar</dt><dd>${open.length}</dd></dl>
      </div>
    </section>
    <div class="split">
      <div class="stack">
        <section class="panel"><h2>Topshirilgan hisob natijalari <span class="unit">SEE, t CO₂e / t</span></h2>${resultsHtml}</section>
        <section class="panel"><h2>So'rovlar va nomuvofiqliklar ${open.length ? pill([`${open.length} ta ochiq`, "hi"]) : v.findings.length ? pill(["Barchasi yopilgan", "ok"]) : ""}</h2>
          ${v.findings.length ? `<div class="list">${v.findings.map(findingHtml).join("")}</div>`
            : `<div class="empty">${work ? "Hozircha band yo'q. Hisobni tekshirib, zarur bo'lsa quyidagi shakl orqali so'rov yoki nomuvofiqlik qoldiring."
              : "Verifikator hali so'rov yoki nomuvofiqlik qoldirmagan. Band qo'shilganda bildirishnoma keladi va javobni shu yerda yozasiz."}</div>`}
        </section>
        ${work ? `<section class="panel"><h2>Yangi band qo'shish</h2>
          <form id="fForm" novalidate>
            <div class="fields"><label>Band turi<select name="kind">${Object.entries(KIND).map(([k, n]) => opt(k, n)).join("")}</select></label></div>
            <label>Band matni<textarea name="text" required></textarea></label>
            <span class="field-err note" id="fErr" role="alert"></span>
            <div class="note">So'rov va nomuvofiqlik eksportyorga yuboriladi va javob kutadi. Izoh va namuna darhol yopilgan holda qayd etiladi.</div>
            <div class="row"><button class="btn" type="submit">Bandni qo'shish</button></div>
          </form></section>` : ""}
        ${conclusionHtml}
      </div>
      <div class="stack">
        <section class="panel"><h2>Ish bosqichlari</h2>
          <ol class="steps">${stages.map((s, i) => `<li class="${s.done ? "done" : i === cur ? "current" : ""}"><div>
            <div class="toolbar"><b>${s.t}</b>${pill(s.done ? ["Bajarildi", "ok"] : i === cur ? ["Joriy", "mid"] : ["Kutilmoqda", "lo"])}</div>
            <span class="cell-sub">${s.d}</span></div></li>`).join("")}</ol>
        </section>
        <div class="callout"><div><h3>Maxfiylik va audit</h3><div class="note">Verifikator faqat shu inshoot va yil ma'lumotlarini o'qiydi. Har bir band, javob va imzo o'zgartirib bo'lmaydigan audit jurnalida qayd etiladi.</div></div></div>
      </div>
    </div>
  </div>`;
  $$("form[data-resp]").forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const err = f.querySelector(".field-err");
    if (!f.response.value.trim()) { err.textContent = "Javob matnini yozing: nima tuzatilgani yoki qaysi hujjat yuklangani."; f.response.focus(); return; }
    err.textContent = "";
    try { await post(`/api/findings/${f.dataset.resp}/respond`, formData(f)); toast("Javob yuborildi"); route(); } catch (x) { errToast(x); }
  });
  $$("[data-close]").forEach(b => b.onclick = async () => { try { await post(`/api/findings/${b.dataset.close}/close`); toast("Band yopildi"); route(); } catch (x) { errToast(x); } });
  const ff = $("#fForm"); if (ff) ff.onsubmit = async e => {
    e.preventDefault();
    if (!ff.text.value.trim()) { $("#fErr").textContent = "Band matnini yozing: eksportyordan nima talab qilinayotganini aniq ko'rsating."; ff.text.focus(); return; }
    $("#fErr").textContent = "";
    try { await post(`/api/verifications/${id}/findings`, formData(ff)); toast("Band qo'shildi"); route(); } catch (x) { errToast(x); }
  };
  const cf = $("#cForm"); if (cf) cf.onsubmit = async e => {
    e.preventDefault();
    if (!cf.conclusion.value.trim()) { $("#cErr").textContent = "Xulosa matnini yozing: tekshiruv doirasi va asosiy topilmalarni qisqacha bayon qiling."; cf.conclusion.focus(); return; }
    $("#cErr").textContent = "";
    try { await post(`/api/verifications/${id}/conclude`, formData(cf)); toast("Xulosa imzolandi"); route(); } catch (x) { errToast(x); }
  };
}
