import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCustomerSimple} from '../src/customer-simple.js';
import {connectedDom} from './helpers/connected-dom.mjs';
function fixture(hash='') {
 const {document:root}=connectedDom('<html lang="ar"><body data-public-refinement="true" data-home-editorial="true"><main id="main"><section class="hero"></section><section id="services"></section><section id="packages"></section><section id="results"></section><section id="about"><div id="gallery-preview"></div></section><section id="team"><button id="bookWorker">احجز</button></section><section id="reviews"><form id="reviewForm"></form></section><section class="final-booking"></section><section id="contact"></section></main></body></html>');
 root.body=root.querySelector('body');root.documentElement=root.querySelector('html');root.documentElement.lang='ar';
 const hero=root.querySelector('.hero');hero.after=node=>hero.parentElement.insertBefore(node,root.querySelector('#services'));
 root.querySelector('#reviews').scrollIntoView=()=>{};
 globalThis.location={href:'http://localhost/',origin:'http://localhost',pathname:'/',hash};
 globalThis.window={addEventListener(){}};
 return root;
}
test('short home preserves node identity, nested gallery, active booking forms and primary sections',()=>{
 const root=fixture(),worker=root.querySelector('#bookWorker'),form=root.querySelector('#reviewForm'),gallery=root.querySelector('#gallery-preview');let clicks=0;worker.addEventListener('click',()=>clicks++);
 mountCustomerSimple(root);const content=root.querySelector('#homeExploreContent');assert(content.hidden);assert.equal(root.querySelector('#reviewForm'),form);assert.equal(root.querySelector('#bookWorker'),worker);assert.equal(gallery.parentElement.id,'about');
 worker.dispatchEvent({type:'click'});assert.equal(clicks,1);
 for(const id of ['services','packages','results','contact'])assert.equal(root.querySelector('#'+id).parentElement.id,'main');
});
test('visible button expands/collapses details and a direct review anchor opens the section',()=>{
 const root=fixture();mountCustomerSimple(root);const button=root.querySelector('[aria-controls=homeExploreContent]'),content=root.querySelector('#homeExploreContent');
 button.dispatchEvent({type:'click'});assert(!content.hidden);assert.equal(button.getAttribute('aria-expanded'),'true');
 button.dispatchEvent({type:'click'});assert(content.hidden);assert.equal(button.getAttribute('aria-expanded'),'false');
 const linked=fixture('#reviews');mountCustomerSimple(linked);assert(!linked.querySelector('#homeExploreContent').hidden);
});
test('layout mount is idempotent and does not alter employee pages',()=>{
 const root=fixture();mountCustomerSimple(root);mountCustomerSimple(root);assert.equal(root.querySelectorAll('#homeExplore').length,1);assert.equal(root.querySelectorAll('.customer-shortcuts').length,1);
 root.body.hasAttribute=()=>false;delete root.body.dataset.customerSimple;mountCustomerSimple(root);assert.equal(root.body.dataset.customerSimple,undefined);
});
