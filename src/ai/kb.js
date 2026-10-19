/*
 * AI-8 uchun tasdiqlangan bilimlar bazasi: faqat platformaga kiritilgan me'yoriy va uslubiy hujjatlar parchalari.
 * Har bir parcha manba havolasi bilan; yordamchi manbasiz javob bermaydi.
 */
"use strict";

const PASSAGES = [
  { id: "tz2-1", source: "TZ-2, 1-bo'lim (atamalar)", text: "SEE (specific embedded emissions) — 1 tonna tovarga to'g'ri keladigan solishtirma kiritilgan emissiya, t CO2e/t. To'g'ridan-to'g'ri emissiya — yoqilg'i yonishi va texnologik jarayondan chiqadigan emissiya, issiqlik va sovutish ishlab chiqarish emissiyalari ham kiradi. Bilvosita emissiya — iste'mol qilingan elektr energiyasini ishlab chiqarishdagi emissiya; CBAM bo'yicha faqat sement va o'g'itlar uchun hisobga olinadi." },
  { id: "tz2-prek", source: "TZ-2, 1-bo'lim (atamalar)", text: "Prekursor — murakkab tovar tarkibiga kiruvchi, o'zi ham CBAM tovari bo'lgan oraliq mahsulot (masalan, klinker → sement, ammiak → ammiakli selitra). Murakkab tovar SEE si prekursorlar zanjiri bo'yicha rekursiv hisoblanadi." },
  { id: "tz2-default", source: "TZ-2, 1-bo'lim; 5.7", text: "Standart (default) qiymat — Yevropa Komissiyasi O'zbekiston uchun belgilagan SEE qiymati (Implementing Regulation (EU) 2025/2621), 2026-yildan ustama bilan: SEE_def = DV_tot · (1 + mu_t). Sement, alyuminiy, vodorod, temir-po'lat uchun mu: 2026 — 10%, 2027 — 20%, 2028 va keyin — 30%; o'g'itlar uchun har yili 1%. Misol: kulrang portlandsement 1,41 → 2026: 1,551; 2028: 1,833 t CO2e/t." },
  { id: "tz2-dash", source: "TZ-2, 4-bo'lim", text: "Standart qiymati \"−\" bo'lgan kodlar (oq klinker, cho'yan 7201, ferro-nikel va boshqalar) uchun platforma faqat haqiqiy ma'lumot bilan hisoblashga ruxsat beradi va bu haqda eksportyorni ogohlantiradi." },
  { id: "tz2-milliy", source: "TZ-2, 1-bo'lim; 6.1", text: "Milliy uglerod narxi — O'zbekistonda t CO2e uchun to'langan aniq (direct) uglerod soliqi; CBAM 9-moddasi bo'yicha EI importyori majburiyatidan chegirilishi mumkin. Stavka: 2026–2030 yillarda 5 USD/t CO2e, 2031–2035 yillarda 10 USD/t CO2e gacha bosqichma-bosqich (Uglerod soliqi strategiyasi)." },
  { id: "tz2-51", source: "TZ-2, 5.1", text: "Hisobot davri — kalendar yili. CBAM deklaratsiyasi keyingi yilning 30-sentabrigacha topshiriladi; 2026-yil importi uchun — 2027-yil 30-sentabr. Gazlar: CO2, N2O (nitrat kislota, ba'zi o'g'itlar), PFC — CF4 va C2F6 (birlamchi alyuminiy)." },
  { id: "tz2-52", source: "TZ-2, 5.2", text: "Yoqilg'i yonishidan to'g'ridan-to'g'ri emissiya: Em_comb = Σ AD_i · NCV_i · EF_i · OF_i. AD — yoqilg'i sarfi, NCV — quyi yonish issiqligi (TJ/birlik), EF — emissiya koeffitsiyenti (t CO2/TJ), OF — oksidlanish koeffitsiyenti (standart 1). IPCC standart koeffitsientlari: tabiiy gaz 56, dizel 74, benzin 73, suyultirilgan gaz 63, mazut 77, ko'mir 98 kg CO2/GJ. Milliy NCV va EF mavjud bo'lsa, ular ustuvor." },
  { id: "tz2-53", source: "TZ-2, 5.3", text: "Texnologik emissiya: Em_proc = Σ AD_j · EF_j · CF_j. Massa balansi (po'lat, alyuminiy, ammiak): Em_MB = 44/12 · (Σ AD_in·C_in − Σ AD_out·C_out), 44/12 = 3,664. Klinker: EF_clk = 0,785·w_CaO + 1,092·w_MgO; ma'lumot bo'lmasa EF = 0,525 t CO2/t klinker. N2O va PFC CO2e ga GWP orqali o'tkaziladi." },
  { id: "tz2-54", source: "TZ-2, 5.4", text: "O'lchash usuli (CEMS): Em = Σ c_h · V_h · 10⁻⁶, c — soatlik o'rtacha konsentratsiya (g/Nm³), V — soatlik tutun gazi hajmi (Nm³). N2O (nitrat kislota) uchun majburiy, boshqa manbalar uchun ixtiyoriy." },
  { id: "tz2-55", source: "TZ-2, 5.5", text: "Bilvosita emissiya: Em_el = E_el · EF_el. EF_el tanlash tartibi: (a) to'g'ridan-to'g'ri ulangan generatsiya yoki talablarga javob beradigan PPA bo'lsa — manba koeffitsienti; (b) aks holda EK O'zbekiston uchun e'lon qilgan yoki Energetika vazirligi tasdiqlagan tarmoq koeffitsienti. O'z generatsiyasi: EF_el,own = Σ AD·NCV·EF / E_el,produced." },
  { id: "tz2-56", source: "TZ-2, 5.6", text: "Jarayonga taqsimlash: AttrEm = DirEm + Em_H,imp − Em_H,exp + WG_corr − Em_el,exp. Oddiy tovar: SEE_dir = AttrEm / AL, SEE_ind = Em_el / AL. Murakkab tovar: SEE_g = (AttrEm_g + Σ M_p · SEE_p) / AL_g. CBAM SEE: sement va o'g'itlarda SEE_dir + SEE_ind, temir-po'lat, alyuminiy va vodorodda faqat SEE_dir." },
  { id: "tz2-58", source: "TZ-2, 5.8–5.9", text: "Eksport partiyasining kiritilgan emissiyasi: EE_s = m_s · SEE_CBAM, m_s — bojxona deklaratsiyasidagi netto og'irlik. Oylik ma'lumotda bo'shliq bo'lsa, platforma konservativ to'ldirish (eng yuqori oylik qiymat) qo'llaydi va belgilab qo'yadi. Faoliyat ma'lumotlari e-faktura, bojxona va energiya balansi bilan solishtiriladi." },
  { id: "tz2-62", source: "TZ-2, 6.2", text: "Yuqori oqim (yoqilg'iga uglerod aksizi): yoqilg'i birligiga EF_f = NCV · EF / 1000 (t CO2/t), stavka T_f = P_USD · EF_f · FX. Misol: benzin 1 t = 3,26 t CO2; 5 USD/t stavkada 12 100 so'm kursida ≈ 197 000 so'm/t. Ad valorem aksiz (tabiiy gaz, 12%) uglerod tarkibiga bog'lanmagani uchun CBAM chegirmasiga kirmaydi." },
  { id: "tz2-63", source: "TZ-2, 6.3", text: "Quyi oqim soliq: 1-variant — faqat texnologik emissiyaga: Tax = Em_proc · P_UZ · FX. 2-variant — barcha emissiyaga, yuqori oqimda to'langan qism chegiriladi: Tax = (Em_comb + Em_proc) · P_UZ · FX − Tax_up,paid. Xomashyo sifatidagi yoqilg'i bo'yicha qaytarish: Refund = Tax_up,paid · s_feed (Jahon banki misoli: 30% yonish / 70% texnologik)." },
  { id: "tz2-64", source: "TZ-2, 6.4", text: "Samarali to'langan uglerod narxi (CBAM 9-modda): P_eff = Σ (Tax_paid − Rebate) / Em_covered. Tovar birligiga: CP_g = SEE_cov · P_eff, qamrov ulushi s_cov = SEE_cov / SEE_CBAM. Faqat yuqori oqim soliqi bo'lsa, s_cov faqat yonish ulushini qamraydi; o'g'itlarda emissiyaning asosiy qismi texnologik bo'lgani uchun quyi oqim soliqisiz chegirma kichik bo'ladi." },
  { id: "tz2-65", source: "TZ-2, 6.5", text: "CBAM majburiyati (aniq formula): N_cert = Σ m_s·(SEE_CBAM − BM_g·CF_t) − Σ m_s·CP_g·FX_EUR / P_CBAM; Cost = max(0, N_cert)·P_CBAM. Soddalashtirilgan formula: Cost_t = EE · P_ETS · (1 − CF_t). CF_t: 2026 — 0,975; 2027 — 0,95; 2028 — 0,90; 2029 — 0,775; 2030 — 0,515; 2031 — 0,39; 2032 — 0,265; 2033 — 0,14; 2034 — 0. Dastlabki yillarda milliy soliq EI dagi samarali narxdan oshishi mumkin — bu siyosiy qaror uchun signal." },
  { id: "tz2-66", source: "TZ-2, 6.6", text: "Uglerod xarajati intensivligi: CCI = SEE · P / p_g; nisbiy: RCCI = (SEE_firm − SEE_EU) · P / p_g. Ta'sirchanlik tahlili: talab ±5–10%, yig'iluvchanlik ±3–5 p.p., valyuta kursi, EU ETS narxi (70 / 87 / 100 / 130 USD/t ssenariylari)." },
  { id: "tz2-67", source: "TZ-2, 6.7; PF-110", text: "ITMO: ER = BE − PE − LE. PF-110 bo'yicha ITMO ning 20% i saqlab qolinadi, 80% i savdoga yo'naltiriladi. Davlat ishtirokidagi loyihalar birliklari Hukumat tasarrufida. Platforma bir xil kamaytirishning ikki marta hisoblanishini (ITMO va CBAM SEE) bloklaydi." },
  { id: "tz2-mrv", source: "TZ-2, 9-bo'lim (MRV sikli)", text: "MRV sikli: monitoring rejasi yil boshida tasdiqlanadi → oylik ma'lumot yig'iladi → SI tekshiruvi va moslashtirish → yillik hisobot keyingi yilning 31-martigacha → verifikatsiya 30-iyungacha → hujjatlar paketi va O3CI (EI importyori 30-sentabrgacha deklaratsiya topshiradi)." },
  { id: "tz2-ai", source: "TZ-2, 8-bo'lim", text: "SI hisoblash formulalarini almashtirmaydi: soliq va CBAM summalari faqat deterministik formulalar bilan hisoblanadi. SI ma'lumotni tayyorlash, tekshirish, prognoz va tushuntirish uchun ishlatiladi; har bir SI xulosasi inson tomonidan tasdiqlanadi va izi saqlanadi. Verifikatsiyadan o'tmagan qiymat CBAM hujjatiga kirmaydi." },
  { id: "pf110", source: "PF-110 (2025-yil 7-iyul)", text: "NDC maqsadi: 2030-yilga qadar YaIM birligiga IG emissiyasini 2010-yilga nisbatan 35% kamaytirish. Milliy uglerod birliklari reestri 2026-yil 1-yanvardan Iqtisodiyot va moliya vazirligi tomonidan yuritiladi." },
  { id: "tz2-a2", source: "TZ-2, Ilova A.2", text: "Farg'onaazot misoli (P_ETS = 87 USD/t, s_cov = 1): 2028-yildan boshlab milliy soliq eksportyorning umumiy yukini oshirmaydi — u faqat 2,5–5,0 mln USD ni EI byudjetidan O'zbekiston byudjetiga o'tkazadi. 2026–2027 yillarda 5 USD/t stavka EI dagi samarali narxdan (2,18 va 4,35 USD/t) yuqori bo'lib, yuk 1,4 va 0,3 mln USD ga oshadi." },
];

const STOP = new Set("va bilan uchun bu qanday nima necha qaysi yoki ham da ga dan ni ning bo'yicha qilish kerak mi edi emas bor yo'q".split(" "));
const tokens = s => String(s).toLowerCase().replace(/[‘’`ʻʼ]/g, "'").split(/[^a-z0-9'а-яёўқғҳ₂]+/i).filter(w => w.length > 2 && !STOP.has(w));

/** Oddiy BM25-ga yaqin qidiruv. */
function search(query, k = 4) {
  const q = tokens(query);
  if (!q.length) return [];
  const docs = PASSAGES.map(p => ({ p, t: tokens(p.text + " " + p.source) }));
  const N = docs.length, avg = docs.reduce((a, d) => a + d.t.length, 0) / N;
  const df = w => docs.filter(d => d.t.some(x => x.startsWith(w.slice(0, 6)))).length;
  return docs.map(d => {
    let score = 0;
    for (const w of q) {
      const f = d.t.filter(x => x.startsWith(w.slice(0, 6))).length;
      if (!f) continue;
      const idf = Math.log(1 + (N - df(w) + 0.5) / (df(w) + 0.5));
      score += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.t.length / avg));
    }
    return { ...d.p, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

module.exports = { PASSAGES, search };
