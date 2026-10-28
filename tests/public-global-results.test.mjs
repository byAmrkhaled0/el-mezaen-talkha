import test from 'node:test';import assert from 'node:assert/strict';
import {publicCatalogPaging} from '../functions/src/cursor-pagination.js';
import {sharedEditorial} from '../src/public-editorial.js';
import {readFileSync} from 'node:fs';
class HttpError extends Error{constructor(code,message){super(message);this.code=code;}}
function store(rows){
 const reads=[];
 function query(filters=[],orders=[],after=null,max=Infinity){return {
  where:(...args)=>query([...filters,args],orders,after,max),orderBy:key=>query(filters,[...orders,key],after,max),startAfter:(...args)=>query(filters,orders,args,max),limit:n=>query(filters,orders,after,n),
  async get(){reads.push({filters,max});let found=rows.filter(row=>filters.every(([key,op,value])=>op==='=='?JSON.stringify(row[key])===JSON.stringify(value):op==='array-contains'?row[key]?.includes(value):op==='>='?row[key]>=value:op==='<='?row[key]<=value:false));const compare=(a,b)=>{for(const key of orders){const first=String(key==='__name__'?a.id:a[key]),second=String(key==='__name__'?b.id:b[key]);const order=Buffer.compare(Buffer.from(first),Buffer.from(second));if(order)return order;}return 0;};found.sort(compare);if(after){const marker=Object.fromEntries(orders.map((key,index)=>[key==='__name__'?'id':key,after[index]]));found=found.filter(row=>compare(row,marker)>0);}return {docs:found.slice(0,max).map(row=>({id:row.id,data:()=>row}))};}
 };}
 return {db:{collection:()=>query()},reads};
}
const result=(id,branchIds=[],extra={})=>({id,branchIds,type:'result',active:true,titleAr:'نتيجة '+id,imageUrl:'https://fixture.invalid/'+id+'.webp',...extra});
test('global results prefix search stays paginated in both languages and has deployment indexes',async()=>{
 const rows=Array.from({length:17},(_,n)=>result(String(n).padStart(2,'0'),[],{titleAr:'نتيجة '+String(n).padStart(2,'0'),titleEn:'Result '+String(n).padStart(2,'0')}));
 for(const [lang,search,title] of [['ar','نتيجة','titleAr'],['en','Result','titleEn']]){
  const a=api([...rows,result('foreign',['mashaya'],{titleAr:'نتيجة خارج',titleEn:'Result foreign'})]);let cursor,ids=[];
  do{const page=await a.page({collection:'content',type:'result',globalOnly:true,search,lang,take:5,cursor});ids.push(...page.items.map(r=>r.id));cursor=page.nextCursor;}while(cursor);
  assert.equal(ids.length,17);assert.equal(new Set(ids).size,17);
  const indexes=JSON.parse(readFileSync(new URL('../firestore.indexes.json',import.meta.url),'utf8')).indexes;
  assert.ok(indexes.some(i=>i.collectionGroup==='content'&&['active','branchIds','type',title,'__name__'].every(key=>i.fields.some(f=>f.fieldPath===key&&f.order==='ASCENDING'))));
 }
});
function api(rows){const s=store(rows);return {...s,page:publicCatalogPaging({...s,HttpsError:HttpError,projectStaff:()=>null}).page};}
test('global published results show before choosing a branch and alongside the selected branch only',()=>{
 const rows=[result('global'),result('talkha',['talkha']),result('mashaya',['mashaya']),result('legacy',[],{branchId:'talkha'})];
 assert.deepEqual(sharedEditorial(rows,'result','').map(r=>r.id),['global']);
 assert.deepEqual(sharedEditorial(rows,'result','talkha').map(r=>r.id),['global','talkha','legacy']);
 assert.deepEqual(sharedEditorial(rows,'result','mashaya').map(r=>r.id),['global','mashaya']);
 assert.deepEqual(sharedEditorial(rows,'result','unknown'),[]);
 for(const flag of [{active:false},{private:true},{status:'draft'},{published:false},{branchRestricted:true},{visibility:'private'}])assert.deepEqual(sharedEditorial([result('hidden',[],flag)],'result','talkha'),[]);
});
test('public results page merges global, canonical and legacy rows without duplicates or cross-branch rows',async()=>{
 const rows=[result('a'),result('b',['talkha']),result('c',['mashaya']),result('d',['talkha'],{branchId:'talkha'}),result('e',[],{branchId:'mashaya'}),result('f',[],{private:true})],a=api(rows);
 const page=await a.page({collection:'content',type:'result',branchId:'talkha',take:12});assert.deepEqual(page.items.map(r=>r.id),['a','b','d']);assert.ok(a.reads.every(r=>r.max===13));assert.equal(a.reads.length,3);
 const global=await a.page({collection:'content',type:'result',globalOnly:true,take:12});assert.deepEqual(global.items.map(r=>r.id),['a']);
});
test('mixed global and branch cursor pages do not lose or duplicate results and reject switching scope',async()=>{
 const rows=Array.from({length:39},(_,n)=>result(String(n).padStart(3,'0'),n%3===0?[]:n%3===1?['talkha']:['mashaya'])),a=api(rows);let cursor,skip=0,ids=[];
 do{const page=await a.page({collection:'content',type:'result',branchId:'talkha',take:5,cursor,skip});ids.push(...page.items.map(r=>r.id));cursor=page.nextCursor;skip+=5;}while(cursor);
 assert.equal(ids.length,26);assert.equal(new Set(ids).size,26);
 const first=await a.page({collection:'content',type:'result',globalOnly:true,take:5});assert.ok(first.nextCursor);
 await assert.rejects(a.page({collection:'content',type:'result',branchId:'talkha',take:5,cursor:first.nextCursor}),{code:'invalid-argument'});
});
test('global mode is limited to public editorial pages and cannot broaden operational collections',async()=>{
 const a=api([result('a')]);for(const input of [{collection:'services'},{collection:'staff'},{collection:'content',type:'news'},{collection:'content',type:'result',branchId:'mashaya'}])await assert.rejects(a.page({...input,globalOnly:true,take:12}),{code:'invalid-argument'});
 const services=api([{id:'g',active:true,branchIds:[]},{id:'t',active:true,branchIds:['talkha']},{id:'m',active:true,branchIds:['mashaya']}]);assert.deepEqual((await services.page({collection:'services',branchId:'talkha',take:12})).items.map(r=>r.id),['t']);assert.equal(services.reads.length,1);
});
