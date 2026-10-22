// Explicit customer-editable fields only. Phone and ownership come from verified Auth.
export function parseCustomerProfile(input, today = new Date().toISOString().slice(0,10)) {
  const fail = message => { throw new Error(message); };
  const allowed = new Set(['firstName','lastName','email','city','address','birthDate','preferredBranchId']);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key=>!allowed.has(key))) fail('بيانات الملف غير صحيحة');
  const text = (key,max,required=false) => {
    if(input[key] != null && typeof input[key] !== 'string') fail('راجع البيانات المدخلة');
    const value=String(input[key]??'').normalize('NFKC').trim().replace(/\s+/g,' ');
    if(value.length>max || /[<>\x00-\x1f]/.test(value) || (required && value.length<2)) fail('راجع الاسم والبيانات المدخلة');
    return value;
  };
  const profile={firstName:text('firstName',50,true),lastName:text('lastName',50,true),email:text('email',254).toLowerCase(),city:text('city',80),address:text('address',200),birthDate:text('birthDate',10),preferredBranchId:text('preferredBranchId',40)};
  if(profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) fail('البريد الإلكتروني غير صحيح');
  if(profile.birthDate){const date=new Date(profile.birthDate+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==profile.birthDate||profile.birthDate>today||profile.birthDate<'1900-01-01')fail('تاريخ الميلاد غير صحيح');}
  if(profile.preferredBranchId && !/^[a-z0-9-]{2,40}$/.test(profile.preferredBranchId))fail('الفرع غير صحيح');
  return profile;
}
export function publicCustomerProfile(record={}) {
  return Object.fromEntries(['firstName','lastName','email','city','address','birthDate','preferredBranchId'].map(key=>[key,typeof record[key]==='string'?record[key]:'']));
}
