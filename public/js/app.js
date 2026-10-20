/* UZ-Carbon MRV — ilova qobig'i: rasmiy portal sarlavhasi, guruhlangan menyu, sahifa bandi, kirish va 2FA, hash-marshrutlash. */
import { get, post, setUnauthorizedHandler } from "./api.js";
import { $, esc, errToast, opt } from "./ui.js";
import { t, getLang, setLang, applyScript } from "./i18n.js";

/* ---------- Menyu: guruhlar va bo'limlar ---------- */
const GROUPS = [
  { k: "home", n: "Bosh sahifa", items: [{ k: "dashboard", n: "Monitoring paneli", perm: ["dashboard.exporter", "dashboard.gov"], always: true }] },
  { k: "company", n: "Korxona", items: [
    { k: "registry", n: "Reyestr", perm: ["registry.read"] },
    { k: "data", n: "Ma'lumot kiritish", perm: ["data.read"] },
    { k: "batches", n: "Eksport partiyalari", perm: ["batches.read"] }] },
  { k: "finance", n: "Hisob-kitoblar", items: [
    { k: "calc", n: "Emissiya hisobi", perm: ["calc.read"] },
    { k: "cbam", n: "CBAM kalkulyatori", perm: ["cbam.read"] },
    { k: "tax", n: "Uglerod soliqi", perm: ["tax.read"] }] },
  { k: "reports", n: "Hisobotlar", items: [
    { k: "verification", n: "Verifikatsiya", perm: ["verification.read"] },
    { k: "docs", n: "Hujjatlar paketi", perm: ["docs.read"] },
    { k: "itmo", n: "ITMO loyihalari", perm: ["itmo.read"] }] },
  { k: "analytics", n: "Tahlil", items: [{ k: "ai", n: "SI tahlil", perm: ["ai.use", "dashboard.gov", "calc.read", "tax.read"] }] },
  { k: "admin", n: "Boshqaruv", items: [
    { k: "refdata", n: "Ma'lumotnomalar", perm: ["refdata.read"] },
    { k: "audit", n: "Audit jurnali", perm: ["audit.read", "audit.read_own"] },
    { k: "users", n: "Foydalanuvchilar", perm: ["users.manage_all", "users.manage_own"] },
    { k: "integrations", n: "Integratsiyalar", perm: ["integrations.run"] }] },
];
const PROFILE = { k: "profile", n: "Shaxsiy kabinet" };

export const S = {
  user: null, meta: null, notifications: 0,
  year: (() => { try { return +localStorage.getItem("uzc.year") || new Date().getFullYear(); } catch { return new Date().getFullYear(); } })(),
  proc: (() => { try { return localStorage.getItem("uzc.proc") || ""; } catch { return ""; } })(),
  can: p => !!S.user && (Array.isArray(p) ? p.some(x => S.user.perms.includes(x)) : S.user.perms.includes(p)),
  setProc(id) { S.proc = id; try { localStorage.setItem("uzc.proc", id); } catch { /* e'tiborsiz */ } },
  _insts: null,
  async insts(force = false) { if (!S._insts || force) S._insts = await get("/api/installations").catch(() => []); return S._insts; },
};

const allowed = it => it.always || S.can(it.perm);
const visibleGroups = () => GROUPS.map(g => ({ ...g, items: g.items.filter(allowed) })).filter(g => g.items.length);

/** Jarayon tanlash (inshoot — jarayon). Tanlov saqlanadi. */
export async function processPicker(id = "procSel") {
  const insts = await S.insts();
  const procs = insts.flatMap(i => i.processes.map(p => ({ ...p, inst: i.name, instId: i.id })));
  if (!procs.length) return { html: `<span class="note">Jarayon yo'q</span>`, procs, current: null };
  if (!procs.some(p => p.id === S.proc)) S.setProc(procs[0].id);
  const current = procs.find(p => p.id === S.proc);
  return { html: `<label class="inline">Jarayon <select id="${id}" style="width:auto;max-width:440px">${procs.map(p => opt(p.id, `${p.inst}: ${p.name}`, S.proc)).join("")}</select></label>`, procs, current };
}
export function bindPicker(id = "procSel") { const el = document.getElementById(id); if (el) el.onchange = () => { S.setProc(el.value); route(); }; }

const VIEWS = {
  dashboard: () => import("./views/dashboard.js"), registry: () => import("./views/registry.js"), data: () => import("./views/data.js"),
  calc: () => import("./views/calc.js"), batches: () => import("./views/batches.js"), cbam: () => import("./views/cbam.js"), tax: () => import("./views/tax.js"),
  verification: () => import("./views/verification.js"), docs: () => import("./views/docs.js"), ai: () => import("./views/ai.js"), itmo: () => import("./views/itmo.js"),
  refdata: () => import("./views/refdata.js"), audit: () => import("./views/audit.js"), users: () => import("./views/users.js"),
  integrations: () => import("./views/integrations.js"), profile: () => import("./views/profile.js"), public: () => import("./views/public.js"),
};

/* ---------- Ikonkalar (chiziqli, 24×24) ---------- */
const I = {
  bell: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0"/></svg>`,
  out: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
  menu: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  shield: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
};
const MARK = `<svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#0B2A5B"/><path d="M9 29c6-3 10-1 14-3s6-7 11-7 6 3 4 4" fill="none" stroke="#7FB2FF" stroke-width="2.4" stroke-linecap="round"/><path d="M9 35c6-3 10-1 14-3s6-7 11-7 7 2 5 4" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/><path d="M9 23c6-3 9-1 13-3" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/><circle cx="32" cy="14" r="4" fill="#0099B5"/></svg>`;
const FLAG = `<span class="flagline" aria-hidden="true"><i style="background:#0099B5"></i><i style="background:#fff;box-shadow:inset 0 1px 0 #CE1126,inset 0 -1px 0 #CE1126"></i><i style="background:#1EB53A"></i></span>`;
const initials = n => String(n || "?").replace(/[^A-Za-zА-Яа-яЎўҚқҒғҲҳ\s]/g, "").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "U";

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { view: parts[0] || "dashboard", params: parts.slice(1) };
}

/* ---------- Qobiq ---------- */
function shell() {
  const groups = visibleGroups();
  const years = [2024, 2025, 2026, 2027, 2028];
  $("#root").innerHTML = `
  <div class="gov-strip"><div class="container">
    <div class="state">${FLAG}<span>O'zbekiston Respublikasi</span><span class="long">davlat axborot tizimi, pilot versiya</span></div>
    <div class="gov-tools">
      <label>${esc(t("Yil"))} <select id="yearSel" aria-label="Hisobot yili">${years.map(y => opt(y, y, S.year)).join("")}</select></label>
      <label><span class="sr-label">Til</span><select id="langSel" aria-label="Interfeys tili">${[["uz", "O'zbekcha"], ["uz-Cyrl", "Ўзбекча"], ["ru", "Русский"], ["en", "English"]].map(([k, v]) => opt(k, v, getLang())).join("")}</select></label>
    </div>
  </div></div>
  <header class="site-header"><div class="container">
    <a class="brand" href="#/dashboard">${MARK}<span class="brand-text"><b>UZ-Carbon MRV</b><small>Emissiyalar, milliy uglerod narxi va CBAM hisobi</small></span></a>
    <div class="header-actions">
      <a class="icon-btn" href="#/profile" aria-label="Bildirishnomalar${S.notifications ? `: ${S.notifications} ta yangi` : ""}" title="Bildirishnomalar">${I.bell}${S.notifications ? `<span class="dot">${S.notifications > 9 ? "9+" : S.notifications}</span>` : ""}</a>
      <a class="user-chip" href="#/profile" title="Shaxsiy kabinet"><span class="avatar" aria-hidden="true">${esc(initials(S.user.name))}</span><span class="who"><b>${esc(S.user.name)}</b><span>${esc(S.user.roleName)}</span></span></a>
      <button class="icon-btn" id="logoutBtn" type="button" aria-label="${esc(t("Chiqish"))}" title="${esc(t("Chiqish"))}">${I.out}</button>
      <button class="icon-btn menu-toggle" id="menuBtn" type="button" aria-label="Menyu" aria-expanded="false" aria-controls="siteNav">${I.menu}</button>
    </div>
  </div></header>
  <nav class="site-nav" id="siteNav" aria-label="Asosiy bo'limlar"><div class="container">
    ${groups.map(g => `<a href="#/${g.items[0].k}" data-g="${g.k}">${esc(t(g.n))}</a>`).join("")}
  </div></nav>
  <section class="hero" aria-labelledby="pageTitle"><div class="container" id="hero"></div></section>
  <main id="main" tabindex="-1"><div class="container" id="page"></div></main>
  <footer class="site-footer">
    <div class="container">
      <div><h3>UZ-Carbon MRV</h3>
        <p>CBAM tovarlari eksportyorlari uchun issiqxona gazlari emissiyalarini EI usulida hisoblash, milliy uglerod soliqini baholash va eksportyor hujjatlar paketini shakllantirish platformasi.</p>
        <p>Buyurtmachi (taklif): Iqtisodiyot va moliya vazirligi.</p></div>
      <div><h3>Uslubiyot</h3><ul><li>Regulation (EU) 2023/956 va 2025/2621</li><li>IPCC 2006 yo'riqnomalari</li><li>PF-110 Farmoni, Uglerod soliqi strategiyasi</li></ul></div>
      <div><h3>Ochiq xizmatlar</h3><ul><li><a href="#/public">Ochiq agregatsiyalangan panel</a></li><li><a href="#/docs">Hujjat haqiqiyligini tekshirish</a></li><li><a href="#/profile">Shaxsiy kabinet</a></li></ul></div>
    </div>
    <div class="legal"><div class="container"><span>Versiya 0.2. Ma'lumotlar O'zbekiston hududida saqlanadi.</span><span>Demo ma'lumotlar shartli korxonalarga tegishli.</span></div></div>
  </footer>`;
  $("#yearSel").onchange = e => { S.year = +e.target.value; try { localStorage.setItem("uzc.year", S.year); } catch { /* e'tiborsiz */ } route(); };
  $("#langSel").onchange = e => { setLang(e.target.value); shell(); route(); };
  $("#logoutBtn").onclick = async () => { await post("/api/auth/logout").catch(() => {}); S.user = null; S._insts = null; showLogin(); };
  $("#menuBtn").onclick = () => { const n = $("#siteNav"), open = !n.classList.contains("open"); n.classList.toggle("open", open); $("#menuBtn").setAttribute("aria-expanded", String(open)); };
}

/** Sahifa bandini to'ldirish: sarlavha, izoh va harakatlar sahifa ichidagi .head dan olinadi. */
function buildHero(viewKey, group, item, params) {
  const page = $("#page"), hero = $("#hero");
  const head = page.querySelector(".view > .head");
  let title = item ? t(item.n) : "", lede = "", actions = [];
  const h1 = (head || page).querySelector("h1");
  if (h1) title = h1.textContent.replace(/\s+·\s+\d{4}$/, "").trim();
  if (head) {
    const sub = head.querySelector(".sub");
    if (sub) lede = sub.innerHTML;
    actions = [...head.children].filter(c => !c.contains(h1));
    head.remove();
  } else if (h1 && h1.closest(".view") && h1.parentElement.classList.contains("view")) h1.remove();
  const crumbs = [`<li><a href="#/dashboard">${esc(t("Bosh sahifa"))}</a></li>`];
  if (group && group.k !== "home") crumbs.push(`<li><a href="#/${group.items[0].k}">${esc(t(group.n))}</a></li>`);
  if (params.length && item) crumbs.push(`<li><a href="#/${viewKey}">${esc(t(item.n))}</a></li>`);
  const yearViews = ["dashboard", "data", "calc", "batches", "cbam", "tax", "ai"];
  hero.innerHTML = `<ol class="crumbs" aria-label="Joylashuv">${crumbs.join("")}</ol>
    <div class="hero-row"><div><h1 id="pageTitle">${esc(title)}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}
      ${yearViews.includes(viewKey) ? `<div class="hero-meta"><span class="chip">Hisobot yili: ${S.year}</span></div>` : ""}</div>
      <div class="hero-actions" id="heroActions"></div></div>
    ${group && group.items.length > 1 ? `<nav class="subnav" aria-label="${esc(t(group.n))}">${group.items.map(it => `<a href="#/${it.k}" ${it.k === viewKey ? 'aria-current="page"' : ""}>${esc(t(it.n))}</a>`).join("")}</nav>` : ""}`;
  const box = $("#heroActions");
  for (const a of actions) box.appendChild(a);
  document.title = `${title} — UZ-Carbon MRV`;
}

let navToken = 0;
export async function route() {
  // Qobiq hali chizilmagan bo'lsa (sekin ulanishda kirish tugamasdan havola bosilsa), start() o'zi chaqiradi.
  if (!S.user || !document.getElementById("siteNav") || !document.getElementById("page")) return;
  const { view, params } = parseHash();
  const groups = visibleGroups();
  let group = groups.find(g => g.items.some(i => i.k === view));
  let item = group?.items.find(i => i.k === view);
  let v = view;
  if (view === "profile") { item = PROFILE; group = null; }
  else if (view === "public") { item = { k: "public", n: "Ochiq panel" }; group = null; }
  else if (!item) { v = groups[0].items[0].k; group = groups[0]; item = group.items[0]; }
  for (const a of document.querySelectorAll("#siteNav a")) a.setAttribute("aria-current", String(!!group && a.dataset.g === group.k));
  $("#siteNav").classList.remove("open"); $("#menuBtn")?.setAttribute("aria-expanded", "false");
  const page = $("#page"), hero = $("#hero");
  const my = ++navToken;
  hero.innerHTML = `<ol class="crumbs"><li><a href="#/dashboard">${esc(t("Bosh sahifa"))}</a></li></ol><h1 id="pageTitle">${esc(t(item.n))}</h1>`;
  page.innerHTML = `<div class="view"><p class="note">Yuklanmoqda…</p></div>`;
  try {
    const mod = await VIEWS[v]();
    if (my !== navToken) return;
    await mod.default(page, params, S);
    if (my !== navToken) return;
    buildHero(v, group, item, params);
    applyScript(page); applyScript(hero); applyScript($("#siteNav"));
  } catch (e) {
    if (my !== navToken) return;
    page.innerHTML = `<div class="view"><div class="banner crit">Bo'limni ochib bo'lmadi: ${esc(e.message)}</div></div>`;
    if (e.status !== 401) console.error(e);
  }
}

/* ---------- Kirish va 2FA ---------- */
function authLayout(inner) {
  $("#root").innerHTML = `<div class="auth">
    <section class="auth-side" aria-label="Platforma haqida">
      <a class="brand" href="#/">${MARK}<span class="brand-text"><b>UZ-Carbon MRV</b><small>O'zbekiston Respublikasi davlat axborot tizimi</small></span></a>
      <div>
        <h2>Eksport uchun uglerod hisobi bitta platformada</h2>
        <p>Emissiyalarni EI CBAM usulida hisoblang, O'zbekistonda to'langan uglerod narxini hujjatlashtiring va importyor uchun eksportyor hujjatlar paketini tayyorlang.</p>
      </div>
      <ul class="auth-facts">
        <li><b>5</b><span>CBAM tovar guruhi</span></li>
        <li><b>2026–2034</b><span>bepul kvotalar bosqichma-bosqich kamayadi</span></li>
        <li><b>30-sentabr</b><span>importyor deklaratsiyasi muddati</span></li>
      </ul>
    </section>
    <section class="auth-main"><div class="auth-card">${inner}</div>
      <p class="auth-foot">Ma'lumotlar O'zbekiston hududida saqlanadi. Har bir amal o'zgartirib bo'lmaydigan audit jurnalida qayd etiladi.</p>
    </section></div>`;
}
function showLogin(msg = "") {
  authLayout(`<form id="loginForm" novalidate>
      <div><h1>Tizimga kirish</h1><p class="note" style="margin:6px 0 0">Eksportyorlar, verifikatorlar va davlat organlari xodimlari uchun.</p></div>
      ${msg ? `<div class="banner" role="alert">${esc(msg)}</div>` : ""}
      <label>Login<input name="login" autocomplete="username" required autofocus></label>
      <label>Parol<input name="password" type="password" autocomplete="current-password" required></label>
      <span class="field-err note" id="loginMsg" role="alert"></span>
      <button class="btn" type="submit">Kirish</button>
      <div class="divider">yoki</div>
      <a class="btn ghost" href="#/public" id="pubLink">Ochiq panelni ko'rish</a>
      <p class="note">OneID va elektron raqamli imzo (ERI) orqali kirish integratsiya ulangach qo'shiladi.</p>
    </form>`);
  $("#pubLink").onclick = async e => { e.preventDefault(); await showPublic(); };
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
async function showPublic() {
  $("#root").innerHTML = `<header class="site-header"><div class="container"><a class="brand" href="#/">${MARK}<span class="brand-text"><b>UZ-Carbon MRV</b><small>Ochiq agregatsiyalangan panel</small></span></a><a class="btn" href="#/" id="backLogin">Tizimga kirish</a></div></header>
    <section class="hero"><div class="container" id="hero"><h1>Ochiq panel</h1></div></section><main><div class="container" id="page"></div></main>`;
  $("#backLogin").onclick = e => { e.preventDefault(); location.hash = ""; showLogin(); };
  const m = await import("./views/public.js");
  await m.default($("#page"), [], S, true);
  const head = $("#page .head"); const h1 = head?.querySelector("h1"); const sub = head?.querySelector(".sub");
  $("#hero").innerHTML = `<h1>${esc(h1 ? h1.textContent : "Ochiq panel")}</h1>${sub ? `<p class="lede">${sub.innerHTML}</p>` : ""}`;
  head?.remove();
}
function showMfa() {
  authLayout(`<form id="mfaForm" novalidate>
      <div><h1>Ikki bosqichli tasdiq</h1><p class="note" style="margin:6px 0 0">Autentifikator ilovasidagi 6 xonali kodni kiriting.</p></div>
      <label>Tasdiq kodi<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}" required autofocus></label>
      <span class="note" id="mfaMsg" role="alert"></span>
      <button class="btn" type="submit">Tasdiqlash</button>
    </form>`);
  $("#mfaForm").onsubmit = async e => {
    e.preventDefault();
    try { await post("/api/auth/mfa", { code: e.target.code.value.trim() }); start(); } catch (err) { $("#mfaMsg").textContent = err.message; }
  };
}
async function showMfaSetup() {
  let r;
  try { r = await post("/api/auth/mfa/setup"); } catch (e) { return showLogin(e.message); }
  authLayout(`<form id="mfaSetup" novalidate>
      <div><h1>2FA ni sozlash</h1><p class="note" style="margin:6px 0 0">Rolingiz uchun ikki bosqichli autentifikatsiya majburiy. Kalitni autentifikator ilovasiga qo'lda kiriting, so'ng ilova ko'rsatgan kodni yozing.</p></div>
      <div class="secret" data-raw>${esc(r.secret.replace(/(.{4})/g, "$1 ").trim())}</div>
      <details><summary>otpauth havolasi</summary><p class="mono" style="word-break:break-all">${esc(r.uri)}</p></details>
      <label>Tasdiq kodi<input name="code" inputmode="numeric" maxlength="6" required autofocus></label>
      <span class="note" id="setupMsg" role="alert"></span>
      <button class="btn" type="submit">Yoqish va kirish</button>
    </form>`);
  $("#mfaSetup").onsubmit = async e => {
    e.preventDefault();
    try { await post("/api/auth/mfa/enable", { code: e.target.code.value.trim() }); start(); } catch (err) { $("#setupMsg").textContent = err.message; }
  };
}

async function start() {
  try {
    const me = await get("/api/auth/me");
    if (!me.user) { if (parseHash().view === "public") return showPublic(); return showLogin(); }
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
window.addEventListener("hashchange", () => {
  if (S.user) return route();
  // Kirmagan foydalanuvchi: faqat ochiq panel va kirish sahifasi
  if (parseHash().view === "public") showPublic(); else if (!document.querySelector("#loginForm")) showLogin();
});
start();

export { toast } from "./ui.js";
