// Presentation only. GPS validation, identity and timestamps stay authoritative on the server.
export function attendancePresentation(data,{phase='idle'}={}){
 const record=data?.attendance;
 const present=record?.status==='PRESENT';
 const completed=Boolean(record)&&!present;
 const waiting=phase==='locating'||phase==='confirming'||phase==='loading';
 const kind=waiting?phase:present?'present':completed?'completed':data?'ready':'unavailable';
 const labels={locating:'جاري تحديد موقعك',confirming:'جاري تأكيد التسجيل',loading:'جاري تحميل حضورك',unavailable:'أعد تحديث السجل',present:'حضورك مسجّل',completed:'انتهت فترة حضورك',ready:'تسجيل حضوري'};
 return {kind,label:labels[kind],present,completed,waiting,checkIn:record?.checkInTime||'—',checkOut:record?.checkOutTime||'—',hint:kind==='unavailable'?'تعذر تحديث حضورك؛ اضغط تحديث السجل':present?'يمكنك تسجيل انصرافك من نفس الفرع':completed?'تفاصيل الفترة محفوظة في سجلك الشهري':'اضغط للتحقق من موقع الفرع وتسجيل حضورك'};
}
