/*
 * Til: o'zbek (lotin) — asosiy; o'zbek (kirill) — avtomatik transliteratsiya; rus va ingliz — menyu va asosiy yorliqlar lug'ati.
 * To'liq lokalizatsiya fayllari R18 da (qolgan matnlar o'zbek tilida ko'rsatiladi).
 */
const DICT = {
  ru: { "Monitoring paneli": "Панель мониторинга", "Reyestr": "Реестр", "Ma'lumot kiritish": "Ввод данных", "Hisob-kitob": "Расчёты", "Eksport partiyalari": "Экспортные партии",
    "CBAM kalkulyatori": "Калькулятор CBAM", "Uglerod soliqi": "Углеродный налог", "Verifikatsiya": "Верификация", "Hujjatlar paketi": "Пакет документов", "SI tahlil": "ИИ-анализ",
    "ITMO loyihalari": "Проекты ITMO", "Ma'lumotnomalar": "Справочники", "Audit jurnali": "Журнал аудита", "Foydalanuvchilar": "Пользователи", "Integratsiyalar": "Интеграции", "Profil": "Профиль",
    "Chiqish": "Выйти", "Kirish": "Войти", "Yil": "Год", "Asosiy": "Основное", "Hisobot": "Отчётность", "Boshqaruv": "Управление", "Davlat paneli": "Государственная панель", "Ochiq panel": "Открытая панель",
    "Bosh sahifa": "Главная", "Korxona": "Предприятие", "Hisob-kitoblar": "Расчёты", "Hisobotlar": "Отчётность", "Tahlil": "Аналитика", "Emissiya hisobi": "Расчёт выбросов", "Shaxsiy kabinet": "Личный кабинет" },
  en: { "Monitoring paneli": "Dashboard", "Reyestr": "Registry", "Ma'lumot kiritish": "Data entry", "Hisob-kitob": "Calculation", "Eksport partiyalari": "Export consignments",
    "CBAM kalkulyatori": "CBAM calculator", "Uglerod soliqi": "Carbon tax", "Verifikatsiya": "Verification", "Hujjatlar paketi": "Document package", "SI tahlil": "AI analytics",
    "ITMO loyihalari": "ITMO projects", "Ma'lumotnomalar": "Reference data", "Audit jurnali": "Audit log", "Foydalanuvchilar": "Users", "Integratsiyalar": "Integrations", "Profil": "Profile",
    "Chiqish": "Sign out", "Kirish": "Sign in", "Yil": "Year", "Asosiy": "Main", "Hisobot": "Reporting", "Boshqaruv": "Administration", "Davlat paneli": "Government dashboard", "Ochiq panel": "Public dashboard",
    "Bosh sahifa": "Home", "Korxona": "Company", "Hisob-kitoblar": "Calculations", "Hisobotlar": "Reports", "Tahlil": "Analytics", "Emissiya hisobi": "Emissions", "Shaxsiy kabinet": "My account" },
};

let lang = "uz";
try { lang = localStorage.getItem("uzc.lang") || "uz"; } catch { /* saqlash mavjud emas */ }
export const getLang = () => lang;
export function setLang(l) { lang = l; try { localStorage.setItem("uzc.lang", l); } catch { /* e'tiborsiz */ } }
export function t(s) { return (DICT[lang] && DICT[lang][s]) || s; }

/* O'zbek lotin → kirill transliteratsiyasi (qoidalar tartibi muhim). */
const PAIRS = [["sh", "ш"], ["Sh", "Ш"], ["SH", "Ш"], ["ch", "ч"], ["Ch", "Ч"], ["CH", "Ч"], ["o'", "ў"], ["O'", "Ў"], ["g'", "ғ"], ["G'", "Ғ"],
  ["o‘", "ў"], ["O‘", "Ў"], ["g‘", "ғ"], ["G‘", "Ғ"], ["yo", "ё"], ["Yo", "Ё"], ["yu", "ю"], ["Yu", "Ю"], ["ya", "я"], ["Ya", "Я"], ["ye", "е"], ["Ye", "Е"]];
const SINGLE = { a: "а", b: "б", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", x: "х", y: "й", z: "з", "'": "ъ", "’": "ъ" };
export function toCyrillic(text) {
  let s = text.replace(/\b[eE]/g, m => (m === "e" ? "э" : "Э"));
  for (const [a, b] of PAIRS) s = s.split(a).join(b);
  return s.replace(/[A-Za-z'’]/g, ch => { const low = ch.toLowerCase(); const c = SINGLE[low]; if (!c) return ch; return ch === low ? c : c.toUpperCase(); });
}
/** Kirill rejimida DOM dagi matnlarni o'girish (raqamlar, formulalar, kodlar va kiritish maydonlari tegilmaydi). */
export function applyScript(root) {
  if (lang !== "uz-Cyrl") return;
  const skip = el => el.closest(".mono,.num,.formula,code,input,textarea,select,[data-raw],.kv dd,svg");
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) if (n.nodeValue.trim() && !skip(n.parentElement) && /[A-Za-z]/.test(n.nodeValue) && !/[A-Z]{2,}[-_.\d]/.test(n.nodeValue)) n.nodeValue = toCyrillic(n.nodeValue);
}
