/*
 * Versiyalanadigan (bitemporal) ma'lumotnoma — M10.1, M10.2, FT-3.5.
 *  - valid_from / valid_to — qiymatning amal qilish davri (biznes vaqti);
 *  - recorded_at / approved_at — tizimga kiritilgan va tasdiqlangan vaqt.
 * O'zgarish faqat "taklif → boshqa shaxs tasdig'i" (ikki shaxs qoidasi) orqali kuchga kiradi.
 * Integratsiyalar (masalan, Markaziy bank kursi) tizim nomidan to'g'ridan-to'g'ri yozadi.
 */
"use strict";
const audit = require("./audit");
const { now, parseJson } = require("./db");

const GROUPS = ["cement", "fertilizer", "aluminium", "hydrogen", "iron_steel"];

/** Kalit oilasiga qarab qiymatni tekshirish. Xato matnini qaytaradi yoki null. */
function validateValue(key, value) {
  const isNum = v => typeof v === "number" && Number.isFinite(v);
  if (/^(cbam\.cf|cbam\.markup|gwp|tax\.rate_usd|tax\.k_comp|fx|grid|heat|clinker|mb|ets\.price|tax\.s_feed|tax\.bhm|ndc|itmo|privacy)\b/.test(key)) {
    if (!isNum(value) || value < 0) return "Qiymat manfiy bo'lmagan son bo'lishi kerak.";
    if (/^(cbam\.cf|cbam\.markup|tax\.k_comp\.\d|tax\.s_feed|tax\.bhm_share|itmo|ndc\.target)/.test(key) && value > 1) return "Ulush 0 va 1 oralig'ida bo'lishi kerak.";
  }
  if (key.startsWith("fuel.")) {
    if (!value || typeof value !== "object") return "Yoqilg'i ma'lumoti obyekt bo'lishi kerak.";
    if (!value.name || !["t", "m3", "1000m3"].includes(value.unit)) return "Yoqilg'i nomi va birligi (t, m3, 1000m3) kerak.";
    if (!isNum(value.ncvGJ) || !isNum(value.efKgGJ)) return "ncvGJ va efKgGJ son bo'lishi kerak.";
  }
  if (key.startsWith("material.") && (!value || !isNum(value.ef))) return "Material uchun ef (t CO2/t) kerak.";
  if (key.startsWith("tif.")) {
    if (!value || typeof value !== "object") return "TIF yozuvi obyekt bo'lishi kerak.";
    if (!/^\d{10}$/.test(key.slice(4))) return "TIF TN kodi 10 ta raqam bo'lishi kerak.";
    if (!GROUPS.includes(value.group)) return "Tovar guruhi noto'g'ri.";
    if (!["value", "none", "missing"].includes(value.dvStatus)) return "dvStatus: value | none | missing.";
    if (value.dvStatus === "value" && !(isNum(value.dvTot) && value.dvTot >= 0)) return "Standart qiymat (dvTot) son bo'lishi kerak.";
    if (value.bm != null && !isNum(value.bm)) return "Benchmark son bo'lishi kerak.";
  }
  return null;
}

const rowOut = r => r && ({
  id: r.id, key: r.key, value: parseJson(r.value), unit: r.unit, source: r.source, validFrom: r.valid_from, validTo: r.valid_to,
  recordedAt: r.recorded_at, status: r.status, version: r.version, proposedBy: r.proposed_by, approvedBy: r.approved_by,
  approvedAt: r.approved_at, note: r.note,
});

class RefData {
  /** @param {import('./db').Db} db */
  constructor(db) { this.db = db; this.cache = new Map(); }

  invalidate() { this.cache.clear(); }

  /** Bo'sh bazaga boshlang'ich qiymatlarni yozish. */
  seed(entries) {
    const has = this.db.get("SELECT COUNT(*) AS c FROM refdata").c;
    if (has) return 0;
    const t = now();
    this.db.tx(() => {
      for (const e of entries) {
        const err = validateValue(e.key, e.value);
        if (err) throw new Error(`${e.key}: ${err}`);
        this.db.run(`INSERT INTO refdata (key, value, unit, source, valid_from, recorded_at, status, version, proposed_by, approved_by, approved_at)
          VALUES (?,?,?,?,?,?, 'active', 1, 'system:initial', 'system:initial', ?)`, e.key, JSON.stringify(e.value), e.unit || null, e.source || null, e.validFrom, t, t);
      }
      audit.log(this.db, { actor: "system", action: "refdata.seed", entity: "refdata", after: { count: entries.length } });
    });
    this.invalidate();
    return entries.length;
  }

  /**
   * Berilgan sanada amal qilgan qiymatlar to'plami. Hisobda ishlatilgan har bir kalit va versiyasi `used` da yoziladi (M4.6).
   * @param {string} asOf "YYYY-MM-DD"
   */
  snapshot(asOf) {
    let map = this.cache.get(asOf);
    if (!map) {
      map = new Map();
      const rows = this.db.all(`SELECT id, key, value, version FROM refdata
        WHERE status = 'active' AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?) ORDER BY key, valid_from, version`, asOf, asOf);
      for (const r of rows) map.set(r.key, { id: r.id, version: r.version, value: parseJson(r.value) });
      this.cache.set(asOf, map);
    }
    const used = new Map();
    return {
      asOf,
      get: key => { const e = map.get(key); if (!e) return undefined; used.set(key, { id: e.id, version: e.version }); return e.value; },
      keys: prefix => [...map.keys()].filter(k => k.startsWith(prefix)),
      used,
      usedList: () => [...used.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => a.key.localeCompare(b.key)),
    };
  }

  /** Joriy amaldagi barcha qiymatlar (prefiks bo'yicha). */
  current(prefix = "", asOf = new Date().toISOString().slice(0, 10)) {
    return this.db.all(`SELECT * FROM refdata WHERE status = 'active' AND key LIKE ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?) ORDER BY key`,
      prefix + "%", asOf, asOf).map(rowOut);
  }
  history(key) { return this.db.all("SELECT * FROM refdata WHERE key = ? ORDER BY version DESC", key).map(rowOut); }
  proposals() { return this.db.all("SELECT * FROM refdata WHERE status = 'proposed' ORDER BY id").map(rowOut); }
  byId(id) { return rowOut(this.db.get("SELECT * FROM refdata WHERE id = ?", id)); }

  /** Yangi qiymat taklifi (birinchi shaxs). */
  propose({ key, value, unit, source, validFrom, note }, user) {
    if (!/^[a-z0-9_.]{2,80}$/i.test(key || "")) throw Object.assign(new Error("Kalit noto'g'ri."), { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom || "")) throw Object.assign(new Error("Amal qilish sanasi YYYY-MM-DD formatida bo'lishi kerak."), { status: 400 });
    const err = validateValue(key, value);
    if (err) throw Object.assign(new Error(`${key}: ${err}`), { status: 400 });
    if (!source || !String(source).trim()) throw Object.assign(new Error("Manba hujjati ko'rsatilishi shart."), { status: 400 });
    const v = (this.db.get("SELECT MAX(version) AS v FROM refdata WHERE key = ?", key).v || 0) + 1;
    const r = this.db.run(`INSERT INTO refdata (key, value, unit, source, valid_from, recorded_at, status, version, proposed_by, note)
      VALUES (?,?,?,?,?,?, 'proposed', ?, ?, ?)`, key, JSON.stringify(value), unit || null, source, validFrom, now(), v, user.id, note || null);
    const id = Number(r.lastInsertRowid);
    audit.log(this.db, { actor: user.id, role: user.role, action: "refdata.propose", entity: "refdata", entityId: String(id), after: { key, value, validFrom, source } });
    return this.byId(id);
  }

  /** Tasdiqlash (ikkinchi shaxs). Oldingi versiyalarning amal qilish davri yopiladi. */
  approve(id, user, { system = false } = {}) {
    return this.db.tx(() => {
      const p = this.db.get("SELECT * FROM refdata WHERE id = ?", id);
      if (!p || p.status !== "proposed") throw Object.assign(new Error("Taklif topilmadi yoki allaqachon ko'rib chiqilgan."), { status: 404 });
      if (!system && p.proposed_by === user.id) throw Object.assign(new Error("Ikki shaxs qoidasi: taklif kiritgan shaxs uni tasdiqlay olmaydi."), { status: 403 });
      this.closePrevious(p.key, p.valid_from);
      const t = now();
      this.db.run("UPDATE refdata SET status = 'active', approved_by = ?, approved_at = ? WHERE id = ?", user.id, t, id);
      audit.log(this.db, { actor: user.id, role: user.role, action: "refdata.approve", entity: "refdata", entityId: String(id), after: { key: p.key, value: parseJson(p.value), validFrom: p.valid_from } });
      this.invalidate();
      return this.byId(id);
    });
  }

  reject(id, user, note) {
    const p = this.db.get("SELECT * FROM refdata WHERE id = ?", id);
    if (!p || p.status !== "proposed") throw Object.assign(new Error("Taklif topilmadi."), { status: 404 });
    this.db.run("UPDATE refdata SET status = 'rejected', approved_by = ?, approved_at = ?, note = COALESCE(note,'') || ? WHERE id = ?", user.id, now(), note ? ` | Rad etildi: ${note}` : "", id);
    audit.log(this.db, { actor: user.id, role: user.role, action: "refdata.reject", entity: "refdata", entityId: String(id), after: { note } });
    return this.byId(id);
  }

  /** Tizim (integratsiya) nomidan darhol kuchga kiradigan qiymat — masalan, Markaziy bank kursi. */
  systemSet({ key, value, unit, source, validFrom }, systemName) {
    return this.db.tx(() => {
      const actor = { id: `system:${systemName}`, role: "system" };
      const p = this.propose({ key, value, unit, source, validFrom }, actor);
      return this.approve(p.id, actor, { system: true });
    });
  }

  closePrevious(key, validFrom) {
    for (const r of this.db.all("SELECT * FROM refdata WHERE key = ? AND status = 'active'", key)) {
      if (r.valid_from >= validFrom) this.db.run("UPDATE refdata SET status = 'superseded' WHERE id = ?", r.id);
      else if (r.valid_to == null || r.valid_to > validFrom) this.db.run("UPDATE refdata SET valid_to = ? WHERE id = ?", validFrom, r.id);
    }
  }
}

module.exports = { RefData, validateValue, GROUPS };
