/* M5 — uglerod soliqi: yoqilg'i stavkalari va yashirin narx, deklaratsiya loyihasi (3 variant), to'lovlar va tasdiq, P_eff va CP_g, byulleten. */
import { get, post, download } from "../api.js";
import { $, $$, esc, fmt, pct, table, toast, errToast, formData, opt } from "../ui.js";
import { route } from "../app.js";

const MODE = { up: "Yuqori oqim (yoqilg'i aksizi)", down1: "Quyi oqim, 1-variant (texnologik)", down2: "Quyi oqim, 2-variant (barchasi − yuqori oqim)" };

export default async function (el, _p, S) {
  const y = Math.max(2026, Math.min(2035, S.year));
  const insts = S.can("registry.read") ? await S.insts() : [];
  const [rates, pays, coex] = await Promise.all([get(`/api/tax/rates?year=${y}`), get("/api/tax/payments").catch(() => []), get(`/api/reports/coexistence?year=${y}`).catch(() => null)]);
  const bulletin = S.can("dashboard.gov") ? await get(`/api/reports/bulletin?year=${y}`).catch(() => null) : null;
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Uglerod soliqi · ${y}</h1><p class="sub">Stavka ${fmt(rates.pUsd)} USD/t CO₂e × ${fmt(rates.fx)} so'm = ${fmt(rates.pUzs)} so'm/t CO₂e (F-6.1). Summalar faqat deterministik formulalar bilan hisoblanadi.</p></div>
      ${S.year < 2026 ? `<span class="pill mid">${S.year}-yil uchun stavka yo'q — 2026 ko'rsatilmoqda</span>` : ""}</div>
    <section class="panel"><h2>Yoqilg'i birligiga stavka (F-6.2a, F-6.2b)</h2>${table([{ h: "Yoqilg'i", k: "name" }, { h: "Birlik", k: "unit" },
      { h: "t CO₂ / birlik", k: "efPerUnit", num: true, d: 4 }, { h: "So'm / birlik", k: "ratePerUnit", num: true }, { h: "t CO₂ / t", k: "efPerT", num: true, d: 3 }, { h: "So'm / t", k: "ratePerT", num: true }], rates.fuels)}
      ${rates.implicit.length ? `<h3 style="margin:12px 0 6px">Amaldagi aksizning yashirin uglerod narxi (F-6.2d)</h3>${table([{ h: "Yoqilg'i", k: "fuel" }, { h: "Aksiz, so'm/t", k: "exciseUzsPerT", num: true }, { h: "Izoh", k: "note" }, { h: "USD / t CO₂", k: "implicitUsdPerT", num: true, d: 2 }], rates.implicit)}
      <p class="note">Ad valorem aksiz (tabiiy gaz, 12%) uglerod tarkibiga bog'lanmagani uchun CBAM chegirmasiga kirmaydi.</p>` : ""}
      ${coex ? `<div class="row" style="margin-top:8px"><button class="btn ghost small" id="coexBtn">"Birgalikda mavjudlik eslatmasi" (XLSX)</button></div>` : ""}</section>
    ${insts.length ? `<section class="panel"><h2>Deklaratsiya loyihasi (M5.3)</h2><form id="decForm" novalidate><div class="fields">
      <label>Inshoot<select name="installationId">${insts.map(i => opt(i.id, i.name)).join("")}</select></label>
      <label>Davr<select name="quarter"><option value="">Butun yil</option>${["Q1", "Q2", "Q3", "Q4"].map(q => opt(q, q + " chorak")).join("")}</select></label>
      <label>Variant<select name="variant">${Object.entries(MODE).map(([k, v]) => opt(k, v)).join("")}</select></label>
    </div><div class="row"><button class="btn" type="submit">Hisoblash</button><button class="btn ghost" type="button" id="decXml">XML (Soliq qo'mitasi uchun)</button></div></form><div id="decOut" style="margin-top:12px"></div></section>
    <section class="panel"><h2>Samarali to'langan narx P_eff va CP_g (F-6.4, CBAM 9-modda)</h2>
      <div class="row"><select id="effInst" style="width:auto">${insts.map(i => opt(i.id, i.name)).join("")}</select><button class="btn ghost" id="effBtn">Hisoblash</button></div><div id="effOut" style="margin-top:10px"></div></section>` : ""}
    <section class="panel"><h2>To'lovlar (M5.4)</h2>${table([{ h: "Korxona / inshoot", v: p => `${esc(p.operatorName)}<br><span class="note">${esc(p.installationName || "")}</span>`, html: true },
      { h: "Davr", k: "period" }, { h: "Turi", v: p => esc(p.kind === "up" ? "yuqori oqim" : "quyi oqim") }, { h: "Summa, so'm", k: "amountUzs", num: true }, { h: "Qaytarish, so'm", k: "rebateUzs", num: true },
      { h: "USD", k: "amountUsd", num: true, d: 2 }, { h: "Qamrov, t", k: "coveredT", num: true },
      { h: "Holat", v: p => `<span class="pill ${p.status === "confirmed" ? "ok" : "mid"}">${esc(p.status === "confirmed" ? "Soliq qo'mitasi tasdiqlagan" : "to'langan")}</span>${p.status !== "confirmed" && S.can("tax.confirm") ? ` <button class="btn small" data-conf="${p.id}">Tasdiqlash</button>` : ""}`, html: true }], pays)}
      ${S.can("tax.write") ? `<details style="margin-top:10px"><summary>To'lovni qayd etish</summary><form id="payForm" novalidate><div class="fields">
        <label>Inshoot<select name="installationId">${insts.map(i => opt(i.id, i.name)).join("")}</select></label><label>Yil<input name="year" type="number" value="${y}"></label>
        <label>Davr <em>YYYY yoki YYYY-Q1</em><input name="period" value="${y}-Q1"></label><label>Turi<select name="kind">${opt("up", "Yuqori oqim")}${opt("down", "Quyi oqim")}</select></label>
        <label>Summa, so'm<input name="amountUzs" type="number" min="0" step="any" required></label><label>Qaytarish, so'm<input name="rebateUzs" type="number" min="0" step="any"></label>
        <label>Qamrab olingan emissiya, t<input name="coveredT" type="number" min="0" step="any"></label><label>Byudjet kodi<input name="budgetCode"></label>
      </div><div class="row"><button class="btn" type="submit">Saqlash</button></div></form></details>` : ""}</section>
    ${bulletin ? `<section class="panel"><h2>Uglerod soliqi choraklik byulleteni (Strategiya 5.4)</h2>
      <dl class="kv"><dt>To'langan</dt><dd>${fmt(bulletin.paidUzs / 1e6, 1)} mln so'm</dd><dt>Hisoblangan (yuqori oqim)</dt><dd>${fmt(bulletin.estimatedDueUzs / 1e6, 1)} mln so'm</dd><dt>Yig'iluvchanlik</dt><dd>${pct(bulletin.collection, 1)} (maqsad ${pct(bulletin.collectionTarget)})</dd></dl>
      ${table([{ h: "Davr", k: "period" }, { h: "Yuqori oqim, so'm", k: "up", num: true }, { h: "Quyi oqim, so'm", k: "down", num: true }, { h: "To'lovlar", k: "payments", num: true }, { h: "Tasdiqlangan", k: "confirmed", num: true }], bulletin.periods)}</section>` : ""}
  </div>`;
  const df = $("#decForm");
  if (df) {
    df.onsubmit = async e => {
      e.preventDefault();
      const q = new URLSearchParams({ ...formData(df), year: y });
      try {
        const d = await get(`/api/tax/declaration?${q}`);
        $("#decOut").innerHTML = `<dl class="kv"><dt>Rejim</dt><dd>${esc(MODE[d.mode])}</dd><dt>Davr</dt><dd>${esc(d.period)}</dd><dt>Yonish emissiyasi</dt><dd>${fmt(d.emComb, 1)} t</dd><dt>Texnologik emissiya</dt><dd>${fmt(d.emProc, 1)} t</dd>
          <dt>Qamrab olingan</dt><dd>${fmt(d.covered, 1)} t</dd><dt>Yuqori oqim (hisoblangan)</dt><dd>${fmt(d.upstreamEstimate)} so'm</dd><dt>Yuqori oqim (to'langan)</dt><dd>${fmt(d.upstreamPaid)} so'm</dd>
          <dt><b>To'lanadi</b></dt><dd><b>${fmt(d.due)} so'm</b> (${fmt(d.dueUsd, 2)} USD)</dd><dt>Qaytarish arizasi (s_feed)</dt><dd>${fmt(d.potentialRefund)} so'm</dd><dt>Byudjet kodi</dt><dd>${esc(d.budgetCode)}</dd></dl>
          ${d.lines.some(l => l.warnings.length) ? `<div class="banner" style="margin-top:8px">${d.lines.flatMap(l => l.warnings).map(esc).join("<br>")}</div>` : ""}
          <details style="margin-top:8px"><summary>Hisob izi</summary>${table([{ h: "Formula", k: "id" }, { h: "Ifoda", k: "formula" }, { h: "Natija", k: "result", num: true }], d.trace)}</details>`;
      } catch (x) { errToast(x); }
    };
    $("#decXml").onclick = () => { const q = new URLSearchParams({ ...formData(df), year: y }); download(`/api/reports/tax-declaration?${q}`).catch(errToast); };
  }
  const eb = $("#effBtn");
  if (eb) eb.onclick = async () => {
    try {
      const r = await get(`/api/tax/effective?installationId=${$("#effInst").value}&year=${y}`);
      $("#effOut").innerHTML = `<dl class="kv"><dt>Rejim</dt><dd>${esc(MODE[r.mode])}</dd><dt>To'lovlar</dt><dd>${r.payments} ta, ${fmt(r.paidUsd, 2)} USD</dd><dt>Qamrab olingan emissiya</dt><dd>${fmt(r.emCovered, 1)} t</dd><dt><b>P_eff</b></dt><dd><b>${fmt(r.pEff, 4)} USD/t CO₂e</b></dd></dl>
        ${table([{ h: "Jarayon", k: "processName" }, { h: "SEE_cov", k: "seeCov", num: true, d: 4 }, { h: "SEE_CBAM", k: "seeCbam", num: true, d: 4 }, { h: "s_cov", v: x => pct(x.sCov, 1), html: true }, { h: "CP_g, USD/t", k: "cpUsdPerT", num: true, d: 4 }], r.processes)}`;
    } catch (x) { errToast(x); }
  };
  const pf = $("#payForm"); if (pf) pf.onsubmit = async e => { e.preventDefault(); try { await post("/api/tax/payments", formData(pf)); toast("To'lov qayd etildi"); route(); } catch (x) { errToast(x); } };
  $$("[data-conf]").forEach(b => b.onclick = async () => { try { await post(`/api/tax/payments/${b.dataset.conf}/confirm`); toast("Tasdiqlandi"); route(); } catch (x) { errToast(x); } });
  const cx = $("#coexBtn"); if (cx) cx.onclick = () => download(`/api/reports/coexistence?year=${y}&format=xlsx`).catch(errToast);
}
