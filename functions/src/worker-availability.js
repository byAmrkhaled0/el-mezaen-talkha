import {assignmentCandidates} from './booking-assignment.js';
import {activeServiceLeaves} from './worker-services.js';
import {bookingPresence,presentForBooking} from './booking-readiness.js';
import {createHash} from 'node:crypto';
import {isValidDateKey} from './core.js';
import {timedBusyInterval} from './timed-availability.js';
export function workerAvailabilityHandlers(d){
 const fail=(c,m)=>{throw new d.HttpsError(c,m)};
 async function access(r){await d.requireLiveStaff(r);if(!['admin','manager','cashier'].includes(r.auth.token.role))fail('permission-denied','إدارة التوفر للأدمن والكاشير فقط');if(r.auth.token.role!=='admin')d.requirePermission(r,'teamOperations');const branchId=r.data?.branchId;if(!['talkha','mashaya'].includes(branchId))fail('invalid-argument','اختر فرعًا محددًا');d.requireBranchAccess(r,branchId);const branch=await d.db.doc('branches/'+branchId).get();if(!branch.exists||branch.data().active===false)fail('failed-precondition','الفرع غير متاح');return branchId;}
 function date(value){if(!isValidDateKey(value))fail('invalid-argument','التاريخ غير صحيح');return value;}
 async function read(r){
 const branchId=await access(r),dateKey=date(r.data?.dateKey),bookingId=r.data?.bookingId;
 if(bookingId)d.requirePermission(r,'bookings');
 if(bookingId&&!/^[A-Za-z0-9_-]{1,100}$/.test(bookingId))fail('invalid-argument','مرجع الحجز غير صحيح');
 const [staff,leaves]=await Promise.all([d.db.collection('staff').where('branchIds','array-contains',branchId).limit(501).get(),d.db.collection('workerLeaves').where('dateKey','==',dateKey).where('branchId','in',[branchId,'all']).where('active','==',true).limit(1001).get()]);
 if(staff.size>500||leaves.size>1000)fail('resource-exhausted','نتائج الجدول تجاوزت حد العرض الآمن');
 const members=staff.docs.filter(row=>row.data().active!==false).map(row=>({...row.data(),id:row.id})),ids=new Set(members.map(row=>row.id)),nowMs=Date.now(),clock=d.now?.()||{dateKey:d.today(),time:'00:00'},presenceRows=dateKey===d.today()?await bookingPresence(d.db,members,branchId,dateKey,nowMs,true):[],presentIds=new Set(presenceRows.filter(row=>presentForBooking(row.bookingAttendance,row,branchId,dateKey,nowMs)).map(row=>row.id));
 const periods=leaves.docs.filter(row=>ids.has(row.data().staffId)).map(row=>{const x=row.data();return {id:row.id,staffId:x.staffId,branchId:x.branchId,dateKey:x.dateKey,startTime:x.startTime,endTime:x.endTime,kind:x.kind||'leave',reason:String(x.reason||''),canCancel:!x.sourceRequestId&&!x.sourceServiceSessionId&&x.branchId===branchId};});
 let candidates;
 if(bookingId){const booking=await d.db.doc('bookings/'+bookingId).get();if(!booking.exists||booking.data().branchId!==branchId)fail('permission-denied','الحجز خارج الفرع');if(booking.data().bookingDate!==dateKey||!['pending','confirmed'].includes(booking.data().status)||booking.data().paymentStatus==='paid')fail('failed-precondition','الحجز لا يقبل تحويل العامل');const [daily,live,branch,settings]=await Promise.all([d.db.collection('bookings').where('branchId','==',branchId).where('bookingDate','==',dateKey).where('status','in',['pending','confirmed','arrived']).limit(501).get(),Promise.all(Array.from({length:Math.ceil(members.length/21)},(_,index)=>activeServiceLeaves(d.db,dateKey,clock,d.HttpsError,members.slice(index*21,index*21+21).map(row=>row.id)))).then(groups=>groups.flat()),d.db.doc('branches/'+branchId).get(),d.readSettings()]);if(daily.size>500)fail('resource-exhausted','حجوزات اليوم تجاوزت حد فحص التحويل الآمن');candidates=assignmentCandidates({booking:{...booking.data(),id:booking.id},staff:members,bookings:daily.docs.map(row=>({...row.data(),id:row.id})),leaves:[...periods,...live],settings:{...settings,...branch.data()},clock,presentIds});}
 return {branchId,dateKey,serverClock:clock,serverNowMs:nowMs,staff:members.map(row=>({id:row.id,nameAr:String(row.nameAr||row.id),available:row.available!==false,workDays:row.workDays||[],shiftStart:row.shiftStart||'00:00',shiftEnd:row.shiftEnd||'23:59',present:dateKey===d.today()?presentIds.has(row.id):null})),periods,...(candidates?{candidates:candidates.slice(0,50),candidateCount:candidates.length}:{})};
 }
 function authorize(r,branchId){return row=>{if(row.branchId!==branchId)fail('permission-denied','الفترة لا تتبع الفرع المختار');d.requireBranchAccess(r,row.branchId);if(row.dateKey<d.today())fail('failed-precondition','لا يمكن تغيير فترة سابقة');};}
 async function save(r){const branchId=await access(r),timed=Object.hasOwn(r.data||{},'durationMinutes');let data={...(r.data||{})};if(timed){try{data={...data,...timedBusyInterval(data.durationMinutes,d.now()),kind:'busy'};}catch(error){fail('invalid-argument',error.message);}}const dateKey=date(data.dateKey);if(!/^[A-Za-z0-9_-]{1,100}$/.test(data.staffId||'')||!['busy','break','leave'].includes(data.kind)||!/^\d{2}:\d{2}$/.test(data.startTime||'')||!/^\d{2}:\d{2}$/.test(data.endTime||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.endTime)||!/^[A-Za-z0-9_-]{16,100}$/.test(data.idempotencyKey||''))fail('invalid-argument','بيانات الفترة غير صحيحة');
 const payload={staffId:data.staffId,branchId,dateKey,startTime:data.startTime,endTime:data.endTime,kind:data.kind,reason:String(data.reason||'').trim().slice(0,200),active:true};
 const id='unavail_'+createHash('sha256').update(JSON.stringify([r.auth.uid,data.idempotencyKey])).digest('hex');
 const timedFingerprint=timed?createHash('sha256').update(JSON.stringify([r.auth.uid,branchId,data.staffId,data.durationMinutes])).digest('hex'):null;
 if(timed){payload.timedFingerprint=timedFingerprint;payload.durationMinutes=data.durationMinutes;payload.autoAvailable=true;}
 return d.schedule.mutateManual(d.db.doc('workerLeaves/'+id),payload,authorize(r,branchId),{actorUid:r.auth.uid,actorRole:r.auth.token.role,source:'worker-availability'},(next,before)=>{if(timed&&before){if(before.timedFingerprint!==timedFingerprint)fail('already-exists','نفس الطلب محفوظ لعامل أو مدة مختلفة');return before;}if(!timed&&before?.timedFingerprint)fail('failed-precondition','استخدم طلبًا جديدًا للانشغال المؤقت');return next;});
 }
 async function cancel(r){const branchId=await access(r),id=r.data?.id;if(!/^[A-Za-z0-9_-]{1,100}$/.test(id||''))fail('invalid-argument','مرجع الفترة غير صحيح');const ref=d.db.doc('workerLeaves/'+id);const before=await ref.get();if(!before.exists)fail('not-found','الفترة غير موجودة');return d.schedule.mutateManual(ref,{active:false},authorize(r,branchId),{actorUid:r.auth.uid,actorRole:r.auth.token.role,source:'worker-availability'});}
 return {read,save,cancel};
}
