/*
 * Kiruvchi ma'lumotni tekshirish (M3.9, OWASP ASVS V5). Sxemada bo'lmagan maydonlar tashlab yuboriladi.
 * Turlar: str, num, int, bool, enum, obj, date (YYYY-MM-DD).
 */
"use strict";
const { bad } = require("./app");

/**
 * @param {object} body
 * @param {Record<string, {t:string, req?:boolean, max?:number, min?:number, re?:RegExp, vals?:string[], label?:string}>} schema
 * @param {{partial?:boolean}} [opt] partial — faqat berilgan maydonlar tekshiriladi (PATCH)
 */
function clean(body, schema, opt = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("Ma'lumot obyekt bo'lishi kerak.");
  const out = {};
  for (const [k, r] of Object.entries(schema)) {
    const label = r.label || k;
    let v = body[k];
    if (v === undefined) {
      if (r.req && !opt.partial) throw bad(`"${label}" maydoni to'ldirilishi shart.`);
      continue;
    }
    if (v === "" || v === null) {
      if (r.req) throw bad(`"${label}" maydoni to'ldirilishi shart.`);
      out[k] = null; continue;
    }
    switch (r.t) {
      case "str":
        if (typeof v !== "string") throw bad(`"${label}" matn bo'lishi kerak.`);
        v = v.trim();
        if (v.length > (r.max || 500)) throw bad(`"${label}" juda uzun (≤ ${r.max || 500} belgi).`);
        if (r.re && !r.re.test(v)) throw bad(r.msg || `"${label}" formati noto'g'ri.`);
        if (r.req && !v) throw bad(`"${label}" maydoni to'ldirilishi shart.`);
        break;
      case "num": case "int":
        if (typeof v === "string" && v.trim() !== "") v = Number(v.replace(",", "."));
        if (typeof v !== "number" || !Number.isFinite(v)) throw bad(`"${label}" son bo'lishi kerak.`);
        if (r.t === "int" && !Number.isInteger(v)) throw bad(`"${label}" butun son bo'lishi kerak.`);
        if (r.min != null && v < r.min) throw bad(`"${label}" ${r.min} dan kichik bo'lmasligi kerak.`);
        if (r.max != null && v > r.max) throw bad(`"${label}" ${r.max} dan katta bo'lmasligi kerak.`);
        break;
      case "bool":
        v = v === true || v === 1 || v === "1" || v === "true";
        break;
      case "enum":
        if (!r.vals.includes(v)) throw bad(`"${label}" qiymati noto'g'ri.`);
        break;
      case "date":
        if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw bad(`"${label}" sana (YYYY-MM-DD) bo'lishi kerak.`);
        break;
      case "obj":
        if (typeof v !== "object" || Array.isArray(v)) throw bad(`"${label}" obyekt bo'lishi kerak.`);
        if (JSON.stringify(v).length > (r.max || 4000)) throw bad(`"${label}" juda katta.`);
        break;
      default: throw new Error("Sxema turi noma'lum: " + r.t);
    }
    out[k] = v;
  }
  return out;
}

const intParam = (v, label, min, max) => {
  const n = Number(v);
  if (!Number.isInteger(n) || (min != null && n < min) || (max != null && n > max)) throw bad(`${label} noto'g'ri.`);
  return n;
};

module.exports = { clean, intParam };
