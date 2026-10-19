/* F-6.7 — ITMO va emissiya kamaytirish loyihalari (PF-110): ER, 80/20 taqsimot, reestrga uzatish, ikki marta hisoblash blokirovkasi. */
import { get, post } from "../api.js";
import { $, $$, esc, fmt, table, toast, errToast, formData, opt } from "../ui.js";
import { route } from "../app.js";

export default async function (el, _p, S) {
  const [rows, insts] = await Promise.all([get("/api/itmo"), S.can("itmo.write") ? S.insts() : Promise.resolve([])]);
  const procs = insts.flatMap(i => i.processes.map(p => [p.id, `${i.name} — ${p.name}`]));
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>ITMO loyihalari</h1><p class="sub">ER = BE − PE − LE; PF-110 bo'yicha 80% savdoga, 20% saqlab qolinadi. CBAM tovari bilan bog'liq kamayish verifikatsiyalangan SEE da aks etgan bo'lsa, ITMO sifatida uzatish bloklanadi.</p></div></div>
    <section class="panel">${table([{ h: "Loyiha", k: "name" }, { h: "Yil", k: "year" }, { h: "BE", k: "be", num: true }, { h: "PE", k: "pe", num: true }, { h: "LE", k: "le", num: true },
      { h: "ER, t CO₂e", k: "er", num: true }, { h: "Savdoga (80%)", k: "trade", num: true }, { h: "Bufer (20%)", k: "buffer", num: true },
      { h: "Holat", v: r => `<span class="pill ${r.status === "registered" ? "ok" : "mid"}">${esc(r.status === "registered" ? "reestrda: " + r.registryId : "qoralama")}</span>${r.scope === "cbam_goods" ? ' <span class="pill lo">CBAM tovari</span>' : ""}`, html: true },
      { h: "", v: r => r.status !== "registered" && S.can("itmo.register") ? `<button class="btn small" data-reg="${r.id}">Reestrga uzatish</button>` : "", html: true }], rows, { empty: "Loyiha yo'q." })}</section>
    ${S.can("itmo.write") ? `<section class="panel"><h2>Yangi loyiha</h2><form id="itForm" novalidate><div class="fields">
      <label>Nomi<input name="name" required></label><label>Yil<input name="year" type="number" value="${S.year}"></label>
      <label>Bazaviy emissiya BE, t<input name="be" type="number" min="0" step="any" required></label><label>Loyiha emissiyasi PE, t<input name="pe" type="number" min="0" step="any" required></label>
      <label>Sizib chiqish LE, t<input name="le" type="number" min="0" step="any"></label>
      <label>Qamrov<select name="scope">${opt("other", "CBAM dan tashqari")}${opt("cbam_goods", "CBAM tovari jarayonida")}</select></label>
      <label>Bog'langan jarayon<select name="linkedProcessId"><option value="">—</option>${procs.map(([k, v]) => opt(k, v)).join("")}</select></label>
    </div><div class="row"><button class="btn" type="submit">Saqlash</button></div></form></section>` : ""}
  </div>`;
  const f = $("#itForm"); if (f) f.onsubmit = async e => { e.preventDefault(); try { await post("/api/itmo", formData(f)); toast("Saqlandi"); route(); } catch (x) { errToast(x); } };
  $$("[data-reg]").forEach(b => b.onclick = async () => { try { const r = await post(`/api/itmo/${b.dataset.reg}/register`); toast("Reestrga uzatildi: " + r.registryId); route(); } catch (x) { errToast(x); } });
}
