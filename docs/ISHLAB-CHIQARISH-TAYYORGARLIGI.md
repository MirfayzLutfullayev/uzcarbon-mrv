# UZ-Carbon MRV — sanoat ekspluatatsiyasiga o'tish uchun nimalar kerak

> Hujjat sanasi: 2026-10-21. Baholangan versiya: v0.2 (prototip, 74 fayl, ~8 000 qator kod, 38 ta avtomatik test).
> Asos: texnik topshiriq TZ-2 (16.10.2026), ko'p agentli muvofiqlik auditi (`docs/audit-tz2-2026-10-19.json`) va joriy kod holati (`REJA.md`, 15-bo'lim).

## 1. Qisqacha xulosa

Hozirgi versiya — **ishlaydigan prototip**: hisoblash uslubiyoti to'liq yozilgan va texnik topshiriqdagi etalon misollarga mos (Ilova A, farq 0,1% dan kam), interfeys barcha rollar uchun tayyor, hujjatlar paketi shakllanadi.

Bu **hali ishlab chiqarish tizimi emas**. Sanoat ekspluatatsiyasiga o'tish uchun to'rtta yo'nalishda ish kerak:

| Yo'nalish | Holati | Izoh |
|---|---|---|
| Hisoblash uslubiyoti | **80% tayyor** | Formulalar va etalonlar ishlaydi; ma'lumotnoma to'ldirilishi kerak |
| Ma'lumotlar va integratsiyalar | **15% tayyor** | 13 ta tashqi tizimdan 1 tasi real ulangan |
| Infratuzilma va xavfsizlik | **30% tayyor** | Prototip darajasida; masshtab va sertifikatlash yo'q |
| Tashkiliy jarayonlar | **0%** | Buyurtmachi, uslubiyot tasdig'i, verifikatorlar, o'qitish |

Eng qisqa javob: **texnik ish hajmi taxminan 18–26 odam-oy**, bunga tashkiliy jarayonlar va davlat tizimlariga ulanish muddatlari qo'shilmagan.

---

## 2. Birinchi navbatda: aniqlangan nuqsonlar

Mustaqil audit ikkita **jiddiy** xatolikni tasdiqladi. Ular hisob natijasiga va rasmiy hujjatga ta'sir qiladi, shuning uchun boshqa ishdan oldin tuzatilishi kerak.

| # | Nuqson | Oqibati | Ish hajmi |
|---|---|---|---|
| **D1** | Soliq qo'mitasi tasdiqlamagan to'lov ham CBAM chegirmasiga kiritiladi | Eksportyor o'zi kiritgan to'lov CBAM to'lovini noldan ko'rsatishi va muhrlangan paketda rasmiy tasdiqnoma sifatida chiqishi mumkin | 2–3 kun |
| **D2** | Verifikatsiyadan o'tgan haqiqiy ma'lumot hujjatlar paketiga tushmaydi | Verifikatsiya tugagach ham paketda standart qiymat qoladi; eksportyor haqiqiy ma'lumot foydasini yo'qotadi | 3–5 kun |

Qo'shimcha, kichikroq kamchiliklar: standart qiymatli prekursorda to'g'ridan-to'g'ri va bilvosita ulush ajratilmaydi; Statistika agentligi roli va YaIM ma'lumoti yo'qligi sababli NDC ko'rsatkichi hisoblanmaydi.

**Eslatma:** audit sessiya cheklovi tufayli 17 ta tekshiruvdan 11 tasi bilan yakunlandi. TZ-2 ning 5, 6, 8, 9 va 10-bo'limlari bo'yicha tekshiruv **to'liq emas** — ishni boshlashdan oldin uni yakunlash tavsiya etiladi (taxminan 1 hafta).

---

## 3. Ma'lumotlar: hisobning aniqligi shularga bog'liq

Hozir hisob **misol qiymatlar** bilan ishlaydi. Rasmiy hisob-kitob uchun quyidagilar kerak:

| Nima kerak | Kimdan | Holati | Ta'siri |
|---|---|---|---|
| TIF TN kodlari jadvali, ~285 qator (`CBAM_TIF_codes_for_UZB_updated.xlsx`) | Buyurtmachi / EI aktlari | **Yo'q** — hozir 14 ta misol kod | Standart qiymat va mark-up to'g'ri qo'llanishi |
| CBAM benchmarklari (BM_g) | Yevropa Komissiyasi aktlari | **Yo'q** | Aniq formula (F-6.5a) o'rniga soddalashtirilgan formula ishlatilmoqda |
| Milliy tarmoq emissiya koeffitsiyenti | Energetika vazirligi | **Yo'q** — taxminiy 0,50 t/MWh | Sement va o'g'itlarda bilvosita emissiya |
| Milliy NCV va EF koeffitsiyentlari (tabiiy gaz tarkibi) | Ekologiya vazirligi | **Yo'q** — IPCC standart qiymatlari | Yoqish emissiyalari aniqligi |
| GWP qiymatlari tasdig'i (N₂O, CF₄, C₂F₆) | EI amaldagi qoidalari | Taxminiy (AR5) | O'g'it va alyuminiy hisobida |
| Xomashyo yoqilg'isi ulushi (s_feed) | Soliq kodeksi loyihasi | Taxminiy 30/70 | Qaytarish summasi |

Import vositasi tayyor: jadval berilsa, "Ma'lumotnomalar" bo'limi orqali yuklanadi va ikkinchi shaxs tasdig'idan o'tadi. **Ish hajmi: 1–2 hafta** (jadvallar olingach).

---

## 4. Integratsiyalar: eng uzoq va eng bog'liq qism

Texnik topshiriq 13 ta tashqi tizim bilan ulanishni talab qiladi. Hozirgi holat:

| Tizim | Holati | Nima kerak |
|---|---|---|
| Markaziy bank (valyuta kursi) | **Ishlaydi** | — |
| EI CBAM reestri / O3CI | XML shakllanadi, ulanish yo'q | Rasmiy XSD, operator hisobi, sinov muhiti |
| Soliq qo'mitasi (e-faktura, to'lov holati) | Sinov (mock) | Idoralararo integratsiya platformasi orqali kirish, shartnoma |
| Bojxona qo'mitasi (eksport deklaratsiyalari) | Qo'lda / CSV | API kirish |
| OneID va ERI (elektron imzo) | **Yo'q** — vaqtincha parol va TOTP | Rasmiy ulanish; imzo hozir server kaliti bilan taqlid qilinadi |
| Milliy uglerod birliklari reestri | Sinov jurnali | IMV bilan kelishuv |
| G'aznachilik (GFMIS) | Yo'q | Byudjet kodlari bo'yicha tushum |
| Energetika vazirligi | Rol orqali qo'lda | Avtomatik almashinuv |
| Ekologiya vazirligi (IG inventarizatsiyasi) | Yo'q | Agregatlangan hisobot uzatish |
| Statistika agentligi | Yo'q | YaIM ma'lumoti (NDC ko'rsatkichi uchun) |
| EU ETS narx manbai | Qo'lda kiritiladi | Litsenziyalangan manba |
| Korxona ERP (1C, SAP) | Yo'q | Konnektorlar |
| IoT / CEMS (MQTT, OPC UA) | CSV orqali | Real vaqt oqimi |

Har bir tizim uchun: kirish olish → spetsifikatsiya → ishlab chiqish → sinov (TZ bo'yicha kamida 100 ta yozuv almashinuvi).

**Ish hajmi: 6–9 odam-oy.** Bunda eng katta xavf — texnik emas, **tashkiliy**: davlat tizimlariga kirish olish oylab cho'zilishi mumkin. Buni eng erta boshlash kerak.

---

## 5. Infratuzilma: keng miqyosda ishlash uchun

Texnik topshiriq talablari va hozirgi holat:

| Talab (TZ-2, 10-bo'lim) | Hozir | Nima qilish kerak |
|---|---|---|
| 2 000 tashkilot, 10 000 foydalanuvchi, 1 000 bir vaqtda | Sinovdan o'tmagan | Yuklama sinovi, optimallashtirish |
| Ma'lumotlar bazasi | SQLite (bitta fayl) | **PostgreSQL ga ko'chirish** — bir nechta nusxa ishlashi uchun shart |
| Gorizontal masshtab, Kubernetes | Bitta jarayon | Konteyner, Helm, avtomatik masshtab |
| Yillik hisob ≤ 30 s, ssenariy qayta hisobi ≤ 5 daqiqa | O'lchanmagan | Fon ishlari navbati, indekslar, kesh |
| Mavjudlik ≥ 99,5%, RPO ≤ 1 soat, RTO ≤ 4 soat | Yo'q | Zaxira nusxa, tiklash reglamenti, monitoring |
| Hujjatlar saqlash (10 yil) | Bazada | Alohida obyekt ombori |
| O'zbekiston hududidagi ma'lumotlar markazi | — | Joylashtirish qarori |
| OpenAPI 3.0 hujjati | Yo'q | Yozish |

Yaxshi tomoni: barcha SQL bitta qatlamda (`src/db/db.js`) va PostgreSQL ga ko'chirishga moslab yozilgan, hisob yadrosi esa bazadan mustaqil. Shuning uchun ko'chirish qayta yozish emas, moslashtirish bo'ladi.

**Ish hajmi: 3–4 odam-oy.**

---

## 6. Xavfsizlik va sertifikatlash

| Talab | Hozir | Kerak |
|---|---|---|
| Rollar, eng kam huquq, korxona izolyatsiyasi | **Bajarilgan** va testlangan | — |
| O'zgartirib bo'lmaydigan audit izi | **Bajarilgan** (xesh zanjiri) | — |
| CSRF, CSP, kiritishni tekshirish, urinishlar cheklovi | **Bajarilgan** | — |
| Ikki bosqichli autentifikatsiya | TOTP bor | OneID va ERI ga o'tish |
| Elektron raqamli imzo | **Taqlid** (server kaliti) | Haqiqiy ERI infratuzilmasi |
| Bazada shifrlash (AES-256) | Yo'q | Joriy etish |
| SIEM, jurnallarni 3 yil saqlash | Yo'q | Ulash |
| Penetratsion test, kiberxavfsizlik ekspertizasi | Yo'q | Vakolatli organ orqali, ishga tushirishdan oldin |
| OWASP ASVS 4.0 L2, kod va kutubxona tekshiruvi | Qisman | CI ga SAST va SCA qo'shish |

**Ish hajmi: 2–3 odam-oy** + ekspertizaning rasmiy muddati.

---

## 7. Sun'iy intellekt komponentlari

| Komponent | Holati | Kerak |
|---|---|---|
| AI-3 anomaliyalar | Ishlaydi (qoidalar + statistika + izolyatsiya o'rmoni) | Sifatni ajratilgan to'plamda o'lchash: recall ≥ 90%, precision ≥ 70% |
| AI-5 bo'shliqlarni to'ldirish | Ishlaydi | MAPE ≤ 5% ni tasdiqlash |
| AI-6 prognoz | Bazaviy chiziqli model | Kuchliroq model, MAPE ≤ 10% |
| AI-7 dekarbonizatsiya tavsiyalari | Ishlaydi | Chora-tadbirlar kutubxonasini ekspert bilan tasdiqlash |
| AI-8 normativ yordamchi | Ishlaydi (manbasiz javob bermaydi) | **Mahalliy til modeli** — tijorat siri tashqariga chiqmasligi uchun |
| AI-9 risk-skoring | Ishlaydi | — |
| **AI-1 hujjatlarni o'qish (OCR)** | **Yo'q** | O'zbek (lotin, kirill), rus, ingliz; aniqlik ≥ 98% |
| **AI-2 TIF TN tasniflash** | **Yo'q** | Top-1 aniqlik ≥ 95% |
| Model boshqaruvi | Reyestr bor | Drift monitoringi, qayta o'qitish reglamenti |

**Ish hajmi: 3–4 odam-oy**, shundan AI-1 (OCR) eng og'iri.

---

## 8. Mahsulotdagi qolgan bo'shliqlar

- QR-kod bilan imzolangan PDF (hozir xesh va imzo bor, QR yo'q)
- EI "Communication template" ning rasmiy tuzilmasi (hozir soddalashtirilgan)
- ERP va IoT konnektorlari (1C, SAP, MQTT, OPC UA)
- Interaktiv xarita (inshootlar bo'yicha)
- Parij bitimi shaffoflik hisoboti (BTR) uchun agregatlar
- To'liq lokalizatsiya: rus, ingliz, o'zbek kirill (hozir menyu darajasida)
- WCAG 2.1 AA bo'yicha rasmiy audit

**Ish hajmi: 2–3 odam-oy.**

---

## 9. Tashkiliy ishlar (texnik emas, lekin bloklovchi)

1. **Buyurtmachini rasmiylashtirish** va idoralararo ishchi guruh tuzish (IMV, Ekologiya, Soliq, Bojxona, Energetika, Statistika).
2. **Uslubiyotni tasdiqlash** — Ekologiya vazirligi va IMV tomonidan (TZ-2 bo'yicha 1-bosqichni yopish mezoni).
3. **Davlat tizimlariga kirish** uchun so'rovlar — eng uzoq muddatli qism, birinchi kunda boshlanishi kerak.
4. **Pilot korxonalar bilan kelishuv**: O'zkimyoimpeks, Farg'onaazot, Indorama Kokand, Toshkent metallurgiya zavodi.
5. **Verifikatorlarni akkreditatsiyadan o'tkazish** (ISO 14065) — mamlakatda ularning soni kam.
6. **Qabul sinovlari**: har bir tovar guruhi uchun kamida 3 ta qo'lda (Excel) hisoblangan etalon, jami ≥ 20 ta, farq ≤ 0,1%.
7. **O'qitish**: 3 tilda materiallar, kamida 100 foydalanuvchi.
8. **Qo'llab-quvvatlash**: 12 oy kafolat va SLA.

---

## 10. Bosqichlar va ish hajmi

| Bosqich | Mazmuni | Muddat | Jamoa |
|---|---|---|---|
| **0. Tayyorgarlik** | Auditni yakunlash, D1 va D2 ni tuzatish, ma'lumotnoma jadvallarini olish, davlat tizimlariga kirish so'rovlari | 1 oy | 2 kishi |
| **1. Asos** | PostgreSQL ga ko'chirish, konteyner, CI, OpenAPI, yuklama sinovi | 2 oy | 3–4 kishi |
| **2. Integratsiyalar** | Soliq, Bojxona, O3CI, OneID va ERI, reestr, g'aznachilik | 3–4 oy | 3–4 kishi |
| **3. SI va mahsulot** | AI-1, AI-2, sifat o'lchovlari, QR, rasmiy shablonlar, lokalizatsiya | 2–3 oy | 2–3 kishi |
| **4. Sertifikatlash va pilot** | Penetratsion test, kiberxavfsizlik ekspertizasi, 4 korxonada 2 oylik pilot, o'qitish | 3 oy | butun jamoa |

**Jami: 9–12 oy, taxminan 18–26 odam-oy.** Bosqichlar qisman parallel ketishi mumkin.

### Kerakli jamoa

| Rol | Soni |
|---|---|
| Backend dasturchi (Node.js, PostgreSQL) | 2 |
| Frontend dasturchi | 1 |
| Integratsiya muhandisi (davlat tizimlari) | 1 |
| Ma'lumotlar va SI mutaxassisi | 1 |
| DevOps va xavfsizlik | 1 |
| Uslubiyot bo'yicha analitik (CBAM, soliq) | 1 |
| Sinovchi (QA) | 1 |
| Loyiha rahbari | 1 |

---

## 11. Asosiy xavflar

| Xavf | Ta'siri | Nima qilish |
|---|---|---|
| Davlat tizimlariga kirish kechikishi | Butun loyiha kechikadi | Birinchi kundan so'rov yuborish; shu orada mock bilan ishlash |
| Ma'lumotnoma jadvallari (TIF, benchmark) kelmasligi | Hisob rasmiy bo'lmaydi | Buyurtmachidan yozma so'rov |
| EI aktlari o'zgarishi | Formulalar eskiradi | Parametrlar kodda emas, ma'lumotnomada — bu allaqachon hal qilingan |
| Verifikatorlar yetishmasligi | Haqiqiy ma'lumot ulushi KPI ga yetmaydi | Akkreditatsiyani erta boshlash |
| Muddat: 2027-yil 30-sentabr | Birinchi CBAM deklaratsiyasi | Pilot 2027-yil II choragidan kechikmasligi shart |

---

## 12. Nima allaqachon tayyor

Yo'qotmaslik kerak bo'lgan natijalar:

- **Hisoblash yadrosi**: TZ-2 ning 5 va 6-bo'limlaridagi barcha formulalar, prekursorlar zanjiri, standart qiymat va mark-up qoidalari. Ilova A dagi etalon misollar 0,1% aniqlik bilan avtomatik tekshiriladi.
- **Hisob izi**: har bir raqamning formulasi, kirish qiymatlari va ishlatilgan ma'lumotnoma versiyasi saqlanadi — verifikator qadamma-qadam tekshira oladi.
- **Versiyalanadigan ma'lumotnoma**: parametrlar kodda emas; o'zgarish ikki shaxs tasdig'i bilan kuchga kiradi.
- **O'zgartirib bo'lmaydigan audit izi** (xesh zanjiri).
- **Rollar va izolyatsiya**: 12 rol, korxona faqat o'z ma'lumotini ko'radi, verifikator faqat tayinlangan inshootni.
- **To'liq interfeys**: 25 ta sahifa, rasmiy davlat portali uslubida, mobil qurilmalarda ishlaydi.
- **Hujjatlar paketi**: JSON, XML, DOCX, XLSX va chop etiladigan ko'rinish; xesh bilan muhrlanadi.
- **38 ta avtomatik test.**

---

## 13. Keyingi uchta qadam

1. **Auditni yakunlash va D1, D2 ni tuzatish** — 2 hafta, mavjud jamoa bilan.
2. **Buyurtmachidan ma'lumotnoma jadvallarini va davlat tizimlariga kirishni rasmiy so'rash** — bugun boshlash mumkin, natijasi oylar davomida keladi.
3. **PostgreSQL ga ko'chirish va yuklama sinovi** — shundan keyingina "keng miqyosda ishlaydi" deyish mumkin.
