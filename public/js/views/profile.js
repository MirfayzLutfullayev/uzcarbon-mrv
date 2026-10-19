/* Shaxsiy kabinet: bildirishnomalar, hisobot muddatlari, parol va ikki bosqichli autentifikatsiya. */
import { get, post } from "../api.js";
import { $, $$, esc, toast, errToast, formData, dt } from "../ui.js";
import { route, S } from "../app.js";

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];

export default async function (el) {
  const n = await get("/api/notifications");
  const unread = n.items.filter(x => !x.readAt).length;
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Shaxsiy kabinet</h1><p class="sub">Bildirishnomalar, yaqinlashayotgan hisobot muddatlari va hisob xavfsizligi sozlamalari.</p></div></div>
    <section class="panel"><h2>Hisob ma'lumotlari</h2>
      <dl class="kv"><dt>Foydalanuvchi</dt><dd>${esc(S.user.name)}</dd><dt>Login</dt><dd class="mono">${esc(S.user.login)}</dd>
        <dt>Rol</dt><dd>${esc(S.user.roleName)}</dd>
        <dt>Ikki bosqichli tasdiq</dt><dd>${S.user.totpEnabled ? `<span class="pill ok">yoqilgan</span>` : `<span class="pill ${S.user.mfaRequired ? "hi" : "lo"}">o'chiq</span>`}</dd></dl></section>
    <div class="grid2">
      <section class="panel"><h2>Bildirishnomalar <span class="pill ${unread ? "mid" : "ok"}">${unread} ta o'qilmagan</span></h2>
        ${n.items.length ? `<div class="list">${n.items.map(x => `<div class="sev ${x.readAt ? "lo" : "mid"}">
          <b>${esc(x.text)}</b>
          <span>${dt(x.createdAt)}</span>
          ${x.link || !x.readAt ? `<span class="row" style="margin-top:4px">${x.link ? `<a class="btn ghost small" href="${esc(x.link)}">Ochish</a>` : ""}${x.readAt ? "" : `<button class="btn ghost small" data-read="${x.id}">O'qildi deb belgilash</button>`}</span>` : ""}
        </div>`).join("")}</div>` : `<p class="note">Bildirishnoma yo'q.</p>`}</section>
      <section class="panel"><h2>Hisobot muddatlari</h2>
        <div class="stack">${n.deadlines.map(d => {
          const [, m, day] = d.date.split("-");
          return `<div class="deadline${d.daysLeft < 30 ? " soon" : ""}"><time datetime="${esc(d.date)}">${day}<small>${MONTHS[+m - 1]}</small></time><b>${esc(d.title)}</b><span>${esc(d.date)}, ${d.daysLeft} kun qoldi</span></div>`;
        }).join("")}</div></section>
    </div>
    <div class="grid2">
      <section class="panel"><h2>Parolni almashtirish</h2>
        <form id="pwForm" novalidate>
          <label>Joriy parol<input name="current" type="password" required autocomplete="current-password"></label>
          <label>Yangi parol <em>kamida 10 belgi, harf va raqam bilan</em><input name="next" type="password" required autocomplete="new-password"></label>
          <p class="note">Parol almashtirilgach, boshqa qurilmalardagi sessiyalar yopiladi.</p>
          <div class="row"><button class="btn" type="submit">Parolni saqlash</button></div></form></section>
      <section class="panel"><h2>Ikki bosqichli autentifikatsiya</h2>
        <p class="section-intro">${S.user.totpEnabled
          ? "Kirishda autentifikator ilovasidagi bir martalik kod so'raladi."
          : S.user.mfaRequired ? "Rolingiz uchun ikki bosqichli tasdiq majburiy. Keyingi kirishda sozlash so'raladi." : "Qo'shimcha himoya uchun autentifikator ilovasini ulashingiz mumkin."}</p>
        <div class="row"><button class="btn ghost" id="mfaNew">${S.user.totpEnabled ? "Yangi kalit bilan qayta sozlash" : "Autentifikator ilovasini ulash"}</button></div>
        <div id="mfaOut"></div></section>
    </div>
  </div>`;
  $$("[data-read]").forEach(b => b.onclick = async () => { await post(`/api/notifications/${b.dataset.read}/read`).catch(() => {}); S.notifications = Math.max(0, S.notifications - 1); route(); });
  $("#pwForm").onsubmit = async e => { e.preventDefault(); try { await post("/api/auth/password", formData(e.target)); toast("Parol almashtirildi"); e.target.reset(); } catch (x) { errToast(x); } };
  $("#mfaNew").onclick = async () => {
    try {
      const r = await post("/api/auth/mfa/setup");
      $("#mfaOut").innerHTML = `<p class="note" style="margin-top:14px">Quyidagi kalitni autentifikator ilovasiga qo'lda kiriting, so'ng ilova ko'rsatgan kodni yozing.</p>
        <div class="secret" data-raw>${esc(r.secret.replace(/(.{4})/g, "$1 ").trim())}</div>
        <form id="mfaEn" class="row" novalidate style="margin-top:12px">
          <label><span class="sr-label">Tasdiq kodi</span><input name="code" inputmode="numeric" maxlength="6" placeholder="6 xonali kod" style="width:170px" aria-label="Tasdiq kodi"></label>
          <button class="btn" type="submit">Yoqish</button></form>`;
      $("#mfaEn").onsubmit = async e => { e.preventDefault(); try { await post("/api/auth/mfa/enable", formData(e.target)); S.user.totpEnabled = true; toast("Ikki bosqichli tasdiq yoqildi"); route(); } catch (x) { errToast(x); } };
    } catch (x) { errToast(x); }
  };
}
