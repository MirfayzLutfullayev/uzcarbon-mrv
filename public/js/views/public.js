/* Ochiq agregatsiyalangan panel (M9.3): kirishsiz, shaxsiy va tijorat ma'lumotlarisiz. */
import { get } from "../api.js";
import { esc, fmt, pct, table } from "../ui.js";

export default async function (el, _p, S, standalone = false) {
  const y = S?.year || new Date().getFullYear();
  const d = await get(`/api/public/summary?year=${y}`);
  const hid = v => (v == null ? `<span class="muted">yashirin</span>` : null);
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Ochiq panel</h1><p class="sub">${y}-yilda Yevropa Ittifoqiga eksport qilingan CBAM tovarlari va ular bilan bog'liq emissiyalar, tarmoqlar kesimida.</p></div>
      ${standalone ? `<a class="btn ghost" href="/">Tizimga kirish</a>` : ""}</div>
    <section class="panel"><h2>Tarmoqlar kesimida</h2>
      <p class="section-intro">Tarkibida ${d.minGroup} tadan kam korxona bo'lgan guruhlar bo'yicha raqamlar tijorat sirini himoya qilish uchun ko'rsatilmaydi.</p>
      ${table([{ h: "Tarmoq", k: "name" }, { h: "Korxonalar", v: r => esc(r.operators), num: true }, { h: "Emissiya, t CO₂e", v: r => hid(r.emissions) ?? fmt(r.emissions), html: true, num: true },
      { h: "Eksport, t", v: r => hid(r.exported) ?? fmt(r.exported), html: true, num: true }, { h: "Verifikatsiyalangan ulush", v: r => hid(r.verifiedShare) ?? pct(r.verifiedShare), html: true, num: true }], d.bySector,
      { empty: `${y}-yil uchun e'lon qilingan ma'lumot hali yo'q.` })}</section>
  </div>`;
}
