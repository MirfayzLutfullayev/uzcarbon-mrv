/*
 * M1 — reyestr (korxona, inshoot, jarayon, manba oqimi, hisoblagich, importyor, verifikator)
 * M2 — monitoring rejasi (tarmoq shablonlari, versiyalash, verifikatorga yuborish).
 */
"use strict";
const audit = require("../db/audit");
const { now, newId, parseJson } = require("../db/db");
const { bad, forbidden, notFound, HttpError } = require("../http/app");
const { clean } = require("../http/validate");
const { can } = require("../auth/rbac");
const A = require("../services/access");
const { camel, setClause, insertClause } = require("../services/util");
const { STREAM_TYPES } = require("../core/process-calc");
const { GOODS_GROUPS } = require("../core/emissions");

const REGIONS = ["Toshkent sh.", "Toshkent vil.", "Andijon", "Buxoro", "Farg'ona", "Jizzax", "Xorazm", "Namangan", "Navoiy", "Qashqadaryo", "Qoraqalpog'iston Resp.", "Samarqand", "Sirdaryo", "Surxondaryo"];

const operatorSchema = {
  stir: { t: "str", req: true, re: /^\d{9}$/, msg: "STIR 9 ta raqamdan iborat bo'lishi kerak.", label: "STIR" },
  name: { t: "str", req: true, max: 200, label: "Nomi" }, oked: { t: "str", max: 20, re: /^[\d.]{2,20}$/, label: "OKED" },
  address: { t: "str", max: 300 }, o3ciOperatorId: { t: "str", max: 60 }, contactPerson: { t: "str", max: 120 },
  contactPhone: { t: "str", max: 40, re: /^[+\d ()-]{5,40}$/ }, contactEmail: { t: "str", max: 120, re: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
};
const installationSchema = {
  operatorId: { t: "str", max: 60 }, name: { t: "str", req: true, max: 200, label: "Nomi" }, address: { t: "str", max: 300 },
  region: { t: "enum", vals: REGIONS, label: "Hudud" }, lat: { t: "num", min: 37, max: 46, label: "Kenglik" }, lon: { t: "num", min: 55, max: 74, label: "Uzunlik" },
  unlocode: { t: "str", re: /^[A-Z]{2}[A-Z0-9]{3}$/, msg: "UN/LOCODE: 5 belgi, masalan UZTAS.", label: "UN/LOCODE" },
  capacityT: { t: "num", min: 0, label: "Quvvat" }, o3ciInstallationId: { t: "str", max: 60 },
};
const processSchema = {
  installationId: { t: "str", max: 60 }, name: { t: "str", req: true, max: 200, label: "Nomi" },
  goodsGroup: { t: "enum", req: true, vals: Object.keys(GOODS_GROUPS), label: "Tovar guruhi" }, route: { t: "str", max: 200 },
  tifCode: { t: "str", re: /^\d{10}$/, msg: "TIF TN kodi 10 ta raqam bo'lishi kerak.", label: "TIF TN" }, boundary: { t: "str", max: 1000 },
  alCapacity: { t: "num", min: 0 }, exportPriceUsd: { t: "num", min: 0, label: "Eksport narxi" },
};
const streamSchema = {
  processId: { t: "str", max: 60 }, name: { t: "str", req: true, max: 200, label: "Nomi" },
  type: { t: "enum", req: true, vals: Object.keys(STREAM_TYPES), label: "Turi" },
  method: { t: "enum", vals: ["calculation", "mass_balance", "measurement"], label: "Usul" },
  fuelKey: { t: "str", max: 60 }, materialKey: { t: "str", max: 60 }, gas: { t: "enum", vals: ["CO2", "N2O", "CF4", "C2F6"] },
  unit: { t: "enum", vals: ["t", "m3", "1000m3", "MWh", "TJ", "t CO2e"] },
  ef: { t: "num", min: 0 }, ncv: { t: "num", min: 0 }, of: { t: "num", min: 0, max: 1 }, cf: { t: "num", min: 0, max: 1 },
  carbon: { t: "num", min: 0, max: 1, label: "Uglerod ulushi" }, eta: { t: "num", min: 0, max: 1 },
  efSource: { t: "enum", vals: ["grid", "ppa", "direct", "own"] }, precursorSource: { t: "enum", vals: ["internal", "supplier", "default"] },
  precursorProcessId: { t: "str", max: 60 }, precursorTif: { t: "str", re: /^\d{10}$/ },
  supplierSeeDir: { t: "num", min: 0 }, supplierSeeInd: { t: "num", min: 0 },
  tier: { t: "str", max: 20 }, sourceLevel: { t: "enum", vals: ["measured", "lab", "supplier", "default"] }, meterId: { t: "str", max: 60 }, active: { t: "bool" },
};

/** Oqim turiga qarab qo'shimcha tekshiruv. */
function checkStream(s, st, snap) {
  if (st.type === "fuel") {
    if (!st.fuelKey || !snap.get("fuel." + st.fuelKey)) throw bad("Yoqilg'i turini ma'lumotnomadan tanlang.");
  }
  if (st.type === "material" && !(st.ef != null || (st.materialKey && snap.get("material." + st.materialKey)))) throw bad("Material yoki emissiya koeffitsiyentini ko'rsating.");
  if ((st.type === "gas" || st.type === "cems") && !st.gas) throw bad("Gaz turini tanlang.");
  if (st.type === "electricity" && ["ppa", "direct"].includes(st.efSource) && st.ef == null) throw bad("PPA yoki to'g'ridan-to'g'ri ulanish uchun manba EF (t CO2/MWh) kiriting.");
  if (st.type === "precursor") {
    if (!st.precursorSource) throw bad("Prekursor manbasini tanlang.");
    if (st.precursorSource === "internal" && !st.precursorProcessId) throw bad("Ichki prekursor jarayonini tanlang.");
    if (st.precursorSource === "supplier" && st.supplierSeeDir == null) throw bad("Yetkazib beruvchi SEE qiymatini kiriting.");
    if (st.precursorSource === "default" && !st.precursorTif) throw bad("Prekursor TIF TN kodini kiriting.");
  }
  if (st.type === "mass_in" || st.type === "mass_out") if (st.carbon == null) throw bad("Massa balansi uchun uglerod ulushini (0..1) kiriting.");
}

/* ---------- Tarmoq shablonlari (M2.2) ---------- */
const TEMPLATES = {
  cement: [
    { name: "Tabiiy gaz (pech)", type: "fuel", fuelKey: "natural_gas", unit: "1000m3", method: "calculation", sourceLevel: "measured" },
    { name: "Klinker ishlab chiqarish", type: "clinker", unit: "t", method: "calculation", sourceLevel: "lab" },
    { name: "Elektr energiyasi", type: "electricity", unit: "MWh", efSource: "grid", sourceLevel: "measured" },
    { name: "Sement (mahsulot)", type: "product", unit: "t", sourceLevel: "measured" },
  ],
  fertilizer: [
    { name: "Tabiiy gaz (yoqilg'i)", type: "fuel", fuelKey: "natural_gas", unit: "1000m3", method: "calculation", sourceLevel: "measured" },
    { name: "N2O (nitrat kislota, CEMS)", type: "cems", gas: "N2O", unit: "t", method: "measurement", sourceLevel: "measured" },
    { name: "Elektr energiyasi", type: "electricity", unit: "MWh", efSource: "grid", sourceLevel: "measured" },
    { name: "Ammiak (prekursor)", type: "precursor", unit: "t", precursorSource: "default", precursorTif: "2814100000", sourceLevel: "measured" },
    { name: "Ammiakli selitra (mahsulot)", type: "product", unit: "t", sourceLevel: "measured" },
  ],
  aluminium: [
    { name: "Elektr energiyasi (elektroliz)", type: "electricity", unit: "MWh", efSource: "grid", sourceLevel: "measured" },
    { name: "Anod iste'moli", type: "material", materialKey: "prebaked_anode", unit: "t", method: "calculation", sourceLevel: "measured" },
    { name: "CF4 (anod effekti)", type: "gas", gas: "CF4", unit: "t", method: "calculation", sourceLevel: "default" },
    { name: "C2F6 (anod effekti)", type: "gas", gas: "C2F6", unit: "t", method: "calculation", sourceLevel: "default" },
    { name: "Alyuminiy (mahsulot)", type: "product", unit: "t", sourceLevel: "measured" },
  ],
  hydrogen: [
    { name: "Tabiiy gaz (yoqilg'i)", type: "fuel", fuelKey: "natural_gas", unit: "1000m3", method: "calculation", sourceLevel: "measured" },
    { name: "Tabiiy gaz (xomashyo, massa balansi)", type: "mass_in", unit: "t", carbon: 0.73, method: "mass_balance", sourceLevel: "lab" },
    { name: "Vodorod (mahsulot)", type: "product", unit: "t", sourceLevel: "measured" },
  ],
  iron_steel: [
    { name: "Tabiiy gaz", type: "fuel", fuelKey: "natural_gas", unit: "1000m3", method: "calculation", sourceLevel: "measured" },
    { name: "Koks", type: "fuel", fuelKey: "coke", unit: "t", method: "calculation", sourceLevel: "supplier" },
    { name: "Ohaktosh", type: "material", materialKey: "limestone", unit: "t", method: "calculation", sourceLevel: "measured" },
    { name: "Grafit elektrodlar", type: "material", materialKey: "graphite_electrode", unit: "t", method: "calculation", sourceLevel: "measured" },
    { name: "Elektr energiyasi", type: "electricity", unit: "MWh", efSource: "grid", sourceLevel: "measured" },
    { name: "Po'lat prokat (mahsulot)", type: "product", unit: "t", sourceLevel: "measured" },
  ],
};

function register(app) {
  const { db, ref } = app.s;
  const log = (ctx, action, entity, entityId, before, after) => audit.log(db, { actor: ctx.user.id, role: ctx.user.role, action, entity, entityId, before, after, ip: ctx.ip });
  const nowSnap = () => ref.snapshot(new Date().toISOString().slice(0, 10));

  app.get("/api/meta", {}, () => ({ regions: REGIONS, goodsGroups: GOODS_GROUPS, streamTypes: STREAM_TYPES, templates: TEMPLATES }));

  /* ---------- Korxonalar ---------- */
  app.get("/api/operators", { perm: ["registry.read"] }, ctx => {
    const ids = A.operatorIds(db, ctx.user);
    const rows = ids ? (ids.length ? db.all(`SELECT * FROM operators WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY name`, ...ids) : []) : db.all("SELECT * FROM operators ORDER BY name");
    return rows.map(r => camel(r));
  });
  app.get("/api/operators/:id", { perm: ["registry.read"] }, ctx => camel(A.operator(db, ctx.user, ctx.params.id)));
  app.post("/api/operators", { perm: "operators.create" }, ctx => {
    const b = clean(ctx.body, operatorSchema);
    if (db.get("SELECT id FROM operators WHERE stir = ?", b.stir)) throw bad("Bu STIR bilan korxona allaqachon ro'yxatda.");
    const id = newId("op"), t = now();
    const ins = insertClause({ id, ...b, createdAt: t, updatedAt: t });
    db.run(`INSERT INTO operators (${ins.cols}) VALUES (${ins.marks})`, ...ins.params);
    log(ctx, "operator.create", "operator", id, null, b);
    return camel(db.get("SELECT * FROM operators WHERE id = ?", id));
  });
  app.put("/api/operators/:id", { perm: ["registry.write", "operators.create"] }, ctx => {
    const op = A.operator(db, ctx.user, ctx.params.id);
    const b = clean(ctx.body, operatorSchema, { partial: true });
    if (b.stir && b.stir !== op.stir) throw bad("STIR o'zgartirilmaydi.");
    delete b.stir;
    const sc = setClause({ ...b, updatedAt: now() });
    db.run(`UPDATE operators SET ${sc.sql} WHERE id = ?`, ...sc.params, op.id);
    log(ctx, "operator.update", "operator", op.id, camel(op), b);
    return camel(db.get("SELECT * FROM operators WHERE id = ?", op.id));
  });

  /* ---------- Inshootlar ---------- */
  app.get("/api/installations", { perm: ["registry.read"] }, ctx => {
    const ids = A.operatorIds(db, ctx.user);
    let rows = ids ? (ids.length ? db.all(`SELECT * FROM installations WHERE operator_id IN (${ids.map(() => "?").join(",")}) ORDER BY name`, ...ids) : []) : db.all("SELECT * FROM installations ORDER BY name");
    if (A.scopeOf(ctx.user) === "assigned") { const set = new Set(A.verifierAssignments(db, ctx.user).map(a => a.installation_id)); rows = rows.filter(r => set.has(r.id)); }
    if (ctx.query.operator) rows = rows.filter(r => r.operator_id === ctx.query.operator);
    return rows.map(r => {
      const procs = db.all("SELECT id, name, goods_group, tif_code FROM processes WHERE installation_id = ? ORDER BY name", r.id).map(p => camel(p));
      return { ...camel(r), operatorName: db.get("SELECT name FROM operators WHERE id = ?", r.operator_id)?.name, processes: procs };
    });
  });
  app.get("/api/installations/:id", { perm: ["registry.read"] }, ctx => {
    const inst = A.installation(db, ctx.user, ctx.params.id);
    const processes = db.all("SELECT * FROM processes WHERE installation_id = ? ORDER BY name", inst.id).map(p => ({
      ...camel(p), streams: db.all("SELECT * FROM streams WHERE process_id = ? ORDER BY created_at, id", p.id).map(s => camel(s)),
    }));
    const meters = db.all("SELECT * FROM meters WHERE installation_id = ? ORDER BY serial", inst.id).map(m => camel(m));
    return { ...camel(inst), operatorName: db.get("SELECT name FROM operators WHERE id = ?", inst.operator_id)?.name, processes, meters };
  });
  app.post("/api/installations", { perm: "registry.write" }, ctx => {
    const b = clean(ctx.body, installationSchema);
    b.operatorId = ctx.user.operator_id;
    if (!b.operatorId) throw forbidden("Foydalanuvchi korxonaga bog'lanmagan.");
    const id = newId("inst"), t = now();
    const ins = insertClause({ id, ...b, createdAt: t, updatedAt: t });
    db.run(`INSERT INTO installations (${ins.cols}) VALUES (${ins.marks})`, ...ins.params);
    log(ctx, "installation.create", "installation", id, null, b);
    return camel(db.get("SELECT * FROM installations WHERE id = ?", id));
  });
  app.put("/api/installations/:id", { perm: "registry.write" }, ctx => {
    const inst = A.installation(db, ctx.user, ctx.params.id, { write: true });
    const b = clean(ctx.body, installationSchema, { partial: true });
    delete b.operatorId;
    const sc = setClause({ ...b, updatedAt: now() });
    db.run(`UPDATE installations SET ${sc.sql} WHERE id = ?`, ...sc.params, inst.id);
    log(ctx, "installation.update", "installation", inst.id, camel(inst), b);
    return camel(db.get("SELECT * FROM installations WHERE id = ?", inst.id));
  });
  app.del("/api/installations/:id", { perm: "registry.write" }, ctx => {
    const inst = A.installation(db, ctx.user, ctx.params.id, { write: true });
    if (db.get("SELECT id FROM processes WHERE installation_id = ? LIMIT 1", inst.id)) throw new HttpError(409, "Avval inshootning jarayonlarini o'chiring.");
    db.run("DELETE FROM meters WHERE installation_id = ?", inst.id);
    db.run("DELETE FROM installations WHERE id = ?", inst.id);
    log(ctx, "installation.delete", "installation", inst.id, camel(inst), null);
    return { ok: true };
  });

  /* ---------- Jarayonlar ---------- */
  app.post("/api/processes", { perm: "registry.write" }, ctx => {
    const b = clean(ctx.body, { ...processSchema, installationId: { t: "str", req: true, max: 60 } });
    A.installation(db, ctx.user, b.installationId, { write: true });
    const id = newId("proc"), t = now();
    const ins = insertClause({ id, ...b, createdAt: t, updatedAt: t });
    db.run(`INSERT INTO processes (${ins.cols}) VALUES (${ins.marks})`, ...ins.params);
    log(ctx, "process.create", "process", id, null, b);
    return camel(db.get("SELECT * FROM processes WHERE id = ?", id));
  });
  app.put("/api/processes/:id", { perm: "registry.write" }, ctx => {
    const { process: p } = A.processRow(db, ctx.user, ctx.params.id, { write: true });
    const b = clean(ctx.body, processSchema, { partial: true });
    delete b.installationId;
    const sc = setClause({ ...b, updatedAt: now() });
    db.run(`UPDATE processes SET ${sc.sql} WHERE id = ?`, ...sc.params, p.id);
    log(ctx, "process.update", "process", p.id, camel(p), b);
    return camel(db.get("SELECT * FROM processes WHERE id = ?", p.id));
  });
  app.del("/api/processes/:id", { perm: "registry.write" }, ctx => {
    const { process: p } = A.processRow(db, ctx.user, ctx.params.id, { write: true });
    if (db.get("SELECT a.id FROM activity a JOIN streams s ON s.id = a.stream_id WHERE s.process_id = ? LIMIT 1", p.id)) throw new HttpError(409, "Jarayonda faoliyat ma'lumotlari bor — o'chirib bo'lmaydi.");
    if (db.get("SELECT id FROM calc_results WHERE process_id = ? LIMIT 1", p.id)) throw new HttpError(409, "Jarayon bo'yicha saqlangan hisob natijalari bor — o'chirib bo'lmaydi.");
    db.tx(() => { db.run("DELETE FROM streams WHERE process_id = ?", p.id); db.run("DELETE FROM processes WHERE id = ?", p.id); });
    log(ctx, "process.delete", "process", p.id, camel(p), null);
    return { ok: true };
  });
  app.post("/api/processes/:id/apply-template", { perm: "plan.write" }, ctx => {
    const { process: p } = A.processRow(db, ctx.user, ctx.params.id, { write: true });
    const tpl = TEMPLATES[p.goods_group];
    if (db.get("SELECT id FROM streams WHERE process_id = ? LIMIT 1", p.id)) throw new HttpError(409, "Jarayonda allaqachon manba oqimlari bor.");
    const t = now();
    db.tx(() => {
      for (const st of tpl) {
        const ins = insertClause({ id: newId("st"), processId: p.id, ...st, createdAt: t, updatedAt: t });
        db.run(`INSERT INTO streams (${ins.cols}) VALUES (${ins.marks})`, ...ins.params);
      }
      log(ctx, "process.apply_template", "process", p.id, null, { group: p.goods_group, streams: tpl.length });
    });
    return db.all("SELECT * FROM streams WHERE process_id = ?", p.id).map(s => camel(s));
  });

  /* ---------- Manba oqimlari ---------- */
  app.post("/api/streams", { perm: "plan.write" }, ctx => {
    const b = clean(ctx.body, { ...streamSchema, processId: { t: "str", req: true, max: 60 } });
    A.processRow(db, ctx.user, b.processId, { write: true });
    checkStream(app.s, b, nowSnap());
    if (b.precursorProcessId) A.processRow(db, ctx.user, b.precursorProcessId);
    const id = newId("st"), t = now();
    const ins = insertClause({ id, ...b, createdAt: t, updatedAt: t });
    db.run(`INSERT INTO streams (${ins.cols}) VALUES (${ins.marks})`, ...ins.params);
    log(ctx, "stream.create", "stream", id, null, b);
    return camel(db.get("SELECT * FROM streams WHERE id = ?", id));
  });
  app.put("/api/streams/:id", { perm: "plan.write" }, ctx => {
    const { stream } = A.streamRow(db, ctx.user, ctx.params.id, { write: true });
    const b = clean(ctx.body, streamSchema, { partial: true });
    delete b.processId;
    const merged = { ...camel(stream), ...b };
    checkStream(app.s, merged, nowSnap());
    if (b.type && b.type !== stream.type && db.get("SELECT id FROM activity WHERE stream_id = ? LIMIT 1", stream.id)) throw new HttpError(409, "Ma'lumot kiritilgan oqim turini o'zgartirib bo'lmaydi — yangi oqim yarating.");
    const sc = setClause({ ...b, updatedAt: now() });
    db.run(`UPDATE streams SET ${sc.sql} WHERE id = ?`, ...sc.params, stream.id);
    log(ctx, "stream.update", "stream", stream.id, camel(stream), b);
    return camel(db.get("SELECT * FROM streams WHERE id = ?", stream.id));
  });
  app.del("/api/streams/:id", { perm: "plan.write" }, ctx => {
    const { stream } = A.streamRow(db, ctx.user, ctx.params.id, { write: true });
    if (db.get("SELECT id FROM activity WHERE stream_id = ? LIMIT 1", stream.id)) throw new HttpError(409, "Oqimda ma'lumot bor — o'chirish o'rniga nofaol qiling.");
    db.run("DELETE FROM streams WHERE id = ?", stream.id);
    log(ctx, "stream.delete", "stream", stream.id, camel(stream), null);
    return { ok: true };
  });

  /* ---------- Hisoblagichlar (D6) ---------- */
  const meterSchema = { installationId: { t: "str", max: 60 }, type: { t: "str", max: 80 }, serial: { t: "str", req: true, max: 80, label: "Seriya raqami" },
    calibrationDate: { t: "date" }, certificateDocId: { t: "str", max: 60 }, uncertainty: { t: "num", min: 0, max: 100 } };
  app.post("/api/meters", { perm: "plan.write" }, ctx => {
    const b = clean(ctx.body, { ...meterSchema, installationId: { t: "str", req: true, max: 60 } });
    A.installation(db, ctx.user, b.installationId, { write: true });
    const id = newId("mtr"), t = now();
    const ins = insertClause({ id, ...b, createdAt: t, updatedAt: t });
    db.run(`INSERT INTO meters (${ins.cols}) VALUES (${ins.marks})`, ...ins.params);
    log(ctx, "meter.create", "meter", id, null, b);
    return camel(db.get("SELECT * FROM meters WHERE id = ?", id));
  });

  /* ---------- Importyorlar (M1.8) ---------- */
  const importerSchema = { name: { t: "str", req: true, max: 200, label: "Nomi" }, eori: { t: "str", re: /^[A-Z]{2}[A-Z0-9]{1,15}$/, msg: "EORI: mamlakat kodi + 15 tagacha belgi.", label: "EORI" },
    country: { t: "str", re: /^[A-Z]{2}$/, msg: "Mamlakat — 2 harfli ISO kod.", label: "Mamlakat" }, contract: { t: "str", max: 300 } };
  app.get("/api/importers", { perm: ["registry.read", "docs.read"] }, ctx => {
    if (ctx.user.role === "importer") return db.all("SELECT * FROM importers WHERE id = ?", ctx.user.importer_id).map(r => camel(r));
    const ids = A.operatorIds(db, ctx.user);
    const rows = ids ? (ids.length ? db.all(`SELECT * FROM importers WHERE operator_id IN (${ids.map(() => "?").join(",")}) ORDER BY name`, ...ids) : []) : db.all("SELECT * FROM importers ORDER BY name");
    return rows.map(r => camel(r));
  });
  app.post("/api/importers", { perm: "registry.write" }, ctx => {
    const b = clean(ctx.body, importerSchema);
    const id = newId("imp"), t = now();
    db.run("INSERT INTO importers (id, operator_id, name, eori, country, contract, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", id, ctx.user.operator_id, b.name, b.eori, b.country, b.contract, t, t);
    log(ctx, "importer.create", "importer", id, null, b);
    return camel(db.get("SELECT * FROM importers WHERE id = ?", id));
  });

  /* Foydalanuvchilarni boshqarish uchun yengil ma'lumotnoma: faqat nomlar, emissiya ma'lumotlarisiz. */
  app.get("/api/directory", { perm: "users.manage_all" }, () => ({
    operators: db.all("SELECT id, name, stir FROM operators ORDER BY name").map(r => camel(r)),
    importers: db.all("SELECT id, name, eori FROM importers ORDER BY name").map(r => camel(r)),
    verifiers: db.all("SELECT id, name FROM verifiers ORDER BY name").map(r => camel(r)),
  }));

  /* ---------- Verifikatorlar reyestri (M8.1) ---------- */
  const verifierSchema = { name: { t: "str", req: true, max: 200 }, accreditationNo: { t: "str", req: true, max: 60, label: "Akkreditatsiya raqami" },
    accreditedUntil: { t: "date", req: true, label: "Akkreditatsiya muddati" }, sectors: { t: "str", max: 200 } };
  app.get("/api/verifiers", {}, () => db.all("SELECT * FROM verifiers ORDER BY name").map(r => ({ ...camel(r), active: r.accredited_until >= now().slice(0, 10) })));
  app.post("/api/verifiers", { perm: "verifiers.manage" }, ctx => {
    const b = clean(ctx.body, verifierSchema);
    const id = newId("ver"), t = now();
    db.run("INSERT INTO verifiers (id, name, accreditation_no, accredited_until, sectors, created_at, updated_at) VALUES (?,?,?,?,?,?,?)", id, b.name, b.accreditationNo, b.accreditedUntil, b.sectors, t, t);
    log(ctx, "verifier.create", "verifier", id, null, b);
    return camel(db.get("SELECT * FROM verifiers WHERE id = ?", id));
  });

  /* ---------- Monitoring rejasi (M2.3) ---------- */
  function snapshotOf(instId) {
    return db.all("SELECT * FROM processes WHERE installation_id = ? ORDER BY name", instId).map(p => ({
      ...camel(p), streams: db.all("SELECT * FROM streams WHERE process_id = ? ORDER BY created_at, id", p.id).map(s => camel(s)),
    }));
  }
  app.get("/api/installations/:id/plans", { perm: ["registry.read", "plan.read"] }, ctx => {
    const inst = A.installation(db, ctx.user, ctx.params.id);
    return db.all("SELECT * FROM monitoring_plans WHERE installation_id = ? ORDER BY version DESC", inst.id).map(r => camel(r, ["snapshot"]));
  });
  app.post("/api/installations/:id/plans", { perm: "plan.write" }, ctx => {
    const inst = A.installation(db, ctx.user, ctx.params.id, { write: true });
    const b = clean(ctx.body || {}, { note: { t: "str", max: 1000 } });
    const snap = snapshotOf(inst.id);
    if (!snap.length || !snap.some(p => p.streams.length)) throw bad("Monitoring rejasi uchun kamida bitta jarayon va manba oqimi kerak.");
    const v = (db.get("SELECT MAX(version) AS v FROM monitoring_plans WHERE installation_id = ?", inst.id).v || 0) + 1;
    const id = newId("plan");
    db.run("INSERT INTO monitoring_plans (id, installation_id, version, status, snapshot, note, created_by, created_at) VALUES (?,?,?, 'draft', ?,?,?,?)", id, inst.id, v, JSON.stringify(snap), b.note, ctx.user.id, now());
    log(ctx, "plan.create", "plan", id, null, { installationId: inst.id, version: v });
    return camel(db.get("SELECT * FROM monitoring_plans WHERE id = ?", id), ["snapshot"]);
  });
  app.post("/api/plans/:id/submit", { perm: "plan.submit" }, ctx => {
    const plan = db.get("SELECT * FROM monitoring_plans WHERE id = ?", ctx.params.id);
    if (!plan) throw notFound();
    A.installation(db, ctx.user, plan.installation_id, { write: true });
    if (plan.status !== "draft") throw new HttpError(409, "Faqat qoralama rejani yuborish mumkin.");
    db.run("UPDATE monitoring_plans SET status = 'submitted', submitted_at = ? WHERE id = ?", now(), plan.id);
    log(ctx, "plan.submit", "plan", plan.id, null, null);
    return camel(db.get("SELECT * FROM monitoring_plans WHERE id = ?", plan.id), ["snapshot"]);
  });
  app.post("/api/plans/:id/decide", { perm: "plan.decide" }, ctx => {
    const plan = db.get("SELECT * FROM monitoring_plans WHERE id = ?", ctx.params.id);
    if (!plan) throw notFound();
    A.installation(db, ctx.user, plan.installation_id);
    const b = clean(ctx.body, { decision: { t: "enum", req: true, vals: ["approved", "rejected"] }, note: { t: "str", max: 1000 } });
    if (plan.status !== "submitted") throw new HttpError(409, "Reja ko'rib chiqish uchun yuborilmagan.");
    db.run("UPDATE monitoring_plans SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?", b.decision, ctx.user.id, now(), b.note, plan.id);
    log(ctx, "plan.decide", "plan", plan.id, null, b);
    return camel(db.get("SELECT * FROM monitoring_plans WHERE id = ?", plan.id), ["snapshot"]);
  });
}

module.exports = { register, TEMPLATES, REGIONS };
