import {showOfflineReceipt} from './offline-receipt.js';
import {isOfflineMode,setDeviceOffline} from './offline-connectivity.js';
import './offline-admin.css';
export function mountOfflineDesk({desk,onError,branch=()=>document.querySelector("#posBranch")?.value,prepare}) {
  const panel=document.createElement('details');panel.className='offline-desk';panel.id='offlineSalesDesk';
  const summary=document.createElement('summary');summary.textContent='العمل بدون نت ومزامنة الشيكات';
  const status=document.createElement('p');status.setAttribute('role','status');
  const readiness=document.createElement('p');readiness.className='offline-readiness';readiness.setAttribute('role','status');
  const setup=document.createElement('button');setup.type='button';setup.className='small-button';setup.textContent='تجهيز الجهاز للأوفلاين';setup.hidden=!prepare;
  const help=document.createElement('p');help.textContent='جهّز شاشة البيع ووردية مفتوحة بالإنترنت، وحدّث الصفحة مرة بعد أول تجهيز. جلسة الأوفلاين وبياناتها صالحة 24 ساعة. حافظ على نفس تبويب الحساب ولا تمسح بيانات المتصفح. بدون نت: مبيعات نقدية جديدة فقط، بدون خصومات أو محفظة. تسجيل الحضور والتحصيل من حجز والاسترجاع وإغلاق الخزنة تحتاج اتصال. احتفظ بالجهاز والبيانات لحد تأكيد كل الشيكات.';
  const sync=document.createElement('button');sync.type='button';sync.className='small-button';sync.textContent='مزامنة الآن';
  const offline=document.createElement('button');offline.type='button';offline.className='small-button';offline.textContent='التبديل لوضع البيع بدون نت';offline.onclick=()=>{setDeviceOffline(!isOfflineMode());void update();};
  const rows=document.createElement('div');rows.className='offline-sales-list';
  panel.append(summary,status,readiness,setup,help,offline,sync,rows);document.querySelector('#adminApp .admin-main')?.prepend(panel);
  let revision=0,renderTimer,limit=100;
  const more=document.createElement('button');more.type='button';more.className='small-button';more.textContent='عرض شيكات أقدم';more.hidden=true;more.onclick=()=>{limit+=100;void update();};panel.append(more);
  const schedule=()=>{clearTimeout(renderTimer);renderTimer=setTimeout(()=>void update(),200);};
  const update=async()=>{
    const current=++revision;
    try{
      const [sales,prepared]=await Promise.all([desk.list(),desk.readiness(branch())]);if(current!==revision)return;
      readiness.textContent=prepared.ready?'الجهاز جاهز للبيع بدون نت في '+(({talkha:'فرع طلخا',mashaya:'فرع المشاية'})[branch()]||branch()):prepared.message;
      readiness.dataset.ready=String(prepared.ready);
      const pending=sales.filter(s=>s.status!=='confirmed'),conflicts=pending.filter(s=>s.status==='conflict');
      summary.textContent=pending.length?`مزامنة الشيكات · ${pending.length} منتظر · ${conflicts.length} يحتاج مراجعة`:'العمل بدون نت ومزامنة الشيكات';
      offline.textContent=isOfflineMode()?'الرجوع لوضع الاتصال':'التبديل لوضع البيع بدون نت';offline.setAttribute('aria-pressed',String(isOfflineMode()));
      more.hidden=sales.length<=limit;
      panel.dataset.pending=String(pending.length>0);status.textContent=`${isOfflineMode()?'وضع الأوفلاين':'متصل'} · ${pending.length} شيك بإجمالي ${pending.reduce((sum,sale)=>sum+sale.total,0)} ج.م في انتظار التأكيد · ${conflicts.length} يحتاج مراجعة. أرقام الخزنة المعروضة لا تشمل الشيكات المنتظرة.`;
      rows.replaceChildren();
      for(const sale of sales.slice(-limit).reverse()){
        const row=document.createElement('article'),label=document.createElement('strong'),detail=document.createElement('p');
        label.textContent=`${sale.status==='confirmed'?'تمت المزامنة':sale.status==='conflict'?'يحتاج مراجعة':'في انتظار المزامنة'} · ${sale.result?.bookingCode||sale.id} · ${sale.total} ج.م`;
        detail.textContent=sale.error||new Date(sale.createdAt).toLocaleString('ar-EG');row.append(label,detail);
        const print=document.createElement('button');print.type='button';print.className='small-button';print.textContent='عرض وطباعة نسخة الجهاز';print.onclick=()=>showOfflineReceipt(sale,print);row.append(print);
        if(sale.status==='conflict') {const retry=document.createElement('button');retry.type='button';retry.className='small-button';retry.textContent='إعادة فحص نفس الشيك';retry.onclick=()=>desk.retry(sale.id).catch(onError);row.append(retry);}
        rows.append(row);
      }
    }catch(error){status.textContent='حفظ الأوفلاين غير جاهز على الجهاز: '+error.message;}
  };
  setup.onclick=async()=>{setup.disabled=true;try{await prepare();await update();}catch(error){onError(error);}finally{setup.disabled=false;}};
  sync.onclick=()=>desk.sync({force:true}).then(update).catch(onError);
  const onOnline=()=>{void update();void desk.sync({force:true}).catch(onError);};
  window.addEventListener('online',onOnline);window.addEventListener('offline',update);window.addEventListener('offline-pos-changed',schedule);window.addEventListener('offline-mode-changed',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)onOnline();});
  setInterval(()=>{if(!document.hidden)void desk.sync().catch(onError);},15000);
  void update();void desk.sync({force:true}).catch(onError);
  return {update,printSale:showOfflineReceipt};
}
