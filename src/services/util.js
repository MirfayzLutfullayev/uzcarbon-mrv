"use strict";
const { parseJson } = require("../db/db");

const camelKey = k => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
/** snake_case qatorni camelCase obyektga o'tkazish; JSON ustunlar (nomi berilsa) ochiladi. */
function camel(row, jsonCols = []) {
  if (!row) return row;
  const o = {};
  for (const [k, v] of Object.entries(row)) o[camelKey(k)] = jsonCols.includes(k) ? parseJson(v) : v;
  return o;
}
const snakeKey = k => k.replace(/[A-Z]/g, c => "_" + c.toLowerCase());

/** UPDATE ... SET qismini obyektdan tuzish (faqat ruxsat etilgan ustunlar). */
function setClause(data) {
  const keys = Object.keys(data);
  return { sql: keys.map(k => `${snakeKey(k)} = ?`).join(", "), params: keys.map(k => data[k]) };
}
function insertClause(data) {
  const keys = Object.keys(data);
  return { cols: keys.map(snakeKey).join(", "), marks: keys.map(() => "?").join(", "), params: keys.map(k => data[k]) };
}

module.exports = { camel, camelKey, snakeKey, setClause, insertClause };
