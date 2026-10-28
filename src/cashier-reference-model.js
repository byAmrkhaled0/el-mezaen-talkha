export const CASHIER_STEPS=Object.freeze(['العميل','الملف','الخدمات','الدفع']);
export function cashierStepError(step,{firstName='',phone='',items=[]}={},validatePhone=()=>true){
 if(step===0){if(!firstName.trim())return 'اختار العميل أو اكتب اسمه أولًا';try{if(!validatePhone(phone))return 'اكتب رقم موبايل صحيح';}catch{return 'اكتب رقم موبايل صحيح';}}
 if(step===2&&!items.length)return 'اختار خدمة أو باقة واحدة على الأقل';
 return '';
}
export function groupCashierCatalog(items,{query='',section='all',category='all'}={}){
 const groups=new Map(),search=query.trim().toLocaleLowerCase('ar');
 for(const item of items){
  if(section!=='all'&&item.section!==section)continue;
  if(category&&category!=='all'&&item.section==='service'&&item.categoryId!==category)continue;
  if(search&&!`${item.nameAr} ${item.category}`.toLocaleLowerCase('ar').includes(search))continue;
  const label=item.category||({package:'الباقات',drink:'المشروبات',product:'البضاعة'})[item.section]||'خدمات أخرى';
  if(!groups.has(label))groups.set(label,[]);groups.get(label).push(item);
 }
 return [...groups].map(([label,items])=>({label,items}));
}
export function recentCashierCustomers(customers=[],bookings=[]){
 const rows=new Map();
 for(const customer of customers)if(customer.phone)rows.set(customer.phone,{...customer});
 for(const booking of bookings){
  if(!booking.phone||rows.has(booking.phone))continue;
  const parts=String(booking.customerName||'').trim().split(/\s+/);
  rows.set(booking.phone,{id:booking.phoneHash||'',firstName:booking.customer?.firstName||parts[0]||'',lastName:booking.customer?.lastName||parts.slice(1).join(' '),phone:booking.phone,fromRecent:true});
 }
 return [...rows.values()];
}
