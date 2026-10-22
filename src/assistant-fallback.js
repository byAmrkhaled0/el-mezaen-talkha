import {publicSubset} from './public-branch.js';
// Public knowledge only. The conversation shell stays open during provider outages.
const normalize = value => String(value || '').replace(/[أإآ]/g,'ا').replace(/[ًٌٍَُِّْ]/g,'').replace(/ى/g,'ي').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).toLowerCase();
export function resolveAssistantFallback(message, { branch, faqs = [], catalog = {}, lang = 'ar' } = {}) {
  const text = normalize(message);
  if(lang==='en'){
    if(/hello|hi\b|welcome/.test(text))return {message:'Welcome. I can help with published branch details and services.'};
    if(/hours|open|close/.test(text)&&branch)return {message:`${branch.nameEn||branch.nameAr}: ${branch.openingTime||'Opening time unavailable'} – ${branch.closingTime||'Closing time unavailable'}.`};
    if(/where|location|address|branch/.test(text)&&branch)return {message:`${branch.nameEn||branch.nameAr}: ${branch.addressEn||branch.addressAr||'Contact the branch to confirm the address'}`,whatsapp:String(branch.whatsapp||branch.phone||'').replace(/\D/g,'')};
    if(/price|service|hair|beard|budget/.test(text)){const cards=publicSubset(catalog.services,branch?.id).filter(row=>row.private!==true&&row.visibility!=='private').slice(0,6).map(row=>({...row,nameAr:row.nameEn||row.nameAr}));if(cards.length)return {message:'These services are listed for this branch. Availability and price must be confirmed by the server.',cards,cardType:'service'};}
    return {message:'The assistant is currently unavailable. You can browse published branch information or contact the branch. Booking confirmation requires a server connection.',whatsapp:String(branch?.whatsapp||branch?.phone||'').replace(/\D/g,'')};
  }
  if (/سلام|اهلا|مرحبا/.test(text)) return {message:'وعليكم السلام، أهلًا بيك 👋 قولّي محتاج إيه وأساعدك ببيانات الفرع والخدمات.'};
  if (/مواعيدكم|ساعات|بتقفل|لحد امتي|شغال/.test(text) && branch) return {message:`${branch.nameAr}: من ${branch.openingTime || 'موعد الفتح غير محدد'} إلى ${branch.closingTime || 'موعد الإغلاق غير محدد'}.`};
  if (/فين|عنوان|مكان|الفرع/.test(text) && branch) return {message:`${branch.nameAr}: ${branch.addressAr || 'تواصل مع الفرع لتأكيد العنوان'}`,whatsapp:String(branch.whatsapp||branch.phone||'').replace(/\D/g,'')};
  if (/سعر|اسعار|خدم|شعر|دقن|جنيه|ميزاني/.test(text)) {
    const budget = Number(text.match(/([\d]+)\s*(جنيه|ميزاني)/)?.[1]);
    const cards = publicSubset(catalog.services,branch?.id).filter(row=>row.private!==true&&row.visibility!=='private'&&(!budget || Number(row.price)<=budget)).slice(0,6).map(row=>({id:row.id,nameAr:row.nameAr,price:row.price,duration:row.duration,imageUrl:row.imageUrl,categoryId:row.categoryId}));
    if(cards.length)return {message:'دي خدمات موجودة في بيانات الفرع. تحب تعرف تفاصيل أي خدمة؟ الحجز والتوافر بيتأكدوا من الخادم.',cards,cardType:'service'};
  }
  const tokens=text.split(/\s+/).filter(t=>t.length>2);
  const scored=faqs.map(row=>({row,score:tokens.reduce((n,t)=>n+(normalize(`${row.questionAr||''} ${(Array.isArray(row.keywordsAr)?row.keywordsAr.join(' '):String(row.keywordsAr||''))}`).includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score);
  if(scored[0]?.score>=2)return {message:scored[0].row.answerAr};
  return {message:'مش قادر أوصل للمساعد الذكي دلوقتي، لكن أقدر أساعدك ببيانات الفرع والخدمات أو أحولك لواتساب. تأكيد الحجز محتاج اتصال بالخادم.',whatsapp:String(branch?.whatsapp||branch?.phone||'').replace(/\D/g,'')};
}
