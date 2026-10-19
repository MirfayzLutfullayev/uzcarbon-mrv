/* Integratsiyalar (TZ-2 9-bo'lim): holati, Markaziy bank kurslari (I8), EU ETS narxi (I9), almashinuv jurnali. */
import { get, post } from "../api.js";
import { $, esc, table, toast, errToast, formData, dt } from "../ui.js";
import { route } from "../app.js";

const SYSTEMS = [
  ["I1", "EI CBAM Reestri / O3CI", "chiqish", "XML eksport tayyor; rasmiy XSD va ulanish — kirish berilgach"],
  ["I2", "Soliq qo'mitasi (STIR, e-faktura, to'lov holati)", "ikki tomonlama", "mock: STIR qidiruv; to'lovni Soliq roli tasdiqlaydi"],
  ["I3", "Bojxona (eksport deklaratsiyalari)", "kirish", "Bojxona roli orqali qo'lda/CSV; API — kirish berilgach"],
  ["I4", "Moliya vazirligi g'aznachiligi (GFMIS)", "kirish", "rejalashtirilgan"],
  ["I5", "Milliy uglerod birliklari reestri", "ikki tomonlama", "mock: ITMO uzatish jurnali"],
  ["I6", "Energetika vazirligi (tarmoq EF, balans)", "kirish", "Energetika roli ma'lumotnomaga taklif kiritadi"],
  ["I7", "Ekologiya vazirligi (IG inventarizatsiyasi)", "chiqish", "rejalashtirilgan"],
  ["I8", "Markaziy bank kurslari", "kirish", "ochiq API (cbu.uz) — tugma bilan yangilash"],
  ["I9", "EU ETS narxi", "kirish", "qo'lda (litsenziyalangan manba ulanguncha)"],
  ["I10", "OneID / ERI (E-IMZO)", "kirish", "rejalashtirilgan; hozir lokal login + TOTP, mock-ERI imzo"],
  ["I11", "Statistika agentligi", "kirish", "rejalashtirilgan"],
  ["I12", "Korxona ERP, IoT/CEMS", "kirish", "REST API va CSV; MQTT/OPC UA — rejalashtirilgan"],
  ["I13", "Xorijiy importyorlar", "chiqish", "xavfsiz havola va importyor kabineti"],
];

export default async function (el) {
  const log = await get("/api/integrations/log").catch(() => []);
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Integratsiyalar</h1><p class="sub">Har bir tashqi tizim uchun adapter; haqiqiy kirish olinguncha mock rejim. Barcha almashinuvlar jurnalga yoziladi.</p></div></div>
    <section class="panel">${table([{ h: "Kod", k: 0 }, { h: "Tizim", k: 1 }, { h: "Yo'nalish", k: 2 }, { h: "Holat", k: 3 }], SYSTEMS)}</section>
    <div class="grid2">
      <section class="panel"><h2>Markaziy bank kurslari (I8)</h2><p class="note">USD va EUR kursi ma'lumotnomaga tizim nomidan yoziladi (amal qilish sanasi — kurs sanasi).</p><button class="btn" id="cbuBtn">Hozir yangilash</button></section>
      <section class="panel"><h2>EU ETS narxi (I9)</h2><form id="etsForm" novalidate><div class="fields"><label>Narx, €/t CO₂e<input name="priceEur" type="number" step="any" min="1" required></label><label>Sana<input name="date" type="date" required></label><label>Manba<input name="source" required placeholder="masalan EEX haftalik o'rtacha"></label></div>
        <div class="row"><button class="btn" type="submit">Saqlash</button></div></form></section>
    </div>
    <section class="panel"><h2>Almashinuv jurnali</h2>${table([{ h: "Vaqt", v: r => dt(r.at) }, { h: "Tizim", k: "system" }, { h: "Yo'nalish", k: "direction" }, { h: "Tavsif", k: "summary" }, { h: "Holat", v: r => `<span class="pill ${r.status === "ok" ? "ok" : r.status === "mock" ? "mid" : "hi"}">${esc(r.status)}</span>`, html: true }], log)}</section>
  </div>`;
  $("#cbuBtn").onclick = async () => { try { const r = await post("/api/integrations/cbu/sync"); toast(`Kurslar: ${Object.entries(r).map(([k, v]) => `${k} ${v.rate}`).join(", ")}`); route(); } catch (x) { errToast(x); } };
  $("#etsForm").onsubmit = async e => { e.preventDefault(); try { await post("/api/integrations/ets", formData(e.target)); toast("ETS narxi saqlandi"); route(); } catch (x) { errToast(x); } };
}
