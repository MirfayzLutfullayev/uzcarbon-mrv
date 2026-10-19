/* Bildirishnomalar (M10.5): foydalanuvchiga, korxonaga, rolga yoki verifikatorga. */
"use strict";
const { now, newId } = require("../db/db");

function add(db, { userId = null, operatorId = null, role = null, kind, text, link = null }) {
  db.run("INSERT INTO notifications (id, user_id, operator_id, role, kind, text, link, created_at) VALUES (?,?,?,?,?,?,?,?)", newId("ntf"), userId, operatorId, role, kind, text, link, now());
}
const toOperator = (db, operatorId, kind, text, link) => add(db, { operatorId, kind, text, link });
const toRole = (db, role, kind, text, link) => add(db, { role, kind, text, link });
function toVerifier(db, verifierId, kind, text, link) {
  for (const u of db.all("SELECT id FROM users WHERE verifier_id = ?", verifierId)) add(db, { userId: u.id, kind, text, link });
}

/** Foydalanuvchiga tegishli bildirishnomalar (o'qilganlik belgisi bilan). */
function forUser(db, user, limit = 50) {
  return db.all(`SELECT n.*, r.read_at FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
    WHERE n.user_id = ? OR (n.operator_id IS NOT NULL AND n.operator_id = ?) OR (n.role IS NOT NULL AND n.role = ?) OR (n.user_id IS NULL AND n.operator_id IS NULL AND n.role IS NULL)
    ORDER BY n.created_at DESC LIMIT ?`, user.id, user.id, user.operator_id || "", user.role, limit);
}

/**
 * MRV sikli muddatlari (TZ-2 9-bo'lim): yillik hisobot 31-mart, verifikatsiya 30-iyun, importyor deklaratsiyasi 30-sentabr.
 * @returns {Array<{date:string, title:string, daysLeft:number}>}
 */
function deadlines(today = new Date()) {
  const y = today.getUTCFullYear();
  const list = [];
  for (const year of [y, y + 1]) {
    list.push({ date: `${year}-01-31`, title: `${year}-yil monitoring rejasini tasdiqlash` });
    list.push({ date: `${year}-03-31`, title: `${year - 1}-yil yillik emissiya hisoboti` });
    list.push({ date: `${year}-06-30`, title: `${year - 1}-yil verifikatsiyasi` });
    list.push({ date: `${year}-09-30`, title: `${year - 1}-yil importi bo'yicha EI importyori CBAM deklaratsiyasi` });
  }
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return list.map(d => ({ ...d, daysLeft: Math.round((Date.parse(d.date) - t0) / 864e5) })).filter(d => d.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 4);
}

module.exports = { add, toOperator, toRole, toVerifier, forUser, deadlines };
