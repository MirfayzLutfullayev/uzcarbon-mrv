/* Profil: bildirishnomalar va MRV muddatlari, parolni almashtirish, 2FA sozlash. */
import { get, post } from "../api.js";
import { $, $$, esc, toast, errToast, formData, dt } from "../ui.js";
import { route, S } from "../app.js";

export default async function (el) {
  const n = await get("/api/notifications");
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Profil</h1><p class="sub">${esc(S.user.name)} · ${esc(S.user.roleName)} · login <span class="mono">${esc(S.user.login)}</span></p></div></div>
    <div class="grid2">
      <section class="panel"><h2>Bildirishnomalar</h2>${n.items.length ? `<div class="list">${n.items.map(x => `<div class="sev ${x.readAt ? "lo" : "mid"}"><b>${esc(x.text)}</b><span>${dt(x.createdAt)}${x.link ? ` · <a href="${esc(x.link)}">ochish</a>` : ""}${x.readAt ? "" : ` · <button class="btn ghost small" data-read="${x.id}">o'qildi</button>`}</span></div>`).join("")}</div>` : `<p class="note">Bildirishnoma yo'q.</p>`}</section>
      <section class="panel"><h2>MRV muddatlari</h2><div class="list">${n.deadlines.map(d => `<div class="sev ${d.daysLeft < 30 ? "hi" : "lo"}"><b>${esc(d.title)}</b><span>${esc(d.date)} · ${d.daysLeft} kun</span></div>`).join("")}</div></section>
    </div>
    <div class="grid2">
      <section class="panel"><h2>Parolni almashtirish</h2><form id="pwForm" novalidate><label>Joriy parol<input name="current" type="password" required autocomplete="current-password"></label>
        <label>Yangi parol <em>≥ 10 belgi, harf va raqam</em><input name="next" type="password" required autocomplete="new-password"></label><div class="row"><button class="btn" type="submit">Saqlash</button></div></form></section>
      <section class="panel"><h2>Ikki bosqichli autentifikatsiya</h2><p class="note">Holat: ${S.user.totpEnabled ? "yoqilgan" : "o'chiq"}${S.user.mfaRequired ? " (rolingiz uchun majburiy)" : ""}.</p>
        <button class="btn ghost" id="mfaNew">${S.user.totpEnabled ? "Yangi kalit bilan qayta sozlash" : "2FA ni yoqish"}</button><div id="mfaOut"></div></section>
    </div>
  </div>`;
  $$("[data-read]").forEach(b => b.onclick = async () => { await post(`/api/notifications/${b.dataset.read}/read`).catch(() => {}); S.notifications = Math.max(0, S.notifications - 1); route(); });
  $("#pwForm").onsubmit = async e => { e.preventDefault(); try { await post("/api/auth/password", formData(e.target)); toast("Parol almashtirildi"); e.target.reset(); } catch (x) { errToast(x); } };
  $("#mfaNew").onclick = async () => {
    try {
      const r = await post("/api/auth/mfa/setup");
      $("#mfaOut").innerHTML = `<p class="note">Kalitni autentifikator ilovasiga kiriting va kodni yozing:</p><div class="secret" data-raw>${esc(r.secret.replace(/(.{4})/g, "$1 ").trim())}</div>
        <form id="mfaEn" class="row" novalidate style="margin-top:8px"><input name="code" inputmode="numeric" maxlength="6" placeholder="6 xonali kod" style="width:160px"><button class="btn" type="submit">Yoqish</button></form>`;
      $("#mfaEn").onsubmit = async e => { e.preventDefault(); try { await post("/api/auth/mfa/enable", formData(e.target)); S.user.totpEnabled = true; toast("2FA yoqildi"); route(); } catch (x) { errToast(x); } };
    } catch (x) { errToast(x); }
  };
}
