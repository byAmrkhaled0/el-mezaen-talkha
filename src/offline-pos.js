export const OFFLINE_TTL = 24 * 60 * 60 * 1000;
export const transientFailure = error => ['unavailable','deadline-exceeded','network-request-failed','resource-exhausted'].some(code => String(error?.code || error?.cause?.code || '').endsWith(code)) || error instanceof TypeError;
export function createOfflinePos({store, identity, invoke, online = () => globalThis.navigator?.onLine !== false, now = Date.now, changed = () => {}, ready = async () => true}) {
  let busy = false;
  const invalidContexts=new Set();
  const uid = () => identity();
  async function context(value) {
    const owner=uid(); if (!owner) throw new Error('سجل الدخول أولًا');
    if (value) {if(!online()) return; const key=JSON.stringify([owner,value.branchId]);if(value.shift?.status!=='OPEN')invalidContexts.add(key); if(value.shift?.status==='OPEN'&&!await ready())throw new Error('جاري تجهيز ملفات الأوفلاين؛ حدّث الصفحة وافتح شاشة البيع مرة تانية أثناء الاتصال'); await store.put(owner,'context',value.branchId,{...value,savedAt:now()});if(value.shift?.status==='OPEN')invalidContexts.delete(key);changed();}
  }
  async function readiness(branchId) {
    if(!uid()||!branchId)return {ready:false,message:'اختار فرع البيع وجهّز الجهاز أثناء الاتصال'};
    if(invalidContexts.has(JSON.stringify([uid(),branchId])))return {ready:false,message:'وردية الجهاز اتقفلت أو اتغيرت؛ افتح وردية تخصك وجهّز الجهاز'};
    const saved=await store.get(uid(),'context',branchId);
    if(!saved||now()-saved.savedAt>OFFLINE_TTL)return {ready:false,message:'تجهيز الأوفلاين غير موجود أو انتهت صلاحيته؛ اضغط تجهيز الجهاز بالإنترنت'};
    if(saved.shift?.status!=='OPEN'||!saved.shift.id)return {ready:false,message:'افتح وردية تخصك، ثم جهّز الجهاز قبل البيع بدون نت'};
    if(!await ready())return {ready:false,message:'ملفات اللوحة لسه مش جاهزة للأوفلاين؛ حدّث الصفحة وأنت متصل'};
    return {ready:true,savedAt:saved.savedAt};
  }
  async function enqueue(payload, prices) {
    const owner=uid();if(invalidContexts.has(JSON.stringify([owner,payload.branchId])))throw new Error('وردية الجهاز اتقفلت أو اتغيرت؛ وصّل النت وجهّز ورديتك');
    const saved=await store.get(owner,'context',payload.branchId);
    if(!await ready())throw new Error('ملفات اللوحة غير جاهزة للأوفلاين؛ افتحها بالإنترنت أولًا');
    if(!saved || now()-saved.savedAt>OFFLINE_TTL || saved.shift?.status!=='OPEN' || !saved.shift.id) throw new Error('جهّز فرع البيع ووردية مفتوحة أثناء الاتصال أولًا؛ بيانات الأوفلاين غير جاهزة أو قديمة');
    if (payload.paymentMethod!=='cash' || payload.paid!==true || Number(payload.discountAmount||0) || payload.couponCode || Number(payload.redeemPoints||0) || Number(payload.redeemCashback||0)) throw new Error('المبيعات بدون نت: نقدي بالكامل، بدون خصومات أو استبدال محفظة. العمليات الأخرى تحتاج اتصال');
    if (!payload.customer?.firstName?.trim() || !/^(?:\+?2)?01[0125]\d{8}$/.test(String(payload.customer?.phone||'').replace(/[\s-]/g,''))) throw new Error('اكتب اسم العميل ورقم موبايل مصري صحيح قبل حفظ الشيك');
    if (!Array.isArray(prices)||!prices.length||prices.length>40||prices.length!==payload.items.length || prices.some(p=>!Number.isFinite(p.unitPrice)||p.unitPrice<0||!Number.isInteger(p.qty)||p.qty<1)) throw new Error('أصناف الشيك أو الأسعار غير مكتملة');
    const total=Math.round(prices.reduce((sum,p)=>sum+p.unitPrice*p.qty,0)*100)/100;
    if(!Number.isFinite(total))throw new Error("إجمالي الشيك غير صحيح؛ راجع الأسعار قبل الحفظ");
    if(!/^[A-Za-z0-9_-]{16,100}$/.test(payload.idempotencyKey||''))throw new Error('معرّف الشيك غير صحيح');
    const sale={id:payload.idempotencyKey,createdAt:now(),status:'pending',attempts:0,nextAttempt:0,payload:{...payload,offline:{version:1,shiftId:saved.shift.id,dateKey:saved.dateKey,total,prices}},total};
    // Never clear the POS form until the complete encrypted record commits.
    await store.insertSale(owner,sale.id,sale);changed();return sale;
  }
  async function list() {return (await store.list(uid(),'sale')).sort((a,b)=>a.createdAt-b.createdAt);}
  async function sync({force=false} = {}) {
    if(busy||!online()||!uid())return;
    busy=true;
    const owner=uid();
    let leaseToken;const needsLease=!globalThis.navigator?.locks&&store.lease;
    const run=async()=>{
      if(needsLease){leaseToken=await store.lease(owner);if(!leaseToken)return;}
      for(const sale of (await store.list(owner,'sale')).sort((a,b)=>a.createdAt-b.createdAt)) {
        if(uid()!==owner||!online())break;
        if(sale.status!=='pending'||(!force&&sale.nextAttempt>now()))continue;
        if(needsLease&&!await store.lease(owner,leaseToken))break;
        try {
          const result=await invoke(sale.payload);
          if(!result?.ok||!result.bookingCode||result.offlineVersion!==1||result.offlineOperationId!==sale.id)throw new Error('السيرفر لم يؤكد رقم الشيك؛ راجع المزامنة');
          sale.status='confirmed';sale.result=result;sale.confirmedAt=now();sale.error='';
        } catch(error) {
          sale.attempts++;
          if(transientFailure(error)||!online()){sale.nextAttempt=now()+Math.min(300000,5000*2**Math.min(sale.attempts,6));sale.error='الاتصال لم يؤكد الحفظ؛ ستتم إعادة المحاولة بنفس معرّف الشيك';}
          else {sale.status='conflict';sale.error=error.message||'الشيك يحتاج مراجعة الإدارة';}
        }
        await store.put(owner,'sale',sale.id,sale);changed();if(sale.status==='confirmed')globalThis.window?.dispatchEvent(new Event('offline-pos-confirmed'));
      }
    };
    try {
      // Browser lock prevents competing tabs sending the same device outbox.
      // Server idempotency also protects retries after a lost response/crash.
      if(globalThis.navigator?.locks)await navigator.locks.request('el-mezaen-pos-'+owner,{ifAvailable:true},lock=>lock?run():undefined);
      else await run();
    }finally{busy=false;if(leaseToken)await store.lease(owner,leaseToken,true);await store.prune?.(owner);}
  }
  async function retry(id) {
    const sale=await store.get(uid(),'sale',id);if(!sale||sale.status==='confirmed')return;
    sale.status='pending';sale.nextAttempt=0;sale.error='';await store.put(uid(),'sale',id,sale);changed();await sync();
  }
  return {context,readiness,enqueue,list,sync,retry};
}
