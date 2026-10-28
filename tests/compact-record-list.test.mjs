import test from 'node:test';
import assert from 'node:assert/strict';
import {connectedDom} from './helpers/connected-dom.mjs';
import {mountCompactRecordList} from '../src/compact-record-list.js';

test('payment preview keeps two rows; expanding preserves every original row and its actions',()=>{
 const {document}=connectedDom('<main><div id="anchor"><table><tbody id="rows"><tr><td>payment</td></tr><tr><td>refund</td></tr><tr><td><button>details</button></td></tr><tr><td>fourth</td></tr></tbody></table></div></main>');
 const target=document.querySelector('#rows'),rows=[...target.children],action=document.querySelector('button');let calls=0;action.onclick=()=>calls++;
 const view=mountCompactRecordList({target,anchor:document.querySelector('#anchor'),doc:document});view.update('talkha');
 assert.deepEqual(rows.map(r=>r.hidden),[false,false,true,true]);assert.equal(view.button.getAttribute('aria-expanded'),'false');
 view.button.onclick();assert.ok(rows.every(r=>!r.hidden));assert.equal(view.expanded,true);assert.equal(view.button.getAttribute('aria-expanded'),'true');action.onclick();assert.equal(calls,1);assert.equal(target.children[2],rows[2]);
 view.update('talkha');assert.equal(view.expanded,true);view.update('mashaya');assert.equal(view.expanded,false);assert.equal(rows[2].hidden,true);
});

test('full mobile history retains cursor loading and keeps expansion when older records append',()=>{
 const {document}=connectedDom('<main><div id="rows"><button>one</button><button>two</button><button>three</button></div><button id="more">older</button></main>');
 const target=document.querySelector('#rows'),more=document.querySelector('#more');let loads=0;more.onclick=()=>loads++;
 const view=mountCompactRecordList({target,anchor:target,more,doc:document});view.update('scope',{hasMore:true});assert.equal(more.hidden,true);
 view.button.onclick();assert.equal(more.hidden,false);more.onclick();assert.equal(loads,1);
 target.append(document.createElement('button'));view.update('scope',{hasMore:true});assert.equal(target.children[3].hidden,false);assert.equal(view.expanded,true);
 view.update('scope',{hasMore:false});assert.equal(more.hidden,true);view.button.onclick();assert.equal(target.children[3].hidden,true);
});

test('empty and short histories do not create unnecessary more controls or hide empty states',()=>{
 const {document}=connectedDom('<main><div id="anchor"><table><tbody id="rows"><tr><td colspan="9">empty</td></tr></tbody></table></div></main>');
 const target=document.querySelector('#rows'),view=mountCompactRecordList({target,anchor:document.querySelector('#anchor'),doc:document});view.update('empty');assert.equal(target.children[0].hidden,false);assert.equal(view.button.parentElement.hidden,true);
 target.replaceChildren(document.createElement('tr'),document.createElement('tr'));view.update('two');assert.equal(view.button.hidden,true);assert.ok(target.children.every(r=>!r.hidden));
 view.update('two',{hasMore:true});assert.equal(view.button.hidden,false);
});
