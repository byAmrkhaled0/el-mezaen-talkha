export const cairoTargetMonth=(date=new Date())=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).formatToParts(date).map(x=>[x.type,x.value]));return p.year+'-'+p.month;};
export function assertInitialTarget(month,existing,currentMonth=cairoTargetMonth()){
 if(month!==currentMonth)throw Object.assign(Error('تحديد التارجت متاح للشهر الحالي فقط؛ الشهر الجديد يتفتح مع بدايته بتوقيت القاهرة'),{code:'failed-precondition'});
 if(existing!=null)throw Object.assign(Error('هدف الشهر محفوظ ومقفول؛ يمكن تحديد هدف جديد الشهر القادم'),{code:'already-exists'});
}
export function rejectGenericTargetFields(collection,raw){if(['staff','branches'].includes(collection)&&Object.keys(raw||{}).some(k=>/^(monthlyTargets|monthlyRevenueTargets)(\.|$)/.test(k)))throw Object.assign(Error('استخدم شاشة التارجت الشهرية؛ لا يمكن تجاوز قفل الهدف من محرر البيانات'),{code:'permission-denied'});}
