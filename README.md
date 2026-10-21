# UZ-Carbon MRV

Eksportyorlar uchun issiqxona gazlari emissiyalari, milliy uglerod narxi va Yevropa Ittifoqi CBAM to'lovini hisoblash, monitoring qilish va tahlil qilish platformasi. Asos: texnik topshiriq `TZ_UZ-Carbon_platforma16.10.2026+.docx` (TZ-2). Ishlab chiqish rejasi va har bir talab holati: [REJA.md](REJA.md).

Tashqi kutubxonalar talab qilinmaydi: faqat **Node.js 22.13 yoki undan yangi** versiya (o'rnatilgan SQLite — `node:sqlite` ishlatiladi).

## 1. Ishga tushirish

```
npm run seed     # demo ma'lumotlar va foydalanuvchilar (data/uzcarbon.db qayta yaratiladi)
npm start        # http://localhost:3000
```

VS Code'da `F5` — "UZ-Carbon serverini ishga tushirish".

Demo ma'lumotlar **shartli korxonalar** (sement, po'lat, azotli o'g'it) bo'yicha: 2025-yil (12 oy) va 2026-yil (yanvar–sentabr) oylik ma'lumotlari, EI ga eksport partiyalari, 2025-yil sement verifikatsiyasi, 2026-yil soliq to'lovlari. Ataylab kiritilgan holatlar: sement 2026-may gaz hisoblagichi xatosi (AI-3 topadi), po'lat 2026-mart gaz ma'lumoti yo'q (konservativ to'ldiriladi), bojxona va korxona partiyalari farqi (AI-4).

### Demo foydalanuvchilar

Hammasi uchun parol: `Demo2026parol`

| Login | Rol | 2FA |
|---|---|---|
| `sement`, `metall`, `kimyo` | Eksportyor mutaxassisi | — |
| `sement_admin`, `metall_admin`, `kimyo_admin` | Eksportyor administratori | ha |
| `verifikator` | Verifikator | ha |
| `importyor` | Xorijiy importyor | — |
| `metod1`, `metod2` | Uslubiyot administratori (ikki shaxs qoidasini sinash uchun ikkita) | ha |
| `imv` | IMV (DNA, reestr) | ha |
| `soliq`, `ekologiya`, `bojxona`, `energetika`, `tahlilchi` | Davlat organlari | — |
| `admin` | Tizim administratori | ha |

**2FA qanday ishlaydi:** jadvalda 2FA ustuni "ha" bo'lgan rollarga birinchi kirishda ekranda maxfiy kalit chiqadi. Uni telefondagi autentifikator ilovasiga (Google Authenticator, Microsoft Authenticator) qo'lda kiritasiz, ilova bergan 6 xonali kodni yozasiz — shu bilan sozlanadi. Keyingi kirishlarda faqat kod so'raladi.

Tezroq ko'rish uchun 2FA talab qilmaydigan loginlardan foydalaning: `sement`, `metall`, `kimyo`, `tahlilchi`, `soliq`, `importyor`, `bojxona`, `ekologiya`, `energetika`.

Mahalliy ishlab chiqishda, 2FA allaqachon sozlangan bo'lsa, joriy kodni `npm run totp -- <login>` chiqaradi.

## 1.1. Boshqa odamga ko'rsatish (global havola)

Ilova shu kompyuterda ishlaydi, havola esa internetdan ochiladi:

```
powershell -ExecutionPolicy Bypass -File scripts\demo-link.ps1
```

Skript serverni ishga tushiradi, SSH tunnel ochadi va havolani chiqaradi (masalan `https://xxxxx.lhr.life`). Shu havolani yuboring.

- Havola **oyna ochiq turgancha** ishlaydi. Oynani yopsangiz yoki Ctrl+C bossangiz, havola o'chadi.
- Har safar ishga tushirilganda havola **yangi** bo'ladi (bepul tunnel xizmati shunday).
- Hech narsa o'rnatish shart emas: Windows tarkibidagi `ssh` ishlatiladi.
- Skript avval `localhost.run` (22-port), u ishlamasa `pinggy.io` (443-port) orqali ulanadi. Ko'pchilik korporativ tarmoqlarda 22-port yopiq bo'lgani uchun odatda Pinggy ishlaydi: birinchi kirishda ogohlantirish sahifasi chiqadi, **"Enter site"** bosiladi (faqat bir marta), bepul tunnel esa **60 daqiqada** tugaydi — keyin skriptni qayta ishga tushiring.
- Doimiy manzil kerak bo'lsa: `localhost.run` yoki `pinggy.io` da hisob ochib SSH kalitini qo'shing, yoki loyihani serverga joylashtiring.

Ko'rib chiquvchiga yuboriladigan loginlar (parol `Demo2026parol`): `sement` — eksportyor, `tahlilchi` — davlat paneli, `importyor` — Yevropa Ittifoqi importyori, `verifikator` — verifikator (birinchi kirishda o'z autentifikator ilovasini ulaydi).

**Diqqat:** havolani bilgan har kim kirish sahifasini ko'radi, shuning uchun uni faqat kerakli odamga yuboring va ko'rsatib bo'lgach oynani yoping. Bazada faqat shartli (demo) korxonalar ma'lumoti bor.

## 1.2. Serverga joylashtirish (Railway)

1. Railway'da **New Project → Deploy from GitHub repo** orqali shu repozitoriyni tanlang.
2. **Variables** bo'limiga qo'shing:
   - `DATA_DIR` = `/data`
   - `SECURE_COOKIES` = `1`
   - `MFA_ENFORCE` = `1`
3. **Settings → Volumes → Add Volume**, ulanish nuqtasi (mount path): `/data`.
4. Deploy tugagach havolani oching.

`npm start` birinchi ishga tushganda bazani tekshiradi: foydalanuvchilar bo'lmasa, demo ma'lumotlarni avtomatik yuklaydi (`scripts/ensure-seed.js`). Keyingi qayta ishga tushishlarda mavjud ma'lumotlarga tegmaydi.

**Volume shart:** usiz Railway har qayta joylashtirishda fayl tizimini tozalaydi va baza (kiritilgan ma'lumotlar bilan birga) yo'qoladi.

`PORT` o'zgaruvchisini Railway o'zi beradi — qo'lda yozish shart emas. Tekshiruv manzili: `/api/system/health`.

## 2. Buyruqlar

| Buyruq | Vazifasi |
|---|---|
| `npm start` | Serverni ishga tushirish |
| `npm run dev` | Kod o'zgarganda avtomatik qayta yuklash |
| `npm test` | 38 ta test: TZ-2 Ilova A etalonlari, formulalar, API va xavfsizlik, SI, hujjat formatlari |
| `npm run seed` | Demo bazani qayta yaratish |
| `npm run totp -- <login>` | Demo foydalanuvchining 2FA kodi |
| `npm run legacy` | Eski MVP (v0.1) — `legacy/` papkasida |

## 3. Sozlamalar (`.env`)

`.env.example` dan nusxa oling. Asosiylari: `PORT`, `MFA_ENFORCE` (2FA majburiyligi, standart 1), `SESSION_TTL_HOURS`, `SECURE_COOKIES` (HTTPS orqasida 1), `PUBLIC_URL` (ulashish havolalari uchun), `AI_EXTERNAL_ALLOWED` va `ANTHROPIC_API_KEY` (normativ yordamchi uchun tashqi LLM — TZ talabiga ko'ra faqat buyurtmachining yozma roziligi bilan; standart holatda o'chiq va ma'lumot tashqariga chiqmaydi).

## 4. Tuzilma

```
server.js              kirish nuqtasi
src/core/              hisob yadrosi: F-5.x emissiyalar, F-5.7 standart qiymat, F-6.x narx va CBAM, jarayon hisobi, hisob izi
src/db/                sxema va migratsiyalar, xesh zanjirli audit izi, bitemporal ma'lumotnoma (ikki shaxs qoidasi)
src/refdata/initial.js boshlang'ich ma'lumotnoma (har bir qiymat manbasi bilan)
src/auth/              scrypt parol, TOTP 2FA, rollar va huquqlar
src/http/              marshrutizator, CSRF, CSP, validatsiya
src/services/          kirish doirasi, hisob, soliq, CBAM, bildirishnomalar
src/api/               M1–M10 API modullari
src/ai/                AI-3/4/5/6 (anomaliya, moslashtirish, to'ldirish, prognoz), AI-7 MACC, AI-8 RAG, AI-9 risk
src/docs/              ZIP, XLSX, DOCX, CSV, hujjatlar paketi (JSON, XML, HTML)
public/                interfeys (ES-modullar, kutubxonasiz)
scripts/               demo ma'lumotlar, TOTP yordamchisi
tests/                 qabul va birlik testlari
legacy/                MVP v0.1
```

## 5. Asosiy API

Barcha holat o'zgartiruvchi so'rovlar `X-Uzc: 1` sarlavhasini talab qiladi (CSRF himoyasi); sessiya — `HttpOnly; SameSite=Strict` cookie.

| Usul | Manzil | Tavsif |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/mfa` | Kirish va 2FA |
| GET/POST/PUT | `/api/installations`, `/api/processes`, `/api/streams` | Reyestr va monitoring rejasi |
| GET/PUT | `/api/processes/:id/activity?year=` | Oylik ma'lumot (CSV: `.../activity/import`, CEMS: `/api/streams/:id/cems`) |
| GET | `/api/processes/:id/calc?year=` | Jonli hisob, hisob izi, anomaliyalar |
| POST | `/api/processes/:id/results`, `/api/results/:id/submit` | Natijani versiya sifatida saqlash va topshirish |
| GET | `/api/cbam/operator/:id?year=`, `/api/cbam/scenario` | CBAM hisobi va 2026–2034 ssenariysi |
| GET | `/api/tax/declaration`, `/api/tax/effective`, `/api/tax/rates` | Uglerod soliqi, P_eff, stavkalar |
| POST | `/api/verifications`, `.../findings`, `.../conclude` | Verifikatsiya ish oqimi |
| GET | `/api/reports/package?format=json\|xml\|html\|docx\|xlsx` | Eksportyor hujjatlar paketi |
| POST | `/api/share` | Importyorga xavfsiz havola |
| GET/POST | `/api/refdata`, `/api/refdata/proposals` | Ma'lumotnoma va tasdiq |
| GET | `/api/audit/verify` | Audit zanjiri butunligi |
| GET | `/api/public/summary`, `/api/public/verify?hash=` | Ochiq panel va hujjat haqiqiyligi |

## 6. Muhim cheklovlar

- **Standart qiymatlar va TIF kodlari** hozircha TZ-2 4-bo'limidagi misol qiymatlar (14 ta kod, "misol" belgisi bilan). To'liq jadval (~285 kod) `CBAM_TIF_codes_for_UZB_updated.xlsx` dan "Ma'lumotnomalar → TIF TN kodlari jadvalini import qilish" orqali yuklanadi (REJA.md Q1).
- **Benchmarklar (BM)** ma'lumotnomada yo'q — CBAM soddalashtirilgan formula (F-6.5b) bilan hisoblanadi; BM kiritilsa aniq formula (F-6.5a) avtomatik qo'llanadi.
- **Tarmoq EF** (0,50 t/MWh), dizel/LPG/mazut zichligi, material koeffitsientlari — taxminiy, manbada shunday belgilangan.
- **Davlat integratsiyalari** (OneID/ERI, Soliq, Bojxona, O3CI, GFMIS, uglerod reestri) — mock yoki qo'lda rejim; Markaziy bank kursi ochiq API orqali ishlaydi. Elektron imzo — ERI ulanguncha server kaliti bilan HMAC ("mock-ERI").
- **Ma'lumotlar bazasi** — SQLite; SQL PostgreSQL ga ko'chirishga mos yozilgan (barcha so'rovlar `src/db/db.js` orqali).
- **Til**: interfeys o'zbek (lotin) tilida; kirill — avtomatik transliteratsiya; rus va ingliz — menyu va hujjatlar paketi.
