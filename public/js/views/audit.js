/* Audit jurnali (X4, FT-6.5): kim, qachon, nima, oldingi va yangi qiymat; xesh zanjiri butunligini tekshirish. */
import { get } from "../api.js";
import { $, esc, table, errToast, dt } from "../ui.js";

export default async function (el, _p, S) {
  const rows = await get("/api/audit?limit=300");
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Audit jurnali</h1><p class="sub">O'zgartirib bo'lmaydigan iz: har bir yozuv oldingisining xeshiga bog'langan; jadvalda o'zgartirish va o'chirish bazaning o'zida taqiqlangan.</p></div>
      ${S.can("audit.read") ? `<button class="btn ghost" id="vBtn">Zanjirni tekshirish</button>` : ""}</div>
    <div id="vOut"></div>
    <section class="panel">${table([{ h: "Vaqt", v: r => dt(r.at) }, { h: "Kim", v: r => `${esc(r.actorLogin || "—")}<br><span class="note">${esc(r.role || "")}</span>`, html: true },
      { h: "Amal", v: r => `<span class="mono">${esc(r.action)}</span>`, html: true }, { h: "Obyekt", v: r => `${esc(r.entity || "")} <span class="note mono">${esc((r.entityId || "").slice(0, 24))}</span>`, html: true },
      { h: "O'zgarish", v: r => `<details><summary class="note">ko'rish</summary><div class="formula">${esc(r.before ? "oldin: " + JSON.stringify(r.before) + "\n" : "")}${esc(r.after ? "keyin: " + JSON.stringify(r.after) : "")}</div></details>`, html: true },
      { h: "Xesh", v: r => `<span class="mono note">${esc(r.hash.slice(0, 12))}…</span>`, html: true }], rows)}</section>
  </div>`;
  const b = $("#vBtn");
  if (b) b.onclick = async () => {
    try { const r = await get("/api/audit/verify"); $("#vOut").innerHTML = r.ok ? `<div class="banner info">Zanjir butun: ${r.count} ta yozuv, oxirgi xesh <span class="mono">${esc(r.head.slice(0, 16))}…</span></div>` : `<div class="banner crit">Zanjir buzilgan: ${r.brokenAt}-yozuvda.</div>`; } catch (x) { errToast(x); }
  };
}
