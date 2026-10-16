import assert from 'node:assert/strict';import test from 'node:test';
import {experienceFailure} from '../game/fixtures/web-experience-browser.mjs';
test('an observed gameplay assertion is FAIL while admission refusal stays UNVERIFIED',()=>{
 let mismatch;try{assert.equal('lost','won','protected win outcome');}catch(error){mismatch=error;}
 const failed=experienceFailure(mismatch,true);assert.equal(failed.status,'FAIL');assert.equal(failed.exitCode,1);assert.match(failed.reason,/protected win outcome/);
 const blocked=experienceFailure(new Error('pi_host_capacity_timeout'),false);assert.equal(blocked.status,'UNVERIFIED');assert.equal(blocked.exitCode,2);
});
