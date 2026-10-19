/*
 * UzCarbon — hisoblash yadrosi (M3, M4) va avtomatik tahlil (AI-1, AI-3).
 * Brauzerda ham (window.UzCalc), Node.js da ham (require) ishlaydi.
 * Uslubiyot soddalashtirilgan MVP: aniq qoidalar CBAM va EU ETS amaldagi aktlaridan olinadi.
 */
(function (root) {
"use strict";
const FUELS = [ // t CO2 / birlik = NCV (TJ/birlik) × EF (t CO2/TJ), IPCC 2006
  {k:"gas",   n:"Tabiiy gaz",        u:"ming m³", ncv:0.0343, ef:56.1},
  {k:"lignite",n:"Qo‘ng‘ir ko‘mir",  u:"t",       ncv:0.0119, ef:101.0},
  {k:"coal",  n:"Toshko‘mir",        u:"t",       ncv:0.0258, ef:94.6},
  {k:"mazut", n:"Mazut",             u:"t",       ncv:0.0404, ef:77.4},
  {k:"diesel",n:"Dizel yoqilg‘isi",  u:"t",       ncv:0.0430, ef:74.1},
  {k:"coke",  n:"Koks",              u:"t",       ncv:0.0282, ef:107.0},
];
const SECTORS = {
  cement:{n:"Sement", product:"Portlandsement (CN 2523 29 00)", indirect:true},
  steel:{n:"Temir va po‘lat", product:"Po‘lat prokati (CN 72xx)", indirect:false},
  aluminium:{n:"Alyuminiy", product:"Alyuminiy prokati (CN 76xx)", indirect:false},
  fertilizer:{n:"O‘g‘itlar", product:"Ammiakli selitra (CN 3102 30)", indirect:true},
};
const REGIONS = ["Toshkent sh.","Toshkent vil.","Andijon","Buxoro","Farg‘ona","Jizzax","Xorazm","Namangan","Navoiy","Qashqadaryo","Qoraqalpog‘iston Resp.","Samarqand","Sirdaryo","Surxondaryo"];
const DEFAULT_PARAMS = {
  year:2026, etsPrice:75, eurRate:14500, natRate:41200, natCoverage:100, gridEf:0.50, markup:10,
  cf:{2026:97.5,2027:95,2028:90,2029:77.5,2030:51.5,2031:39,2032:26.5,2033:14,2034:0},
  sec:{
    cement:{defSee:0.85, bm:0.693},
    steel:{defSee:1.50, bm:1.288},
    aluminium:{defSee:1.70, bm:1.464},
    fertilizer:{defSee:2.70, bm:1.570},
  }
};
const Q = ["Q1","Q2","Q3","Q4","Y"];
const QN = {Q1:"I chorak",Q2:"II chorak",Q3:"III chorak",Q4:"IV chorak",Y:"Yillik"};

function fmt(n,d=0){ if(n==null||!isFinite(n)) return "—"; const s=Math.abs(n).toFixed(d); const [i,f]=s.split("."); const g=i.replace(/\B(?=(\d{3})+(?!\d))/g,"\u202f"); return (n<0?"−":"")+g+(f?","+f:""); }
const num = v => { const x=parseFloat(String(v??"").replace(",",".")); return isFinite(x)?x:0; };
const periodKey = r => r.year+"-"+r.q;
const periodLabel = r => r.year+" · "+QN[r.q];
const sortRecs = a => a.slice().sort((x,y)=> x.year-y.year || Q.indexOf(x.q)-Q.indexOf(y.q));
function calc(r, inst, P){
  const sec = inst?.sector || "cement", sc = P.sec[sec] || DEFAULT_PARAMS.sec[sec];
  const f = r.fuels||{};
  const fuelLines = FUELS.map(F=>({k:F.k,n:F.n,q:num(f[F.k]), t:num(f[F.k])*F.ncv*F.ef})).filter(x=>x.q>0);
  const combustion = fuelLines.reduce((a,x)=>a+x.t,0);
  let process=0, procLines=[];
  if(sec==="cement"){
    const cao=num(r.cao), mgo=num(r.mgo);
    const efc = (cao>0) ? (cao/100*0.785 + mgo/100*1.092) : 0.52;
    const t=num(r.clinker)*efc; process+=t; procLines.push({n:"Klinker kalsinatsiyasi", t, note:`EF = ${fmt(efc,3)} t CO₂/t`});
  }
  if(sec==="steel"){
    const a=num(r.limestone)*0.44, b=num(r.electrode)*3.663;
    process+=a+b; procLines.push({n:"Ohaktosh (karbonatlar)",t:a},{n:"Grafit elektrodlar",t:b});
  }
  if(sec==="aluminium"){
    const a=num(r.anode)*3.6, b=num(r.pfc);
    process+=a+b; procLines.push({n:"Anod iste’moli",t:a},{n:"PFC (t CO₂e)",t:b});
  }
  if(sec==="fertilizer"){
    const a=num(r.n2o)*265; process+=a; procLines.push({n:"N₂O (GWP 265)",t:a});
  }
  const direct = combustion + process;
  const indirectAll = num(r.electricity)*P.gridEf;
  const indirect = SECTORS[sec].indirect ? indirectAll : 0;
  const precursors = num(r.precursors);
  const output = num(r.output);
  const total = direct + indirect + precursors;
  const see = output>0 ? total/output : NaN;
  const seeDirect = output>0 ? direct/output : NaN;
  // CBAM
  const M = num(r.exportEU);
  const cfPct = (r.year<2026) ? null : (P.cf[r.year] ?? 0);
  let bmUnit = sc.bm;
  if(sec==="cement"){ const cr = output>0 ? num(r.clinker)/output : 0; bmUnit = sc.bm*Math.min(cr,1); }
  const embedded = isFinite(see)? see*M : 0;
  const freeAdj = cfPct==null ? 0 : bmUnit*(cfPct/100)*M;
  const certs = cfPct==null ? 0 : Math.max(0, embedded - freeAdj);
  const gross = certs*P.etsPrice;
  const natEurT = P.natRate/P.eurRate;
  const deduction = Math.min(gross, natEurT*(P.natCoverage/100)*certs);
  const net = gross - deduction;
  const defSee = sc.defSee*(1+P.markup/100);
  const certsDef = cfPct==null ? 0 : Math.max(0, defSee*M - freeAdj);
  const netDef = certsDef*P.etsPrice; // standart qiymatda milliy narx tasdiqlanmagan deb olinadi
  const natTax = direct*(P.natCoverage/100)*P.natRate; // so'm
  return {sec, fuelLines, procLines, combustion, process, direct, indirect, indirectAll, precursors, total, output, see, seeDirect,
    M, cfPct, bmUnit, embedded, freeAdj, certs, gross, deduction, net, defSee, certsDef, netDef, saving:netDef-net, natTax,
    clinkerRatio: sec==="cement"&&output>0? num(r.clinker)/output : null,
    fuelGJperClinker: sec==="cement"&&num(r.clinker)>0? FUELS.reduce((a,F)=>a+num(f[F.k])*F.ncv,0)*1000/num(r.clinker) : null,
    kwhPerT: output>0? num(r.electricity)*1000/output : null };
}

function analyze(insts, allRecs, P){
  const out=[];
  for(const inst of insts){
    const recs = sortRecs(allRecs.filter(r=>r.instId===inst.id));
    const res = recs.map(r=>({r, c:calc(r,inst,P)}));
    res.forEach(({r,c},idx)=>{
      const where = `${inst.name} · ${periodLabel(r)}`;
      if(!(c.output>0)) out.push({sev:"hi", inst, r, t:"Mahsulot hajmi kiritilmagan", d:`${where}: SEE ni hisoblab bo‘lmaydi.`});
      if(c.M > c.output && c.output>0) out.push({sev:"hi", inst, r, t:"Eksport hajmi ishlab chiqarishdan katta", d:`${where}: YeIga eksport ${fmt(c.M)} t, ishlab chiqarish ${fmt(c.output)} t. Zaxiradan sotilgan bo‘lsa, izoh qo‘shing.`});
      if(c.sec==="cement"){
        if(c.clinkerRatio!=null && (c.clinkerRatio<0.5||c.clinkerRatio>0.97)) out.push({sev:"mid",inst,r,t:"Klinker koeffitsiyenti odatiy oraliqdan tashqarida",d:`${where}: ${fmt(c.clinkerRatio,2)} (odatda 0,50–0,97).`});
        if(c.fuelGJperClinker!=null && (c.fuelGJperClinker<2.9||c.fuelGJperClinker>4.8)) out.push({sev:"mid",inst,r,t:"Klinker uchun yoqilg‘i sarfi odatiy emas",d:`${where}: ${fmt(c.fuelGJperClinker,2)} GJ/t klinker (quruq usulda odatda 2,9–4,8). O‘lchov va hisob-fakturalarni tekshiring.`});
        if(c.kwhPerT!=null && (c.kwhPerT<60||c.kwhPerT>160)) out.push({sev:"lo",inst,r,t:"Elektr sarfi odatiy emas",d:`${where}: ${fmt(c.kwhPerT,0)} kVt·soat/t (odatda 60–160).`});
      }
      const sc=P.sec[c.sec];
      if(isFinite(c.see) && sc){
        if(c.see > sc.defSee*1.3) out.push({sev:"mid",inst,r,t:"SEE standart qiymatdan yuqori",d:`${where}: ${fmt(c.see,3)} t CO₂e/t, standart qiymat ${fmt(sc.defSee,2)}. Bu holda standart qiymatdan foydalanish arzonroq bo‘lishi mumkin; avval ma’lumotni tekshiring.`});
        if(c.see < sc.defSee*0.3) out.push({sev:"lo",inst,r,t:"SEE juda past",d:`${where}: ${fmt(c.see,3)} t CO₂e/t. Prekursorlar va barcha yoqilg‘i turlari kiritilganini tekshiring.`});
      }
      // tarixiy taqqoslash (bir xil davr turi bo'yicha)
      const peers = res.filter((x,j)=>j!==idx && (x.r.q==="Y")===(r.q==="Y") && isFinite(x.c.see));
      if(peers.length>=2 && isFinite(c.see)){
        const m = peers.reduce((a,x)=>a+x.c.see,0)/peers.length;
        const sd = Math.sqrt(peers.reduce((a,x)=>a+(x.c.see-m)**2,0)/peers.length) || m*0.03;
        const z = (c.see-m)/sd, dev=(c.see-m)/m;
        if(Math.abs(dev)>0.2 || (Math.abs(z)>3 && Math.abs(dev)>0.08)) out.push({sev:Math.abs(dev)>0.35?"hi":"mid",inst,r,t:"SEE boshqa davrlardan keskin farq qiladi",d:`${where}: ${fmt(c.see,3)} vs o‘rtacha ${fmt(m,3)} (${dev>0?"+":""}${fmt(dev*100,0)}%, z = ${fmt(z,1)}). Mumkin bo‘lgan sabab: hisoblagich xatosi, kiritishda nol yoki birlik xatosi, texnologik rejim o‘zgarishi.`});
      }
    });
  }
  const order={hi:0,mid:1,lo:2};
  return out.sort((a,b)=>order[a.sev]-order[b.sev]);
}
function forecast(inst, recs, P){
  const res = sortRecs(recs.filter(r=>r.instId===inst.id && r.q!=="Y")).map(r=>({r,c:calc(r,inst,P)})).filter(x=>isFinite(x.c.see));
  if(res.length<3) return null;
  const xs=res.map((_,i)=>i), ys=res.map(x=>x.c.see), n=xs.length;
  const mx=xs.reduce((a,b)=>a+b)/n, my=ys.reduce((a,b)=>a+b)/n;
  const b=xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/xs.reduce((a,x)=>a+(x-mx)**2,0), a=my-b*mx;
  const resid=Math.sqrt(ys.reduce((s,y,i)=>s+(y-(a+b*i))**2,0)/Math.max(1,n-2));
  return {next:a+b*n, slope:b, resid, n};
}


const api = { FUELS, SECTORS, REGIONS, DEFAULT_PARAMS, Q, QN, fmt, num, periodKey, periodLabel, sortRecs, calc, analyze, forecast };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.UzCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
