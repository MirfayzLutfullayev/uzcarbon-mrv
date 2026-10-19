/* Ochiq agregatsiyalangan panel (M9.3): kirishsiz, shaxsiy va tijorat ma'lumotlarisiz. */
import { get } from "../api.js";
import { esc, fmt, pct, table } from "../ui.js";

export default async function (el, _p, S, standalone = false) {
  const y = S?.year || new Date().getFullYear();
  const d = await get(`/api/public/summary?year=${y}`);
  const hid = v => (v == null ? `<span class="note">yashirin</span>` : null);
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Ochiq panel · ${y}</h1><p class="sub">CBAM tovarlari eksporti va emissiyalari tarmoqlar kesimida. ${d.minGroup} tadan kam korxonali guruhlar tijorat sirini himoya qilish uchun ko'rsatilmaydi.</p></div>
      ${standalone ? `<a class="btn ghost" href="/">Tizimga kirish</a>` : ""}</div>
    <section class="panel">${table([{ h: "Tarmoq", k: "name" }, { h: "Korxonalar", v: r => esc(r.operators) }, { h: "Emissiya, t CO₂e", v: r => hid(r.emissions) ?? fmt(r.emissions), html: true },
      { h: "EI ga eksport, t", v: r => hid(r.exported) ?? fmt(r.exported), html: true }, { h: "Verifikatsiyalangan ulush", v: r => hid(r.verifiedShare) ?? pct(r.verifiedShare), html: true }], d.bySector, { empty: "Ma'lumot yo'q." })}</section>
  </div>`;
}
