/* Server API testlari: npm test (vaqtinchalik papkada ishlaydi, data/db.json ga tegmaydi) */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "uzcarbon-"));
process.env.ANTHROPIC_API_KEY = "";
const { app } = require("../server.js");

let base, server;
test.before(async () => {
  server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const req = (method, url, body) => fetch(base + url, {
  method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, body: await r.json() }));

test("holat: namuna ma'lumotlar bilan boshlanadi, AI o'chiq", async () => {
  const r = await req("GET", "/api/state");
  assert.equal(r.status, 200);
  assert.equal(r.body.installations.length, 3);
  assert.equal(r.body.records.length, 18);
  assert.equal(r.body.aiEnabled, false);
});

test("inshoot qo'shish va noto'g'ri STIR ni rad etish", async () => {
  const ok = await req("PUT", "/api/installations/test-1", { name: "Test liniya", exporter: "Test AJ", sector: "cement", stir: "123456789" });
  assert.equal(ok.status, 200);
  const bad = await req("PUT", "/api/installations/test-2", { name: "X", exporter: "Y", sector: "cement", stir: "12" });
  assert.equal(bad.status, 400);
});

test("hisobot davri: mahsulotsiz yozuv rad etiladi, to'g'risi saqlanadi", async () => {
  const bad = await req("PUT", "/api/records/test-1_2026_Q1", { instId: "test-1", year: 2026, q: "Q1", fuels: { gas: 10 } });
  assert.equal(bad.status, 400);
  const ok = await req("PUT", "/api/records/test-1_2026_Q1", { instId: "test-1", year: 2026, q: "Q1", fuels: { gas: 10 }, output: 100, exportEU: 10 });
  assert.equal(ok.status, 200);
});

test("inshoot o'chirilganda uning davrlari ham o'chadi", async () => {
  await req("DELETE", "/api/installations/test-1");
  const st = await req("GET", "/api/state");
  assert.ok(!st.body.records.some(r => r.instId === "test-1"));
});

test("AI kalitsiz 503 qaytaradi", async () => {
  const r = await req("POST", "/api/ai/chat", { messages: [{ role: "user", content: "salom" }] });
  assert.equal(r.status, 503);
});
