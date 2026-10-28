export const PUBLIC_EDITORIAL_TYPES=Object.freeze(['gallery','celebrity','result']);
export function globalEditorialRecord(item){return Array.isArray(item?.branchIds)&&item.branchIds.length===0&&!item.branchId;}
export function editorialMatchesBranch(item,branchId){
 if(branchId===undefined)return true;
 if(branchId!==''&&!['talkha','mashaya'].includes(branchId))return false;
 if(globalEditorialRecord(item))return true;
 const ids=Array.isArray(item?.branchIds)&&item.branchIds.length?item.branchIds:[item?.branchId].filter(Boolean);
 return Boolean(branchId)&&ids.includes(branchId);
}
