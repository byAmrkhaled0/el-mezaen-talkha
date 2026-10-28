import {createHash} from 'node:crypto';
import {cairoAppointmentMillis} from './cairo-time.js';
const millis=value=>value?.toMillis?.()??(typeof value==='number'?value:Date.parse(value||''));
export const attendanceQueueId=uid=>createHash('sha256').update(uid).digest('hex').slice(0,32);
// Presence is needed for today's on-site bookings. Future days use the staff schedule.
// The canonical attendance queue is changed atomically by GPS check-in/out and auto-close.
export function presentForBooking(queue,staff,branchId,bookingDate,nowMs=Date.now(),endTime=''){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(nowMs));
 if(bookingDate!==today)return true;
 if(!staff?.userUid||queue?.state!=='ACTIVE'||queue.uid!==staff.userUid||queue.staffId!==staff.id||queue.branchId!==branchId)return false;
 const due=millis(queue.dueAt),start=millis(queue.startedAt);
 return Number.isFinite(due)&&Number.isFinite(start)&&start<=nowMs&&due>nowMs&&(!endTime||cairoAppointmentMillis(bookingDate,endTime)<=due);
}
export async function bookingPresence(db,staff,branchId,bookingDate,nowMs=Date.now(),includeAbsent=false){
 if(bookingDate!==new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(nowMs)))return staff;
 const refs=staff.filter(row=>row.userUid).map(row=>db.doc('attendanceShiftQueue/'+attendanceQueueId(row.userUid)));
 const rows=refs.length?await db.getAll(...refs):[];
 const byId=new Map(rows.map(row=>[row.id,row.data()]));
 const members=staff.map(member=>({...member,bookingAttendance:byId.get(attendanceQueueId(member.userUid||''))}));
 return includeAbsent?members:members.filter(member=>presentForBooking(member.bookingAttendance,member,branchId,bookingDate,nowMs));
}
export async function checkBookingPresence(tx,db,staff,branchId,date,endTime,nowMs=Date.now()){
 if(bookingDateIsFuture(date,nowMs))return true;
 const snapshot=staff.userUid?await tx.get(db.doc('attendanceShiftQueue/'+attendanceQueueId(staff.userUid))):null;
 return presentForBooking(snapshot?.data(),staff,branchId,date,nowMs,endTime);
}
// Booking review belongs to branch operators. Workers receive reviewed assignments.
export function workerDecisionAllowed(){return false;}
export function workerBookingVisible(booking){return !(booking?.source==='website'&&booking.status==='pending');}

function bookingDateIsFuture(date,nowMs){return date>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(nowMs));}

export const appointmentDuration=items=>Math.max(5,items.reduce((sum,item)=>sum+Number(item.duration||0)*Math.max(1,Number(item.qty||1)),0));
