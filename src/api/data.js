/*
 * M3 — ma'lumot yig'ish: oylik faoliyat ma'lumotlari (veb-shakl, CSV, API), CEMS soatlik o'lchovlari (F-5.4),
 * dalil hujjatlari (FT-2.6), validatsiya (FT-2.7) va ma'lumot sifati indekslari (M3.11).
 */
"use strict";
const crypto = require("crypto");
const audit = require("../db/audit");
const core = require("../core");
const { now, newId, parseJson } = require("../db/db");
const { bad, notFound, raw, HttpError } = require("../http/app");
const { clean, intParam } = require("../http/validate");
const A = require("../services/access");
const { camel } = require("../services/util");
const { parseCsv } = require("../docs/csv");

const SOURCE_LEVELS = ["measured", "lab", "supplier", "default"];
const EXTRA_KEYS = { clinker: ["wCaO", "wMgO"], fuel: ["ncv", "ef"], mass_in: ["carbon"], mass_out: ["carbon"], electricity: ["genFuelEm", "genMwh"], heat_export: ["fuelEm", "qProd", "eta"] };
// Diapazon tekshiruvi (FT-2.7): odatiy oylik qiymatlarning yuqori chegarasi (birlik bo'yicha), xato kiritishni ushlash uchun.
const MAX_MONTHLY = { t: 5e7, m3: 5e8, "1000m3": 5e7, MWh: 1e8, TJ: 1e6, "t CO2e": 5e7 };

function validateEntry(stream, e) {
  const out = {};
  out.month = intParam(e.month, "Oy", 1, 12);
  if (e.value === null || e.value === "" || e.value === undefined) return { ...out, delete: true };
  const v = typeof e.value === "string" ? Number(e.value.replace(",", ".")) : e.value;
  if (typeof v !== "number" || !Number.isFinite(v)) throw bad(`"${stream.name}", ${out.month}-oy: qiymat son bo'lishi kerak.`);
  if (v < 0 && stream.type !== "wg_corr") throw bad(`"${stream.name}", ${out.month}-oy: qiymat manfiy bo'lmasligi kerak.`);
  const lim = MAX_MONTHLY[stream.unit] ?? 5e8;
  if (Math.abs(v) > lim) throw bad(`"${stream.name}", ${out.month}-oy: ${v} odatiy diapazondan tashqarida (birlik xatosini tekshiring).`);
  out.value = v;
  const extra = {};
  for (const k of EXTRA_KEYS[stream.type] || []) {
    if (e.extra && e.extra[k] != null && e.extra[k] !== "") {
      const x = Number(e.extra[k]);
      if (!Number.isFinite(x) || x < 0) throw bad(`"${stream.name}", ${out.month}-oy: ${k} noto'g'ri.`);
      if ((k === "wCaO" || k === "wMgO") && x > 100) throw bad(`${k} foizda (0–100) bo'lishi kerak.`);
      if (k === "carbon" && x > 1) throw bad("Uglerod ulushi 0..1 oralig'ida bo'lishi kerak.");
      extra[k] = x;
    }
  }
  if (e.extra && e.extra.cems) extra.cems = e.extra.cems;
  out.extra = Object.keys(extra).length ? extra : null;
  out.sourceLevel = e.sourceLevel ? (SOURCE_LEVELS.includes(e.sourceLevel) ? e.sourceLevel : (() => { throw bad("Manba darajasi noto'g'ri."); })()) : stream.source_level;
  out.uncertainty = e.uncertainty != null && e.uncertainty !== "" ? Number(e.uncertainty) : null;
  if (out.uncertainty != null && !(out.uncertainty >= 0 && out.uncertainty <= 100)) throw bad("Noaniqlik 0–100% oralig'ida bo'lishi kerak.");
  out.status = e.status === "estimated" ? "estimated" : "actual";
  out.note = e.note ? String(e.note).slice(0, 500) : null;
  out.evidenceId = e.evidenceId || null;
  return out;
}

function upsertActivity(db, user, stream, year, entry, ip) {
  const prev = db.get("SELECT * FROM activity WHERE stream_id = ? AND year = ? AND month = ?", stream.id, year, entry.month);
  if (entry.delete) {
    if (prev) { db.run("DELETE FROM activity WHERE id = ?", prev.id); audit.log(db, { actor: user.id, role: user.role, action: "activity.delete", entity: "activity", entityId: prev.id, before: camel(prev, ["extra"]), ip }); }
    return;
  }
  const t = now();
  if (prev) {
    db.run(`UPDATE activity SET value = ?, extra = ?, source_level = ?, uncertainty = ?, evidence_id = COALESCE(?, evidence_id), status = ?, note = ?, entered_by = ?, entered_at = ? WHERE id = ?`,
      entry.value, entry.extra ? JSON.stringify(entry.extra) : null, entry.sourceLevel, entry.uncertainty, entry.evidenceId, entry.status, entry.note, user.id, t, prev.id);
    if (prev.value !== entry.value || prev.extra !== (entry.extra ? JSON.stringify(entry.extra) : null))
      audit.log(db, { actor: user.id, role: user.role, action: "activity.update", entity: "activity", entityId: prev.id, before: { value: prev.value, extra: parseJson(prev.extra) }, after: { value: entry.value, extra: entry.extra }, ip });
  } else {
    const id = newId("act");
    db.run(`INSERT INTO activity (id, stream_id, year, month, value, extra, source_level, uncertainty, evidence_id, status, note, entered_by, entered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, stream.id, year, entry.month, entry.value, entry.extra ? JSON.stringify(entry.extra) : null, entry.sourceLevel, entry.uncertainty, entry.evidenceId, entry.status, entry.note, user.id, t);
    audit.log(db, { actor: user.id, role: user.role, action: "activity.create", entity: "activity", entityId: id, after: { streamId: stream.id, year, month: entry.month, value: entry.value, extra: entry.extra }, ip });
  }
}

/** Ma'lumot sifati: to'liqlik (12 oydan nechta), o'z vaqtidaligi (oy tugaganidan keyin 30 kun ichida kiritilgan), izchillik (anomaliyasiz oylar). */
function qualityIndex(db, processId, year) {
  const streams = db.all("SELECT id, type FROM streams WHERE process_id = ? AND active = 1", processId);
  if (!streams.length) return { completeness: 0, timeliness: 0, consistency: 0, expected: 0, entered: 0 };
  const today = new Date();
  const monthsDue = year < today.getUTCFullYear() ? 12 : year > today.getUTCFullYear() ? 0 : today.getUTCMonth();
  let entered = 0, onTime = 0, consistent = 0;
  for (const s of streams) {
    const rows = db.all("SELECT month, value, entered_at, status FROM activity WHERE stream_id = ? AND year = ?", s.id, year);
    const vals = rows.filter(r => r.status === "actual").map(r => r.value);
    const med = vals.length ? vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)] : 0;
    for (const r of rows) {
      if (r.month > monthsDue) continue;
      entered++;
      const due = new Date(Date.UTC(year, r.month, 30)); // keyingi oyning 30-kuni
      if (new Date(r.entered_at) <= due) onTime++;
      if (!med || Math.abs(r.value - med) / med <= 0.5) consistent++;
    }
  }
  const expected = streams.length * monthsDue;
  return { expected, entered, completeness: expected ? entered / expected : 1, timeliness: entered ? onTime / entered : 1, consistency: entered ? consistent / entered : 1 };
}

function register(app) {
  const { db } = app.s;

  // Jarayon-yil bo'yicha oylik jadval
  app.get("/api/processes/:id/activity", { perm: "data.read" }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2020, 2040);
    const { process: p, installation } = A.processRow(db, ctx.user, ctx.params.id, { year });
    const streams = db.all("SELECT * FROM streams WHERE process_id = ? ORDER BY created_at, id", p.id).map(s => camel(s));
    const rows = db.all("SELECT a.* FROM activity a JOIN streams s ON s.id = a.stream_id WHERE s.process_id = ? AND a.year = ?", p.id, year);
    const grid = {};
    for (const r of rows) (grid[r.stream_id] ||= {})[r.month] = { value: r.value, extra: parseJson(r.extra, null), sourceLevel: r.source_level, uncertainty: r.uncertainty, status: r.status, note: r.note, evidenceId: r.evidence_id, enteredAt: r.entered_at };
    const locked = !!db.get("SELECT id FROM verifications WHERE installation_id = ? AND year = ? AND status = 'concluded' AND opinion IN ('positive','qualified')", installation.id, year);
    return { process: camel(p), year, streams, grid, locked, quality: qualityIndex(db, p.id, year) };
  });

  // Ommaviy saqlash: [{streamId, month, value, extra, sourceLevel, uncertainty, status, note, evidenceId}]
  app.put("/api/processes/:id/activity", { perm: "data.write" }, ctx => {
    const b = clean(ctx.body, { year: { t: "int", req: true, min: 2020, max: 2040 } });
    const { process: p, installation } = A.processRow(db, ctx.user, ctx.params.id, { write: true });
    A.assertNotLocked(db, installation.id, b.year);
    const entries = ctx.body.entries;
    if (!Array.isArray(entries) || entries.length > 2000) throw bad("entries massiv bo'lishi kerak (≤ 2000).");
    const streams = new Map(db.all("SELECT * FROM streams WHERE process_id = ?", p.id).map(s => [s.id, s]));
    db.tx(() => {
      for (const e of entries) {
        const st = streams.get(e.streamId);
        if (!st) throw bad("Manba oqimi bu jarayonga tegishli emas.");
        upsertActivity(db, ctx.user, st, b.year, validateEntry(st, e), ctx.ip);
      }
    });
    return { ok: true, saved: entries.length, quality: qualityIndex(db, p.id, b.year) };
  });

  // CSV import (M3.2): ustunlar — stream (ID yoki nomi), month, value, [wCaO, wMgO, ncv, ef, carbon, source_level, uncertainty, note]
  app.post("/api/processes/:id/activity/import", { perm: "data.write", bodyLimit: 2 * 1024 * 1024 }, ctx => {
    const b = clean(ctx.body, { year: { t: "int", req: true, min: 2020, max: 2040 }, csv: { t: "str", req: true, max: 2_000_000 } });
    const { process: p, installation } = A.processRow(db, ctx.user, ctx.params.id, { write: true });
    A.assertNotLocked(db, installation.id, b.year);
    const rows = parseCsv(b.csv);
    if (!rows.length) throw bad("CSV bo'sh.");
    const streams = db.all("SELECT * FROM streams WHERE process_id = ?", p.id);
    const byKey = new Map(); for (const s of streams) { byKey.set(s.id, s); byKey.set(s.name.toLowerCase(), s); }
    const errors = []; let ok = 0;
    db.tx(() => {
      rows.forEach((r, i) => {
        try {
          const st = byKey.get(String(r.stream || r.stream_id || "").trim()) || byKey.get(String(r.stream || "").trim().toLowerCase());
          if (!st) throw new Error(`oqim topilmadi: "${r.stream || r.stream_id || ""}"`);
          const extra = {}; for (const k of ["wCaO", "wMgO", "ncv", "ef", "carbon"]) if (r[k] != null && r[k] !== "") extra[k] = r[k];
          upsertActivity(db, ctx.user, st, b.year, validateEntry(st, { month: r.month, value: r.value, extra, sourceLevel: r.source_level || undefined, uncertainty: r.uncertainty, note: r.note, status: r.status }), ctx.ip);
          ok++;
        } catch (e) { errors.push({ row: i + 2, error: e.message }); }
      });
      if (errors.length) throw Object.assign(new Error("CSV da xatolar bor — hech narsa saqlanmadi."), { status: 400, extra: { errors: errors.slice(0, 50) } });
    });
    return { ok: true, imported: ok };
  });

  // CSV shablon
  app.get("/api/processes/:id/activity/template.csv", { perm: "data.read" }, ctx => {
    const { process: p } = A.processRow(db, ctx.user, ctx.params.id);
    const streams = db.all("SELECT * FROM streams WHERE process_id = ? ORDER BY created_at", p.id);
    const lines = ["stream;month;value;wCaO;wMgO;ncv;ef;carbon;source_level;uncertainty;note"];
    for (const s of streams) for (let m = 1; m <= 12; m++) lines.push(`${s.name};${m};;;;;;;${s.source_level || ""};;`);
    return raw("﻿" + lines.join("\r\n"), "text/csv; charset=utf-8", `UzCarbon_${p.name}_shablon.csv`);
  });

  // CEMS soatlik o'lchovlari (F-5.4): CSV ustunlari c (g/Nm³), v (Nm³) — natija oylik qiymat sifatida yoziladi
  app.post("/api/streams/:id/cems", { perm: "data.write", bodyLimit: 4 * 1024 * 1024 }, ctx => {
    const b = clean(ctx.body, { year: { t: "int", req: true, min: 2020, max: 2040 }, month: { t: "int", req: true, min: 1, max: 12 }, csv: { t: "str", req: true, max: 4_000_000 } });
    const { stream, installation } = A.streamRow(db, ctx.user, ctx.params.id, { write: true });
    if (stream.type !== "cems") throw bad("Bu oqim CEMS turida emas.");
    A.assertNotLocked(db, installation.id, b.year);
    const rows = parseCsv(b.csv);
    const hours = rows.map((r, i) => {
      const c = Number(String(r.c ?? "").replace(",", ".")), v = Number(String(r.v ?? "").replace(",", "."));
      if (!Number.isFinite(c) || !Number.isFinite(v) || c < 0 || v < 0) throw bad(`${i + 2}-qator: c va v manfiy bo'lmagan son bo'lishi kerak.`);
      return { c, v };
    });
    const daysIn = new Date(Date.UTC(b.year, b.month, 0)).getUTCDate();
    if (hours.length > daysIn * 24) throw bad(`Soatlar soni (${hours.length}) oydagi soatlardan (${daysIn * 24}) ko'p.`);
    const t = core.cems(hours);
    db.tx(() => upsertActivity(db, ctx.user, stream, b.year, validateEntry(stream, { month: b.month, value: t, sourceLevel: "measured",
      extra: { cems: { hours: hours.length, expected: daysIn * 24 } }, note: `CEMS: ${hours.length} soat` }), ctx.ip));
    return { ok: true, tonnes: t, hours: hours.length, expectedHours: daysIn * 24, coverage: hours.length / (daysIn * 24) };
  });

  /* ---------- Dalil hujjatlari (FT-2.6) ---------- */
  const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "video/mp4"];
  app.post("/api/documents", { perm: ["data.write", "verification.work"], bodyLimit: 12 * 1024 * 1024 }, ctx => {
    const b = clean(ctx.body, { name: { t: "str", req: true, max: 200 }, mime: { t: "enum", req: true, vals: ALLOWED }, base64: { t: "str", req: true, max: 12_000_000 },
      entity: { t: "enum", req: true, vals: ["activity", "stream", "meter", "verification", "finding", "installation"] }, entityId: { t: "str", req: true, max: 60 } });
    const buf = Buffer.from(b.base64, "base64");
    if (!buf.length || buf.length > 8 * 1024 * 1024) throw bad("Fayl hajmi 8 MB dan oshmasligi kerak.");
    let operatorId = null;
    if (b.entity === "installation" || b.entity === "meter") {
      const instId = b.entity === "meter" ? db.get("SELECT installation_id FROM meters WHERE id = ?", b.entityId)?.installation_id : b.entityId;
      if (!instId) throw notFound();
      operatorId = A.installation(db, ctx.user, instId).operator_id;
    } else if (b.entity === "stream" || b.entity === "activity") {
      const streamId = b.entity === "activity" ? db.get("SELECT stream_id FROM activity WHERE id = ?", b.entityId)?.stream_id : b.entityId;
      if (!streamId) throw notFound();
      operatorId = A.streamRow(db, ctx.user, streamId).installation.operator_id;
    } else {
      const verId = b.entity === "finding" ? db.get("SELECT verification_id FROM findings WHERE id = ?", b.entityId)?.verification_id : b.entityId;
      const v = verId && db.get("SELECT * FROM verifications WHERE id = ?", verId);
      if (!v) throw notFound();
      operatorId = A.installation(db, ctx.user, v.installation_id, { year: v.year }).operator_id;
    }
    const id = newId("doc"), sha = crypto.createHash("sha256").update(buf).digest("hex");
    db.run("INSERT INTO documents (id, operator_id, entity, entity_id, name, mime, size, sha256, content, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      id, operatorId, b.entity, b.entityId, b.name, b.mime, buf.length, sha, buf, ctx.user.id, now());
    audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action: "document.upload", entity: "document", entityId: id, after: { name: b.name, sha256: sha, entity: b.entity, entityId: b.entityId }, ip: ctx.ip });
    return { id, name: b.name, size: buf.length, sha256: sha };
  });
  app.get("/api/documents", { perm: ["data.read", "verification.read"] }, ctx => {
    const b = clean(ctx.query, { entity: { t: "str", req: true, max: 30 }, entityId: { t: "str", req: true, max: 60 } });
    const rows = db.all("SELECT id, operator_id, name, mime, size, sha256, uploaded_by, uploaded_at FROM documents WHERE entity = ? AND entity_id = ? ORDER BY uploaded_at DESC", b.entity, b.entityId);
    const ids = A.operatorIds(db, ctx.user);
    return rows.filter(r => !ids || ids.includes(r.operator_id)).map(r => camel(r));
  });
  app.get("/api/documents/:id", { perm: ["data.read", "verification.read"] }, ctx => {
    const d = db.get("SELECT * FROM documents WHERE id = ?", ctx.params.id);
    if (!d) throw notFound();
    const ids = A.operatorIds(db, ctx.user);
    if (ids && !ids.includes(d.operator_id)) throw new HttpError(403, "Ruxsat yo'q.");
    return raw(Buffer.from(d.content), d.mime, d.name);
  });
}

module.exports = { register, qualityIndex, validateEntry, upsertActivity };
