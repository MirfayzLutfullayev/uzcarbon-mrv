/*
 * SI komponentlari API (TZ-2 8-bo'lim). Har bir xulosa "AI tavsiyasi" sifatida qaytadi; inson qarori ai_log da saqlanadi.
 */
"use strict";
const audit = require("../db/audit");
const { now, newId } = require("../db/db");
const { bad, notFound, forbidden } = require("../http/app");
const { clean, intParam } = require("../http/validate");
const A = require("../services/access");
const anomaly = require("../ai/anomaly");
const advice = require("../ai/advice");
const assistant = require("../ai/assistant");
const { computeProcess } = require("../services/calc");
const { validateEntry, upsertActivity } = require("./data");

/** Modellar reyestri (SI boshqaruvi): versiya, usul, sifat mezoni, holat, mas'ul. */
const MODELS = [
  { code: "AI-1", name: "Hujjatlarni o'qish (OCR + LLM)", status: "rejalashtirilgan", method: "Tesseract OCR + lokal LLM", target: "asosiy maydonlar ≥ 98%", version: "—" },
  { code: "AI-2", name: "TIF TN tasniflash", status: "rejalashtirilgan", method: "tasniflagich + qoidalar", target: "top-1 ≥ 95%", version: "—" },
  { code: "AI-3", name: "Anomaliyalarni aniqlash", status: "ishlaydi", method: "qoidalar + robust SPC (median/MAD) + Isolation Forest", target: "recall ≥ 90%, precision ≥ 70%", version: anomaly.MODEL.version },
  { code: "AI-4", name: "Manbalarni moslashtirish", status: "qisman", method: "bojxona ↔ korxona solishtirish, farq > 2%", target: "har oy avtomatik", version: anomaly.MODEL.version },
  { code: "AI-5", name: "Bo'shliqlarni to'ldirish", status: "ishlaydi", method: "interpolyatsiya + konservativ chegara; tasdiqdan keyin 'taxminiy'", target: "MAPE ≤ 5%", version: anomaly.MODEL.version },
  { code: "AI-6", name: "Emissiya prognozi", status: "bazaviy", method: "chiziqli trend + 95% oraliq, 3 oylik orqaga sinov", target: "MAPE ≤ 10%", version: anomaly.MODEL.version },
  { code: "AI-7", name: "Dekarbonizatsiya tavsiyalari (MACC)", status: "ishlaydi", method: "chora-tadbirlar kutubxonasi (taxminiy)", target: "ekspert bahosi ≥ 80% asosli", version: "1.0.0" },
  { code: "AI-8", name: "Normativ yordamchi (RAG)", status: "ishlaydi", method: "BM25 qidiruv + (ruxsat bo'lsa) LLM, manba havolasi majburiy", target: "≥ 90% to'g'ri, manbasiz javob yo'q", version: "1.0.0" },
  { code: "AI-9", name: "Risk-skoring", status: "ishlaydi", method: "omillar yig'indisi (anomaliyalar, to'liqlik, verifikatsiya, standart ulushi)", target: "har chorakda", version: "1.0.0" },
];

function register(app) {
  const s = app.s, { db, config } = s;

  app.get("/api/ai/models", {}, () => MODELS.map(m => ({ ...m, responsible: "Uslubiyot administratori", dataLocal: !config.AI_EXTERNAL_ALLOWED })));

  app.get("/api/ai/anomalies", { perm: ["calc.read", "tax.read"] }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2020, 2040);
    if (ctx.query.processId) { A.processRow(db, ctx.user, ctx.query.processId, { year }); return anomaly.processAnomalies(s, ctx.query.processId, year); }
    const ids = A.operatorIds(db, ctx.user);
    let procs = db.all("SELECT p.id, i.operator_id, i.id AS inst FROM processes p JOIN installations i ON i.id = p.installation_id");
    if (ids) procs = procs.filter(p => ids.includes(p.operator_id));
    if (A.scopeOf(ctx.user) === "assigned") { const a = A.verifierAssignments(db, ctx.user); procs = procs.filter(p => a.some(x => x.installation_id === p.inst && x.year === year)); }
    if (ctx.query.operatorId) procs = procs.filter(p => p.operator_id === ctx.query.operatorId);
    const out = [];
    for (const p of procs) out.push(...anomaly.processAnomalies(s, p.id, year));
    const order = { hi: 0, mid: 1, lo: 2 };
    return out.sort((a, b) => order[a.sev] - order[b.sev]);
  });

  // Inson qarori: anomaliyani tasdiqlash yoki rad etish (izohli)
  app.post("/api/ai/anomalies/:id/decision", { perm: ["data.write", "verification.work"] }, ctx => {
    const b = clean(ctx.body, { status: { t: "enum", req: true, vals: ["confirmed", "dismissed"] }, note: { t: "str", max: 500 }, processId: { t: "str", req: true, max: 60 }, year: { t: "int", req: true, min: 2020, max: 2040 } });
    A.processRow(db, ctx.user, b.processId, { year: b.year });
    const found = anomaly.processAnomalies(s, b.processId, b.year).find(a => a.id === ctx.params.id);
    if (!found) throw notFound("Anomaliya topilmadi (ma'lumot o'zgargan bo'lishi mumkin).");
    const id = newId("ai");
    db.run("INSERT INTO ai_log (id, kind, model, model_version, subject, output, factors, status, decided_by, decided_at, created_at) VALUES (?, 'anomaly', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, anomaly.MODEL.name, anomaly.MODEL.version, found.id, JSON.stringify({ title: found.title, detail: found.detail, note: b.note }), JSON.stringify(found.factors), b.status, ctx.user.id, now(), now());
    audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action: "ai.anomaly_decision", entity: "ai_log", entityId: id, after: { anomaly: found.id, status: b.status, note: b.note }, ip: ctx.ip });
    return { ok: true };
  });

  app.get("/api/ai/gaps", { perm: "data.read" }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2020, 2040);
    A.processRow(db, ctx.user, ctx.query.processId, { year });
    return anomaly.gapSuggestions(s, ctx.query.processId, year);
  });
  // Taklifni qabul qilish: qiymat "taxminiy" holatda saqlanadi, verifikatsiyasiz CBAM hujjatiga kirmaydi
  app.post("/api/ai/gaps/accept", { perm: "data.write" }, ctx => {
    const b = clean(ctx.body, { processId: { t: "str", req: true, max: 60 }, year: { t: "int", req: true, min: 2020, max: 2040 } });
    const { installation } = A.processRow(db, ctx.user, b.processId, { write: true });
    A.assertNotLocked(db, installation.id, b.year);
    const sugg = anomaly.gapSuggestions(s, b.processId, b.year);
    const pick = Array.isArray(ctx.body.items) ? ctx.body.items : [];
    if (!pick.length) throw bad("Qabul qilinadigan takliflar tanlanmagan.");
    const upsert = upsertActivity;
    db.tx(() => {
      for (const it of pick) {
        const sg = sugg.find(x => x.streamId === it.streamId && x.month === it.month);
        if (!sg) throw bad("Taklif topilmadi.");
        const st = db.get("SELECT * FROM streams WHERE id = ?", sg.streamId);
        upsert(db, ctx.user, st, b.year, validateEntry(st, { month: sg.month, value: sg.suggested, status: "estimated", note: `AI-5 taklifi (${sg.method}), tasdiqladi: ${ctx.user.login}`, sourceLevel: "default" }), ctx.ip);
        db.run("INSERT INTO ai_log (id, kind, model, model_version, subject, output, status, decided_by, decided_at, created_at) VALUES (?, 'gapfill', ?, ?, ?, ?, 'confirmed', ?, ?, ?)",
          newId("ai"), sg.model, sg.modelVersion, `${sg.streamId}:${b.year}-${sg.month}`, JSON.stringify(sg), ctx.user.id, now(), now());
      }
    });
    return { ok: true, accepted: pick.length };
  });

  app.get("/api/ai/forecast", { perm: "calc.read" }, ctx => {
    A.processRow(db, ctx.user, ctx.query.processId);
    const to = intParam(ctx.query.year || new Date().getUTCFullYear(), "Yil", 2020, 2040);
    return anomaly.forecast(s, ctx.query.processId, [to - 2, to - 1, to]);
  });
  app.get("/api/ai/recommendations", { perm: "calc.read" }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2020, 2040);
    A.processRow(db, ctx.user, ctx.query.processId, { year });
    return advice.recommendations(s, ctx.query.processId, year);
  });
  app.get("/api/ai/risk", { perm: ["dashboard.gov", "tax.read"] }, ctx => {
    if (A.scopeOf(ctx.user) === "operator") throw forbidden();
    return advice.riskScores(s, intParam(ctx.query.year, "Yil", 2020, 2040));
  });
  app.get("/api/ai/reconcile", { perm: ["calc.read", "batches.read"] }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2020, 2040);
    const op = A.operator(db, ctx.user, ctx.query.operatorId);
    return anomaly.reconcile(s, op.id, year);
  });

  // AI-8: savol-javob. Kontekst — faqat o'z korxonasi, nomlarsiz agregatlar.
  app.post("/api/ai/ask", { perm: ["ai.use", "dashboard.gov", "refdata.read"] }, async ctx => {
    const b = clean(ctx.body, { question: { t: "str", req: true, max: 2000 }, year: { t: "int", min: 2020, max: 2040 } });
    let context = {};
    if (A.scopeOf(ctx.user) === "operator") {
      const year = b.year || new Date().getUTCFullYear();
      const procs = db.all("SELECT p.id, p.goods_group FROM processes p JOIN installations i ON i.id = p.installation_id WHERE i.operator_id = ?", ctx.user.operator_id);
      context = { yil: year, jarayonlar: procs.map((p, i) => { try { const r = computeProcess(s, p.id, year); return { jarayon: `J${i + 1}`, guruh: p.goods_group, see_cbam: +r.see.seeCbam.toFixed(4), qollangan: r.selection.basis, al_t: Math.round(r.totals.al) }; } catch { return { jarayon: `J${i + 1}`, guruh: p.goods_group, xato: "hisoblanmadi" }; } }) };
    }
    const r = await assistant.answer({ question: b.question, context, config });
    db.run("INSERT INTO ai_log (id, kind, model, model_version, subject, output, status, created_at) VALUES (?, 'assistant', ?, '1.0.0', ?, ?, 'new', ?)",
      newId("ai"), r.model || "rag-extractive", ctx.user.id, JSON.stringify({ q: b.question, mode: r.mode, sources: r.sources.map(x => x.id) }), now());
    return { ...r, label: "AI tavsiyasi — rasmiy hisob emas" };
  });
}

module.exports = { register, MODELS };
