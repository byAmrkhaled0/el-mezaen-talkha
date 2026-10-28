import {parsePage,encodeCursor,decodeCursor} from './cursor-pagination.js';
export function bookingPages({db,HttpsError,Timestamp,cleanDoc,normalizePhone}){
 return async function read(data,branches){
 try{
 const {take,skip,cursor}=parsePage(data,100),search=String(data.search||'').trim().slice(0,80),source=data.source||'all',method=data.paymentMethod||'all',staffId=data.staffId||'all';
 if(!['all','pos','booking'].includes(source)||!['all','cash','card','vodafone_cash','instapay','other'].includes(method)||!/^[-_A-Za-z0-9]{1,100}$/.test(staffId))throw Error('INVALID_PAGE');
 let query=db.collection('bookings');if(branches.length)query=query.where('branchId','in',branches);
 if(source==='pos')query=query.where('source','==','pos');if(source==='booking')query=query.where('source','in',['website','admin','booking','manual','branch']);
 if(method!=='all')query=query.where('paymentMethod','==',method);if(staffId!=='all')query=query.where('staffId','==',staffId);
 let field='createdAt',order='desc';
 if(search){if(/^(MZ|POS|TR)-/i.test(search))query=query.where('code','==',search.toUpperCase());else if(/^[+0-9]/.test(search)){query=query.where('phone','==',normalizePhone(search));}else{field='customerName';order='asc';query=query.where(field,'>=',search).where(field,'<=',search+'\uf8ff');}}
 const scope=JSON.stringify([branches,search,source,method,staffId,field]);query=query.orderBy(field,order).orderBy('__name__',order);
 if(cursor){const token=decodeCursor(cursor,scope);if(field==='createdAt'&&(!Array.isArray(token.value)||token.value[0]<-62135596800||token.value[0]>253402300799||token.value[1]<0||token.value[1]>=1e9))throw Error('INVALID_CURSOR');query=query.startAfter(field==='createdAt'?new Timestamp(...token.value):token.value,token.id);}
 const snapshot=await query.limit(take+1).get(),docs=snapshot.docs.slice(0,take),last=docs.at(-1),more=snapshot.size>take;
 const value=last?last.data()[field]:null;
 return {items:docs.map(cleanDoc),take,skip,hasMore:more,nextCursor:more?encodeCursor(scope,last,field==='createdAt'?[value.seconds,value.nanoseconds]:value):null};
 }catch(error){if(error instanceof HttpsError)throw error;if(['INVALID_PAGE','INVALID_CURSOR','CURSOR_REQUIRED'].includes(error.message)||error.message==='INVALID_PHONE')throw new HttpsError('invalid-argument','بيانات الصفحة أو رقم الموبايل غير صحيحة');throw error;}
 };
}
