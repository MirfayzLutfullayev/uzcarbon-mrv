/*
 * M8 — verifikatsiya: tayinlash (FT-6.1), faqat o'qish kirishi (FT-6.2), so'rovlar/nomuvofiqliklar/tuzatishlar,
 * xulosa va imzo (FT-6.3, ISO 14065 / 14064-3 oqimi), natijani qulflash (M8.5).
 * ERI imzosi I10 adapteri orqali ulanadi; hozircha server kaliti bilan HMAC "mock-ERI" imzo.
 */
"use strict";
const crypto = require("crypto");
const audit = require("../db/audit");
const { now, newId } = require("../db/db");
const { bad, forbidden, notFound, HttpError } = require("../http/app");
const { clean } = require("../http/validate");
const { verifyTotp } = require("../auth/crypto");
const A = require("../services/access");
const { camel } = require("../services/util");
const notify = require("../services/notify");

function signPayload(key, payload) {
  return "mock-ERI:" + crypto.createHmac("sha256", key).update(JSON.stringify(payload)).digest("hex");
}

function register(app) {
  const s = app.s, { db } = s;
  const log = (ctx, action, entity, entityId, after) => audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action, entity, entityId, after, ip: ctx.ip });

  const loadVer = (ctx, id) => {
    const v = db.get("SELECT * FROM verifications WHERE id = ?", id);
    if (!v) throw notFound("Verifikatsiya topilmadi.");
    if (A.scopeOf(ctx.user) === "assigned") { if (v.verifier_id !== ctx.user.verifier_id) throw forbidden(); }
    else A.installation(db, ctx.user, v.installation_id);
    return v;
  };
  const out = v => {
    const r = camel(v);
    r.installationName = db.get("SELECT name FROM installations WHERE id = ?", v.installation_id)?.name;
    r.verifierName = db.get("SELECT name FROM verifiers WHERE id = ?", v.verifier_id)?.name;
    r.findings = db.all("SELECT * FROM findings WHERE verification_id = ? ORDER BY created_at", v.id).map(f => camel(f));
    r.results = db.all(`SELECT c.id, c.process_id, p.name AS process_name, c.version, c.status, c.see_cbam, c.see_applied, c.basis FROM calc_results c JOIN processes p ON p.id = c.process_id
      WHERE p.installation_id = ? AND c.year = ? AND c.status IN ('submitted','verified') ORDER BY p.name`, v.installation_id, v.year).map(x => camel(x));
    return r;
  };

  app.get("/api/verifications", { perm: "verification.read" }, ctx => {
    let rows;
    if (A.scopeOf(ctx.user) === "assigned") rows = db.all("SELECT * FROM verifications WHERE verifier_id = ? ORDER BY year DESC", ctx.user.verifier_id);
    else {
      const ids = A.operatorIds(db, ctx.user);
      rows = db.all("SELECT v.*, i.operator_id FROM verifications v JOIN installations i ON i.id = v.installation_id ORDER BY v.year DESC");
      if (ids) rows = rows.filter(r => ids.includes(r.operator_id));
    }
    return rows.map(out);
  });
  app.get("/api/verifications/:id", { perm: "verification.read" }, ctx => out(loadVer(ctx, ctx.params.id)));

  // Eksportyor verifikatorni tayinlaydi
  app.post("/api/verifications", { perm: "verification.assign" }, ctx => {
    const b = clean(ctx.body, { installationId: { t: "str", req: true, max: 60 }, year: { t: "int", req: true, min: 2020, max: 2040 }, verifierId: { t: "str", req: true, max: 60 } });
    const inst = A.installation(db, ctx.user, b.installationId, { write: true });
    const ver = db.get("SELECT * FROM verifiers WHERE id = ?", b.verifierId);
    if (!ver) throw bad("Verifikator reyestrda yo'q.");
    if (ver.accredited_until < now().slice(0, 10)) throw bad("Verifikatorning akkreditatsiya muddati tugagan.");
    if (db.get("SELECT id FROM verifications WHERE installation_id = ? AND year = ? AND status <> 'concluded'", inst.id, b.year)) throw new HttpError(409, "Bu inshoot va yil uchun ochiq verifikatsiya bor.");
    const id = newId("vfy");
    db.run("INSERT INTO verifications (id, installation_id, year, verifier_id, status, assigned_by, created_at) VALUES (?,?,?,?, 'assigned', ?, ?)", id, inst.id, b.year, b.verifierId, ctx.user.id, now());
    log(ctx, "verification.assign", "verification", id, b);
    notify.toVerifier(db, b.verifierId, "verification", `Sizga yangi topshiriq: "${inst.name}", ${b.year}-yil.`, `#/verification/${id}`);
    return out(db.get("SELECT * FROM verifications WHERE id = ?", id));
  });

  // Verifikator: so'rov, nomuvofiqlik, izoh yoki namuna (sampling)
  app.post("/api/verifications/:id/findings", { perm: "verification.work" }, ctx => {
    const v = loadVer(ctx, ctx.params.id);
    if (v.status === "concluded") throw new HttpError(409, "Verifikatsiya yakunlangan.");
    const b = clean(ctx.body, { kind: { t: "enum", req: true, vals: ["request", "nonconformity", "comment", "sample"] }, text: { t: "str", req: true, max: 4000 } });
    const id = newId("fnd");
    db.run("INSERT INTO findings (id, verification_id, kind, text, status, created_by, created_at) VALUES (?,?,?,?, ?, ?, ?)", id, v.id, b.kind, b.text, b.kind === "comment" || b.kind === "sample" ? "closed" : "open", ctx.user.id, now());
    if (v.status === "assigned") db.run("UPDATE verifications SET status = 'in_progress' WHERE id = ?", v.id);
    log(ctx, "verification.finding", "finding", id, { verificationId: v.id, ...b });
    const inst = db.get("SELECT operator_id, name FROM installations WHERE id = ?", v.installation_id);
    if (b.kind === "request" || b.kind === "nonconformity") notify.toOperator(db, inst.operator_id, "verification", `Verifikator ${b.kind === "request" ? "so'rov" : "nomuvofiqlik"} qoldirdi: "${inst.name}", ${v.year}.`, `#/verification/${v.id}`);
    return out(db.get("SELECT * FROM verifications WHERE id = ?", v.id));
  });
  // Eksportyor javobi / tuzatish
  app.post("/api/findings/:id/respond", { perm: "verification.respond" }, ctx => {
    const f = db.get("SELECT * FROM findings WHERE id = ?", ctx.params.id);
    if (!f) throw notFound();
    const v = loadVer(ctx, f.verification_id);
    if (A.scopeOf(ctx.user) !== "operator") throw forbidden();
    if (f.status !== "open") throw new HttpError(409, "Bu band ochiq emas.");
    const b = clean(ctx.body, { response: { t: "str", req: true, max: 4000 } });
    db.run("UPDATE findings SET status = 'responded', response = ?, responded_by = ?, responded_at = ? WHERE id = ?", b.response, ctx.user.id, now(), f.id);
    log(ctx, "verification.respond", "finding", f.id, b);
    return out(db.get("SELECT * FROM verifications WHERE id = ?", v.id));
  });
  app.post("/api/findings/:id/close", { perm: "verification.work" }, ctx => {
    const f = db.get("SELECT * FROM findings WHERE id = ?", ctx.params.id);
    if (!f) throw notFound();
    const v = loadVer(ctx, f.verification_id);
    db.run("UPDATE findings SET status = 'closed', closed_at = ? WHERE id = ?", now(), f.id);
    log(ctx, "verification.close_finding", "finding", f.id, null);
    return out(db.get("SELECT * FROM verifications WHERE id = ?", v.id));
  });

  // Yakuniy xulosa va imzo. Imzo uchun 2FA kodi qayta so'raladi (ERI o'rnini bosuvchi tasdiq).
  app.post("/api/verifications/:id/conclude", { perm: "verification.work" }, ctx => {
    const v = loadVer(ctx, ctx.params.id);
    if (v.status === "concluded") throw new HttpError(409, "Verifikatsiya allaqachon yakunlangan.");
    const b = clean(ctx.body, { opinion: { t: "enum", req: true, vals: ["positive", "qualified", "negative"] }, conclusion: { t: "str", req: true, max: 8000 }, code: { t: "str", max: 6 } });
    const u = db.get("SELECT * FROM users WHERE id = ?", ctx.user.id);
    if (u.totp_enabled) {
      const step = verifyTotp(u.totp_secret, b.code, u.totp_last_step);
      if (step == null) throw new HttpError(401, "Imzolash uchun 2FA kodi noto'g'ri.");
      db.run("UPDATE users SET totp_last_step = ? WHERE id = ?", step, u.id);
    }
    const open = db.all("SELECT id FROM findings WHERE verification_id = ? AND kind = 'nonconformity' AND status <> 'closed'", v.id);
    if (b.opinion !== "negative" && open.length) throw new HttpError(409, `Yopilmagan nomuvofiqliklar bor (${open.length} ta) — ijobiy xulosa berib bo'lmaydi.`);
    const results = db.all(`SELECT c.id, c.inputs_hash, c.see_cbam FROM calc_results c JOIN processes p ON p.id = c.process_id WHERE p.installation_id = ? AND c.year = ? AND c.status = 'submitted'`, v.installation_id, v.year);
    if (b.opinion !== "negative" && !results.length) throw new HttpError(409, "Topshirilgan hisob natijasi yo'q — avval eksportyor natijani topshirishi kerak.");
    const signedAt = now();
    const payload = { verificationId: v.id, installationId: v.installation_id, year: v.year, opinion: b.opinion, results: results.map(r => ({ id: r.id, inputsHash: r.inputs_hash, seeCbam: r.see_cbam })), signedAt, signer: u.login };
    const signature = signPayload(s.config.signingKey(), payload);
    db.tx(() => {
      db.run("UPDATE verifications SET status = 'concluded', opinion = ?, conclusion = ?, signed_at = ?, signed_by = ?, signature = ? WHERE id = ?", b.opinion, b.conclusion, signedAt, u.id, signature, v.id);
      if (b.opinion !== "negative") for (const r of results) db.run("UPDATE calc_results SET status = 'verified', locked = 1 WHERE id = ?", r.id);
      log(ctx, "verification.conclude", "verification", v.id, { opinion: b.opinion, signature, results: results.length });
    });
    const inst = db.get("SELECT operator_id, name FROM installations WHERE id = ?", v.installation_id);
    notify.toOperator(db, inst.operator_id, "verification", `Verifikatsiya yakunlandi: "${inst.name}", ${v.year} — ${b.opinion === "negative" ? "salbiy" : "ijobiy"} xulosa.`, `#/verification/${v.id}`);
    return out(db.get("SELECT * FROM verifications WHERE id = ?", v.id));
  });
}

module.exports = { register, signPayload };
