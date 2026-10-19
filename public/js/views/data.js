/* Ma'lumot kiritish: oylik jadval, CSV import, CEMS soatlik yuklash, AI bo'shliq takliflari va dalil hujjatlari. */
import { get, put, post, download, fileToText, fileToBase64 } from "../api.js";
import { $, $$, esc, fmt, pct, toast, errToast, opt } from "../ui.js";
import { processPicker, bindPicker, route } from "../app.js";

/* Asosiy qiymatdan tashqari laboratoriya ko'rsatkichlari (oqim turi bo'yicha qo'shimcha satrlar). */
const EXTRA = {
  clinker: [["wCaO", "CaO ulushi (lab), %"], ["wMgO", "MgO ulushi (lab), %"]],
  fuel: [["ncv", "Issiqlik qiymati (lab), GJ/birlik"], ["ef", "Emissiya omili (lab), t CO₂/TJ"]],
  mass_in: [["carbon", "Uglerod ulushi (lab), 0–1"]],
  mass_out: [["carbon", "Uglerod ulushi (lab), 0–1"]],
};
const MONTHS = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];
const MONTHS_FULL = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const SL = { measured: "o'lchangan", lab: "laboratoriya", supplier: "yetkazib beruvchi", default: "standart qiymat" };
const unitName = u => String(u || "").replace(/^1000\s?m3$/i, "ming m³").replace(/m3\b/g, "m³");
const tone = v => (v >= 0.95 ? " ok" : v < 0.8 ? " hl" : "");

/* CSV ustunlari tavsifi (shablon bilan bir xil tartibda). */
const CSV_COLS = [
  ["stream", "Manba oqimining nomi yoki identifikatori"],
  ["month", "Oy raqami, 1 dan 12 gacha"],
  ["value", "Oylik qiymat, oqim birligida"],
  ["wCaO, wMgO", "Klinkerdagi CaO va MgO ulushi, %"],
  ["ncv, ef", "Yoqilg'ining issiqlik qiymati va emissiya omili (laboratoriya)"],
  ["carbon", "Uglerod ulushi, 0 dan 1 gacha"],
  ["source_level", "Manba darajasi: measured, lab, supplier yoki default"],
  ["uncertainty", "Noaniqlik, 0–100%"],
  ["note", "Izoh, ixtiyoriy"],
];
const colTable = cols => `<div class="tablewrap"><table><thead><tr><th scope="col">Ustun</th><th scope="col">Mazmuni</th></tr></thead><tbody>${
  cols.map(([c, t]) => `<tr><td>${c.split(", ").map(x => `<code>${esc(x)}</code>`).join(" ")}</td><td>${esc(t)}</td></tr>`).join("")}</tbody></table></div>`;

export default async function (el, _p, S) {
  const pick = await processPicker();
  if (!pick.current) {
    el.innerHTML = `<div class="view">
      <div class="head"><div><h1>Ma'lumot kiritish</h1><p class="sub">Manba oqimlari bo'yicha oylik faoliyat ma'lumotlarini kiritish va saqlash.</p></div></div>
      <div class="empty"><p>Ma'lumot kiritish uchun avval reyestrga inshoot va ishlab chiqarish jarayonini qo'shing.</p><a class="btn" href="#/registry">Reyestrni ochish</a></div>
    </div>`;
    return;
  }
  const y = S.year, pid = pick.current.id;
  const [d, gaps] = await Promise.all([get(`/api/processes/${pid}/activity?year=${y}`), get(`/api/ai/gaps?processId=${pid}&year=${y}`).catch(() => [])]);
  const canW = S.can("data.write") && !d.locked;
  const q = d.quality;
  const active = d.streams.filter(s => s.active);
  const cems = active.filter(s => s.type === "cems");
  const regLink = `#/registry/${pick.current.instId}`;

  const cell = (s, m, key, label) => {
    const r = d.grid[s.id]?.[m];
    const v = key ? r?.extra?.[key] : r?.value;
    const est = r?.status === "estimated" && !key;
    const tip = r ? [est ? "Taxminiy qiymat" : "", `Kiritilgan: ${(r.enteredAt || "").slice(0, 10)}`, r.note ? `Izoh: ${r.note}` : ""].filter(Boolean).join(". ") : "";
    return `<td><input class="grid-input${est ? " est" : ""}" data-s="${s.id}" data-m="${m}" ${key ? `data-x="${key}"` : ""} type="number" step="any" inputmode="decimal" value="${v ?? ""}" ${canW ? "" : "disabled"} aria-label="${esc(`${s.name}${label ? ", " + label : ""}, ${MONTHS_FULL[m - 1]}`)}"${tip ? ` title="${esc(tip)}"` : ""}></td>`;
  };

  /* ---------- Oylik jadval ---------- */
  const legend = `<ul class="meta" aria-label="Jadval belgilari">
      <li><span class="pill mid">Taxminiy</span> Sariq katak: taxminiy yoki AI taklifidan qabul qilingan qiymat</li>
      <li>Bo'sh katak: ma'lumot kiritilmagan, hisobda konservativ to'ldiriladi</li></ul>`;
  const gridTable = `<div class="tablewrap"><table class="grid">
      <thead><tr><th scope="col">Manba oqimi</th>${MONTHS.map(m => `<th class="num" scope="col">${m}</th>`).join("")}<th class="num" scope="col">Yillik jami</th></tr></thead>
      <tbody>${active.map(s => {
        const sum = Object.values(d.grid[s.id] || {}).reduce((a, r) => a + (r.value || 0), 0);
        const sl = SL[s.sourceLevel];
        const main = `<tr><td><b>${esc(s.name)}</b><span class="cell-sub">${esc(unitName(s.unit) || "Birlik ko'rsatilmagan")}${sl ? `, ${esc(sl)}` : ""}</span></td>${MONTHS.map((_, i) => cell(s, i + 1)).join("")}<td class="num"><b>${fmt(sum, 1)}</b></td></tr>`;
        const ex = (EXTRA[s.type] || []).map(([k, l]) => `<tr><td><span class="cell-sub">${esc(l)}</span></td>${MONTHS.map((_, i) => cell(s, i + 1, k, l)).join("")}<td></td></tr>`).join("");
        return main + ex;
      }).join("")}</tbody></table></div>`;
  const gridPanel = `<section class="panel" aria-labelledby="gridTitle">
    <h2 id="gridTitle">Oylik faoliyat ma'lumotlari${d.locked ? ` <span class="pill ok">Verifikatsiyalangan</span>` : !canW ? ` <span class="pill lo">Faqat ko'rish</span>` : ""}</h2>
    ${active.length ? `<p class="section-intro">${canW
      ? "Har bir manba oqimi uchun oylik qiymatni ko'rsatilgan birlikda kiriting, so'ng jadval ostidagi «O'zgarishlarni saqlash» tugmasini bosing. Laboratoriya ko'rsatkichlari satrlari ixtiyoriy."
      : "Manba oqimlari bo'yicha oylik qiymatlar. Katak ustiga kursorni olib borsangiz, kiritilgan sana va izoh ko'rinadi."}</p>
    <div class="stack">
      ${gridTable}
      <div class="toolbar">
        ${canW ? `<div class="row"><button class="btn" id="saveBtn" type="button">O'zgarishlarni saqlash</button><span class="note" id="dirty" aria-live="polite">Saqlanmagan o'zgarish yo'q</span></div>` : ""}
        ${legend}
      </div>
    </div>`
    : `<div class="empty"><p>Bu jarayonda faol manba oqimi yo'q. Oylik ma'lumot kiritish uchun avval monitoring rejasiga oqim qo'shing.</p><a class="btn" href="${regLink}">Monitoring rejasini ochish</a></div>`}
  </section>`;

  /* ---------- AI: bo'sh oylar uchun takliflar ---------- */
  const gapsPanel = `<section class="panel" aria-labelledby="gapTitle">
    <h2 id="gapTitle">Bo'sh oylar uchun takliflar <span class="ai-label">AI tavsiyasi</span></h2>
    ${gaps.length ? `<p class="section-intro">Kiritilmagan o'tgan oylar uchun qo'shni oylar va oqim medianasi asosida hisoblangan qiymatlar. Qabul qilingan qiymat «taxminiy» deb belgilanadi va verifikatsiyadan o'tmaguncha CBAM hujjatiga kirmaydi.</p>
    <div class="stack">
      <div class="tablewrap"><table><thead><tr><th scope="col"><span class="sr-label">Tanlash</span></th><th scope="col">Manba oqimi</th><th scope="col">Oy</th><th class="num" scope="col">Taklif</th><th class="num" scope="col">Mediana</th><th scope="col">Usul</th></tr></thead><tbody>
      ${gaps.map((g, i) => `<tr>
        <td><input type="checkbox" data-gap="${i}" ${canW ? "" : "disabled"} aria-label="${esc(`${g.streamName}, ${MONTHS_FULL[g.month - 1]}: taklifni tanlash`)}"></td>
        <td>${esc(g.streamName)}</td><td>${MONTHS_FULL[g.month - 1]}</td>
        <td class="num"><b>${fmt(g.suggested, 2)}</b></td>
        <td class="num">${fmt(g.bounds.median, 2)}${g.bounds.min != null && g.bounds.max != null ? `<span class="cell-sub">${fmt(g.bounds.min, 2)} – ${fmt(g.bounds.max, 2)}</span>` : ""}</td>
        <td><span class="note">${esc(g.method)}</span></td></tr>`).join("")}
      </tbody></table></div>
      ${canW ? `<div class="row"><button class="btn" id="gapBtn" type="button">Tanlanganlarni qabul qilish</button><span class="note">Belgilangan qiymatlar jadvalga taxminiy sifatida yoziladi.</span></div>` : ""}
    </div>`
    : `<div class="note">Barcha o'tgan oylar to'ldirilgan, hozircha taklif yo'q.</div>`}
  </section>`;

  /* ---------- CSV import ---------- */
  const csvPanel = `<section class="panel" aria-labelledby="csvTitle">
    <h2 id="csvTitle">CSV fayldan import</h2>
    <p class="section-intro">${canW ? "Bir nechta oy yoki oqim ma'lumotini bir yo'la yuklash uchun." : "Jadval shablonini CSV formatida yuklab olish mumkin. Import faqat tahrirlash huquqi bilan ishlaydi."}</p>
    <div class="stack">
      ${canW ? `<ol class="steps">
        <li><div><b>Shablonni yuklab oling</b><span class="cell-sub">Unda jarayondagi har bir oqim va oy uchun tayyor qator bor.</span></div></li>
        <li><div><b>Qiymatlarni to'ldiring</b><span class="cell-sub">Birinchi qatordagi ustun nomlarini o'zgartirmang. Ajratgich: nuqtali vergul.</span></div></li>
        <li><div><b>Faylni yuklang</b><span class="cell-sub">Bitta xato topilsa ham hech qaysi qator saqlanmaydi; xatolar qator raqami bilan ko'rsatiladi.</span></div></li>
      </ol>` : ""}
      <details><summary>Ustunlar tavsifi</summary>${colTable(CSV_COLS)}</details>
      <div class="row"><button class="btn ghost" id="tplBtn" type="button">Shablonni yuklab olish</button>${canW ? `<button class="btn" type="button" data-pick="csvFile">CSV faylni yuklash</button><input type="file" id="csvFile" accept=".csv,text/csv" hidden>` : ""}</div>
    </div>
  </section>`;

  /* ---------- Dalil hujjatlari ---------- */
  const evidencePanel = canW && active.length ? `<section class="panel" aria-labelledby="docTitle">
    <h2 id="docTitle">Dalil hujjatlari</h2>
    <p class="section-intro">Hisoblagich ko'rsatkichi, laboratoriya bayonnomasi yoki yetkazib beruvchi hujjatini oqimga biriktiring. Verifikator qiymatlarni shu hujjatlar asosida tekshiradi.</p>
    <div class="stack">
      <label>Manba oqimi<select id="docStream">${active.map(s => opt(s.id, s.name)).join("")}</select></label>
      <fieldset><legend>Hujjat fayli</legend><div class="stack">
        <div class="row"><button class="btn ghost" type="button" data-pick="docFile">Faylni tanlash</button><span class="note" id="docName" aria-live="polite">Fayl tanlanmagan</span></div>
        <span class="note">PDF, PNG, JPG, CSV yoki XLSX, hajmi 8 MB gacha. Fayl SHA-256 xeshi bilan muhrlanadi.</span>
        <input type="file" id="docFile" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx" hidden>
      </div></fieldset>
      <div class="row"><button class="btn" id="docBtn" type="button">Hujjatni yuklash</button></div>
    </div>
  </section>` : "";

  /* ---------- CEMS ---------- */
  const now = new Date();
  const defMonth = y === now.getFullYear() ? Math.max(1, now.getMonth()) : 1;
  const cemsPanel = cems.length && canW ? `<section class="panel" aria-labelledby="cemsTitle">
    <h2 id="cemsTitle">CEMS soatlik o'lchovlari</h2>
    <p class="section-intro">Uzluksiz emissiya o'lchash tizimi (CEMS) ma'lumotlarini oy bo'yicha yuklang. Platforma soatlik qiymatlardan oylik emissiyani hisoblab, jadvalning tegishli katagiga yozadi.</p>
    <div class="stack">
      <div class="fields">
        <label>Manba oqimi<select id="cemsStream">${cems.map(s => opt(s.id, s.name)).join("")}</select></label>
        <label>Oy<select id="cemsMonth">${MONTHS_FULL.map((m, i) => opt(i + 1, m, defMonth)).join("")}</select></label>
      </div>
      <span class="note">CSV ustunlari: <code>c</code> konsentratsiya, g/Nm³; <code>v</code> hajm, Nm³. Har bir qator bir soatni bildiradi.</span>
      <div class="row"><button class="btn" type="button" data-pick="cemsFile">CEMS faylini yuklash</button><input type="file" id="cemsFile" accept=".csv,text/csv" hidden></div>
    </div>
  </section>` : "";

  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Ma'lumot kiritish</h1><p class="sub">Manba oqimlari bo'yicha oylik faoliyat ma'lumotlarini kiriting va saqlang. Ular emissiya hisobi va CBAM hujjatlari uchun asos bo'ladi.</p></div>
      <div class="row">${pick.html}</div></div>
    ${d.locked ? `<div class="banner info"><b>Ma'lumotlar qulflangan.</b> ${y}-yil ma'lumotlari verifikatsiyadan o'tgan, shuning uchun ularni faqat ko'rish mumkin.</div>`
      : !canW ? `<div class="banner info">Sizning rolingiz uchun jadval faqat ko'rish rejimida ochiladi.</div>` : ""}
    <div class="kpis">
      <div class="kpi${tone(q.completeness)}"><span class="l">To'liqlik</span><span class="v">${pct(q.completeness)}</span><span class="n">${q.entered} / ${q.expected} oy-oqim kiritilgan</span></div>
      <div class="kpi${tone(q.timeliness)}"><span class="l">O'z vaqtidaligi</span><span class="v">${pct(q.timeliness)}</span><span class="n">Oy tugagach 30 kun ichida kiritilgan</span></div>
      <div class="kpi${tone(q.consistency)}"><span class="l">Izchillik</span><span class="v">${pct(q.consistency)}</span><span class="n">Oqim medianasidan ±50% oralig'ida</span></div>
      <div class="kpi"><span class="l">Faol manba oqimlari</span><span class="v">${active.length}</span><span class="n"><a class="link-more" href="${regLink}">Monitoring rejasini ochish</a></span></div>
    </div>
    ${gridPanel}
    ${active.length && gaps.length ? gapsPanel : ""}
    ${evidencePanel ? `<div class="grid2">${csvPanel}${evidencePanel}</div>` : csvPanel}
    ${cemsPanel}
    ${active.length && !gaps.length ? gapsPanel : ""}
  </div>`;

  bindPicker();
  /* Yashirin fayl maydonlarini klaviatura bilan ham ochish mumkin bo'lgan tugmalar. */
  $$("[data-pick]").forEach(b => b.onclick = () => $(`#${b.dataset.pick}`)?.click());
  const dirty = new Map();
  $$(".grid-input").forEach(inp => inp.oninput = () => {
    const k = `${inp.dataset.s}|${inp.dataset.m}`;
    dirty.set(k, true); inp.classList.remove("err");
    const n = $("#dirty"); if (n) n.textContent = `Saqlanmagan o'zgarishlar: ${dirty.size} ta oy`;
  });
  const sb = $("#saveBtn");
  if (sb) sb.onclick = async () => {
    const entries = [];
    for (const k of dirty.keys()) {
      const [sid, m] = k.split("|");
      const main = $(`.grid-input[data-s="${sid}"][data-m="${m}"]:not([data-x])`);
      const extra = {};
      $$(`.grid-input[data-s="${sid}"][data-m="${m}"][data-x]`).forEach(x => { if (x.value !== "") extra[x.dataset.x] = Number(x.value); });
      entries.push({ streamId: sid, month: +m, value: main.value === "" ? null : Number(main.value), extra });
    }
    if (!entries.length) return toast("Saqlanadigan o'zgarish yo'q. Avval jadvaldagi qiymatni o'zgartiring.");
    try { await put(`/api/processes/${pid}/activity`, { year: y, entries }); toast("Ma'lumotlar saqlandi"); route(); } catch (x) { errToast(x); }
  };
  $("#tplBtn").onclick = () => download(`/api/processes/${pid}/activity/template.csv`).catch(errToast);
  const cf = $("#csvFile"); if (cf) cf.onchange = async () => {
    if (!cf.files[0]) return;
    try { const csv = await fileToText(cf.files[0]); const r = await post(`/api/processes/${pid}/activity/import`, { year: y, csv }); toast(`${r.imported} ta qator import qilindi`); route(); } catch (x) { errToast(x); } finally { cf.value = ""; }
  };
  const ce = $("#cemsFile"); if (ce) ce.onchange = async () => {
    if (!ce.files[0]) return;
    try { const csv = await fileToText(ce.files[0]); const r = await post(`/api/streams/${$("#cemsStream").value}/cems`, { year: y, month: +$("#cemsMonth").value, csv }); toast(`CEMS o'lchovlari yozildi: ${fmt(r.tonnes, 3)} t, soat qamrovi ${pct(r.coverage)}`); route(); } catch (x) { errToast(x); } finally { ce.value = ""; }
  };
  const gb = $("#gapBtn"); if (gb) gb.onclick = async () => {
    const items = $$("[data-gap]:checked").map(c => gaps[+c.dataset.gap]).map(g => ({ streamId: g.streamId, month: g.month }));
    if (!items.length) return toast("Qabul qilish uchun kamida bitta taklifni belgilang.");
    try { await post("/api/ai/gaps/accept", { processId: pid, year: y, items }); toast("Takliflar taxminiy qiymat sifatida saqlandi"); route(); } catch (x) { errToast(x); }
  };
  const dfile = $("#docFile"); if (dfile) dfile.onchange = () => { $("#docName").textContent = dfile.files[0]?.name || "Fayl tanlanmagan"; };
  const db = $("#docBtn"); if (db) db.onclick = async () => {
    const f = $("#docFile").files[0]; if (!f) return toast("Avval yuklanadigan faylni tanlang.");
    try { const r = await post("/api/documents", { name: f.name, mime: f.type || "application/octet-stream", base64: await fileToBase64(f), entity: "stream", entityId: $("#docStream").value }); toast(`Hujjat yuklandi. SHA-256: ${r.sha256.slice(0, 12)}…`); } catch (x) { errToast(x); }
  };
}
