/*
 * AI-8 — normativ yordamchi (RAG). Javob faqat bilimlar bazasidagi tasdiqlangan parchalar va foydalanuvchining
 * o'z korxonasi ma'lumotlariga tayanadi; manba topilmasa javob berilmaydi.
 * Tashqi LLM (Anthropic) faqat AI_EXTERNAL_ALLOWED=1 bo'lganda (buyurtmachining yozma roziligi) ishlatiladi —
 * aks holda manbali parchalar qaytariladi (ekstraktiv rejim). Korxona nomi va STIR tashqi xizmatga yuborilmaydi.
 */
"use strict";
const kb = require("./kb");

async function answer({ question, context, config }) {
  const hits = kb.search(question, 4);
  if (!hits.length) {
    return { mode: "none", text: "Bu savol bo'yicha platformadagi tasdiqlangan hujjatlarda ma'lumot topilmadi. Savolni uslubiyot atamalari bilan (SEE, CBAM, standart qiymat, uglerod soliqi, prekursor va h.k.) qayta yozing.", sources: [] };
  }
  const sources = hits.map(h => ({ id: h.id, source: h.source, text: h.text }));
  if (!(config.AI_EXTERNAL_ALLOWED && config.ANTHROPIC_API_KEY)) {
    return { mode: "extractive", text: "Tasdiqlangan hujjatlardan topilgan parchalar (LLM o'chirilgan — ma'lumot tashqi xizmatga yuborilmaydi):", sources };
  }
  const system = "Sen UZ-Carbon MRV platformasining normativ yordamchisisan. Faqat o'zbek tilida (lotin yozuvi) javob ber. " +
    "Faqat berilgan MANBALAR va FOYDALANUVCHI MA'LUMOTLARI asosida javob ber; har bir da'vodan keyin [manba-id] ko'rsat. " +
    "Manbalarda javob bo'lmasa, \"manbalarda ma'lumot yo'q\" deb ayt. Raqamlarni o'zingdan to'qima. 10 qatordan oshirma, markdownsiz.";
  const content = `MANBALAR:\n${sources.map(s => `[${s.id}] (${s.source}) ${s.text}`).join("\n")}\n\nFOYDALANUVCHI MA'LUMOTLARI (anonimlashtirilgan, faqat o'z korxonasi):\n${JSON.stringify(context || {})}\n\nSAVOL: ${question}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: config.ANTHROPIC_MODEL, max_tokens: 1200, system, messages: [{ role: "user", content }] }),
    });
    const data = await r.json();
    if (!r.ok) return { mode: "extractive", text: `LLM xatosi (${data?.error?.message || r.status}); tasdiqlangan parchalar:`, sources };
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    if (!/\[[a-z0-9-]+\]/i.test(text)) return { mode: "extractive", text: "LLM javobida manba havolasi yo'q — javob rad etildi. Tasdiqlangan parchalar:", sources };
    return { mode: "llm", model: config.ANTHROPIC_MODEL, text, sources };
  } catch (e) {
    return { mode: "extractive", text: `LLM xizmatiga ulanib bo'lmadi (${e.message}); tasdiqlangan parchalar:`, sources };
  }
}

module.exports = { answer };
