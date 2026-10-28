import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {syncAdminWorkspace} from '../src/admin-workspace.js';

test('admin home removes shortcuts while preserving navigation',()=>{
 let removed=false,created=false;
 const nav={querySelector:()=>null,querySelectorAll:()=>[],classList:{add(){}}};
 const root={querySelector:s=>s.startsWith('#sidebar')?nav:s==='#dashboard'?{}:s==='#adminHomeShortcuts'?{remove(){removed=true}}:null,createElement(){created=true;throw Error('admin shortcuts recreated')}};
 syncAdminWorkspace('admin',()=>true,root);
 assert.equal(removed,true);assert.equal(created,false);
});

test('branch selection renders exactly one scoped meter including aggregate; worker mode preserved',async()=>{
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.handlers={};this.value='';}
  append(...nodes){this.children.push(...nodes)} prepend(...nodes){this.children.unshift(...nodes)} replaceChildren(...nodes){this.children=nodes}
  setAttribute(){} addEventListener(name,fn){this.handlers[name]=fn} querySelectorAll(){return []} closest(){return null}
  querySelector(s){return s==='.gauge-fill'||s==='line'?new Element('svg'):null}
 }
 const document={createElement:tag=>new Element(tag),querySelector:()=>null,addEventListener(){}};
 const source=readFileSync(new URL('../src/monthly-target-panel.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace('export function','function');
 const row=id=>({branchId:id,month:'2026-10',nameAr:id==='talkha'?'طلخا':id==='mashaya'?'المشاية':'مجموع أهداف الفروع',target:100,achieved:25,remaining:75,progressPercent:25,status:'progress',canSet:false});
 const context=vm.createContext({document,Intl,Date,WeakMap,Event,getMonthlyTargetProgress:async r=>({...r,branch:row(r.branchId),branches:[row('talkha'),row('mashaya')],workers:[{...row('talkha'),staffId:'w1',nameAr:'عامل'}]}),setWorkerMonthlyTarget(){},setBranchMonthlyTarget(){}});
 vm.runInContext(source,context);
 const anchor=new Element('article');context.mountMonthlyTargetPanel({anchor,role:'admin',branchIds:['talkha','mashaya'],activeBranchId:'all'});
 const panel=anchor.children[0],select=panel.children[1].children[1].children[0],content=panel.children[3];
 for(const id of ['all','talkha','mashaya']){
  select.value=id;select.handlers.change();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(content.children.length,1);assert.equal(content.children[0].className,'monthly-target-card');
  assert.equal(content.children[0].children[0].textContent,id==='all'?'المزين — كل الفروع':id==='talkha'?'طلخا':'المشاية');
 }
 const worker=new Element('article');context.mountMonthlyTargetPanel({anchor:worker,role:'worker',branchIds:['talkha'],activeBranchId:'talkha'});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(worker.children[0].children[3].children.length,1);
 assert.match(worker.children[0].children[3].children[0].children[0].textContent,/عامل/);
});
