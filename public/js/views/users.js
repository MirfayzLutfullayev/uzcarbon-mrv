/* Foydalanuvchilar va rollar (M1.9, M10.4). Tizim administratori — barcha; korxona administratori — faqat o'z korxonasi. */
import { get, post, patch } from "../api.js";
import { $, $$, esc, table, toast, errToast, formData, opt, confirmInline } from "../ui.js";
import { route } from "../app.js";

export default async function (el, _p, S) {
  const all = S.can("users.manage_all");
  const [users, roles, ops, vers, imps] = await Promise.all([get("/api/users"), get("/api/roles"), all ? get("/api/operators").catch(() => []) : Promise.resolve([]), get("/api/verifiers"), all ? get("/api/importers").catch(() => []) : Promise.resolve([])]);
  const roleOpts = roles.filter(r => all || ["exporter_admin", "exporter_specialist"].includes(r.key));
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Foydalanuvchilar</h1><p class="sub">Rollarga asoslangan kirish va eng kam huquq tamoyili. 2FA majburiy rollar: administratorlar, verifikator, IMV.</p></div></div>
    <section class="panel">${table([{ h: "Login", v: u => `<span class="mono">${esc(u.login)}</span>`, html: true }, { h: "Ism", k: "name" }, { h: "Rol", k: "roleName" },
      { h: "2FA", v: u => `<span class="pill ${u.totpEnabled ? "ok" : u.mfaRequired ? "hi" : "lo"}">${u.totpEnabled ? "yoqilgan" : u.mfaRequired ? "sozlanmagan" : "ixtiyoriy"}</span>`, html: true },
      { h: "Holat", v: u => `<span class="pill ${u.disabled ? "hi" : "ok"}">${u.disabled ? "bloklangan" : "faol"}</span>`, html: true },
      { h: "", v: u => u.id === S.user.id ? "" : `<button class="btn ghost small" data-block="${u.id}" data-d="${u.disabled ? 0 : 1}">${u.disabled ? "Faollashtirish" : "Bloklash"}</button> ${u.totpEnabled ? `<button class="btn ghost small" data-mfa="${u.id}">2FA ni tiklash</button>` : ""}`, html: true }], users)}</section>
    <section class="panel"><h2>Yangi foydalanuvchi</h2><form id="uForm" novalidate><div class="fields">
      <label>Login<input name="login" required autocomplete="off"></label><label>Ism<input name="name" required></label>
      <label>Rol<select name="role" id="roleSel">${roleOpts.map(r => opt(r.key, r.name)).join("")}</select></label>
      ${all ? `<label>Korxona <em>eksportyor rollari</em><select name="operatorId"><option value="">—</option>${ops.map(o => opt(o.id, o.name)).join("")}</select></label>
      <label>Verifikator tashkiloti<select name="verifierId"><option value="">—</option>${vers.map(v => opt(v.id, v.name)).join("")}</select></label>
      <label>Importyor<select name="importerId"><option value="">—</option>${imps.map(i => opt(i.id, i.name)).join("")}</select></label>` : ""}
      <label>Boshlang'ich parol <em>≥ 10 belgi, harf va raqam</em><input name="password" type="password" required autocomplete="new-password"></label>
    </div><div class="row"><button class="btn" type="submit">Yaratish</button></div></form></section>
    <section class="panel"><h2>Rollar va huquqlar</h2>${table([{ h: "Rol", k: "name" }, { h: "Doira", k: "scope" }, { h: "2FA", v: r => (r.mfa ? "majburiy" : "ixtiyoriy") }, { h: "Huquqlar", v: r => `<span class="note mono">${esc(r.perms.join(", "))}</span>`, html: true }], roles)}</section>
  </div>`;
  $("#uForm").onsubmit = async e => { e.preventDefault(); try { await post("/api/users", formData(e.target)); toast("Foydalanuvchi yaratildi"); route(); } catch (x) { errToast(x); } };
  $$("[data-block]").forEach(b => b.onclick = () => confirmInline(b, b.dataset.d === "1" ? "Bloklansinmi?" : "Faollashtirilsinmi?", async () => { try { await patch(`/api/users/${b.dataset.block}`, { disabled: b.dataset.d === "1" }); toast("Saqlandi"); route(); } catch (x) { errToast(x); } }));
  $$("[data-mfa]").forEach(b => b.onclick = () => confirmInline(b, "2FA tiklansinmi?", async () => { try { await patch(`/api/users/${b.dataset.mfa}`, { resetMfa: true }); toast("2FA tiklandi — keyingi kirishda qayta sozlanadi"); route(); } catch (x) { errToast(x); } }));
}
