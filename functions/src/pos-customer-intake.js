// Optional POS intake fields. Never accept wallet, consent or authorization fields.
export function parsePosCustomerIntake(value, today = new Date().toISOString().slice(0,10)) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw Error('بيانات العميل الإضافية غير صحيحة');
  const limits={acquisitionSource:60,gender:10,birthDate:10,notes:200},result={};
  for(const key of Object.keys(value)) {
    if(!(key in limits)||!Object.hasOwn(limits,key)||typeof value[key]!=='string'||value[key].length>limits[key])throw Error('بيانات العميل الإضافية غير صحيحة');
    const text=value[key].trim();if(text)result[key]=text;
  }
  if(result.acquisitionSource&&!['walk_in','recommendation','facebook','instagram','website','other'].includes(result.acquisitionSource))throw Error('مصدر العميل غير صحيح');
  if(result.gender&&!['male','female'].includes(result.gender))throw Error('الجنس غير صحيح');
  if(result.birthDate){const date=new Date(result.birthDate+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(result.birthDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==result.birthDate||result.birthDate<'1900-01-01'||result.birthDate>today)throw Error('تاريخ الميلاد غير صحيح');}
  return result;
}
