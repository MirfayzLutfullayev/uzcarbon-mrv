"use strict";
const assert = require("node:assert/strict");
const { entries } = require("../src/refdata/initial");

/** Boshlang'ich ma'lumotnomadan oddiy {get} obyekt (bazasiz testlar uchun). */
function refStub(overrides = {}) {
  const map = new Map(entries().map(e => [e.key, e.value]));
  for (const [k, v] of Object.entries(overrides)) map.set(k, v);
  return { get: k => map.get(k) };
}

/** Nisbiy farq ≤ tol (standart 0,1% — TZ qabul mezoni). */
function within(actual, expected, tol = 0.001, msg = "") {
  const rel = expected === 0 ? Math.abs(actual) : Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(rel <= tol, `${msg} ${actual} ≠ ${expected} (farq ${(rel * 100).toFixed(4)}%)`);
}

/** Absolyut farq (yaxlitlangan etalonlar uchun: 0,01 mln va h.k.). */
function near(actual, expected, eps, msg = "") {
  assert.ok(Math.abs(actual - expected) <= eps, `${msg} ${actual} ≠ ${expected} (±${eps})`);
}

module.exports = { refStub, within, near };
