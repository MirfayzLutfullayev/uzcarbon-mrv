/* M1 — reyestr va M2 — monitoring rejasi: korxonalar, inshootlar, jarayonlar, manba oqimlari, hisoblagichlar, importyorlar. */
import { get, post, put, del } from "../api.js";
import { $, $$, esc, fmt, table, toast, errToast, formData, opt, confirmInline, dt } from "../ui.js";
import { route } from "../app.js";

const SL = { measured: "O'lchangan (hisoblagich)", lab: "Laboratoriya tahlili", supplier: "Yetkazib beruvchi", default: "Standart qiymat" };

export default async function (el, params, S) {
  if (params[0]) return detail(el, params[0], S);
  const [insts, ops, imps, vers] = await Promise.all([S.insts(true), get("/api/operators").catch(() => []), get("/api/importers").catch(() => []), get("/api/verifiers").catch(() => [])]);
  const M = S.meta;
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Reyestr</h1><p class="sub">CBAM qamrovidagi eksportyorlar, inshootlar va ishlab chiqarish jarayonlari (M1, FT-1.1 – FT-1.6).</p></div></div>
    ${S.can("operators.create") ? `<section class="panel"><h2>Korxonalar</h2>${table([{ h: "Nomi", k: "name" }, { h: "STIR", v: o => `<span class="mono">${esc(o.stir)}</span>`, html: true }, { h: "OKED", k: "oked" }, { h: "O3CI operator ID", k: "o3ciOperatorId" }], ops)}
      <details style="margin-top:12px"><summary>Yangi korxona (STIR bo'yicha)</summary>
      <form id="opForm" novalidate><div class="fields">
        <label>STIR <em>9 raqam</em><input name="stir" inputmode="numeric" maxlength="9" required></label>
        <label>Nomi<input name="name" required></label><label>OKED<input name="oked"></label><label>Manzil<input name="address"></label>
        <label>O3CI operator ID<input name="o3ciOperatorId"></label><label>Mas'ul shaxs<input name="contactPerson"></label>
        <label>Telefon<input name="contactPhone"></label><label>E-pochta<input name="contactEmail" type="email"></label>
      </div><div class="row"><button class="btn ghost" type="button" id="stirBtn">Soliq bazasidan to'ldirish</button><button class="btn" type="submit">Korxonani qo'shish</button></div></form></details></section>` : ""}
    <section class="panel"><h2>Inshootlar</h2>${table([
      { h: "Inshoot", v: i => `<a href="#/registry/${i.id}"><b>${esc(i.name)}</b></a><br><span class="note">${esc(i.operatorName || "")}</span>`, html: true },
      { h: "Hudud", k: "region" }, { h: "UN/LOCODE", v: i => `<span class="mono">${esc(i.unlocode || "—")}</span>`, html: true },
      { h: "Jarayonlar", v: i => esc(i.processes.map(p => p.name).join(", ") || "—") }, { h: "O3CI ID", k: "o3ciInstallationId" },
    ], insts, { empty: "Inshoot yo'q." })}
    ${S.can("registry.write") ? `<details style="margin-top:12px"><summary>Yangi inshoot</summary><form id="instForm" novalidate><div class="fields">
      <label>Nomi<input name="name" required></label><label>Manzil<input name="address"></label>
      <label>Hudud<select name="region">${M.regions.map(r => opt(r, r)).join("")}</select></label>
      <label>Kenglik <em>37–46</em><input name="lat" type="number" step="any"></label><label>Uzunlik <em>55–74</em><input name="lon" type="number" step="any"></label>
      <label>UN/LOCODE<input name="unlocode" maxlength="5" placeholder="UZTAS"></label><label>Quvvat, t/yil<input name="capacityT" type="number" min="0"></label>
      <label>O3CI installation ID<input name="o3ciInstallationId"></label></div>
      <div class="row"><button class="btn" type="submit">Inshootni qo'shish</button></div></form></details>` : ""}</section>
    ${S.can("registry.write") || imps.length ? `<section class="panel"><h2>EI importyorlari (FT-1.6)</h2>${table([{ h: "Nomi", k: "name" }, { h: "EORI", v: i => `<span class="mono">${esc(i.eori || "—")}</span>`, html: true }, { h: "Mamlakat", k: "country" }, { h: "Shartnoma", k: "contract" }], imps)}
      ${S.can("registry.write") ? `<details style="margin-top:12px"><summary>Yangi importyor</summary><form id="impForm" novalidate><div class="fields">
        <label>Nomi<input name="name" required></label><label>EORI<input name="eori" placeholder="DE123456789012"></label><label>Mamlakat <em>ISO-2</em><input name="country" maxlength="2" placeholder="DE"></label><label>Shartnoma<input name="contract"></label>
      </div><div class="row"><button class="btn" type="submit">Qo'shish</button></div></form></details>` : ""}</section>` : ""}
    <section class="panel"><h2>Akkreditatsiyalangan verifikatorlar (FT-6.1)</h2>${table([{ h: "Tashkilot", k: "name" }, { h: "Akkreditatsiya", k: "accreditationNo" }, { h: "Muddati", k: "accreditedUntil" }, { h: "Holat", v: v => `<span class="pill ${v.active ? "ok" : "hi"}">${v.active ? "amalda" : "muddati tugagan"}</span>`, html: true }, { h: "Tarmoqlar", k: "sectors" }], vers)}
      ${S.can("verifiers.manage") ? `<details style="margin-top:12px"><summary>Yangi verifikator</summary><form id="verForm" novalidate><div class="fields"><label>Nomi<input name="name" required></label><label>Akkreditatsiya raqami<input name="accreditationNo" required></label><label>Muddati<input name="accreditedUntil" type="date" required></label><label>Tarmoqlar<input name="sectors"></label></div><div class="row"><button class="btn" type="submit">Qo'shish</button></div></form></details>` : ""}</section>
  </div>`;
  const bind = (id, url, msg, after) => { const f = $("#" + id); if (f) f.onsubmit = async e => { e.preventDefault(); try { await post(url, formData(f)); toast(msg); await S.insts(true); after ? after() : route(); } catch (x) { errToast(x); } }; };
  bind("opForm", "/api/operators", "Korxona qo'shildi");
  bind("instForm", "/api/installations", "Inshoot qo'shildi");
  bind("impForm", "/api/importers", "Importyor qo'shildi");
  bind("verForm", "/api/verifiers", "Verifikator qo'shildi");
  const sb = $("#stirBtn");
  if (sb) sb.onclick = async () => {
    const f = $("#opForm");
    try { const r = await get(`/api/integrations/stir/${f.stir.value.trim()}`); if (r.name) { f.name.value = r.name; f.oked.value = r.oked || ""; f.address.value = r.address || ""; } toast(r.note || `Manba: ${r.source}`); } catch (x) { errToast(x); }
  };
}

async function detail(el, instId, S) {
  const [inst, plans] = await Promise.all([get(`/api/installations/${instId}`), get(`/api/installations/${instId}/plans`).catch(() => [])]);
  const M = S.meta, w = S.can("registry.write"), pw = S.can("plan.write");
  const fuels = (await get("/api/refdata?prefix=fuel.").catch(() => [])).map(r => [r.key.slice(5), r.value.name + " (" + r.value.unit + ")"]);
  const mats = (await get("/api/refdata?prefix=material.").catch(() => [])).map(r => [r.key.slice(9), r.value.name]);
  const allProcs = (await S.insts()).flatMap(i => i.processes.map(p => [p.id, `${i.name} — ${p.name}`]));
  const streamRow = s => `<tr><td><b>${esc(s.name)}</b>${s.active ? "" : ' <span class="pill lo">nofaol</span>'}<br><span class="note">${esc(M.streamTypes[s.type] || s.type)}${s.fuelKey ? " · " + esc(s.fuelKey) : ""}${s.materialKey ? " · " + esc(s.materialKey) : ""}${s.gas ? " · " + esc(s.gas) : ""}</span></td>
    <td>${esc(s.unit || "—")}</td><td>${esc(s.method || "—")}</td><td>${esc(SL[s.sourceLevel] || "—")}</td>
    <td class="mono">${[s.ef != null ? "EF " + s.ef : "", s.ncv != null ? "NCV " + s.ncv : "", s.carbon != null ? "C " + s.carbon : "", s.efSource ? "EF manba: " + s.efSource : "", s.precursorSource ? "prekursor: " + s.precursorSource : "", s.supplierSeeDir != null ? "SEE " + s.supplierSeeDir + "/" + (s.supplierSeeInd ?? 0) : "", s.precursorTif ? "TIF " + s.precursorTif : ""].filter(Boolean).join("; ") || "—"}</td>
    <td>${pw ? `<button class="btn ghost small" data-toggle="${s.id}" data-active="${s.active ? 1 : 0}">${s.active ? "Nofaol qilish" : "Faollashtirish"}</button> <button class="btn danger small" data-sdel="${s.id}">O'chirish</button>` : ""}</td></tr>`;
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>${esc(inst.name)}</h1><p class="sub">${esc(inst.operatorName || "")} · ${esc(inst.region || "")} · UN/LOCODE <span class="mono">${esc(inst.unlocode || "—")}</span> · O3CI <span class="mono">${esc(inst.o3ciInstallationId || "—")}</span></p></div>
      <div class="row"><a class="btn ghost" href="#/registry">← Reyestr</a></div></div>
    ${inst.processes.map(p => `<section class="panel"><h2>${esc(p.name)} <span class="pill ok">${esc(M.goodsGroups[p.goodsGroup]?.name || p.goodsGroup)}</span></h2>
      <dl class="kv"><dt>TIF TN</dt><dd>${esc(p.tifCode || "—")}</dd><dt>Ishlab chiqarish yo'nalishi</dt><dd>${esc(p.route || "—")}</dd><dt>Tizim chegarasi</dt><dd>${esc(p.boundary || "—")}</dd><dt>Eksport narxi</dt><dd>${p.exportPriceUsd ? fmt(p.exportPriceUsd) + " USD/t" : "—"}</dd></dl>
      <h3 style="margin:14px 0 8px">Manba oqimlari (monitoring rejasi)</h3>
      ${p.streams.length ? `<div class="tablewrap"><table><thead><tr><th>Oqim</th><th>Birlik</th><th>Usul</th><th>Manba darajasi</th><th>Parametrlar</th><th></th></tr></thead><tbody>${p.streams.map(streamRow).join("")}</tbody></table></div>`
        : `<div class="empty">Manba oqimlari yo'q.${pw ? ` <button class="btn small" data-tpl="${p.id}">Tarmoq shablonini qo'llash</button>` : ""}</div>`}
      ${pw ? `<details style="margin-top:10px"><summary>Manba oqimi qo'shish</summary><form data-stream="${p.id}" novalidate><div class="fields">
        <label>Nomi<input name="name" required></label>
        <label>Turi<select name="type">${Object.entries(M.streamTypes).map(([k, v]) => opt(k, v)).join("")}</select></label>
        <label>Usul<select name="method"><option value="">—</option>${opt("calculation", "Hisoblash")}${opt("mass_balance", "Massa balansi")}${opt("measurement", "O'lchash (CEMS)")}</select></label>
        <label>Birlik<select name="unit"><option value="">—</option>${["t", "m3", "1000m3", "MWh", "TJ", "t CO2e"].map(u => opt(u, u)).join("")}</select></label>
        <label>Manba darajasi<select name="sourceLevel"><option value="">—</option>${Object.entries(SL).map(([k, v]) => opt(k, v)).join("")}</select></label>
        <label>Yoqilg'i<select name="fuelKey"><option value="">—</option>${fuels.map(([k, v]) => opt(k, v)).join("")}</select></label>
        <label>Material<select name="materialKey"><option value="">—</option>${mats.map(([k, v]) => opt(k, v)).join("")}</select></label>
        <label>Gaz<select name="gas"><option value="">—</option>${["CO2", "N2O", "CF4", "C2F6"].map(g => opt(g, g)).join("")}</select></label>
        <label>EF <em>t CO₂/TJ, t/t yoki t/MWh</em><input name="ef" type="number" step="any" min="0"></label>
        <label>NCV <em>GJ/birlik</em><input name="ncv" type="number" step="any" min="0"></label>
        <label>Uglerod ulushi <em>0..1</em><input name="carbon" type="number" step="any" min="0" max="1"></label>
        <label>Elektr EF manbasi<select name="efSource"><option value="">—</option>${opt("grid", "Tarmoq")}${opt("ppa", "PPA")}${opt("direct", "To'g'ridan-to'g'ri ulanish")}${opt("own", "O'z generatsiyasi")}</select></label>
        <label>Prekursor manbasi<select name="precursorSource"><option value="">—</option>${opt("internal", "Ichki jarayon")}${opt("supplier", "Yetkazib beruvchi")}${opt("default", "Standart qiymat")}</select></label>
        <label>Ichki prekursor jarayoni<select name="precursorProcessId"><option value="">—</option>${allProcs.filter(([id]) => id !== p.id).map(([k, v]) => opt(k, v)).join("")}</select></label>
        <label>Prekursor TIF TN<input name="precursorTif" maxlength="10"></label>
        <label>Yetkazib beruvchi SEE (to'g'ridan-to'g'ri)<input name="supplierSeeDir" type="number" step="any" min="0"></label>
        <label>Yetkazib beruvchi SEE (bilvosita)<input name="supplierSeeInd" type="number" step="any" min="0"></label>
      </div><div class="row"><button class="btn" type="submit">Oqimni qo'shish</button></div></form></details>` : ""}
      ${w ? `<div class="row" style="margin-top:10px"><button class="btn danger small" data-pdel="${p.id}">Jarayonni o'chirish</button></div>` : ""}
    </section>`).join("")}
    ${w ? `<section class="panel"><h2>Yangi ishlab chiqarish jarayoni (FT-1.3)</h2><form id="procForm" novalidate><div class="fields">
      <label>Nomi<input name="name" required></label>
      <label>Tovar guruhi<select name="goodsGroup">${Object.entries(M.goodsGroups).map(([k, v]) => opt(k, v.name)).join("")}</select></label>
      <label>TIF TN <em>10 raqam</em><input name="tifCode" maxlength="10" inputmode="numeric"></label>
      <label>Ishlab chiqarish yo'nalishi<input name="route"></label><label>Tizim chegarasi<input name="boundary"></label>
      <label>Eksport narxi, USD/t<input name="exportPriceUsd" type="number" min="0" step="any"></label>
    </div><div class="row"><button class="btn" type="submit">Jarayon qo'shish</button></div></form></section>` : ""}
    <section class="panel"><h2>Hisoblagichlar va kalibrovka (D6)</h2>${table([{ h: "Seriya", k: "serial" }, { h: "Turi", k: "type" }, { h: "Kalibrovka", k: "calibrationDate" }, { h: "Noaniqlik, %", k: "uncertainty", num: true, d: 2 }], inst.meters)}
      ${pw ? `<details style="margin-top:10px"><summary>Hisoblagich qo'shish</summary><form id="meterForm" novalidate><div class="fields"><label>Seriya raqami<input name="serial" required></label><label>Turi<input name="type"></label><label>Kalibrovka sanasi<input name="calibrationDate" type="date"></label><label>Noaniqlik, %<input name="uncertainty" type="number" step="any" min="0" max="100"></label></div><div class="row"><button class="btn" type="submit">Qo'shish</button></div></form></details>` : ""}</section>
    <section class="panel"><h2>Monitoring rejasi versiyalari (M2.3)</h2>${table([{ h: "Versiya", k: "version", num: true }, { h: "Holat", v: x => `<span class="pill ${x.status === "approved" ? "ok" : x.status === "rejected" ? "hi" : "mid"}">${esc({ draft: "qoralama", submitted: "verifikatorda", approved: "tasdiqlangan", rejected: "rad etilgan" }[x.status])}</span>`, html: true },
      { h: "Yaratilgan", v: x => dt(x.createdAt) }, { h: "Jarayonlar / oqimlar", v: x => `${x.snapshot.length} / ${x.snapshot.reduce((a, p) => a + p.streams.length, 0)}` }, { h: "Izoh", v: x => x.decisionNote || x.note || "" },
      { h: "", v: x => (x.status === "draft" && S.can("plan.submit") ? `<button class="btn small" data-psubmit="${x.id}">Verifikatorga yuborish</button>` : x.status === "submitted" && S.can("plan.decide") ? `<button class="btn small" data-pdecide="${x.id}" data-d="approved">Tasdiqlash</button> <button class="btn danger small" data-pdecide="${x.id}" data-d="rejected">Rad etish</button>` : ""), html: true }], plans, { empty: "Reja versiyasi yo'q." })}
      ${pw ? `<div class="row" style="margin-top:10px"><button class="btn ghost" id="planNew">Joriy oqimlardan yangi versiya yaratish</button></div>` : ""}</section>
  </div>`;
  const reload = async () => { await S.insts(true); route(); };
  $$("[data-tpl]").forEach(b => b.onclick = async () => { try { await post(`/api/processes/${b.dataset.tpl}/apply-template`); toast("Shablon qo'llandi"); reload(); } catch (x) { errToast(x); } });
  $$("form[data-stream]").forEach(f => f.onsubmit = async e => { e.preventDefault(); try { await post("/api/streams", { ...formData(f), processId: f.dataset.stream }); toast("Oqim qo'shildi"); reload(); } catch (x) { errToast(x); } });
  $$("[data-toggle]").forEach(b => b.onclick = async () => { try { await put(`/api/streams/${b.dataset.toggle}`, { active: b.dataset.active !== "1" }); reload(); } catch (x) { errToast(x); } });
  $$("[data-sdel]").forEach(b => b.onclick = () => confirmInline(b, "Oqim o'chirilsinmi?", async () => { try { await del(`/api/streams/${b.dataset.sdel}`); toast("O'chirildi"); reload(); } catch (x) { errToast(x); } }));
  $$("[data-pdel]").forEach(b => b.onclick = () => confirmInline(b, "Jarayon o'chirilsinmi?", async () => { try { await del(`/api/processes/${b.dataset.pdel}`); toast("O'chirildi"); reload(); } catch (x) { errToast(x); } }));
  const pf = $("#procForm"); if (pf) pf.onsubmit = async e => { e.preventDefault(); try { await post("/api/processes", { ...formData(pf), installationId: instId }); toast("Jarayon qo'shildi"); reload(); } catch (x) { errToast(x); } };
  const mf = $("#meterForm"); if (mf) mf.onsubmit = async e => { e.preventDefault(); try { await post("/api/meters", { ...formData(mf), installationId: instId }); toast("Hisoblagich qo'shildi"); reload(); } catch (x) { errToast(x); } };
  const pn = $("#planNew"); if (pn) pn.onclick = async () => { try { await post(`/api/installations/${instId}/plans`, {}); toast("Yangi versiya yaratildi"); route(); } catch (x) { errToast(x); } };
  $$("[data-psubmit]").forEach(b => b.onclick = async () => { try { await post(`/api/plans/${b.dataset.psubmit}/submit`); toast("Yuborildi"); route(); } catch (x) { errToast(x); } });
  $$("[data-pdecide]").forEach(b => b.onclick = async () => { try { await post(`/api/plans/${b.dataset.pdecide}/decide`, { decision: b.dataset.d }); toast("Qaror saqlandi"); route(); } catch (x) { errToast(x); } });
}
