/* SI tahlil (TZ-2 8-bo'lim): anomaliyalar, prognoz, MACC tavsiyalari, manbalarni moslashtirish, normativ yordamchi, modellar reyestri. */
import { get, post } from "../api.js";
import { $, $$, esc, fmt, pct, table, toast, errToast, sevName, line } from "../ui.js";
import { processPicker, bindPicker, route } from "../app.js";

const chat = [];

export default async function (el, _p, S) {
  const y = S.year;
  const hasProc = S.can("calc.read");
  const pick = hasProc ? await processPicker() : { current: null, html: "" };
  const [an, models] = await Promise.all([hasProc || S.can("tax.read") ? get(`/api/ai/anomalies?year=${y}`).catch(() => []) : Promise.resolve([]), get("/api/ai/models")]);
  const pid = pick.current?.id;
  const [fc, rec, rcn] = await Promise.all([
    pid ? get(`/api/ai/forecast?processId=${pid}&year=${y}`).catch(() => null) : null,
    pid ? get(`/api/ai/recommendations?processId=${pid}&year=${y}`).catch(() => null) : null,
    S.user.operatorId ? get(`/api/ai/reconcile?operatorId=${S.user.operatorId}&year=${y}`).catch(() => null) : null,
  ]);
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>SI tahlil · ${y}</h1><p class="sub">SI hisoblash formulalarini almashtirmaydi: soliq va CBAM summalari faqat deterministik yadroda hisoblanadi. Har bir SI xulosasi "AI tavsiyasi" sifatida ko'rsatiladi va inson tomonidan tasdiqlanadi.</p></div><div class="row">${pick.html}</div></div>
    <section class="panel"><h2>Anomaliyalar (AI-3) <span class="pill ${an.some(a => a.sev === "hi") ? "hi" : an.length ? "mid" : "ok"}">${an.length} ta</span></h2>
      ${an.length ? `<div class="list">${an.map(a => `<div class="sev ${a.sev}"><b><span class="pill ${a.sev}">${sevName[a.sev]}</span> ${esc(a.title)}${a.decision ? ` <span class="pill ${a.decision.status === "confirmed" ? "hi" : "lo"}">${a.decision.status === "confirmed" ? "xato tasdiqlandi" : "rad etildi"}</span>` : ""}</b>
        <span>${esc(a.processName)} — ${esc(a.detail)}</span>
        ${a.factors?.length ? `<span class="note">Omillar: ${a.factors.map(f => `${esc(f.name)} = ${typeof f.value === "number" ? fmt(f.value, 4) : esc(f.value)} (kutilgan ${typeof f.expected === "number" ? fmt(f.expected, 4) : esc(f.expected)})`).join("; ")}</span>` : ""}
        <span class="note">Model: ${esc(a.model)} v${esc(a.modelVersion)}</span>
        ${!a.decision && (S.can("data.write") || S.can("verification.work")) ? `<span class="row"><button class="btn small" data-dec="confirmed" data-id="${a.id}" data-p="${a.processId}">Xato deb tasdiqlash</button><button class="btn ghost small" data-dec="dismissed" data-id="${a.id}" data-p="${a.processId}">Asossiz</button></span>` : ""}</div>`).join("")}</div>` : `<p class="note">Anomaliya topilmadi.</p>`}</section>
    ${fc ? `<section class="panel"><h2>Emissiya prognozi (AI-6) <span class="ai-label">AI tavsiyasi</span></h2>
      ${fc.enough ? `${line([{ name: "Haqiqiy, t CO₂e", color: "var(--s1)", points: fc.series.map(s => ({ x: s.t.slice(2), y: s.dirEm })) }, { name: "Prognoz", color: "var(--s2)", dash: true, points: fc.next12.map((p, i) => ({ x: "+" + (i + 1), y: p.value })) }])}
        <dl class="kv"><dt>Keyingi 12 oy jami</dt><dd>${fmt(fc.next12Total)} t CO₂e</dd><dt>Trend</dt><dd>${fmt(fc.slopePerMonth, 1)} t/oy</dd><dt>Orqaga sinov MAPE (3 oy)</dt><dd>${fc.backtestMape == null ? "—" : pct(fc.backtestMape, 1)} (mezon ≤ ${pct(fc.mapeTarget)})</dd><dt>Model</dt><dd>${esc(fc.model)} v${esc(fc.modelVersion)}</dd></dl>` : `<p class="note">Prognoz uchun kamida 6 oylik ma'lumot kerak.</p>`}</section>` : ""}
    ${rec ? `<section class="panel"><h2>Dekarbonizatsiya tavsiyalari — MACC (AI-7) <span class="ai-label">${esc(rec.items[0]?.label || "AI tavsiyasi")}</span></h2>
      ${table([{ h: "Chora", k: "name" }, { h: "Kamayish, t/yil", k: "reductionT", num: true }, { h: "Ulush", v: r => pct(r.reductionPct, 1), html: true }, { h: "ΔSEE", k: "seeReduction", num: true, d: 4 },
        { h: "Xarajat, USD/t", k: "costUsdPerT", num: true }, { h: "CBAM tejami 2030, USD", k: "cbamSaving2030Usd", num: true }, { h: "CBAM tejami 2034, USD", k: "cbamSaving2034Usd", num: true }], rec.items, { empty: "Bu tarmoq uchun chora-tadbirlar kutubxonasi bo'sh." })}
      <details style="margin-top:8px"><summary>Hisob-kitob asoslari</summary>${rec.items.map(r => `<p class="formula">${esc(r.name)}: ${esc(r.formula)}</p>`).join("")}</details><p class="note">${esc(rec.note)}</p></section>` : ""}
    ${rcn ? `<section class="panel"><h2>Manbalarni moslashtirish (AI-4)</h2>${rcn.signals.length ? `<div class="list">${rcn.signals.map(s => `<div class="sev ${s.sev}"><b>${esc(s.title)}</b><span>${esc(s.detail)}</span></div>`).join("")}</div>` : `<p class="note">Farq 2% dan oshgan manbalar yo'q.</p>`}</section>` : ""}
    <section class="panel"><h2>Normativ yordamchi (AI-8)</h2>
      <p class="note">Javoblar faqat platformadagi tasdiqlangan hujjatlarga (TZ-2, PF-110, CBAM aktlari) tayanadi va manba bilan beriladi. Tashqi LLM sozlamada o'chiq bo'lsa, ma'lumot tashqariga yuborilmaydi va manbali parchalar ko'rsatiladi.</p>
      <div class="chat" id="chatLog"></div>
      <form id="askForm" class="row" style="margin-top:10px" novalidate><input name="q" placeholder="Masalan: o'g'itlar uchun mark-up qancha?" style="flex:1;min-width:240px" autocomplete="off"><button class="btn" type="submit">So'rash</button></form></section>
    <section class="panel"><h2>Modellar reyestri (SI boshqaruvi)</h2>${table([{ h: "Kod", k: "code" }, { h: "Komponent", k: "name" }, { h: "Holat", v: m => `<span class="pill ${m.status === "ishlaydi" ? "ok" : m.status === "rejalashtirilgan" ? "lo" : "mid"}">${esc(m.status)}</span>`, html: true }, { h: "Usul", k: "method" }, { h: "Sifat mezoni", k: "target" }, { h: "Versiya", k: "version" }], models)}
      <p class="note">Ma'lumot va modellar O'zbekiston hududida: ${models[0]?.dataLocal ? "ha (tashqi LLM o'chiq)" : "tashqi LLM yoqilgan — buyurtmachining yozma roziligi talab qilinadi"}.</p></section>
  </div>`;
  if (hasProc) bindPicker();
  const renderChat = () => {
    $("#chatLog").innerHTML = chat.length ? chat.map(m => m.role === "u" ? `<div class="msg u">${esc(m.text)}</div>` :
      `<div class="msg a"><span class="ai-label">${esc(m.label || "AI tavsiyasi")} · ${esc(m.mode)}</span>\n${esc(m.text)}${(m.sources || []).map(s => `<div class="src"><b>${esc(s.source)}</b> [${esc(s.id)}]<br>${esc(s.text)}</div>`).join("")}</div>`).join("") : `<p class="note">Savol bering.</p>`;
  };
  renderChat();
  $("#askForm").onsubmit = async e => {
    e.preventDefault();
    const q = e.target.q.value.trim(); if (!q) return;
    chat.push({ role: "u", text: q }); e.target.q.value = ""; renderChat();
    try { const r = await post("/api/ai/ask", { question: q, year: y }); chat.push({ role: "a", ...r }); } catch (x) { chat.push({ role: "a", text: x.message, mode: "xato" }); }
    renderChat();
  };
  $$("[data-dec]").forEach(b => b.onclick = async () => { try { await post(`/api/ai/anomalies/${b.dataset.id}/decision`, { status: b.dataset.dec, processId: b.dataset.p, year: y }); toast("Qaror saqlandi"); route(); } catch (x) { errToast(x); } });
}
