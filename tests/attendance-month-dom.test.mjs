import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {connectedDom} from './helpers/connected-dom.mjs';
test('admin monthly report loads ten records per action and keeps a partial report explicit',async()=>{
 const {document}=connectedDom('<main id="report"></main>'),old=globalThis.document;globalThis.document=document;globalThis.__monthReportCalls=[];
 try{
  const api=`export async function getAttendanceMonth(payload){globalThis.__monthReportCalls.push(payload);return {rows:[{dateKey:payload.month+'-01',branchId:'talkha',status:'CHECKED_OUT',monthSeconds:3600}]};}export async function getWorkerLeaderboard(){return {rows:[{active:true,name:'عامل متصدر',target:100,achieved:110,achievementPercent:110,completedBookings:4}]};}`;
  const apiUrl='data:text/javascript;base64,'+Buffer.from(api).toString('base64');let source=await readFile(new URL('../src/attendance-month-report.js',import.meta.url),'utf8');source=source.replace("'./admin-api.js'",JSON.stringify(apiUrl)).replace("'./attendance-month-model.js'",JSON.stringify(new URL('../src/attendance-month-model.js',import.meta.url).href));
  const {mountAttendanceMonthReport}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const anchor=document.querySelector('#report'),employees=Array.from({length:12},(_,i)=>({uid:'worker'+i,name:'موظف '+i,branchIds:['talkha']}));
  mountAttendanceMonthReport(anchor,{getEmployees:()=>employees,getRole:()=>'worker',getMonth:()=>'2026-10'});
  const buttons=anchor.querySelectorAll('button');buttons[0].onclick();for(let i=0;i<30&&buttons[0].disabled;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(globalThis.__monthReportCalls.length,10);assert.equal(anchor.querySelectorAll('tbody tr').length,10);assert.equal(buttons[1].hidden,false);assert.ok(anchor.textContent.includes('110%'));
  buttons[1].onclick();for(let i=0;i<30&&buttons[1].disabled;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(globalThis.__monthReportCalls.length,12);assert.equal(anchor.querySelectorAll('tbody tr').length,12);assert.equal(buttons[1].hidden,true);
 }finally{globalThis.document=old;delete globalThis.__monthReportCalls;}
});
