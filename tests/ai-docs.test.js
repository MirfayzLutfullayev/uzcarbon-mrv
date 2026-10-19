/* SI komponentlari va hujjat formatlari testlari. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isolationForest } = require("../src/ai/iforest");
const kb = require("../src/ai/kb");
const { writeXlsx, readXlsx } = require("../src/docs/xlsx");
const { zip, unzip } = require("../src/docs/zip");
const { parseCsv } = require("../src/docs/csv");
const { tifRowsToEntries } = require("../src/api/admin");
const { validateValue } = require("../src/db/refdata");

test("AI-3 Isolation Forest: aniq chetga chiqqan kuzatuv eng yuqori ball oladi", () => {
  const X = Array.from({ length: 24 }, (_, i) => [0.62 + 0.01 * Math.sin(i), 0.0023 + 0.00005 * Math.cos(i), 100 + (i % 3)]);
  X[10] = [0.62, 0.0035, 101]; // yoqilg'i intensivligi +50%
  const s = isolationForest(X, { seed: 1 });
  const max = s.indexOf(Math.max(...s));
  assert.equal(max, 10);
  assert.ok(s[10] > 0.6);
});

test("AI-8 bilimlar bazasi: savolga manbali parchalar qaytadi, mavzudan tashqarida bo'sh", () => {
  const r = kb.search("standart qiymat mark-up o'g'itlar uchun necha foiz");
  assert.ok(r.length > 0 && r.some(x => x.id === "tz2-default"));
  assert.equal(kb.search("futbol natijalari").length, 0);
});

test("ZIP va XLSX: yozish → o'qish (raqam, matn, kirill)", () => {
  const z = unzip(zip([{ name: "a.txt", data: "salom" }, { name: "b/c.txt", data: Buffer.from([1, 2, 3]) }]));
  assert.equal(z.get("a.txt").toString(), "salom");
  assert.deepEqual([...z.get("b/c.txt")], [1, 2, 3]);
  const buf = writeXlsx([{ name: "T", rows: [["Kod", "Nomi", "Standart"], ["2523290000", "Портландцемент", 1.41], ["7201100000", "Cho'yan", "-"]] }]);
  const rows = readXlsx(buf);
  assert.deepEqual(rows[1], ["2523290000", "Портландцемент", 1.41]);
  assert.equal(rows[2][2], "-");
});

test("TIF jadvali importi: 8 xonali kod, \"−\" va guruhni kod bo'yicha aniqlash", () => {
  const { entries, errors } = tifRowsToEntries([["CN code", "Description", "Default value total"], ["25232900", "Portland cement grey", 1.41], ["72011000", "Pig iron", "–"], ["31023010", "Ammonium nitrate", "2,67"]]);
  assert.equal(errors.length, 0);
  assert.equal(entries[0].key, "tif.2523290000"); assert.equal(entries[0].value.group, "cement"); assert.equal(entries[0].value.dvTot, 1.41);
  assert.equal(entries[1].value.dvStatus, "none"); assert.equal(entries[1].value.group, "iron_steel");
  assert.equal(entries[2].value.dvTot, 2.67); assert.equal(entries[2].value.group, "fertilizer");
  for (const e of entries) assert.equal(validateValue(e.key, e.value), null);
});

test("CSV: ; ajratuvchi, qo'shtirnoq va BOM", () => {
  const r = parseCsv("﻿stream;month;value;note\r\nGaz;1;8000;\"izoh; nuqta-vergul bilan\"\r\n");
  assert.deepEqual(r[0], { stream: "Gaz", month: "1", value: "8000", note: "izoh; nuqta-vergul bilan" });
});
