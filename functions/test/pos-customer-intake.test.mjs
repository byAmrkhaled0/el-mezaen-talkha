import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePosCustomerIntake} from '../src/pos-customer-intake.js';
test('POS optional customer intake accepts real calendar dates and bounded known fields',()=>{
 assert.deepEqual(parsePosCustomerIntake(),{});
 assert.deepEqual(parsePosCustomerIntake({gender:'male',birthDate:'2000-02-29',acquisitionSource:'walk_in',notes:'  مثال  '},'2026-10-27'),{gender:'male',birthDate:'2000-02-29',acquisitionSource:'walk_in',notes:'مثال'});
 assert.deepEqual(parsePosCustomerIntake({notes:'',gender:''}),{});
 for(const birthDate of ['2001-02-29','2026-02-31','2027-01-01','1899-12-31','bad'])assert.throws(()=>parsePosCustomerIntake({birthDate},'2026-10-27'));
});
test('POS intake rejects privilege, wallet, consent and invalid metadata instead of silently saving it',()=>{
 for(const input of [[],3,{notes:3},{notes:'x'.repeat(201)},{role:'admin'},{pointsBalance:'999'},{whatsappOptIn:'true'},{gender:'anything'},{acquisitionSource:'anything'},JSON.parse('{"__proto__":"bad"}')])assert.throws(()=>parsePosCustomerIntake(input));
});
