// Never produce a partial CSV and call it a complete export.
export async function collectRecordPages(read,filters,{onProgress=()=>{},maxPages=500}={}){
  const rows=new Map(),seen=new Set();let cursor=null;
  for(let index=0;index<maxPages;index++){
    const page=await read({...filters,...(cursor?{cursor}:{})});
    for(const row of page.items)rows.set(row.id,row);
    onProgress(rows.size);
    if(!page.nextCursor)return [...rows.values()];
    if(seen.has(page.nextCursor))throw Error('تعذر إكمال التصدير؛ مؤشر سجل متكرر');
    seen.add(page.nextCursor);cursor=page.nextCursor;
  }
  throw Error('السجل كبير؛ اختار فترة أصغر وأعد التصدير. لم يتم تصدير ملف ناقص.');
}
