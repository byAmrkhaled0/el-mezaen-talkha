import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicCatalogRequests} from '../src/public-catalog-requests.js';
function storage(){const values=new Map();return {get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
test('concurrent browse requests share one call and return independent data',async()=>{
 let calls=0,release;const request=createPublicCatalogRequests();const load=()=>{calls++;return new Promise(r=>release=r);};
 const a=request({mode:'page',branchId:'talkha'},load),b=request({branchId:'talkha',mode:'page',cursor:undefined},load);
 await Promise.resolve();release({items:[{id:'a'}]});const [one,two]=await Promise.all([a,b]);one.items[0].id='changed';assert.equal(two.items[0].id,'a');assert.equal(calls,1);
});
test('short session browsing cache survives page navigation, expires and separates project/branch/query/cursor',async()=>{
 const saved=storage();let time=100000,calls=0;const load=async()=>({items:[{id:String(++calls)}]});
 const create=(namespace='one')=>createPublicCatalogRequests({storage:saved,namespace,now:()=>time});
 const payload={mode:'page',collection:'services',branchId:'talkha'};await create()(payload,load);await create()(payload,load);assert.equal(calls,1);
 for(const extra of [{branchId:'mashaya'},{search:'قص'},{cursor:'next'},{lang:'en'}])await create()({...payload,...extra},load);
 await create('two')(payload,load);assert.equal(calls,6);time+=30001;await create()(payload,load);assert.equal(calls,7);
});
test('failed requests are retriable, future timestamps rejected, storage failures tolerated',async()=>{
 let calls=0;const saved=storage(),request=createPublicCatalogRequests({storage:saved,now:()=>100});
 await assert.rejects(request({mode:'metadata'},async()=>{calls++;throw Error('offline');}));
 assert.deepEqual(await request({mode:'metadata'},async()=>{calls++;return {branches:[]};}),{branches:[]});assert.equal(calls,2);
 const backwards=createPublicCatalogRequests({storage:saved,now:()=>90});await backwards({mode:'metadata'},async()=>{calls++;return {};});assert.equal(calls,3);
 const blocked=createPublicCatalogRequests({storage:{getItem(){throw Error();},setItem(){throw Error();}}});assert.deepEqual(await blocked({mode:'metadata'},async()=>({ok:true})),{ok:true});
});
test('live staff is never remembered and account/booking operations cannot use browsing cache',async()=>{
 let calls=0;const request=createPublicCatalogRequests(),load=async()=>({status:++calls});
 const payload={mode:'page',collection:'staff',branchId:'talkha'};
 await request(payload,load,{remember:false});await request(payload,load,{remember:false});assert.equal(calls,2);
 await assert.rejects(request({mode:'createBooking'},load),/PUBLIC_BROWSING_ONLY/);assert.equal(calls,2);
});
test('session browse records stay bounded without touching cart/account keys',async()=>{
 const saved=storage(),request=createPublicCatalogRequests({storage:saved,maximum:3});saved.setItem('mz-cart','keep');
 for(let i=0;i<12;i++)await request({mode:'page',search:String(i)},async()=>({items:[]}));
 assert.equal(saved.length,4);assert.equal(saved.getItem('mz-cart'),'keep');
});
