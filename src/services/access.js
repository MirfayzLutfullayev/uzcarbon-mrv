/*
 * Ma'lumotga kirish doirasi (X2, FT-6.2, tijorat siri):
 *  - eksportyor — faqat o'z korxonasi;
 *  - verifikator — faqat tayinlangan inshoot va yil, faqat o'qish;
 *  - IMV, Soliq, Ekologiya, Bojxona — barcha korxonalar (o'z vakolati doirasida);
 *  - tahlilchi, Energetika, uslubiyot va tizim administratorlari — korxona darajasidagi ma'lumotga kirmaydi.
 */
"use strict";
const { ROLES } = require("../auth/rbac");
const { forbidden, notFound, HttpError } = require("../http/app");

function scopeOf(user) { return ROLES[user.role]?.scope || "none"; }

/** Foydalanuvchi ko'ra oladigan korxonalar: null — hammasi, [] — hech biri. */
function operatorIds(db, user) {
  const sc = scopeOf(user);
  if (sc === "all") return null;
  if (sc === "operator") return user.operator_id ? [user.operator_id] : [];
  if (sc === "assigned") {
    return db.all(`SELECT DISTINCT i.operator_id AS id FROM verifications v JOIN installations i ON i.id = v.installation_id WHERE v.verifier_id = ?`, user.verifier_id).map(r => r.id);
  }
  return [];
}

/** Verifikatorga tayinlangan (inshoot, yil) juftliklari. */
function verifierAssignments(db, user) {
  return db.all("SELECT installation_id, year, status FROM verifications WHERE verifier_id = ?", user.verifier_id);
}

function operator(db, user, operatorId) {
  const op = db.get("SELECT * FROM operators WHERE id = ?", operatorId);
  if (!op) throw notFound("Korxona topilmadi.");
  const ids = operatorIds(db, user);
  if (ids && !ids.includes(op.id)) throw forbidden("Bu korxona ma'lumotiga ruxsat yo'q.");
  return op;
}

/**
 * Inshootga kirishni tekshirish.
 * @param {{year?:number, write?:boolean}} opt verifikator uchun yil majburiy tekshiriladi; write — yozish huquqi
 */
function installation(db, user, installationId, opt = {}) {
  const inst = db.get("SELECT * FROM installations WHERE id = ?", installationId);
  if (!inst) throw notFound("Inshoot topilmadi.");
  const sc = scopeOf(user);
  if (sc === "assigned") {
    if (opt.write) throw forbidden("Verifikator ma'lumotni faqat o'qiy oladi.");
    const a = verifierAssignments(db, user).filter(x => x.installation_id === inst.id);
    if (!a.length) throw forbidden("Bu inshoot sizga tayinlanmagan.");
    if (opt.year != null && !a.some(x => x.year === opt.year)) throw forbidden(`${opt.year}-yil sizga tayinlanmagan.`);
    return inst;
  }
  const ids = operatorIds(db, user);
  if (ids && !ids.includes(inst.operator_id)) throw forbidden("Bu inshoot ma'lumotiga ruxsat yo'q.");
  if (opt.write && sc !== "operator") throw forbidden("Faqat korxona foydalanuvchilari ma'lumot kiritadi.");
  return inst;
}

function processRow(db, user, processId, opt = {}) {
  const p = db.get("SELECT * FROM processes WHERE id = ?", processId);
  if (!p) throw notFound("Jarayon topilmadi.");
  const inst = installation(db, user, p.installation_id, opt);
  return { process: p, installation: inst };
}

function streamRow(db, user, streamId, opt = {}) {
  const st = db.get("SELECT * FROM streams WHERE id = ?", streamId);
  if (!st) throw notFound("Manba oqimi topilmadi.");
  const r = processRow(db, user, st.process_id, opt);
  return { stream: st, ...r };
}

/** Verifikatsiyadan o'tgan (inshoot, yil) davri qulflangan: ma'lumot o'zgartirilmaydi. */
function assertNotLocked(db, installationId, year) {
  const v = db.get("SELECT id FROM verifications WHERE installation_id = ? AND year = ? AND status = 'concluded' AND opinion IN ('positive','qualified')", installationId, year);
  if (v) throw new HttpError(409, `${year}-yil ma'lumotlari verifikatsiyadan o'tgan va qulflangan. O'zgartirish uchun yangi tuzatish sikli kerak.`);
}

module.exports = { scopeOf, operatorIds, verifierAssignments, operator, installation, processRow, streamRow, assertNotLocked };
