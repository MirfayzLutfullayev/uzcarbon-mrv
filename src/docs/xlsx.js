/*
 * XLSX yozish (hisobotlar, CBAM kommunikatsiya shabloni) va o'qish (TIF TN kodlari jadvalini import qilish).
 * Office Open XML ning minimal qismi: inline satrlar, bitta qalin shrift uslubi.
 */
"use strict";
const { zip, unzip } = require("./zip");

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
const colName = i => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

function sheetXml(rows, { boldRows = [0], widths = [] } = {}) {
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = colName(ci) + (ri + 1), s = boldRows.includes(ri) ? ' s="1"' : "";
    if (v == null || v === "") return "";
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`;
}

/** @param {Array<{name:string, rows:any[][], boldRows?:number[], widths?:number[]}>} sheets */
function writeXlsx(sheets) {
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31).replace(/[\\/?*[\]:]/g, " "))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>` },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows, s) })),
  ];
  return zip(files);
}

const unesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
const colIndex = ref => { const m = ref.match(/^([A-Z]+)/); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

/** Birinchi (yoki nomi berilgan) varaqni qatorlar massivi sifatida o'qish. */
function readXlsx(buf, sheetName) {
  const files = unzip(buf);
  const text = n => (files.get(n) || Buffer.alloc(0)).toString("utf8");
  const shared = [];
  for (const si of text("xl/sharedStrings.xml").match(/<si>[\s\S]*?<\/si>/g) || []) {
    shared.push(unesc((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map(t => t.replace(/<t[^>]*>|<\/t>/g, "")).join("")));
  }
  let sheetFile = "xl/worksheets/sheet1.xml";
  if (sheetName) {
    const wb = text("xl/workbook.xml"), rels = text("xl/_rels/workbook.xml.rels");
    const m = wb.match(new RegExp(`<sheet[^>]*name="${sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*r:id="([^"]+)"`));
    if (m) { const t = rels.match(new RegExp(`Id="${m[1]}"[^>]*Target="([^"]+)"`)); if (t) sheetFile = "xl/" + t[1].replace(/^\/?xl\//, ""); }
  }
  const xml = text(sheetFile);
  if (!xml) throw new Error("Varaq topilmadi.");
  const rows = [];
  for (const rm of xml.match(/<row[^>]*>[\s\S]*?<\/row>|<row[^>]*\/>/g) || []) {
    const r = [];
    for (const cm of rm.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = (cm.match(/ r="([A-Z]+\d+)"/) || [])[1];
      const t = (cm.match(/ t="(\w+)"/) || [])[1];
      let v = null;
      if (t === "inlineStr") v = unesc((cm.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "");
      else {
        const raw = (cm.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (raw != null) v = t === "s" ? shared[+raw] : t === "str" || t === "b" ? unesc(raw) : Number(raw);
      }
      r[ref ? colIndex(ref) : r.length] = v;
    }
    rows.push(Array.from(r, x => (x === undefined ? null : x)));
  }
  return rows;
}

module.exports = { writeXlsx, readXlsx };
