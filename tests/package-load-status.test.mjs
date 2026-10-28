import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/admin.js',import.meta.url),'utf8');
const render=source.slice(source.indexOf('function renderRequiredPackageStatus()'),source.indexOf('async function installRequiredPackages('));
function fixture({loaded=false,failed=false,items=[],verifiedIds=undefined}={}) {
  const title={textContent:''},message={textContent:''},button={hidden:false},panel={hidden:false,querySelector:s=>s==='b'?title:button};
  const state={role:'admin',collections:new Map(loaded?[['packages',items]]:[])};
  vm.runInNewContext(render+';renderRequiredPackageStatus();',{state,requiredPackageIds:verifiedIds??(loaded?items.map(x=>x.id):null),packageLoadFailed:failed,newMashayaPackages:[{id:'required',nameAr:'باقة مطلوبة'}],$:id=>id==='#requiredPackagesStatus'?panel:message});
  return {title,message,button};
}
test('branch invalidation shows loading rather than missing and hides installation action',()=>{
  const f=fixture();assert.match(f.title.textContent,/تحميل/);assert.doesNotMatch(f.message.textContent,/ناقصة/);assert.equal(f.button.hidden,true);
});
test('failed read cannot offer installation of apparently missing packages',()=>{
  const f=fixture({failed:true});assert.match(f.title.textContent,/تعذر/);assert.equal(f.button.hidden,true);assert.doesNotMatch(f.message.textContent,/ناقصة/);
});
test('successfully loaded package set gives the actual presence result',()=>{
  const f=fixture({loaded:true,items:[{id:'required'}]});assert.match(f.title.textContent,/موجودة/);assert.equal(f.button.hidden,true);
});

test('current package page cannot claim a required package is absent when an exact-ID read found it',()=>{const f=fixture({loaded:true,items:[{id:'page-999'}],verifiedIds:['required']});assert.match(f.title.textContent,/موجودة/);assert.equal(f.button.hidden,true);});
