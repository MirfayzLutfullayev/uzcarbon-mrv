/*
 * API va xavfsizlik testlari (vaqtinchalik baza). Qamrov: autentifikatsiya va 2FA, CSRF, RBAC va korxona izolyatsiyasi,
 * reyestr → ma'lumot → hisob → topshirish → verifikatsiya → qulflash → hujjatlar paketi, ikki shaxs qoidasi, audit zanjiri.
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uzc-test-"));
process.env.DATA_DIR = tmp;
const { createApp } = require("../src/app");
const C = require("../src/auth/crypto");
const { now } = require("../src/db/db");

const app = createApp({ dbFile: path.join(tmp, "t.db"), overrides: { MFA_ENFORCE: true, AI_EXTERNAL_ALLOWED: false } });
const { db } = app.s;
const PW = "Sinov2026parol";
let base;

function addUser(login, role, extra = {}) {
  const mfa = require("../src/auth/rbac").ROLES[role].mfa;
  const secret = mfa ? C.newTotpSecret() : null;
  db.run("INSERT INTO users (id, login, name, role, operator_id, verifier_id, importer_id, password_hash, totp_secret, totp_enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    "u_" + login, login, login, role, extra.op || null, extra.ver || null, extra.imp || null, C.hashPassword(PW), secret, mfa ? 1 : 0, now(), now());
  return secret;
}
async function session(login) {
  let cookie = "";
  const call = async (method, url, body, headers = {}) => {
    const r = await fetch(base + url, { method, headers: { "content-type": "application/json", "x-uzc": "1", cookie, ...headers }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    const ct = r.headers.get("content-type") || "";
    return { status: r.status, body: ct.includes("json") ? await r.json() : await r.text(), headers: r.headers };
  };
  const l = await call("POST", "/api/auth/login", { login, password: PW });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  if (l.body.mfa === "verify") {
    // Qayta ishlatish himoyasi bir 30 s oynada bitta kodga ruxsat beradi; testda ketma-ket kirishlar uchun holat tiklanadi.
    db.run("UPDATE users SET totp_last_step = NULL WHERE login = ?", login);
    const u = db.get("SELECT totp_secret FROM users WHERE login = ?", login);
    const m = await call("POST", "/api/auth/mfa", { code: C.totp(u.totp_secret) });
    assert.equal(m.status, 200, JSON.stringify(m.body));
  }
  return call;
}

test.before(async () => {
  await new Promise(r => app.server.listen(0, r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  db.run("INSERT INTO operators (id, stir, name, created_at, updated_at) VALUES ('op_a','111111111','A AJ',?,?), ('op_b','222222222','B AJ',?,?)", now(), now(), now(), now());
  db.run("INSERT INTO verifiers (id, name, accreditation_no, accredited_until, created_at, updated_at) VALUES ('v1','Ver','ACC-1','2030-12-31',?,?)", now(), now());
  addUser("a_spec", "exporter_specialist", { op: "op_a" });
  addUser("a_admin", "exporter_admin", { op: "op_a" });
  addUser("b_spec", "exporter_specialist", { op: "op_b" });
  addUser("ver", "verifier", { ver: "v1" });
  addUser("m1", "methodology_admin"); addUser("m2", "methodology_admin");
  addUser("analyst", "gov_analyst"); addUser("sys", "sysadmin");
});
test.after(() => app.server.close());

test("Kirish: noto'g'ri parol 401, CSRF sarlavhasisiz 403, sessiyasiz 401", async () => {
  const bad = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-uzc": "1" }, body: JSON.stringify({ login: "a_spec", password: "xato-parol-123" }) });
  assert.equal(bad.status, 401);
  const csrf = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: "a_spec", password: PW }) });
  assert.equal(csrf.status, 403);
  assert.equal((await fetch(base + "/api/installations")).status, 401);
});

test("2FA: administrator koddan oldin ma'lumotga kira olmaydi; noto'g'ri kod rad etiladi", async () => {
  let cookie = "";
  const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-uzc": "1" }, body: JSON.stringify({ login: "a_admin", password: PW }) });
  cookie = r.headers.get("set-cookie").split(";")[0];
  assert.equal((await r.json()).mfa, "verify");
  const blocked = await fetch(base + "/api/installations", { headers: { cookie } });
  assert.equal(blocked.status, 401);
  const wrong = await fetch(base + "/api/auth/mfa", { method: "POST", headers: { "content-type": "application/json", "x-uzc": "1", cookie }, body: JSON.stringify({ code: "000000" }) });
  assert.equal(wrong.status, 401);
});

test("Xavfsizlik sarlavhalari: CSP, nosniff, frame-ancestors", async () => {
  const r = await fetch(base + "/");
  assert.match(r.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
});

let instId, procId, streams = {};
test("To'liq MRV oqimi: reyestr → shablon → oylik ma'lumot → hisob", async () => {
  const a = await session("a_admin");
  const inst = await a("POST", "/api/installations", { name: "Sement zavodi", region: "Jizzax", unlocode: "UZJIZ" });
  assert.equal(inst.status, 200, JSON.stringify(inst.body)); instId = inst.body.id;
  const pr = await a("POST", "/api/processes", { installationId: instId, name: "Sement", goodsGroup: "cement", tifCode: "2523290000" });
  assert.equal(pr.status, 200); procId = pr.body.id;
  const tpl = await a("POST", `/api/processes/${procId}/apply-template`);
  assert.equal(tpl.status, 200); assert.equal(tpl.body.length, 4);
  for (const s of tpl.body) streams[s.type] = s.id;
  const entries = [];
  for (let m = 1; m <= 12; m++) {
    entries.push({ streamId: streams.fuel, month: m, value: 8000 }, { streamId: streams.clinker, month: m, value: 95000, extra: { wCaO: 65, wMgO: 1.5 } },
      { streamId: streams.electricity, month: m, value: 12000 }, { streamId: streams.product, month: m, value: 120000 });
  }
  const put = await a("PUT", `/api/processes/${procId}/activity`, { year: 2025, entries });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const neg = await a("PUT", `/api/processes/${procId}/activity`, { year: 2025, entries: [{ streamId: streams.fuel, month: 1, value: -5 }] });
  assert.equal(neg.status, 400);
  const calc = await a("GET", `/api/processes/${procId}/calc?year=2025`);
  assert.equal(calc.status, 200);
  const expectDir = (96000 * 0.038 * 56 + 1.14e6 * (0.65 * 0.785 + 0.015 * 1.092)) / 1.44e6;
  assert.ok(Math.abs(calc.body.see.seeDir - expectDir) / expectDir < 1e-9);
  // Verifikatsiyasiz haqiqiy ma'lumot rasmiy hisobga kirmaydi: standart qiymat (2025 — o'tish davri, mark-up 0) qo'llanadi
  assert.equal(calc.body.selection.basis, "default");
  assert.ok(Math.abs(calc.body.selection.applied - 1.41) < 1e-9);
});

test("Korxona izolyatsiyasi: B korxonasi A inshootini ko'ra olmaydi va yoza olmaydi", async () => {
  const b = await session("b_spec");
  assert.equal((await b("GET", `/api/installations/${instId}`)).status, 403);
  assert.equal((await b("GET", `/api/processes/${procId}/calc?year=2025`)).status, 403);
  assert.equal((await b("PUT", `/api/processes/${procId}/activity`, { year: 2025, entries: [] })).status, 403);
  const an = await session("analyst");
  assert.equal((await an("GET", "/api/installations")).status, 403);
  assert.equal((await an("GET", "/api/dashboard/gov?year=2025")).status, 200);
});

test("Verifikatsiya: tayinlash → faqat o'qish → nomuvofiqlik → javob → xulosa → qulflash → paket", async () => {
  const a = await session("a_admin");
  const saved = await a("POST", `/api/processes/${procId}/results`, { year: 2025 });
  assert.equal(saved.status, 200);
  assert.equal((await a("POST", `/api/results/${saved.body.id}/submit`)).status, 200);
  const as = await a("POST", "/api/verifications", { installationId: instId, year: 2025, verifierId: "v1" });
  assert.equal(as.status, 200); const vId = as.body.id;

  const v = await session("ver");
  assert.equal((await v("GET", `/api/processes/${procId}/calc?year=2025`)).status, 200);
  assert.equal((await v("GET", `/api/processes/${procId}/calc?year=2024`)).status, 403, "tayinlanmagan yil");
  assert.equal((await v("PUT", `/api/processes/${procId}/activity`, { year: 2025, entries: [] })).status, 403, "verifikator yoza olmaydi");
  const f = await v("POST", `/api/verifications/${vId}/findings`, { kind: "nonconformity", text: "Kalibrovka sertifikati yo'q." });
  assert.equal(f.status, 200);
  const fid = f.body.findings[0].id;
  const u = db.get("SELECT totp_secret FROM users WHERE login = 'ver'");
  db.run("UPDATE users SET totp_last_step = NULL WHERE login = 'ver'");
  const early = await v("POST", `/api/verifications/${vId}/conclude`, { opinion: "positive", conclusion: "OK", code: C.totp(u.totp_secret, Date.now() + 30000) });
  assert.equal(early.status, 409, "yopilmagan nomuvofiqlik bilan ijobiy xulosa yo'q");
  assert.equal((await a("POST", `/api/findings/${fid}/respond`, { response: "Sertifikat yuklandi." })).status, 200);
  assert.equal((await v("POST", `/api/findings/${fid}/close`)).status, 200);
  db.run("UPDATE users SET totp_last_step = NULL WHERE login = 'ver'");
  const done = await v("POST", `/api/verifications/${vId}/conclude`, { opinion: "positive", conclusion: "Jiddiy nomuvofiqlik yo'q.", code: C.totp(u.totp_secret) });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.match(done.body.signature, /^mock-ERI:/);

  const locked = await a("PUT", `/api/processes/${procId}/activity`, { year: 2025, entries: [{ streamId: streams.fuel, month: 1, value: 1 }] });
  assert.equal(locked.status, 409, "verifikatsiyadan o'tgan davr qulflangan");
  const calc = await a("GET", `/api/processes/${procId}/calc?year=2025`);
  assert.equal(calc.body.selection.basis, "actual");

  const pkg = await a("GET", `/api/reports/package?installationId=${instId}&year=2025&format=json`);
  assert.equal(pkg.status, 200);
  const p = typeof pkg.body === "string" ? JSON.parse(pkg.body) : pkg.body;
  assert.equal(p.verification.opinion, "positive");
  assert.match(p.seal.hash, /^[a-f0-9]{64}$/);
  const ver = await fetch(`${base}/api/public/verify?hash=${p.seal.hash}`).then(r => r.json());
  assert.equal(ver.issued, true);
  for (const f of ["xml", "html", "docx", "xlsx"]) assert.equal((await a("GET", `/api/reports/package?installationId=${instId}&year=2025&format=${f}`)).status, 200, f);
});

test("Ma'lumotnoma: ikki shaxs qoidasi va versiyalash (eski hisob eski qiymatda qoladi)", async () => {
  const m1 = await session("m1"), m2 = await session("m2");
  const p = await m1("POST", "/api/refdata/proposals", { key: "grid.ef", value: 0.42, source: "Energetika vazirligi (sinov)", validFrom: "2026-01-01" });
  assert.equal(p.status, 200);
  assert.equal((await m1("POST", `/api/refdata/proposals/${p.body.id}/approve`)).status, 403);
  assert.equal((await m2("POST", `/api/refdata/proposals/${p.body.id}/approve`)).status, 200);
  assert.equal(app.s.ref.snapshot("2025-12-31").get("grid.ef"), 0.5);
  assert.equal(app.s.ref.snapshot("2026-06-30").get("grid.ef"), 0.42);
  const badv = await m1("POST", "/api/refdata/proposals", { key: "cbam.cf.2027", value: 1.5, source: "x", validFrom: "2026-01-01" });
  assert.equal(badv.status, 400);
  const sp = await session("a_spec");
  assert.equal((await sp("POST", "/api/refdata/proposals", { key: "grid.ef", value: 0.1, source: "x", validFrom: "2026-01-01" })).status, 403);
});

test("Partiyalar: EI tashqarisi rad etiladi; CBAM hisobi va ssenariy", async () => {
  const a = await session("a_admin");
  assert.equal((await a("POST", "/api/batches", { declarationNo: "D-1", date: "2026-03-01", tifCode: "2523290000", netT: 1000, country: "TR" })).status, 400);
  const ok = await a("POST", "/api/batches", { declarationNo: "D-2", date: "2026-03-01", tifCode: "2523290000", netT: 1000, country: "DE" });
  assert.equal(ok.status, 200); assert.equal(ok.body.processId, procId, "TIF bo'yicha avtomatik bog'lanadi");
  const cb = await a("GET", "/api/cbam/operator/op_a?year=2026");
  assert.equal(cb.status, 200); assert.equal(cb.body.batches.length, 1);
  const sc = await a("GET", "/api/cbam/scenario?ee=502690.8&baseYear=2025&etsUsd=87");
  assert.equal(sc.status, 200);
  assert.ok(Math.abs(sc.body.rows[8].gross / 1e6 - 43.73) < 0.01);
});

test("Audit izi: zanjir butun; yozuvni o'zgartirish taqiqlangan", async () => {
  const sys = await session("sys");
  const v = await sys("GET", "/api/audit/verify");
  assert.equal(v.status, 200); assert.equal(v.body.ok, true); assert.ok(v.body.count > 10);
  assert.throws(() => db.run("UPDATE audit SET action = 'x' WHERE seq = 1"), /o'zgartirilmaydi/);
  assert.throws(() => db.run("DELETE FROM audit WHERE seq = 1"), /o'chirilmaydi/);
  assert.equal((await sys("PUT", `/api/processes/${procId}/activity`, { year: 2026, entries: [] })).status, 403, "tizim administratori biznes ma'lumotini o'zgartirmaydi");
});
