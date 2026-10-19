/*
 * O'zgartirib bo'lmaydigan audit izi (X4, FT-6.5): har bir yozuv oldingisining xeshiga bog'langan (xesh zanjiri).
 * Jadvalda UPDATE/DELETE triggerlar bilan taqiqlangan; zanjirni verify() tekshiradi.
 */
"use strict";
const crypto = require("crypto");
const { now } = require("./db");

const GENESIS = "0".repeat(64);
const digest = (prev, rec) => crypto.createHash("sha256").update(prev + "|" + JSON.stringify(rec)).digest("hex");

/**
 * @param {import('./db').Db} db
 * @param {{actor?:string, role?:string, action:string, entity?:string, entityId?:string, before?:any, after?:any, ip?:string}} e
 */
function log(db, e) {
  const last = db.get("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1");
  const prev = last ? last.hash : GENESIS;
  const rec = {
    at: now(), actor: e.actor || null, role: e.role || null, action: e.action, entity: e.entity || null,
    entity_id: e.entityId || null,
    before: e.before === undefined ? null : JSON.stringify(e.before),
    after: e.after === undefined ? null : JSON.stringify(e.after),
    ip: e.ip || null,
  };
  const hash = digest(prev, rec);
  db.run("INSERT INTO audit (at, actor, role, action, entity, entity_id, before, after, ip, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    rec.at, rec.actor, rec.role, rec.action, rec.entity, rec.entity_id, rec.before, rec.after, rec.ip, prev, hash);
  return hash;
}

/** Zanjirni boshidan oxirigacha qayta hisoblaydi. */
function verify(db) {
  let prev = GENESIS, count = 0;
  for (const r of db.raw.prepare("SELECT * FROM audit ORDER BY seq").iterate()) {
    const rec = { at: r.at, actor: r.actor, role: r.role, action: r.action, entity: r.entity, entity_id: r.entity_id, before: r.before, after: r.after, ip: r.ip };
    if (r.prev_hash !== prev || digest(prev, rec) !== r.hash) return { ok: false, count, brokenAt: r.seq };
    prev = r.hash; count++;
  }
  return { ok: true, count, head: prev };
}

module.exports = { log, verify, GENESIS };
