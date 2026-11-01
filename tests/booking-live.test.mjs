import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {createNewBookingTracker,createBookingSignalPump,createBookingSound} from '../src/booking-live.js';
import {decorateBookingActionIcons} from '../src/booking-action-icons.js';
import {createReadCoordinator} from '../src/admin-read-coordinator.js';
import {connectedDom} from './helpers/connected-dom.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('empty initial booking list does not swallow the first incoming booking; multiple arrivals notify once each',()=>{
 const notes=[],tracker=createNewBookingTracker(row=>notes.push(row.id));tracker.accept([],'talkha');
 const rows=[{id:'one',status:'pending',source:'website'},{id:'two',status:'confirmed'},{id:'pos',status:'pending',source:'pos'}];
 tracker.accept(rows,'talkha');tracker.accept(rows,'talkha');assert.deepEqual(notes,['one','two']);tracker.accept(rows,'mashaya');assert.equal(notes.length,2);tracker.reset();tracker.accept(rows,'talkha');assert.equal(notes.length,2);
});
const signal=(id,branchId='talkha',revision='1793500000.000000001')=>({branchId,bookingId:id,type:'new_booking',source:'booking',revision});
test('live signals refresh the current page, coalesce bursts, ignore initial history and reject foreign branches',async()=>{
 const notes=[],jobs=[];let reads=0;const access={uid:'cashier',role:'cashier',branchIds:['talkha'],selectedBranch:'talkha'};
 const pump=createBookingSignalPump({scope:()=>access,notify:row=>notes.push(row.id),refresh:async()=>reads++,schedule:fn=>(jobs.push(fn),jobs.length),cancel(){}});
 pump.receive({signals:{talkha:signal('old')},initial:true});assert.equal(notes.length,0);jobs.shift()();await tick();assert.equal(reads,1);
 pump.receive({signals:{mashaya:signal('wrong','mashaya')}});assert.equal(jobs.length,0);
 pump.receive({signals:{talkha:signal('one','talkha','1793500001.000000001')}});pump.receive({signals:{talkha:signal('two','talkha','1793500002.000000001')}});assert.equal(jobs.length,1);assert.deepEqual(notes,['one','two']);jobs.shift()();await tick();assert.equal(reads,2);
 pump.receive({signals:{talkha:signal('duplicate','talkha','1793500001.000000001')}});assert.equal(notes.length,2);pump.dispose();pump.receive({signals:{talkha:signal('late','talkha','1793500003.000000001')}});assert.equal(jobs.length,0);
});
test('a signal during an active refresh schedules one final fresh read; switching identity/role fails closed',async()=>{
 const jobs=[],waits=[],notes=[];let role='admin';const pump=createBookingSignalPump({scope:()=>({uid:'a',role,selectedBranch:'all'}),refresh:()=>new Promise(resolve=>waits.push(resolve)),notify:row=>notes.push(row.id),schedule:fn=>(jobs.push(fn),jobs.length),cancel(){}});
 pump.receive({signals:{talkha:signal('one')}});jobs.shift()();pump.receive({signals:{talkha:signal('two','talkha','1793500001.000000001')}});assert.equal(jobs.length,0);waits.shift()();await tick();assert.equal(jobs.length,1);jobs.shift()();waits.shift()();await tick();role='worker';pump.receive({signals:{talkha:signal('no','talkha','1793500002.000000001')}});assert.equal(notes.length,2);pump.dispose();
});
test('committed booking invalidation does not reuse a pre-commit request or erase unrelated reads',async()=>{
 const waits=[];const read=createReadCoordinator(name=>new Promise(resolve=>waits.push({name,resolve})),{identity:()=> 'cashier'});
 const old=read('getCashierSnapshot'),other=read('other');await tick();read.invalidate('getCashierSnapshot');const fresh=read('getCashierSnapshot');assert.notEqual(fresh,old);assert.equal(read('other'),other);await tick();assert.equal(waits.length,3);
 waits[0].resolve('old');assert.equal(await old,'old');assert.equal(read('getCashierSnapshot'),fresh);waits[2].resolve('new');assert.equal(await fresh,'new');waits[1].resolve('other');await other;
});
test('notification sound resumes only the audio context, plays four bounded chimes and respects mute',async()=>{
 const gains=[],tones=[];let resumes=0;class Audio{constructor(){this.state='suspended';this.currentTime=1;this.destination={};}async resume(){this.state='running';resumes++;}createOscillator(){const o={frequency:{},connect:()=>({connect(){}}),start:t=>tones.push(t),stop(){}};return o;}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime:v=>gains.push(v)},connect(){return this;}};}}
 const sound=createBookingSound({Audio,storage:{getItem:()=>null,setItem(){}}});assert(await sound.play());assert.equal(resumes,1);assert.equal(tones.length,4);assert.equal(Math.max(...gains),.28);sound.setEnabled(false);assert.equal(await sound.play(),false);assert.equal(tones.length,4);
});
test('action icons preserve real controls and delegated action IDs, have labels and remain idempotent',()=>{
 const {document}=connectedDom('<main><button data-booking-action="confirmed" data-booking-id="one">تأكيد</button><button data-booking-action="rejected" data-booking-id="one">رفض</button><button data-whatsapp-receipt="one">واتساب</button><button data-reschedule-booking="one">جدولة</button></main>');
 const buttons=document.querySelectorAll('button');let clicks=0;buttons[0].addEventListener('click',()=>clicks++);decorateBookingActionIcons(document);decorateBookingActionIcons(document);buttons[0].dispatchEvent({type:'click'});assert.equal(clicks,1);assert.equal(buttons[0].getAttribute('aria-label'),'قبول الحجز');assert.equal(buttons[1].getAttribute('aria-label'),'رفض الحجز');assert.equal(buttons[2].dataset.bookingIcon,'whatsapp');assert.equal(buttons[3].dataset.bookingIcon,'reschedule');for(const button of buttons)assert.equal((button.innerHTML.match(/<svg /g)||[]).length,1);
});
test('actual bootstrap fills username fields using a node list; secure deletion retains password reauthentication',()=>{
 const source=read('src/admin.js'),line=source.split('\n').find(line=>line.includes('#secureDeleteForm [name="username"]'));const fields=[{},{},{}];const context=vm.createContext({$$:()=>fields,user:{email:'synthetic@example.invalid'}});vm.runInContext(line,context);assert(fields.every(field=>field.value==='synthetic@example.invalid'));assert.match(read('admin/index.html'),/id="secureDeleteUsername" autocomplete="username" hidden/);assert.match(read('admin/index.html'),/id="secureDeletePassword" type="password" autocomplete="current-password" required/);
});
test('account shortcuts no longer share the home navigation selector; booking header cannot change the selected branch',()=>{
 const account=read('account/index.html'),home=read('src/customer-simple.css');assert.match(account,/customer-account-shortcuts/);assert.doesNotMatch(account,/account-card customer-shortcuts/);assert.match(home,/#services \.filter-row\{position:static/);assert.doesNotMatch(read('index.html'),/data-change-branch/);
});
