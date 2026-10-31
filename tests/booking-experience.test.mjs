import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {bookingScreen,nextBookingScreen,previousBookingScreen,mountBookingSummary} from '../src/booking-experience.js';
import {connectedDom} from './helpers/connected-dom.mjs';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
test('four appointment stages preserve the original input sections and recover legacy date/time destinations',()=>{
 assert.deepEqual(bookingScreen(2).visible,[2,3,4]);for(const step of [2,3,4])assert.equal(bookingScreen(step).step,2);
 assert.deepEqual([nextBookingScreen(1),nextBookingScreen(2),nextBookingScreen(5),nextBookingScreen(6)],[2,5,6,7]);
 assert.deepEqual([previousBookingScreen(6),previousBookingScreen(5),previousBookingScreen(2)],[5,2,1]);assert.equal(bookingScreen(7).position,4);
});
test('product-only cart skips appointment in both directions without hiding customer details or review',()=>{
 assert.deepEqual(bookingScreen(1,false).stages,[1,5,6]);assert.equal(nextBookingScreen(1,false),5);assert.equal(previousBookingScreen(5,false),1);assert.equal(bookingScreen(3,false).step,5);
});
function controller({appointment=true}={}){
 const state={lang:'ar',step:1,branchId:'talkha',cart:[{id:'service'}],date:'',time:''};let valid=true,submits=0,reviews=0,missing=false;
 const context=vm.createContext({state,bookingSubmitting:false,availabilityLoading:false,nextBookingScreen,currentBranch:()=>({id:'talkha'}),cartItems:()=>state.cart,needsAppointment:()=>appointment,packageChoiceMissing:()=>missing?{id:'choice',labelAr:'بديل'}:null,showToast(){},t:k=>k,CSS:{escape:x=>x},document:{querySelector:()=>null},$:()=>({reportValidity:()=>valid}),goToStep:step=>state.step=bookingScreen(step,appointment).step,renderFinalBookingReview:()=>reviews++,submitBooking:async()=>submits++});
 vm.runInContext(app.slice(app.indexOf('function canAdvance()'),app.indexOf('function renderFinalBookingReview()'))+app.slice(app.indexOf('async function nextStep()'),app.indexOf('function setDateBounds()')),context);
 return {context,state,formValid:value=>valid=value,missingChoice:value=>missing=value,submits:()=>submits,reviews:()=>reviews};
}
test('actual next handler keeps branch/cart/package, available-time and customer-form guards before submission',async()=>{
 const h=controller();h.state.cart=[];await h.context.nextStep();assert.equal(h.state.step,1);h.state.cart=[{id:'package'}];h.missingChoice(true);await h.context.nextStep();assert.equal(h.state.step,1);h.missingChoice(false);
 await h.context.nextStep();assert.equal(h.state.step,2);await h.context.nextStep();assert.equal(h.state.step,2);
 h.state.date='2026-11-01';h.state.time='12:00';h.context.availabilityLoading=true;await h.context.nextStep();assert.equal(h.state.step,2);h.context.availabilityLoading=false;
 await h.context.nextStep();assert.equal(h.state.step,5);h.formValid(false);await h.context.nextStep();assert.equal(h.state.step,5);assert.equal(h.submits(),0);
 h.formValid(true);await h.context.nextStep();assert.equal(h.state.step,6);assert.equal(h.reviews(),1);assert.equal(h.submits(),0);
 await h.context.nextStep();assert.equal(h.submits(),1);h.context.bookingSubmitting=true;await h.context.nextStep();assert.equal(h.submits(),1);
});
test('actual product handler reaches data then explicit review, and a legacy slot-conflict route reopens all appointment inputs',async()=>{
 const h=controller({appointment:false});await h.context.nextStep();assert.equal(h.state.step,5);await h.context.nextStep();assert.equal(h.state.step,6);assert.equal(h.submits(),0);assert.deepEqual(bookingScreen(3).visible,[2,3,4]);
});
test('summary toggle preserves its fields, desktop always expands and returning to mobile respects the choice',()=>{
 const {document:root}=connectedDom('<aside><button id="bookingSummaryToggle"></button><div id="bookingSummaryDetails"><strong id="summaryTotal">170</strong></div></aside>');let listener;const media={matches:true,addEventListener:(name,fn)=>listener=fn};
 const total=root.querySelector('#summaryTotal'),button=root.querySelector('#bookingSummaryToggle'),details=root.querySelector('#bookingSummaryDetails');mountBookingSummary(root,media);assert(details.hidden);
 button.dispatchEvent({type:'click'});assert(!details.hidden);button.dispatchEvent({type:'click'});assert(details.hidden);media.matches=false;listener();assert(!details.hidden);assert(button.hidden);assert.equal(root.querySelector('#summaryTotal'),total);media.matches=true;listener();assert(details.hidden);
});
