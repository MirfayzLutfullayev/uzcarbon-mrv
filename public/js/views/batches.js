/* Eksport partiyalari (D12): bojxona deklaratsiyalari, qo'lda kiritish, CSV import, jarayonga bog'lash (S2 ssenariysi). */
import { get, post, put, del, fileToText } from "../api.js";
import { $, $$, esc, fmt, table, toast, errToast, formData, opt, confirmInline } from "../ui.js";
import { route } from "../app.js";

export default async function (el, _p, S) {
  const y = S.year;
  const [rows, insts, imps, ops] = await Promise.all([get(`/api/batches?year=${y}`), S.insts(), get("/api/importers").catch(() => []), S.user.role === "customs" ? get("/api/operators") : Promise.resolve([])]);
  const procs = insts.flatMap(i => i.processes.map(p => ({ id: p.id, name: `${i.name} — ${p.name}`, tif: p.tifCode, op: i.operatorId })));
  const canW = S.can("batches.write");
  const exporter = S.user.role === "exporter_admin" || S.user.role === "exporter_specialist";
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Eksport partiyalari · ${y}</h1><p class="sub">Bojxona deklaratsiyasi bo'yicha netto og'irlik (m_s). Partiya TIF TN kodi bo'yicha jarayonga avtomatik bog'lanadi; EE_s = m_s · SEE_CBAM (F-5.8).</p></div></div>
    <section class="panel"><h2>Partiyalar <span class="pill ok">${rows.length}</span></h2>${table([
      { h: "Deklaratsiya", v: r => `<span class="mono">${esc(r.declarationNo)}</span><br><span class="note">${esc(r.date)} · ${esc({ customs: "Bojxona", manual: "qo'lda", csv: "CSV" }[r.source] || r.source)}</span>`, html: true },
      ...(exporter ? [] : [{ h: "Eksportyor", k: "operatorName" }]),
      { h: "TIF TN", v: r => `<span class="mono">${esc(r.tifCode)}</span>`, html: true }, { h: "Netto, t", k: "netT", num: true, d: 3 },
      { h: "Importyor", v: r => `${esc(r.importerName || "—")}<br><span class="note mono">${esc(r.eori || "")} ${esc(r.country || "")}</span>`, html: true },
      { h: "Jarayon", v: r => r.processName ? esc(r.processName) : (exporter && canW ? `<select data-link="${r.id}" style="width:auto"><option value="">— bog'lash —</option>${procs.filter(p => p.op === r.operatorId).map(p => opt(p.id, p.name)).join("")}</select>` : `<span class="pill hi">bog'lanmagan</span>`), html: true },
      { h: "", v: r => canW && (r.source !== "customs" || S.user.role === "customs") ? `<button class="btn danger small" data-del="${r.id}">O'chirish</button>` : "", html: true },
    ], rows, { empty: "Bu yil uchun partiya yo'q.", foot: ["Jami", ...(exporter ? [] : [""]), "", fmt(rows.reduce((a, r) => a + r.netT, 0), 3), "", "", ""] })}</section>
    ${canW ? `<div class="grid2"><section class="panel"><h2>Partiya qo'shish</h2><form id="bForm" novalidate><div class="fields">
      ${S.user.role === "customs" ? `<label>Eksportyor<select name="operatorId">${ops.map(o => opt(o.id, o.name)).join("")}</select></label>` : ""}
      <label>Deklaratsiya raqami<input name="declarationNo" required></label><label>Sana<input name="date" type="date" required value="${y}-01-15"></label>
      <label>TIF TN <em>10 raqam</em><input name="tifCode" maxlength="10" inputmode="numeric" required></label><label>Netto og'irlik, t<input name="netT" type="number" step="any" min="0" required></label>
      ${exporter ? `<label>Importyor<select name="importerId"><option value="">—</option>${imps.map(i => opt(i.id, i.name)).join("")}</select></label>` : ""}
      <label>EORI<input name="eori"></label><label>Mamlakat <em>EI, ISO-2</em><input name="country" maxlength="2" placeholder="DE"></label>
    </div><div class="row"><button class="btn" type="submit">Qo'shish</button></div></form></section>
    <section class="panel"><h2>CSV import</h2><p class="note">Ustunlar: <code>declaration_no;date;tif_code;net_t;eori;country</code>${S.user.role === "customs" ? ";<code>stir</code>" : ""}. Xato bo'lsa hech narsa saqlanmaydi.</p>
      <label class="btn ghost">CSV tanlash<input type="file" id="bCsv" accept=".csv,text/csv" hidden></label></section></div>` : ""}
  </div>`;
  const f = $("#bForm"); if (f) f.onsubmit = async e => { e.preventDefault(); try { await post("/api/batches", formData(f)); toast("Partiya qo'shildi"); route(); } catch (x) { errToast(x); } };
  const c = $("#bCsv"); if (c) c.onchange = async () => { try { const r = await post("/api/batches/import", { csv: await fileToText(c.files[0]) }); toast(`${r.imported} ta partiya import qilindi`); route(); } catch (x) { errToast(x); } };
  $$("[data-link]").forEach(s => s.onchange = async () => { if (!s.value) return; try { await put(`/api/batches/${s.dataset.link}`, { processId: s.value }); toast("Bog'landi"); route(); } catch (x) { errToast(x); } });
  $$("[data-del]").forEach(b => b.onclick = () => confirmInline(b, "O'chirilsinmi?", async () => { try { await del(`/api/batches/${b.dataset.del}`); toast("O'chirildi"); route(); } catch (x) { errToast(x); } }));
}
