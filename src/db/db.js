/*
 * Ma'lumotlar bazasi qatlami: Node.js o'rnatilgan SQLite (node:sqlite).
 * Barcha so'rovlar shu qatlam orqali o'tadi — PostgreSQL ga o'tishda faqat shu fayl almashtiriladi.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { MIGRATIONS } = require("./schema");

const clean = p => p.map(v => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));

class Db {
  /** @param {string} file fayl yo'li yoki ":memory:" */
  constructor(file) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    if (file !== ":memory:") this.raw.exec("PRAGMA journal_mode = WAL;");
    this.stmts = new Map();
    this.depth = 0;
    this.migrate();
  }
  prep(sql) {
    let s = this.stmts.get(sql);
    if (!s) { s = this.raw.prepare(sql); this.stmts.set(sql, s); }
    return s;
  }
  all(sql, ...p) { return this.prep(sql).all(...clean(p)); }
  get(sql, ...p) { return this.prep(sql).get(...clean(p)); }
  run(sql, ...p) { return this.prep(sql).run(...clean(p)); }
  /** Tranzaksiya (ichma-ich chaqirilsa SAVEPOINT ishlatiladi). */
  tx(fn) {
    const sp = `sp${this.depth}`;
    this.raw.exec(this.depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${sp}`);
    this.depth++;
    try {
      const r = fn();
      this.depth--;
      this.raw.exec(this.depth === 0 ? "COMMIT" : `RELEASE ${sp}`);
      return r;
    } catch (e) {
      this.depth--;
      this.raw.exec(this.depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw e;
    }
  }
  migrate() {
    const cur = this.raw.prepare("PRAGMA user_version").get().user_version;
    for (let v = cur; v < MIGRATIONS.length; v++) {
      this.raw.exec("BEGIN");
      try {
        this.raw.exec(MIGRATIONS[v]);
        this.raw.exec(`PRAGMA user_version = ${v + 1}`);
        this.raw.exec("COMMIT");
      } catch (e) { this.raw.exec("ROLLBACK"); throw e; }
    }
  }
  close() { this.raw.close(); }
}

const now = () => new Date().toISOString();
const newId = prefix => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(5).toString("hex")}`;
const parseJson = (s, d = null) => { if (s == null) return d; try { return JSON.parse(s); } catch { return d; } };

module.exports = { Db, now, newId, parseJson };
