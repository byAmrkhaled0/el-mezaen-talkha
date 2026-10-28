import {PUBLIC_EDITORIAL_TYPES,globalEditorialRecord,editorialMatchesBranch} from './public-editorial-scope.js';
export function parsePage(data={},maximum=100){
 const take=Number(data.take??data.Take??data.pageSize??data.limit??25),skip=Number(data.skip??data.Skip??0);
 if(!Number.isSafeInteger(take)||take<1||take>maximum||!Number.isSafeInteger(skip)||skip<0)throw Error('INVALID_PAGE');
 if(skip&&!data.cursor)throw Error('CURSOR_REQUIRED');
 return {take,skip,cursor:data.cursor||null};
}
export function encodeCursor(scope,row,value=null){return Buffer.from(JSON.stringify({v:1,scope,id:row.id,value})).toString('base64url');}
export function decodeCursor(cursor,scope){
 if(typeof cursor!=='string'||cursor.length>2000)throw Error('INVALID_CURSOR');
 let token;try{token=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch{throw Error('INVALID_CURSOR');}
 if(token.v!==1||token.scope!==scope||typeof token.id!=='string'||!token.id||token.id.length>200||token.id.includes('/')||token.value!==null&&typeof token.value!=='string'&&!(Array.isArray(token.value)&&token.value.length===2&&token.value.every(Number.isSafeInteger)))throw Error('INVALID_CURSOR');
 return token;
}
export function publicCatalogPaging({db,HttpsError,projectStaff}){
 const allowed=new Set(['services','packages','staff','offers','content']);
 const fields=new Set(['nameAr','nameEn','titleAr','titleEn','specialtyAr','specialtyEn','descriptionAr','descriptionEn','bodyAr','bodyEn','bioAr','bioEn','price','newPrice','originalPrice','oldPrice','startsFrom','duration','type','kind','categoryId','category','imageUrl','videoUrl','beforeImageUrl','afterImageUrl','imageSrcset','imageSizes','linkUrl','includedItemsAr','includedItemsEn','includedServiceIds','choiceGroups','termsAr','termsEn','branchIds','branchId','active','available','catalogVisible','published','status','sortOrder','featured','startAt','endAt','createdAt','serviceIds','mobileImageUrl','imageUrlMobile','imageSrcSet','imageUrls','images','posterUrl','videoPoster']);
 const project=doc=>({id:doc.id,...Object.fromEntries(Object.entries(doc.data()).filter(([key])=>fields.has(key)))});

 const visible=x=>x.active===true&&x.catalogVisible!==false&&x.published!==false&&!x.private&&!x.isPrivate&&!x.branchRestricted&&!x.restricted&&(!x.status||['active','published','available','scheduled'].includes(x.status))&&(!x.visibility||x.visibility==='public')&&(!x.access||x.access==='public')&&(!x.scope||['public','shared','global'].includes(x.scope));
 async function linkedServices(items){
 const ids=[...new Set(items.flatMap(x=>[...(x.includedServiceIds||[]),...(x.choiceGroups||[]).flatMap(g=>(g.options||[]).map(o=>o.serviceId))]).filter(Boolean))];
 if(ids.length>150)throw new HttpsError('resource-exhausted','مراجع الباقات كثيرة؛ قلل حجم الصفحة');
 if(ids.some(id=>typeof id!=='string'||id.includes('/')||id.length>200))throw new HttpsError('failed-precondition','مرجع خدمة غير صحيح');
 const docs=ids.length?await db.getAll(...ids.map(id=>db.doc('services/'+id))):[];
 return docs.filter(d=>d.exists&&visible(d.data())).map(project);
 }
 async function page(data){
 try{
 const {take,skip,cursor}=parsePage(data,50),collection=data.collection,branchId=data.branchId||'',type=data.type||'',category=data.category||'',search=String(data.search||'').trim().slice(0,80),lang=data.lang==='en'?'en':'ar';
 const shared=collection==='content'&&PUBLIC_EDITORIAL_TYPES.includes(type),globalOnly=data.globalOnly===true;
 if(data.globalOnly!==undefined&&typeof data.globalOnly!=='boolean'||globalOnly&&(!shared||branchId))throw Error('INVALID_PAGE');
 if(!allowed.has(collection)||branchId&&!['talkha','mashaya'].includes(branchId)||type&&!['gallery','news','celebrity','result','hair-system'].includes(type)||category&&collection!=='services')throw Error('INVALID_PAGE');
 const field=collection==='content'?(lang==='en'?'titleEn':'titleAr'):(lang==='en'?'nameEn':'nameAr');
 const scope=JSON.stringify([collection,branchId,type,category,search,lang,...(globalOnly?['global']:[])]);
 const token=cursor?decodeCursor(cursor,scope):null;
 if(search&&token&&typeof token.value!=='string')throw Error('INVALID_CURSOR');
 function build(branchField='branchIds'){
 let query=db.collection(collection).where('active','==',true);
 if(globalOnly||branchField==='global')query=query.where('branchIds','==',[]);
 else if(branchId)query=query.where(branchField,branchField==='branchIds'?'array-contains':'==',branchId);
 if(type)query=query.where('type','==',type);
 if(category&&category!=='all')query=query.where('categoryId','==',category);
 if(search)query=query.orderBy(field).where(field,'>=',search).where(field,'<=',search+'\uf8ff');
 query=query.orderBy('__name__');
 if(token)query=search?query.startAfter(token.value,token.id):query.startAfter(token.id);
 return query.limit(take+1);
 }
 const queries=branchId&&collection==='content'?[build(),build('branchId'),...(shared?[build('global')]:[])]:[build()];
 const snapshots=await Promise.all(queries.map(query=>query.get()));
 const compare=(a,b)=>{if(search){const value=Buffer.compare(Buffer.from(a.data()[field]),Buffer.from(b.data()[field]));if(value)return value;}return Buffer.compare(Buffer.from(a.id),Buffer.from(b.id));};
 const documents=[...new Map(snapshots.flatMap(snapshot=>snapshot.docs).map(doc=>[doc.id,doc])).values()].sort(compare),scanned=documents.slice(0,take),more=documents.length>take,last=scanned.at(-1);
 const items=scanned.filter(d=>visible(d.data())&&(!globalOnly||globalEditorialRecord(d.data()))&&(!shared||!branchId||editorialMatchesBranch(d.data(),branchId))).map(d=>collection==='staff'?projectStaff(d):project(d));
 return {items,linkedServices:collection==='packages'?await linkedServices(items):[],take,skip,hasMore:more,nextCursor:more&&last?encodeCursor(scope,last,search?last.data()[field]:null):null,scanned:scanned.length};
 }catch(error){if(error instanceof HttpsError)throw error;if(['INVALID_PAGE','INVALID_CURSOR','CURSOR_REQUIRED'].includes(error.message))throw new HttpsError('invalid-argument',error.message==='CURSOR_REQUIRED'?'استخدم مؤشر الصفحة للانتقال بدل تخطي السجلات':'بيانات الصفحة غير صحيحة');throw error;}
 }
 async function hydrate(ids){
 if(!Array.isArray(ids)||ids.length>30||ids.some(id=>typeof id!=='string'||!id||id.includes('/')||id.length>200))throw new HttpsError('invalid-argument','عناصر السلة غير صحيحة');
 const keys=[...new Set(ids)],docs=keys.length?await db.getAll(...['services','packages','offers'].flatMap(c=>keys.map(id=>db.doc(c+'/'+id)))):[];
 const payload={services:[],packages:[],offers:[]};
 for(const doc of docs)if(doc.exists&&visible(doc.data()))payload[doc.ref.parent.id].push(project(doc));
 payload.services=[...new Map([...payload.services,...await linkedServices(payload.packages)].map(x=>[x.id,x])).values()];return payload;
 }
 return {page,hydrate,visible,project};
}
