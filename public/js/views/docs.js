/* M7 — eksportyor hujjatlar paketi: formatlar, tillar, importyorga xavfsiz havola, haqiqiylikni tekshirish. */
import { get, post, download } from "../api.js";
import { $, $$, esc, table, toast, errToast, formData, opt, dt } from "../ui.js";
import { route } from "../app.js";

export default async function (el, _p, S) {
  if (S.user.role === "importer") {
    const sh = await get("/api/share");
    el.innerHTML = `<div class="view"><h1>Ulashilgan CBAM ma'lumotlari</h1><section class="panel">${table([{ h: "Yil", k: "year" }, { h: "Muddati", v: x => x.expiresAt.slice(0, 10) },
      { h: "", v: x => `<a href="/api/importer/package/${x.id}?format=html" target="_blank" rel="noopener">Ko'rish</a> · <a href="/api/importer/package/${x.id}?format=xlsx">XLSX</a> · <a href="/api/importer/package/${x.id}?format=xml">XML</a> · <a href="/api/importer/package/${x.id}?format=json">JSON</a>`, html: true }], sh, { empty: "Ulashilgan paket yo'q." })}</section></div>`;
    return;
  }
  const insts = await S.insts();
  const [imps, shares] = await Promise.all([get("/api/importers").catch(() => []), S.can("docs.share") ? get("/api/share").catch(() => []) : Promise.resolve([])]);
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Hujjatlar paketi</h1><p class="sub">Soliq to'lovi tasdiqnomasi, kiritilgan emissiyani hisoblash usuli, verifikatsiya xulosasi, O3CI ma'lumotlari va EI importyori uchun shablon (M7). Har bir paket xesh va platforma imzosi bilan muhrlanadi.</p></div></div>
    <section class="panel"><h2>Paketni shakllantirish</h2><form id="pkForm" novalidate><div class="fields">
      <label>Inshoot<select name="installationId">${insts.map(i => opt(i.id, i.name)).join("")}</select></label>
      <label>Yil<input name="year" type="number" value="${S.year}" min="2020" max="2040"></label>
      <label>Til<select name="lang">${opt("uz", "O'zbek")}${opt("ru", "Русский")}${opt("en", "English")}</select></label>
    </div><div class="row">
      <button class="btn" type="button" data-f="html">Ko'rish / PDF</button><button class="btn ghost" type="button" data-f="docx">DOCX</button>
      <button class="btn ghost" type="button" data-f="xlsx">Importyor shabloni (XLSX)</button><button class="btn ghost" type="button" data-f="xml">XML (O3CI uchun)</button>
      <button class="btn ghost" type="button" data-f="json">JSON</button><button class="btn ghost" type="button" data-annual="1">Yillik emissiya hisoboti (XLSX)</button>
    </div></form>
    <p class="note">Paketga topshirilgan yoki verifikatsiyalangan natija kiradi; ular yo'q bo'lsa — joriy hisob (verifikatsiyasiz deb belgilanadi). XML tuzilmasi EI O3CI rasmiy XSD siga integratsiya (I1) bosqichida moslashtiriladi.</p></section>
    ${S.can("docs.share") ? `<section class="panel"><h2>EI importyoriga xavfsiz havola (FT-7.1)</h2><form id="shForm" novalidate><div class="fields">
      <label>Inshoot<select name="installationId">${insts.map(i => opt(i.id, i.name)).join("")}</select></label><label>Yil<input name="year" type="number" value="${S.year}"></label>
      <label>Importyor<select name="importerId"><option value="">—</option>${imps.map(i => opt(i.id, i.name)).join("")}</select></label><label>Amal qilish, kun<input name="days" type="number" value="30" min="1" max="90"></label>
    </div><div class="row"><button class="btn" type="submit">Havola yaratish</button></div></form><div id="shOut"></div>
      <h3 style="margin:14px 0 6px">Yaratilgan havolalar</h3>${table([{ h: "Yil", k: "year" }, { h: "Yaratilgan", v: x => dt(x.createdAt) }, { h: "Muddati", v: x => x.expiresAt.slice(0, 10) },
        { h: "Holat", v: x => `<span class="pill ${x.revoked ? "hi" : "ok"}">${x.revoked ? "bekor qilingan" : "amalda"}</span>`, html: true }, { h: "", v: x => x.revoked ? "" : `<button class="btn danger small" data-rev="${x.id}">Bekor qilish</button>`, html: true }], shares)}</section>` : ""}
    <section class="panel"><h2>Hujjat haqiqiyligini tekshirish</h2><form id="vfForm" class="row" novalidate><input name="hash" placeholder="SHA-256 xesh (64 belgi)" style="flex:1;min-width:260px"><button class="btn ghost" type="submit">Tekshirish</button></form><p class="note" id="vfOut"></p></section>
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
    try { const r = await post("/api/share", formData(sf)); $("#shOut").innerHTML = `<div class="banner info" style="margin-top:10px">Havola (${r.expiresAt.slice(0, 10)} gacha): <span class="mono" style="word-break:break-all">${esc(r.url)}</span><br><span class="note">Havola faqat hozir ko'rsatiladi — nusxa oling va importyorga xavfsiz kanal orqali yuboring.</span></div>`; } catch (x) { errToast(x); }
  };
  $$("[data-rev]").forEach(b => b.onclick = async () => { try { await post(`/api/share/${b.dataset.rev}/revoke`); toast("Bekor qilindi"); route(); } catch (x) { errToast(x); } });
  $("#vfForm").onsubmit = async e => { e.preventDefault(); try { const r = await get(`/api/public/verify?hash=${encodeURIComponent(e.target.hash.value.trim())}`); $("#vfOut").textContent = r.issued ? `Hujjat platforma tomonidan ${dt(r.issuedAt)} da berilgan (${r.year}-yil).` : "Bunday xeshli hujjat platformada berilmagan."; } catch (x) { errToast(x); } };
}
