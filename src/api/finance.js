/*
 * M5 (uglerod soliqi), M6 (CBAM kalkulyatori) va eksport partiyalari (D12), ITMO loyihalari (F-6.7).
 */
"use strict";
const audit = require("../db/audit");
const core = require("../core");
const { now, newId } = require("../db/db");
const { bad, forbidden, notFound, HttpError } = require("../http/app");
const { clean, intParam } = require("../http/validate");
const { can } = require("../auth/rbac");
const A = require("../services/access");
const cbam = require("../services/cbam");
const tax = require("../services/tax");
const { computeProcess, isVerified } = require("../services/calc");
const { camel } = require("../services/util");
const { parseCsv } = require("../docs/csv");

const batchSchema = {
  declarationNo: { t: "str", req: true, max: 60, label: "Deklaratsiya raqami" }, date: { t: "date", req: true, label: "Sana" },
  tifCode: { t: "str", req: true, re: /^\d{10}$/, msg: "TIF TN kodi 10 ta raqam bo'lishi kerak.", label: "TIF TN" },
  netT: { t: "num", req: true, min: 0.001, max: 1e7, label: "Netto og'irlik" },
  importerId: { t: "str", max: 60 }, eori: { t: "str", max: 20 }, country: { t: "str", re: /^[A-Z]{2}$/, label: "Mamlakat" }, processId: { t: "str", max: 60 },
};
const EU = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));

function register(app) {
  const s = app.s, { db } = s;
  const log = (ctx, action, entity, entityId, before, after) => audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action, entity, entityId, before, after, ip: ctx.ip });

  /** Partiya yozish huquqi: eksportyor — o'z korxonasi; Bojxona — istalgan korxona (operatorId yoki STIR). */
  function batchOperator(ctx, body) {
    if (A.scopeOf(ctx.user) === "operator") return ctx.user.operator_id;
    if (ctx.user.role === "customs") {
      const op = body.operatorId ? db.get("SELECT id FROM operators WHERE id = ?", body.operatorId) : body.stir ? db.get("SELECT id FROM operators WHERE stir = ?", body.stir) : null;
      if (!op) throw bad("Eksportyor (operatorId yoki STIR) topilmadi.");
      return op.id;
    }
    throw forbidden();
  }
  function insertBatch(ctx, opId, b, source) {
    if (b.processId) { const pr = db.get("SELECT p.id FROM processes p JOIN installations i ON i.id = p.installation_id WHERE p.id = ? AND i.operator_id = ?", b.processId, opId); if (!pr) throw bad("Jarayon bu korxonaga tegishli emas."); }
    if (b.importerId && !db.get("SELECT id FROM importers WHERE id = ? AND operator_id = ?", b.importerId, opId)) throw bad("Importyor bu korxonaga tegishli emas.");
    if (b.country && !EU.has(b.country)) throw bad("CBAM faqat Yevropa Ittifoqi mamlakatlariga eksport uchun qo'llanadi.");
    if (db.get("SELECT id FROM batches WHERE declaration_no = ? AND tif_code = ?", b.declarationNo, b.tifCode)) throw bad(`Deklaratsiya ${b.declarationNo} (${b.tifCode}) allaqachon kiritilgan.`);
    const processId = b.processId || cbam.linkProcess(db, opId, b.tifCode);
    const id = newId("bat"), t = now();
    db.run(`INSERT INTO batches (id, operator_id, declaration_no, date, tif_code, net_t, importer_id, eori, country, process_id, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, opId, b.declarationNo, b.date, b.tifCode, b.netT, b.importerId, b.eori, b.country, processId, source, t, t);
    log(ctx, "batch.create", "batch", id, null, { ...b, processId, source });
    return id;
  }

  /* ---------- Eksport partiyalari ---------- */
  app.get("/api/batches", { perm: "batches.read" }, ctx => {
    const year = ctx.query.year ? intParam(ctx.query.year, "Yil", 2020, 2040) : null;
    const ids = A.operatorIds(db, ctx.user);
    let rows = db.all("SELECT b.*, o.name AS operator_name, p.name AS process_name, im.name AS importer_name FROM batches b JOIN operators o ON o.id = b.operator_id LEFT JOIN processes p ON p.id = b.process_id LEFT JOIN importers im ON im.id = b.importer_id ORDER BY b.date DESC");
    if (ids) rows = rows.filter(r => ids.includes(r.operator_id));
    if (year) rows = rows.filter(r => r.date.startsWith(String(year)));
    if (ctx.query.operator) rows = rows.filter(r => r.operator_id === ctx.query.operator);
    return rows.map(r => camel(r));
  });
  app.post("/api/batches", { perm: "batches.write" }, ctx => {
    const b = clean(ctx.body, batchSchema);
    const id = insertBatch(ctx, batchOperator(ctx, ctx.body), b, ctx.user.role === "customs" ? "customs" : "manual");
    return camel(db.get("SELECT * FROM batches WHERE id = ?", id));
  });
  app.put("/api/batches/:id", { perm: "batches.write" }, ctx => {
    const bt = db.get("SELECT * FROM batches WHERE id = ?", ctx.params.id);
    if (!bt) throw notFound();
    A.operator(db, ctx.user, bt.operator_id);
    if (A.scopeOf(ctx.user) !== "operator") throw forbidden();
    const b = clean(ctx.body, { processId: { t: "str", max: 60 }, importerId: { t: "str", max: 60 }, eori: { t: "str", max: 20 } }, { partial: true });
    if (b.processId && !db.get("SELECT p.id FROM processes p JOIN installations i ON i.id = p.installation_id WHERE p.id = ? AND i.operator_id = ?", b.processId, bt.operator_id)) throw bad("Jarayon bu korxonaga tegishli emas.");
    if (b.importerId && !db.get("SELECT id FROM importers WHERE id = ? AND operator_id = ?", b.importerId, bt.operator_id)) throw bad("Importyor bu korxonaga tegishli emas.");
    for (const [k, col] of [["processId", "process_id"], ["importerId", "importer_id"], ["eori", "eori"]]) if (k in b) db.run(`UPDATE batches SET ${col} = ?, updated_at = ? WHERE id = ?`, b[k], now(), bt.id);
    log(ctx, "batch.update", "batch", bt.id, camel(bt), b);
    return camel(db.get("SELECT * FROM batches WHERE id = ?", bt.id));
  });
  app.del("/api/batches/:id", { perm: "batches.write" }, ctx => {
    const bt = db.get("SELECT * FROM batches WHERE id = ?", ctx.params.id);
    if (!bt) throw notFound();
    A.operator(db, ctx.user, bt.operator_id);
    if (bt.source === "customs" && ctx.user.role !== "customs") throw forbidden("Bojxona tizimidan kelgan partiyani faqat Bojxona o'zgartiradi.");
    db.run("DELETE FROM batches WHERE id = ?", bt.id);
    log(ctx, "batch.delete", "batch", bt.id, camel(bt), null);
    return { ok: true };
  });
  // CSV: declaration_no;date;tif_code;net_t;eori;country[;stir]
  app.post("/api/batches/import", { perm: "batches.write", bodyLimit: 2 * 1024 * 1024 }, ctx => {
    const b = clean(ctx.body, { csv: { t: "str", req: true, max: 2_000_000 } });
    const rows = parseCsv(b.csv); const errors = []; let ok = 0;
    db.tx(() => {
      rows.forEach((r, i) => {
        try {
          const opId = batchOperator(ctx, { stir: r.stir, operatorId: ctx.body.operatorId });
          const imp = r.eori ? db.get("SELECT id FROM importers WHERE operator_id = ? AND eori = ?", opId, r.eori) : null;
          insertBatch(ctx, opId, clean({ declarationNo: r.declaration_no, date: r.date, tifCode: (r.tif_code || "").replace(/\s/g, ""), netT: r.net_t, eori: r.eori || null, country: r.country || null, importerId: imp?.id || null }, batchSchema),
            ctx.user.role === "customs" ? "customs" : "csv");
          ok++;
        } catch (e) { errors.push({ row: i + 2, error: e.message }); }
      });
      if (errors.length) throw Object.assign(new Error("CSV da xatolar bor — hech narsa saqlanmadi."), { status: 400, extra: { errors: errors.slice(0, 50) } });
    });
    return { ok: true, imported: ok };
  });

  /* ---------- CBAM ---------- */
  app.get("/api/cbam/operator/:id", { perm: "cbam.read" }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2020, 2040);
    const op = A.operator(db, ctx.user, ctx.params.id);
    return cbam.operatorYear(s, op.id, year);
  });
  app.get("/api/cbam/scenario", { perm: "cbam.read" }, ctx => {
    const q = clean(ctx.query, { processId: { t: "str", max: 60 }, baseYear: { t: "int", min: 2024, max: 2034 }, etsUsd: { t: "num", min: 0, max: 1000 },
      exportGrowth: { t: "num", min: -0.5, max: 1 }, seeChange: { t: "num", min: -0.5, max: 0.5 }, sCov: { t: "num", min: 0, max: 1 }, ee: { t: "num", min: 0 } });
    if (q.processId) A.processRow(db, ctx.user, q.processId);
    else if (q.ee == null) throw bad("processId yoki ee ko'rsatilishi kerak.");
    return cbam.scenario(s, { processId: q.processId, baseYear: q.baseYear || 2025, etsUsd: q.etsUsd, exportGrowth: q.exportGrowth, seeChange: q.seeChange, sCov: q.sCov, eeOverride: q.ee });
  });

  /* ---------- Uglerod soliqi ---------- */
  app.get("/api/tax/rates", { perm: ["tax.read", "refdata.read"] }, ctx => tax.fuelRates(s, intParam(ctx.query.year || 2026, "Yil", 2026, 2035)));
  app.get("/api/tax/declaration", { perm: "tax.read" }, ctx => {
    const q = clean(ctx.query, { installationId: { t: "str", req: true, max: 60 }, year: { t: "int", req: true, min: 2026, max: 2035 },
      quarter: { t: "enum", vals: ["Q1", "Q2", "Q3", "Q4"] }, variant: { t: "enum", vals: ["up", "down1", "down2"] } });
    A.installation(db, ctx.user, q.installationId, { year: q.year });
    return tax.declaration(s, q.installationId, q.year, q.quarter, q.variant);
  });
  app.get("/api/tax/effective", { perm: ["tax.read", "cbam.read"] }, ctx => {
    const q = clean(ctx.query, { installationId: { t: "str", req: true, max: 60 }, year: { t: "int", req: true, min: 2026, max: 2035 } });
    A.installation(db, ctx.user, q.installationId, { year: q.year });
    return tax.effective(s, q.installationId, q.year);
  });
  app.get("/api/tax/revenue", { perm: "dashboard.gov" }, ctx => {
    const base = intParam(ctx.query.baseYear || 2026, "Yil", 2024, 2035);
    return tax.revenueForecast(s, base, [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035]);
  });

  const paySchema = { installationId: { t: "str", req: true, max: 60 }, year: { t: "int", req: true, min: 2026, max: 2035 },
    period: { t: "str", req: true, re: /^\d{4}(-Q[1-4])?$/, msg: "Davr: YYYY yoki YYYY-Q1..Q4." }, kind: { t: "enum", req: true, vals: ["up", "down"] },
    amountUzs: { t: "num", req: true, min: 0, label: "Summa" }, fx: { t: "num", min: 1, label: "Kurs" }, rebateUzs: { t: "num", min: 0 },
    coveredT: { t: "num", min: 0 }, budgetCode: { t: "str", max: 40 } };
  app.get("/api/tax/payments", { perm: "tax.read" }, ctx => {
    const ids = A.operatorIds(db, ctx.user);
    let rows = db.all("SELECT t.*, o.name AS operator_name, i.name AS installation_name FROM tax_payments t JOIN operators o ON o.id = t.operator_id LEFT JOIN installations i ON i.id = t.installation_id ORDER BY t.year DESC, t.period DESC");
    if (ids) rows = rows.filter(r => ids.includes(r.operator_id));
    return rows.map(r => ({ ...camel(r), amountUsd: r.amount_uzs / r.fx }));
  });
  app.post("/api/tax/payments", { perm: "tax.write" }, ctx => {
    const b = clean(ctx.body, paySchema);
    const inst = A.installation(db, ctx.user, b.installationId, { write: true });
    if (!b.period.startsWith(String(b.year))) throw bad("Davr yili bilan mos emas.");
    const fx = b.fx || s.ref.snapshot(`${b.year}-12-31`).get("fx.USD");
    const id = newId("tax"), t = now();
    db.run(`INSERT INTO tax_payments (id, operator_id, installation_id, year, period, kind, amount_uzs, fx, rebate_uzs, covered_t, budget_code, status, source, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, 'paid', 'manual', ?, ?)`, id, inst.operator_id, inst.id, b.year, b.period, b.kind, b.amountUzs, fx, b.rebateUzs || 0, b.coveredT, b.budgetCode, t, t);
    log(ctx, "tax.payment_create", "tax_payment", id, null, b);
    return camel(db.get("SELECT * FROM tax_payments WHERE id = ?", id));
  });
  // Soliq qo'mitasi to'lovni tasdiqlaydi (M5.4) — to'lov tasdiqnomasi va P_eff uchun asos
  app.post("/api/tax/payments/:id/confirm", { perm: "tax.confirm" }, ctx => {
    const p = db.get("SELECT * FROM tax_payments WHERE id = ?", ctx.params.id);
    if (!p) throw notFound();
    if (p.status === "confirmed") throw new HttpError(409, "To'lov allaqachon tasdiqlangan.");
    db.run("UPDATE tax_payments SET status = 'confirmed', confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?", ctx.user.id, now(), now(), p.id);
    log(ctx, "tax.payment_confirm", "tax_payment", p.id, null, null);
    return camel(db.get("SELECT * FROM tax_payments WHERE id = ?", p.id));
  });

  /* ---------- ITMO loyihalari (F-6.7, PF-110) ---------- */
  const itmoSchema = { name: { t: "str", req: true, max: 200 }, year: { t: "int", req: true, min: 2021, max: 2040 }, be: { t: "num", req: true, min: 0, label: "BE" },
    pe: { t: "num", req: true, min: 0, label: "PE" }, le: { t: "num", min: 0 }, scope: { t: "enum", vals: ["cbam_goods", "other"] }, linkedProcessId: { t: "str", max: 60 }, stateOwned: { t: "bool" } };
  const itmoOut = r => { const x = core.itmo({ be: r.be, pe: r.pe, le: r.le }); return { ...camel(r), er: x.er, trade: x.trade, buffer: x.buffer }; };
  app.get("/api/itmo", { perm: "itmo.read" }, ctx => {
    const ids = A.operatorIds(db, ctx.user);
    let rows = db.all("SELECT * FROM itmo_projects ORDER BY year DESC, name");
    if (ids) rows = rows.filter(r => ids.includes(r.operator_id));
    return rows.map(itmoOut);
  });
  app.post("/api/itmo", { perm: "itmo.write" }, ctx => {
    const b = clean(ctx.body, itmoSchema);
    if (b.linkedProcessId) A.processRow(db, ctx.user, b.linkedProcessId, { write: true });
    if (b.scope === "cbam_goods" && !b.linkedProcessId) throw bad("CBAM tovari bilan bog'liq loyiha uchun jarayon ko'rsatilishi shart.");
    const id = newId("itmo"), t = now();
    db.run(`INSERT INTO itmo_projects (id, operator_id, name, year, be, pe, le, scope, linked_process_id, state_owned, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?, 'draft', ?, ?)`,
      id, ctx.user.operator_id, b.name, b.year, b.be, b.pe, b.le || 0, b.scope || "other", b.linkedProcessId, b.stateOwned ? 1 : 0, t, t);
    log(ctx, "itmo.create", "itmo", id, null, b);
    return itmoOut(db.get("SELECT * FROM itmo_projects WHERE id = ?", id));
  });
  // Reestrga uzatish (I5): ikki marta hisoblash blokirovkasi — kamayish CBAM SEE da allaqachon aks etgan bo'lsa ITMO sotilmaydi
  app.post("/api/itmo/:id/register", { perm: "itmo.register" }, ctx => {
    const r = db.get("SELECT * FROM itmo_projects WHERE id = ?", ctx.params.id);
    if (!r) throw notFound();
    if (r.status === "registered") throw new HttpError(409, "Loyiha allaqachon reestrga uzatilgan.");
    if (r.scope === "cbam_goods" && r.linked_process_id) {
      const pr = db.get("SELECT installation_id FROM processes WHERE id = ?", r.linked_process_id);
      if (pr && isVerified(db, pr.installation_id, r.year))
        throw new HttpError(409, "Ikki marta hisoblash xavfi: bu kamayish verifikatsiyalangan CBAM SEE da aks etgan. ITMO sifatida uzatish uchun mos tuzatish (corresponding adjustment) qarori kerak.");
    }
    const regId = "UZ-ITMO-" + r.year + "-" + r.id.slice(-6).toUpperCase();
    db.run("UPDATE itmo_projects SET status = 'registered', registry_id = ?, verified = 1, updated_at = ? WHERE id = ?", regId, now(), r.id);
    db.run("INSERT INTO integration_log (id, system, direction, summary, request, status, at) VALUES (?, 'carbon_registry', 'out', ?, ?, 'mock', ?)", newId("int"), `ITMO ${regId}`, JSON.stringify(itmoOut(r)), now());
    log(ctx, "itmo.register", "itmo", r.id, null, { registryId: regId });
    return itmoOut(db.get("SELECT * FROM itmo_projects WHERE id = ?", r.id));
  });
}

module.exports = { register, EU };
