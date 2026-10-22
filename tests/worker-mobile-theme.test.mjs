import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/worker-theme.js',import.meta.url),'utf8');
function fixture(width,saved=null,blocked=false){
  const root={dataset:{theme:'dark'}};const attributes={};let click,change;
  const button={setAttribute:(k,v)=>attributes[k]=v,addEventListener:(_,fn)=>click=fn};
  const media={matches:width<=720,addEventListener:(_,fn)=>change=fn};
  const meta={content:'#03151e'};const storage=new Map(saved===null?[]:[['mz-worker-mobile-theme',saved]]);
  vm.runInNewContext(source,{document:{documentElement:root,getElementById:()=>button,querySelector:()=>meta},matchMedia:()=>media,localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return storage.get(k);},setItem:(k,v)=>{if(blocked)throw Error('blocked');storage.set(k,v);}}});
  return {root,button,attributes,meta,storage,click:()=>click(),resize:w=>{media.matches=w<=720;change();}};
}
test('320,390,430px default to light with an accessible dark action',()=>{
  for(const width of [320,390,430]){const f=fixture(width);assert.equal(f.root.dataset.theme,'light');assert.equal(f.button.hidden,false);assert.equal(f.attributes['aria-pressed'],'false');assert.equal(f.meta.content,'#f2f6f9');}
});
test('mobile dark choice persists and survives viewport changes with the same accessible desktop preference',()=>{
  const f=fixture(390);f.click();assert.equal(f.root.dataset.theme,'dark');assert.equal(f.storage.get('mz-worker-mobile-theme'),'dark');assert.equal(f.attributes['aria-pressed'],'true');
  for(const width of [1024,1440]){f.resize(width);assert.equal(f.root.dataset.theme,'dark');assert.equal(f.button.hidden,false);assert.equal(f.meta.content,'#091f2d');}
  f.resize(430);assert.equal(f.root.dataset.theme,'dark');assert.equal(fixture(320,'dark').root.dataset.theme,'dark');
});
test('saved preference and theme action work on desktop and mobile',()=>{
  const f=fixture(1440,'light');assert.equal(f.root.dataset.theme,'light');assert.equal(f.button.hidden,false);f.click();assert.equal(f.root.dataset.theme,'dark');f.click();f.resize(390);assert.equal(f.root.dataset.theme,'light');f.click();f.click();assert.equal(f.root.dataset.theme,'light');
});
test('unavailable or invalid storage defaults safely and still allows theme switching',()=>{
  for(const f of [fixture(390,'invalid'),fixture(390,null,true)]){assert.equal(f.root.dataset.theme,'light');f.click();assert.equal(f.root.dataset.theme,'dark');}
});
