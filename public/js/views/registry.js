/* Reyestr va monitoring rejasi: korxonalar, inshootlar, jarayonlar, manba oqimlari, hisoblagichlar, importyorlar, verifikatorlar. */
import { get, post, put, del } from "../api.js";
import { $, $$, esc, fmt, table, toast, errToast, formData, opt, confirmInline, dt } from "../ui.js";
import { route } from "../app.js";

/* ---------- Ma'lumotnomalar (forma va jadval uchun bir xil nomlar) ---------- */
const SL = { measured: "O'lchangan (hisoblagich)", lab: "Laboratoriya tahlili", supplier: "Yetkazib beruvchi", default: "Standart qiymat" };
const METHOD = { calculation: "Hisoblash", mass_balance: "Massa balansi", measurement: "O'lchash (CEMS)" };
const EFS = { grid: "Tarmoq", ppa: "PPA", direct: "To'g'ridan-to'g'ri ulanish", own: "O'z generatsiyasi" };
const PRS = { internal: "Ichki jarayon", supplier: "Yetkazib beruvchi", default: "Standart qiymat" };
const PLAN = { draft: ["Qoralama", "lo"], submitted: ["Verifikatorda", "mid"], approved: ["Tasdiqlangan", "ok"], rejected: ["Rad etilgan", "hi"] };
const UNITS = ["t", "m3", "1000m3", "MWh", "TJ", "t CO2e"];
const GASES = ["CO2", "N2O", "CF4", "C2F6"];

/* ---------- Kichik yordamchilar ---------- */
const dash = v => (v == null || v === "" ? "—" : v);
const dec = v => String(v).replace(".", ",");
const day = s => (s ? String(s).slice(0, 10) : "—");
const mono = v => (v == null || v === "" ? "—" : `<span class="mono">${esc(v)}</span>`);
const opts = obj => Object.entries(obj).map(([k, v]) => opt(k, v)).join("");
const BLANK = `<option value="">Tanlanmagan</option>`;
const kv = rows => `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
const kpi = (label, value, note, mod = "") => `<div class="kpi${mod ? " " + mod : ""}"><span class="l">${esc(label)}</span><span class="v">${value}</span><span class="n">${esc(note)}</span></div>`;
const openBtn = (target, label, cls = "btn") => `<button class="${cls}" type="button" data-open="${target}">${esc(label)}</button>`;
const emptyBox = (text, action = "") => `<div class="empty"><div class="stack"><span>${esc(text)}</span>${action ? `<div>${action}</div>` : ""}</div></div>`;
const planPill = st => { const [n, c] = PLAN[st] || [st, "lo"]; return `<span class="pill ${c}">${esc(n)}</span>`; };

/** "Qo'shish" tugmalari: yopiq formani ochadi va birinchi maydonga fokus beradi. */
function bindOpen() {
  $$("[data-open]").forEach(b => b.onclick = () => {
    const d = document.getElementById(b.dataset.open);
    if (!d) return;
    d.open = true;
    const f = d.querySelector("input, select, textarea");
    if (f) f.focus(); else d.scrollIntoView({ block: "start" });
  });
}

/* ================= Reyestr ro'yxati ================= */
export default async function (el, params, S) {
  if (params[0]) return detail(el, params[0], S);
  const [insts, ops, imps, vers] = await Promise.all([S.insts(true), get("/api/operators").catch(() => []), get("/api/importers").catch(() => []), get("/api/verifiers").catch(() => [])]);
  const M = S.meta, w = S.can("registry.write"), oc = S.can("operators.create"), vm = S.can("verifiers.manage");
  const groupName = g => M.goodsGroups[g]?.name || g;
  const procs = insts.flatMap(i => i.processes);
  const groups = [...new Set(procs.map(p => groupName(p.goodsGroup)))];
  const countries = [...new Set(imps.map(i => i.country).filter(Boolean))];
  const activeVers = vers.filter(v => v.active).length;
  const instCount = id => insts.filter(i => i.operatorId === id).length;

  const kpis = `<div class="kpis">
    ${kpi("Inshootlar", fmt(insts.length), ops.length > 1 ? `${ops.length} ta korxonaga tegishli` : ops[0]?.name || "Korxona biriktirilmagan")}
    ${kpi("Ishlab chiqarish jarayonlari", fmt(procs.length), groups.length ? groups.join(", ") : "Jarayonlar hali qo'shilmagan")}
    ${kpi("EI importyorlari", fmt(imps.length), countries.length ? `Mamlakatlar: ${countries.join(", ")}` : "Importyorlar hali qo'shilmagan")}
    ${kpi("Amaldagi verifikatorlar", fmt(activeVers), !vers.length ? "Reyestr bo'sh" : activeVers === vers.length ? "Barcha akkreditatsiyalar amalda" : `Jami ${vers.length}, muddati tugagan: ${vers.length - activeVers}`, vers.length && activeVers === vers.length ? "ok" : vers.length ? "hl" : "")}
  </div>`;

  /* --- Korxonalar --- */
  const opsTable = table([
    { h: "Korxona", v: o => `<b>${esc(o.name)}</b>${o.address ? `<span class="cell-sub">${esc(o.address)}</span>` : ""}`, html: true },
    { h: "STIR", v: o => mono(o.stir), html: true },
    { h: "OKED", k: "oked" },
    { h: "Inshootlar", v: o => instCount(o.id), num: true },
    { h: "O3CI operator ID", v: o => mono(o.o3ciOperatorId), html: true },
    { h: "Mas'ul shaxs", v: o => (o.contactPerson ? `${esc(o.contactPerson)}${o.contactPhone || o.contactEmail ? `<span class="cell-sub">${esc([o.contactPhone, o.contactEmail].filter(Boolean).join(", "))}</span>` : ""}` : "—"), html: true },
  ], ops);
  const opForm = `<details id="opNew"><summary>Yangi korxonani ro'yxatga olish</summary>
    <form id="opForm" novalidate>
      <fieldset><legend>Soliq to'lovchi ma'lumotlari</legend><div class="stack">
        <span class="note">STIR kiriting va "Soliq bazasidan to'ldirish" tugmasini bosing: nomi, OKED va manzil avtomatik to'ldiriladi.</span>
        <div class="fields">
          <label>STIR <em>9 raqam, majburiy</em><input name="stir" inputmode="numeric" maxlength="9" required autocomplete="off"></label>
          <label>Korxona nomi <em>majburiy</em><input name="name" required></label>
          <label>OKED <em>masalan, 23.51</em><input name="oked"></label>
          <label>Yuridik manzil<input name="address"></label>
        </div>
        <div class="row"><button class="btn ghost" type="button" id="stirBtn">Soliq bazasidan to'ldirish</button></div>
      </div></fieldset>
      <fieldset><legend>Mas'ul shaxs</legend><div class="fields">
        <label>F.I.Sh.<input name="contactPerson" autocomplete="name"></label>
        <label>Telefon <em>+998 …</em><input name="contactPhone" type="tel" autocomplete="tel"></label>
        <label>E-pochta<input name="contactEmail" type="email" autocomplete="email"></label>
      </div></fieldset>
      <details><summary>CBAM reyestri identifikatori</summary><div class="fields">
        <label>O3CI operator ID <em>EI CBAM reyestrida berilgan bo'lsa</em><input name="o3ciOperatorId" autocomplete="off"></label>
      </div></details>
      <div class="row"><button class="btn" type="submit">Korxonani ro'yxatga olish</button></div>
    </form></details>`;
  const opCard = o => `<section class="panel"><h2>Korxona ma'lumotlari</h2><div class="grid2">
      ${kv([["Korxona nomi", esc(o.name)], ["STIR", mono(o.stir)], ["OKED", esc(dash(o.oked))], ["Yuridik manzil", esc(dash(o.address))]])}
      ${kv([["O3CI operator ID", mono(o.o3ciOperatorId)], ["Mas'ul shaxs", esc(dash(o.contactPerson))], ["Telefon", esc(dash(o.contactPhone))], ["E-pochta", esc(dash(o.contactEmail))]])}
    </div></section>`;
  const opsSection = oc
    ? `<section class="panel"><h2>Korxonalar</h2>
        <p class="section-intro">CBAM tovarlarini eksport qiluvchi va platformada ro'yxatdan o'tgan yuridik shaxslar.</p>
        <div class="stack">${ops.length ? opsTable : emptyBox("Korxonalar hali ro'yxatga olinmagan. Birinchi korxonani STIR bo'yicha qo'shing.", openBtn("opNew", "Korxonani qo'shish"))}${opForm}</div></section>`
    : ops.length === 1 ? opCard(ops[0])
    : ops.length ? `<section class="panel"><h2>Korxonalar</h2>${opsTable}</section>` : "";

  /* --- Inshootlar --- */
  const instTable = table([
    { h: "Inshoot", v: i => `<a href="#/registry/${esc(i.id)}"><b>${esc(i.name)}</b></a>${i.operatorName ? `<span class="cell-sub">${esc(i.operatorName)}</span>` : ""}`, html: true },
    { h: "Hudud", v: i => `${esc(dash(i.region))}${i.address ? `<span class="cell-sub">${esc(i.address)}</span>` : ""}`, html: true },
    { h: "Ishlab chiqarish jarayonlari", v: i => (i.processes.length ? `${esc(i.processes.map(p => p.name).join(", "))}<span class="cell-sub">${esc([...new Set(i.processes.map(p => groupName(p.goodsGroup)))].join(", "))}</span>` : `<span class="muted">Jarayon qo'shilmagan</span>`), html: true },
    { h: "UN/LOCODE", v: i => mono(i.unlocode), html: true },
    { h: "Quvvat, t/yil", v: i => i.capacityT, num: true },
    { h: "O3CI ID", v: i => mono(i.o3ciInstallationId), html: true },
  ], insts);
  const instForm = w ? `<details id="instNew"><summary>Yangi inshootni ro'yxatga olish</summary>
    <form id="instForm" novalidate>
      <fieldset><legend>Asosiy ma'lumotlar</legend><div class="fields">
        <label>Inshoot nomi <em>majburiy</em><input name="name" required></label>
        <label>Hudud<select name="region">${M.regions.map(r => opt(r, r)).join("")}</select></label>
        <label>Manzil<input name="address"></label>
        <label>Loyiha quvvati <em>t/yil</em><input name="capacityT" type="number" min="0"></label>
      </div></fieldset>
      <fieldset><legend>Joylashuv</legend><div class="fields">
        <label>Kenglik <em>37–46°</em><input name="lat" type="number" step="any"></label>
        <label>Uzunlik <em>55–74°</em><input name="lon" type="number" step="any"></label>
        <label>UN/LOCODE <em>5 belgi</em><input name="unlocode" maxlength="5" placeholder="UZTAS" autocomplete="off"></label>
      </div></fieldset>
      <details><summary>CBAM reyestri identifikatori</summary><div class="fields">
        <label>O3CI installation ID <em>EI CBAM reyestrida berilgan bo'lsa</em><input name="o3ciInstallationId" autocomplete="off"></label>
      </div></details>
      <div class="row"><button class="btn" type="submit">Inshootni qo'shish</button><span class="note">Inshoot sizning korxonangizga biriktiriladi.</span></div>
    </form></details>` : "";
  const instSection = `<section class="panel"><h2>Inshootlar</h2>
      <p class="section-intro">Ishlab chiqarish maydonchalari. Inshoot nomini bosib, jarayonlar, manba oqimlari va monitoring rejasini oching.</p>
      <div class="stack">${insts.length ? instTable : w
        ? emptyBox("Inshootlar hali ro'yxatga olinmagan. Birinchi inshootni qo'shing, so'ng unga jarayonlar va manba oqimlarini biriktiring.", openBtn("instNew", "Inshoot qo'shish"))
        : emptyBox("Sizga ko'rinadigan inshootlar yo'q. Inshootlarni korxona ekologi ro'yxatga oladi.")}${instForm}</div></section>`;

  /* --- EI importyorlari --- */
  const impSection = w || imps.length ? `<section class="panel"><h2>EI importyorlari</h2>
      <p class="section-intro">Mahsulotni Yevropa Ittifoqiga olib kiruvchi deklarantlar. Eksportyor hujjatlar paketi shu importyorlar uchun tayyorlanadi.</p>
      <div class="stack">${imps.length ? table([
        { h: "Importyor", v: i => `<b>${esc(i.name)}</b>`, html: true },
        { h: "EORI raqami", v: i => mono(i.eori), html: true },
        { h: "Mamlakat", k: "country" },
        { h: "Shartnoma", k: "contract" },
      ], imps) : emptyBox("EI importyorlari hali qo'shilmagan. Hujjatlar paketini yuborish uchun importyorni EORI raqami bilan qo'shing.", openBtn("impNew", "Importyor qo'shish"))}
      ${w ? `<details id="impNew"><summary>Importyor qo'shish</summary><form id="impForm" novalidate><div class="fields">
        <label>Kompaniya nomi <em>majburiy</em><input name="name" required></label>
        <label>EORI raqami <em>mamlakat kodi va 15 tagacha belgi</em><input name="eori" placeholder="DE123456789012" autocomplete="off"></label>
        <label>Mamlakat <em>ISO kodi, 2 harf</em><input name="country" maxlength="2" placeholder="DE" autocomplete="off"></label>
        <label>Shartnoma <em>raqami va sanasi</em><input name="contract"></label>
      </div><div class="row"><button class="btn" type="submit">Importyorni qo'shish</button></div></form></details>` : ""}</div></section>` : "";

  /* --- Verifikatorlar --- */
  const verSection = `<section class="panel"><h2>Akkreditatsiyalangan verifikatorlar</h2>
      <p class="section-intro">Monitoring rejalari va emissiya hisobotlarini tekshirish huquqiga ega tashkilotlar.</p>
      <div class="stack">${vers.length ? table([
        { h: "Tashkilot", v: v => `<b>${esc(v.name)}</b>`, html: true },
        { h: "Akkreditatsiya raqami", v: v => mono(v.accreditationNo), html: true },
        { h: "Amal qilish muddati", v: v => day(v.accreditedUntil) },
        { h: "Holat", v: v => `<span class="pill ${v.active ? "ok" : "hi"}">${v.active ? "Amalda" : "Muddati tugagan"}</span>`, html: true },
        { h: "Tarmoqlar", k: "sectors" },
      ], vers) : vm
        ? emptyBox("Verifikatorlar reyestri bo'sh. Akkreditatsiya guvohnomasi asosida birinchi verifikatorni qo'shing.", openBtn("verNew", "Verifikator qo'shish"))
        : emptyBox("Akkreditatsiyalangan verifikatorlar hali reyestrga kiritilmagan.")}
      ${vm ? `<details id="verNew"><summary>Verifikatorni reyestrga qo'shish</summary><form id="verForm" novalidate><div class="fields">
        <label>Tashkilot nomi <em>majburiy</em><input name="name" required></label>
        <label>Akkreditatsiya raqami <em>majburiy</em><input name="accreditationNo" required autocomplete="off"></label>
        <label>Amal qilish muddati <em>majburiy</em><input name="accreditedUntil" type="date" required></label>
        <label>Tarmoqlar <em>vergul bilan</em><input name="sectors" placeholder="sement, o'g'itlar"></label>
      </div><div class="row"><button class="btn" type="submit">Verifikatorni qo'shish</button></div></form></details>` : ""}</div></section>`;

  const heroAction = oc ? openBtn("opNew", "Korxonani ro'yxatga olish") : w ? openBtn("instNew", "Inshoot qo'shish") : "";
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Reyestr</h1><p class="sub">CBAM qamrovidagi korxonalar, inshootlar, EI importyorlari va akkreditatsiyalangan verifikatorlarning yagona reyestri.</p></div>${heroAction ? `<div class="row">${heroAction}</div>` : ""}</div>
    ${kpis}
    ${opsSection}
    ${instSection}
    ${impSection}
    ${verSection}
  </div>`;
  bindOpen();
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

/* ================= Inshoot kartochkasi ================= */
async function detail(el, instId, S) {
  const [inst, plans] = await Promise.all([get(`/api/installations/${instId}`), get(`/api/installations/${instId}/plans`).catch(() => [])]);
  const M = S.meta, w = S.can("registry.write"), pw = S.can("plan.write");
  const fuels = (await get("/api/refdata?prefix=fuel.").catch(() => [])).map(r => [r.key.slice(5), r.value.name + " (" + r.value.unit + ")"]);
  const mats = (await get("/api/refdata?prefix=material.").catch(() => [])).map(r => [r.key.slice(9), r.value.name]);
  const allProcs = (await S.insts()).flatMap(i => i.processes.map(p => [p.id, `${i.name} — ${p.name}`]));
  const fuelName = Object.fromEntries(fuels), matName = Object.fromEntries(mats), procName = Object.fromEntries(allProcs);
  const groupName = g => M.goodsGroups[g]?.name || g;

  /* --- Ko'rsatkichlar --- */
  const streams = inst.processes.flatMap(p => p.streams);
  const activeN = streams.filter(s => s.active).length;
  const approved = plans.find(x => x.status === "approved"), latest = plans[0];
  const lastCal = inst.meters.map(m => m.calibrationDate).filter(Boolean).sort().pop();
  const planNote = latest && latest !== approved ? `Oxirgi ${latest.version}-versiya: ${(PLAN[latest.status]?.[0] || latest.status).toLowerCase()}`
    : approved ? `Tasdiqlangan: ${day(approved.decidedAt || approved.createdAt)}` : "Reja hali yaratilmagan";
  const kpis = `<div class="kpis">
    ${kpi("Ishlab chiqarish jarayonlari", fmt(inst.processes.length), inst.processes.length ? [...new Set(inst.processes.map(p => groupName(p.goodsGroup)))].join(", ") : "Jarayonlar hali qo'shilmagan", inst.processes.length ? "" : "hl")}
    ${kpi("Faol manba oqimlari", fmt(activeN), streams.length ? `Jami ${streams.length}, nofaol ${streams.length - activeN}` : "Oqimlar hali belgilanmagan", streams.length ? "" : "hl")}
    ${kpi("Hisoblagichlar", fmt(inst.meters.length), inst.meters.length ? `Oxirgi kalibrovka: ${day(lastCal)}` : "Ro'yxatga olinmagan", inst.meters.length ? "" : "hl")}
    ${kpi("Monitoring rejasi", approved ? `${esc(approved.version)}-versiya` : "Tasdiqlanmagan", planNote, approved ? "ok" : "hl")}
  </div>`;

  /* --- Inshoot pasporti --- */
  const coords = inst.lat != null && inst.lon != null ? `${dec(inst.lat)}, ${dec(inst.lon)}` : null;
  const passport = `<section class="panel"><h2>Inshoot ma'lumotlari</h2><div class="grid2">
      ${kv([["Korxona", esc(dash(inst.operatorName))], ["Hudud", esc(dash(inst.region))], ["Manzil", esc(dash(inst.address))], ["Koordinatalar", mono(coords)]])}
      ${kv([["UN/LOCODE", mono(inst.unlocode)], ["O3CI inshoot ID", mono(inst.o3ciInstallationId)], ["Loyiha quvvati", inst.capacityT != null ? `${fmt(inst.capacityT)} t/yil` : "—"], ["Ro'yxatga olingan", esc(day(inst.createdAt))]])}
    </div></section>`;

  /* --- Manba oqimlari jadvali --- */
  const streamSub = s => [M.streamTypes[s.type] || s.type, s.fuelKey && (fuelName[s.fuelKey] || s.fuelKey), s.materialKey && (matName[s.materialKey] || s.materialKey), s.gas].filter(Boolean).join(", ");
  const streamParams = s => [
    s.ef != null && `EF ${dec(s.ef)}`,
    s.ncv != null && `NCV ${dec(s.ncv)} GJ/birlik`,
    s.carbon != null && `Uglerod ulushi ${dec(s.carbon)}`,
    s.efSource && `EF manbasi: ${EFS[s.efSource] || s.efSource}`,
    s.precursorSource && `Prekursor: ${PRS[s.precursorSource] || s.precursorSource}`,
    s.precursorProcessId && `Ichki jarayon: ${procName[s.precursorProcessId] || s.precursorProcessId}`,
    s.precursorTif && `Prekursor TIF TN ${s.precursorTif}`,
    s.supplierSeeDir != null && `Yetkazib beruvchi SEE ${dec(s.supplierSeeDir)} / ${dec(s.supplierSeeInd ?? 0)}`,
  ].filter(Boolean);
  const streamCols = [
    { h: "Manba oqimi", v: s => `<b>${esc(s.name)}</b><span class="cell-sub">${esc(streamSub(s))}</span>`, html: true },
    { h: "Birlik", k: "unit" },
    { h: "Usul", v: s => METHOD[s.method] || dash(s.method) },
    { h: "Ma'lumot manbasi", v: s => SL[s.sourceLevel] || "—" },
    { h: "Parametrlar", v: s => { const a = streamParams(s); return a.length ? a.map(esc).join("<br>") : `<span class="muted">—</span>`; }, html: true },
    { h: "Holat", v: s => (s.active ? `<span class="pill ok">Faol</span>` : `<span class="pill lo">Nofaol</span>`), html: true },
    ...(pw ? [{ h: "Amallar", v: s => `<div class="row"><button class="btn ghost small" type="button" data-toggle="${s.id}" data-active="${s.active ? 1 : 0}">${s.active ? "Nofaol qilish" : "Faollashtirish"}</button><button class="btn danger small" type="button" data-sdel="${s.id}">O'chirish</button></div>`, html: true }] : []),
  ];

  /* --- Manba oqimi qo'shish formasi --- */
  const streamForm = p => `<details><summary>Manba oqimini qo'shish</summary><form data-stream="${p.id}" novalidate>
      <fieldset><legend>Oqim</legend><div class="fields">
        <label>Oqim nomi <em>majburiy</em><input name="name" required></label>
        <label>Oqim turi<select name="type">${opts(M.streamTypes)}</select></label>
        <label>Hisoblash usuli<select name="method">${BLANK}${opts(METHOD)}</select></label>
        <label>O'lchov birligi<select name="unit">${BLANK}${UNITS.map(u => opt(u, u)).join("")}</select></label>
        <label>Ma'lumot manbasi<select name="sourceLevel">${BLANK}${opts(SL)}</select></label>
      </div></fieldset>
      <fieldset><legend>Yoqilg'i, material yoki gaz</legend><div class="stack">
        <span class="note">Oqim turiga mosini tanlang: yoqilg'i yonishi uchun yoqilg'i, texnologik material uchun material, CEMS va boshqa gazlar uchun gaz turi.</span>
        <div class="fields">
          <label>Yoqilg'i<select name="fuelKey">${BLANK}${fuels.map(([k, v]) => opt(k, v)).join("")}</select></label>
          <label>Material<select name="materialKey">${BLANK}${mats.map(([k, v]) => opt(k, v)).join("")}</select></label>
          <label>Gaz<select name="gas">${BLANK}${GASES.map(g => opt(g, g)).join("")}</select></label>
        </div>
      </div></fieldset>
      <fieldset><legend>Emissiya koeffitsiyentlari</legend><div class="stack">
        <span class="note">Bo'sh qoldirilsa, ma'lumotnomadagi qiymat qo'llanadi. PPA yoki to'g'ridan-to'g'ri ulanishda elektr EF ni albatta kiriting.</span>
        <div class="fields">
          <label>EF <em>t CO₂/TJ, t/t yoki t/MWh</em><input name="ef" type="number" step="any" min="0"></label>
          <label>NCV <em>GJ/birlik</em><input name="ncv" type="number" step="any" min="0"></label>
          <label>Uglerod ulushi <em>0–1, massa balansi uchun</em><input name="carbon" type="number" step="any" min="0" max="1"></label>
          <label>Elektr EF manbasi<select name="efSource">${BLANK}${opts(EFS)}</select></label>
        </div>
      </div></fieldset>
      <details><summary>Prekursor parametrlari</summary><div class="stack">
        <span class="note">Faqat "Prekursor" turidagi oqim uchun to'ldiriladi.</span>
        <div class="fields">
          <label>Prekursor manbasi<select name="precursorSource">${BLANK}${opts(PRS)}</select></label>
          <label>Ichki prekursor jarayoni<select name="precursorProcessId">${BLANK}${allProcs.filter(([id]) => id !== p.id).map(([k, v]) => opt(k, v)).join("")}</select></label>
          <label>Prekursor TIF TN <em>10 raqam</em><input name="precursorTif" maxlength="10" inputmode="numeric" autocomplete="off"></label>
          <label>Yetkazib beruvchi SEE, to'g'ridan-to'g'ri <em>t CO₂e/t</em><input name="supplierSeeDir" type="number" step="any" min="0"></label>
          <label>Yetkazib beruvchi SEE, bilvosita <em>t CO₂e/t</em><input name="supplierSeeInd" type="number" step="any" min="0"></label>
        </div>
      </div></details>
      <div class="row"><button class="btn" type="submit">Oqimni qo'shish</button></div>
    </form></details>`;

  /* --- Jarayon paneli --- */
  const procPanel = p => {
    const act = p.streams.filter(s => s.active).length;
    return `<section class="panel"><h2><span>${esc(p.name)}</span><span class="unit">${esc(groupName(p.goodsGroup))}</span></h2>
      <div class="stack">
        <div class="grid2">
          ${kv([["TIF TN kodi", mono(p.tifCode)], ["Ishlab chiqarish yo'nalishi", esc(dash(p.route))]])}
          ${kv([["Tizim chegarasi", esc(dash(p.boundary))], ["Eksport narxi", p.exportPriceUsd ? `${fmt(p.exportPriceUsd)} USD/t` : "—"]])}
        </div>
        <div class="toolbar"><h3>Manba oqimlari</h3>${p.streams.length ? `<span class="note">${p.streams.length} ta oqim, faol: ${act}</span>` : ""}</div>
        ${p.streams.length ? table(streamCols, p.streams)
          : pw ? emptyBox("Bu jarayon uchun manba oqimlari hali belgilanmagan. Tarmoq shablonini qo'llang yoki oqimlarni quyida qo'lda qo'shing.", `<button class="btn" type="button" data-tpl="${p.id}">Tarmoq shablonini qo'llash</button>`)
          : emptyBox("Manba oqimlari hali belgilanmagan. Ularni korxona ekologi monitoring rejasi orqali qo'shadi.")}
        ${pw ? streamForm(p) : ""}
        ${w ? `<div class="toolbar"><span class="note">Faoliyat ma'lumotlari yoki saqlangan hisob natijalari bor jarayonni o'chirib bo'lmaydi.</span><button class="btn danger small" type="button" data-pdel="${p.id}">Jarayonni o'chirish</button></div>` : ""}
      </div></section>`;
  };
  const procForm = w ? `<details id="procNew"><summary>Ishlab chiqarish jarayonini qo'shish</summary>
    <form id="procForm" novalidate>
      <fieldset><legend>Tovar</legend><div class="fields">
        <label>Jarayon nomi <em>majburiy</em><input name="name" required></label>
        <label>Tovar guruhi<select name="goodsGroup">${Object.entries(M.goodsGroups).map(([k, v]) => opt(k, v.name)).join("")}</select></label>
        <label>TIF TN kodi <em>10 raqam</em><input name="tifCode" maxlength="10" inputmode="numeric" autocomplete="off"></label>
        <label>Eksport narxi <em>USD/t</em><input name="exportPriceUsd" type="number" min="0" step="any"></label>
      </div></fieldset>
      <fieldset><legend>Texnologiya</legend><div class="fields">
        <label>Ishlab chiqarish yo'nalishi <em>masalan, quruq usul</em><input name="route"></label>
        <label>Tizim chegarasi <em>qaysi bosqichlar kiradi</em><input name="boundary"></label>
      </div></fieldset>
      <div class="row"><button class="btn" type="submit">Jarayonni qo'shish</button></div>
    </form></details>` : "";
  const procSection = `<div class="toolbar"><h2>Ishlab chiqarish jarayonlari</h2><span class="note">${inst.processes.length ? `${inst.processes.length} ta jarayon, ${streams.length} ta manba oqimi` : ""}</span></div>
    ${inst.processes.length ? inst.processes.map(procPanel).join("")
      : `<section class="panel">${w ? emptyBox("Inshootda hali ishlab chiqarish jarayoni yo'q. Jarayonni qo'shing, so'ng unga manba oqimlarini biriktiring.", openBtn("procNew", "Jarayonni qo'shish")) : emptyBox("Inshootda ishlab chiqarish jarayonlari hali ro'yxatga olinmagan.")}</section>`}
    ${procForm}`;

  /* --- Hisoblagichlar --- */
  const meterSection = `<section class="panel"><h2>Hisoblagichlar va kalibrovka</h2>
      <p class="section-intro">Faoliyat ma'lumotlarini o'lchaydigan asboblar. Kalibrovka sanasi va noaniqlik verifikatsiyada tekshiriladi.</p>
      <div class="stack">${inst.meters.length ? table([
        { h: "Seriya raqami", v: m => mono(m.serial), html: true },
        { h: "Turi", k: "type" },
        { h: "Kalibrovka sanasi", v: m => day(m.calibrationDate) },
        { h: "Noaniqlik, %", k: "uncertainty", num: true, d: 2 },
      ], inst.meters) : pw ? "" : emptyBox("Hisoblagichlar hali ro'yxatga olinmagan.")}
      ${pw ? `<details id="meterNew"${inst.meters.length ? "" : " open"}><summary>Hisoblagich qo'shish</summary>
        ${inst.meters.length ? "" : `<p class="note" style="margin-top:-4px">Hisoblagichlar hali ro'yxatga olinmagan. O'lchanadigan oqimlar uchun hisoblagich va uning kalibrovka sanasini kiriting.</p>`}<form id="meterForm" novalidate><div class="fields">
        <label>Seriya raqami <em>majburiy</em><input name="serial" required autocomplete="off"></label>
        <label>Turi <em>masalan, gaz hisoblagichi</em><input name="type"></label>
        <label>Kalibrovka sanasi<input name="calibrationDate" type="date"></label>
        <label>Noaniqlik <em>%</em><input name="uncertainty" type="number" step="any" min="0" max="100"></label>
      </div><div class="row"><button class="btn" type="submit">Hisoblagichni qo'shish</button></div></form></details>` : ""}</div></section>`;

  /* --- Monitoring rejasi versiyalari --- */
  const planActions = x => (x.status === "draft" && S.can("plan.submit") ? `<button class="btn small" type="button" data-psubmit="${x.id}">Verifikatorga yuborish</button>`
    : x.status === "submitted" && S.can("plan.decide") ? `<div class="row"><button class="btn small" type="button" data-pdecide="${x.id}" data-d="approved">Tasdiqlash</button><button class="btn danger small" type="button" data-pdecide="${x.id}" data-d="rejected">Rad etish</button></div>` : "");
  const planSection = `<section class="panel"><h2>Monitoring rejasi versiyalari</h2>
      <div class="stack">
        <div class="toolbar"><span class="note">Har bir versiya joriy jarayonlar va manba oqimlarining nusxasi. Qoralamani verifikatorga yuboring: tasdiqlangan versiya hisob-kitoblar uchun asos bo'ladi.</span>${pw ? `<button class="btn ghost" type="button" id="planNew">Yangi versiya yaratish</button>` : ""}</div>
        ${plans.length ? table([
          { h: "Versiya", v: x => `<b>${esc(x.version)}-versiya</b>`, html: true },
          { h: "Holat", v: x => planPill(x.status), html: true },
          { h: "Yaratilgan", v: x => dt(x.createdAt) },
          { h: "Tarkibi", v: x => `${x.snapshot.length} jarayon, ${x.snapshot.reduce((a, p) => a + p.streams.length, 0)} oqim` },
          { h: "Izoh", v: x => x.decisionNote || x.note || "—" },
          ...(plans.some(x => planActions(x)) ? [{ h: "Amallar", v: planActions, html: true }] : []),
        ], plans) : emptyBox(pw ? "Monitoring rejasi hali yaratilmagan. Manba oqimlarini belgilang va \"Yangi versiya yaratish\" tugmasini bosing." : "Monitoring rejasi hali yaratilmagan.")}
      </div></section>`;

  const lede = `${inst.operatorName ? esc(inst.operatorName) + " inshooti" : "Inshoot"}${inst.region ? ", " + esc(inst.region) : ""}. Jarayonlar, manba oqimlari, hisoblagichlar va monitoring rejasi.`;
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>${esc(inst.name)}</h1><p class="sub">${lede}</p></div>
      <div class="row"><a class="btn ghost" href="#/registry">Reyestrga qaytish</a></div></div>
    ${kpis}
    ${passport}
    ${procSection}
    ${meterSection}
    ${planSection}
  </div>`;
  bindOpen();
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
