import {createHash} from 'node:crypto';
export function planPublicServiceSharing(rows){
 const operations=[];
 for(const {id,data:d,version} of rows){
  if(d.active!==true||d.catalogVisible===false||d.published===false||d.private||d.isPrivate||d.branchRestricted||d.restricted||d.status&&!['active','published','available','scheduled'].includes(d.status)||d.visibility&&d.visibility!=='public'||d.access&&d.access!=='public'||d.scope&&!['public','shared','global'].includes(d.scope))continue;
  if(!id||id.includes('/')||!Array.isArray(d.branchIds)||d.branchIds.some(b=>!['talkha','mashaya'].includes(b))||!d.branchIds.includes('talkha'))throw Error('UNREVIEWED_SERVICE_SCOPE:'+id);
  if(d.branchIds.includes('mashaya'))continue;
  if(!Number.isFinite(d.price)||d.price<0)throw Error('INVALID_SERVICE_PRICE:'+id);
  operations.push({id,nameAr:d.nameAr||'',price:d.price,beforeBranchIds:d.branchIds,branchIds:['talkha','mashaya'],version});
 }
 if(operations.length>400)throw Error('TOO_MANY_SERVICE_CHANGES');
 return {operations,count:operations.length};
}
export const serviceCatalogFingerprint=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[r.id,r.version]))).digest('hex');
