import {publicCatalogPaging} from '../functions/src/cursor-pagination.js';
import {withoutPublicTargetFields} from '../functions/src/public-target-fields.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {publicStaff} from '../functions/src/public-staff.js';
const secret='SECRET_INTERNAL_SENTINEL';
const base={nameAr:'عامل',nameEn:'Worker',active:true,available:true,branchIds:['talkha'],serviceIds:['cut'],sortOrder:1};
const snap=data=>({id:'real-worker',data:()=>data});
const keys=['id','nameAr','nameEn','specialtyAr','specialtyEn','bioAr','bioEn','imageUrl','active','available','catalogVisible','published','branchIds','serviceIds','sortOrder'];
for(const key of ['baseSalary','salary','payroll','monthlyTarget','targetBonusPercent','phone','email','userUid','notes','bankAccount','shiftStart','breaks','workDays','tokens','futureInternalField'])test(`drops ${key}`,()=>{const result=publicStaff(snap({...base,[key]:{secret}}));assert(!JSON.stringify(result).includes(secret));assert(!Object.hasOwn(result,key));});
test('nested objects and array elements never leak',()=>{const result=publicStaff(snap({...base,nameAr:{secret},imageUrl:{secret},branchIds:[{secret}],serviceIds:[{secret}],sortOrder:{secret}}));assert(!JSON.stringify(result).includes(secret));assert.equal(result.available,false);assert.deepEqual(result.branchIds,[]);});
test('authoritative identity, exact contract and immutable input',()=>{const data={...base,id:'forged',published:false,catalogVisible:false,specialtyAr:'حلاقة',bioEn:'Bio',imageUrl:'/worker.webp'};const before=JSON.stringify(data);const result=publicStaff(snap(data));assert.equal(result.id,'real-worker');assert.equal(result.published,false);assert.equal(result.catalogVisible,false);assert(Object.keys(result).every(k=>keys.includes(k)));result.branchIds.push('other');assert.equal(JSON.stringify(data),before);});
test('actual staged loadCatalog response serialization',async()=>{
 const source=readFileSync(new URL('../functions/src/index.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('async function loadCatalog()'),source.indexOf('export const getCatalog ='));
 const collection=name=>({where(){return this},orderBy(){return this},limit(){return this},async get(){return {docs:name==='staff'?[snap({...base,payroll:{secret},internal:secret})]:[]}}});
 const context=vm.createContext({publicPages:publicCatalogPaging({db:null,HttpsError:Error,projectStaff:publicStaff}),PUBLIC_COLLECTIONS:['staff'],db:{collection},readSettings:async()=>({}),PUBLIC_SETTING_KEYS:[],API_VERSION:'test',MIN_FRONTEND_VERSION:'test',publicStaff,withoutPublicTargetFields,cleanDoc:()=>{throw Error('staff fell through generic serializer')},sanitizeText:x=>x,DRINK_TYPES:[],normalizeDrinkOptions:x=>x});
 const payload=await vm.runInContext(body+';loadCatalog()',context);assert(!JSON.stringify(payload).includes(secret));assert.equal(payload.staff[0].id,'real-worker');assert.deepEqual([...payload.staff[0].serviceIds],['cut']);
});
test('existing booking candidate selection retains branch/service/unavailable rules',async()=>{
 const source=readFileSync(new URL('../src/booking-worker.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/m,'').replace('export function','function');
 const availableAtBranch=(w,b)=>w.branchIds?.includes(b);
 const data=[base,{...base,branchIds:['mashaya']},{...base,available:false},{...base,serviceIds:['other']},{...base,published:false}];
 const context=vm.createContext({availableAtBranch,catalog:{staff:data.map((x,i)=>publicStaff({id:String(i),data:()=>x}))}});
 const selected=vm.runInContext(source+`;bookingWorkerCandidates(catalog,'talkha',[{kind:'service',id:'cut'}])`,context);assert.deepEqual(Array.from(selected,x=>x.id),['0']);
});
