import {showOfflineReceipt} from './offline-receipt.js';
import {isOfflineMode} from './offline-connectivity.js';
import './offline-admin.css';
export function mountOfflineDesk({desk,onError,branch=()=>document.querySelector("#posBranch")?.value}) {
  const panel=document.createElement('details');panel.className='offline-desk';panel.id='offlineSalesDesk';
  const summary=document.createElement('summary');summary.textContent='حالة الاتصال';
  const body=document.createElement('div');body.className='offline-desk-body';
  const heading=document.createElement('h2');heading.textContent='الاتصال ومزامنة الشيكات';
  const close=document.createElement('button');close.type='button';close.className='small-button';close.textContent='إغلاق';close.onclick=()=>{panel.open=false;summary.focus();};
  const status=document.createElement('p');status.setAttribute('role','status');
  const readiness=document.createElement('p');readiness.className='offline-readiness';readiness.setAttribute('role','status');
  const help=document.createElement('p');help.textContent='التجهيز والتحويل للبيع بدون نت والمزامنة بيتموا تلقائيًا على الجهاز بعد الدخول بالإنترنت وفتح وردية. بدون نت: شيكات نقدية جديدة فقط. احتفظ بنفس حسابك وبيانات المتصفح لحد تأكيد الشيكات. الخصومات والاسترجاع وإغلاق الخزنة تحتاج اتصال.';
  const sync=document.createElement('button');sync.type='button';sync.className='small-button';sync.textContent='مزامنة الآن';
  const rows=document.createElement('div');rows.className='offline-sales-list';
  body.append(close,heading,status,readiness,help,sync,rows);panel.append(summary,body);document.querySelector('#adminApp .admin-main')?.prepend(panel);
  let revision=0,renderTimer,limit=100;
  const more=document.createElement('button');more.type='button';more.className='small-button';more.textContent='عرض شيكات أقدم';more.hidden=true;more.onclick=()=>{limit+=100;void update();};body.append(more);
  const schedule=()=>{clearTimeout(renderTimer);renderTimer=setTimeout(()=>void update(),200);};
  const update=async()=>{
    const current=++revision;
    try{
      const [sales,prepared]=await Promise.all([desk.list(),desk.readiness(branch())]);if(current!==revision)return;
      readiness.textContent=prepared.ready?'الحفظ التلقائي جاهز في '+(({talkha:'فرع طلخا',mashaya:'فرع المشاية'})[branch()]||branch()):'البيع بدون نت غير جاهز: '+prepared.message;
      readiness.dataset.ready=String(prepared.ready);
      const pending=sales.filter(s=>s.status!=='confirmed'),conflicts=pending.filter(s=>s.status==='conflict');
      summary.textContent=`${isOfflineMode()?'بدون نت': 'متصل'}${isOfflineMode()&&!prepared.ready?' · البيع غير جاهز':''}${pending.length?' · '+pending.length+' شيك منتظر':''}${conflicts.length?' · يحتاج مراجعة':''}`;
      panel.dataset.connection=isOfflineMode()?'offline':'online';summary.setAttribute('aria-label',summary.textContent+'، عرض تفاصيل المزامنة');
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
  sync.onclick=()=>desk.sync({force:true}).then(update).catch(onError);
  const onOnline=()=>{void update();void desk.sync({force:true}).catch(onError);};
  window.addEventListener('online',onOnline);window.addEventListener('offline',update);window.addEventListener('offline-pos-changed',schedule);window.addEventListener('offline-mode-changed',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)onOnline();});
  setInterval(()=>{if(!document.hidden)void desk.sync().catch(onError);},15000);
  void update();void desk.sync({force:true}).catch(onError);
  return {update,printSale:showOfflineReceipt};
}
