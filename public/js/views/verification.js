/* M8 — verifikatsiya: tayinlash, so'rovlar va nomuvofiqliklar, javoblar, xulosa va imzo (2FA bilan). */
import { get, post } from "../api.js";
import { $, $$, esc, fmt, table, toast, errToast, formData, opt, dt, basisPill } from "../ui.js";
import { route } from "../app.js";

const ST = { assigned: ["tayinlangan", "lo"], in_progress: ["jarayonda", "mid"], concluded: ["yakunlangan", "ok"] };
const KIND = { request: "So'rov", nonconformity: "Nomuvofiqlik", comment: "Izoh", sample: "Namuna (sampling)" };
const OP = { positive: "Ijobiy", qualified: "Izohli ijobiy", negative: "Salbiy" };

export default async function (el, params, S) {
  if (params[0]) return detail(el, params[0], S);
  const [list, vers, insts] = await Promise.all([get("/api/verifications"), get("/api/verifiers"), S.can("verification.assign") ? S.insts() : Promise.resolve([])]);
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>Verifikatsiya</h1><p class="sub">ISO 14065 / ISO 14064-3 ish oqimi: tayinlash → so'rovlar va nomuvofiqliklar → tuzatishlar → xulosa va imzo (FT-6.1 – FT-6.3). Verifikator faqat tayinlangan inshoot va yilni o'qiydi.</p></div></div>
    <section class="panel"><h2>Verifikatsiyalar</h2>${table([{ h: "Inshoot", k: "installationName" }, { h: "Yil", k: "year" }, { h: "Verifikator", k: "verifierName" },
      { h: "Holat", v: v => `<span class="pill ${ST[v.status][1]}">${ST[v.status][0]}</span>${v.opinion ? ` <span class="pill ${v.opinion === "negative" ? "hi" : "ok"}">${OP[v.opinion]}</span>` : ""}`, html: true },
      { h: "Ochiq bandlar", v: v => v.findings.filter(f => f.status !== "closed").length, num: true }, { h: "", v: v => `<a class="btn ghost small" href="#/verification/${v.id}">Ochish</a>`, html: true }], list, { empty: "Verifikatsiya yo'q." })}</section>
    ${S.can("verification.assign") ? `<section class="panel"><h2>Verifikator tayinlash</h2><form id="asForm" novalidate><div class="fields">
      <label>Inshoot<select name="installationId">${insts.map(i => opt(i.id, i.name)).join("")}</select></label>
      <label>Yil<input name="year" type="number" value="${S.year}" min="2020" max="2040"></label>
      <label>Verifikator<select name="verifierId">${vers.filter(v => v.active).map(v => opt(v.id, `${v.name} (${v.accreditationNo})`)).join("")}</select></label>
    </div><div class="row"><button class="btn" type="submit">Tayinlash</button></div></form></section>` : ""}
  </div>`;
  const f = $("#asForm"); if (f) f.onsubmit = async e => { e.preventDefault(); try { const v = await post("/api/verifications", formData(f)); toast("Tayinlandi"); location.hash = `#/verification/${v.id}`; } catch (x) { errToast(x); } };
}

async function detail(el, id, S) {
  const v = await get(`/api/verifications/${id}`);
  const work = S.can("verification.work") && v.status !== "concluded";
  const respond = S.can("verification.respond");
  el.innerHTML = `<div class="view">
    <div class="head"><div><h1>${esc(v.installationName)} · ${v.year}</h1><p class="sub">Verifikator: ${esc(v.verifierName)} · holat: ${ST[v.status][0]}</p></div><a class="btn ghost" href="#/verification">← Ro'yxat</a></div>
    <section class="panel"><h2>Topshirilgan hisob natijalari</h2>${table([{ h: "Jarayon", k: "processName" }, { h: "Versiya", k: "version", num: true }, { h: "Holat", k: "status" }, { h: "SEE CBAM", k: "seeCbam", num: true, d: 4 }, { h: "Asos", v: r => basisPill(r.basis), html: true }], v.results, { empty: "Eksportyor hali natija topshirmagan (Hisob-kitob → Verifikatsiyaga topshirish)." })}
      <p class="note">Batafsil hisob izi: <a href="#/calc">Hisob-kitob</a> bo'limida (yil: ${v.year}).</p></section>
    <section class="panel"><h2>So'rovlar, nomuvofiqliklar va izohlar</h2>
      ${v.findings.length ? `<div class="list">${v.findings.map(f => `<div class="sev ${f.kind === "nonconformity" ? "hi" : f.kind === "request" ? "mid" : "lo"}">
        <b>${esc(KIND[f.kind])} <span class="pill ${f.status === "closed" ? "ok" : f.status === "responded" ? "mid" : "hi"}">${esc({ open: "ochiq", responded: "javob berilgan", closed: "yopilgan" }[f.status])}</span></b>
        <span>${esc(f.text)}</span><span class="note">${dt(f.createdAt)}</span>
        ${f.response ? `<span><b>Javob:</b> ${esc(f.response)} <span class="note">${dt(f.respondedAt)}</span></span>` : ""}
        ${respond && f.status === "open" ? `<form data-resp="${f.id}" class="row" novalidate><input name="response" placeholder="Javob yoki tuzatish tavsifi" required style="flex:1;min-width:220px"><button class="btn small" type="submit">Javob berish</button></form>` : ""}
        ${work && f.status !== "closed" ? `<span class="row"><button class="btn ghost small" data-close="${f.id}">Yopish</button></span>` : ""}
      </div>`).join("")}</div>` : `<p class="note">Bandlar yo'q.</p>`}
      ${work ? `<form id="fForm" novalidate style="margin-top:12px"><div class="fields"><label>Turi<select name="kind">${Object.entries(KIND).map(([k, n]) => opt(k, n)).join("")}</select></label></div>
        <label>Matn<textarea name="text" required></textarea></label><div class="row"><button class="btn" type="submit">Qo'shish</button></div></form>` : ""}</section>
    ${v.status === "concluded" ? `<section class="panel"><h2>Xulosa</h2><dl class="kv"><dt>Xulosa</dt><dd>${esc(OP[v.opinion])}</dd><dt>Imzolangan</dt><dd>${dt(v.signedAt)}</dd><dt>Imzo</dt><dd style="word-break:break-all">${esc(v.signature)}</dd></dl><p>${esc(v.conclusion)}</p></section>`
      : work ? `<section class="panel"><h2>Yakuniy xulosa va imzo</h2><form id="cForm" novalidate>
        <div class="fields"><label>Xulosa<select name="opinion">${Object.entries(OP).map(([k, n]) => opt(k, n)).join("")}</select></label><label>2FA kodi <em>imzo uchun</em><input name="code" inputmode="numeric" maxlength="6"></label></div>
        <label>Xulosa matni<textarea name="conclusion" required></textarea></label>
        <p class="note">Imzodan keyin topshirilgan natijalar "verifikatsiyalangan" bo'ladi va shu yil ma'lumotlari qulflanadi. Elektron imzo ERI integratsiyasigacha server kaliti bilan (mock-ERI).</p>
        <div class="row"><button class="btn" type="submit">Imzolash</button></div></form></section>` : ""}
  </div>`;
  $$("form[data-resp]").forEach(f => f.onsubmit = async e => { e.preventDefault(); try { await post(`/api/findings/${f.dataset.resp}/respond`, formData(f)); toast("Javob yuborildi"); route(); } catch (x) { errToast(x); } });
  $$("[data-close]").forEach(b => b.onclick = async () => { try { await post(`/api/findings/${b.dataset.close}/close`); toast("Yopildi"); route(); } catch (x) { errToast(x); } });
  const ff = $("#fForm"); if (ff) ff.onsubmit = async e => { e.preventDefault(); try { await post(`/api/verifications/${id}/findings`, formData(ff)); toast("Qo'shildi"); route(); } catch (x) { errToast(x); } };
  const cf = $("#cForm"); if (cf) cf.onsubmit = async e => { e.preventDefault(); try { await post(`/api/verifications/${id}/conclude`, formData(cf)); toast("Imzolandi"); route(); } catch (x) { errToast(x); } };
}
