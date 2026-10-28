import {createHash} from 'node:crypto';

const types = new Set(['SUPPLY','EQUIPMENT','CANCELLATION','RESCHEDULE','REFUND']);
const customerTypes = new Set(['CANCELLATION','RESCHEDULE','REFUND']);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Requests are an audited follow-up queue. Resolving a request never posts money,
// changes inventory, cancels a booking or bypasses existing approval workflows.
export function branchRequestHandlers(d) {
  const fail = (code,message) => { throw new d.HttpsError(code,message); };
  const text = (value,max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
  async function access(r) {
    await d.requireLiveStaff(r);
    if (!['admin','manager','cashier'].includes(r.auth?.token?.role)) fail('permission-denied','هذا القسم للأدمن وكاشير الفرع');
    d.requirePermission(r,'pos');
    const branchId=r.data?.branchId;
    if (!['talkha','mashaya'].includes(branchId)) fail('invalid-argument','اختر فرعًا محددًا');
    d.requireBranchAccess(r,branchId);
    return branchId;
  }
  const view = s => {
    const row=s.data();
    return {id:s.id,branchId:row.branchId,group:row.group,type:row.type,title:row.title,details:row.details,bookingId:row.bookingId||null,status:row.status,version:row.version,createdBy:row.createdBy,resolution:row.resolution||'',createdAt:row.createdAt?.toDate?.().toISOString()||null};
  };
  async function submit(r) {
    const branchId=await access(r),input=r.data||{},type=input.type;
    if (!types.has(type)) fail('invalid-argument','نوع الطلب غير صحيح');
    if (customerTypes.has(type)) d.requirePermission(r,'bookings');
    const title=text(input.title,100),details=text(input.details,600),bookingId=customerTypes.has(type)?input.bookingId:'';
    if(title.length<3||details.length<3||customerTypes.has(type)&&!identifier(bookingId)) fail('invalid-argument','أدخل عنوانًا وتفاصيل ورقم عملية صحيحًا لطلبات العملاء');
    if(typeof input.idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey)) fail('invalid-argument','معرف الطلب غير صحيح');
    const id='branchreq_'+hash([r.auth.uid,input.idempotencyKey]),ref=d.db.doc('branchWorkRequests/'+id),fingerprint=hash({branchId,type,title,details,bookingId});
    return d.db.runTransaction(async tx=>{
      const previous=await tx.get(ref);
      if(previous.exists){if(previous.data().fingerprint!==fingerprint)fail('already-exists','معرف الطلب مستخدم ببيانات مختلفة');return {ok:true,idempotent:true,id};}
      const branch=await tx.get(d.db.doc('branches/'+branchId));
      if(!branch.exists||branch.data().active===false)fail('failed-precondition','الفرع غير متاح');
      if(bookingId){const booking=await tx.get(d.db.doc('bookings/'+bookingId));if(!booking.exists||booking.data().branchId!==branchId)fail('permission-denied','العملية غير متاحة في الفرع');}
      const at=d.FieldValue.serverTimestamp();
      tx.create(ref,{branchId,type,group:customerTypes.has(type)?'customer':'needs',title,details,bookingId:bookingId||null,status:'NEW',version:1,createdBy:r.auth.uid,fingerprint,createdAt:at,updatedAt:at});
      tx.create(d.db.collection('activityLogs').doc(),{action:'branch-request-create',branchId,requestId:id,type,actorUid:r.auth.uid,createdAt:at});
      return {ok:true,id};
    });
  }
  async function list(r) {
    const branchId=await access(r),group=r.data?.group;
    if(!['customer','needs'].includes(group))fail('invalid-argument','مجموعة الطلبات غير صحيحة');
    if(group==='customer')d.requirePermission(r,'bookings');
    let query=d.db.collection('branchWorkRequests').where('branchId','==',branchId).where('group','==',group).orderBy('createdAt','desc');
    if(r.data?.cursor){if(!identifier(r.data.cursor))fail('invalid-argument','مرجع الصفحة غير صحيح');const cursor=await d.db.doc('branchWorkRequests/'+r.data.cursor).get();if(!cursor.exists||cursor.data().branchId!==branchId||cursor.data().group!==group)fail('permission-denied','الصفحة خارج نطاق الطلب');query=query.startAfter(cursor);}
    const result=await query.limit(21).get(),page=result.docs.slice(0,20);
    return {branchId,group,items:page.map(view),nextCursor:result.size>20?page.at(-1).id:null};
  }
  async function update(r) {
    const branchId=await access(r),input=r.data||{};
    if(r.auth.token.role!=='admin')fail('permission-denied','حسم متابعة الطلبات للأدمن');
    if(!identifier(input.id)||!Number.isSafeInteger(input.expectedVersion)||!['IN_PROGRESS','RESOLVED','REJECTED'].includes(input.status))fail('invalid-argument','الإجراء غير صحيح');
    const resolution=text(input.resolution,400);
    if(resolution.length<3)fail('invalid-argument','اكتب إجراء المتابعة أو سبب الحسم');
    return d.db.runTransaction(async tx=>{
      const ref=d.db.doc('branchWorkRequests/'+input.id),snapshot=await tx.get(ref),row=snapshot.data();
      if(!snapshot.exists||row.branchId!==branchId)fail('permission-denied','الطلب خارج نطاق الفرع');
      if(row.version!==input.expectedVersion)fail('aborted','تغير الطلب؛ حدّث القائمة');
      if(['RESOLVED','REJECTED'].includes(row.status))fail('failed-precondition','تم حسم متابعة هذا الطلب');
      const at=d.FieldValue.serverTimestamp();
      tx.update(ref,{status:input.status,resolution,version:row.version+1,updatedBy:r.auth.uid,updatedAt:at});
      tx.create(d.db.collection('activityLogs').doc(),{action:'branch-request-update',branchId,requestId:input.id,status:input.status,actorUid:r.auth.uid,resolution,createdAt:at});
      return {ok:true};
    });
  }
  return {submit,list,update};
}
