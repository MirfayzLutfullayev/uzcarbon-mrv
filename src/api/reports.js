/*
 * M7 — hujjatlar va hisobotlar API: eksportyor paketi, yillik hisobot, importyor shabloni, O3CI XML (I1),
 * soliq deklaratsiyasi (FT-7.3), importyorga xavfsiz havola (M7.5), hujjat haqiqiyligini tekshirish,
 * davlat hisobotlari: uglerod soliqi choraklik byulleteni, "Birgalikda mavjudlik eslatmasi".
 */
"use strict";
const audit = require("../db/audit");
const { now, newId } = require("../db/db");
const { bad, forbidden, notFound, raw, HttpError } = require("../http/app");
const { clean, intParam } = require("../http/validate");
const { randomToken, sha256 } = require("../auth/crypto");
const A = require("../services/access");
const P = require("../docs/package");
const tax = require("../services/tax");
const { writeXlsx } = require("../docs/xlsx");
const { camel } = require("../services/util");

const TYPES = { json: "application/json; charset=utf-8", xml: "application/xml; charset=utf-8", html: "text/html; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };

function register(app) {
  const s = app.s, { db, config } = s;
  const base = ctx => config.PUBLIC_URL || `http://${ctx.req.headers.host}`;

  function issue(ctx, installationId, year, by) {
    const pkg = P.seal(P.build(s, installationId, year), config.signingKey());
    audit.log(db, { actor: by.id, role: by.role, action: "package.issue", entity: "package", entityId: pkg.seal.hash, after: { installationId, year, goods: pkg.goods.length }, ip: ctx.ip });
    return pkg;
  }
  function render(ctx, pkg, format, lang, name) {
    const verifyUrl = `${base(ctx)}/api/public/verify?hash=${pkg.seal.hash}`;
    switch (format) {
      case "json": return raw(JSON.stringify(pkg, null, 2), TYPES.json, `${name}.json`);
      case "xml": return raw(P.toXml(pkg), TYPES.xml, `${name}.xml`);
      case "html": return raw(P.toHtml(pkg, lang, verifyUrl), TYPES.html);
      case "docx": return raw(P.toDocx(pkg, lang), TYPES.docx, `${name}.docx`);
      case "xlsx": return raw(P.toCommunicationXlsx(pkg), TYPES.xlsx, `${name}_communication.xlsx`);
      default: throw bad("Format: json | xml | html | docx | xlsx.");
    }
  }
  const q = ctx => clean(ctx.query, { installationId: { t: "str", req: true, max: 60 }, year: { t: "int", req: true, min: 2020, max: 2040 },
    format: { t: "enum", vals: ["json", "xml", "html", "docx", "xlsx"] }, lang: { t: "enum", vals: ["uz", "ru", "en"] } });

  app.get("/api/reports/package", { perm: "docs.read" }, ctx => {
    const p = q(ctx);
    const inst = A.installation(db, ctx.user, p.installationId, { year: p.year });
    const pkg = issue(ctx, inst.id, p.year, ctx.user);
    return render(ctx, pkg, p.format || "json", p.lang || "uz", `UzCarbon_paket_${inst.name}_${p.year}`);
  });
  app.get("/api/reports/annual", { perm: ["docs.read", "calc.read"] }, ctx => {
    const p = q(ctx);
    const inst = A.installation(db, ctx.user, p.installationId, { year: p.year });
    const pkg = P.build(s, inst.id, p.year);
    if ((p.format || "xlsx") === "xlsx") return raw(P.annualXlsx(pkg), TYPES.xlsx, `UzCarbon_yillik_${inst.name}_${p.year}.xlsx`);
    return render(ctx, P.seal(pkg, config.signingKey()), p.format, p.lang || "uz", `UzCarbon_yillik_${inst.name}_${p.year}`);
  });

  // FT-7.3 — soliq deklaratsiyasi XML (Soliq qo'mitasi tizimiga uzatish uchun; integratsiya I2 da mock)
  app.get("/api/reports/tax-declaration", { perm: "tax.read" }, ctx => {
    const p = clean(ctx.query, { installationId: { t: "str", req: true, max: 60 }, year: { t: "int", req: true, min: 2026, max: 2035 },
      quarter: { t: "enum", vals: ["Q1", "Q2", "Q3", "Q4"] }, variant: { t: "enum", vals: ["up", "down1", "down2"] } });
    const inst = A.installation(db, ctx.user, p.installationId, { year: p.year });
    const op = db.get("SELECT * FROM operators WHERE id = ?", inst.operator_id);
    const d = tax.declaration(s, inst.id, p.year, p.quarter, p.variant);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Uglerod soliqi deklaratsiyasi loyihasi (UZ-Carbon MRV). Soliq qo'mitasi rasmiy formati I2 integratsiyasida qo'llanadi. -->
<CarbonTaxDeclaration period="${d.period}" mode="${d.mode}" budgetCode="${d.budgetCode}">
  <Taxpayer tin="${op.stir}" name="${op.name.replace(/[<&"]/g, "")}"/>
  <Installation id="${inst.id}" name="${inst.name.replace(/[<&"]/g, "")}"/>
  <Rate usdPerTonne="${d.pUsd}" fx="${d.fx}"/>
  <Emissions combustion="${d.emComb.toFixed(3)}" process="${d.emProc.toFixed(3)}" covered="${d.covered.toFixed(3)}" unit="tCO2e"/>
  <Amounts upstreamEstimateUZS="${d.upstreamEstimate.toFixed(0)}" upstreamPaidUZS="${d.upstreamPaid.toFixed(0)}" dueUZS="${d.due.toFixed(0)}" potentialRefundUZS="${d.potentialRefund.toFixed(0)}"/>
</CarbonTaxDeclaration>
`;
    return raw(xml, TYPES.xml, `soliq_deklaratsiya_${d.period}.xml`);
  });

  /* ---------- Importyorga xavfsiz havola ---------- */
  app.post("/api/share", { perm: "docs.share" }, ctx => {
    const b = clean(ctx.body, { installationId: { t: "str", req: true, max: 60 }, year: { t: "int", req: true, min: 2020, max: 2040 }, importerId: { t: "str", max: 60 }, days: { t: "int", min: 1, max: 90 } });
    const inst = A.installation(db, ctx.user, b.installationId, { write: true });
    if (b.importerId && !db.get("SELECT id FROM importers WHERE id = ? AND operator_id = ?", b.importerId, inst.operator_id)) throw bad("Importyor bu korxonaga tegishli emas.");
    const token = randomToken(24), exp = new Date(Date.now() + (b.days || 30) * 864e5).toISOString();
    db.run("INSERT INTO share_links (token_hash, operator_id, installation_id, year, importer_id, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)",
      sha256(token), inst.operator_id, inst.id, b.year, b.importerId, ctx.user.id, now(), exp);
    audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action: "share.create", entity: "share", entityId: sha256(token).slice(0, 16), after: { installationId: inst.id, year: b.year, importerId: b.importerId, expiresAt: exp }, ip: ctx.ip });
    return { url: `${base(ctx)}/share/${token}`, expiresAt: exp };
  });
  app.get("/api/share", { perm: ["docs.share", "docs.read"] }, ctx => {
    if (ctx.user.role === "importer") return db.all("SELECT substr(token_hash,1,16) AS id, installation_id, year, created_at, expires_at, revoked FROM share_links WHERE importer_id = ? AND revoked = 0 ORDER BY created_at DESC", ctx.user.importer_id).map(r => camel(r));
    const ids = A.operatorIds(db, ctx.user);
    return db.all("SELECT substr(token_hash,1,16) AS id, operator_id, installation_id, year, importer_id, created_at, expires_at, revoked FROM share_links ORDER BY created_at DESC")
      .filter(r => !ids || ids.includes(r.operator_id)).map(r => camel(r));
  });
  app.post("/api/share/:id/revoke", { perm: "docs.share" }, ctx => {
    const row = db.get("SELECT * FROM share_links WHERE substr(token_hash,1,16) = ?", ctx.params.id);
    if (!row) throw notFound();
    A.operator(db, ctx.user, row.operator_id);
    db.run("UPDATE share_links SET revoked = 1 WHERE token_hash = ?", row.token_hash);
    audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action: "share.revoke", entity: "share", entityId: ctx.params.id, ip: ctx.ip });
    return { ok: true };
  });
  function openShare(ctx) {
    const row = db.get("SELECT * FROM share_links WHERE token_hash = ?", sha256(ctx.params.token || ""));
    if (!row || row.revoked || row.expires_at < now()) throw new HttpError(404, "Havola topilmadi yoki muddati tugagan.");
    audit.log(db, { actor: "share:" + row.token_hash.slice(0, 16), action: "share.open", entity: "share", entityId: row.token_hash.slice(0, 16), ip: ctx.ip });
    return P.seal(P.build(s, row.installation_id, row.year), config.signingKey());
  }
  app.get("/share/:token", { auth: false }, ctx => { const pkg = openShare(ctx); return raw(P.toHtml(pkg, ctx.query.lang === "uz" || ctx.query.lang === "ru" ? ctx.query.lang : "en", `${base(ctx)}/api/public/verify?hash=${pkg.seal.hash}`), TYPES.html); });
  app.get("/api/share/:token/package", { auth: false }, ctx => {
    const pkg = openShare(ctx);
    const f = ctx.query.format || "json";
    return render(ctx, pkg, f, "en", `CBAM_package_${pkg.year}`);
  });

  // Importyor (tizimga kirgan): faqat o'ziga ulashilgan va muddati o'tmagan paketlar
  app.get("/api/importer/package/:id", { perm: "docs.read" }, ctx => {
    if (ctx.user.role !== "importer") throw forbidden();
    const row = db.get("SELECT * FROM share_links WHERE substr(token_hash,1,16) = ? AND importer_id = ?", ctx.params.id, ctx.user.importer_id);
    if (!row || row.revoked || row.expires_at < now()) throw notFound("Paket topilmadi yoki muddati tugagan.");
    const pkg = P.seal(P.build(s, row.installation_id, row.year), config.signingKey());
    audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action: "share.open", entity: "share", entityId: ctx.params.id, ip: ctx.ip });
    return render(ctx, pkg, ctx.query.format || "html", "en", `CBAM_package_${row.year}`);
  });

  // Hujjat haqiqiyligini tekshirish (ochiq): xesh platforma tomonidan berilganmi
  app.get("/api/public/verify", { auth: false }, ctx => {
    const h = String(ctx.query.hash || "");
    if (!/^[a-f0-9]{64}$/.test(h)) throw bad("Xesh noto'g'ri.");
    const rec = db.get("SELECT at, after FROM audit WHERE action = 'package.issue' AND entity_id = ? ORDER BY seq LIMIT 1", h);
    return rec ? { issued: true, issuedAt: rec.at, year: JSON.parse(rec.after).year } : { issued: false };
  });

  /* ---------- Davlat hisobotlari ---------- */
  // Uglerod soliqi choraklik byulleteni (Strategiya 5.4): to'lovlar, qamrov, tarmoqlar kesimida (faqat agregat)
  app.get("/api/reports/bulletin", { perm: "dashboard.gov" }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2026, 2035);
    const rows = db.all(`SELECT t.period, t.kind, t.status, t.amount_uzs, t.rebate_uzs, t.fx, p.goods_group FROM tax_payments t
      LEFT JOIN processes p ON p.installation_id = t.installation_id WHERE t.year = ? AND t.status IN ('paid','confirmed') GROUP BY t.id`, year);
    const byPeriod = {};
    for (const r of rows) {
      const k = r.period; byPeriod[k] ||= { period: k, up: 0, down: 0, confirmed: 0, payments: 0 };
      byPeriod[k][r.kind] += r.amount_uzs - r.rebate_uzs; byPeriod[k].payments++; if (r.status === "confirmed") byPeriod[k].confirmed++;
    }
    const due = db.all("SELECT id FROM installations").reduce((a, i) => { try { return a + tax.declaration(s, i.id, year, null, "up").due; } catch { return a; } }, 0);
    const paid = rows.reduce((a, r) => a + r.amount_uzs - r.rebate_uzs, 0);
    return { year, periods: Object.values(byPeriod).sort((a, b) => a.period.localeCompare(b.period)), paidUzs: paid, estimatedDueUzs: due, collection: due ? paid / due : null, collectionTarget: 0.97 };
  });
  // "Birgalikda mavjudlik eslatmasi": yoqilg'i bo'yicha amaldagi aksiz va uglerod soliqi yuklamasi
  app.get("/api/reports/coexistence", { perm: ["dashboard.gov", "tax.read"] }, ctx => {
    const year = intParam(ctx.query.year || 2026, "Yil", 2026, 2035);
    const r = tax.fuelRates(s, year);
    const fuels = r.fuels.map(f => {
      const ex = r.implicit.find(i => i.key.includes(f.key));
      return { fuel: f.name, unit: f.unit, carbonTaxPerUnit: f.ratePerUnit, carbonTaxPerT: f.ratePerT, exciseUzsPerT: ex?.exciseUzsPerT ?? null, implicitUsdPerT: ex?.implicitUsdPerT ?? null };
    });
    if (ctx.query.format === "xlsx") return raw(writeXlsx([{ name: "Eslatma", widths: [28, 10, 22, 22, 18, 18], rows: [["Yoqilg'i", "Birlik", "Uglerod soliqi, so'm/birlik", "Uglerod soliqi, so'm/t", "Aksiz, so'm/t", "Yashirin narx, USD/t CO2"],
      ...fuels.map(f => [f.fuel, f.unit, Math.round(f.carbonTaxPerUnit), f.carbonTaxPerT != null ? Math.round(f.carbonTaxPerT) : "", f.exciseUzsPerT ?? "", f.implicitUsdPerT != null ? +f.implicitUsdPerT.toFixed(2) : ""])] }]), TYPES.xlsx, `birgalikda_mavjudlik_${year}.xlsx`);
    return { year, pUsd: r.pUsd, fx: r.fx, fuels, note: "Ad valorem aksiz (masalan, tabiiy gaz 12%) uglerod tarkibiga bog'lanmagani uchun CBAM chegirmasiga kirmaydi." };
  });
}

module.exports = { register };
