import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptPresentation} from '../src/offline-receipt.js';
const sale={id:'local-123',status:'pending',createdAt:1792800000000,total:125.5,payload:{branchId:'talkha',customer:{firstName:'Test',lastName:'Customer'},offline:{prices:[{id:'hair',nameAr:'خدمة',qty:1,unitPrice:100},{id:'drink',nameAr:'مشروب',qty:2,unitPrice:12.75}]}}};
test('pending receipt uses local reference and explicitly marks awaiting server confirmation',()=>{const view=receiptPresentation(sale);assert.equal(view.code,'LOCAL-local-123');assert.match(view.notice,/انتظار/);assert.equal(view.branch,'فرع طلخا');assert.equal(view.customer,'Test Customer');assert.equal(view.items.length,2);assert.match(view.total,/١٢٥٫٥٠/);});
test('confirmed receipt uses canonical server booking code',()=>{const view=receiptPresentation({...sale,status:'confirmed',result:{bookingCode:'MZ-QA-123'}});assert.equal(view.code,'MZ-QA-123');assert.match(view.title,/مؤكد/);});
test('receipt presentation retains hostile text as plain data for textContent rendering',()=>{const hostile='<img src=x onerror=alert(1)>',view=receiptPresentation({...sale,payload:{...sale.payload,customer:{firstName:hostile},offline:{prices:[{id:'hair',nameAr:hostile,qty:1,unitPrice:100}]}}});assert.equal(view.customer,hostile);assert.equal(view.items[0].name,hostile);});
