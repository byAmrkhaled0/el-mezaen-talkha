import {parsePage} from './cursor-pagination.js';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,40);
const idPattern=/^[A-Za-z0-9_-]{1,100}$/;
export function orderAdditionHandlers(d){
 const {db,FieldValue,HttpsError}=d;
 const fail=(code,message)=>{throw new HttpsError(code,message);};
 const id=x=>{if(typeof x!=='string'||!idPattern.test(x))fail('invalid-argument','مرجع غير صحيح');return x;};
 const cents=x=>{const n=Number(x);if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*100))||Math.abs(n*100-Math.round(n*100))>0.000001)fail('failed-precondition','قيمة مالية غير صحيحة');return Math.round(n*100);};
 const stamp=()=>FieldValue.serverTimestamp();
 const sum=items=>{const value=items.reduce((n,x)=>n+cents(x.lineTotal),0);if(!Number.isSafeInteger(value))fail('failed-precondition','الإجمالي تجاوز الحد المالي');return value;};
 function unpaid(row){if(row.source!=='pos'&&!['confirmed','arrived'].includes(row.status))fail('failed-precondition','الحجز يحتاج موافقة الكاشير أولًا');if(row.paymentStatus!=='unpaid'||row.financialPosted||row.cashPosted||row.rewardPosted||row.serviceTargetsPosted||row.orderState==='PAID'||['cancelled','rejected','refunded'].includes(row.status)||['VOIDED','REFUNDED'].includes(row.orderState))fail('failed-precondition','الشيك مدفوع أو مغلق؛ الإضافات ممنوعة بعد الدفع');}
 function assigned(row,staffId){return row.staffId===staffId||(row.items||[]).some(x=>x.workerId===staffId);}
 async function actor(request){await d.requireLiveStaff(request);const role=d.requireRole(request,['admin','manager','cashier','worker']);if(role!=='worker')d.requirePermission(request,'pos');return {role,uid:request.auth.uid,staffId:role==='worker'?await d.linkedStaffId(request):null};}
 async function staffContext(tx,who,branchId){const member=await tx.get(db.doc('staff/'+id(who.staffId)));if(!member.exists||member.data().active===false||member.data().userUid!==who.uid||!member.data().branchIds?.includes(branchId))fail('permission-denied','تغير ربط العامل أو فرعه');return member.data();}
 function scope(request,branchId){if(!['talkha','mashaya'].includes(branchId))fail('invalid-argument','حدد الفرع');d.requireBranchAccess(request,branchId);}
 function lines(value){if(!Array.isArray(value)||!value.length||value.length>10)fail('invalid-argument','اختار من صنف إلى 10 أصناف');const seen=new Set();return value.map(x=>{const key=x.kind+':'+x.id;if(seen.has(key)||!['service','product','package','offer','inventory','drink'].includes(x.kind)||!Number.isInteger(x.qty)||x.qty<1||x.qty>20)fail('invalid-argument','أصناف أو كميات غير صحيحة');seen.add(key);return {id:id(x.id),kind:x.kind,qty:x.qty,option:x.kind==='inventory'?'':String(x.option||'').slice(0,40),choices:x.choices&&typeof x.choices==='object'&&!Array.isArray(x.choices)?Object.fromEntries(Object.entries(x.choices).slice(0,10).map(([k,v])=>[id(k),id(v)])): {}};});}
 async function price(tx,input,branchId,staffId,staffName){
  const catalog=input.filter(x=>!['inventory','drink'].includes(x.kind));let result=[];
  try{if(catalog.length)result=await d.priceCatalog(catalog,branchId,tx);}catch{fail('failed-precondition','إحدى الخدمات أو الباقات غير متاحة؛ راجع الاختيارات');}
  const extras=input.filter(x=>['inventory','drink'].includes(x.kind));
  const snapshots=extras.length?await tx.getAll(...extras.map(x=>db.doc((x.kind==='inventory'?'inventoryItems':'drinks')+'/'+x.id))):[];
  snapshots.forEach((doc,i)=>{const line=extras[i],row=doc.data();if(!doc.exists||row.active===false||![branchId,...(line.kind==='drink'?['all']:[])].includes(row.branchId)||line.kind==='inventory'&&row.category==='supply')fail('failed-precondition','الصنف غير متاح في الفرع');if(line.kind==='inventory'&&(typeof row.stockQty!=='number'||!Number.isFinite(row.stockQty)||row.stockQty<line.qty))fail('failed-precondition','كمية المخزون لا تكفي');if(line.kind==='drink'&&line.option&&!(row.drinkOptions||[]).includes(line.option))fail('failed-precondition','اختيار المشروب غير متاح');const unitPrice=cents(line.kind==='inventory'?row.sellingPrice:row.price)/100;result.push({...line,nameAr:row.nameAr||line.id,nameEn:row.nameEn||row.nameAr||line.id,unitPrice,lineTotal:cents(unitPrice*line.qty)/100,duration:0,staffRequired:false});});
  return result.map(({ref,...x})=>({...x,unitPrice:cents(x.unitPrice)/100,lineTotal:cents(x.lineTotal)/100,workerId:x.staffRequired?staffId:'none',workerNameAr:x.staffRequired?staffName:'بدون عامل',workerNameEn:'',qty:Number(x.qty||1)}));
 }
 const quoteKey=items=>hash(items.map(x=>({id:x.id,kind:x.kind,qty:x.qty,unitPrice:x.unitPrice,lineTotal:x.lineTotal,duration:x.duration,choices:x.choices||null,option:x.option||null})).sort((a,b)=>(a.kind+a.id).localeCompare(b.kind+b.id)));
 function projectOrder(doc){const x=doc.data();return {id:doc.id,code:x.code||doc.id,customerName:x.customerName||'عميل',branchId:x.branchId,total:x.total,paymentStatus:x.paymentStatus,source:x.source,items:(x.items||[]).map(y=>({id:y.id,kind:y.kind,nameAr:y.nameAr||y.id,qty:Number(y.qty||1),workerId:y.workerId||'none',...(Number.isFinite(y.unitPrice)?{unitPrice:y.unitPrice}:{}),...(Number.isFinite(y.lineTotal)?{lineTotal:y.lineTotal}:{})}))};}
 async function list(request){const who=await actor(request),data=request.data||{},branchId=data.branchId;scope(request,branchId);
  if(who.role==='worker')await staffContext({get:ref=>ref.get()},who,branchId);
  if(data.requestId){const doc=await db.doc('orderAdditionRequests/'+id(data.requestId)).get();if(!doc.exists)fail('not-found','طلب الإضافة غير موجود');if(doc.data().branchId!==branchId||who.role==='worker'&&doc.data().staffId!==who.staffId)fail('permission-denied','طلب الإضافة لا يتبع هذا السياق');return {items:[d.cleanDoc(doc)]};}
  if(data.view==='catalog'){if(who.role!=='worker')fail('permission-denied','خاص باختيارات العامل');return d.catalog({...data,take:25},branchId);}
  if(data.view==='orders'){
   if(who.role!=='worker')fail('permission-denied','خاص بالعامل');
   if(data.bookingId){const doc=await db.doc('bookings/'+id(data.bookingId)).get();if(!doc.exists)fail('not-found','الشيك غير موجود');if(doc.data().branchId!==branchId||!assigned(doc.data(),who.staffId))fail('permission-denied','الشيك لا يتبعك في الفرع');unpaid(doc.data());return {items:[projectOrder(doc)]};}
   const base=()=>db.collection('bookings').where('branchId','==',branchId).where('source','==','pos').where('paymentStatus','==','unpaid');
   const queries=[base().where('staffId','==',who.staffId),base().where('workerIds','array-contains',who.staffId)];
   const results=await Promise.all(queries.map(q=>q.orderBy('createdAt','desc').limit(25).get()));
   return {items:[...new Map(results.flatMap(s=>s.docs).filter(doc=>assigned(doc.data(),who.staffId)&&!['cancelled','rejected'].includes(doc.data().status)).map(doc=>[doc.id,projectOrder(doc)])).values()].slice(0,25)};
  }
  let query=db.collection('orderAdditionRequests').where('branchId','==',branchId);
  if(who.role==='worker')query=query.where('staffId','==',who.staffId);else query=query.where('status','==','PENDING');
  let paging;try{paging=parsePage(data,50);}catch{fail('invalid-argument','صفحة الطلبات غير صحيحة');}
  query=query.orderBy('createdAt','desc');if(paging.cursor){const marker=await db.doc('orderAdditionRequests/'+id(paging.cursor)).get();if(!marker.exists||marker.data().branchId!==branchId||who.role==='worker'&&marker.data().staffId!==who.staffId)fail('permission-denied','مؤشر الصفحة لا يتبع هذا السياق');query=query.startAfter(marker);}
  const result=await query.limit(paging.take+1).get(),docs=result.docs.slice(0,paging.take);return {items:docs.map(doc=>d.cleanDoc(doc)),take:paging.take,nextCursor:result.size>paging.take?docs.at(-1).id:null};
 }
 async function submit(request){const who=await actor(request);if(who.role!=='worker')fail('permission-denied','طلب الإضافة يرسله العامل');const data=request.data||{},bookingId=id(data.bookingId),input=lines(data.items),key=data.idempotencyKey;if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(key))fail('invalid-argument','مفتاح الطلب غير صحيح');
  await d.rateLimit(request,'order-addition-submit',30,15*60*1000,who.uid);const ref=db.doc('orderAdditionRequests/'+hash([who.uid,key])),fingerprint=hash([bookingId,input,String(data.note||'').slice(0,300)]);
  const result=await db.runTransaction(async tx=>{const [prior,booking]=await tx.getAll(ref,db.doc('bookings/'+bookingId));if(!booking.exists)fail('not-found','الشيك غير موجود');const row=booking.data();scope(request,row.branchId);const staff=await staffContext(tx,who,row.branchId);if(!assigned(row,who.staffId))fail('permission-denied','الشيك غير مسند لك');if(prior.exists){if(prior.data().fingerprint!==fingerprint)fail('failed-precondition','نفس الطلب اتغير؛ راجع الإضافات');return {ok:true,id:ref.id,idempotent:true};}unpaid(row);const items=await price(tx,input,row.branchId,who.staffId,staff.nameAr||'العامل');const now=stamp();tx.create(ref,{bookingId,branchId:row.branchId,staffId:who.staffId,staffNameAr:staff.nameAr||'',customerName:row.customerName||'',baseTotal:cents(row.total)/100,items,rawItems:input,quotedTotal:sum(items)/100,quoteKey:quoteKey(items),status:'PENDING',createdBy:who.uid,note:String(data.note||'').slice(0,300),fingerprint,createdAt:now,updatedAt:now});tx.create(db.doc('workerNotifications/order_addition_pending_'+ref.id),{staffId:who.staffId,branchId:row.branchId,type:'order_addition',entityId:ref.id,title:'طلب إضافات شيك يحتاج موافقة',body:bookingId,read:false,createdAt:now});tx.create(db.doc('activityLogs/order_addition_'+ref.id),{action:'order-addition-requested',branchId:row.branchId,actorUid:who.uid,staffId:who.staffId,bookingId,entityId:ref.id,createdAt:now});return {ok:true,id:ref.id};});await d.notify?.('order_addition_pending_'+result.id,true).catch(()=>{});return result;
 }
 async function decide(request){const who=await actor(request);if(who.role==='worker')fail('permission-denied','الموافقة للكاشير أو الإدارة');const data=request.data||{},ref=db.doc('orderAdditionRequests/'+id(data.requestId));if(!['APPROVE','REJECT'].includes(data.action))fail('invalid-argument','قرار غير صحيح');
  const result=await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)fail('not-found','الطلب غير موجود');const row=snap.data();scope(request,row.branchId);const expected=data.action==='APPROVE'?'APPROVED':'REJECTED';if(row.status!=='PENDING'){if(row.status===expected)return {ok:true,idempotent:true,status:expected};fail('failed-precondition','الطلب اتاخد فيه قرار بالفعل');}
   const orderRef=db.doc('bookings/'+id(row.bookingId)),order=await tx.get(orderRef);if(!order.exists)fail('not-found','الشيك غير موجود');const booking=order.data();if(booking.branchId!==row.branchId)fail('permission-denied','الشيك تغير فرعه');
   const now=stamp();let added=[];
   if(data.action==='APPROVE'){
    unpaid(booking);if(!assigned(booking,row.staffId))fail('failed-precondition','العامل لم يعد مسندًا للشيك');
    const staff=await tx.get(db.doc('staff/'+id(row.staffId)));if(!staff.exists||staff.data().active===false||staff.data().userUid!==row.createdBy||!staff.data().branchIds?.includes(row.branchId))fail('failed-precondition','ربط العامل أو فرعه تغير');
    const branch=await tx.get(db.doc('branches/'+row.branchId));if(!branch.exists||branch.data().active===false)fail('failed-precondition','الفرع غير نشط');
    const dateKeys=[...new Set([booking.bookingDate,d.today()].filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)))];const closings=await tx.getAll(...dateKeys.map(date=>db.doc('dailyClosings/'+row.branchId+'_'+date)));if(closings.some(x=>x.exists))fail('failed-precondition','يوم الفرع مغلق؛ لا يمكن إضافة أصناف');
    added=await price(tx,row.rawItems,row.branchId,row.staffId,staff.data().nameAr||'العامل');if(quoteKey(added)!==row.quoteKey)fail('failed-precondition','السعر أو تفاصيل الصنف اتغيرت؛ ارفض الطلب واطلب مراجعة جديدة');
    const items=(booking.items||[]).map(x=>({...x}));
    for(const item of added){const same=['inventory','drink'].includes(item.kind)?items.find(x=>x.id===item.id&&x.kind===item.kind&&String(x.option||'')===String(item.option||'')):null;if(same){if(cents(same.unitPrice)!==cents(item.unitPrice))fail('failed-precondition','سعر الصنف الموجود اتغير؛ راجع الشيك');const oldQty=Number(same.qty);if(!Number.isInteger(oldQty)||oldQty<1)fail('failed-precondition','كمية الصنف القديم تحتاج مراجعة');same.qty=oldQty+item.qty;if(same.qty>(item.kind==='drink'?20:100))fail('failed-precondition','الكمية الإجمالية تجاوزت الحد المسموح');same.lineTotal=(cents(same.lineTotal)+cents(item.lineTotal))/100;}else items.push(item);}
    if(items.length>40)fail('failed-precondition','الشيك وصل للحد الأقصى للأصناف');
    const addition=sum(added),subtotal=cents(booking.subtotal)+addition,total=cents(booking.total)+addition;if(!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(total)||total>subtotal)fail('failed-precondition','إجمالي الشيك يحتاج مراجعة');
    tx.update(orderRef,{items,itemIds:items.map(x=>x.id),serviceNamesAr:items.map(x=>x.nameAr||x.id),subtotal:subtotal/100,total:total/100,finalTotal:total/100,discountPercent:subtotal?Math.round((subtotal-total)/subtotal*10000)/100:0,duration:items.reduce((n,x)=>n+Number(x.duration||0),0),productOnly:items.every(x=>!x.staffRequired),workerIds:[...new Set([booking.staffId,...items.map(x=>x.workerId)].filter(x=>x&&x!=='none'))],stockPosted:Boolean(booking.stockPosted)||added.some(x=>x.kind==='inventory'),orderRevision:Number(booking.orderRevision||0)+1,updatedAt:now});
    for(const item of added.filter(x=>x.kind==='inventory')){tx.update(db.doc('inventoryItems/'+item.id),{stockQty:FieldValue.increment(-item.qty),updatedAt:now});tx.create(db.doc('stockMovements/addition_'+ref.id+'_'+item.id),{inventoryItemId:item.id,branchId:row.branchId,bookingId:row.bookingId,quantity:-item.qty,type:'sale-addition',requestId:ref.id,dateKey:d.today(),createdAt:now,createdBy:who.uid});}
   }
   tx.update(ref,{status:expected,decidedBy:who.uid,decidedAt:now,updatedAt:now,responseNote:String(data.note||'').slice(0,300)});
   tx.create(db.doc('activityLogs/order_addition_decision_'+ref.id),{action:'order-addition-'+expected.toLowerCase(),bookingId:row.bookingId,branchId:row.branchId,requestId:ref.id,actorUid:who.uid,addedTotal:data.action==='APPROVE'?row.quotedTotal:0,createdAt:now});
   tx.create(db.doc('workerNotifications/order_addition_'+ref.id),{staffId:row.staffId,branchId:row.branchId,bookingId:row.bookingId,type:'order_addition',entityId:ref.id,title:expected==='APPROVED'?'تمت الموافقة على إضافات الشيك':'تم رفض طلب الإضافات',body:row.bookingId,read:false,createdAt:now});
   return {ok:true,status:expected,bookingId:row.bookingId};
  });
  await d.notify?.('order_addition_'+ref.id,false).catch(()=>{});return result;
 }
 return {list,submit,decide};
}
