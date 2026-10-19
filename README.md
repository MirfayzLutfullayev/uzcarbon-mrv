# UzCarbon MVP

Eksportyorlar uchun issiqxona gazlari emissiyalari, milliy uglerod narxi va Yevropa Ittifoqi CBAM xarajatini hisoblash, monitoring va tahlil platformasining ishlaydigan MVP versiyasi.

Tashqi kutubxonalar kerak emas: faqat **Node.js 18.17 yoki undan yangi** versiya.

## 1. Ishga tushirish (Visual Studio Code)

1. Node.js o'rnatilganini tekshiring: terminalda `node -v` (v18.17+ bo'lishi kerak). Yo'q bo'lsa — https://nodejs.org dan LTS versiyasini o'rnating.
2. Arxivni oching va VS Code'da **File → Open Folder…** orqali `uzcarbon` papkasini oching.
3. Terminal oching (**Terminal → New Terminal**) va yozing:

   ```
   npm start
   ```

4. Brauzerda oching: **http://localhost:3000**

Yoki `F5` tugmasini bosing — `.vscode/launch.json` dagi "UzCarbon serverini ishga tushirish" sozlamasi serverni debug rejimida ishga tushiradi (to'xtash nuqtalari — breakpoint qo'yish mumkin).

Birinchi ishga tushishda `data/db.json` fayli 3 ta shartli korxona va 18 ta choraklik namuna ma'lumot bilan yaratiladi. Namunalarni ilovaning o'zida "Inshootlar reyestri → Namunalarni o'chirish" tugmasi bilan o'chirish mumkin.

### Visual Studio 2022 da

**File → Open → Folder…** orqali `uzcarbon` papkasini oching ("Node.js development" komponenti o'rnatilgan bo'lishi kerak). `server.js` ni ishga tushiriladigan fayl sifatida tanlang yoki Developer PowerShell'da `npm start` ni bajaring.

## 2. AI-yordamchini yoqish (ixtiyoriy)

1. `.env.example` faylidan nusxa olib, `.env` deb nomlang.
2. `ANTHROPIC_API_KEY=` qatoriga Anthropic API kalitini yozing (https://console.anthropic.com).
3. Serverni qayta ishga tushiring.

Kalitsiz ham hisob-kitob, anomaliyalarni aniqlash, prognoz va hisobotlar to'liq ishlaydi; faqat "AI tahlil" bo'limidagi chat va dekarbonizatsiya tavsiyalari o'chiq bo'ladi. API kaliti faqat serverda saqlanadi va brauzerga uzatilmaydi.

## 3. Buyruqlar

| Buyruq | Vazifasi |
| --- | --- |
| `npm start` | Serverni ishga tushirish (http://localhost:3000) |
| `npm run dev` | Kod o'zgarganda server avtomatik qayta yuklanadi |
| `npm test` | Hisoblash yadrosi va API testlari (14 ta) |
| `npm run seed` | `data/db.json` ni namuna ma'lumotlar bilan **almashtirish** |

Portni o'zgartirish: `.env` da `PORT=8080`.

## 4. Loyiha tuzilishi

```
uzcarbon/
├── server.js            HTTP server, REST API, fayl asosidagi ombor, AI proksi
├── public/
│   ├── index.html       Ilova sahifasi
│   ├── css/style.css    Dizayn (yorug' va qorong'i mavzu)
│   └── js/
│       ├── calc.js      Hisoblash yadrosi: emissiyalar, SEE, CBAM, anomaliyalar, prognoz
│       └── app.js       Foydalanuvchi interfeysi
├── data/
│   ├── seed.json        Namuna ma'lumotlar
│   └── db.json          Ishchi ma'lumotlar (avtomatik yaratiladi, gitga kirmaydi)
├── scripts/seed.js      Namunalarni qayta yuklash
├── tests/               node:test testlari
├── requests.http        API so'rov namunalari (VS Code "REST Client" kengaytmasi)
└── .vscode/             Ishga tushirish va muharrir sozlamalari
```

## 5. API

| Usul | Manzil | Tavsif |
| --- | --- | --- |
| GET | `/api/state` | Barcha inshootlar, davrlar, parametrlar |
| PUT | `/api/installations/:id` | Inshoot qo'shish yoki yangilash |
| DELETE | `/api/installations/:id` | Inshootni (va uning davrlarini) o'chirish |
| PUT | `/api/records/:id` | Hisobot davrini saqlash (`id` = `instId_yil_davr`) |
| DELETE | `/api/records/:id` | Davrni o'chirish |
| PUT | `/api/params` | Uslubiyot parametrlarini saqlash |
| POST | `/api/ai/chat` | AI-yordamchi (`{messages, json?}`) |

Server barcha kiruvchi ma'lumotlarni tekshiradi: STIR 9 raqam, CN kodi 8 raqam, sonlar manfiy emas, mahsulot hajmi > 0, inshoot reyestrda mavjud.

## 6. Hisoblash uslubiyoti (qisqacha)

- Yoqish emissiyalari: `sarf × quyi issiqlik qiymati × emissiya koeffitsiyenti` (IPCC 2006).
- Sement: klinker × (CaO × 0,785 + MgO × 1,092); CaO kiritilmasa 0,52 t CO₂/t klinker.
- Bilvosita (elektr) emissiyalar faqat sement va o'g'itlarda CBAM'ga qo'shiladi.
- SEE = (to'g'ridan-to'g'ri + bilvosita + prekursorlar) / mahsulot.
- CBAM sertifikatlari: `N = max(0; SEE×M − benchmark × bepul kvota ulushi × M)`.
- CBAM sof xarajati: `N × ETS narxi − milliy uglerod narxi chegirmasi`.

**Muhim:** standart qiymatlar, benchmarklar va bepul kvota ulushlari taxminiy. Rasmiy hisob uchun ularni ilovaning "Parametrlar" bo'limida Yevropa Komissiyasining amaldagi jadvallari bo'yicha yangilang. Bu MVP — sanoat ekspluatatsiyasi uchun texnik topshiriqdagi verifikatsiya moduli, davlat tizimlari bilan integratsiya, foydalanuvchi autentifikatsiyasi va haqiqiy ma'lumotlar bazasi (PostgreSQL) qo'shilishi kerak.

## 7. Keyingi qadamlar (texnik topshiriq bo'yicha)

- Foydalanuvchilar va rollar (OneID / ERI orqali kirish)
- Ma'lumotlar bazasini PostgreSQL ga ko'chirish
- Verifikatsiya moduli (M6) va audit izi
- CBAM rasmiy XML/Excel shablonini eksport qilish
- Soliq, bojxona va energetika tizimlari bilan integratsiya
