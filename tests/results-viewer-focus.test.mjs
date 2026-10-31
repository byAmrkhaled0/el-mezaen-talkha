import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('src/results.js','utf8');
function fixture(lang='ar'){
 const nodes=new Map(),document={activeElement:null,listeners:{},addEventListener(type,listener){this.listeners[type]=listener;},body:{classList:{add(){},remove(){}}}};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,listeners:{},focus(){document.activeElement=this;},removeAttribute(key){delete this[key];},addEventListener(type,listener){this.listeners[type]=listener;},querySelector:node,querySelectorAll:()=>[],closest:()=>null});return nodes.get(id);};
 document.querySelector=node;const viewer=node('#resultViewer');viewer.hidden=true;
 const opener={focus(){document.activeElement=this;}};document.activeElement=opener;
 const context=vm.createContext({document,visibleItems:[{titleAr:'one',imageUrl:'/one.webp'},{titleAr:'two',beforeImageUrl:'/before.webp',afterImageUrl:'/after.webp'}],resultTitle:r=>r.titleAr,branchLabel:()=>'',safeMediaUrl:v=>v,getLang:()=>lang,resultOpener:null,viewerIndex:0});
 vm.runInContext(source.slice(source.indexOf('const viewer ='),source.indexOf('const resultPager=')),context);
 return {context,document,node,viewer,opener};
}
test('actual next/previous click handlers retain focus on the navigation control and preserve the opener',()=>{
 const {context,document,node,viewer,opener}=fixture();context.showViewer(0);assert.equal(document.activeElement,node('.result-viewer-close'));
 const next=node('.result-viewer-next');next.focus();next.listeners.click({target:next});viewer.listeners.click({target:next});
 assert.equal(viewer.hidden,false);assert.equal(node('#resultViewerTitle').textContent,'two');assert.equal(node('#resultViewerImage').src,'/after.webp');
 assert.equal(document.activeElement,next,'moving images must not move focus onto Close');
 next.listeners.click({target:next});assert.equal(node('#resultViewerTitle').textContent,'one');
 const previous=node('.result-viewer-prev');previous.focus();previous.listeners.click({target:previous});assert.equal(document.activeElement,previous);assert.equal(node('#resultViewerTitle').textContent,'two');
 node('.result-viewer-close').listeners.click({target:node('.result-viewer-close')});assert.equal(viewer.hidden,true);assert.equal(document.activeElement,opener);
});
test('actual RTL/LTR keyboard arrows, Escape and backdrop preserve viewer behavior',()=>{
 for(const lang of ['ar','en']){
  const {context,document,node,viewer,opener}=fixture(lang);context.showViewer(0);
  const next=node('.result-viewer-next');next.focus();document.listeners.keydown({key:lang==='ar'?'ArrowLeft':'ArrowRight'});
  assert.equal(node('#resultViewerTitle').textContent,'two');assert.equal(document.activeElement,next);assert.equal(viewer.hidden,false);
  document.listeners.keydown({key:'Escape'});assert.equal(viewer.hidden,true);assert.equal(document.activeElement,opener);
  context.showViewer(0);viewer.listeners.click({target:viewer});assert.equal(viewer.hidden,true);assert.equal(document.activeElement,opener);
 }
});
