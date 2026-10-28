import {parsePage,encodeCursor,decodeCursor} from './cursor-pagination.js';

// Fields are explicit: clients cannot query arbitrary private fields or collections.
export const SEARCH_FIELDS={customers:['firstName','lastName','phone'],services:['nameAr','nameEn'],packages:['nameAr','nameEn'],staff:['nameAr','nameEn'],inventoryItems:['nameAr'],drinks:['nameAr','nameEn'],content:['titleAr','titleEn'],offers:['nameAr','nameEn'],reviews:['name','comment','bookingCode'],campaigns:['name','titleAr'],users:['name','email','phone'],activityLogs:['action'],walletTransactions:['phone','bookingCode'],categories:['nameAr','nameEn'],faqs:['questionAr','questionEn'],translations:['key'],coupons:['code']};

export function adminSearchPages({db,HttpsError}){
 return async function read(data,{collection,branches,globalRead,branchField,contentTypes=[]}){
  try{
   const {take,skip,cursor}=parsePage(data,100),fields=SEARCH_FIELDS[collection];let search=String(data.search||'').trim();
   const field=data.searchField||fields?.[0],category=String(data.category||''),type=String(data.type||''),ids=data.ids||[];
   if(field==='phone'&&search){search=search.replace(/[٠-٩]/g,x=>String(x.charCodeAt(0)-1632)).replace(/[۰-۹]/g,x=>String(x.charCodeAt(0)-1776)).replace(/[ +()\-]/g,'');if(!/^\d+$/.test(search))throw Error('INVALID_PAGE');if(search.startsWith('0020'))search='0'+search.slice(4);else if(search.startsWith('20'))search='0'+search.slice(2);else if(search.startsWith('1'))search='0'+search;}
   if(field==='email')search=search.toLowerCase();
   if(!Array.isArray(ids)||ids.length>30||ids.some(x=>typeof x!=='string'||!x||x.length>200||x.includes('/'))||ids.length&&search)throw Error('INVALID_PAGE');
   if(!fields||!fields.includes(field)||search.length>80||category.length>100||type.length>50)throw Error('INVALID_PAGE');
   if(category&&!['services','inventoryItems'].includes(collection)||type&&!['services','content','inventoryItems'].includes(collection))throw Error('INVALID_PAGE');
   if(!globalRead&&!branches.length)throw new HttpsError('permission-denied','حدد الفرع المسموح');
   const ordered=search?field:'__name__',scope=JSON.stringify([collection,[...branches].sort(),globalRead,branchField,[...contentTypes].sort(),field,search,category,type,ids]);
   const token=cursor?decodeCursor(cursor,scope):null;
   if(token&&search&&typeof token.value!=='string')throw Error('INVALID_CURSOR');
   let query=db.collection(collection);
   if(ids.length)query=query.where('__name__','in',ids);
   if(!globalRead)query=query.where(branchField,branchField==='branchIds'?'array-contains-any':'in',branches);
   if(contentTypes.length){if(type&&type!=='all'&&!contentTypes.includes(type))throw new HttpsError('permission-denied','لا تملك صلاحية نوع المحتوى');query=type&&type!=='all'?query.where('type','==',type):query.where('type','in',contentTypes);}
   if(category&&category!=='all')query=query.where(collection==='inventoryItems'?'category':'categoryId','==',category);
   if(type&&type!=='all'){
    if(!contentTypes.length)query=query.where('type','==',type);
   }
   if(search)query=query.where(field,'>=',search).where(field,'<=',search+'\uf8ff').orderBy(field);
   query=query.orderBy('__name__');
   if(token)query=search?query.startAfter(token.value,token.id):query.startAfter(token.id);
   const snapshot=await query.limit(take+1).get(),docs=snapshot.docs.slice(0,take),last=docs.at(-1),more=snapshot.size>take;
   return {docs,take,skip,nextCursor:more?encodeCursor(scope,last,search?last.data()[ordered]:null):null};
  }catch(error){if(error instanceof HttpsError)throw error;if(['INVALID_PAGE','INVALID_CURSOR','CURSOR_REQUIRED'].includes(error.message))throw new HttpsError('invalid-argument','بيانات البحث أو مؤشر الصفحة غير صحيح');throw error;}
 };
}
