/*
 * Hisob servisi: jarayon ma'lumotlarini bazadan yuklaydi, yadroni chaqiradi (prekursorlar rekursiv),
 * natijani ishlatilgan ma'lumotnoma versiyalari bilan saqlaydi (M4.5–M4.7, FT-3.5, FT-3.6).
 */
"use strict";
const crypto = require("crypto");
const core = require("../core");
const audit = require("../db/audit");
const { now, newId, parseJson } = require("../db/db");
const { camel } = require("./util");

function streamsOf(db, processId) {
  return db.all("SELECT * FROM streams WHERE process_id = ? ORDER BY created_at, id", processId).map(r => camel(r));
}
function activityOf(db, processId, year) {
  const rows = db.all(`SELECT a.* FROM activity a JOIN streams s ON s.id = a.stream_id WHERE s.process_id = ? AND a.year = ?`, processId, year);
  const map = {};
  for (const r of rows) (map[r.stream_id] ||= {})[r.month] = { value: r.value, extra: parseJson(r.extra, {}), status: r.status, sourceLevel: r.source_level };
  return map;
}
function isVerified(db, installationId, year) {
  return !!db.get("SELECT id FROM verifications WHERE installation_id = ? AND year = ? AND status = 'concluded' AND opinion IN ('positive','qualified')", installationId, year);
}

/**
 * Jarayonni hisoblash (saqlamasdan).
 * @param {{db:any, ref:any}} s
 */
function computeProcess(s, processId, year, { visited, snapshot, months } = {}) {
  const pr = s.db.get("SELECT p.*, i.operator_id FROM processes p JOIN installations i ON i.id = p.installation_id WHERE p.id = ?", processId);
  if (!pr) throw Object.assign(new Error("Jarayon topilmadi."), { status: 404 });
  const ref = snapshot || s.ref.snapshot(`${year}-12-31`);
  const streams = streamsOf(s.db, processId);
  const activity = activityOf(s.db, processId, year);
  // Joriy (tugallanmagan) yil: hisob yil boshidan oxirgi tugagan oygacha (YTD); kelajak oylari "bo'shliq" sanalmaydi.
  let ytd = null;
  if (!months) {
    const t = new Date();
    if (year === t.getUTCFullYear() && t.getUTCMonth() < 12) {
      const done = Math.max(1, t.getUTCMonth());
      months = Array.from({ length: done }, (_, i) => i + 1);
      ytd = done;
    }
  }
  const result = core.calculateProcess({
    process: { id: pr.id, name: pr.name, goodsGroup: pr.goods_group, tifCode: pr.tif_code },
    streams, activity, year, ref, visited, months,
    verified: isVerified(s.db, pr.installation_id, year),
    resolvePrecursor: (pid, v) => {
      const other = s.db.get("SELECT p.id, i.operator_id FROM processes p JOIN installations i ON i.id = p.installation_id WHERE p.id = ?", pid);
      if (!other) throw new Error("Ichki prekursor jarayoni topilmadi.");
      if (other.operator_id !== pr.operator_id) throw new Error("Ichki prekursor faqat shu korxona jarayonidan bo'lishi mumkin; boshqa korxonadan — \"yetkazib beruvchi\" turini tanlang.");
      const r = computeProcess(s, pid, year, { visited: v, snapshot: ref });
      return { seeDir: r.see.seeDir, seeInd: r.see.seeInd, name: r.processName };
    },
  });
  if (ytd) { result.ytdMonths = ytd; result.warnings.unshift(`Joriy yil: hisob 1–${ytd}-oylar ma'lumoti asosida (yil boshidan, YTD). Yillik yakuniy natija yil tugagach hisoblanadi.`); }
  result.installationId = pr.installation_id;
  result.operatorId = pr.operator_id;
  result.refs = ref.usedList();
  result.inputsHash = crypto.createHash("sha256").update(JSON.stringify({ streams, activity })).digest("hex");
  return result;
}

/** Natijani yangi versiya sifatida saqlash. */
function saveResult(s, processId, year, user) {
  return s.db.tx(() => {
    const r = computeProcess(s, processId, year);
    const v = (s.db.get("SELECT MAX(version) AS v FROM calc_results WHERE process_id = ? AND year = ?", processId, year).v || 0) + 1;
    const id = newId("res");
    s.db.run(`INSERT INTO calc_results (id, process_id, year, version, status, result, refs, inputs_hash, see_cbam, see_applied, basis, created_by, created_at)
      VALUES (?,?,?,?, 'draft', ?,?,?,?,?,?,?,?)`, id, processId, year, v, JSON.stringify(r), JSON.stringify(r.refs), r.inputsHash,
      Number.isFinite(r.see.seeCbam) ? r.see.seeCbam : null, Number.isFinite(r.selection.applied) ? r.selection.applied : null, r.selection.basis, user.id, now());
    audit.log(s.db, { actor: user.id, role: user.role, action: "calc.save", entity: "calc_result", entityId: id, after: { processId, year, version: v, seeCbam: r.see.seeCbam, basis: r.selection.basis } });
    return getResult(s, id);
  });
}

function getResult(s, id) {
  const r = s.db.get("SELECT * FROM calc_results WHERE id = ?", id);
  return r && { ...camel(r, ["result", "refs"]) };
}

/** Ikki versiyani solishtirish (FT-3.6): asosiy ko'rsatkichlar va o'zgargan ma'lumotnoma versiyalari. */
function compareResults(a, b) {
  const pick = r => ({
    "SEE (to'g'ridan-to'g'ri)": r.result.see.seeDir, "SEE (bilvosita)": r.result.see.seeInd, "SEE CBAM": r.result.see.seeCbam,
    "Qo'llangan SEE": r.result.selection.applied, "DirEm, t": r.result.totals.dirEm, "AttrEm, t": r.result.totals.attrDir,
    "Elektr, t": r.result.totals.emEl, "AL, t": r.result.totals.al,
  });
  const A = pick(a), B = pick(b);
  const metrics = Object.keys(A).map(k => ({ metric: k, a: A[k], b: B[k], diff: (B[k] ?? 0) - (A[k] ?? 0), diffPct: A[k] ? ((B[k] - A[k]) / A[k]) : null }));
  const refA = new Map(a.refs.map(x => [x.key, x.version])), refB = new Map(b.refs.map(x => [x.key, x.version]));
  const refs = [...new Set([...refA.keys(), ...refB.keys()])].filter(k => refA.get(k) !== refB.get(k)).map(k => ({ key: k, a: refA.get(k) ?? null, b: refB.get(k) ?? null }));
  return { a: { id: a.id, version: a.version, createdAt: a.createdAt }, b: { id: b.id, version: b.version, createdAt: b.createdAt }, metrics, refs, inputsChanged: a.inputsHash !== b.inputsHash };
}

/** Rasmiy (eng so'nggi topshirilgan/verifikatsiyalangan, bo'lmasa so'nggi) natija yoki jonli hisob. */
function officialSee(s, processId, year) {
  const row = s.db.get(`SELECT * FROM calc_results WHERE process_id = ? AND year = ? ORDER BY CASE status WHEN 'verified' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END, version DESC LIMIT 1`, processId, year);
  if (row) { const r = camel(row, ["result", "refs"]); return { source: "saved", status: r.status, version: r.version, result: r.result }; }
  return { source: "live", status: "live", version: null, result: computeProcess(s, processId, year) };
}

module.exports = { computeProcess, saveResult, getResult, compareResults, officialSee, isVerified, streamsOf, activityOf };
