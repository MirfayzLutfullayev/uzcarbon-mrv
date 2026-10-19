/*
 * M10 — ma'lumotnomalar (versiyalar, ikki shaxs tasdig'i, TIF TN jadvali importi), audit jurnali, bildirishnomalar,
 * panellar (M9: eksportyor, davlat, ochiq), integratsiyalar (I2 STIR, I3 bojxona, I8 Markaziy bank, I9 ETS — mock/ochiq manba).
 */
"use strict";
const audit = require("../db/audit");
const { now, newId, parseJson } = require("../db/db");
const { bad, forbidden, notFound, raw, HttpError } = require("../http/app");
const { clean, intParam } = require("../http/validate");
const { can, canProposeKey } = require("../auth/rbac");
const A = require("../services/access");
const notify = require("../services/notify");
const { computeProcess, officialSee } = require("../services/calc");
const cbam = require("../services/cbam");
const { qualityIndex } = require("./data");
const { readXlsx } = require("../docs/xlsx");
const { parseCsv } = require("../docs/csv");
const { GOODS_GROUPS } = require("../core/emissions");
const { camel } = require("../services/util");

/** TIF jadvali qatorlarini ma'lumotnoma yozuvlariga aylantirish. Ustunlar nomi bo'yicha moslashuvchan aniqlanadi. */
function tifRowsToEntries(rows) {
  const head = (rows[0] || []).map(h => String(h ?? "").toLowerCase());
  const col = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
  const ci = { code: col("tif", "cn", "код", "code"), name: col("name", "nomi", "наимен", "description", "tavsif"), group: col("group", "guruh", "категор", "sector", "tarmoq"),
    dv: col("default", "standart", "dv", "по умолч", "total"), bm: col("benchmark", "bm") };
  if (ci.code < 0 || ci.dv < 0) throw bad("Jadvalda kod (TIF/CN) va standart qiymat (default/standart) ustunlari topilmadi.");
  const groupOf = (g, code) => {
    const t = String(g || "").toLowerCase();
    if (/cement|sement|цемент/.test(t)) return "cement"; if (/fertil|o.g.it|удобр/.test(t)) return "fertilizer";
    if (/alum|алюм/.test(t)) return "aluminium"; if (/hydro|vodorod|водор/.test(t)) return "hydrogen"; if (/iron|steel|po.lat|temir|стал|желез/.test(t)) return "iron_steel";
    const c = String(code);
    if (c.startsWith("2523")) return "cement"; if (/^(2808|2814|2834|3102|3105)/.test(c)) return "fertilizer"; if (c.startsWith("76")) return "aluminium";
    if (c.startsWith("280410")) return "hydrogen"; if (/^(26|72|73)/.test(c)) return "iron_steel"; return null;
  };
  const out = [], errors = [];
  rows.slice(1).forEach((r, i) => {
    const code = String(r[ci.code] ?? "").replace(/\D/g, "");
    if (!code) return;
    const code10 = code.length === 8 ? code + "00" : code;
    const dvRaw = r[ci.dv];
    const dvStr = String(dvRaw ?? "").trim();
    const g = groupOf(ci.group >= 0 ? r[ci.group] : "", code10);
    if (!/^\d{10}$/.test(code10) || !g) { errors.push({ row: i + 2, error: `kod yoki guruh aniqlanmadi: ${r[ci.code]}` }); return; }
    const isDash = /^[-–—]$/.test(dvStr);
    const dv = typeof dvRaw === "number" ? dvRaw : Number(dvStr.replace(",", "."));
    const value = { code: code10, cn8: code10.slice(0, 8), name: ci.name >= 0 ? String(r[ci.name] ?? "").slice(0, 300) : code10, group: g,
      dvTot: isDash || !Number.isFinite(dv) ? null : dv, dvStatus: isDash ? "none" : Number.isFinite(dv) ? "value" : "missing",
      bm: ci.bm >= 0 && Number.isFinite(Number(r[ci.bm])) && r[ci.bm] !== "" && r[ci.bm] != null ? Number(r[ci.bm]) : null, sample: false };
    out.push({ key: "tif." + code10, value });
  });
  return { entries: out, errors };
}

function register(app) {
  const s = app.s, { db, ref } = s;

  /* ---------- Ma'lumotnomalar ---------- */
  app.get("/api/refdata", { perm: "refdata.read" }, ctx => ref.current(ctx.query.prefix || "", ctx.query.asOf || undefined));
  app.get("/api/refdata/proposals", { perm: "refdata.read" }, () => ref.proposals());
  app.get("/api/refdata/history/:key", { perm: "refdata.read" }, ctx => ref.history(ctx.params.key));
  app.post("/api/refdata/proposals", { perm: "refdata.propose" }, ctx => {
    const b = clean(ctx.body, { key: { t: "str", req: true, max: 80 }, unit: { t: "str", max: 40 }, source: { t: "str", req: true, max: 300, label: "Manba" },
      validFrom: { t: "date", req: true, label: "Amal qilish sanasi" }, note: { t: "str", max: 500 } });
    if (!("value" in ctx.body)) throw bad("Qiymat (value) kiritilmagan.");
    if (!canProposeKey(ctx.user, b.key)) throw forbidden("Bu kalit uchun taklif kiritish huquqi yo'q.");
    return ref.propose({ ...b, value: ctx.body.value }, ctx.user);
  });
  app.post("/api/refdata/proposals/:id/approve", { perm: "refdata.approve" }, ctx => {
    const r = ref.approve(Number(ctx.params.id), ctx.user);
    notify.toRole(db, "exporter_admin", "refdata", `Ma'lumotnoma yangilandi: ${r.key} = ${JSON.stringify(r.value).slice(0, 80)} (${r.validFrom} dan). Prognozlar yangi qiymat bilan qayta hisoblanadi.`, "#/refdata");
    notify.toRole(db, "exporter_specialist", "refdata", `Ma'lumotnoma yangilandi: ${r.key} (${r.validFrom} dan).`, "#/refdata");
    return r;
  });
  app.post("/api/refdata/proposals/approve-bulk", { perm: "refdata.approve" }, ctx => {
    const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.map(Number).filter(Number.isInteger) : [];
    if (!ids.length || ids.length > 1000) throw bad("ids: 1–1000 ta taklif identifikatori.");
    const done = db.tx(() => ids.map(id => ref.approve(id, ctx.user).id));
    notify.toRole(db, "exporter_admin", "refdata", `Ma'lumotnoma yangilandi: ${done.length} ta yozuv tasdiqlandi.`, "#/refdata");
    return { approved: done.length };
  });
  app.post("/api/refdata/proposals/:id/reject", { perm: "refdata.approve" }, ctx => ref.reject(Number(ctx.params.id), ctx.user, clean(ctx.body || {}, { note: { t: "str", max: 500 } }).note));
  // TIF TN jadvali importi (xlsx base64 yoki csv) — har bir qator taklif sifatida yaratiladi, ikkinchi shaxs tasdiqlaydi
  app.post("/api/refdata/import-tif", { perm: "refdata.propose", bodyLimit: 15 * 1024 * 1024 }, ctx => {
    const b = clean(ctx.body, { xlsxBase64: { t: "str", max: 14_000_000 }, csv: { t: "str", max: 5_000_000 }, sheet: { t: "str", max: 60 },
      source: { t: "str", req: true, max: 300 }, validFrom: { t: "date", req: true } });
    let rows;
    if (b.xlsxBase64) rows = readXlsx(Buffer.from(b.xlsxBase64, "base64"), b.sheet || undefined);
    else if (b.csv) { const objs = parseCsv(b.csv); rows = objs.length ? [Object.keys(objs[0]), ...objs.map(o => Object.values(o))] : []; }
    else throw bad("xlsxBase64 yoki csv kerak.");
    const { entries, errors } = tifRowsToEntries(rows);
    if (!entries.length) throw Object.assign(bad("Jadvaldan birorta ham TIF yozuvi olinmadi."), { extra: { errors: errors.slice(0, 30) } });
    const created = db.tx(() => entries.map(e => ref.propose({ key: e.key, value: e.value, unit: "t CO2e/t", source: b.source, validFrom: b.validFrom }, ctx.user).id));
    return { proposed: created.length, ids: created, skipped: errors.length, errors: errors.slice(0, 30) };
  });

  /* ---------- Audit jurnali ---------- */
  app.get("/api/audit", { perm: ["audit.read", "audit.read_own"] }, ctx => {
    const limit = Math.min(500, intParam(ctx.query.limit || 100, "limit", 1, 500));
    let rows;
    if (can(ctx.user, "audit.read")) rows = db.all("SELECT * FROM audit ORDER BY seq DESC LIMIT ?", limit);
    else {
      const users = db.all("SELECT id FROM users WHERE operator_id = ?", ctx.user.operator_id).map(u => u.id);
      rows = users.length ? db.all(`SELECT * FROM audit WHERE actor IN (${users.map(() => "?").join(",")}) ORDER BY seq DESC LIMIT ?`, ...users, limit) : [];
    }
    if (ctx.query.entity) rows = rows.filter(r => r.entity === ctx.query.entity);
    const names = new Map(db.all("SELECT id, login FROM users").map(u => [u.id, u.login]));
    return rows.map(r => ({ ...camel(r, ["before", "after"]), actorLogin: names.get(r.actor) || r.actor }));
  });
  app.get("/api/audit/verify", { perm: "audit.read" }, () => audit.verify(db));

  /* ---------- Bildirishnomalar ---------- */
  app.get("/api/notifications", {}, ctx => ({ items: notify.forUser(db, ctx.user).map(n => camel(n)), deadlines: notify.deadlines() }));
  app.post("/api/notifications/:id/read", {}, ctx => {
    db.run("INSERT OR IGNORE INTO notification_reads (notification_id, user_id, read_at) VALUES (?,?,?)", ctx.params.id, ctx.user.id, now());
    return { ok: true };
  });

  /* ---------- M9: eksportyor paneli ---------- */
  app.get("/api/dashboard/exporter", { perm: "dashboard.exporter" }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2020, 2040);
    const opId = ctx.user.operator_id;
    const procs = db.all("SELECT p.*, i.name AS inst_name FROM processes p JOIN installations i ON i.id = p.installation_id WHERE i.operator_id = ? ORDER BY i.name, p.name", opId);
    const items = procs.map(p => {
      try {
        const r = computeProcess(s, p.id, year);
        const prev = (() => { try { return computeProcess(s, p.id, year - 1).see.seeCbam; } catch { return null; } })();
        const exportPrice = p.export_price_usd;
        const pEts = s.ref.snapshot(`${year}-12-31`).get("ets.reference_usd");
        const cf = s.ref.snapshot(`${year}-12-31`).get(`cbam.cf.${year}`) ?? 0;
        return { processId: p.id, name: p.name, installation: p.inst_name, goodsGroup: p.goods_group, tifCode: p.tif_code, al: r.totals.al, emissions: r.totals.attrDir + r.totals.emEl,
          seeCbam: r.see.seeCbam, seePrev: Number.isFinite(prev) ? prev : null, applied: r.selection.applied, basis: r.selection.basis, defaultSee: r.selection.default, bm: r.tif?.bm ?? null,
          cci: exportPrice && Number.isFinite(r.see.seeCbam) ? (r.see.seeCbam * pEts * (1 - cf)) / exportPrice : null, quality: qualityIndex(db, p.id, year), warnings: r.warnings.length };
      } catch (e) { return { processId: p.id, name: p.name, installation: p.inst_name, goodsGroup: p.goods_group, error: e.message }; }
    });
    const cb = cbam.operatorYear(s, opId, year);
    const monthly = []; // emissiyalar dinamikasi (oylik)
    for (const p of procs) {
      const rows = db.all(`SELECT a.month, s.type, a.value FROM activity a JOIN streams s ON s.id = a.stream_id WHERE s.process_id = ? AND a.year = ?`, p.id, year);
      monthly.push({ processId: p.id, name: p.name, months: Array.from({ length: 12 }, (_, i) => rows.filter(r => r.month === i + 1).length ? 1 : 0) });
    }
    return { year, processes: items, cbam: { totals: cb.totals, transitional: cb.transitional, byImporter: cb.byImporter, cf: cb.cf }, coverage: monthly, deadlines: notify.deadlines() };
  });

  /* ---------- M9: davlat paneli (agregatlar, tijorat siri: ≥ N korxona) ---------- */
  function aggregate(year) {
    const minGroup = s.ref.snapshot(`${year}-12-31`).get("privacy.min_group") || 3;
    const rows = [];
    for (const p of db.all("SELECT p.id, p.goods_group, i.region, i.operator_id, i.id AS inst FROM processes p JOIN installations i ON i.id = p.installation_id")) {
      try {
        const o = officialSee(s, p.id, year), r = o.result;
        const exported = db.all("SELECT net_t FROM batches WHERE process_id = ? AND substr(date,1,4) = ?", p.id, String(year)).reduce((a, b) => a + b.net_t, 0);
        rows.push({ group: p.goods_group, region: p.region || "—", operator: p.operator_id, inst: p.inst, emissions: r.totals.attrDir + r.totals.emEl, al: r.totals.al, exported,
          ee: Number.isFinite(r.selection.applied) ? exported * r.selection.applied : 0, verified: o.status === "verified", basis: r.selection.basis });
      } catch { /* ma'lumotsiz jarayon */ }
    }
    const by = key => {
      const m = new Map();
      for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, { key: k, operators: new Set(), emissions: 0, exported: 0, ee: 0, verifiedExport: 0 }); const g = m.get(k); g.operators.add(r.operator); g.emissions += r.emissions; g.exported += r.exported; g.ee += r.ee; if (r.verified) g.verifiedExport += r.exported; }
      return [...m.values()].map(g => { const n = g.operators.size; const hidden = n < minGroup; return { key: g.key, operators: n, hidden, emissions: hidden ? null : g.emissions, exported: hidden ? null : g.exported, ee: hidden ? null : g.ee, verifiedShare: hidden || !g.exported ? null : g.verifiedExport / g.exported }; });
    };
    return { rows, minGroup, bySector: by("group"), byRegion: by("region") };
  }
  app.get("/api/dashboard/gov", { perm: "dashboard.gov" }, ctx => {
    const year = intParam(ctx.query.year, "Yil", 2020, 2040);
    const ag = aggregate(year);
    const paid = db.all("SELECT amount_uzs, rebate_uzs FROM tax_payments WHERE year = ? AND status IN ('paid','confirmed')", year).reduce((a, x) => a + x.amount_uzs - x.rebate_uzs, 0);
    const tot = ag.rows.reduce((a, r) => ({ emissions: a.emissions + r.emissions, exported: a.exported + r.exported, ee: a.ee + r.ee, ver: a.ver + (r.verified ? r.exported : 0) }), { emissions: 0, exported: 0, ee: 0, ver: 0 });
    const snap = s.ref.snapshot(`${year}-12-31`);
    const pEts = snap.get("ets.reference_usd"), cf = snap.get(`cbam.cf.${year}`) ?? 0;
    return { year, minGroup: ag.minGroup, operators: new Set(ag.rows.map(r => r.operator)).size, installations: new Set(ag.rows.map(r => r.inst)).size,
      totals: { emissions: tot.emissions, exported: tot.exported, ee: tot.ee, verifiedShare: tot.exported ? tot.ver / tot.exported : null, cbamRiskUsd: tot.ee * pEts * (1 - cf), cbamRisk100Usd: tot.ee * pEts, taxPaidUzs: paid },
      bySector: ag.bySector.map(x => ({ ...x, name: GOODS_GROUPS[x.key]?.name || x.key })), byRegion: ag.byRegion,
      ndc: { baseYear: snap.get("ndc.base_year"), target2030: snap.get("ndc.target_reduction_2030"), note: "YaIM birligiga emissiya ko'rsatkichi uchun Statistika agentligi YaIM ma'lumoti va IG inventarizatsiyasi integratsiyasi kerak (I7, I11)." } };
  });
  // Ochiq panel (kirishsiz): faqat agregatlar
  app.get("/api/public/summary", { auth: false }, ctx => {
    const year = intParam(ctx.query.year || new Date().getUTCFullYear(), "Yil", 2020, 2040);
    const ag = aggregate(year);
    return { year, minGroup: ag.minGroup, bySector: ag.bySector.map(x => ({ name: GOODS_GROUPS[x.key]?.name || x.key, operators: x.hidden ? `< ${ag.minGroup}` : x.operators, emissions: x.emissions, exported: x.exported, verifiedShare: x.verifiedShare })) };
  });

  /* ---------- Integratsiyalar ---------- */
  const ilog = (system, direction, summary, request, response, status) => db.run("INSERT INTO integration_log (id, system, direction, summary, request, response, status, at) VALUES (?,?,?,?,?,?,?,?)",
    newId("int"), system, direction, summary, request ? JSON.stringify(request).slice(0, 4000) : null, response ? JSON.stringify(response).slice(0, 4000) : null, status, now());
  // I2 (mock): STIR bo'yicha rekvizitlar — haqiqiy Soliq qo'mitasi API ulanmaguncha sinov ma'lumoti
  app.get("/api/integrations/stir/:stir", { perm: ["operators.create", "registry.write"] }, ctx => {
    const stir = ctx.params.stir;
    if (!/^\d{9}$/.test(stir)) throw bad("STIR 9 ta raqam bo'lishi kerak.");
    const existing = db.get("SELECT * FROM operators WHERE stir = ?", stir);
    const resp = existing ? { stir, name: existing.name, oked: existing.oked, address: existing.address, source: "platforma reyestri" }
      : { stir, name: null, oked: null, address: null, source: "mock", note: "Soliq qo'mitasi integratsiyasi (I2) ulanmagan — rekvizitlarni qo'lda kiriting." };
    ilog("soliq_stir", "in", `STIR ${stir}`, { stir }, resp, existing ? "ok" : "mock");
    return resp;
  });
  // I8: Markaziy bank kurslari (ochiq API). Tarmoq bo'lmasa xato qaytariladi; qiymat tizim nomidan ma'lumotnomaga yoziladi.
  app.post("/api/integrations/cbu/sync", { perm: "integrations.run" }, async ctx => {
    let data;
    try {
      const r = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/", { signal: AbortSignal.timeout(8000) });
      data = await r.json();
    } catch (e) { ilog("cbu", "in", "kurslar", null, { error: e.message }, "error"); throw new HttpError(502, "Markaziy bank API siga ulanib bo'lmadi: " + e.message); }
    const pick = c => data.find(x => x.Ccy === c);
    const out = {};
    for (const c of ["USD", "EUR"]) {
      const x = pick(c); if (!x) continue;
      const [dd, mm, yy] = String(x.Date).split(".");
      const validFrom = `${yy}-${mm}-${dd}`;
      const rate = Number(String(x.Rate).replace(",", "."));
      const cur = s.ref.snapshot(validFrom).get(`fx.${c}`);
      if (cur !== rate) s.ref.systemSet({ key: `fx.${c}`, value: rate, unit: `so'm/${c}`, source: `Markaziy bank, ${x.Date}`, validFrom }, "cbu");
      out[c] = { rate, date: validFrom };
    }
    ilog("cbu", "in", "kurslar", null, out, "ok");
    audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action: "integration.cbu_sync", after: out, ip: ctx.ip });
    return out;
  });
  // I9: EU ETS narxi (litsenziyalangan manba ulanmaguncha qo'lda; tizim nomidan yoziladi)
  app.post("/api/integrations/ets", { perm: "integrations.run" }, ctx => {
    const b = clean(ctx.body, { priceEur: { t: "num", req: true, min: 1, max: 1000 }, date: { t: "date", req: true }, source: { t: "str", req: true, max: 200 } });
    const r = s.ref.systemSet({ key: "ets.price_eur", value: b.priceEur, unit: "EUR/t CO2e", source: b.source, validFrom: b.date }, "ets");
    ilog("eu_ets", "in", `ETS ${b.priceEur} EUR`, b, null, "ok");
    notify.toRole(db, "exporter_admin", "refdata", `EU ETS narxi yangilandi: ${b.priceEur} €/t (${b.date}). CBAM prognozlari qayta hisoblanadi.`, "#/cbam");
    return r;
  });
  app.get("/api/integrations/log", { perm: ["integrations.run", "audit.read"] }, () => db.all("SELECT id, system, direction, summary, status, at FROM integration_log ORDER BY at DESC LIMIT 200").map(r => camel(r)));

  app.get("/api/system/health", { auth: false }, () => ({ ok: true, time: now(), audit: db.get("SELECT COUNT(*) AS c FROM audit").c }));
}

module.exports = { register, tifRowsToEntries };
