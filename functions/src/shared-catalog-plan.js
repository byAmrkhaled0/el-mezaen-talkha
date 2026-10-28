import {createHash} from 'node:crypto';
export function planSharedCatalog(services,packages){
 const operations=[],seen=new Map(),serviceMap=new Map(services.map(r=>[r.id,r]));
 for(const [collection,rows] of [['services',services],['packages',packages]])for(const row of rows){
  const active=row.active!==false&&row.status!=='expired'&&row.catalogVisible!==false;
  if(!Array.isArray(row.branchIds)||row.branchIds.some(id=>!['talkha','mashaya'].includes(id)))throw Error(`INVALID_BRANCH_SCOPE:${collection}/${row.id}`);
  if(!row.id||typeof row.nameAr!=='string'||!Number.isFinite(Number(row.price))||Number(row.price)<0)throw Error(`INVALID_CATALOG:${collection}/${row.id}`);
  if(active&&row.type!=='product'&&(!Number.isSafeInteger(row.duration)||row.duration<5||row.duration>480||row.duration%5))throw Error(`DURATION_REQUIRES_REVIEW:${collection}/${row.id}`);
  if(active){const key=[collection,row.type||'',row.categoryId||'',row.nameAr.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()].join(':');if(seen.has(key))throw Error(`DUPLICATE_REQUIRES_REVIEW:${seen.get(key)}:${row.id}`);seen.set(key,row.id);}
  if(collection==='packages'&&active){const ids=[...(row.includedServiceIds||[]),...(row.choiceGroups||[]).flatMap(g=>(g.options||[]).map(o=>o.serviceId))];for(const id of ids)if(!serviceMap.has(id)||serviceMap.get(id).active===false)throw Error(`PACKAGE_SERVICE_UNAVAILABLE:${row.id}:${id}`);}
  if(JSON.stringify([...(row.branchIds||[])].sort())!==JSON.stringify(['mashaya','talkha']))operations.push({collection,id:row.id,branchIds:['talkha','mashaya']});
 }
 if(operations.length>400)throw Error('TOO_MANY_CHANGES_REQUIRES_REVIEW');
 return {operations,count:operations.length};
}
export const catalogFingerprint=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
