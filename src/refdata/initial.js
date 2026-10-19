/*
 * Boshlang'ich ma'lumotnoma qiymatlari (M10.1). Har bir yozuvda manba ko'rsatilgan.
 * Qoida: TZ-2 da aniq berilgan raqamlar shu yerda; TZ da yo'q qiymatlar "taxminiy" deb belgilanadi va
 * uslubiyot administratori tomonidan rasmiy manba bilan almashtirilishi kerak (REJA.md 13-bo'lim, Q1–Q8).
 * TIF TN kodlarining to'liq jadvali (~285 qator) "CBAM_TIF_codes_for_UZB_updated.xlsx" dan import qilinadi.
 */
"use strict";

const TZ2 = "TZ-2 (16.10.2026)";
const VALID_FROM = "2026-01-01";

function entries() {
  const out = [];
  const add = (key, value, unit, source, validFrom = VALID_FROM) => out.push({ key, value, unit, source, validFrom });

  // CBAM omili — bepul kvota ulushi CF_t (Implementing Regulation (EU) 2025/2620)
  const cf = { 2026: 0.975, 2027: 0.95, 2028: 0.90, 2029: 0.775, 2030: 0.515, 2031: 0.39, 2032: 0.265, 2033: 0.14, 2034: 0 };
  for (const [y, v] of Object.entries(cf)) add(`cbam.cf.${y}`, v, "ulush", `${TZ2} 6.5-jadval; (EU) 2025/2620`);

  // Mark-up (EU) 2025/2621: sement, alyuminiy, vodorod, temir-po'lat — 10/20/30%; o'g'itlar — har yili 1%
  for (const g of ["cement", "aluminium", "hydrogen", "iron_steel"]) {
    add(`cbam.markup.${g}.2026`, 0.10, "ulush", `${TZ2} 5.7; (EU) 2025/2621`);
    add(`cbam.markup.${g}.2027`, 0.20, "ulush", `${TZ2} 5.7; (EU) 2025/2621`);
    add(`cbam.markup.${g}.2028`, 0.30, "ulush", `${TZ2} 5.7; (EU) 2025/2621 (2028 va keyingi yillar)`);
  }
  for (const y of [2026, 2027, 2028]) add(`cbam.markup.fertilizer.${y}`, 0.01, "ulush", `${TZ2} 5.7; (EU) 2025/2621`);

  // GWP (100 yil) — EI qo'llaydigan qiymatlar (AR5). Q5: tasdiqlash kerak.
  add("gwp.N2O", 265, "t CO2e/t", "IPCC AR5 (EI CBAM); Q5 — tasdiqlash kerak");
  add("gwp.CF4", 6630, "t CO2e/t", "IPCC AR5 (EI CBAM); Q5 — tasdiqlash kerak");
  add("gwp.C2F6", 11100, "t CO2e/t", "IPCC AR5 (EI CBAM); Q5 — tasdiqlash kerak");

  add("clinker.default_ef", 0.525, "t CO2/t klinker", `${TZ2} 5.3`);
  add("mb.c_to_co2", 3.664, "t CO2/t C", `${TZ2} 5.3 (44/12)`);
  add("grid.ef", 0.50, "t CO2/MWh", "Taxminiy (MVP). Q4: Energetika vazirligi tasdiqlagan qiymat bilan almashtirilsin");
  add("heat.default_ef", 62.3, "t CO2/TJ", "Taxminiy: tabiiy gaz qozoni, η = 0,9 (56,1 / 0,9). Rasmiy qiymat bilan tekshirilsin");

  // Yoqilg'ilar: TZ-2 Ilova B (Jahon banki eslatmasi 3-jadval; IPCC standart qiymatlari).
  // ncvGJ — GJ / birlik; efKgGJ — kg CO2/GJ (≡ t CO2/TJ); densityTperM3 — hajmdan tonnaga o'tkazish uchun.
  const fuel = (key, name, unit, ncvGJ, efKgGJ, density, source) => add(`fuel.${key}`, { name, unit, ncvGJ, efKgGJ, densityTperM3: density, source }, unit, source);
  fuel("natural_gas", "Tabiiy gaz", "1000m3", 38, 56, null, `${TZ2} Ilova B (38 MJ/m³ · 56 = 2 128 kg/ming m³)`);
  fuel("petrol", "Benzin", "m3", 33, 73, 0.74, `${TZ2} Ilova B; zichlik 0,74 — Ilova A.4`);
  fuel("diesel", "Dizel", "m3", 37, 74, 0.84, `${TZ2} Ilova B; zichlik 0,84 — taxminiy`);
  fuel("lpg", "Suyultirilgan gaz (LPG)", "m3", 24, 63, 0.54, `${TZ2} Ilova B; zichlik 0,54 — taxminiy`);
  fuel("mazut", "Mazut", "m3", 40, 77, 0.95, `${TZ2} Ilova B; zichlik 0,95 — taxminiy`);
  fuel("coal", "Ko'mir", "t", 30, 98, null, `${TZ2} Ilova B`);
  // IPCC 2006 muqobil qiymatlari (MVP versiyasi) — milliy NCV/EF tasdiqlanguncha taqqoslash uchun (Q8)
  fuel("ipcc_natural_gas", "Tabiiy gaz (IPCC, MVP)", "1000m3", 34.3, 56.1, null, "IPCC 2006 / MVP v0.1");
  fuel("lignite", "Qo'ng'ir ko'mir (IPCC)", "t", 11.9, 101.0, null, "IPCC 2006");
  fuel("ipcc_coal", "Toshko'mir (IPCC)", "t", 25.8, 94.6, null, "IPCC 2006");
  fuel("ipcc_mazut", "Mazut (IPCC)", "t", 40.4, 77.4, null, "IPCC 2006");
  fuel("ipcc_diesel", "Dizel (IPCC)", "t", 43.0, 74.1, null, "IPCC 2006");
  fuel("coke", "Koks (IPCC)", "t", 28.2, 107.0, null, "IPCC 2006");

  // Texnologik materiallar (hisoblash usuli, t CO2/t) — IPCC 2006 stexiometrik qiymatlari / MVP
  const mat = (key, name, ef, source) => add(`material.${key}`, { name, ef, source }, "t CO2/t", source);
  mat("limestone", "Ohaktosh (CaCO3)", 0.440, "IPCC 2006 stexiometrik");
  mat("dolomite", "Dolomit (CaMg(CO3)2)", 0.477, "IPCC 2006 stexiometrik");
  mat("soda_ash", "Soda (Na2CO3)", 0.415, "IPCC 2006 stexiometrik");
  mat("graphite_electrode", "Grafit elektrodlar", 3.664, "Taxminiy: 100% uglerod (44/12)");
  mat("prebaked_anode", "Pishirilgan anod (iste'mol)", 3.6, "Taxminiy (MVP v0.1)");

  // Milliy uglerod narxi — Uglerod soliqi strategiyasi (ADB, 2025-noyabr): 2026–2030 5 USD, 2031–2035 10 USD gacha (Q7)
  for (let y = 2026; y <= 2030; y++) add(`tax.rate_usd.${y}`, 5, "USD/t CO2e", `${TZ2} 6.1; Uglerod soliqi strategiyasi`);
  for (let y = 2031; y <= 2035; y++) add(`tax.rate_usd.${y}`, 10, "USD/t CO2e", `${TZ2} 6.1 (Ilova A.2 dagi o'zgarmas 10 USD); Q7`);
  // Yig'iluvchanlik: 1-yil 0,90 → 5-yil 0,95 (oraliq yillar chiziqli)
  [0.90, 0.9125, 0.925, 0.9375, 0.95].forEach((v, i) => add(`tax.k_comp.${i + 1}`, v, "ulush", `${TZ2} 6.2 (oraliq yillar chiziqli interpolyatsiya)`));
  add("tax.k_comp.start_year", 2026, "yil", `${TZ2} 6.2`);
  add("tax.s_feed", 0.70, "ulush", "Jahon banki misoli: 30% yonish / 70% texnologik (Q12)");
  add("tax.mode", "up", "", "Joriy siyosat: faqat yuqori oqim (yoqilg'i aksizi). Variantlar: up | down1 | down2");
  add("tax.bhm.2026", 412000, "so'm", "Bazaviy hisoblash miqdori, 2026 (taqdimot, MVP)");
  add("tax.bhm_share", 0.10, "ulush", "Muqobil variant: stavka = BHM × ulush (FT-4.1, taqdimot 13-slayd)");

  // Valyuta kurslari (Markaziy bank) — integratsiya orqali yangilanadi (I8)
  add("fx.USD", 12100, "so'm/USD", `${TZ2} Ilova A.4 misoli; Markaziy bank bilan yangilanadi`);
  add("fx.EUR", 14500, "so'm/EUR", "MVP v0.1; Markaziy bank bilan yangilanadi");

  // EU ETS / CBAM sertifikat narxi
  add("ets.price_eur", 75, "EUR/t CO2e", "MVP v0.1; EU ETS manbasidan yangilanadi (I9)");
  add("ets.scenarios_usd", [70, 87, 100, 130], "USD/t CO2e", `${TZ2} 6.6 ta'sirchanlik ssenariylari`);
  add("ets.reference_usd", 87, "USD/t CO2e", `${TZ2} Ilova A.1–A.2 (100% CBAM to'lovi 87 USD/t ga mos)`);

  // Amaldagi aksiz (yashirin narx tahlili uchun, F-6.2d)
  add("excise.petrol_ai80", { uzsPerT: 1075000, fuelKey: "petrol", note: "375 000 + 700 000 so'm/t" }, "so'm/t", `${TZ2} 6.2 misoli`);

  // NDC (PF-110, yangilangan NDC 2021)
  add("ndc.base_year", 2010, "yil", "Yangilangan NDC (2021)");
  add("ndc.target_reduction_2030", 0.35, "ulush", "PF-110: 2030 gacha YaIM birligiga IG emissiyasini 2010 ga nisbatan 35% kamaytirish");
  add("itmo.trade_share", 0.80, "ulush", "PF-110: ITMO 80% savdoga, 20% saqlab qolinadi");

  // Panel uchun agregatsiya chegarasi (tijorat siri)
  add("privacy.min_group", 3, "korxona", "TZ-1 8.1: benchmarklar kamida 3 korxona agregatsiyasida");

  // TIF TN kodlari — TZ-2 4-bo'lim jadvalidagi MISOL qiymatlar. To'liq jadval xlsx dan import qilinadi (Q1).
  // dvStatus: value — standart qiymat bor; none — "−" (standart qiymat taqiqlangan); missing — jadval hali import qilinmagan.
  const tif = (code, name, group, dvTot, dvStatus, source) => add(`tif.${code}`, { code, cn8: code.slice(0, 8), name, group, dvTot, dvStatus, bm: null, sample: true, source }, "t CO2e/t", source);
  const S = `${TZ2} 4-bo'lim jadvali (misol)`;
  tif("2523290000", "Portlandsement, kulrang", "cement", 1.41, "value", `${S}; Ilova A.3`);
  tif("2523100000", "Sement klinkeri, kulrang", "cement", null, "missing", `${S} (qiymat jadvaldan import qilinadi)`);
  tif("2523900000", "Boshqa gidravlik sementlar", "cement", null, "missing", `${S} (qiymat jadvaldan import qilinadi)`);
  tif("3102300000", "Ammiakli selitra", "fertilizer", 2.67, "value", S);
  tif("3102500000", "Natriy nitrat", "fertilizer", 4.33, "value", S);
  tif("3105400000", "Monoammoniyfosfat (MAP)", "fertilizer", 0.37, "value", S);
  tif("3102100000", "Karbamid", "fertilizer", null, "missing", `${S} (1,54–1,57 oralig'i; aniq qiymat jadvaldan)`);
  tif("2814100000", "Suvsiz ammiak", "fertilizer", null, "missing", `${S} (qiymat jadvaldan import qilinadi)`);
  tif("7601100000", "Xom alyuminiy, legirlanmagan", "aluminium", 0.36, "value", S);
  tif("7606120000", "Alyuminiy prokat (list)", "aluminium", 1.74, "value", `${S} (prokat uchun yuqori chegara)`);
  tif("2804100000", "Vodorod", "hydrogen", 10.82, "value", S);
  tif("7214200000", "Uglerodli po'lat prokat (armatura)", "iron_steel", 3.21, "value", S);
  tif("7201100000", "Cho'yan", "iron_steel", null, "none", `${S} ("−": faqat haqiqiy ma'lumot)`);
  tif("7202600000", "Ferro-nikel", "iron_steel", null, "none", `${S} ("−": faqat haqiqiy ma'lumot)`);

  return out;
}

module.exports = { entries, VALID_FROM };
