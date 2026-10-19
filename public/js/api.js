/* Server API klienti: CSRF sarlavhasi, JSON, xatolar, sessiya tugashi. */
export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data; }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "x-uzc": "1", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith("/api/auth/")) onUnauthorized(data);
    throw new ApiError(res.status, (data && data.error) || `HTTP ${res.status}`, data);
  }
  return data;
}
export const get = url => api("GET", url);
export const post = (url, body = {}) => api("POST", url, body);
export const put = (url, body) => api("PUT", url, body);
export const patch = (url, body) => api("PATCH", url, body);
export const del = url => api("DELETE", url);

/** Faylni yuklab olish (Content-Disposition nomi bilan). */
export async function download(url, fallbackName) {
  const res = await fetch(url, { headers: { "x-uzc": "1" }, credentials: "same-origin" });
  if (!res.ok) { let msg = `HTTP ${res.status}`; try { msg = (await res.json()).error || msg; } catch { /* matn emas */ } throw new ApiError(res.status, msg); }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const name = (cd.match(/filename="([^"]+)"/) || [])[1] || fallbackName || "fayl";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Faylni base64 ga o'qish (yuklash uchun). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
export function fileToText(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsText(file, "utf-8"); });
}
