/* Interfeys yordamchilari: xavfsiz HTML, son formati, jadval, grafiklar, bildirish. */
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Son: guruhlangan, o'zbekcha vergul bilan. */
export function fmt(n, d = 0) {
  if (n == null || n === "" || !Number.isFinite(+n)) return "—";
  const v = +n, s = Math.abs(v).toFixed(d), [i, f] = s.split(".");
  return (v < 0 ? "−" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (f ? "," + f : "");
}
export const pct = (v, d = 0) => (v == null || !Number.isFinite(+v) ? "—" : fmt(v * 100, d) + "%");
export const mln = (v, d = 2) => (v == null || !Number.isFinite(+v) ? "—" : fmt(v / 1e6, d));
export const dt = s => (s ? String(s).slice(0, 16).replace("T", " ") : "—");

let toastTimer;
export function toast(text, kind = "") {
  const el = $("#toast");
  el.textContent = text; el.className = "toast" + (kind ? " " + kind : ""); el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), kind === "err" ? 6000 : 3000);
}
export const errToast = e => toast(e?.data?.errors ? `${e.message} ${e.data.errors.slice(0, 3).map(x => `${x.row}-qator: ${x.error}`).join("; ")}` : e.message || String(e), "err");

/** Jadval: cols = [{h, k|v(row), num, d}] */
export function table(cols, rows, { empty = "Ma'lumot yo'q.", foot } = {}) {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  const cell = (c, r) => { const raw = c.v ? c.v(r) : r[c.k]; return c.html ? raw : c.num ? fmt(raw, c.d ?? 0) : esc(raw ?? "—"); };
  return `<div class="tablewrap"><table><thead><tr>${cols.map(c => `<th${c.num ? ' class="num"' : ""}>${esc(c.h)}</th>`).join("")}</tr></thead><tbody>${
    rows.map(r => `<tr>${cols.map(c => `<td${c.num ? ' class="num"' : ""}>${cell(c, r)}</td>`).join("")}</tr>`).join("")}${foot ? `<tr class="total">${foot.map((f, i) => `<td${cols[i]?.num ? ' class="num"' : ""}>${f ?? ""}</td>`).join("")}</tr>` : ""}</tbody></table></div>`;
}

export const sevName = { hi: "Yuqori", mid: "O'rta", lo: "Past" };
export const basisName = { actual: "Haqiqiy (verifikatsiyalangan)", default: "Standart qiymat", actual_unverified: "Haqiqiy (verifikatsiyasiz)", none: "Aniqlanmagan" };
export const basisPill = b => `<span class="pill ${b === "actual" ? "ok" : b === "default" ? "mid" : "lo"}">${esc(basisName[b] || b)}</span>`;

function niceTicks(max, n = 4) {
  if (!(max > 0)) return [0];
  const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), st = [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= raw) || p;
  const t = []; for (let v = 0; v <= max + 1e-9; v += st) t.push(+v.toFixed(8)); return t;
}

/** Gorizontal ustunli grafik: items [{label, value, color?, note?}], markers [{value, label}] */
export function hbar(items, { unit = "", d = 2, markers = [] } = {}) {
  if (!items.length) return `<div class="empty">Ma'lumot yo'q.</div>`;
  const W = 600, rowH = 30, padL = 190, padR = 70, H = items.length * rowH + 28;
  const max = Math.max(...items.map(x => x.value || 0), ...markers.map(m => m.value || 0)) * 1.1 || 1;
  const X = v => padL + (W - padL - padR) * v / max;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik">`;
  for (const t of niceTicks(max)) s += `<line x1="${X(t)}" x2="${X(t)}" y1="4" y2="${H - 22}" stroke="var(--line)"/><text x="${X(t)}" y="${H - 6}" text-anchor="middle">${fmt(t, t < 10 ? 2 : 0)}</text>`;
  items.forEach((it, i) => {
    const y = 6 + i * rowH;
    s += `<text x="0" y="${y + 14}" style="fill:var(--ink)">${esc(it.label.length > 28 ? it.label.slice(0, 27) + "…" : it.label)}</text>`;
    s += `<rect x="${padL}" y="${y + 2}" width="${Math.max(1, X(it.value || 0) - padL)}" height="16" rx="3" fill="${it.color || "var(--accent)"}"><title>${esc(it.label)}: ${fmt(it.value, d)} ${unit}</title></rect>`;
    s += `<text x="${X(it.value || 0) + 6}" y="${y + 14}" style="fill:var(--ink);font-family:var(--f-mono)">${fmt(it.value, d)}</text>`;
  });
  for (const m of markers) s += `<line x1="${X(m.value)}" x2="${X(m.value)}" y1="2" y2="${H - 22}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 3"><title>${esc(m.label)}: ${fmt(m.value, d)}</title></line>`;
  return `<div class="chart">${s}</svg></div>`;
}

/** Chiziqli grafik: series [{name, color, points:[{x(label), y}]}] */
export function line(series, { d = 0, unit = "" } = {}) {
  series = series.filter(s => s.points.length);
  if (!series.length) return `<div class="empty">Ma'lumot yo'q.</div>`;
  const xs = [...new Set(series.flatMap(s => s.points.map(p => p.x)))];
  const W = 600, H = 230, pl = 56, pr = 14, pt = 10, pb = 30;
  const max = Math.max(...series.flatMap(s => s.points.map(p => p.y)).filter(Number.isFinite)) * 1.1 || 1;
  const X = x => pl + (W - pl - pr) * (xs.length === 1 ? 0.5 : xs.indexOf(x) / (xs.length - 1));
  const Y = v => pt + (H - pt - pb) * (1 - v / max);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dinamika">`;
  for (const t of niceTicks(max)) s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="${pl - 6}" y="${Y(t) + 4}" text-anchor="end">${fmt(t, t < 10 ? 2 : 0)}</text>`;
  xs.forEach((x, i) => { if (xs.length > 12 && i % 2) return; s += `<text x="${X(x)}" y="${H - 10}" text-anchor="middle">${esc(x)}</text>`; });
  for (const se of series) {
    const pts = se.points.filter(p => Number.isFinite(p.y));
    s += `<path d="${pts.map((p, i) => (i ? "L" : "M") + X(p.x).toFixed(1) + " " + Y(p.y).toFixed(1)).join(" ")}" fill="none" stroke="${se.color}" stroke-width="2" ${se.dash ? 'stroke-dasharray="5 4"' : ""}/>`;
    for (const p of pts) s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3" fill="var(--surface)" stroke="${se.color}" stroke-width="1.5"><title>${esc(se.name)} · ${esc(p.x)}: ${fmt(p.y, d)} ${unit}</title></circle>`;
  }
  return `<div class="chart">${s}</svg></div><div class="legend">${series.map(se => `<span><i style="background:${se.color}"></i>${esc(se.name)}</span>`).join("")}</div>`;
}

/** Ikki bosqichli tasdiq tugmasi (o'chirish va qaytarib bo'lmaydigan amallar uchun). */
export function confirmInline(btn, text, onYes) {
  const wrap = document.createElement("span");
  wrap.className = "confirm";
  wrap.innerHTML = `${esc(text)} <button class="btn danger small" type="button">Ha</button><button class="btn ghost small" type="button">Yo'q</button>`;
  const restore = () => wrap.replaceWith(btn);
  wrap.children[0].onclick = () => { restore(); onYes(); };
  wrap.children[1].onclick = restore;
  btn.replaceWith(wrap);
  wrap.children[1].focus();
}

/** Forma qiymatlari: name → qiymat (raqamli maydonlar son sifatida, bo'shlari tashlanadi). */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === "checkbox") { out[el.name] = el.checked; continue; }
    const v = el.value.trim();
    if (v === "") continue;
    out[el.name] = el.type === "number" || el.dataset.num ? Number(v.replace(",", ".")) : v;
  }
  return out;
}
export const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? "selected" : ""}>${esc(label)}</option>`;
