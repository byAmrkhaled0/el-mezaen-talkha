import test from 'node:test';
import assert from 'node:assert/strict';
import {readPosCustomerIntake,clearPosCustomerIntake} from '../src/pos-customer-intake.js';
test('intake excludes blank fields and clears personal metadata when switching POS customer',()=>{
 const fields=new Map([['#posAcquisitionSource',{value:'walk_in'}],['#posGender',{value:''}],['#posBirthDate',{value:'2000-02-29'}],['#posCustomerNotes',{value:'  مثال  '}],['#posCustomerNotesCount',{textContent:'4/200'}]]),root={querySelector:id=>fields.get(id)};
 assert.deepEqual(readPosCustomerIntake(root),{acquisitionSource:'walk_in',birthDate:'2000-02-29',notes:'مثال'});
 clearPosCustomerIntake(root);assert.deepEqual(readPosCustomerIntake(root),{});assert.equal(fields.get('#posCustomerNotesCount').textContent,'0/200');
 assert.deepEqual(readPosCustomerIntake({querySelector:()=>null}),{});
});
