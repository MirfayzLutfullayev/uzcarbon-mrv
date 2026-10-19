/* M4 — hisob yadrosi API: jonli hisob, saqlash (versiya), solishtirish, topshirish, inshoot jamlanmasi (FT-3.8). */
"use strict";
const audit = require("../db/audit");
const { now } = require("../db/db");
const { bad, notFound, HttpError } = require("../http/app");
const { clean, intParam } = require("../http/validate");
const A = require("../services/access");
const C = require("../services/calc");
const { camel } = require("../services/util");
const { qualityIndex } = require("./data");
const ai = require("../ai/anomaly");

function register(app) {
  const s = app.s, { db } = s;
  const wrap = fn => { try { return fn(); } catch (e) { if (e.status) throw e; throw new HttpError(422, e.message); } };

  app.get("/api/processes/:id/calc", { perm: "calc.read" }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2020, 2040);
    const { process: p } = A.processRow(db, ctx.user, ctx.params.id, { year });
    const r = wrap(() => C.computeProcess(s, p.id, year));
    return { ...r, quality: qualityIndex(db, p.id, year), anomalies: ai.processAnomalies(s, p.id, year) };
  });

  app.post("/api/processes/:id/results", { perm: "calc.run" }, ctx => {
    const b = clean(ctx.body, { year: { t: "int", req: true, min: 2020, max: 2040 } });
    const { process: p } = A.processRow(db, ctx.user, ctx.params.id, { write: true });
    return wrap(() => C.saveResult(s, p.id, b.year, ctx.user));
  });

  app.get("/api/processes/:id/results", { perm: "calc.read" }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2020, 2040);
    const { process: p } = A.processRow(db, ctx.user, ctx.params.id, { year });
    return db.all("SELECT id, process_id, year, version, status, see_cbam, see_applied, basis, created_by, created_at, locked, inputs_hash FROM calc_results WHERE process_id = ? AND year = ? ORDER BY version DESC", p.id, year).map(r => camel(r));
  });

  const loadResult = (ctx, id) => {
    const r = C.getResult(s, id);
    if (!r) throw notFound("Natija topilmadi.");
    A.processRow(db, ctx.user, r.processId, { year: r.year });
    return r;
  };
  app.get("/api/results/compare", { perm: "calc.read" }, ctx => {
    const q = clean(ctx.query, { a: { t: "str", req: true, max: 60 }, b: { t: "str", req: true, max: 60 } });
    const a = loadResult(ctx, q.a), b = loadResult(ctx, q.b);
    if (a.processId !== b.processId) throw bad("Faqat bitta jarayon natijalarini solishtirish mumkin.");
    return C.compareResults(a, b);
  });
  app.get("/api/results/:id", { perm: "calc.read" }, ctx => loadResult(ctx, ctx.params.id));

  app.post("/api/results/:id/submit", { perm: "calc.submit" }, ctx => {
    const r = loadResult(ctx, ctx.params.id);
    A.processRow(db, ctx.user, r.processId, { write: true });
    if (r.status !== "draft") throw new HttpError(409, "Faqat qoralama natija topshiriladi.");
    db.tx(() => {
      db.run("UPDATE calc_results SET status = 'draft' WHERE process_id = ? AND year = ? AND status = 'submitted'", r.processId, r.year);
      db.run("UPDATE calc_results SET status = 'submitted' WHERE id = ?", r.id);
      audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action: "calc.submit", entity: "calc_result", entityId: r.id, after: { version: r.version }, ip: ctx.ip });
    });
    return C.getResult(s, r.id);
  });

  /* Inshoot jamlanmasi: CBAM chegarasi va milliy MRV chegarasi (FT-3.8, M4.8) */
  app.get("/api/installations/:id/summary", { perm: ["calc.read", "dashboard.gov"] }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2020, 2040);
    const inst = A.installation(db, ctx.user, ctx.params.id, { year });
    const procs = db.all("SELECT id FROM processes WHERE installation_id = ? ORDER BY name", inst.id);
    const rows = [], errors = [];
    let nat = { direct: 0, indirect: 0 }, cb = { direct: 0, indirect: 0, precursors: 0 };
    for (const p of procs) {
      try {
        const r = C.computeProcess(s, p.id, year);
        rows.push({ processId: p.id, name: r.processName, goodsGroup: r.goodsGroup, tifCode: r.tifCode, al: r.totals.al, dirEm: r.totals.dirEm, attrDir: r.totals.attrDir,
          emEl: r.totals.emEl, precDir: r.totals.precDir, precInd: r.totals.precInd, seeCbam: r.see.seeCbam, applied: r.selection.applied, basis: r.selection.basis,
          defaultSee: r.selection.default, quality: qualityIndex(db, p.id, year), warnings: r.warnings.length });
        nat.direct += r.totals.dirEm; nat.indirect += r.totals.emEl;
        cb.direct += r.totals.attrDir; cb.precursors += r.totals.precDir + r.totals.precInd;
        cb.indirect += require("../core").GOODS_GROUPS[r.goodsGroup].indirect ? r.totals.emEl : 0;
      } catch (e) { errors.push({ processId: p.id, error: e.message }); }
    }
    const explanations = [
      "Milliy MRV (IG inventarizatsiyasi) inshootning barcha to'g'ridan-to'g'ri emissiyasini (DirEm) va iste'mol qilingan elektr emissiyasini alohida hisobga oladi.",
      "CBAM chegarasida issiqlik va elektr oqimlari jarayonlarga taqsimlanadi (AttrEm), bilvosita emissiya faqat sement va o'g'itlarda qo'shiladi.",
      "CBAM SEE ga prekursorlarning kiritilgan emissiyasi qo'shiladi; milliy inventarizatsiyada ular ishlab chiqaruvchi inshootda hisobga olinadi (ikki marta hisoblanmaydi).",
    ];
    return { installation: camel(inst), year, processes: rows, errors, national: { ...nat, total: nat.direct + nat.indirect },
      cbam: { ...cb, total: cb.direct + cb.indirect + cb.precursors }, explanations };
  });
}

module.exports = { register };
