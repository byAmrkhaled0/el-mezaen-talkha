import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {connectedDom} from './helpers/connected-dom.mjs';
test('real admin form mounts and opens all four cashier steps without losing original controls',async()=>{
 const fixture=connectedDom(await readFile(new URL('../admin/index.html',import.meta.url),'utf8')),saved={document:globalThis.document,Option:globalThis.Option};globalThis.document=fixture.document;globalThis.Option=fixture.Option;
 try{
  const $=selector=>document.querySelector(selector),ids=['posBranch','posFirstName','posLastName','posPhone','posCustomer','posStaff','posPaid','posSubmit'],original=new Map(ids.map(id=>[id,$('#'+id)]));for(const node of original.values())assert.ok(node);
  $('#posFirstName').value='عميل';$('#posPhone').value='01012345678';
  let source=await readFile(process.env.QA_REFERENCE_SOURCE||new URL('../src/cashier-reference-ui.js',import.meta.url),'utf8');source=source.replace("import './cashier-reference.css';",'').replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../src/'+path.slice(2),import.meta.url).href}'`);
  const {mountCashierReference}=await import('data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL=cashier-reference-mount-fixture.js').toString('base64'));
  let expenseOpens=0;const originalExpenseForm=$('#expenseForm');
  const view=mountCashierReference({getCustomers:()=>[],getBookings:()=>[],getCatalog:()=>[],getDraft:()=>({firstName:$('#posFirstName').value,phone:$('#posPhone').value,items:[{id:'service',qty:1}]}),selectCustomer:()=>{},lookupCustomer:async()=>null,validatePhone:()=>true,onExpense:async()=>{expenseOpens++;},onClose:()=>{}});
  assert.ok(view);for(const [id,node]of original){assert.equal($('#'+id),node,id);assert.equal(node.isConnected,true,id);assert.equal(document.querySelectorAll('#'+id).length,1,id);}
  view.open();const drawer=$('#cashierPosDrawer');assert.equal(drawer.open,true);assert.equal(drawer.dataset.step,'0');
  const next=drawer.querySelector('.cashier-reference-footer').children.find(node=>node.className.includes('primary'));
  for(const index of [1,2,3]){next.onclick();assert.equal(drawer.dataset.step,String(index));}
  view.close();assert.equal(drawer.open,false);view.open();assert.equal(drawer.dataset.step,'0');assert.equal($('#posFirstName').value,'عميل');
  view.reset();assert.equal(document.querySelectorAll('#cashierPosDrawer').length,1);assert.ok($('#posAcquisitionSource'));assert.ok($('#posCustomerNotes'));
  const entry=$('#cashierExpenseEntry'),expenseDrawer=$('#cashierExpenseDrawer'),layout=$('#expenses .business-panels');assert.ok(entry);assert.equal(entry.type,'button');assert.equal(entry.closest('article'),$('#expenseFrom').closest('article'));assert.ok(!layout.children.some(node=>node.tagName==='BUTTON'));assert.equal(layout.children.length,1);assert.equal($('#expenseForm'),originalExpenseForm);assert.equal(expenseDrawer.contains(originalExpenseForm),true);await entry.onclick();assert.equal(expenseOpens,1);assert.equal(expenseDrawer.open,true);view.closeExpense();assert.equal(expenseDrawer.open,false);
 }finally{globalThis.document=saved.document;globalThis.Option=saved.Option;}
});
