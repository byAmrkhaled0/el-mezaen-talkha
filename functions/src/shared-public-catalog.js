import {createHash} from 'node:crypto';
const branches=['talkha','mashaya'];
export function publicCatalogEntry(d){return d.active===true&&d.catalogVisible!==false&&d.published!==false&&!d.private&&!d.isPrivate&&!d.restricted&&!d.branchRestricted&&(!d.status||['active','published','available','scheduled'].includes(d.status))&&(!d.visibility||d.visibility==='public')&&(!d.access||d.access==='public')&&(!d.scope||['public','shared','global'].includes(d.scope));}
export function planSharedPublicCatalog(rows){
 const services=new Map(rows.filter(r=>r.collection==='services').map(r=>[r.id,r.data])),operations=[],warnings=[];
 for(const r of rows){const {collection,id,data:d}=r;if(!['services','packages','content'].includes(collection)||collection==='content'&&d.type!=='result')continue;if(!publicCatalogEntry(d))continue;
  if(!id||id.includes('/')||d.branchIds!=null&&(!Array.isArray(d.branchIds)||d.branchIds.some(b=>!branches.includes(b)))||d.branchId&&!branches.includes(d.branchId))throw Error('INVALID_SCOPE:'+collection+'/'+id);
  if(collection!=='content'&&(!Number.isFinite(d.price)||d.price<0))throw Error('INVALID_PRICE:'+id);
  if(collection==='packages'){
   const ids=[...(d.includedServiceIds||[]),...(d.choiceGroups||[]).flatMap(g=>(g.options||[]).map(o=>o.serviceId))];
   for(const key of ids)if(!services.has(key)||!publicCatalogEntry(services.get(key))||services.get(key).available===false)throw Error('UNAVAILABLE_PACKAGE_SERVICE:'+id+':'+key);
   if(!ids.length)warnings.push({id,code:'LEGACY_PACKAGE_WITHOUT_COMPONENTS',message:'Publish the existing priced package; no included services will be invented.'});
  }
  if(collection==='content'&&!d.imageUrl&&!(d.beforeImageUrl&&d.afterImageUrl))throw Error('RESULT_WITHOUT_IMAGE:'+id);
  if(branches.every(b=>d.branchIds?.includes(b)))continue;
  operations.push({collection,id,label:d.nameAr||d.titleAr||id,price:collection==='content'?null:d.price,before:{hasBranchIds:Object.hasOwn(d,'branchIds'),branchIds:d.branchIds??null},branchIds:branches,version:r.version});
 }
 if(operations.length>400)throw Error('TOO_MANY_CHANGES');return {operations,count:operations.length,warnings};
}
export const sharedPublicFingerprint=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[r.collection,r.id,r.version]))).digest('hex');
