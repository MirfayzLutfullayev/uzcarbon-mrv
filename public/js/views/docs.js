/* Eksportyor hujjatlar paketi: formatlar, tillar, importyorga xavfsiz havola, haqiqiylikni tekshirish. */
import { get, post, download } from "../api.js";
import { $, $$, esc, table, toast, errToast, formData, opt, dt } from "../ui.js";
import { route } from "../app.js";

const FORMATS = [
  { f: "html", label: "Ko'rish va PDF saqlash", primary: true, hint: "Brauzerda ochiladi, Ctrl+P bilan PDF ga saqlanadi" },
  { f: "xlsx", label: "Importyor shabloni", hint: "Yevropa Ittifoqi importyori uchun jadval" },
  { f: "xml", label: "XML", hint: "O3CI ga yuklash uchun" },
  { f: "docx", label: "DOCX", hint: "Tahrirlanadigan hujjat" },
  { f: "json", label: "JSON", hint: "Tizimlararo almashinuv uchun" },
];

export default async function (el, _p, S) {
  if (S.user.role === "importer") {
    const sh = await get("/api/share");
    el.innerHTML = `<div class="view">
      <div class="head"><div><h1>Ulashilgan CBAM ma'lumotlari</h1><p class="sub">Eksportyorlar sizga yuborgan hujjatlar paketlari: kiritilgan emissiya, to'langan uglerod narxi va verifikatsiya xulosasi.</p></div></div>
      <section class="panel">${table([
        { h: "Hisobot yili", k: "year" }, { h: "Amal qilish muddati", v: x => x.expiresAt.slice(0, 10) },
        { h: "Yuklab olish", v: x => ["html", "xlsx", "xml", "json"].map(f => `<a class="btn ghost small" href="/api/importer/package/${x.id}?format=${f}"${f === "html" ? ' target="_blank" rel="noopener"' : ""}>${f === "html" ? "Ko'rish" : f.toUpperCase()}</a>`).join(" "), html: true },
      ], sh, { empty: "Hozircha paket ulashilmagan. Eksportyor havola yuborgach, u shu yerda ko'rinadi." })}</section></div>`;
    return;
  }
  const insts = await S.insts();
  const [imps, shares] = await Promise.all([get("/api/importers").catch(() => []), S.can("docs.share") ? get("/api/share").catch(() => []) : Promise.resolve([])]);
  const active = shares.filter(x => !x.revoked);
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Hujjatlar paketi</h1><p class="sub">Importyor CBAM deklaratsiyasida foydalanadigan rasmiy to'plam: hisob natijasi, to'langan uglerod narxi tasdiqnomasi va verifikatsiya xulosasi.</p></div></div>
    <div class="callout"><div><h3>Paket tarkibi</h3>
      <p class="note" style="margin:0">Soliq to'lovi tasdiqnomasi, kiritilgan emissiyani hisoblash usulining tavsifi, verifikatsiya xulosasi, inshootning O3CI ma'lumotlari va eksport partiyalari ro'yxati. Har bir paket SHA-256 xeshi va platforma imzosi bilan muhrlanadi.</p></div></div>
    <section class="panel"><h2>Paketni shakllantirish</h2>
      <form id="pkForm" novalidate>
        <div class="fields">
          <label>Inshoot<select name="installationId">${insts.map(i => opt(i.id, i.name)).join("")}</select></label>
          <label>Hisobot yili<input name="year" type="number" value="${S.year}" min="2020" max="2040"></label>
          <label>Hujjat tili<select name="lang">${opt("uz", "O'zbekcha")}${opt("ru", "Русский")}${opt("en", "English")}</select></label>
        </div>
        <div class="row">${FORMATS.map(x => `<button class="btn${x.primary ? "" : " ghost"}" type="button" data-f="${x.f}" title="${esc(x.hint)}">${esc(x.label)}</button>`).join("")}</div>
      </form>
      <p class="note" style="margin-top:14px">Paketga verifikatsiyalangan yoki topshirilgan hisob natijasi kiradi. Ular bo'lmasa, joriy hisob olinadi va hujjatda "verifikatsiyadan o'tmagan" deb belgilanadi.</p>
    </section>
    <section class="panel"><h2>Yillik emissiya hisoboti</h2>
      <p class="section-intro">Inshootning yillik hisoboti: jarayonlar bo'yicha emissiyalar, qo'llangan formulalar va ishlatilgan ma'lumotnoma versiyalari.</p>
      <div class="row"><button class="btn ghost" type="button" data-annual="1">XLSX yuklab olish</button></div></section>
    ${S.can("docs.share") ? `<section class="panel"><h2>Importyorga xavfsiz havola <span class="pill ${active.length ? "ok" : "lo"}">${active.length} ta amalda</span></h2>
      <p class="section-intro">Havola orqali importyor paketni tizimga kirmasdan ko'radi va yuklab oladi. Muddati tugagach yoki bekor qilingach havola ishlamaydi.</p>
      <form id="shForm" novalidate><div class="fields">
        <label>Inshoot<select name="installationId">${insts.map(i => opt(i.id, i.name)).join("")}</select></label>
        <label>Hisobot yili<input name="year" type="number" value="${S.year}" min="2020" max="2040"></label>
        <label>Importyor<select name="importerId"><option value="">Ko'rsatilmagan</option>${imps.map(i => opt(i.id, i.name)).join("")}</select></label>
        <label>Amal qilish muddati <em>kun</em><input name="days" type="number" value="30" min="1" max="90"></label>
      </div><div class="row"><button class="btn" type="submit">Havola yaratish</button></div></form>
      <div id="shOut"></div>
      <h3 style="margin:18px 0 10px">Yaratilgan havolalar</h3>
      ${table([
        { h: "Hisobot yili", k: "year" }, { h: "Yaratilgan", v: x => dt(x.createdAt) }, { h: "Amal qiladi", v: x => x.expiresAt.slice(0, 10) },
        { h: "Holat", v: x => `<span class="pill ${x.revoked ? "lo" : "ok"}">${x.revoked ? "bekor qilingan" : "amalda"}</span>`, html: true },
        { h: "", v: x => x.revoked ? "" : `<button class="btn danger small" data-rev="${x.id}">Bekor qilish</button>`, html: true },
      ], shares, { empty: "Havola yaratilmagan. Yuqoridagi shakl orqali importyorga havola yuboring." })}</section>` : ""}
    <section class="panel"><h2>Hujjat haqiqiyligini tekshirish</h2>
      <p class="section-intro">Paketdagi SHA-256 xeshini kiriting: platforma hujjat haqiqatan ham shu tizimda berilganini tasdiqlaydi.</p>
      <form id="vfForm" class="row" novalidate>
        <label style="flex:1;min-width:280px"><span class="sr-label">SHA-256 xeshi</span><input name="hash" placeholder="64 belgidan iborat xesh" aria-label="SHA-256 xeshi"></label>
        <button class="btn ghost" type="submit">Tekshirish</button></form>
      <p class="note" id="vfOut"></p></section>
  </div>`;
  const f = $("#pkForm");
  $$("[data-f]").forEach(b => b.onclick = () => {
    const q = new URLSearchParams({ ...formData(f), format: b.dataset.f });
    if (b.dataset.f === "html") window.open(`/api/reports/package?${q}`, "_blank", "noopener");
    else download(`/api/reports/package?${q}`).catch(errToast);
  });
  $("[data-annual]").onclick = () => { const d = formData(f); download(`/api/reports/annual?installationId=${d.installationId}&year=${d.year}&format=xlsx`).catch(errToast); };
  const sf = $("#shForm");
  if (sf) sf.onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await post("/api/share", formData(sf));
      $("#shOut").innerHTML = `<div class="banner info" style="margin-top:14px"><b>Havola yaratildi, ${r.expiresAt.slice(0, 10)} gacha amal qiladi</b>
        <p class="mono" style="word-break:break-all;margin:8px 0 4px">${esc(r.url)}</p>
        <span class="note">Havola faqat hozir ko'rsatiladi. Nusxa oling va importyorga xavfsiz kanal orqali yuboring.</span></div>`;
    } catch (x) { errToast(x); }
  };
  $$("[data-rev]").forEach(b => b.onclick = async () => { try { await post(`/api/share/${b.dataset.rev}/revoke`); toast("Havola bekor qilindi"); route(); } catch (x) { errToast(x); } });
  $("#vfForm").onsubmit = async e => {
    e.preventDefault();
    const out = $("#vfOut");
    try {
      const r = await get(`/api/public/verify?hash=${encodeURIComponent(e.target.hash.value.trim())}`);
      out.textContent = r.issued ? `Hujjat platforma tomonidan ${dt(r.issuedAt)} sanasida berilgan, hisobot yili ${r.year}.` : "Bunday xeshli hujjat platformada berilmagan. Xeshni paketdagi qiymat bilan solishtiring.";
    } catch (x) { errToast(x); out.textContent = ""; }
  };
}
