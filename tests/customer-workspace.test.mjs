import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {connectedDom} from './helpers/connected-dom.mjs';
import {mountCustomerWorkspace,nextCustomerBooking} from '../src/customer-workspace.js';
const html=await readFile(new URL('../account/index.html',import.meta.url),'utf8');
const fixture=()=>{const {document}=connectedDom(html);return {document,ui:mountCustomerWorkspace(document),$:q=>document.querySelector(q)};};
test('nearest upcoming appointment ignores finished, product-only and stale dates without changing source order',()=>{
 const bookings=[{id:'late',status:'confirmed',bookingDate:'2026-11-02',bookingTime:'14:00'},{id:'early',status:'confirmed',bookingDate:'2026-10-31',bookingTime:'10:00'},{id:'done',status:'completed',bookingDate:'2026-10-30'},{id:'stale',status:'pending',bookingDate:'2026-10-01'},{id:'product',status:'pending',productOnly:true,bookingDate:'2026-10-30'}];
 assert.equal(nextCustomerBooking(bookings,'2026-10-30').id,'early');assert.equal(bookings[0].id,'late');assert.equal(nextCustomerBooking([], '2026-10-30'),null);
});
test('all sections are reachable by visible buttons and keep hidden sections out of the way',()=>{
 const {ui,$}=fixture();ui.show('bookings');assert.equal($('#accountBookings').hidden,false);assert.equal($('#accountOverview').hidden,true);assert.equal($('[data-account-view="bookings"]').getAttribute('aria-pressed'),'true');
 $('[data-account-view="wallet"]').dispatchEvent({type:'click'});assert.equal($('#accountWallet').hidden,false);assert.equal($('#accountBookings').hidden,true);
 ui.show('not-a-view');assert.equal($('#accountWallet').hidden,false);
});
test('membership code remains unavailable before rendering, modal closes and QR is cleared on auth reset',()=>{
 const {$,ui}=fixture();$('#portal').hidden=false;
 $('#openMembership').dispatchEvent({type:'click'});assert.equal($('#membershipDialog').open,false);
 ui.setMembershipReady(true);$('#openMembership').dispatchEvent({type:'click'});assert.equal($('#membershipDialog').open,true);
 $('#closeMembership').dispatchEvent({type:'click'});assert.equal($('#membershipDialog').open,false);
 $('#openMembership').dispatchEvent({type:'click'});let cleared=false;$('#customerQr').getContext=()=>({clearRect(){cleared=true;}});ui.reset();assert.equal($('#openMembership').disabled,true);assert.equal($('#membershipDialog').open,false);assert.equal(cleared,true);
});
test('overview renders actual balances and appointment text safely, no invented bookings',()=>{
 const {$,ui}=fixture();ui.update({customer:{firstName:'علي',completedVisits:2,pointsBalance:10,cashbackBalance:15},upcomingBookings:[{status:'confirmed',bookingDate:'2026-11-01',bookingTime:'11:00',serviceNamesAr:['<img onerror=alert(1)>'],branchNameAr:'طلخا',staffNameAr:'علي',total:70}]},{today:'2026-10-30',money:v=>v+' EGP',statusLabel:()=> 'مؤكد'});
 assert.equal($('#customerOverviewPoints').textContent,'10');assert.equal($('#customerOverviewCashback').textContent,'15 EGP');assert.equal($('#nextBookingTotal').textContent,'70 EGP');assert.equal($('#nextBookingServices').children.length,0);assert.equal($('#nextBookingServices').textContent,'<img onerror=alert(1)>');assert.equal($('#accountNextBooking').hidden,false);
 ui.update({customer:{},upcomingBookings:[]});assert.equal($('#accountNextBooking').hidden,true);assert.equal($('#accountNoNextBooking').hidden,false);
});
test('membership dialog and account controls use unique IDs and QR token rendering keeps canonical payload',async()=>{
 const {document}=fixture(),ids=document.querySelectorAll('[id]').map(n=>n.id);assert.equal(new Set(ids).size,ids.length);
 const source=await readFile(new URL('../src/account.js',import.meta.url),'utf8');assert.match(source,/QRCode\.toCanvas\(\$\("#customerQr"\), c\.qrToken, \{ width: 264, margin: 4/);assert.doesNotMatch(source,/rotateCustomerQr/);
 const dialog=document.querySelector('#membershipDialog');assert.equal(dialog.getAttribute('aria-labelledby'),'membershipTitle');
});
