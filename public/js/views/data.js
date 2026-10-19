/* M3 — ma'lumot kiritish: oylik jadval, CSV import, CEMS soatlik yuklash, dalil hujjatlari, AI-5 bo'shliq takliflari. */
import { get, put, post, download, fileToText, fileToBase64 } from "../api.js";
import { $, $$, esc, fmt, pct, toast, errToast, opt } from "../ui.js";
import { processPicker, bindPicker, route } from "../app.js";

const EXTRA = { clinker: [["wCaO", "CaO, %"], ["wMgO", "MgO, %"]], fuel: [["ncv", "NCV (lab), GJ/birlik"], ["ef", "EF (lab), t/TJ"]], mass_in: [["carbon", "Uglerod ulushi"]], mass_out: [["carbon", "Uglerod ulushi"]] };
const MONTHS = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];

export default async function (el, _p, S) {
  const pick = await processPicker();
  if (!pick.current) { el.innerHTML = `<div class="view"><h1>Ma'lumot kiritish</h1><div class="empty">Avval reyestrda inshoot va jarayon qo'shing. <a href="#/registry">Reyestr →</a></div></div>`; return; }
  const y = S.year, pid = pick.current.id;
  const [d, gaps] = await Promise.all([get(`/api/processes/${pid}/activity?year=${y}`), get(`/api/ai/gaps?processId=${pid}&year=${y}`).catch(() => [])]);
  const canW = S.can("data.write") && !d.locked;
  const q = d.quality;
  const cell = (s, m, key) => {
    const r = d.grid[s.id]?.[m];
    const v = key ? r?.extra?.[key] : r?.value;
    return `<td><input class="grid-input${r?.status === "estimated" && !key ? " est" : ""}" data-s="${s.id}" data-m="${m}" ${key ? `data-x="${key}"` : ""} type="number" step="any" value="${v ?? ""}" ${canW ? "" : "disabled"} aria-label="${esc(s.name)} ${MONTHS[m - 1]}${key ? " " + key : ""}" title="${r ? `${r.status === "estimated" ? "TAXMINIY · " : ""}kiritilgan: ${(r.enteredAt || "").slice(0, 10)}${r.note ? " · " + r.note : ""}` : ""}"></td>`;
  };
  const active = d.streams.filter(s => s.active);
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Ma'lumot kiritish · ${y}</h1><p class="sub">Oylik faoliyat ma'lumotlari (FT-2.1, FT-2.6, FT-2.7). Bo'sh katak — ma'lumot yo'q; hisobda konservativ to'ldiriladi. Sariq katak — taxminiy qiymat.</p></div>
      <div class="row">${pick.html}</div></div>
    ${d.locked ? `<div class="banner">${y}-yil ma'lumotlari verifikatsiyadan o'tgan va qulflangan.</div>` : ""}
    <div class="kpis">
      <div class="kpi"><span class="l">To'liqlik</span><span class="v">${pct(q.completeness)}</span><span class="n">${q.entered} / ${q.expected} oy-oqim</span></div>
      <div class="kpi"><span class="l">O'z vaqtidaligi</span><span class="v">${pct(q.timeliness)}</span><span class="n">oy tugagach 30 kun ichida</span></div>
      <div class="kpi"><span class="l">Izchillik</span><span class="v">${pct(q.consistency)}</span><span class="n">medianadan ±50% ichida</span></div>
      <div class="kpi"><span class="l">Oqimlar</span><span class="v">${active.length}</span><span class="n"><a href="#/registry/${pick.current.instId}">monitoring rejasi →</a></span></div>
    </div>
    <section class="panel"><h2>Oylik jadval</h2>
      ${active.length ? `<div class="tablewrap"><table class="grid"><thead><tr><th>Oqim</th>${MONTHS.map(m => `<th class="num">${m}</th>`).join("")}<th class="num">Jami</th></tr></thead><tbody>
      ${active.map(s => {
        const sum = Object.values(d.grid[s.id] || {}).reduce((a, r) => a + (r.value || 0), 0);
        const main = `<tr><td><b>${esc(s.name)}</b><br><span class="note">${esc(s.unit || "")}</span></td>${MONTHS.map((_, i) => cell(s, i + 1)).join("")}<td class="num">${fmt(sum, 1)}</td></tr>`;
        const ex = (EXTRA[s.type] || []).map(([k, l]) => `<tr><td class="note">↳ ${esc(l)}</td>${MONTHS.map((_, i) => cell(s, i + 1, k)).join("")}<td></td></tr>`).join("");
        return main + ex;
      }).join("")}</tbody></table></div>` : `<div class="empty">Faol manba oqimlari yo'q. <a href="#/registry/${pick.current.instId}">Monitoring rejasini to'ldiring →</a></div>`}
      ${canW && active.length ? `<div class="row" style="margin-top:12px"><button class="btn" id="saveBtn">O'zgarishlarni saqlash</button><span class="note" id="dirty"></span></div>` : ""}
    </section>
    <div class="grid2">
      <section class="panel"><h2>CSV import (M3.2)</h2>
        <p class="note">Ustunlar: <code>stream;month;value;wCaO;wMgO;ncv;ef;carbon;source_level;uncertainty;note</code>. Xato bo'lsa hech narsa saqlanmaydi.</p>
        <div class="row"><button class="btn ghost" id="tplBtn">Shablonni yuklab olish</button>${canW ? `<label class="btn ghost">CSV tanlash<input type="file" id="csvFile" accept=".csv,text/csv" hidden></label>` : ""}</div></section>
      <section class="panel"><h2>CEMS soatlik o'lchovlari (F-5.4)</h2>
        ${active.some(s => s.type === "cems") && canW ? `<p class="note">CSV ustunlari: <code>c</code> (g/Nm³), <code>v</code> (Nm³) — har qator bir soat.</p>
        <div class="fields"><label>Oqim<select id="cemsStream">${active.filter(s => s.type === "cems").map(s => opt(s.id, s.name)).join("")}</select></label>
        <label>Oy<select id="cemsMonth">${MONTHS.map((m, i) => opt(i + 1, m)).join("")}</select></label></div>
        <div class="row" style="margin-top:8px"><label class="btn ghost">CSV tanlash<input type="file" id="cemsFile" accept=".csv,text/csv" hidden></label></div>` : `<p class="note">Bu jarayonda CEMS oqimi yo'q.</p>`}</section>
    </div>
    <section class="panel"><h2>Bo'shliqlarni to'ldirish takliflari (AI-5) <span class="ai-label">AI tavsiyasi</span></h2>
      ${gaps.length ? `<p class="note">Qabul qilingan qiymat "taxminiy" holatda saqlanadi va verifikatsiyasiz CBAM hujjatiga kirmaydi.</p>
      <div class="tablewrap"><table><thead><tr><th></th><th>Oqim</th><th>Oy</th><th class="num">Taklif</th><th class="num">Mediana</th><th>Usul</th></tr></thead><tbody>
      ${gaps.map((g, i) => `<tr><td><input type="checkbox" data-gap="${i}" ${canW ? "" : "disabled"} aria-label="Tanlash"></td><td>${esc(g.streamName)}</td><td>${MONTHS[g.month - 1]}</td><td class="num">${fmt(g.suggested, 2)}</td><td class="num">${fmt(g.bounds.median, 2)}</td><td class="note">${esc(g.method)}</td></tr>`).join("")}
      </tbody></table></div>${canW ? `<div class="row" style="margin-top:10px"><button class="btn ghost" id="gapBtn">Tanlanganlarni qabul qilish</button></div>` : ""}` : `<p class="note">O'tgan oylarda bo'shliq yo'q.</p>`}</section>
    ${canW ? `<section class="panel"><h2>Dalil hujjati yuklash (FT-2.4, FT-2.6)</h2><div class="fields">
      <label>Oqim<select id="docStream">${active.map(s => opt(s.id, s.name)).join("")}</select></label>
      <div><span class="note">Fayl: PDF, rasm, CSV, XLSX · ≤ 8 MB</span><div class="row" style="margin-top:4px"><label class="btn ghost">Fayl tanlash<input type="file" id="docFile" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx" hidden></label><span class="note" id="docName">tanlanmagan</span></div></div></div>
      <div class="row" style="margin-top:8px"><button class="btn" id="docBtn">Yuklash</button></div></section>` : ""}
  </div>`;
  bindPicker();
  const dirty = new Map();
  $$(".grid-input").forEach(inp => inp.oninput = () => {
    const k = `${inp.dataset.s}|${inp.dataset.m}`;
    dirty.set(k, true); inp.classList.remove("err");
    const n = $("#dirty"); if (n) n.textContent = `${dirty.size} ta o'zgargan oy`;
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
    if (!entries.length) return toast("O'zgarish yo'q");
    try { await put(`/api/processes/${pid}/activity`, { year: y, entries }); toast("Saqlandi"); route(); } catch (x) { errToast(x); }
  };
  $("#tplBtn").onclick = () => download(`/api/processes/${pid}/activity/template.csv`).catch(errToast);
  const cf = $("#csvFile"); if (cf) cf.onchange = async () => { try { const csv = await fileToText(cf.files[0]); const r = await post(`/api/processes/${pid}/activity/import`, { year: y, csv }); toast(`${r.imported} ta qator import qilindi`); route(); } catch (x) { errToast(x); } };
  const ce = $("#cemsFile"); if (ce) ce.onchange = async () => { try { const csv = await fileToText(ce.files[0]); const r = await post(`/api/streams/${$("#cemsStream").value}/cems`, { year: y, month: +$("#cemsMonth").value, csv }); toast(`CEMS: ${fmt(r.tonnes, 3)} t, qamrov ${pct(r.coverage)}`); route(); } catch (x) { errToast(x); } };
  const gb = $("#gapBtn"); if (gb) gb.onclick = async () => {
    const items = $$("[data-gap]:checked").map(c => gaps[+c.dataset.gap]).map(g => ({ streamId: g.streamId, month: g.month }));
    if (!items.length) return toast("Taklif tanlanmagan");
    try { await post("/api/ai/gaps/accept", { processId: pid, year: y, items }); toast("Qabul qilindi (taxminiy)"); route(); } catch (x) { errToast(x); }
  };
  const dfile = $("#docFile"); if (dfile) dfile.onchange = () => { $("#docName").textContent = dfile.files[0]?.name || "tanlanmagan"; };
  const db = $("#docBtn"); if (db) db.onclick = async () => {
    const f = $("#docFile").files[0]; if (!f) return toast("Fayl tanlanmagan");
    try { const r = await post("/api/documents", { name: f.name, mime: f.type || "application/octet-stream", base64: await fileToBase64(f), entity: "stream", entityId: $("#docStream").value }); toast(`Yuklandi · SHA-256 ${r.sha256.slice(0, 12)}…`); } catch (x) { errToast(x); }
  };
}
