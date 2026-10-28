import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {attendancePresentation} from '../src/attendance-presentation.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const nodes=new Map();
 const node=()=>({children:[],append(...children){this.children.push(...children);},value:'',disabled:false,textContent:'',innerHTML:'',dataset:{},setAttribute(){},replaceChildren(...children){this.children=children;},classList:{contains:()=>true}});
 const select=node();select.value='talkha';nodes.set('select',select);
 const panel={...node(),isConnected:true,querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},remove(){this.isConnected=false;}};
 const target={hidden:false,classList:{contains:()=>true},append(){}};
 let today={durationMinutes:480,branches:[{id:'talkha',nameAr:'طلخا'}],attendance:null},gpsResolve,gpsReject,timer,identity='own',gpsCalls=0,historyCalls=0;
 const records=[];
 let created=0;
 const context=vm.createContext({attendancePresentation,document:{hidden:false,querySelector:()=>null,createElement:()=>created++===0?panel:node()},navigator:{geolocation:{getCurrentPosition(resolve,reject){gpsCalls++;gpsResolve=resolve;gpsReject=reject;}}},Option:class{constructor(label,value){this.text=label;this.value=value;}},getOwnStaffAttendance:async()=>today,getAttendanceMonth:async()=>{historyCalls++;return {summary:{days:0,recordedSeconds:0,automatic:0},rows:[]};},recordOwnStaffAttendance:async data=>{records.push(data);today={...today,attendance:{status:'PRESENT',branchId:'talkha',checkInTime:'10:00',scheduledEndAt:'2099-01-01T00:00:00Z'}};},enablePush:async()=>{},setInterval:fn=>{timer=fn;return 1;},clearInterval(){}});
 const source=readFileSync(new URL('../src/staff-self-attendance.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('export function ','function ');
 vm.runInContext(source+'\nglobalThis.mount=mountSelfAttendance;',context);
 const view=context.mount({role:'cashier',uid:'own',currentUid:()=>identity,anchor:target});
 return {view,panel,el:s=>panel.querySelector(s),records,get gpsCalls(){return gpsCalls;},get historyCalls(){return historyCalls;},set today(value){today=value;},switchAccount(){identity='other';},gpsSuccess(){gpsResolve({coords:{latitude:31.05,longitude:31.38,accuracy:10}});},gpsDeny(){gpsReject({code:1});},tick(){timer();}};
}
test('fingerprint presentation never invents arrival/departure times',()=>{assert.equal(attendancePresentation(null).checkIn,'—');assert.equal(attendancePresentation({attendance:null}).kind,'ready');const view=attendancePresentation({attendance:{status:'PRESENT',checkInTime:'10:00'}});assert.equal(view.kind,'present');assert.equal(view.checkIn,'10:00');assert.equal(view.checkOut,'—');assert.equal(attendancePresentation({attendance:{status:'CHECKED_OUT'}}).kind,'completed');});
test('no GPS request on load; repeated taps cause one location request and one own-account write',async()=>{const f=fixture();await f.view.load();assert.equal(f.gpsCalls,0);const button=f.el('[data-self-in]');button.onclick();button.onclick();assert.equal(f.gpsCalls,1);assert.equal(f.records.length,0);assert.equal(button.disabled,true);assert.equal(f.panel.dataset.attendanceState,'locating');f.gpsSuccess();await flush();assert.equal(f.records.length,1);assert.deepEqual(Object.keys(f.records[0]).sort(),['accuracy','action','branchId','latitude','longitude']);assert.equal(f.records[0].action,'checkIn');assert.equal(f.panel.dataset.attendanceState,'present');assert.equal(button.disabled,true);assert.equal(f.el('[data-self-out]').disabled,false);f.view.dispose();});
test('denied location never records attendance and restores a retryable control',async()=>{const f=fixture();await f.view.load();f.el('[data-self-in]').onclick();f.gpsDeny();await flush();assert.equal(f.records.length,0);assert.equal(f.el('[data-self-in]').disabled,false);assert.match(f.el('[data-self-error]').textContent,/اسمح باستخدام الموقع/);f.view.dispose();});
test('account switch during location request prevents writing attendance for the new account',async()=>{const f=fixture();await f.view.load();f.el('[data-self-in]').onclick();f.switchAccount();f.gpsSuccess();await flush();assert.equal(f.records.length,0);f.view.dispose();});
test('minute refresh does not reload unchanged monthly history; status transition refreshes it',async()=>{const f=fixture();await f.view.load();assert.equal(f.historyCalls,1);f.tick();await flush();assert.equal(f.historyCalls,1);f.today={durationMinutes:480,branches:[{id:'talkha',nameAr:'طلخا'}],attendance:{status:'PRESENT',branchId:'talkha',checkInTime:'10:00'}};f.tick();await flush();assert.equal(f.historyCalls,2);f.view.dispose();});
test('responsive history has explicit mobile labels and calculation explanation stays available',()=>{const source=readFileSync(new URL('../src/staff-self-attendance.js',import.meta.url),'utf8');const css=readFileSync(new URL('../src/staff-self-attendance.css',import.meta.url),'utf8');assert.match(source,/data-label="اليوم"/);assert.match(source,/data-label="المدة"/);assert.match(source,/attendance-history-note/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/td\[data-label\]::before/);});
