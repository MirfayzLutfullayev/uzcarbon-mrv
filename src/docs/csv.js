/* CSV o'qish/yozish (ajratuvchi ; yoki , avtomatik aniqlanadi, qo'shtirnoqli maydonlar, BOM). */
"use strict";

function parseRows(text, delim) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(c => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(c => c.trim() !== "")) rows.push(row);
  return rows;
}

/** @returns {Array<Record<string,string>>} sarlavha qatori bo'yicha obyektlar */
function parseCsv(text) {
  text = String(text || "").replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows = parseRows(text, delim);
  if (rows.length < 1) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const cell = v => { const s = v == null ? "" : String(v); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function toCsv(head, rows) { return "﻿" + [head.map(cell).join(";"), ...rows.map(r => r.map(cell).join(";"))].join("\r\n"); }

module.exports = { parseCsv, toCsv };
