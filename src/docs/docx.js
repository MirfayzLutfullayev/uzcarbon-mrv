/* Minimal DOCX yozuvchi (FT-7.5): sarlavhalar, paragraflar, jadvallar. */
"use strict";
const { zip } = require("./zip");

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
const run = (t, { b = false, sz } = {}) => `<w:r><w:rPr>${b ? "<w:b/>" : ""}${sz ? `<w:sz w:val="${sz}"/>` : ""}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (t, o = {}) => `<w:p>${o.style ? `<w:pPr><w:pStyle w:val="${o.style}"/></w:pPr>` : ""}${run(t, o)}</w:p>`;

/**
 * @param {Array<{h1?:string, h2?:string, p?:string, small?:string, table?:{head:string[], rows:any[][]}}>} blocks
 */
function writeDocx(blocks) {
  const body = blocks.map(b => {
    if (b.h1) return para(b.h1, { style: "Heading1", b: true, sz: 32 });
    if (b.h2) return para(b.h2, { style: "Heading2", b: true, sz: 26 });
    if (b.p != null) return para(b.p);
    if (b.small != null) return para(b.small, { sz: 16 });
    if (b.table) {
      const cell = (t, bold) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>${run(t, { b: bold, sz: 18 })}</w:p></w:tc>`;
      return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(x => `<w:${x} w:val="single" w:sz="4" w:color="999999"/>`).join("")}</w:tblBorders></w:tblPr>` +
        `<w:tr>${b.table.head.map(h => cell(h, true)).join("")}</w:tr>` + b.table.rows.map(r => `<w:tr>${r.map(c => cell(c, false)).join("")}</w:tr>`).join("") + `</w:tbl>${para("")}`;
    }
    return "";
  }).join("");
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zip([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/document.xml", data: doc },
  ]);
}

module.exports = { writeDocx };
