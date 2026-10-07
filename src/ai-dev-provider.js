// Imported exclusively behind the Vite DEV + localhost + opt-in gate.
export function createDevConversation(catalog) {
  const state={branchId:null,service:null,worker:null,time:null};
  return async ({message,branchId})=>{
    state.branchId=/طلخا/.test(message)?'talkha':/مشاي/.test(message)?'mashaya':state.branchId||branchId;
    const branch=catalog.branches?.find(b=>b.id===state.branchId);
    const services=(catalog.services||[]).filter(s=>s.branchIds?.includes(state.branchId)&&s.active!==false);
    const staff=(catalog.staff||[]).filter(s=>s.branchIds?.includes(state.branchId)&&s.active!==false);
    const selected=services.find(s=>message.includes(s.nameAr));if(selected)state.service=selected;
    const worker=staff.find(s=>message.includes(s.nameAr));if(worker)state.worker=worker;
    const slot=message.match(/\b(19:00|19:30|20:00|20:30)\b/);if(slot)state.time=slot[1];
    if(/سلام|اهلا/.test(message))return {message:'وعليكم السلام 👋 أنا مساعدك الشخصي. تحب نختار خدمة ولا نشوف بيانات الفرع؟'};
    if(/فين|عنوان/.test(message))return {message:`${branch?.nameAr||'الفرع'}: ${branch?.addressAr||'اختار الفرع علشان أقولك العنوان'}`};
    if(state.time&&state.worker&&state.service)return {message:'دي بطاقة تأكيد تجريبية فقط؛ لا يتم إنشاء حجز من المعاينة.',confirmation:{branchNameAr:branch.nameAr,serviceNamesAr:[state.service.nameAr],staffNameAr:state.worker.nameAr,bookingDate:'موعد تجريبي',bookingTime:state.time,total:state.service.price},devOnly:true};
    if(/بعد|الساع|موعد|بكره|بكرة/.test(message)&&state.worker)return {message:'دي أزرار مواعيد اختبار واجهة فقط؛ مش توافر حقيقي.',slots:['19:00','19:30','20:00','20:30'],devOnly:true};
    if(/مين|فاضي|متاح|اختار خدمة/.test(message)||state.service)return {message:'اختار المتخصص من بيانات المعاينة، وبعدها نختار الوقت.',cards:staff.slice(0,4),cardType:'worker'};
    if(/طلخا|مشاي/.test(message))return {message:`تمام، ${branch?.nameAr||'الفرع'}. تحب شعر بس ولا شعر ودقن؟`};
    const budget=Number(message.match(/\d+/)?.[0]);
    return {message:budget?`نختار من الخدمات الموجودة في حدود ${budget} جنيه. تحب شعر ولا دقن؟`:'أقدر أساعدك تختار. تحب قصة شعر، شعر ودقن، ولا عناية؟ دي خدمات المعاينة:',cards:services.filter(s=>!budget||s.price<=budget).slice(0,4),cardType:'service'};
  };
}
