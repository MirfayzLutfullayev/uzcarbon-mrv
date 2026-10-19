/*
 * M7 — eksportyor hujjatlar paketi va hisobotlar: ma'lumotni yig'ish va formatlarga chiqarish (JSON, XML, HTML, DOCX, XLSX).
 * Tillar: uz (lotin), ru, en (EI importyori uchun).
 */
"use strict";
const crypto = require("crypto");
const { computeProcess } = require("../services/calc");
const tax = require("../services/tax");
const cbam = require("../services/cbam");
const { writeXlsx } = require("./xlsx");
const { writeDocx } = require("./docx");
const { GOODS_GROUPS } = require("../core/emissions");

const L = {
  uz: { title: "Eksportyor hujjatlar paketi (CBAM)", annual: "Inshootning yillik emissiya hisoboti", operator: "Korxona", stir: "STIR", installation: "Inshoot", address: "Manzil",
    year: "Hisobot yili", goods: "Tovarlar va solishtirma emissiyalar", process: "Jarayon", group: "Tovar guruhi", tif: "TIF TN / CN", al: "Mahsulot, t", seeDir: "SEE to'g'ridan-to'g'ri",
    seeInd: "SEE bilvosita", seeCbam: "SEE (CBAM)", basis: "Asos", method: "Kiritilgan emissiyani hisoblash usuli", tax: "Uglerod soliqi to'lovi tasdiqnomasi (CBAM 9-modda)",
    period: "Davr", kind: "Turi", amount: "Summa, so'm", fx: "Kurs", usd: "Summa, USD", status: "Holati", peff: "Samarali to'langan narx P_eff, USD/t CO2e", cp: "Tovar birligiga to'langan narx CP_g, USD/t",
    verification: "Verifikatsiya xulosasi", verifier: "Verifikator", opinion: "Xulosa", signed: "Imzolangan", o3ci: "O3CI", o3ciInst: "O3CI installation ID", batches: "Eksport partiyalari",
    decl: "Deklaratsiya", date: "Sana", net: "Netto, t", ee: "EE, t CO2e", importer: "Importyor", sign: "Platforma imzosi", hash: "Hujjat xeshi (SHA-256)", generated: "Yaratilgan",
    none: "Ma'lumot yo'q", actual: "haqiqiy (verifikatsiyalangan)", default: "standart qiymat", actual_unverified: "haqiqiy (verifikatsiyasiz)", up: "yuqori oqim (yoqilg'i)", down: "quyi oqim (jarayon)",
    positive: "ijobiy", qualified: "izohli ijobiy", negative: "salbiy", emissions: "Emissiyalar (t CO2e)", dir: "To'g'ridan-to'g'ri", ind: "Bilvosita (elektr)", prec: "Prekursorlar",
    warn: "Ogohlantirishlar", verify: "Haqiqiylikni tekshirish" },
  en: { title: "Exporter document package (CBAM)", annual: "Installation annual emissions report", operator: "Operator", stir: "Taxpayer ID (STIR)", installation: "Installation", address: "Address",
    year: "Reporting year", goods: "Goods and specific embedded emissions", process: "Production process", group: "Goods category", tif: "CN code", al: "Production, t", seeDir: "SEE direct",
    seeInd: "SEE indirect", seeCbam: "SEE (CBAM)", basis: "Basis", method: "Embedded emissions calculation method", tax: "Carbon price paid certificate (CBAM Art. 9)",
    period: "Period", kind: "Type", amount: "Amount, UZS", fx: "FX rate", usd: "Amount, USD", status: "Status", peff: "Effective carbon price paid P_eff, USD/t CO2e", cp: "Carbon price per tonne of good CP_g, USD/t",
    verification: "Verification opinion", verifier: "Verifier", opinion: "Opinion", signed: "Signed", o3ci: "O3CI", o3ciInst: "O3CI installation ID", batches: "Export consignments",
    decl: "Declaration", date: "Date", net: "Net mass, t", ee: "EE, t CO2e", importer: "Importer", sign: "Platform signature", hash: "Document hash (SHA-256)", generated: "Generated",
    none: "No data", actual: "actual (verified)", default: "default value", actual_unverified: "actual (not verified)", up: "upstream (fuel)", down: "downstream (process)",
    positive: "positive", qualified: "qualified positive", negative: "negative", emissions: "Emissions (t CO2e)", dir: "Direct", ind: "Indirect (electricity)", prec: "Precursors",
    warn: "Warnings", verify: "Authenticity check" },
  ru: { title: "Пакет документов экспортёра (CBAM)", annual: "Годовой отчёт об выбросах установки", operator: "Предприятие", stir: "ИНН", installation: "Установка", address: "Адрес",
    year: "Отчётный год", goods: "Товары и удельные выбросы", process: "Процесс", group: "Группа товаров", tif: "Код ТН ВЭД", al: "Продукция, т", seeDir: "SEE прямые",
    seeInd: "SEE косвенные", seeCbam: "SEE (CBAM)", basis: "Основание", method: "Метод расчёта встроенных выбросов", tax: "Подтверждение уплаты углеродного налога (ст. 9 CBAM)",
    period: "Период", kind: "Тип", amount: "Сумма, сум", fx: "Курс", usd: "Сумма, USD", status: "Статус", peff: "Эффективная уплаченная цена P_eff, USD/т CO2e", cp: "Цена на единицу товара CP_g, USD/т",
    verification: "Заключение верификации", verifier: "Верификатор", opinion: "Заключение", signed: "Подписано", o3ci: "O3CI", o3ciInst: "ID установки в O3CI", batches: "Экспортные партии",
    decl: "Декларация", date: "Дата", net: "Нетто, т", ee: "EE, т CO2e", importer: "Импортёр", sign: "Подпись платформы", hash: "Хеш документа (SHA-256)", generated: "Создан",
    none: "Нет данных", actual: "фактические (верифицированы)", default: "значение по умолчанию", actual_unverified: "фактические (без верификации)", up: "верхний поток (топливо)", down: "нижний поток (процесс)",
    positive: "положительное", qualified: "положительное с оговорками", negative: "отрицательное", emissions: "Выбросы (т CO2e)", dir: "Прямые", ind: "Косвенные (электроэнергия)", prec: "Прекурсоры",
    warn: "Предупреждения", verify: "Проверка подлинности" },
};

const r4 = v => (Number.isFinite(v) ? +v.toFixed(6) : null);

/** Paket ma'lumotini yig'ish. */
function build(s, installationId, year) {
  const inst = s.db.get("SELECT * FROM installations WHERE id = ?", installationId);
  const op = s.db.get("SELECT * FROM operators WHERE id = ?", inst.operator_id);
  const procs = s.db.all("SELECT id FROM processes WHERE installation_id = ? ORDER BY name", inst.id);
  const results = [];
  for (const p of procs) {
    const saved = s.db.get("SELECT * FROM calc_results WHERE process_id = ? AND year = ? AND status IN ('verified','submitted') ORDER BY CASE status WHEN 'verified' THEN 0 ELSE 1 END, version DESC LIMIT 1", p.id, year);
    const r = saved ? JSON.parse(saved.result) : computeProcess(s, p.id, year);
    results.push({ r, saved: saved ? { id: saved.id, version: saved.version, status: saved.status } : null });
  }
  const eff = tax.effective(s, inst.id, year, results.map(x => x.r));
  const goods = results.map(({ r, saved }) => {
    const cp = eff.processes.find(x => x.processId === r.processId);
    return {
      processId: r.processId, process: r.processName, goodsGroup: r.goodsGroup, goodsGroupName: GOODS_GROUPS[r.goodsGroup].name, tifCode: r.tifCode, cn8: r.tifCode ? r.tifCode.slice(0, 8) : null,
      al: r4(r.totals.al), seeDir: r4(r.see.seeDir), seeInd: r4(r.see.seeInd), seeCbam: r4(r.see.seeCbam), applied: r4(r.selection.applied), basis: r.selection.basis,
      defaultSee: r4(r.selection.default), emissions: { direct: r4(r.totals.attrDir), indirect: r4(r.totals.emEl), precursors: r4(r.totals.precDir + r.totals.precInd) },
      methods: [...new Map(r.trace.map(t => [t.id + t.formula, { id: t.id, label: t.label, formula: t.formula }])).values()].slice(0, 40),
      carbonPrice: cp ? { seeCov: r4(cp.seeCov), sCov: r4(cp.sCov), cpUsdPerT: r4(cp.cpUsdPerT) } : null,
      result: saved, refs: r.refs || [], warnings: r.warnings,
    };
  });
  const payments = s.db.all("SELECT * FROM tax_payments WHERE installation_id = ? AND year = ? AND status IN ('paid','confirmed') ORDER BY period", inst.id, year)
    .map(p => ({ period: p.period, kind: p.kind, amountUzs: p.amount_uzs, rebateUzs: p.rebate_uzs, fx: p.fx, amountUsd: r4((p.amount_uzs - p.rebate_uzs) / p.fx), budgetCode: p.budget_code, status: p.status, confirmedAt: p.confirmed_at }));
  const ver = s.db.get("SELECT v.*, vr.name AS verifier_name, vr.accreditation_no FROM verifications v JOIN verifiers vr ON vr.id = v.verifier_id WHERE v.installation_id = ? AND v.year = ? AND v.status = 'concluded' ORDER BY v.signed_at DESC LIMIT 1", inst.id, year);
  const cb = cbam.operatorYear(s, op.id, year);
  const batches = cb.batches.filter(b => goods.some(g => g.processId === b.processId)).map(b => ({ declarationNo: b.declarationNo, date: b.date, tifCode: b.tifCode, netT: b.netT, ee: r4(b.ee), eori: b.eori, country: b.country }));
  return {
    schema: "uzcarbon.package/1.0", generatedAt: new Date().toISOString(), year,
    operator: { name: op.name, stir: op.stir, o3ciOperatorId: op.o3ci_operator_id, address: op.address },
    installation: { name: inst.name, address: inst.address, region: inst.region, unlocode: inst.unlocode, lat: inst.lat, lon: inst.lon, o3ciInstallationId: inst.o3ci_installation_id },
    goods, carbonPrice: { mode: eff.mode, pEffUsd: r4(eff.pEff), emCovered: r4(eff.emCovered), payments },
    verification: ver ? { verifier: ver.verifier_name, accreditationNo: ver.accreditation_no, opinion: ver.opinion, conclusion: ver.conclusion, signedAt: ver.signed_at, signature: ver.signature } : null,
    batches,
  };
}

/** Paketni imzolash: kanonik JSON xeshi va HMAC (mock-ERI). */
function seal(pkg, key) {
  const body = JSON.stringify(pkg);
  const hash = crypto.createHash("sha256").update(body).digest("hex");
  const signature = "mock-ERI:" + crypto.createHmac("sha256", key).update(hash).digest("hex");
  return { ...pkg, seal: { hash, signature, algorithm: "SHA-256 + HMAC (ERI integratsiyasigacha vaqtinchalik)" } };
}

const x = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
function toXml(pkg) {
  const g = pkg.goods.map(it => `    <Good processName="${x(it.process)}" category="${x(it.goodsGroup)}" cn="${x(it.cn8 || "")}" tif="${x(it.tifCode || "")}">
      <Production unit="t">${it.al ?? ""}</Production>
      <SEE direct="${it.seeDir ?? ""}" indirect="${it.seeInd ?? ""}" cbam="${it.seeCbam ?? ""}" applied="${it.applied ?? ""}" basis="${x(it.basis)}" default="${it.defaultSee ?? ""}" unit="tCO2e/t"/>
      <Emissions direct="${it.emissions.direct ?? ""}" indirect="${it.emissions.indirect ?? ""}" precursors="${it.emissions.precursors ?? ""}" unit="tCO2e"/>
      ${it.carbonPrice ? `<CarbonPricePaid seeCovered="${it.carbonPrice.seeCov}" coverage="${it.carbonPrice.sCov}" usdPerTonneGood="${it.carbonPrice.cpUsdPerT}"/>` : ""}
    </Good>`).join("\n");
  const p = pkg.carbonPrice.payments.map(q => `    <Payment period="${x(q.period)}" type="${x(q.kind)}" amountUZS="${q.amountUzs}" rebateUZS="${q.rebateUzs}" fx="${q.fx}" amountUSD="${q.amountUsd}" status="${x(q.status)}"/>`).join("\n");
  const v = pkg.verification ? `  <Verification verifier="${x(pkg.verification.verifier)}" accreditation="${x(pkg.verification.accreditationNo)}" opinion="${x(pkg.verification.opinion)}" signedAt="${x(pkg.verification.signedAt)}" signature="${x(pkg.verification.signature)}"/>` : "  <Verification/>";
  const b = pkg.batches.map(q => `    <Consignment declaration="${x(q.declarationNo)}" date="${x(q.date)}" cn="${x(q.tifCode.slice(0, 8))}" netMass="${q.netT}" embeddedEmissions="${q.ee ?? ""}" eori="${x(q.eori || "")}" country="${x(q.country || "")}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- UZ-Carbon MRV: eksportyor hujjatlar paketi. EI O3CI XML sxemasiga moslashtirish I1 integratsiyasida (rasmiy XSD bilan) bajariladi. -->
<CBAMOperatorPackage schema="${x(pkg.schema)}" year="${pkg.year}" generatedAt="${x(pkg.generatedAt)}">
  <Operator name="${x(pkg.operator.name)}" taxId="${x(pkg.operator.stir)}" o3ciOperatorId="${x(pkg.operator.o3ciOperatorId || "")}"/>
  <Installation name="${x(pkg.installation.name)}" unlocode="${x(pkg.installation.unlocode || "")}" lat="${pkg.installation.lat ?? ""}" lon="${pkg.installation.lon ?? ""}" o3ciInstallationId="${x(pkg.installation.o3ciInstallationId || "")}"/>
  <Goods>
${g}
  </Goods>
  <CarbonPrice mode="${x(pkg.carbonPrice.mode)}" effectiveUSDperTonne="${pkg.carbonPrice.pEffUsd ?? ""}">
${p}
  </CarbonPrice>
${v}
  <Consignments>
${b}
  </Consignments>
  ${pkg.seal ? `<Seal hash="${pkg.seal.hash}" signature="${x(pkg.seal.signature)}"/>` : ""}
</CBAMOperatorPackage>
`;
}

const fmt = (v, d = 4) => (v == null || !Number.isFinite(+v) ? "—" : (+v).toLocaleString("uz-UZ", { maximumFractionDigits: d }).replace(/,/g, " "));

function toHtml(pkg, lang = "uz", verifyUrl = "") {
  const t = L[lang] || L.uz;
  const basisName = b => t[b] || b;
  const rows = (head, rs) => `<table><thead><tr>${head.map(h => `<th>${x(h)}</th>`).join("")}</tr></thead><tbody>${rs.length ? rs.map(r => `<tr>${r.map(c => `<td>${x(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${head.length}">${t.none}</td></tr>`}</tbody></table>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${x(t.title)} · ${x(pkg.installation.name)} · ${pkg.year}</title>
<style>
:root{--ink:#13201c;--ink2:#4b5c56;--line:#d3ddd9;--bg:#fff;--soft:#eef3f1}
@media (prefers-color-scheme:dark){:root{--ink:#e4ece9;--ink2:#a9b8b2;--line:#2b3a35;--bg:#16211e;--soft:#1d2a26}}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);max-width:960px;margin:0 auto;padding:24px 16px;font-size:13.5px;line-height:1.5}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid var(--line);padding:5px 7px;text-align:left;vertical-align:top}th{background:var(--soft)}
.kv{display:grid;grid-template-columns:max-content 1fr;gap:3px 14px}.kv dt{color:var(--ink2)}.kv dd{margin:0}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;word-break:break-all}.sub{color:var(--ink2)}
.wrap{overflow-x:auto}@media print{body{padding:0}.noprint{display:none}}
</style></head><body>
<p class="noprint sub">PDF: Ctrl+P → "PDF sifatida saqlash" / "Save as PDF".</p>
<h1>${x(t.title)}</h1><p class="sub">${x(pkg.installation.name)} · ${t.year}: ${pkg.year} · ${t.generated}: ${x(pkg.generatedAt.slice(0, 19).replace("T", " "))} UTC</p>
<dl class="kv"><dt>${t.operator}</dt><dd>${x(pkg.operator.name)}</dd><dt>${t.stir}</dt><dd>${x(pkg.operator.stir)}</dd><dt>${t.installation}</dt><dd>${x(pkg.installation.name)}</dd>
<dt>${t.address}</dt><dd>${x([pkg.installation.address, pkg.installation.region].filter(Boolean).join(", ") || "—")}</dd><dt>UN/LOCODE</dt><dd>${x(pkg.installation.unlocode || "—")}</dd>
<dt>${t.o3ciInst}</dt><dd>${x(pkg.installation.o3ciInstallationId || "—")}</dd></dl>
<h2>${t.goods}</h2><div class="wrap">${rows([t.process, t.group, t.tif, t.al, t.seeDir, t.seeInd, t.seeCbam, t.basis],
    pkg.goods.map(g => [g.process, g.goodsGroupName, g.cn8 || "—", fmt(g.al, 1), fmt(g.seeDir), fmt(g.seeInd), fmt(g.applied), basisName(g.basis)]))}</div>
<h2>${t.emissions}</h2><div class="wrap">${rows([t.process, t.dir, t.ind, t.prec], pkg.goods.map(g => [g.process, fmt(g.emissions.direct, 1), fmt(g.emissions.indirect, 1), fmt(g.emissions.precursors, 1)]))}</div>
<h2>${t.method}</h2>${pkg.goods.map(g => `<p><b>${x(g.process)}</b></p><ul>${g.methods.filter(m => /^F-/.test(m.id)).map(m => `<li><span class="mono">${x(m.id)}</span> ${x(m.label)}: <span class="mono">${x(m.formula)}</span></li>`).join("")}</ul>`).join("")}
<h2>${t.tax}</h2><div class="wrap">${rows([t.period, t.kind, t.amount, t.fx, t.usd, t.status], pkg.carbonPrice.payments.map(p => [p.period, t[p.kind] || p.kind, fmt(p.amountUzs - p.rebateUzs, 0), fmt(p.fx, 2), fmt(p.amountUsd, 2), p.status]))}</div>
<dl class="kv" style="margin-top:8px"><dt>${t.peff}</dt><dd>${fmt(pkg.carbonPrice.pEffUsd, 4)}</dd>${pkg.goods.map(g => `<dt>${t.cp}: ${x(g.process)}</dt><dd>${fmt(g.carbonPrice?.cpUsdPerT, 4)}</dd>`).join("")}</dl>
<h2>${t.verification}</h2>${pkg.verification ? `<dl class="kv"><dt>${t.verifier}</dt><dd>${x(pkg.verification.verifier)} (${x(pkg.verification.accreditationNo)})</dd><dt>${t.opinion}</dt><dd>${x(t[pkg.verification.opinion] || pkg.verification.opinion)}</dd><dt>${t.signed}</dt><dd>${x(pkg.verification.signedAt)}</dd><dt>ERI</dt><dd class="mono">${x(pkg.verification.signature)}</dd></dl><p>${x(pkg.verification.conclusion)}</p>` : `<p>${t.none}</p>`}
<h2>${t.batches}</h2><div class="wrap">${rows([t.decl, t.date, t.tif, t.net, t.ee, "EORI", ""], pkg.batches.map(b => [b.declarationNo, b.date, b.tifCode.slice(0, 8), fmt(b.netT, 3), fmt(b.ee, 3), b.eori || "—", b.country || ""]))}</div>
${pkg.seal ? `<h2>${t.sign}</h2><dl class="kv"><dt>${t.hash}</dt><dd class="mono">${pkg.seal.hash}</dd><dt>${t.sign}</dt><dd class="mono">${x(pkg.seal.signature)}</dd>${verifyUrl ? `<dt>${t.verify}</dt><dd class="mono">${x(verifyUrl)}</dd>` : ""}</dl>` : ""}
</body></html>`;
}

function toDocx(pkg, lang = "uz") {
  const t = L[lang] || L.uz;
  return writeDocx([
    { h1: t.title }, { p: `${pkg.installation.name} · ${t.year}: ${pkg.year}` },
    { table: { head: [t.operator, t.stir, t.installation, "UN/LOCODE", t.o3ciInst], rows: [[pkg.operator.name, pkg.operator.stir, pkg.installation.name, pkg.installation.unlocode || "—", pkg.installation.o3ciInstallationId || "—"]] } },
    { h2: t.goods },
    { table: { head: [t.process, t.tif, t.al, t.seeDir, t.seeInd, t.seeCbam, t.basis], rows: pkg.goods.map(g => [g.process, g.cn8 || "—", fmt(g.al, 1), fmt(g.seeDir), fmt(g.seeInd), fmt(g.applied), t[g.basis] || g.basis]) } },
    { h2: t.tax },
    { table: { head: [t.period, t.kind, t.amount, t.fx, t.usd, t.status], rows: pkg.carbonPrice.payments.map(p => [p.period, t[p.kind] || p.kind, fmt(p.amountUzs - p.rebateUzs, 0), fmt(p.fx, 2), fmt(p.amountUsd, 2), p.status]) } },
    { p: `${t.peff}: ${fmt(pkg.carbonPrice.pEffUsd, 4)}` },
    { h2: t.verification },
    { p: pkg.verification ? `${t.verifier}: ${pkg.verification.verifier}; ${t.opinion}: ${t[pkg.verification.opinion] || pkg.verification.opinion}; ${t.signed}: ${pkg.verification.signedAt}` : t.none },
    { h2: t.batches },
    { table: { head: [t.decl, t.date, t.tif, t.net, t.ee], rows: pkg.batches.map(b => [b.declarationNo, b.date, b.tifCode.slice(0, 8), fmt(b.netT, 3), fmt(b.ee, 3)]) } },
    ...(pkg.seal ? [{ h2: t.sign }, { small: `${t.hash}: ${pkg.seal.hash}` }, { small: pkg.seal.signature }] : []),
  ]);
}

/** EI importyori uchun ma'lumot shabloni (Communication template tuzilmasiga moslashtirilgan soddalashtirilgan versiya, ingliz tilida). */
function toCommunicationXlsx(pkg) {
  return writeXlsx([
    { name: "A_InstData", widths: [36, 60], rows: [["Field", "Value"], ["Reporting period", String(pkg.year)], ["Operator name", pkg.operator.name], ["Operator tax ID", pkg.operator.stir],
      ["O3CI operator ID", pkg.operator.o3ciOperatorId || ""], ["Installation name", pkg.installation.name], ["Address", [pkg.installation.address, pkg.installation.region].filter(Boolean).join(", ")],
      ["UN/LOCODE", pkg.installation.unlocode || ""], ["Coordinates", pkg.installation.lat != null ? `${pkg.installation.lat}, ${pkg.installation.lon}` : ""], ["O3CI installation ID", pkg.installation.o3ciInstallationId || ""],
      ["Verification", pkg.verification ? `${pkg.verification.opinion} — ${pkg.verification.verifier}, ${pkg.verification.signedAt}` : "not verified"],
      ["Document hash (SHA-256)", pkg.seal?.hash || ""]] },
    { name: "B_EmInst_Goods", widths: [30, 14, 12, 14, 14, 14, 14, 18, 14], rows: [["Production process", "CN code", "Category", "Production (t)", "SEE direct", "SEE indirect", "SEE applied", "Basis", "Default SEE"],
      ...pkg.goods.map(g => [g.process, g.cn8 || "", g.goodsGroup, g.al, g.seeDir, g.seeInd, g.applied, g.basis, g.defaultSee])] },
    { name: "C_CarbonPrice", widths: [16, 12, 16, 12, 14, 12], rows: [["Period", "Type", "Amount (UZS)", "FX", "Amount (USD)", "Status"],
      ...pkg.carbonPrice.payments.map(p => [p.period, p.kind === "up" ? "upstream fuel tax" : "downstream process tax", p.amountUzs - p.rebateUzs, p.fx, p.amountUsd, p.status]),
      [], ["Effective carbon price (USD/tCO2e)", pkg.carbonPrice.pEffUsd], ...pkg.goods.map(g => [`Carbon price per t good — ${g.process}`, g.carbonPrice?.cpUsdPerT ?? ""])] },
    { name: "D_Consignments", widths: [18, 12, 12, 12, 14, 18, 8], rows: [["Declaration", "Date", "CN code", "Net mass (t)", "Embedded emissions (tCO2e)", "Importer EORI", "Country"],
      ...pkg.batches.map(b => [b.declarationNo, b.date, b.tifCode.slice(0, 8), b.netT, b.ee, b.eori || "", b.country || ""])] },
  ]);
}

/** Inshootning yillik emissiya hisoboti (M7.7) — XLSX. */
function annualXlsx(pkg) {
  return writeXlsx([
    { name: "Jamlanma", widths: [34, 16, 14, 14, 14, 14, 14, 14], rows: [["Jarayon", "TIF TN", "Mahsulot, t", "To'g'ridan-to'g'ri, t", "Bilvosita, t", "Prekursorlar, t", "SEE CBAM", "Asos"],
      ...pkg.goods.map(g => [g.process, g.tifCode || "", g.al, g.emissions.direct, g.emissions.indirect, g.emissions.precursors, g.applied, g.basis])] },
    { name: "Usullar", widths: [10, 40, 60], rows: [["Formula", "Tavsif", "Ifoda"], ...pkg.goods.flatMap(g => g.methods.map(m => [m.id, `${g.process}: ${m.label}`, m.formula]))] },
    { name: "Ma'lumotnoma", widths: [34, 10, 12], rows: [["Kalit", "Versiya", "ID"], ...[...new Map(pkg.goods.flatMap(g => g.refs).map(r => [r.key, r])).values()].map(r => [r.key, r.version, r.id])] },
  ]);
}

module.exports = { build, seal, toXml, toHtml, toDocx, toCommunicationXlsx, annualXlsx, LABELS: L };
