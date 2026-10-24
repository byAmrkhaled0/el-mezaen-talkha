import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnectionMonitor} from '../src/offline-connectivity.js';
function rig(){
 let connected=true,reachable=true,offline=false,tick,delay,prepared=0,probes=0;
 const monitor=createConnectionMonitor({probe:async()=>{probes++;return reachable;},onAvailable:async()=>{prepared++;},online:()=>connected,setOffline:value=>offline=value,isOffline:()=>offline,schedule:(fn,ms)=>{tick=fn;delay=ms;return 1;},cancel:()=>{},visible:()=>true});
 return {monitor,get offline(){return offline;},get prepared(){return prepared;},get probes(){return probes;},get delay(){return delay;},set connected(v){connected=v;},set reachable(v){reachable=v;},async start(){monitor.start();await new Promise(resolve=>setImmediate(resolve));},async tick(){await tick();}};
}
test('automatic readiness starts once and healthy heartbeats do not repeatedly prepare data',async()=>{const s=rig();await s.start();assert.equal(s.prepared,1);await s.tick();assert.equal(s.prepared,1);assert.equal(s.delay,60000);s.monitor.stop();});
test('router remains connected but WAN fails: offline switches without manual action',async()=>{const s=rig();await s.start();s.reachable=false;await s.tick();assert.equal(s.offline,true);assert.equal(s.delay,15000);s.reachable=true;await s.tick();assert.equal(s.offline,false);assert.equal(s.prepared,2);s.monitor.stop();});
test('browser offline event can switch mode without a heartbeat request',async()=>{const s=rig();await s.start();s.connected=false;await s.monitor.check();assert.equal(s.offline,true);assert.equal(s.probes,1);s.connected=true;await s.monitor.check();assert.equal(s.offline,false);assert.equal(s.prepared,2);s.monitor.stop();});
test('stopping a monitor prevents further probes',async()=>{const s=rig();await s.start();s.monitor.stop();await s.tick();assert.equal(s.probes,1);});
test('concurrent connection checks share one pending probe',async()=>{let release,probes=0;const monitor=createConnectionMonitor({probe:()=>{probes++;return new Promise(resolve=>release=resolve);},setOffline:()=>{},schedule:()=>1,cancel:()=>{}});monitor.start();await monitor.check();assert.equal(probes,1);monitor.stop();release(true);await new Promise(resolve=>setImmediate(resolve));});
test('local preparation failure does not falsely declare a network outage',async()=>{let offline=false;const monitor=createConnectionMonitor({probe:async()=>true,onAvailable:async()=>{throw Error('storage full');},setOffline:value=>offline=value,schedule:()=>1,cancel:()=>{}});monitor.start();await new Promise(resolve=>setImmediate(resolve));assert.equal(offline,false);monitor.stop();});
test('heartbeat bypasses SW cache and visible UI exposes no manual offline-mode switch',()=>{const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');const ui=readFileSync(new URL('../src/offline-admin-ui.js',import.meta.url),'utf8');assert.match(sw,/pathname==='\/connection-check.txt'.*fetch\(request,\{cache:'no-store'\}\)/);assert.doesNotMatch(ui,/setDeviceOffline|setup\.onclick|التبديل لوضع البيع/);assert.match(ui,/panel.append\(summary,body\)/);});
