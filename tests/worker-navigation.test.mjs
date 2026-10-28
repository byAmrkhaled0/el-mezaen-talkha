import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
test('worker sections keep direct links, history and private section loaders in sync',()=>{
 const names=['home','bookings','tasks','notifications','attendance','profile','requests'];
 const screens=names.map(name=>({dataset:{screen:name},hidden:true}));
 const buttons=names.map(name=>({dataset:{view:name},setAttribute(key,value){this[key]=value;}}));
 const calls=[],location={hash:'#attendance'},history={replaceState(_,__,hash){location.hash=hash;calls.push(['replace',hash]);},pushState(_,__,hash){location.hash=hash;calls.push(['push',hash]);}};
 const context={document:{querySelectorAll:selector=>selector==='[data-screen]'?screens:buttons},history,location,requestCenter:{load(){calls.push(['requests']);}},orderAdditionView:{load(){calls.push(['bookings']);}},personalAttendanceView:{load(){calls.push(['attendance']);}}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function view('),source.indexOf('function renderBookingQueue(')),context);
 context.view('attendance',{fromHistory:true});assert.equal(screens.filter(n=>!n.hidden)[0].dataset.screen,'attendance');assert.equal(buttons.find(n=>n.dataset.view==='attendance')['aria-current'],'page');assert.deepEqual(calls,[['replace','#attendance'],['attendance']]);
 context.view('bookings');assert.equal(location.hash,'#bookings');assert.deepEqual(calls.slice(-2),[['push','#bookings'],['bookings']]);
 context.view('attendance',{fromHistory:true});assert.deepEqual(calls.slice(-2),[['replace','#attendance'],['attendance']]);
 context.view('requests');assert.deepEqual(calls.slice(-2),[['push','#requests'],['requests']]);
 context.view('../admin');assert.equal(location.hash,'#home');assert.equal(screens.filter(n=>!n.hidden).length,1);assert.equal(screens.find(n=>n.dataset.screen==='home').hidden,false);
 for(const name of names){context.view(name);assert.equal(screens.filter(n=>!n.hidden)[0].dataset.screen,name);}
});
