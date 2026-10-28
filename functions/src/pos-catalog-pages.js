import {parsePage,encodeCursor,decodeCursor} from './cursor-pagination.js';
export function posCatalogPages({db,HttpsError,offerAtBranch}){
 return async function read(data,branchId){
  try{
   const {take,skip,cursor}=parsePage(data,50),search=String(data.search||'').trim(),section=data.section||'all',category=data.category||'';
   const sections={all:['services','packages','offers','inventoryItems','drinks'],service:['services'],product:['services','inventoryItems'],package:['packages','offers'],drink:['drinks']};
   if(!sections[section]||search.length>80||typeof category!=='string'||category.length>100)throw Error('INVALID_PAGE');
   const scope=JSON.stringify([branchId,section,category,search]),token=cursor?decodeCursor(cursor,scope):null;
   const position=token?JSON.parse(token.value):{group:0,after:null};
   if(!position||typeof position!=='object'||!Number.isInteger(position.group)||position.group<0||position.group>=sections[section].length||position.after&&(!Array.isArray(position.after)||position.after.length!==2||position.after.some(v=>typeof v!=='string'||v.length>200)||position.after?.[1]?.includes('/')))throw Error('INVALID_CURSOR');
   const collection=sections[section][position.group],array=['services','packages','offers'].includes(collection);
   let query=db.collection(collection).where(array?'branchIds':'branchId',array?'array-contains':collection==='drinks'?'in':'==',collection==='drinks'?[branchId,'all']:branchId);
   if(collection==='services'&&section==='service'&&category&&category!=='all')query=query.where('categoryId','==',category);
   if(search)query=query.where('nameAr','>=',search).where('nameAr','<=',search+'\uf8ff').orderBy('nameAr');
   query=query.orderBy('__name__');if(position.after)query=search?query.startAfter(...position.after):query.startAfter(position.after[1]);
   const snapshot=await query.limit(take+1).get(),docs=snapshot.docs.slice(0,take),last=docs.at(-1),more=snapshot.size>take;
   const next=more?{group:position.group,after:[search?last.data().nameAr:'',last.id]}:position.group+1<sections[section].length?{group:position.group+1,after:null}:null;
   const items=docs.flatMap(doc=>{
    const x=doc.data();if(x.active===false||!x.nameAr)return [];
    if(collection==='offers'&&!offerAtBranch(x,branchId))return [];
    if(collection==='packages'&&['stopped','expired'].includes(x.status))return [];
    if(collection==='inventoryItems'&&x.category!=='product')return [];
    const kind=collection==='services'?(x.type==='product'?'product':'service'):({packages:'package',offers:'offer',inventoryItems:'inventory',drinks:'drink'})[collection];
    const group=['inventory','product'].includes(kind)?'product':['package','offer'].includes(kind)?'package':kind;
    if(section!=='all'&&group!==section)return [];
    const price=Number(kind==='inventory'?x.sellingPrice:kind==='offer'?x.newPrice:x.price);if(!Number.isFinite(price)||price<0)return [];
    return [{id:doc.id,kind,section:group,branchId,categoryId:x.categoryId||'',nameAr:String(x.nameAr),price,duration:Number(x.duration)||0,category:kind==='package'?'باقة':kind==='offer'?'عرض':group==='product'?'بضاعة':kind==='drink'?'مشروب':x.categoryId||'خدمة',...(kind==='inventory'?{stockQty:Number(x.stockQty)||0}:{}),...(Array.isArray(x.choiceGroups)?{choiceGroups:x.choiceGroups}:{}),...(Array.isArray(x.drinkOptions)?{drinkOptions:x.drinkOptions}:{})}];
   });
   return {items,take,skip,nextCursor:next?encodeCursor(scope,{id:'pos-catalog'},JSON.stringify(next)):null,hasMore:Boolean(next)};
  }catch(error){if(error instanceof HttpsError)throw error;if(error instanceof SyntaxError||['INVALID_PAGE','INVALID_CURSOR','CURSOR_REQUIRED'].includes(error.message))throw new HttpsError('invalid-argument','بيانات صفحة الأصناف غير صحيحة');throw error;}
 };
}
