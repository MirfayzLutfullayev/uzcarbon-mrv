/* UZ-Carbon MRV — ilova qobig'i: sessiya, 2FA, menyu (rollarga qarab), hash-marshrutlash. */
import { get, post, setUnauthorizedHandler } from "./api.js";
import { $, esc, toast, errToast, opt } from "./ui.js";
import { t, getLang, setLang, applyScript } from "./i18n.js";

const NAV = [
  { group: "Asosiy" },
  { k: "dashboard", n: "Monitoring paneli", perm: ["dashboard.exporter", "dashboard.gov"] },
  { k: "registry", n: "Reyestr", perm: ["registry.read"] },
  { k: "data", n: "Ma'lumot kiritish", perm: ["data.read"] },
  { k: "calc", n: "Hisob-kitob", perm: ["calc.read"] },
  { k: "batches", n: "Eksport partiyalari", perm: ["batches.read"] },
  { k: "cbam", n: "CBAM kalkulyatori", perm: ["cbam.read"] },
  { k: "tax", n: "Uglerod soliqi", perm: ["tax.read"] },
  { group: "Hisobot" },
  { k: "verification", n: "Verifikatsiya", perm: ["verification.read"] },
  { k: "docs", n: "Hujjatlar paketi", perm: ["docs.read"] },
  { k: "ai", n: "SI tahlil", perm: ["ai.use", "dashboard.gov", "calc.read", "tax.read"] },
  { k: "itmo", n: "ITMO loyihalari", perm: ["itmo.read"] },
  { group: "Boshqaruv" },
  { k: "refdata", n: "Ma'lumotnomalar", perm: ["refdata.read"] },
  { k: "audit", n: "Audit jurnali", perm: ["audit.read", "audit.read_own"] },
  { k: "users", n: "Foydalanuvchilar", perm: ["users.manage_all", "users.manage_own"] },
  { k: "integrations", n: "Integratsiyalar", perm: ["integrations.run"] },
  { k: "profile", n: "Profil", perm: null },
];

export const S = {
  user: null, meta: null, notifications: 0,
  year: (() => { try { return +localStorage.getItem("uzc.year") || new Date().getFullYear(); } catch { return new Date().getFullYear(); } })(),
  proc: (() => { try { return localStorage.getItem("uzc.proc") || ""; } catch { return ""; } })(),
  can: p => !!S.user && (Array.isArray(p) ? p.some(x => S.user.perms.includes(x)) : S.user.perms.includes(p)),
  setProc(id) { S.proc = id; try { localStorage.setItem("uzc.proc", id); } catch { /* e'tiborsiz */ } },
  _insts: null,
  async insts(force = false) { if (!S._insts || force) S._insts = await get("/api/installations").catch(() => []); return S._insts; },
};

/** Jarayon tanlash (inshoot — jarayon). Tanlov saqlanadi. */
export async function processPicker(id = "procSel") {
  const insts = await S.insts();
  const procs = insts.flatMap(i => i.processes.map(p => ({ ...p, inst: i.name, instId: i.id })));
  if (!procs.length) return { html: `<span class="note">Jarayon yo'q</span>`, procs, current: null };
  if (!procs.some(p => p.id === S.proc)) S.setProc(procs[0].id);
  const current = procs.find(p => p.id === S.proc);
  return { html: `<label class="inline">Jarayon <select id="${id}" style="width:auto;max-width:420px">${procs.map(p => opt(p.id, `${p.inst} — ${p.name}`, S.proc)).join("")}</select></label>`, procs, current };
}
export function bindPicker(id = "procSel") { const el = document.getElementById(id); if (el) el.onchange = () => { S.setProc(el.value); route(); }; }

const VIEWS = {
  dashboard: () => import("./views/dashboard.js"), registry: () => import("./views/registry.js"), data: () => import("./views/data.js"),
  calc: () => import("./views/calc.js"), batches: () => import("./views/batches.js"), cbam: () => import("./views/cbam.js"), tax: () => import("./views/tax.js"),
  verification: () => import("./views/verification.js"), docs: () => import("./views/docs.js"), ai: () => import("./views/ai.js"), itmo: () => import("./views/itmo.js"),
  refdata: () => import("./views/refdata.js"), audit: () => import("./views/audit.js"), users: () => import("./views/users.js"),
  integrations: () => import("./views/integrations.js"), profile: () => import("./views/profile.js"), public: () => import("./views/public.js"),
};

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { view: parts[0] || "dashboard", params: parts.slice(1) };
}

function shell() {
  const items = NAV.filter(n => n.group || n.perm === null || S.can(n.perm));
  // Bo'sh guruh sarlavhalarini olib tashlash
  const nav = items.filter((n, i) => !n.group || (items[i + 1] && !items[i + 1].group));
  const years = [2024, 2025, 2026, 2027, 2028];
  $("#root").innerHTML = `<div class="app">
    <aside class="rail" aria-label="Modullar">
      <div class="brand"><b>UZ-<span>Carbon</span></b><small>MRV · CBAM platformasi</small></div>
      <nav id="nav">${nav.map(n => n.group ? `<div class="navgroup">${esc(t(n.group))}</div>` : `<a href="#/${n.k}" data-k="${n.k}">${esc(t(n.n))}${n.k === "profile" && S.notifications ? `<span class="badge" title="O'qilmagan bildirishnomalar">${S.notifications}</span>` : ""}</a>`).join("")}</nav>
      <div class="railfoot">
        <label class="inline">${esc(t("Yil"))} <select id="yearSel">${years.map(y => opt(y, y, S.year)).join("")}</select></label>
        <label class="inline">Til <select id="langSel">${[["uz", "O'zbek"], ["uz-Cyrl", "Ўзбек"], ["ru", "Русский"], ["en", "English"]].map(([k, v]) => opt(k, v, getLang())).join("")}</select></label>
        <div class="who"><b>${esc(S.user.name)}</b><span>${esc(S.user.roleName)}</span></div>
        <button class="btn ghost small" id="logoutBtn" type="button">${esc(t("Chiqish"))}</button>
        <span class="muted">Uslubiyot: CBAM 2023/956, IPCC 2006, TZ-2</span>
      </div>
    </aside>
    <main id="main" tabindex="-1"></main></div>`;
  $("#yearSel").onchange = e => { S.year = +e.target.value; try { localStorage.setItem("uzc.year", S.year); } catch { /* e'tiborsiz */ } route(); };
  $("#langSel").onchange = e => { setLang(e.target.value); shell(); route(); };
  $("#logoutBtn").onclick = async () => { await post("/api/auth/logout").catch(() => {}); S.user = null; S._insts = null; showLogin(); };
}

let navToken = 0;
export async function route() {
  if (!S.user) return;
  const { view, params } = parseHash();
  const allowed = NAV.find(n => n.k === view);
  const v = VIEWS[view] && (view === "public" || !allowed || allowed.perm === null || S.can(allowed.perm)) ? view : "dashboard";
  for (const a of document.querySelectorAll("#nav a")) { if (a.dataset.k === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }
  const main = $("#main");
  const my = ++navToken;
  main.innerHTML = `<div class="view"><p class="note">Yuklanmoqda…</p></div>`;
  try {
    const mod = await VIEWS[v]();
    if (my !== navToken) return;
    await mod.default(main, params, S);
    applyScript(main); applyScript($("#nav"));
  } catch (e) {
    if (my !== navToken) return;
    main.innerHTML = `<div class="view"><div class="banner crit">Bo'limni ochib bo'lmadi: ${esc(e.message)}</div></div>`;
    if (e.status !== 401) console.error(e);
  }
}

/* ---------- Kirish va 2FA ---------- */
function showLogin(msg = "") {
  $("#root").innerHTML = `<div class="login"><form class="panel" id="loginForm" novalidate>
    <div class="brand"><b>UZ-<span>Carbon</span></b><small>MRV · CBAM platformasi</small></div>
    <h1>Tizimga kirish</h1>
    ${msg ? `<div class="banner">${esc(msg)}</div>` : ""}
    <label>Login<input name="login" autocomplete="username" required autofocus></label>
    <label>Parol<input name="password" type="password" autocomplete="current-password" required></label>
    <div class="row"><button class="btn" type="submit">Kirish</button><span class="note" id="loginMsg" role="alert"></span></div>
    <p class="note">OneID / ERI orqali kirish integratsiya ulangach qo'shiladi. Demo loginlar: <code>npm run seed</code> natijasida chiqariladi.</p>
    <p class="note"><a href="#/public" id="pubLink">Ochiq panel (kirishsiz)</a></p>
  </form></div>`;
  $("#pubLink").onclick = async e => { e.preventDefault(); const m = await import("./views/public.js"); $("#root").innerHTML = `<main id="main" style="padding:24px 16px"></main>`; await m.default($("#main"), [], S, true); };
  $("#loginForm").onsubmit = async e => {
    e.preventDefault();
    const f = e.target, m = $("#loginMsg");
    if (!f.login.value.trim() || !f.password.value) { m.textContent = "Login va parolni kiriting."; return; }
    try {
      const r = await post("/api/auth/login", { login: f.login.value.trim(), password: f.password.value });
      S.user = r.user;
      if (r.mfa === "verify") showMfa();
      else if (r.mfa === "setup") showMfaSetup();
      else start();
    } catch (err) { m.textContent = err.message; }
  };
}
function showMfa() {
  $("#root").innerHTML = `<div class="login"><form class="panel" id="mfaForm" novalidate>
    <h1>Ikki bosqichli tasdiq</h1>
    <p class="note">Autentifikator ilovasidagi 6 xonali kodni kiriting.</p>
    <label>Kod<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}" required autofocus></label>
    <div class="row"><button class="btn" type="submit">Tasdiqlash</button><span class="note" id="mfaMsg" role="alert"></span></div>
  </form></div>`;
  $("#mfaForm").onsubmit = async e => {
    e.preventDefault();
    try { await post("/api/auth/mfa", { code: e.target.code.value.trim() }); start(); } catch (err) { $("#mfaMsg").textContent = err.message; }
  };
}
async function showMfaSetup() {
  let r;
  try { r = await post("/api/auth/mfa/setup"); } catch (e) { return showLogin(e.message); }
  $("#root").innerHTML = `<div class="login"><form class="panel" id="mfaSetup" novalidate>
    <h1>2FA ni sozlash</h1>
    <p class="note">Sizning rolingiz uchun ikki bosqichli autentifikatsiya majburiy. Autentifikator ilovasiga (Google Authenticator, Microsoft Authenticator va h.k.) quyidagi kalitni qo'lda kiriting, so'ng ilova ko'rsatgan kodni yozing.</p>
    <div class="secret" data-raw>${esc(r.secret.replace(/(.{4})/g, "$1 ").trim())}</div>
    <details><summary>otpauth havolasi</summary><p class="mono" style="word-break:break-all">${esc(r.uri)}</p></details>
    <label>Kod<input name="code" inputmode="numeric" maxlength="6" required autofocus></label>
    <div class="row"><button class="btn" type="submit">Yoqish va kirish</button><span class="note" id="setupMsg" role="alert"></span></div>
  </form></div>`;
  $("#mfaSetup").onsubmit = async e => {
    e.preventDefault();
    try { await post("/api/auth/mfa/enable", { code: e.target.code.value.trim() }); start(); } catch (err) { $("#setupMsg").textContent = err.message; }
  };
}

async function start() {
  try {
    const me = await get("/api/auth/me");
    if (!me.user) return showLogin();
    if (me.mfa === "verify") { S.user = me.user; return showMfa(); }
    if (me.mfa === "setup") { S.user = me.user; return showMfaSetup(); }
    S.user = me.user;
    S.meta = await get("/api/meta").catch(() => null);
    const n = await get("/api/notifications").catch(() => ({ items: [] }));
    S.notifications = n.items.filter(x => !x.readAt).length;
    shell();
    if (!location.hash) location.hash = "#/dashboard";
    route();
  } catch (e) { errToast(e); showLogin(); }
}

setUnauthorizedHandler(data => {
  if (!S.user) return;
  if (data && data.mfa) return showMfa();
  S.user = null; S._insts = null;
  showLogin("Sessiya tugadi. Qayta kiring.");
});
window.addEventListener("hashchange", () => route());
start();

export { toast };
