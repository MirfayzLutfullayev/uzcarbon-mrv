# UZ-Carbon MRV — to'liq ishlab chiqish rejasi

> Tuzilgan sana: 2026-10-19. Bu hujjat ikkala texnik topshiriq, taqdimot va mavjud MVP kodini bitta rejaga birlashtiradi.
> Har bir talabning ID si bor va 15-bo'limdagi nazorat ro'yxatida qaysi bosqichda bajarilishi ko'rsatilgan.
> Kod yozishda shu hujjat asosiy yo'riqnoma bo'ladi. Talab bajarilganda 15-bo'limda `[x]` qo'yiladi.

---

## 0. Manbalar va ustuvorlik

| # | Manba | Qisqa nomi | Rol |
|---|---|---|---|
| 1 | `TZ_UZ-Carbon_platforma16.10.2026+.docx` | **TZ-2** (yangi) | **Asosiy.** Modul raqamlari, formulalar, AI kodlari shu hujjat bo'yicha |
| 2 | `UzCarbon_Texnik_topshiriq.docx` (v1.0, GOST 34.602) | **TZ-1** (eski) | Qo'shimcha. TZ-2 da yo'q talablar (FT-ID lar, xavfsizlik, ERP/IoT, rollar) shu yerdan olinadi |
| 3 | `UzCarbon_taqdimot.pptx` (14 slayd) | PPT | Kontekst: Soliq kodeksi takliflari, "Green Building Material" belgisi, namuna raqamlar |
| 4 | `server.js`, `public/`, `tests/`, `data/` | MVP | Mavjud ishlaydigan prototip (Node.js, kutubxonasiz) |
| 5 | `UzCarbon MVP.html` | MVP-artefakt | Shu MVP ning `window.claude` runtime uchun eski bir faylli versiyasi. Kod jihatdan `public/js/app.js` bilan bir xil. `legacy/` ga ko'chiriladi |

**Ziddiyatlarni hal qilish qoidasi:** TZ-2 ustun. TZ-2 da bo'lmagan talab TZ-1 dan olinadi. Ikkalasida ham bo'lib, qiymatlari farq qilsa, **qattiqrog'i** olinadi. Hammasi parametr sifatida saqlanadi.

### 0.1. Aniqlangan ziddiyatlar va qaror

| Mavzu | TZ-1 | TZ-2 | MVP | **Qaror** |
|---|---|---|---|---|
| Buyurtmachi | Ekologiya vazirligi (taklif) | IMV (DNA, reestr yurituvchisi) | — | IMV |
| Modul raqamlari | M1 reyestr, M2 yig'ish, M3 hisob, M4 narx, M5 AI, M6 verif., M7 hisobot, M8 panel, M9 shlyuz, M10 xavfsizlik | M1 profil, M2 monitoring rejasi, M3 yig'ish, M4 yadro, M5 soliq, M6 CBAM, M7 hujjatlar paketi, M8 verif., M9 panel, M10 ma'lumotnomalar | TZ-1 raqamlari | **TZ-2 raqamlari.** MVP dagi yozuvlar qayta nomlanadi |
| AI raqamlari | AI-1 anomaliya … AI-6 yordamchi | AI-1 OCR … AI-9 risk | TZ-1 raqamlari | **TZ-2 raqamlari** (moslik 6-bo'limda) |
| Klinker standart EF | ≈0,52 | 0,525 | 0,52 | 0,525 (parametr) |
| Milliy uglerod stavkasi | BHM ga bog'lash (FT-4.1) | 5 USD/t (2026–30), 10 USD/t gacha (2031–35) | 41 200 so'm (BHM ning 10%) | Asosiy qiymat USD stavka. BHM ga bog'lash varianti qoladi |
| Standart qiymat (SEE) | — | ~285 TIF TN kodi bo'yicha, O'zbekiston uchun (2025/2621) | Tarmoq bo'yicha bitta qiymat (sement 0,85) | **TIF kodi bo'yicha** |
| Mark-up | — | Sement/Al/H₂/po'lat: 10/20/30%; o'g'it: 1% | Barcha tarmoqqa bitta 10% | **Tarmoq va yil bo'yicha** |
| Yoqilg'i koeffitsientlari | IPCC | Ilova B (gaz 56 kg/GJ × 38 MJ/m³ = 2,128 t/ming m³); milliy NCV/EF ustuvor | IPCC NCV (gaz 0,0343 TJ × 56,1 = 1,924 t/ming m³) | Ma'lumotnomada ikkalasi versiya sifatida turadi. Standart: Ilova B (TZ-2). **Ochiq savol Q8** |
| Yillik hisob vaqti | ≤ 60 s | ≤ 30 s | — | ≤ 30 s |
| OCR aniqligi | ≥ 95% | ≥ 98% | — | ≥ 98% |
| Anomaliya | recall ≥ 90%, precision ≥ 70% | recall ≥ 90% | — | recall ≥ 90% **va** precision ≥ 70% |
| Bo'shliqni to'ldirish | MAPE ≤ 5% | konservativ (eng yuqori oylik qiymat), CBAM hujjatiga kirmaydi | — | Ikkalasi: konservativ qoida + model MAPE ≤ 5% |
| Etalon sinovlar | ≥ 20 misol, farq ≤ 0,1% | Ilova A + har bir guruhga ≥ 3, farq ≤ 0,1% | — | ≥ 20 (Ilova A dagi hammasi + har bir guruhga ≥ 3) |
| Foydalanuvchilar | 2 000 tashkilot, 10 000 foydalanuvchi, 1 000 sessiya | > 1 000 bir vaqtda | — | TZ-1 raqamlari |
| Davriylik | oylik (ERP) | oylik; hisobot davri — kalendar yili | chorak / yil | **Oylik ma'lumot → yillik hisobot**, chorak esa agregatsiya |
| Pilot | 5–10 korxona, ≥ 2 oy | 4 ta nomlangan korxona | 3 ta shartli namuna | 4 ta nomlangan korxona (+ 10 tagacha), ≥ 2 oy |
| Hisobot formatlari | PDF, DOCX, XLSX; uz, ru, en | QR va imzoli PDF, XML/JSON; en shablonlar | CSV | Hammasi |
| Kafolat / qo'llab-quvvatlash | ≥ 3 yil kuzatish | 12 oy kafolat | — | 12 oy kafolat + ekspluatatsiya SLA si |
| Gaz ro'yxati | CO₂, PFC, N₂O | CO₂, N₂O, CF₄, C₂F₆ | CO₂, N₂O (GWP 265), PFC (tayyor t CO₂e) | TZ-2 (GWP lar parametr) |
| Elektr energiyasi tovar sifatida | qamrovda | faqat bilvosita EF sifatida | yo'q | TZ-2 |
| Vodorod | qamrovda | qamrovda (2804 10 00, 10,82) | **yo'q** | Qo'shiladi |

---

## 1. Mavjud MVP: nima bor va nima yetishmaydi

### 1.1. Bor (ishlaydi, 14 test o'tadi)
- `server.js`: HTTP server, REST API (`/api/state`, `installations`, `records`, `params`, `ai/chat`), JSON fayl ombori (atomar yozish), validatsiya (STIR 9, CN 8, son ≥ 0), AI proksi (Anthropic, IP bo'yicha daqiqasiga 20 so'rov), statik fayllar.
- `public/js/calc.js`: yoqish (6 yoqilg'i), sement (CaO/MgO), po'lat (ohaktosh, elektrod), alyuminiy (anod, PFC), o'g'it (N₂O×265), bilvosita (sement/o'g'it), SEE, CBAM sertifikatlari (bepul kvota, benchmark), milliy chegirma, standart qiymat bilan taqqoslash, statistik anomaliyalar, chiziqli prognoz.
- `public/js/app.js`: 7 ta bo'lim (panel, reyestr, ma'lumot kiritish, hisob-kitob, AI tahlil, hisobot + CSV, parametrlar), SVG grafiklar, yorug' va qorong'i mavzu.
- `tests/`: 9 ta hisob testi, 5 ta API testi.

### 1.2. Texnik qarz (birinchi bosqichda tuzatiladi)
1. `app.js` da `calc/analyze/forecast` **nusxalangan**: `calc.js` bilan farq paydo bo'lishi mumkin. Bitta umumiy yadro bo'lishi kerak.
2. Modul va AI yozuvlari eski TZ-1 raqamlarida ("AI-1, AI-3", "M6 verifikatsiya").
3. `natTax` to'g'ridan-to'g'ri emissiya bo'yicha, `deduction` esa sertifikatlar bo'yicha hisoblanadi. Bu TZ-2 6.4–6.5 ga (CP_g = SEE_cov × P_eff) mos emas.
4. Standart SEE tarmoq bo'yicha, TIF kodi bo'yicha emas. Mark-up hamma uchun bir xil (o'g'itda 1% bo'lishi kerak).
5. Sement benchmarki klinker koeffitsientiga ko'paytiriladi. Bu TZ da yo'q, BM_g TIF kodi bo'yicha olinishi kerak.
6. Parametrlar versiyalanmaydi (ustidan yoziladi). Hisob qaysi versiya bilan bajarilgani saqlanmaydi.
7. Autentifikatsiya, rollar va audit izi yo'q. `verified` belgisi ko'rsatiladi, lekin hech qayerda o'rnatilmaydi.
8. Prekursorlar tayyor t CO₂e sifatida kiritiladi: zanjir va SEE_p yo'q.
9. Eksport partiyasi alohida obyekt emas (chorakdagi umumiy `exportEU`).
10. AI so'roviga barcha korxona ma'lumotlari tashqi API ga ketadi. Bu TZ-2 8-bo'lim (mahalliylashtirish) va TZ-1 8.1 (yozma rozilik) ga zid.
11. Faqat CSV. Yillar ro'yxati qattiq yozilgan (2024–2030).

---

## 2. Maqsadli arxitektura

### 2.1. Mantiqiy sxema (TZ-2 10-bo'lim rasmi)

```
 MANBALAR                INTEGRATSIYA VA SI        HISOB YADROSI (SI dan mustaqil)    NATIJALAR
 Korxona MRV, IoT  ─┐    API shlyuz           ─┐   Emissiya, SEE              ─┐      Hujjatlar paketi
 Soliq qo'mitasi    ├──► SI: hujjat o'qish     ├─► Uglerod soliqi            ├────► O3CI, EI importyori
 Bojxona            │    SI: anomaliya         │   CBAM kalkulyatori         │      Uglerod reestri
 Energetika vaz.    │    SI: moslashtirish    ─┘   Ma'lumotnomalar (versiya) ─┘      Tahliliy panellar
 Markaziy bank, ETS─┘
```

Asosiy qoida: **soliq va CBAM summalarini faqat deterministik yadro hisoblaydi.** SI faqat ma'lumotni tayyorlaydi, tekshiradi va tushuntiradi. Har bir SI xulosasini inson tasdiqlaydi va uning izi saqlanadi.

Ma'lumot oqimi (TZ-1 5-bo'lim): korxona ma'lumoti → tekshiruv + SI anomaliya nazorati → hisob yadrosi → verifikatsiya → tasdiqlangan natija → (a) importyorga CBAM hisoboti, (b) Soliq qo'mitasiga to'lov ma'lumoti, (c) davlat paneliga agregatlar.

### 2.2. Texnologiya steki (tavsiya, **Q9 — tasdiqlash kerak**)

Kompyuterda bor: Node.js 24, npm 11, Python 3.12, git. **Yo'q:** Docker, PostgreSQL.

| Qatlam | Tanlov | Sabab |
|---|---|---|
| Hisob yadrosi | TypeScript, toza funksiyalar paketi `packages/core` (brauzer + server) | Bitta manba, 100% testlanadi, aniqlik ≥ 6 o'nlik xona |
| Backend API | Node.js 24 + TypeScript + Fastify + Zod + `@fastify/swagger` | OpenAPI 3.0 (TZ talabi), tez |
| Ma'lumotlar bazasi | PostgreSQL 16 (prod), Kysely query builder, migratsiyalar | TZ: "haqiqiy MB (PostgreSQL)". Lokal: Windows installer yoki portable PostgreSQL |
| Navbat / fon ishlar | pg-boss (PostgreSQL asosida) | Redis shart emas. Ssenariy qayta hisobi ≤ 5 daq, bildirishnomalar, integratsiya so'rovlari |
| Frontend | React + Vite + TypeScript, i18next (uz-Latn, uz-Cyrl, ru, en), yengil grafiklar | WCAG 2.1 AA, mobil |
| SI xizmati | Python 3.12 + FastAPI + scikit-learn (Isolation Forest), LightGBM / statsmodels, Tesseract OCR | TZ: izolyatsiya o'rmoni, gradient boosting, vaqt qatorlari |
| LLM | Provayder abstraksiyasi: lokal model (prod) / Claude API (faqat dev, anonimlashtirilgan ma'lumot) | TZ-2: tijorat siri tashqariga chiqmaydi (**Q10**) |
| Hujjatlar | PDF (pdfkit yoki headless Chromium), DOCX (`docx`), XLSX (`exceljs`), QR (`qrcode`), XML (XSD bo'yicha) | TZ-1 FT-7.5, TZ-2 M7 |
| Imzo | ERI (E-IMZO) adapteri; dev da mock imzo | TZ talabi |
| Joylashtirish | Dockerfile, docker-compose, Kubernetes (Helm) manifestlari | TZ: konteynerlash, Kubernetes |
| Kuzatuv | Strukturali loglar (pino), OpenTelemetry, Prometheus metrikalari, SIEM ga eksport | TZ-1 12-bo'lim |

### 2.3. Repozitoriy tuzilishi (maqsad)

```
uzcarbon/
├── packages/
│   ├── core/            hisob yadrosi (5–6-bo'lim formulalari), hisob izi, testlar
│   ├── refdata/         ma'lumotnoma importerlari (TIF kodlari xlsx, koeffitsientlar)
│   └── shared/          tiplar, Zod sxemalar, i18n kalitlari
├── apps/
│   ├── api/             Fastify: modullar M1–M10, RBAC, audit, OpenAPI
│   ├── web/             React: eksportyor, verifikator, davlat, ochiq panel
│   ├── worker/          pg-boss ishlari: qayta hisob, integratsiyalar, bildirishnomalar
│   └── ai/              Python FastAPI: AI-1 … AI-9
├── integrations/        adapterlar + mock serverlar (Soliq, Bojxona, O3CI, CBU, ETS, …)
├── db/migrations/
├── deploy/              docker, helm
├── docs/                arxitektura, API, qo'llanmalar, model kartalari, sinov dasturi
├── tests/acceptance/    Ilova A etalonlari, 285 kod mark-up sinovi, yuklama sinovlari
└── legacy/              hozirgi MVP (server.js, public/, UzCarbon MVP.html)
```

---

## 3. Ma'lumotlar modeli

TZ-2 9-bo'lim va TZ-1 Ilova B birlashtirilgan. Barcha jadvallarda: `created_at`, `created_by`, `updated_at`, `version`. Ma'lumotnomalar **bitemporal**: `valid_from/valid_to` (amal qilish) + `recorded_at` (kiritilgan sana).

| # | Obyekt | Atributlar | Bog'lanish |
|---|---|---|---|
| D1 | **Operator (Eksportyor)** | STIR, nomi, OKED, manzil, O3CI operator ID, mas'ul shaxslar | 1:N Inshoot, 1:N Eksport partiyasi, 1:N Foydalanuvchi |
| D2 | **Inshoot** | ID, nomi, GPS, UN/LOCODE, tarmoq, quvvat, O3CI installation ID, monitoring rejasi versiyasi | 1:N Jarayon, 1:N Emissiya manbai, 1:N O'lchov asbobi |
| D3 | **Ishlab chiqarish jarayoni** | tovar toifasi, production route, TIF TN kodlari, tizim chegarasi, AL (t/yil) | N:M Mahsulot, 1:N Manba oqimi, 1:N Prekursor iste'moli |
| D4 | **Manba oqimi (source stream)** | turi (yoqilg'i/xomashyo/mahsulot), usul (hisoblash/massa balansi/o'lchash), AD, NCV, EF, C, OF, CF, aniqlik darajasi (tier), **manba darajasi** (o'lchangan/lab/yetkazib beruvchi/standart) | 1:N Faoliyat ma'lumoti, N:1 Ma'lumotnoma versiyasi |
| D5 | **Emissiya manbai** | turi, o'lchash tizimi (CEMS), gaz turi (CO₂/N₂O/CF₄/C₂F₆) | 1:N CEMS o'lchovi |
| D6 | **O'lchov asbobi** | turi, seriya raqami, kalibrovka sanasi va sertifikati, noaniqlik | 1:N O'lchov yozuvi |
| D7 | **Faoliyat ma'lumoti** | davr (oy), qiymat, birlik, manba, noaniqlik, dalil hujjati, kiritgan shaxs, holat (haqiqiy/taxminiy/to'ldirilgan) | N:1 Manba oqimi |
| D8 | **Elektr va issiqlik oqimi** | MWh, TJ, manba (tarmoq/PPA/o'z generatsiyasi), EF, yo'nalish (import/eksport), η | N:1 Jarayon |
| D9 | **Prekursor iste'moli** | prekursor turi, miqdori M_p, yetkazib beruvchi inshoot, SEE_p, SEE turi (haqiqiy/standart) | N:1 Jarayon |
| D10 | **Mahsulot** | CN (8), TIF TN (10), tovar guruhi, prekursorlari | N:M Jarayon |
| D11 | **Importyor (EI)** | nomi, EORI, mamlakat, shartnomalar | 1:N Eksport partiyasi |
| D12 | **Eksport partiyasi** | bojxona deklaratsiyasi raqami, sana, TIF TN, netto og'irlik m_s, importyor (EORI), mamlakat, bog'langan jarayon | N:1 Mahsulot, N:1 Importyor |
| D13 | **Hisob natijasi** | davr, emissiyalar (dir/ind/prek), SEE, CBAM SEE, ishlatilgan ma'lumotnoma versiyalari, **hisob izi (JSON)**, holat (qoralama/topshirilgan/verifikatsiyalangan) | N:1 Inshoot/Jarayon, 1:1 Verifikatsiya |
| D14 | **Monitoring rejasi** | versiya, manba oqimlari bo'yicha usullar, hisoblagichlar, holat (qoralama/verifikatorda/tasdiqlangan) | N:1 Inshoot |
| D15 | **Soliq to'lovi** | davr, turi (yuqori/quyi oqim), summa UZS va USD, kurs, qaytarish, imtiyoz, byudjet kodi, to'lov holati | N:1 Operator/Inshoot |
| D16 | **Verifikatsiya** | verifikator, davr, topshiriq, so'rovlar, nomuvofiqliklar, tuzatishlar, xulosa, ERI imzo, sana | N:1 Hisob natijasi |
| D17 | **Verifikator** | akkreditatsiya (ISO 14065), muddati, tarmoqlar | 1:N Verifikatsiya |
| D18 | **Ma'lumotnoma** | kalit, qiymat, birlik, manba hujjati, valid_from/valid_to, versiya, holat (taklif/tasdiqlangan — ikki shaxs) | 1:N Hisob natijasi |
| D19 | **Dekarbonizatsiya / ITMO loyihasi** | BE, PE, LE, ER, ITMO ulushlari, reestr ID, davlat ishtiroki | N:1 Operator |
| D20 | **Hujjat (dalil)** | fayl, turi, xesh, OCR natijasi, ishonch darajasi | N:1 har qanday obyekt |
| D21 | **Audit yozuvi** | kim, qachon, nima, eski/yangi qiymat, IP; **xesh zanjiri** (o'zgartirib bo'lmaydi) | — |
| D22 | **SI xulosasi** | model, versiya, kirish, natija, asosiy omillar, tasdiqlagan shaxs | — |
| D23 | **Bildirishnoma** | qabul qiluvchi, turi, matn, holat | — |
| D24 | **Integratsiya jurnali** | tizim, yo'nalish, so'rov/javob, holat | — |

Birliklar: SI tizimi (t, TJ, MWh, t CO₂e), avtomatik konvertatsiya. Hisob ichida ≥ 6 o'nlik xona, hisobotda CBAM yaxlitlash qoidalari. Saqlash muddati: ma'lumot va dalillar ≥ 10 yil, xavfsizlik jurnallari ≥ 3 yil.

---

## 4. Hisob yadrosi — formulalar katalogi (`packages/core`)

Har bir formula alohida funksiya bo'ladi. U natija bilan birga **hisob izini** (kirish → formula → natija, ma'lumotnoma versiyasi) qaytaradi. Ustundagi "Test" — qabul sinovi uchun etalon qiymat.

### 4.1. Emissiyalar (TZ-2 5-bo'lim)

| ID | Formula | Izoh | Test |
|---|---|---|---|
| F-5.2 | `Em_comb = Σ AD_i · NCV_i · EF_i · OF_i` | OF standart 1. Milliy NCV/EF ustuvor | Ilova B: benzin 2 409 kg/m³, dizel 2 738, LPG 1 512, mazut 3 080, ko'mir 2 940 kg/t, gaz 2 128 kg/ming m³ |
| F-5.3a | `Em_proc = Σ AD_j · EF_j · CF_j` | CF standart 1 | — |
| F-5.3b | `Em_MB = 44/12 · (Σ_in AD_k·C_k − Σ_out AD_l·C_l)` | massa balansi (po'lat, alyuminiy, ammiak); 44/12 = 3,664 | — |
| F-5.3c | `EF_clk = 0,785·w_CaO + 1,092·w_MgO`; ma'lumot bo'lmasa 0,525 | + `Em_CKD` (TZ-1 7.3) | — |
| F-5.3d | `Em_CO2e = Em_CO2 + Em_N2O·GWP_N2O + Em_CF4·GWP_CF4 + Em_C2F6·GWP_C2F6` | GWP ma'lumotnomada | — |
| F-5.4 | `Em_CEMS = Σ_h c_h · V_h · 10⁻⁶` | N₂O (nitrat kislota) uchun majburiy | — |
| F-5.5a | `Em_el = E_el · EF_el` | EF tanlash tartibi: (a) to'g'ridan-to'g'ri ulanish yoki PPA → manba EF; (b) EK ning O'zbekiston uchun e'lon qilgan EF yoki Energetika vazirligi tasdiqlagan tarmoq EF | — |
| F-5.5b | `EF_el,own = Σ AD_i·NCV_i·EF_i / E_el,produced` | o'z generatsiyasi | — |
| F-5.6a | `Em_H = Q · EF_H`, `EF_H = Σ AD_i·NCV_i·EF_i / (Q_prod/η)` | jarayonlar o'rtasidagi issiqlik | — |
| F-5.6b | `AttrEm_dir = DirEm + Em_H,imp − Em_H,exp + WG_corr − Em_el,exp` | jarayonga taqsimlash | — |
| F-5.6c | `SEE_dir = AttrEm_dir / AL`, `SEE_ind = Em_el / AL` | oddiy tovar | — |
| F-5.6d | `SEE_g = (AttrEm_g + Σ_p M_p · SEE_p) / AL_g` | **rekursiv** prekursor zanjiri (ammiak → nitrat kislota → ammiakli selitra); siklni aniqlash | — |
| F-5.6e | `SEE_CBAM = SEE_dir + SEE_ind` (sement, o'g'it); `= SEE_dir` (po'lat, Al, H₂) | — | — |
| F-5.7 | `SEE_def(t) = DV_tot · (1 + mu_t)` | mu: sement/Al/H₂/po'lat 2026 10%, 2027 20%, 2028+ 30%; o'g'it har yili 1%. DV = "−" bo'lsa standart qiymat ishlatilmaydi + ogohlantirish | 2523 29 00: 1,41 → 2026 **1,551**, 2028 **1,833**; A.3: 2027 **1,692**, 1 000 t → EE **1 692** |
| F-5.8 | `EE_s = m_s · SEE_CBAM`; yillik `EE = Σ EE_s` (TIF, inshoot, importyor kesimida) | — | Ilova A.1 jadvali |
| F-5.9 | Ma'lumot sifati: manba darajasi; bo'shliq bo'lsa **eng yuqori oylik qiymat** bilan to'ldirish + belgi | to'liqlik tekshiruvi | — |

**Haqiqiy va standart qiymatni tanlash qoidasi (M4):** verifikatsiyalangan haqiqiy ma'lumot bo'lsa → haqiqiy SEE; bo'lmasa → F-5.7; DV yo'q bo'lsa → faqat haqiqiy ma'lumot bilan hisob, eksportyorga ogohlantirish. Har bir korxona uchun "haqiqiy va standart" farqi pulda ko'rsatiladi.

### 4.2. Uglerod narxi va CBAM (TZ-2 6-bo'lim, TZ-1 7.6–7.7)

| ID | Formula | Izoh | Test |
|---|---|---|---|
| F-6.1 | `P_UZS = P_USD · FX_t` | stavka: 2026–30 5 USD, 2031–35 10 USD gacha; kurs — byudjet qonunidagi | — |
| F-6.2a | `EF_f (t/t) = NCV_f (GJ/t) · EF_f (kg/GJ) / 1000` | yoqilg'i birligiga EF | A.4: benzin **3,26 t CO₂/t** |
| F-6.2b | `T_f (UZS/t) = P_USD · EF_f · FX` | yoqilg'i birligiga stavka | A.4: benzin 5 USD, 12 100 → **≈197 000 so'm/t**; dizel 10 000 l × 2,68 kg/l × 5 × 12 800 = **1 715 200 so'm** |
| F-6.2c | `Tax_up = Σ Q_f · T_f`; `R_t = Σ Em_f,t · P_t · k_comp,t · FX_t` | k_comp: 1-yil 0,90 → 5-yil 0,95 | — |
| F-6.2d | `P_impl,f = Excise_f / (FX · EF_f)` | amaldagi aksizning yashirin narxi. Ad valorem aksiz (gaz 12%) CBAM chegirmasiga kirmaydi, alohida ko'rsatiladi | AI-80: (375 000 + 700 000) / 12 100 / 3,26 ≈ **27 USD/t** |
| F-6.3a | `Tax_down,1 = Em_proc · P_UZ · FX` | 1-variant: faqat texnologik | — |
| F-6.3b | `Tax_down,2 = (Em_comb + Em_proc) · P_UZ · FX − Tax_up,paid` | 2-variant | — |
| F-6.3c | `Refund = Tax_up,paid · s_feed` | xomashyo sifatidagi yoqilg'i; standart 30% yonish / 70% texnologik | — |
| F-6.4 | `P_eff = Σ (Tax_j,paid − Rebate_j) / Em_covered`; `CP_g = SEE_cov · P_eff`; `s_cov = SEE_cov / SEE_CBAM` | CBAM 9-modda. Faqat yuqori oqim bo'lsa s_cov = yonish ulushi. TZ-1: `CP_g = P·(SEE_cov − FA_g) − R_g` (bepul kvotalar FA_g) | — |
| F-6.5a | `N_cert = Σ m_s·(SEE_CBAM − BM_g·CF_t) − Σ m_s·CP_g·FX_EUR / P_CBAM,t`; `Cost = max(0, N_cert) · P_CBAM,t` | aniq formula (BM ma'lum) | — |
| F-6.5b | `Cost_t = EE · P_ETS · (1 − CF_t)` | soddalashtirilgan ssenariy (BM noma'lum) | Ilova A.2 (9 qator) |
| F-6.5c | `R_UZ = Σ m_s · CP_g`; `Burden_total = R_UZ + Cost_CBAM` | O'zbekistonda qoladigan qism va umumiy yuk. Milliy soliq EI dagi samarali narxdan oshsa → **siyosat signali** | A.2: 2026 yuk 2,51 (CBAM 1,09) |
| F-6.6 | `CCI = SEE · P / p_g`; `RCCI = (SEE_firm − SEE_EU) · P / p_g` | ta'sirchanlik: talab ±5–10%, yig'iluvchanlik ±3–5 p.p., kurs, ETS 70/87/100/130 USD | — |
| F-6.7 | `ER_y = BE − PE − LE`; `ITMO_trade = 0,8·ER_ver`; `ITMO_buffer = 0,2·ER_ver` | PF-110. ITMO va CBAM SEE da **ikki marta hisoblash blokirovkasi** | — |

**CF_t jadvali (ma'lumotnoma):** 2026 0,975 · 2027 0,95 · 2028 0,90 · 2029 0,775 · 2030 0,515 · 2031 0,39 · 2032 0,265 · 2033 0,14 · 2034 0.

### 4.3. Qabul sinovlari uchun etalon to'plami (`tests/acceptance`)

- **A.1** (2025, 87 USD/t): O'zkimyoimpeks 301 163,1 t × 1,99 = 599 314,6 t → 52,14 mln; Farg'onaazot 209 454,5 × 2,40 = 502 690,8 → 43,73; Indorama 53 215,0 × 0,80 = 42 572,0 → 3,70; TMZ 1 581,6 × 3,21 = 5 076,9 → 0,44; jami 565 414,2 t, 1 149 654,3 t, 100,02 mln USD.
- **A.2** Farg'onaazot 2026–2034 (P_ETS 87, s_cov = 1):

  | Yil | EI samarali narx | CBAM yalpi | P_UZ | UZ to'lov | EI ga (chegirmadan keyin) | Umumiy yuk |
  |---|---|---|---|---|---|---|
  | 2026 | 2,18 | 1,09 | 5 | 2,51 | 0,00 | 2,51 |
  | 2027 | 4,35 | 2,19 | 5 | 2,51 | 0,00 | 2,51 |
  | 2028 | 8,70 | 4,37 | 5 | 2,51 | 1,86 | 4,37 |
  | 2029 | 19,57 | 9,84 | 5 | 2,51 | 7,33 | 9,84 |
  | 2030 | 42,20 | 21,21 | 5 | 2,51 | 18,70 | 21,21 |
  | 2031 | 53,07 | 26,68 | 10 | 5,03 | 21,65 | 26,68 |
  | 2032 | 63,95 | 32,14 | 10 | 5,03 | 27,12 | 32,14 |
  | 2033 | 74,82 | 37,61 | 10 | 5,03 | 32,58 | 37,61 |
  | 2034 | 87,00 | 43,73 | 10 | 5,03 | 38,71 | 43,73 |

  (EI ga = max(0, yalpi − UZ); yuk = max(yalpi, UZ). 2026–27 da yuk 1,4 va 0,3 mln ga oshadi → signal.)
- **A.3**, **A.4**, 5.7 misoli, dizel misoli, AI-80 yashirin narxi — yuqoridagi jadvallarda.
- **285 kod sinovi:** jadvaldagi har bir TIF kodi uchun 2026/2027/2028 mark-up to'g'ri qo'llanishi; "−" kodlarda standart qiymat taqiqlanishi.
- **Har bir tovar guruhiga ≥ 3 ta** qo'lda (Excel) hisoblangan misol (sement, o'g'it, alyuminiy, vodorod, po'lat) → jami ≥ 20. Farq ≤ 0,1%.
- MVP ning mavjud 14 testi yangi yadroga ko'chiriladi (qiymatlar yangi koeffitsientlarga moslanadi).

---

## 5. Funksional modullar (TZ-2 numeratsiyasi + TZ-1 FT talablari)

Muhimlik: **M** — majburiy (MVP/pilot), **Y** — yuqori (to'liq versiya), **O** — ixtiyoriy (keyingi bosqich).

### M1 — Ro'yxatdan o'tish va profil
- M1.1 OneID / ERI orqali kirish (dev: mock OAuth2 + lokal login) — M
- M1.2 STIR bo'yicha Soliq bazasidan avtomatik to'ldirish: rekvizitlar, OKED, mas'ul shaxslar (FT-1.1) — M
- M1.3 Inshoot kartochkasi: manzil, GPS, UN/LOCODE, quvvat, jarayonlar, emissiya manbalari (FT-1.2) — M
- M1.4 Jarayonlar va tizim chegaralari CBAM production route lari bo'yicha (FT-1.3) — M
- M1.5 Manba oqimlari va emissiya manbalarini ro'yxatga olish — M
- M1.6 Mahsulot katalogi: CN (8) ↔ TIF TN (10) moslik, tovar guruhi, prekursorlar (FT-1.4) — M
- M1.7 O3CI installation/operator ID ni bog'lash — M
- M1.8 EI importyorlari (EORI) va eksport shartnomalari reyestri (FT-1.6) — Y
- M1.9 Korxona ichidagi foydalanuvchilarni boshqarish (eksportyor administratori) — M

### M2 — Monitoring rejasi
- M2.1 Har bir manba oqimiga usul (hisoblash / massa balansi / o'lchash), parametr manbai, hisoblagich, aniqlik darajasi — M
- M2.2 Tarmoq shablonlari: o'g'it, po'lat, sement, alyuminiy, vodorod — M
- M2.3 Versiyalash, verifikatorga tasdiqlash uchun yuborish, holatlar (FT-1.5) — M
- M2.4 Yil boshida tasdiqlash (MRV sikli) — M

### M3 — Ma'lumot yig'ish
- M3.1 Qo'lda kiritish (veb-shakl) (FT-2.1) — M
- M3.2 Excel/CSV import — EI CBAM "Communication template" formatida (FT-2.1) — M
- M3.3 REST API orqali kiritish (FT-2.1) — M
- M3.4 ERP konnektorlari (1C, SAP): oylik yoqilg'i, xomashyo, mahsulot (FT-2.2) — Y
- M3.5 IoT/SCADA/CEMS: MQTT, OPC UA, ≥ 1 daqiqa chastota, ≥ 5 000 yozuv/s (FT-2.3) — Y
- M3.6 Laboratoriya natijalari (C ulushi, NCV, CaO/MgO) + kalibrovka sertifikatlari (FT-2.4) — M
- M3.7 Hujjat yuklash (hisob-faktura, dalolatnoma, lab bayonnomasi) + AI-1 bilan o'qish (FT-2.5) — Y
- M3.8 Har bir qiymat uchun: manba, sana, kiritgan shaxs, noaniqlik, dalil hujjati (FT-2.6) — M
- M3.9 Avtomatik validatsiya: birliklar, diapazonlar, massa balansi, davr uzluksizligi (FT-2.7) — M
- M3.10 Oylik davriylik; bo'shliqni konservativ to'ldirish + belgi (5.9) — M
- M3.11 Ma'lumot sifati indekslari: to'liqlik, o'z vaqtidaligi, izchillik (TZ-1 9) — M

### M4 — Emissiya hisoblash yadrosi
- M4.1 4-bo'limdagi barcha formulalar (F-5.2 … F-5.9) (FT-3.1, FT-3.2) — M
- M4.2 Jarayon va mahsulotlarga taqsimlash, SEE (FT-3.3) — M
- M4.3 Prekursor zanjirini rekursiv hisoblash; xarid qilingan prekursor: yetkazib beruvchi ma'lumoti yoki standart qiymat (FT-3.4) — M
- M4.4 Haqiqiy/standart tanlash qoidalari + mark-up (FT-3.7) — M
- M4.5 Har bir natija uchun hisob izi (audit trail) — M
- M4.6 Natija ↔ ishlatilgan ma'lumotnoma versiyalari bog'lanishi, istalgan vaqtda qayta tiklash (FT-3.5) — M
- M4.7 Qayta hisoblash va ikki versiyani solishtirish (FT-3.6) — M
- M4.8 Milliy MRV va CBAM uchun ikki xil chegaraviy hisob + farqlarni tushuntirish (FT-3.8) — Y
- M4.9 Bir korxona yillik hisobi ≤ 30 s — M

### M5 — Uglerod narxi va soliq
- M5.1 F-6.1 … F-6.4 formulalari — M
- M5.2 Stavkalarni davr bo'yicha saqlash, BHM ga bog'lash varianti (FT-4.1) — M
- M5.3 Uglerod soliqi deklaratsiyasi loyihasini tayyorlash (FT-7.3) — M
- M5.4 Soliq qo'mitasidan to'lov holatini olish (FT-4.2) — M
- M5.5 Qaytarish arizasi (s_feed) — Y
- M5.6 P_eff ni hisoblash va to'lov tasdiqlangach yangilash; CBAM 9-modda tasdiqlovchi hujjati (FT-4.3) — M
- M5.7 Yashirin uglerod narxi tahlili (aksiz), ad valorem aksizni alohida ko'rsatish — Y
- M5.8 Daromad prognozi k_comp bilan (Strategiya KPI ≥ 97% yig'iluvchanlik) — Y

### M6 — CBAM kalkulyatori va prognoz
- M6.1 F-6.5a/b/c — M
- M6.2 2026–2034 ssenariylari: EU ETS narxi, eksport hajmi, SEE kamayishi (FT-4.6) — M
- M6.3 Importyor kesimida to'lov — M
- M6.4 "Haqiqiy va standart" iqtisodiy samarasi — M
- M6.5 Eksport partiyasi bo'yicha prognoz: sertifikatlar, ETS, CF, chegirma, CBU kursi (FT-4.4) — M
- M6.6 ETS narxi (haftalik o'rtacha; 2026 da choraklik) va kurslarni avtomatik yangilash (FT-4.5) — Y
- M6.7 CCI/RCCI, ta'sirchanlik tahlili (F-6.6) — Y
- M6.8 Siyosat signali: milliy soliq EI samarali narxidan oshgan yillar — M

### M7 — Eksportyor hujjatlar paketi va hisobotlar
- M7.1 Soliq to'lovi tasdiqnomasi (summa, davr, yoqilg'i/jarayon, kurs) — M
- M7.2 EE hisoblash usuli tavsifi (hisob izidan avtomatik) — M
- M7.3 Verifikatsiya xulosasi ilovasi — M
- M7.4 O3CI havolasi — M
- M7.5 EI importyori uchun ma'lumot shabloni: CBAM Communication template (Excel + XML), xavfsiz havola orqali yuborish (FT-7.1) — M
- M7.6 QR-kodli, ERI bilan imzolangan PDF + XML/JSON — M
- M7.7 Inshootning yillik emissiya hisoboti va mahsulotlar bo'yicha SEE hisoboti (FT-7.2) — M
- M7.8 Hisobot shakllari: CBAM chorak/yillik ma'lumotnomasi; uglerod soliqi choraklik byulleteni (Strategiya 5.4); uglerod soliqi yillik hisoboti; "Birgalikda mavjudlik eslatmasi" (aksiz + uglerod soliqi, yoqilg'ilar bo'yicha) — M/Y
- M7.9 Milliy MRV va BTR (Parij) uchun agregatlar (FT-7.4) — Y
- M7.10 Formatlar: PDF, DOCX, XLSX; tillar: uz-Latn, uz-Cyrl, ru, en (FT-7.5) — M
- M7.11 Paketni ≤ 1 ish kunida shakllantirish (KPI) — M

### M8 — Verifikatsiya
- M8.1 Akkreditatsiyalangan verifikatorlar reyestri, eksportyor tomonidan tayinlash (FT-6.1) — M
- M8.2 Verifikator faqat tayinlangan inshoot va davrni "faqat o'qish" rejimida ko'radi; sampling, izohlar (FT-6.2) — M
- M8.3 Topshiriq → so'rovlar → nomuvofiqliklar → tuzatishlar → xulosa → ERI imzo (FT-6.3); ISO 14065 / 14064-3 oqimi — M
- M8.4 Masofaviy tashrif: hujjat va video yuklash (FT-6.4) — Y
- M8.5 Tasdiqlash yoki rad etish; tasdiqlangan natija qulflanadi — M

### M9 — Tahlil va panellar
- M9.1 Eksportyor paneli: SEE dinamikasi, benchmark va standart qiymat bilan taqqoslash, CBAM xarajati, CCI, ma'lumot to'liqligi indeksi (FT-8.1) — M
- M9.2 Davlat paneli: uglerod soliqi tushumi, CBAM xavfi (tarmoq, korxona, hudud, mahsulot kesimida), CBAM ta'siridagi eksport, verifikatsiyadan o'tganlar ulushi, NDC (YaIM birligiga emissiya, 2010 ga nisbatan) (FT-8.2) — M
- M9.3 Ochiq agregatsiyalangan panel (shaxsiy ma'lumotsiz; ≥ 3 korxona agregatsiyasi) — Y
- M9.4 Interaktiv xarita, filtrlar, yuklab olish (FT-8.3) — Y
- M9.5 Siyosat ssenariylari (stavka, ETS, texnologiya) — davlat va byudjet uchun — Y

### M10 — Ma'lumotnomalar va boshqaruv
- M10.1 Ma'lumotnomalar: TIF TN kodlari (~285), standart qiymatlar, mark-up, CF_t, GWP, NCV/EF, tarmoq EF, valyuta kurslari, soliq stavkalari, benchmarklar, BHM — versiya va amal qilish sanalari bilan — M
- M10.2 Uslubiyot qoidalari kodda emas, ma'lumotnomada; o'zgarish **ikki shaxs tasdig'i** bilan — M
- M10.3 Yangi tovar guruhlari va CN kodlarini konfiguratsiya orqali qo'shish (2028 dagi ~180 quyi zanjir mahsuloti) — Y
- M10.4 Rollar va huquqlar (8-bo'lim) — M
- M10.5 Bildirishnomalar: muddatlar (monitoring rejasi, yillik hisobot 31-mart, verifikatsiya 30-iyun, importyor 30-sentabr), anomaliyalar, chegaradan oshish, parametr o'zgarishi (FT-8.4) — M
- M10.6 Parametr (ETS, CF_t) o'zgarganda barcha prognozlarni qayta hisoblash (≤ 5 daq) + eksportyorlarga xabar — M

### Asosiy foydalanuvchi ssenariylari (E2E testlar)
- S1. Eksportyor yillik ma'lumotni yuklaydi → SI tekshiradi → yadro SEE ni hisoblaydi → verifikator tasdiqlaydi → hujjatlar paketi + O3CI eksporti.
- S2. Bojxona deklaratsiyasi keladi → partiya TIF kodi bo'yicha jarayonga bog'lanadi → EE_s va CBAM xarajati avtomatik hisoblanadi.
- S3. Soliq davri tugaydi → deklaratsiya loyihasi → to'lov tasdiqlanadi → P_eff yangilanadi.
- S4. IMV yangi ETS narxini yoki CF_t ni kiritadi → barcha prognozlar qayta hisoblanadi → bildirishnoma.

---

## 6. Sun'iy intellekt komponentlari

| TZ-2 | TZ-1 | Funksiya | Usul | Sifat mezoni | Muhimlik |
|---|---|---|---|---|---|
| AI-1 | AI-4 | Hujjatlarni o'qish (hisob-faktura, lab, hisoblagich akti) | OCR + LLM; uz-Latn, uz-Cyrl, ru, en | asosiy maydonlar ≥ 98%; ishonch past bo'lsa → qo'lda | Y |
| AI-2 | — | TIF TN kodi va CBAM toifasini tasniflash | tasniflagich + qoidalar | top-1 ≥ 95% | Y |
| AI-3 | AI-1 | Anomaliyalar: oylik SEE, solishtirma yoqilg'i sarfi, massa balansi, tarmoq o'rtachasidan og'ish | qoidalar + statistik nazorat kartalari + Isolation Forest / avtoenkoder | recall ≥ 90%, precision ≥ 70% (sintetik xatolar to'plamida) | M |
| AI-4 | — | Manbalarni moslashtirish: e-faktura, bojxona, energiya balansi, korxona ma'lumoti | avtomatik solishtirish, farq > 2% → signal | har oy avtomatik | Y |
| AI-5 | AI-2 | Bo'sh ma'lumotlarni to'ldirish | vaqt qatorlari / gradient boosting + konservativ qoida | MAPE ≤ 5%; "taxminiy" belgisi; verifikatsiyalanmagan qiymat CBAM hujjatiga kirmaydi; foydalanuvchi tasdig'i | Y |
| AI-6 | AI-3 | Emissiya va CBAM xarajati prognozi (1–5 yil) | ssenariy modeli + gradient boosting / vaqt qatorlari; ishonch oralig'i | MAPE ≤ 10% (orqaga sinov, 12 oy) | Y |
| AI-7 | AI-5 | Dekarbonizatsiya tavsiyalari | chora-tadbirlar kutubxonasi (energiya samaradorligi, N₂O katalizatori, yoqilg'i almashtirish, PPA, klinker koeffitsienti) → MACC: USD/t CO₂e va CBAM tejami, qoplash muddati | har bir tavsiya hisob-kitobi bilan; ekspert bahosi ≥ 80% "asosli" | Y |
| AI-8 | AI-6 | Normativ yordamchi (chat) | RAG: faqat tasdiqlangan hujjatlar (CBAM aktlari, PF-110, Strategiya, yo'riqnomalar) + foydalanuvchining ruxsat etilgan ma'lumotlari | manbasiz javob yo'q; test savollarida ≥ 90% to'g'ri; boshqa korxona ma'lumotiga kirish yo'q; uz/ru/en | O/Y |
| AI-9 | — | Risk-skoring (soliq va verifikatsiya tekshiruvlari uchun) | korxonalarni xavf bo'yicha saralash | har chorakda | Y |

**SI boshqaruvi:** modellar reyestri / model kartasi (versiya, o'qitish ma'lumotlari, sifat, cheklovlar, mas'ul shaxs); MLOps (o'qitish, validatsiya, joriy etish, rollback); tushuntiriluvchanlik (asosiy omillar, SHAP); drift monitoringi (oylik, har chorakda qayta baholash); "AI tavsiyasi" belgisi; inson tasdig'i va izi; benchmarklar faqat anonim va ≥ 3 korxona agregatsiyasida; ma'lumot va modellar O'zbekiston hududida, tashqi xizmatga faqat buyurtmachining yozma roziligi bilan.

---

## 7. Integratsiyalar

Har bir tizim uchun: adapter interfeysi + **mock server** (haqiqiy kirish olinguncha) + jurnal (D24). Idoralararo integratsiya platformasi orqali REST (OpenAPI 3.0).

| # | Tizim | Yo'nalish | Ma'lumot | Manba |
|---|---|---|---|---|
| I1 | EI CBAM Reestri / O3CI | chiqish | installation va emissiya ma'lumotlari EU XML/JSON sxemasida; importyorga havola | TZ-2 |
| I2 | Soliq qo'mitasi (e-faktura, deklaratsiya, STIR) | ikki tomonlama | rekvizitlar, yoqilg'i va elektr hajmlari, aksiz va uglerod soliqi qatorlari (ikki qatorli e-faktura), to'lov holati | ikkalasi |
| I3 | Bojxona qo'mitasi | kirish | eksport deklaratsiyalari: TIF TN, og'irlik, sana, mamlakat, importyor | ikkalasi |
| I4 | Moliya vazirligi g'aznachiligi (GFMIS) | kirish | uglerod soliqi tushumi byudjet kodlari bo'yicha | TZ-2 |
| I5 | Milliy uglerod birliklari reestri (PF-110) | ikki tomonlama | loyihalar, ER, ITMO, ikki marta hisoblash tekshiruvi | TZ-2 |
| I6 | Energetika vazirligi / elektr ta'minotchilari | kirish | tarmoq EF, yoqilg'i-energetika balansi, inshootlarning oylik elektr iste'moli | ikkalasi |
| I7 | Ekologiya vazirligi (milliy MRV, IG inventarizatsiyasi) | ikki tomonlama / chiqish | inshootlar ro'yxati, ruxsatnomalar; agregatsiyalangan emissiyalar (IPPU, Energetika) | ikkalasi |
| I8 | Markaziy bank | kirish | kunlik USD va EUR kurslari | ikkalasi |
| I9 | EU ETS narx manbai | kirish | auksion narxi (haftalik o'rtacha) | ikkalasi |
| I10 | OneID / ERI (E-IMZO) | kirish / ikki tomonlama | autentifikatsiya, elektron imzo | ikkalasi |
| I11 | Statistika agentligi | kirish | ishlab chiqarish hajmlari (tekshiruv uchun) | TZ-1 |
| I12 | Korxona ERP (1C, SAP), IoT/CEMS | kirish | faoliyat ma'lumotlari, o'lchovlar (REST, MQTT, OPC UA, SFTP) | TZ-1 |
| I13 | Xorijiy importyorlar | chiqish | CBAM kommunikatsiya shablonlari (xavfsiz havola, keyin API) | TZ-1 |

Integratsiya sinovi: har bir tizim bilan ≥ 100 ta haqiqiy yozuv almashinuvi.

---

## 8. Rollar va huquqlar (RBAC, eng kam huquq tamoyili)

| Rol | Huquqlar | Manba |
|---|---|---|
| Eksportyor administratori | korxona, inshootlar, foydalanuvchilarni boshqarish; monitoring rejasini tasdiqlash; hisobotni imzolash va yuborish; O3CI ga eksport | TZ-1, TZ-2 |
| Eksportyor mutaxassisi (ekolog, energetik) | ma'lumot kiritish, hisob, SI tavsiyalarini ko'rish, hisobot loyihasi | TZ-1 |
| Verifikator | faqat tayinlangan inshoot/davr (faqat o'qish), izoh, nomuvofiqlik, xulosa yuklash, tasdiqlash/rad etish; 2FA majburiy | ikkalasi |
| Xorijiy importyor (cheklangan) | faqat o'ziga yuborilgan tasdiqlangan CBAM ma'lumotlarini ko'rish va yuklab olish | TZ-1 |
| IMV (DNA, reestr) | ma'lumotnomalar va stavkalar, ITMO loyihalari, tahliliy panel | TZ-2 |
| Uslubiyot administratori | koeffitsiyentlar, standart qiymatlar, qoidalar — **ikki shaxs tasdig'i** bilan | TZ-1 |
| Soliq qo'mitasi | uglerod soliqi deklaratsiyasi, to'lovlarni moslashtirish, to'lov tasdiqnomasi | ikkalasi |
| Ekologiya vazirligi | MRV qoidalari, IG inventarizatsiyasi, NDC monitoringi | TZ-2 |
| Bojxona | eksport deklaratsiyalari bilan moslashtirish | TZ-2 |
| Energetika vazirligi | tarmoq EF, yoqilg'i balansi | TZ-2 |
| Davlat organi tahlilchisi | agregatlangan panel, ssenariylar, milliy hisobotlar | TZ-1 |
| Tizim administratori | texnik sozlamalar, monitoring; **biznes ma'lumotlarini o'zgartira olmaydi**; 2FA | TZ-1 |
| Jamoatchilik | ochiq agregatsiyalangan panel | TZ-2 |

Tijorat siri: korxona ma'lumotini faqat korxonaning o'zi, tayinlangan verifikator va qonunda belgilangan idoralar ko'radi. Davlat va ochiq panellarda faqat agregatlar.

---

## 9. Nofunksional va xavfsizlik talablari

| ID | Talab | Mezon |
|---|---|---|
| N1 | Joylashuv | O'zbekiston hududidagi davlat MM yoki sertifikatlangan bulut; zaxira MM ham O'zbekistonda |
| N2 | Ishlash | 2 000 tashkilot, 10 000 foydalanuvchi, 1 000 ta bir vaqtdagi sessiya; sahifalarning 95% i < 2 s; yillik hisob ≤ 30 s; barcha eksportyorlar ssenariysi ≤ 5 daq; IoT ≥ 5 000 yozuv/s |
| N3 | Mavjudlik | ≥ 99,5%; kunlik zaxira; RPO ≤ 1 soat, RTO ≤ 4 soat |
| N4 | Aniqlik | etalonga nisbatan ≤ 0,1%; hisob ichida ≥ 6 o'nlik xona |
| N5 | Versiyalash | har bir natija ma'lumotnoma versiyalariga bog'langan va qayta tiklanadi |
| N6 | Til | uz-Latn, uz-Cyrl, ru, en; matnlar lokalizatsiya fayllarida; EI importyori uchun ingliz shablonlari |
| N7 | Qulaylik | adaptiv veb + mobil; WCAG 2.1 AA |
| N8 | Ochiqlik | OpenAPI 3.0; JSON, XML, CSV |
| N9 | Texnologik mustaqillik | ochiq kodli texnologiyalar; Kubernetes; manba kodi va litsenziyalar buyurtmachiga |
| N10 | Masshtablanish | gorizontal (konteynerlar); yangi tovar guruhlari konfiguratsiya orqali |
| X1 | Autentifikatsiya | OneID + ERI; administratorlar va verifikatorlar uchun 2FA majburiy (boshqalar uchun ixtiyoriy) |
| X2 | Kirish nazorati | RBAC, eng kam huquq, korxona faqat o'z ma'lumotini ko'radi (tenant izolyatsiyasi) |
| X3 | Shifrlash | TLS 1.2+; saqlashda AES-256; kalitlarni boshqarish |
| X4 | Audit | o'zgartirib bo'lmaydigan audit izi (xesh zanjiri): kim, qachon, nima, eski/yangi qiymat; ≥ 10 yil |
| X5 | Jurnallar | xavfsizlik hodisalari, SIEM integratsiyasi, ≥ 3 yil |
| X6 | Ishlab chiqish | OWASP ASVS 4.0, 2-daraja; kutubxonalarni avtomatik zaiflik tekshiruvi (SCA), SAST |
| X7 | Sinov | ishga tushirishdan oldin kiberxavfsizlik ekspertizasi va penetratsion test; har yili takror |
| X8 | Qonunlar | shaxsga doir ma'lumotlar, kiberxavfsizlik, elektron hukumat qonunlari |

---

## 10. Hisobot va hujjat shakllari (to'liq ro'yxat)

1. Korxona (inshoot) yillik emissiya hisoboti
2. Mahsulotlar bo'yicha SEE hisoboti
3. CBAM chorak/yillik ma'lumotnomasi (EI importyori uchun)
4. EI CBAM Communication template (Excel + XML)
5. O3CI eksporti (XML/JSON)
6. Eksportyor hujjatlar paketi (QR + ERI imzoli PDF + XML/JSON): soliq tasdiqnomasi, EE usuli tavsifi, verifikatsiya xulosasi, O3CI havolasi, importyor shabloni
7. CBAM 9-modda bo'yicha to'langan narx tasdiqnomasi
8. Uglerod soliqi deklaratsiyasi loyihasi
9. Uglerod soliqi choraklik byulleteni
10. Uglerod soliqi yillik hisoboti
11. "Birgalikda mavjudlik eslatmasi" (aksiz + uglerod soliqi)
12. Qaytarish arizasi (s_feed)
13. Verifikatsiya xulosasi
14. Milliy MRV hisoboti va BTR agregatlari
15. Davlat paneli eksportlari (CSV/XLSX)

---

## 11. Ishlab chiqish bosqichlari (kod yozish tartibi)

TZ bosqichlariga moslik: **TZ-2 2-bosqich (MVP va pilot, 2027 fev–iyun) = R0–R7**, **3-bosqich (iyul–sen) = R8–R13**, **4-bosqich (okt–dek) = R14–R17**, **5-bosqich (2028+) = R18**. TZ-1 talab qilgan MVP tarkibi (M6 verifikatsiya, CBAM shabloni, eksportyor paneli, anomaliyalar) ham R0–R10 ichiga kiradi.

| Bosqich | Mazmun | Natija / yopish mezoni |
|---|---|---|
| **R0. Tayyorgarlik** | git init; monorepo (npm workspaces), TypeScript, ESLint/Prettier, test runner; joriy MVP → `legacy/`; CI skripti; texnik qarzlar ro'yxati (1.2) | `npm test` yashil, legacy ishlaydi |
| **R1. Ma'lumotnomalar va MB** | PostgreSQL sxemasi (D1–D24), migratsiyalar, bitemporal ma'lumotnomalar, audit (xesh zanjiri), TIF xlsx importeri (~285 kod), Ilova B, CF_t, GWP, mark-up, stavkalar, kurslar | 285 kod yuklangan; audit yozuvi o'zgartirilsa aniqlanadi |
| **R2. Hisob yadrosi (M4)** | F-5.2 … F-5.9, prekursor rekursiyasi, haqiqiy/standart tanlash, hisob izi, versiyaga bog'lash | A.1, A.3, 5.7 misollari, 285 kod mark-up sinovi o'tadi |
| **R3. Narx va CBAM (M5 hisob qismi, M6)** | F-6.1 … F-6.6, 2026–2034 ssenariylari, siyosat signali, ta'sirchanlik | A.2 (9 qator), A.4, dizel, AI-80 sinovlari ≤ 0,1% |
| **R4. Autentifikatsiya va rollar (M10.4, M1.1)** | lokal login + TOTP 2FA, OneID mock, 13 rol, tenant izolyatsiyasi | boshqa korxona ma'lumotiga kirish testlari rad etiladi |
| **R5. M1 + M2** | operator/inshoot/jarayon/manba oqimi/mahsulot/importyor; STIR avto-to'ldirish (mock); monitoring rejasi shablonlari va versiyalari | inshootni to'liq ro'yxatdan o'tkazish E2E |
| **R6. M3 ma'lumot yig'ish** | veb-shakllar (oylik), Excel/CSV import (Communication template), API, dalil yuklash, validatsiya, konservativ to'ldirish, sifat indekslari | 2025 yil pilot ma'lumotini import qilib, hisob etalonga mos keladi |
| **R7. Frontend yadrosi** | React ilova, i18n (4 til), eksportyor paneli (M9.1), hisob izi ko'rinishi, ma'lumotnomalar UI (ikki shaxs tasdig'i) | WCAG avtomatik tekshiruvi, mobil ko'rinish |
| **R8. AI-3, AI-5, AI-4** | Python xizmati, qoidalar + Isolation Forest, sintetik xatolar to'plami, gap-fill modeli, moslashtirish (mock manbalar) | recall ≥ 90%, precision ≥ 70%, MAPE ≤ 5% |
| **R9. M8 verifikatsiya** | verifikatorlar reyestri, tayinlash, faqat o'qish kirishi, so'rov/nomuvofiqlik/tuzatish, xulosa, mock ERI imzo, natijani qulflash | S1 ssenariysi verifikatsiyagacha |
| **R10. M7 hujjatlar va hisobotlar** | 10-bo'limdagi shakllar: PDF (QR, imzo), DOCX, XLSX, XML/JSON, importyorga xavfsiz havola | paket ≤ 1 ish kuni (amalda soniyalar), S1 to'liq |
| **R11. M5 soliq ish oqimi** | deklaratsiya loyihasi, to'lov holati (mock), qaytarish arizasi, P_eff yangilash, byulletenlar, yashirin narx, k_comp | S3 ssenariysi |
| **R12. Integratsiyalar** | I1–I13 adapterlari + mock serverlar + jurnal; CBU va ETS uchun real ochiq manbalar | har biriga ≥ 100 yozuv almashinuvi (mockda) |
| **R13. Bojxona oqimi va M6 to'liq** | partiya → jarayon bog'lash → EE_s, importyor kesimi | S2 ssenariysi |
| **R14. M9 davlat va ochiq panellar** | tushum, CBAM xavfi, NDC, xarita, ≥ 3 korxona agregatsiyasi, ssenariylar | tijorat siri testlari |
| **R15. AI-1, AI-2, AI-6, AI-7, AI-8, AI-9** | OCR + LLM (lokal), TIF tasniflagich, prognoz, MACC kutubxonasi, RAG (manba havolasi bilan), risk-skoring; modellar reyestri, drift | 6-bo'lim mezonlari |
| **R16. ITMO / PF-110 (F-6.7)** | loyihalar, ER, 80/20, reestr bilan almashinuv, ikki marta hisoblash blokirovkasi | blokirovka testi |
| **R17. Bildirishnomalar, NFR, joylashtirish** | MRV muddatlari, parametr o'zgarishi → qayta hisob (≤ 5 daq) → xabar; yuklama sinovi; ASVS L2, SAST/SCA; zaxira; Docker, Helm; kuzatuv | 9-bo'lim mezonlari, S4 ssenariysi |
| **R18. Qabul paketi va hujjatlar** | sinov dasturi va bayonnomalari, qo'llanmalar (har bir rol, uz/ru), administrator va o'rnatish qo'llanmasi, API hujjatlari, model kartalari, xavfsizlik siyosati va tahdidlar modeli, 3 tilda o'quv materiallari | 12-bo'lim |
| **R19. Rivojlantirish (2028+)** | quyi oqim soliq variantlari (6.3) to'liq, ETS ga tayyorgarlik, yangi CBAM tovarlari (~180), korporativ uglerod izi (GHG Protocol, ISO 14064-1) CBAM dan tashqari korxonalar uchun, milliy koeffitsientlar, "Green Building Material – Uzbekistan" belgisi mezoni (PPT) | yillik reja |

---

## 12. Topshiriladigan natijalar va qabul tartibi

**Topshiriladi:** manba kodi va litsenziyalar (mulk huquqi buyurtmachiga); texnik loyiha (arxitektura, ma'lumotlar modeli, integratsiya spetsifikatsiyalari); hisob uslubiyoti ma'lumotnomasi (formulalar, koeffitsientlar, manbalar, versiyalar); API hujjatlari (OpenAPI); foydalanuvchi qo'llanmalari (har bir rol); administrator va o'rnatish qo'llanmalari; sinov dasturi va bayonnomalari; SI model kartalari va MLOps reglamenti; axborot xavfsizligi siyosati va tahdidlar modeli; 3 tilda o'quv materiallari (≥ 100 foydalanuvchi); o'rnatish paketlari.

**Qabul sinovlari:**
1. Hisob: Ilova A + har bir guruhga ≥ 3 etalon (jami ≥ 20), farq ≤ 0,1%.
2. Standart qiymatlar: 285 kod × 2026/2027/2028 mark-up.
3. Integratsiya: har bir tizim bilan ≥ 100 yozuv.
4. SI: 6-bo'lim mezonlari, ajratilgan sinov to'plamida.
5. Yuklama va xavfsizlik: 9-bo'lim (penetratsion test, ekspertiza).
6. Tajriba ekspluatatsiyasi: pilot korxonalarda ≥ 2 oy; pilotlar va verifikatorning ijobiy xulosasi.
7. Qabul komissiyasi: IMV (rais), Ekologiya, Soliq, Bojxona, Energetika, pilot korxonalar.

**KPI (platformada o'lchanadi va panelda ko'rsatiladi):** ro'yxatdan o'tish 100% (6 oy / 2027 oxiri); haqiqiy ma'lumot bilan qoplangan eksport ≥ 70% (2027), ≥ 80–90% (2028); qo'lda tekshiruv bilan farq ≤ 1%; paket ≤ 1 ish kuni; hisobot tayyorlash vaqti −50%; uglerod soliqi yig'iluvchanligi ≥ 97%; mavjudlik ≥ 99,5%; har yili e'lon qilinadi: CBAM bo'yicha chegirilgan summa, byudjetga tushum, tavsiyalar bilan kamaytirilgan emissiya, verifikatsiyadagi nomuvofiqliklar dinamikasi.

**MRV sikli (bildirishnomalar uchun):** monitoring rejasi (yil boshi) → oylik yig'ish → SI tekshiruvi → yillik hisobot (31-mart) → verifikatsiya (30-iyun) → paket va O3CI → importyor deklaratsiyasi (30-sentabr; 2026 importi uchun 2027-09-30). CBAM sertifikatlari sotuvi 2027-02-01 dan.

---

## 13. Ochiq savollar va kerakli ma'lumotlar

| # | Savol / yetishmayotgan narsa | Nima uchun kerak | Vaqtincha yechim |
|---|---|---|---|
| Q1 | **`CBAM_TIF_codes_for_UZB_updated.xlsx`** va **`Emission_factors_UZB-EU_directive.xlsx`** papkada yo'q | ~285 kod, standart qiymatlar, mark-up (R1, qabul sinovi 2) | TZ-2 4-bo'lim jadvalidagi misol qiymatlar bilan boshlash |
| Q2 | 2025-yil CBAM eksport jadvali va 2026–2034 to'lovlar jadvali (A.1 manbai) | etalon sinovlar | A.1/A.2 raqamlari TZ dan olinadi |
| Q3 | CBAM benchmarklari (BM_g) TIF kodi bo'yicha | F-6.5a aniq formula | BM noma'lum bo'lsa F-6.5b (soddalashtirilgan) |
| Q4 | 2026 uchun milliy tarmoq EF (Energetika vazirligi) — TZ da ochiq | bilvosita emissiya | MVP dagi 0,50 t/MWh parametr sifatida |
| Q5 | EI qo'llaydigan GWP qiymatlari (N₂O 265, CF₄ 6 630, C₂F₆ 11 100 — AR5) tasdig'i | F-5.3d | AR5 qiymatlari |
| Q6 | P_CBAM valyutasi: A.2 USD (87), 6.5 EUR | izchillik | ikkala valyuta + FX_EUR/USD |
| Q7 | 2031–2035 stavka yo'li ("10 USD gacha bosqichma-bosqich"), A.2 da esa 10 o'zgarmas | prognoz | yillar bo'yicha jadval-parametr, standart A.2 ga mos |
| Q8 | Yoqilg'i koeffitsientlari: Ilova B yoki IPCC NCV (gaz 2,128 va 1,924 t/ming m³) | yoqish emissiyalari | ikkala versiya, standart Ilova B |
| Q9 | **Texnologiya steki va joylashtirish** (2.2) — PostgreSQL ni lokal o'rnatish mumkinmi | R0–R1 | — |
| Q10 | LLM: TZ tijorat sirini tashqariga yuborishni taqiqlaydi. Dev da Claude API (anonimlashtirilgan) + prod da lokal model — rozimisiz? | AI-1, AI-7, AI-8 | provayder abstraksiyasi |
| Q11 | OneID, E-IMZO, Soliq, Bojxona, O3CI ga test kirishi | R4, R12 | mock serverlar |
| Q12 | s_feed qonuniy standart ulushi (WB misoli 30/70) | F-6.3c | 30/70 parametr |
| Q13 | Pilot korxonalarning haqiqiy monitoring ma'lumotlari (O'zkimyoimpeks, Farg'onaazot, Indorama, TMZ) | R6 sinovi | sintetik ma'lumotlar |
| Q14 | Em_CKD (sement pechi changi) hisob usuli va WG_corr (chiqindi gazlar) qoidalari tafsiloti | F-5.3c, F-5.6b | parametr sifatida qo'lda kiritish |

---

## 14. MVP dan maqsadli tizimga o'tish xaritasi

| MVP qismi | Taqdiri |
|---|---|
| `calc.js` yoqish, sement, N₂O, bilvosita, SEE | `packages/core` ga TS da ko'chiriladi, ma'lumotnoma versiyalariga ulanadi |
| `calc.js` CBAM (tarmoq defSee, umumiy mark-up, klinker-benchmark) | F-5.7 (TIF bo'yicha) va F-6.5a/b bilan almashtiriladi |
| `analyze()` qoidalari (klinker koeff., GJ/t, kVt·soat/t, SEE z-score) | AI-3 ning qoidalar qatlamiga ko'chiriladi |
| `forecast()` chiziqli trend | AI-6 ning bazaviy modeli (taqqoslash uchun) |
| `server.js` JSON ombor | PostgreSQL + Fastify; namuna `seed.json` sintetik pilot ma'lumotlariga aylantiriladi |
| AI proksi (Anthropic) | LLM provayder abstraksiyasi (Q10) |
| UI bo'limlari (7 ta) | React: M1, M3, M4/M6, M9, M7, M10 ga bo'linadi |
| 14 ta test | yangi yadro testlariga ko'chiriladi + etalonlar |
| `UzCarbon MVP.html` | `legacy/` (tarix uchun) |

---

## 15. Nazorat ro'yxati (izlanuvchanlik matritsasi)

Bajarilganda `[x]`. Ustunlar: talab → bosqich.

**Hisob yadrosi va narx (R2–R3, R16)**
- [ ] F-5.2 · [ ] F-5.3a · [ ] F-5.3b · [ ] F-5.3c (+CKD) · [ ] F-5.3d · [ ] F-5.4 · [ ] F-5.5a · [ ] F-5.5b · [ ] F-5.6a · [ ] F-5.6b · [ ] F-5.6c · [ ] F-5.6d (rekursiv) · [ ] F-5.6e · [ ] F-5.7 · [ ] F-5.8 · [ ] F-5.9
- [ ] F-6.1 · [ ] F-6.2a · [ ] F-6.2b · [ ] F-6.2c · [ ] F-6.2d · [ ] F-6.3a · [ ] F-6.3b · [ ] F-6.3c · [ ] F-6.4 · [ ] F-6.5a · [ ] F-6.5b · [ ] F-6.5c · [ ] F-6.6 · [ ] F-6.7
- [ ] Etalonlar: A.1 · A.2 · A.3 · A.4 · 5.7 misoli · dizel · AI-80 · 285 kod · har bir guruhga ≥ 3 (sement, o'g'it, Al, H₂, po'lat)

**Modullar**
- M1 (R4–R5): [ ] 1.1 · [ ] 1.2 · [ ] 1.3 · [ ] 1.4 · [ ] 1.5 · [ ] 1.6 · [ ] 1.7 · [ ] 1.8 · [ ] 1.9
- M2 (R5): [ ] 2.1 · [ ] 2.2 · [ ] 2.3 · [ ] 2.4
- M3 (R6, R8, R12): [ ] 3.1 · [ ] 3.2 · [ ] 3.3 · [ ] 3.4 · [ ] 3.5 · [ ] 3.6 · [ ] 3.7 · [ ] 3.8 · [ ] 3.9 · [ ] 3.10 · [ ] 3.11
- M4 (R2): [ ] 4.1 · [ ] 4.2 · [ ] 4.3 · [ ] 4.4 · [ ] 4.5 · [ ] 4.6 · [ ] 4.7 · [ ] 4.8 · [ ] 4.9
- M5 (R3, R11): [ ] 5.1 · [ ] 5.2 · [ ] 5.3 · [ ] 5.4 · [ ] 5.5 · [ ] 5.6 · [ ] 5.7 · [ ] 5.8
- M6 (R3, R13): [ ] 6.1 · [ ] 6.2 · [ ] 6.3 · [ ] 6.4 · [ ] 6.5 · [ ] 6.6 · [ ] 6.7 · [ ] 6.8
- M7 (R10): [ ] 7.1 · [ ] 7.2 · [ ] 7.3 · [ ] 7.4 · [ ] 7.5 · [ ] 7.6 · [ ] 7.7 · [ ] 7.8 · [ ] 7.9 · [ ] 7.10 · [ ] 7.11
- M8 (R9): [ ] 8.1 · [ ] 8.2 · [ ] 8.3 · [ ] 8.4 · [ ] 8.5
- M9 (R7, R14): [ ] 9.1 · [ ] 9.2 · [ ] 9.3 · [ ] 9.4 · [ ] 9.5
- M10 (R1, R4, R17): [ ] 10.1 · [ ] 10.2 · [ ] 10.3 · [ ] 10.4 · [ ] 10.5 · [ ] 10.6
- Ssenariylar: [ ] S1 · [ ] S2 · [ ] S3 · [ ] S4

**TZ-1 FT talablari → yangi joyi**
- [ ] FT-1.1→M1.2 · [ ] FT-1.2→M1.3 · [ ] FT-1.3→M1.4 · [ ] FT-1.4→M1.6 · [ ] FT-1.5→M2.3 · [ ] FT-1.6→M1.8
- [ ] FT-2.1→M3.1–3.3 · [ ] FT-2.2→M3.4 · [ ] FT-2.3→M3.5 · [ ] FT-2.4→M3.6 · [ ] FT-2.5→M3.7 · [ ] FT-2.6→M3.8 · [ ] FT-2.7→M3.9
- [ ] FT-3.1/3.2→M4.1 · [ ] FT-3.3→M4.2 · [ ] FT-3.4→M4.3 · [ ] FT-3.5→M4.6, M10.1 · [ ] FT-3.6→M4.7 · [ ] FT-3.7→M4.4 · [ ] FT-3.8→M4.8
- [ ] FT-4.1→M5.2 · [ ] FT-4.2→M5.4 · [ ] FT-4.3→M5.6 · [ ] FT-4.4→M6.5 · [ ] FT-4.5→M6.6 · [ ] FT-4.6→M6.2, M9.5
- [ ] FT-5.1→AI-3 · [ ] FT-5.2→AI-5 · [ ] FT-5.3→AI-6 · [ ] FT-5.4→AI-1 · [ ] FT-5.5→AI-7 · [ ] FT-5.6→AI-8
- [ ] FT-6.1→M8.1 · [ ] FT-6.2→M8.2 · [ ] FT-6.3→M8.3 · [ ] FT-6.4→M8.4 · [ ] FT-6.5→X4
- [ ] FT-7.1→M7.5 · [ ] FT-7.2→M7.7 · [ ] FT-7.3→M5.3 · [ ] FT-7.4→M7.9 · [ ] FT-7.5→M7.10
- [ ] FT-8.1→M9.1 · [ ] FT-8.2→M9.2 · [ ] FT-8.3→M9.4 · [ ] FT-8.4→M10.5

**SI (R8, R15):** [ ] AI-1 · [ ] AI-2 · [ ] AI-3 · [ ] AI-4 · [ ] AI-5 · [ ] AI-6 · [ ] AI-7 · [ ] AI-8 · [ ] AI-9 · [ ] modellar reyestri · [ ] drift · [ ] tushuntiriluvchanlik · [ ] mahalliylashtirish

**Integratsiyalar (R12):** [ ] I1 · [ ] I2 · [ ] I3 · [ ] I4 · [ ] I5 · [ ] I6 · [ ] I7 · [ ] I8 · [ ] I9 · [ ] I10 · [ ] I11 · [ ] I12 · [ ] I13

**NFR va xavfsizlik (R17):** [ ] N1 · [ ] N2 · [ ] N3 · [ ] N4 · [ ] N5 · [ ] N6 · [ ] N7 · [ ] N8 · [ ] N9 · [ ] N10 · [ ] X1 · [ ] X2 · [ ] X3 · [ ] X4 · [ ] X5 · [ ] X6 · [ ] X7 · [ ] X8

**Hisobot shakllari (R10–R11):** [ ] 1 · [ ] 2 · [ ] 3 · [ ] 4 · [ ] 5 · [ ] 6 · [ ] 7 · [ ] 8 · [ ] 9 · [ ] 10 · [ ] 11 · [ ] 12 · [ ] 13 · [ ] 14 · [ ] 15

**Texnik qarz (R0–R3):** [ ] 1.2-1 nusxa yadro · [ ] 1.2-2 raqamlar · [ ] 1.2-3 natTax/chegirma · [ ] 1.2-4 TIF defSee/mark-up · [ ] 1.2-5 klinker-benchmark · [ ] 1.2-6 versiyalash · [ ] 1.2-7 auth/audit/verified · [ ] 1.2-8 prekursor · [ ] 1.2-9 partiya · [ ] 1.2-10 AI ma'lumot oqimi · [ ] 1.2-11 formatlar/yillar

**Topshiriladigan hujjatlar (R18):** [ ] texnik loyiha · [ ] uslubiyot ma'lumotnomasi · [ ] OpenAPI · [ ] qo'llanmalar (rollar, uz/ru) · [ ] admin/o'rnatish · [ ] sinov dasturi va bayonnomalar · [ ] model kartalari, MLOps · [ ] xavfsizlik siyosati, tahdidlar modeli · [ ] o'quv materiallari (3 til)
