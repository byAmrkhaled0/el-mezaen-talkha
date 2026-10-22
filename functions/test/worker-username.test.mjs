import test from 'node:test';import assert from 'node:assert/strict';import {normalizeWorkerUsername,workerAuthEmail} from '../src/worker-username.js';
test('username is normalized with bounded ASCII semantics',()=>assert.equal(normalizeWorkerUsername(' Ahmed.01 '),'ahmed.01'));
test('equivalent username casing maps to one Auth identity',()=>assert.equal(workerAuthEmail('AHMED'),workerAuthEmail('ahmed')));
for(const value of ['', 'ab', '../admin', 'worker@example.com', 'عامل', 'a'.repeat(33), '<script>'])test(`unsafe username rejected: ${value.slice(0,20)}`,()=>assert.throws(()=>normalizeWorkerUsername(value)));

import {accountPageOptions} from '../src/account-center.js';
test('Worker account search can use normalized username',()=>{const o=accountPageOptions({category:'worker',search:'username: Ahmed.21'});assert.equal(o.searchField,'username');assert.equal(o.search,'ahmed.21');});
test('All-account username search is explicit and bounded',()=>{assert.equal(accountPageOptions({search:'username: Ahmed.21'}).search,'ahmed.21');assert.throws(()=>accountPageOptions({search:'username: ../../admin'}));});
