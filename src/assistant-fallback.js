// Public knowledge only. The conversation shell stays open during provider outages.
const normalize = value => String(value || '').replace(/[أإآ]/g,'ا').replace(/[ًٌٍَُِّْ]/g,'').replace(/ى/g,'ي').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).toLowerCase();
export function resolveAssistantFallback(message, { branch, faqs = [], catalog = {} } = {}) {
  const text = normalize(message);
  if (/سلام|اهلا|مرحبا/.test(text)) return {message:'وعليكم السلام، أهلًا بيك 👋 قولّي محتاج إيه وأساعدك ببيانات الفرع والخدمات.'};
  if (/مواعيدكم|ساعات|بتقفل|لحد امتي|شغال/.test(text) && branch) return {message:`${branch.nameAr}: من ${branch.openingTime || 'موعد الفتح غير محدد'} إلى ${branch.closingTime || 'موعد الإغلاق غير محدد'}.`};
  if (/فين|عنوان|مكان|الفرع/.test(text) && branch) return {message:`${branch.nameAr}: ${branch.addressAr || 'تواصل مع الفرع لتأكيد العنوان'}`,whatsapp:String(branch.whatsapp||branch.phone||'').replace(/\D/g,'')};
  if (/سعر|اسعار|خدم|شعر|دقن|جنيه|ميزاني/.test(text)) {
    const budget = Number(text.match(/([\d]+)\s*(جنيه|ميزاني)/)?.[1]);
    const cards = (catalog.services||[]).filter(row=>row.active!==false && row.branchIds?.includes(branch?.id) && (!budget || Number(row.price)<=budget)).slice(0,6).map(row=>({id:row.id,nameAr:row.nameAr,price:row.price,duration:row.duration,imageUrl:row.imageUrl,categoryId:row.categoryId}));
    if(cards.length)return {message:'دي خدمات موجودة في بيانات الفرع. تحب تعرف تفاصيل أي خدمة؟ الحجز والتوافر بيتأكدوا من الخادم.',cards,cardType:'service'};
  }
  const tokens=text.split(/\s+/).filter(t=>t.length>2);
  const scored=faqs.map(row=>({row,score:tokens.reduce((n,t)=>n+(normalize(`${row.questionAr||''} ${(Array.isArray(row.keywordsAr)?row.keywordsAr.join(' '):String(row.keywordsAr||''))}`).includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score);
  if(scored[0]?.score>=2)return {message:scored[0].row.answerAr};
  return {message:'مش قادر أوصل للمساعد الذكي دلوقتي، لكن أقدر أساعدك ببيانات الفرع والخدمات أو أحولك لواتساب. تأكيد الحجز محتاج اتصال بالخادم.',whatsapp:String(branch?.whatsapp||branch?.phone||'').replace(/\D/g,'')};
}
