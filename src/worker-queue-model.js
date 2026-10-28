export function workerDayQueue(bookings=[],dateKey,activeBookingId=null){const active=bookings.filter(row=>row.source!=='pos'&&row.bookingDate===dateKey&&['pending','confirmed','arrived'].includes(row.status)).sort((a,b)=>String(a.bookingTime).localeCompare(String(b.bookingTime))||String(a.id||a.code).localeCompare(String(b.id||b.code)));return {serving:active.filter(row=>(row.id||row.code)===activeBookingId),pending:active.filter(row=>row.status==='pending'),waiting:active.filter(row=>['confirmed','arrived'].includes(row.status)&&(row.id||row.code)!==activeBookingId),upcoming:bookings.filter(row=>row.source!=='pos'&&row.bookingDate>dateKey&&['pending','confirmed'].includes(row.status)).sort((a,b)=>`${a.bookingDate} ${a.bookingTime}`.localeCompare(`${b.bookingDate} ${b.bookingTime}`)),shop:bookings.filter(row=>row.source==='pos'&&row.paymentStatus==='unpaid')};}
export function workerNowState(member,{live,period,booking,clock}){
 if(member.present!==true)return {state:'absent',label:'لم يسجل حضورًا فعالًا بالفرع'};
 if(live)return {state:'busy',label:live.overdue?'الخدمة تجاوزت وقتها؛ تحتاج إنهاء أو تمديد':'مشغول في خدمة'};
 if(period)return {state:'busy',label:({busy:'مشغول مؤقتًا',break:'في راحة',leave:'غير متاح'})[period.kind]+' حتى '+period.endTime};
 if(booking)return {state:'reserved',label:'موعد محجوز حاليًا؛ راجع العميل'};
 const day=new Date(clock.dateKey+'T12:00:00Z').getUTCDay();if(member.available===false||member.workDays?.length&&!member.workDays.includes(day)||clock.time<(member.shiftStart||'00:00')||clock.time>=(member.shiftEnd||'23:59'))return {state:'off',label:'خارج وقت عمله أو متوقف عن الحجز'};
 return {state:'available',label:'حاضر — متاح بالمحل'};
}
