/* M10 — ma'lumotnomalar: amaldagi qiymatlar, versiyalar tarixi, taklif → ikkinchi shaxs tasdig'i, TIF TN jadvalini import qilish. */
import { get, post, fileToBase64, fileToText } from "../api.js";
import { $, $$, esc, table, toast, errToast, opt, dt } from "../ui.js";
import { route } from "../app.js";

const GROUPS = [["", "Barchasi"], ["cbam.", "CBAM (CF, mark-up)"], ["tif.", "TIF TN kodlari"], ["fuel.", "Yoqilg'ilar"], ["material.", "Materiallar"], ["gwp.", "GWP"], ["tax.", "Uglerod soliqi"],
  ["fx.", "Valyuta kurslari"], ["ets.", "EU ETS"], ["grid.", "Tarmoq EF"], ["heat.", "Issiqlik"], ["clinker.", "Klinker"], ["excise.", "Aksiz"], ["ndc.", "NDC"], ["itmo.", "ITMO"], ["privacy.", "Maxfiylik"]];
let prefix = "cbam.";
const show = v => (typeof v === "object" && v !== null ? (v.name ? `${v.name}${v.dvStatus ? `, standart qiymat ${v.dvStatus === "value" ? v.dvTot : v.dvStatus === "none" ? "belgilanmagan" : "jadvalda yo'q"}` : ""}${v.ncvGJ ? `, NCV ${v.ncvGJ} GJ/${v.unit}, EF ${v.efKgGJ}` : ""}${v.ef != null && !v.ncvGJ ? `, EF ${v.ef}` : ""}` : JSON.stringify(v)) : String(v));

export default async function (el, _p, S) {
  const [rows, props] = await Promise.all([get(`/api/refdata?prefix=${encodeURIComponent(prefix)}`), get("/api/refdata/proposals")]);
  const canP = S.can("refdata.propose"), canA = S.can("refdata.approve");
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Ma'lumotnomalar</h1><p class="sub">Hisob-kitobda ishlatiladigan barcha parametrlar shu yerda saqlanadi. Har bir o'zgarish manba hujjati va amal qilish sanasi bilan kiritiladi hamda boshqa administrator tomonidan tasdiqlanadi.</p></div>
      <label class="inline">Bo'lim <select id="pfx" style="width:auto">${GROUPS.map(([k, v]) => opt(k, v, prefix)).join("")}</select></label></div>
    ${props.length ? `<section class="panel"><h2>Tasdiq kutayotgan takliflar <span class="pill mid">${props.length}</span></h2>${table([
      ...(canA ? [{ h: "", v: p => `<input type="checkbox" data-pick="${p.id}" ${p.proposedBy === S.user.id ? "disabled title=\"O'z taklifingiz\"" : ""} aria-label="Tanlash">`, html: true }] : []),
      { h: "Kalit", v: p => `<span class="mono">${esc(p.key)}</span>`, html: true }, { h: "Yangi qiymat", v: p => esc(show(p.value)) }, { h: "Amal qilish", k: "validFrom" }, { h: "Manba", k: "source" }, { h: "Taklif", k: "proposedBy" },
      ...(canA ? [{ h: "", v: p => p.proposedBy === S.user.id ? `<span class="note">ikkinchi shaxs kerak</span>` : `<button class="btn small" data-ok="${p.id}">Tasdiqlash</button> <button class="btn danger small" data-no="${p.id}">Rad etish</button>`, html: true }] : [])], props)}
      ${canA ? `<div class="row" style="margin-top:10px"><button class="btn ghost" id="bulkOk">Tanlanganlarni tasdiqlash</button></div>` : ""}</section>` : ""}
    <section class="panel"><h2>Amaldagi qiymatlar <span class="pill ok">${rows.length}</span></h2>${table([{ h: "Kalit", v: r => `<span class="mono">${esc(r.key)}</span>`, html: true }, { h: "Qiymat", v: r => esc(show(r.value)) }, { h: "Birlik", k: "unit" },
      { h: "Amal qiladi", v: r => `${r.validFrom}${r.validTo ? " – " + r.validTo : ""}` }, { h: "v", k: "version", num: true }, { h: "Manba", v: r => `<span class="note">${esc(r.source || "")}</span>`, html: true },
      { h: "", v: r => `<button class="btn ghost small" data-hist="${esc(r.key)}">Tarix</button>${canP ? ` <button class="btn ghost small" data-edit="${esc(r.key)}">O'zgartirish</button>` : ""}`, html: true }], rows)}</section>
    <div id="histOut"></div>
    ${canP ? `<section class="panel" id="propPanel"><h2>Yangi qiymat taklifi</h2><form id="prForm" novalidate><div class="fields">
      <label>Kalit<input name="key" required placeholder="masalan ets.price_eur"></label>
      <label>Qiymat <em>son yoki JSON</em><input name="value" required></label>
      <label>Birlik<input name="unit"></label><label>Amal qilish sanasi<input name="validFrom" type="date" required></label>
      <label>Manba hujjati<input name="source" required placeholder="masalan (EU) 2025/2621, 3-ilova"></label><label>Izoh<input name="note"></label>
    </div><div class="row"><button class="btn" type="submit">Taklif kiritish</button></div></form></section>
    ${S.can("refdata.approve") || S.user.role === "imv" || S.user.role === "methodology_admin" ? `<section class="panel"><h2>TIF TN kodlari jadvalini import qilish (Q1)</h2>
      <p class="note">"CBAM_TIF_codes_for_UZB_updated.xlsx" yoki CSV. Ustunlar nomi bo'yicha aniqlanadi: kod (TIF/CN), nomi, guruh, standart qiymat (default/standart), benchmark (ixtiyoriy). "−" — standart qiymat taqiqlangan. Har bir qator taklif sifatida yaratiladi va ikkinchi shaxs tasdiqlaydi.</p>
      <div class="fields"><label>Manba<input id="tifSrc" value="(EU) 2025/2621 — CBAM_TIF_codes_for_UZB_updated.xlsx"></label><label>Amal qilish sanasi<input id="tifFrom" type="date" value="2026-01-01"></label><label>Varaq nomi <em>ixtiyoriy</em><input id="tifSheet"></label></div>
      <div class="row" style="margin-top:8px"><label class="btn ghost">XLSX yoki CSV tanlash<input type="file" id="tifFile" accept=".xlsx,.csv" hidden></label><span class="note" id="tifOut"></span></div></section>` : ""}` : ""}
  </div>`;
  $("#pfx").onchange = e => { prefix = e.target.value; route(); };
  $$("[data-ok]").forEach(b => b.onclick = async () => { try { await post(`/api/refdata/proposals/${b.dataset.ok}/approve`); toast("Tasdiqlandi"); route(); } catch (x) { errToast(x); } });
  $$("[data-no]").forEach(b => b.onclick = async () => { try { await post(`/api/refdata/proposals/${b.dataset.no}/reject`, {}); toast("Rad etildi"); route(); } catch (x) { errToast(x); } });
  const bo = $("#bulkOk"); if (bo) bo.onclick = async () => { const ids = $$("[data-pick]:checked").map(c => +c.dataset.pick); if (!ids.length) return toast("Tanlanmagan"); try { const r = await post("/api/refdata/proposals/approve-bulk", { ids }); toast(`${r.approved} ta tasdiqlandi`); route(); } catch (x) { errToast(x); } };
  $$("[data-hist]").forEach(b => b.onclick = async () => {
    const h = await get(`/api/refdata/history/${encodeURIComponent(b.dataset.hist)}`);
    $("#histOut").innerHTML = `<section class="panel"><h2>Versiyalar tarixi: <span class="mono">${esc(b.dataset.hist)}</span></h2>${table([{ h: "v", k: "version", num: true }, { h: "Qiymat", v: r => esc(show(r.value)) }, { h: "Holat", k: "status" }, { h: "Amal qiladi", v: r => `${r.validFrom}${r.validTo ? " – " + r.validTo : ""}` }, { h: "Kiritilgan", v: r => dt(r.recordedAt) }, { h: "Taklif / tasdiq", v: r => `${r.proposedBy} / ${r.approvedBy || "—"}` }, { h: "Manba", k: "source" }], h)}</section>`;
    $("#histOut").scrollIntoView({ behavior: "smooth" });
  });
  $$("[data-edit]").forEach(b => b.onclick = () => { const f = $("#prForm"); f.key.value = b.dataset.edit; const r = rows.find(x => x.key === b.dataset.edit); f.value.value = typeof r.value === "object" ? JSON.stringify(r.value) : r.value; f.unit.value = r.unit || ""; f.scrollIntoView({ behavior: "smooth" }); f.value.focus(); });
  const pf = $("#prForm");
  if (pf) pf.onsubmit = async e => {
    e.preventDefault();
    let value = pf.value.value.trim();
    try { value = JSON.parse(value); } catch { /* oddiy matn */ }
    try { await post("/api/refdata/proposals", { key: pf.key.value.trim(), value, unit: pf.unit.value || undefined, validFrom: pf.validFrom.value, source: pf.source.value, note: pf.note.value || undefined }); toast("Taklif kiritildi — boshqa administrator tasdiqlashi kerak"); route(); } catch (x) { errToast(x); }
  };
  const tf = $("#tifFile");
  if (tf) tf.onchange = async () => {
    const file = tf.files[0]; if (!file) return;
    const body = { source: $("#tifSrc").value, validFrom: $("#tifFrom").value, sheet: $("#tifSheet").value || undefined };
    try {
      if (/\.xlsx$/i.test(file.name)) body.xlsxBase64 = await fileToBase64(file); else body.csv = await fileToText(file);
      const r = await post("/api/refdata/import-tif", body);
      $("#tifOut").textContent = `${r.proposed} ta taklif yaratildi, ${r.skipped} ta qator o'tkazib yuborildi.`;
      toast("Import qilindi — tasdiqlash kerak"); prefix = "tif."; setTimeout(route, 800);
    } catch (x) { errToast(x); }
  };
}
