import {safeMediaUrl} from './media.js';
import {editorialMatchesBranch} from '../functions/src/public-editorial-scope.js';
export const sharedEditorialTypes = new Set(['gallery','celebrity','result']);
export function sharedEditorial(items, type, branchId) {
 if (!sharedEditorialTypes.has(type)) return [];
 return (Array.isArray(items)?items:[]).filter(item => item && item.type===type && editorialMatchesBranch(item,branchId) && item.active===true && item.catalogVisible!==false && item.published!==false && (!item.status||item.status==='published')
  && item.private!==true && item.isPrivate!==true && item.branchRestricted!==true && item.restricted!==true
  && (!item.visibility||item.visibility==='public') && (!item.access||item.access==='public') && (!item.scope||['public','global','shared'].includes(item.scope))
  && (type!=='result'||safeMediaUrl(item.imageUrl)||(safeMediaUrl(item.beforeImageUrl)&&safeMediaUrl(item.afterImageUrl))))
  .sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0));
}
export function editorialOrigin(item,lang='ar') {
 const ids=Array.isArray(item.branchIds)?item.branchIds:[item.branchId].filter(Boolean);
 const names={talkha:lang==='en'?'Talkha':'طلخا',mashaya:lang==='en'?'El Mashaya':'المشاية'};
 return ids.filter(id=>names[id]).map(id=>names[id]).join(' • ') || (lang==='en'?'El Mezaen portfolio':'أعمال المزين');
}
