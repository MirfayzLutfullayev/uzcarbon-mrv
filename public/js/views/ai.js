/*
 * SI tahlil: anomaliyalar va inson qarori, manbalarni solishtirish, emissiya prognozi, dekarbonizatsiya choralari (MACC),
 * normativ yordamchi (manbali javoblar) va SI modellari reyestri. Har bir SI natijasi "AI tavsiyasi" belgisi bilan
 * maslahat sifatida ko'rsatiladi; rasmiy soliq va CBAM summalari faqat deterministik yadroda hisoblanadi.
 */
import { get, post } from "../api.js";
import { $, $$, esc, fmt, pct, dt, table, toast, errToast, sevName, line } from "../ui.js";
import { processPicker, bindPicker, route } from "../app.js";

const chat = [];
let pending = false;

const AI = `<span class="ai-label">AI tavsiyasi</span>`;
const MON = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const monLabel = (y, m) => `${MON[m - 1]} ${String(y).slice(2)}`;
const STATUS = { ishlaydi: ["ok", "Ishlaydi"], qisman: ["mid", "Qisman"], bazaviy: ["mid", "Bazaviy"], rejalashtirilgan: ["lo", "Rejalashtirilgan"] };
const MODE = { extractive: "Tasdiqlangan hujjatlardan parchalar", llm: "Til modeli javobi, manbalar bilan", none: "Manba topilmadi" };
const EXAMPLES = ["Standart qiymatga ustama qancha?", "Milliy uglerod soliqi stavkasi qancha?", "CBAM deklaratsiyasi qachon topshiriladi?", "Bilvosita emissiya qaysi tovarlarga hisoblanadi?"];

/** Omil qiymati: kattaligiga qarab kasr xonalari soni. */
const fv = v => (typeof v === "number" ? fmt(v, Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 4) : esc(v));
const signed = (v, d) => (v > 0 ? "+" : "") + fmt(v, d);
const kpi = (l, v, u, n, cls = "") => `<div class="kpi ${cls}"><span class="l">${l}</span><span class="v">${v}${u ? `<small>${u}</small>` : ""}</span><span class="n">${n}</span></div>`;

/* ---------- Anomaliya kartasi ---------- */
function anomalyCard(a, canDecide) {
  const dec = a.decision;
  const decPill = dec ? `<span class="pill ${dec.status === "confirmed" ? "hi" : "lo"}">${dec.status === "confirmed" ? "Xato tasdiqlangan" : "Asossiz deb topilgan"}</span>` : "";
  return `<article class="sev ${a.sev}">
    <b>${esc(a.title)} <span class="pill ${a.sev}">${sevName[a.sev]}</span>${decPill}</b>
    <span>${esc(a.detail)}</span>
    ${a.factors?.length ? `<dl class="kv">${a.factors.map(f => `<dt>${esc(f.name)}</dt><dd>${fv(f.value)} <span class="muted">(kutilgan: ${fv(f.expected)})</span></dd>`).join("")}</dl>` : ""}
    <ul class="meta">
      <li>Jarayon: <span>${esc(a.processName)}</span></li>
      <li>Davr: <span>${a.month ? `${a.month}-oy, ${a.year}` : `${a.year}-yil, yillik`}</span></li>
      <li>Model: <span>${esc(a.model)} ${esc(a.modelVersion)}</span></li>
      ${dec?.decided_at ? `<li>Qaror sanasi: <span>${esc(dt(dec.decided_at))}</span></li>` : ""}
    </ul>
    ${!dec && canDecide ? `<div class="row" role="group" aria-label="Qaror: ${esc(a.title)}">
      <button class="btn small" type="button" data-dec="confirmed" data-id="${esc(a.id)}" data-p="${esc(a.processId)}">Xatoni tasdiqlash</button>
      <button class="btn ghost small" type="button" data-dec="dismissed" data-id="${esc(a.id)}" data-p="${esc(a.processId)}">Asossiz deb belgilash</button></div>` : ""}
  </article>`;
}

/* ---------- Yordamchi xabarlari (.msg da white-space:pre-wrap — teglar orasida bo'sh joy qoldirilmaydi) ---------- */
function msgHtml(m) {
  if (m.role === "u") return `<div class="msg u"><span class="sr-label">Siz: </span>${esc(m.text)}</div>`;
  if (m.mode === "xato") {
    return `<div class="msg a"><div class="stack"><div><span class="pill hi">Javob olinmadi</span></div><div>${esc(m.text)}</div><div class="note">Savolni qayta yuboring. Muammo takrorlansa, tizim administratoriga murojaat qiling.</div></div></div>`;
  }
  const src = m.sources || [];
  return `<div class="msg a"><div class="stack"><div class="row"><span class="sr-label">Yordamchi: </span><span class="ai-label">${esc(m.label || "AI tavsiyasi")}</span><span class="note">${esc(MODE[m.mode] || m.mode || "")}</span></div><div>${esc(m.text)}</div>${
    src.length ? `<div><div class="note"><b>Manbalar (${src.length})</b></div>${src.map(s => `<div class="src"><div><b>${esc(s.source)}</b> <span class="muted">[${esc(s.id)}]</span></div><div>${esc(s.text)}</div></div>`).join("")}</div>` : ""}</div></div>`;
}
const chatIntro = `<div class="callout"><div class="stack">
    <div><h3>Savol bering</h3><div class="note">Masalan, standart qiymat, uglerod soliqi stavkasi, CBAM muddatlari yoki emissiya formulalari haqida. Namunadan birini tanlashingiz mumkin.</div></div>
    <div class="row">${EXAMPLES.map(q => `<button class="btn ghost small" type="button" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
  </div></div>`;

export default async function (el, _p, S) {
  const y = S.year;
  const hasProc = S.can("calc.read");
  const canAn = hasProc || S.can("tax.read");
  const pick = hasProc ? await processPicker() : { current: null, html: "" };
  const [an, models] = await Promise.all([canAn ? get(`/api/ai/anomalies?year=${y}`).catch(() => []) : Promise.resolve([]), get("/api/ai/models").catch(() => [])]);
  const pid = pick.current?.id;
  const [fc, rec, rcn] = await Promise.all([
    pid ? get(`/api/ai/forecast?processId=${pid}&year=${y}`).catch(() => null) : null,
    pid ? get(`/api/ai/recommendations?processId=${pid}&year=${y}`).catch(() => null) : null,
    S.user.operatorId ? get(`/api/ai/reconcile?operatorId=${S.user.operatorId}&year=${y}`).catch(() => null) : null,
  ]);

  const canDecide = S.can("data.write") || S.can("verification.work");
  const local = models.length ? !!models[0].dataLocal : true;
  const hiN = an.filter(a => a.sev === "hi").length;
  const openN = an.filter(a => !a.decision).length;
  const procN = new Set(an.map(a => a.processId)).size;
  const liveN = models.filter(m => m.status === "ishlaydi").length;
  const procName = pick.current?.name || rec?.processName || "";

  /* ---------- Asosiy ko'rsatkichlar ---------- */
  const tiles = [];
  if (canAn) tiles.push(kpi("Aniqlangan anomaliyalar", an.length, "ta", an.length ? `${hiN} ta yuqori darajali, ${openN} ta ko'rib chiqilmagan` : "Tanlangan yil uchun belgilanmagan", hiN ? "hl" : an.length ? "" : "ok"));
  if (fc) tiles.push(fc.enough
    ? kpi("Emissiya prognozi, 12 oy", fmt(fc.next12Total), "t CO₂e", `O'rtacha o'zgarish ${signed(fc.slopePerMonth, 1)} t CO₂e oyiga`)
    : kpi("Emissiya prognozi, 12 oy", "—", "", "Kamida 6 oylik ma'lumot kerak"));
  if (rec?.items?.length) {
    const best = rec.items.reduce((a, b) => (b.cbamSaving2034Usd > a.cbamSaving2034Usd ? b : a));
    tiles.push(kpi("CBAM tejami salohiyati, 2034", fmt(best.cbamSaving2034Usd), "USD/yil", `Eng katta ta'sir: ${esc(best.name.replace(/\s*\(.*\)\s*$/, ""))}`));
  }
  if (rcn) tiles.push(kpi("Manbalar o'rtasidagi farq", rcn.signals.length, "ta", rcn.signals.length ? "Bojxona va korxona hajmlari 2% dan ko'p farq qiladi" : "Bojxona va korxona hajmlari mos", rcn.signals.length ? "hl" : "ok"));
  if (canAn && tiles.length < 4) tiles.push(kpi("Ko'rib chiqilmagan holatlar", openN, "ta", `${an.length - openN} ta holat bo'yicha qaror qabul qilingan`, openN ? "" : "ok"));
  if (canAn && tiles.length < 4) tiles.push(kpi("Qamrab olingan jarayonlar", procN, "ta", "Anomaliya belgilangan ishlab chiqarish jarayonlari"));
  if (tiles.length && tiles.length < 4) tiles.push(kpi("Ishlayotgan SI modellari", liveN, `/ ${models.length}`, "Qolganlari sinovda yoki rejalashtirilgan"));

  /* ---------- Anomaliyalar ---------- */
  const anSorted = [...an].sort((a, b) => (a.decision ? 1 : 0) - (b.decision ? 1 : 0));
  const anomalies = canAn ? `<section class="panel" aria-labelledby="hAn"><h2 id="hAn">Ma'lumotlardagi anomaliyalar ${AI}</h2>
      <p class="section-intro">${canDecide
        ? "Model oylik ma'lumotlardagi odatiy bo'lmagan qiymatlarni belgilaydi. Har bir holatni ko'rib chiqing: xato tasdiqlansa, ma'lumotni tuzating; asossiz bo'lsa, shunday deb belgilang. Qaror audit jurnalida saqlanadi."
        : "Model korxonalarning oylik ma'lumotlaridagi odatiy bo'lmagan qiymatlarni belgilaydi. Qarorni korxona mutaxassisi yoki verifikator qabul qiladi."}</p>
      ${an.length ? `<div class="list">${anSorted.map(a => anomalyCard(a, canDecide)).join("")}</div>`
        : `<div class="empty"><p>${y}-yil ma'lumotlarida anomaliya aniqlanmadi.</p><p class="note">Yangi oylik ma'lumot kiritilgach tekshiruv avtomatik qayta bajariladi.</p>${S.can("data.read") ? `<a class="btn ghost" href="#/data">Ma'lumotlarni ochish</a>` : ""}</div>`}
    </section>`
    : `<div class="banner info">Korxona darajasidagi anomaliyalar, prognoz va choralar korxona ma'lumotlariga kirish huquqi bor foydalanuvchilarga ko'rsatiladi. Sizga normativ yordamchi va SI modellari reyestri mavjud.</div>`;

  /* ---------- Manbalarni solishtirish ---------- */
  let reconcile = "";
  if (rcn) {
    const rows = Object.entries(rcn.sources || {}).map(([tif, src]) => {
      const customs = src.customs || 0, own = (src.manual || 0) + (src.csv || 0);
      return { tif, customs, own, diff: customs && own ? Math.abs(customs - own) / Math.max(customs, own) : null };
    });
    const state = r => (r.diff == null ? `<span class="pill lo">Bitta manba</span>` : r.diff > 0.02 ? `<span class="pill mid">Farq bor</span>` : `<span class="pill ok">Mos</span>`);
    reconcile = `<section class="panel" aria-labelledby="hRc"><h2 id="hRc">Bojxona va korxona ma'lumotlarini solishtirish ${AI}</h2>
      <p class="section-intro">Eksport hajmi bojxona deklaratsiyalari va korxona yozuvlari bo'yicha TIF TN kodlari kesimida solishtiriladi. 2% dan katta farq tekshiruv uchun belgilanadi.</p>
      <div class="stack">
        ${rcn.signals.length ? `<div class="banner" role="status"><b>Farq aniqlandi.</b> Eksport partiyalarini bojxona deklaratsiyalari bilan solishtiring va tafovutni tuzating yoki izoh qo'shing.<ul>${rcn.signals.map(s => `<li>${esc(s.detail)}</li>`).join("")}</ul></div>` : ""}
        ${rows.length ? table([
          { h: "TIF TN kodi", k: "tif" },
          { h: "Bojxona, t", v: r => r.customs || null, num: true, d: 1 },
          { h: "Korxona, t", v: r => r.own || null, num: true, d: 1 },
          { h: "Farq", v: r => (r.diff == null ? "—" : pct(r.diff, 1)), num: true, html: true },
          { h: "Holat", v: state, html: true },
        ], rows)
          : `<div class="empty"><p>${y}-yil uchun eksport partiyalari hali kiritilmagan.</p><p class="note">Partiyalarni qo'lda kiriting yoki bojxona ma'lumotlarini yuklang, so'ng solishtirish avtomatik bajariladi.</p>${S.can("batches.read") ? `<a class="btn ghost" href="#/batches">Eksport partiyalarini ochish</a>` : ""}</div>`}
        <ul class="meta"><li>Oxirgi tekshiruv: <b>${esc(dt(rcn.checkedAt))}</b></li><li>Chegara: <b>2%</b></li></ul>
      </div></section>`;
  }

  /* ---------- Emissiya prognozi ---------- */
  let forecast = "";
  if (fc) {
    let body;
    if (fc.enough) {
      const last = fc.series[fc.series.length - 1].t.split("-").map(Number);
      const hist = fc.series.slice(-12).map(s => { const [sy, sm] = s.t.split("-").map(Number); return { x: monLabel(sy, sm), y: s.dirEm }; });
      const ahead = fc.next12.map((p, i) => { const k = last[1] + i; return { x: monLabel(last[0] + Math.floor(k / 12), (k % 12) + 1), y: p.value }; });
      const mapeOk = fc.backtestMape != null && fc.backtestMape <= fc.mapeTarget;
      body = `<div class="split">
          <div>${line([{ name: "Haqiqiy emissiya", color: "var(--s1)", points: hist }, { name: "Prognoz", color: "var(--s3)", dash: true, points: ahead }], { unit: "t CO₂e" })}</div>
          <dl class="kv">
            <dt>Keyingi 12 oy, jami</dt><dd>${fmt(fc.next12Total)} t CO₂e</dd>
            <dt>O'rtacha oylik o'zgarish</dt><dd>${signed(fc.slopePerMonth, 1)} t CO₂e</dd>
            ${Number.isFinite(fc.residual) ? `<dt>Oylik noaniqlik (95%)</dt><dd>± ${fmt(1.96 * fc.residual)} t CO₂e</dd>` : ""}
            <dt>Orqaga sinov xatoligi (MAPE)</dt><dd>${fc.backtestMape == null ? "Kamida 9 oy kerak" : `${pct(fc.backtestMape, 1)} <span class="pill ${mapeOk ? "ok" : "mid"}">${mapeOk ? "Mezonga mos" : "Mezondan yuqori"}</span>`}<span class="cell-sub">Mezon: ${pct(fc.mapeTarget)} gacha, oxirgi 3 oy bo'yicha</span></dd>
            <dt>Model</dt><dd>${esc(fc.model)} ${esc(fc.modelVersion)}</dd>
          </dl>
        </div>`;
    } else {
      body = `<div class="empty"><p>Prognoz uchun kamida 6 oylik emissiya ma'lumoti kerak. Hozir ${fc.series?.length || 0} oy kiritilgan.</p>${S.can("data.read") ? `<a class="btn ghost" href="#/data">Oylik ma'lumot kiritish</a>` : ""}</div>`;
    }
    forecast = `<section class="panel" aria-labelledby="hFc"><h2 id="hFc">Emissiya prognozi <span class="row"><span class="unit">t CO₂e oyiga</span>${AI}</span></h2>
      <p class="section-intro">${procName ? `${esc(procName)} jarayonining` : "Jarayonning"} bevosita emissiyasi oylar bo'yicha va keyingi 12 oyga chiziqli trend bahosi. Prognoz rejalashtirish uchun mo'ljallangan, rasmiy hisobotga kirmaydi.</p>
      ${body}</section>`;
  }

  /* ---------- Dekarbonizatsiya choralari (MACC) ---------- */
  const macc = rec ? `<section class="panel" aria-labelledby="hMc"><h2 id="hMc">Dekarbonizatsiya choralari ${AI}</h2>
      <p class="section-intro">Choralar 1 t CO₂e kamaytirish xarajati bo'yicha arzonidan qimmatiga saralangan. CBAM tejami joriy eksport hajmi va EI ETS narxi asosida baholangan; qiymatlar taxminiy, ekspert tasdig'i talab qilinadi.</p>
      <div class="stack">
        ${table([
          { h: "Chora", k: "name" },
          { h: "Kamayish, t CO₂e/yil", v: r => `${fmt(r.reductionT)}<span class="cell-sub">${pct(r.reductionPct, 1)} emissiyadan</span>`, num: true, html: true },
          { h: "SEE pasayishi, t CO₂e/t", k: "seeReduction", num: true, d: 4 },
          { h: "Xarajat, USD/t CO₂e", v: r => `${fmt(r.costUsdPerT)}${r.costUsdPerT < 0 ? `<span class="cell-sub">o'zini qoplaydi</span>` : r.costUsdPerT === 0 ? `<span class="cell-sub">qo'shimcha xarajatsiz</span>` : ""}`, num: true, html: true },
          { h: "CBAM tejami 2030, USD", k: "cbamSaving2030Usd", num: true },
          { h: "CBAM tejami 2034, USD", k: "cbamSaving2034Usd", num: true },
        ], rec.items, { empty: "Bu tarmoq uchun chora-tadbirlar kutubxonasi hali to'ldirilmagan. Uslubiyot administratoriga murojaat qiling." })}
        ${rec.items.length ? `<details><summary>Hisob-kitob formulalari</summary><div class="stack">${rec.items.map(r => `<div><h3>${esc(r.name)}</h3><p class="formula">${esc(r.formula)}</p></div>`).join("")}</div></details>` : ""}
        ${rec.note ? `<p class="note">${esc(rec.note)}</p>` : ""}
      </div></section>` : "";

  /* ---------- Normativ yordamchi ---------- */
  const assistant = `<section class="panel" id="aiAssistant" aria-labelledby="hAs"><h2 id="hAs">Normativ yordamchi ${AI}</h2>
      <p class="section-intro">Uslubiyot, uglerod soliqi va CBAM bo'yicha savol bering. Javob faqat platformadagi tasdiqlangan hujjatlarga (TZ-2, PF-110 Farmoni, CBAM aktlari) tayanadi va har doim manbasi bilan beriladi.</p>
      <div class="stack">
        <div class="chat" id="chatLog" aria-live="polite" aria-label="Yordamchi bilan suhbat"></div>
        <form id="askForm" novalidate>
          <label>Savolingiz<input id="askQ" name="q" placeholder="Masalan: o'g'itlar uchun ustama qancha?" autocomplete="off" maxlength="2000"></label>
          <span class="field-err note" id="askErr" role="alert"></span>
          <div class="toolbar">
            <ul class="meta"><li>Manbasiz javob berilmaydi</li><li>${local ? "Ma'lumot tashqi xizmatga yuborilmaydi" : "Tashqi til modeli buyurtmachi roziligi bilan yoqilgan"}</li></ul>
            <button class="btn" type="submit" id="askBtn">Savolni yuborish</button>
          </div>
        </form>
      </div></section>`;

  /* ---------- Modellar reyestri ---------- */
  const registry = `<section class="panel" aria-labelledby="hMd"><h2 id="hMd">SI modellari reyestri</h2>
      <p class="section-intro">Platformadagi ${models.length} ta SI komponentining usuli, sifat mezoni va joriy versiyasi; ${liveN} tasi ishlamoqda. Mas'ul: ${esc(models[0]?.responsible || "Uslubiyot administratori")}.</p>
      <div class="stack">
        ${table([
          { h: "Komponent", v: m => `${esc(m.name)}<span class="cell-sub">${esc(m.code)}</span>`, html: true },
          { h: "Holat", v: m => { const [c, n] = STATUS[m.status] || ["mid", m.status]; return `<span class="pill ${c}">${esc(n)}</span>`; }, html: true },
          { h: "Usul", k: "method" },
          { h: "Sifat mezoni", k: "target" },
          { h: "Versiya", k: "version" },
        ], models, { empty: "Modellar reyestrini yuklab bo'lmadi. Sahifani yangilang." })}
        <p class="note">${local ? "Ma'lumotlar va modellar O'zbekiston hududida joylashgan, tashqi til modeli o'chirilgan." : "Tashqi til modeli yoqilgan: buning uchun buyurtmachining yozma roziligi talab qilinadi."}</p>
      </div></section>`;

  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>SI tahlil</h1><p class="sub">Sun'iy intellekt ma'lumotlarni tekshirish, prognoz qilish va me'yoriy savollarga javob topishda yordam beradi; yakuniy qarorni mutaxassis qabul qiladi.</p></div>
      <div class="row">${pick.html}<button class="btn ghost" type="button" id="goAsk">Yordamchiga savol berish</button></div></div>
    <div class="callout"><div class="stack">
      <div><h3>SI natijalari maslahat xarakterida</h3><div class="note">${AI} belgisi bilan berilgan natijalar rasmiy hisob emas. Uglerod soliqi va CBAM summalari faqat tasdiqlangan formulalar bo'yicha hisoblanadi, har bir SI xulosasini mutaxassis ko'rib chiqadi.</div></div>
      <ul class="meta"><li>${local ? "Ma'lumotlar O'zbekiston hududida qayta ishlanadi" : "Tashqi til modeli buyurtmachi roziligi bilan yoqilgan"}</li><li>Har bir qaror audit jurnalida qayd etiladi</li><li>Yordamchi faqat tasdiqlangan manbalarga tayanadi</li></ul>
    </div></div>
    ${tiles.length > 1 ? `<div class="kpis">${tiles.join("")}</div>` : ""}
    ${anomalies}
    ${reconcile}
    ${forecast}
    ${macc}
    ${assistant}
    ${registry}
  </div>`;

  if (hasProc) bindPicker();

  const renderChat = () => {
    const log = $("#chatLog");
    if (!log) return;
    log.innerHTML = chat.length || pending
      ? chat.map(msgHtml).join("") + (pending ? `<div class="msg a"><span class="note">Javob tayyorlanmoqda…</span></div>` : "")
      : chatIntro;
    $$("[data-q]", log).forEach(b => b.onclick = () => { const f = $("#askForm"); f.q.value = b.dataset.q; f.requestSubmit(); });
    log.scrollTop = log.scrollHeight;
  };
  renderChat();

  const form = $("#askForm"), err = $("#askErr");
  form.q.oninput = () => { err.textContent = ""; };
  form.onsubmit = async e => {
    e.preventDefault();
    if (pending) return;
    const f = e.target, q = f.q.value.trim();
    if (!q) { err.textContent = "Savol matnini kiriting, masalan: «Standart qiymatga ustama qancha?»."; f.q.focus(); return; }
    err.textContent = "";
    chat.push({ role: "u", text: q }); f.q.value = "";
    const btn = $("#askBtn"); pending = true; if (btn) btn.disabled = true; renderChat();
    try { const r = await post("/api/ai/ask", { question: q, year: y }); chat.push({ role: "a", ...r }); } catch (x) { chat.push({ role: "a", text: x.message, mode: "xato" }); }
    pending = false; if (btn) btn.disabled = false; renderChat();
  };

  $("#goAsk").onclick = () => {
    const q = $("#askQ");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    q.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    q.focus({ preventScroll: true });
  };

  $$("[data-dec]").forEach(b => b.onclick = async () => { try { await post(`/api/ai/anomalies/${b.dataset.id}/decision`, { status: b.dataset.dec, processId: b.dataset.p, year: y }); toast("Qaror saqlandi"); route(); } catch (x) { errToast(x); } });
}
