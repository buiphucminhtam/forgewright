import test from 'node:test';
import assert from 'node:assert/strict';
import {digest, judgeGameStudio} from '../../scripts/runtime/game-reference.mjs';

const build='a'.repeat(64), candidateBuild='b'.repeat(64);
function fixture(){
 const contract={schema:'game-reference-contract/v1',id:'fixture',referenceBuild:build,seed:7,
  environment:{engine:'threejs',fixedStepHz:60},fields:['phase','score','ticks'],tolerances:{ticks:1},
  approvedPolish:['button-shadow'],inputs:[{id:'start',action:'click',target:'#start'},{id:'gate',action:'wait',ms:2000}],
  expected:[{id:'start',state:{phase:'playing',score:0,ticks:0}},{id:'gate',state:{phase:'won',score:3,ticks:360}}]};
 const capture=b=>({schema:'game-reference-capture/v1',build:b,contractSha256:digest(contract),inputSha256:digest(contract.inputs),seed:7,
  environment:contract.environment,observations:structuredClone(contract.expected),quiescence:'confirmed',
  engineCapability:'observed',playtest:{kind:'automated-public-input',build:b,completed:true}});
 return {contract,reference:capture(build),candidate:capture(candidateBuild),currentBuild:candidateBuild};
}
test('approved visual-only build preserves frozen gameplay',()=>{
 assert.equal(judgeGameStudio(fixture()).status,'PASS');
});
test('mechanics and protected time mutations fail unchanged expected journey',()=>{
 for(const field of ['score','ticks','phase']){
  const f=fixture();f.candidate.observations[1].state[field]=field==='phase'?'lost':999;
  assert.equal(judgeGameStudio(f).status,'FAIL',field);
 }
});
test('missing, duplicate or reordered observations remain unverified',()=>{
 for(const mutate of [r=>r.pop(),r=>r.push(r[0]),r=>r.reverse()]){
  const f=fixture();mutate(f.candidate.observations);
  assert.equal(judgeGameStudio(f).status,'UNVERIFIED');
 }
});
test('declared PASS cannot replace current build, engine or playtest evidence',()=>{
 for(const mutate of [f=>f.currentBuild='c'.repeat(64),f=>delete f.candidate.playtest,f=>f.candidate.engineCapability='unknown',f=>f.candidate.quiescence='uncertain',f=>f.candidate.inputSha256='d'.repeat(64)]){
  const f=fixture();f.candidate.status='PASS';mutate(f);
  assert.equal(judgeGameStudio(f).status,'UNVERIFIED');
 }
});
test('pause invariants retain exact ticks even within snapshot tolerance',()=>{
 const f=fixture();f.contract.expected[1].state.ticks=0;f.contract.equalTicks=[['start','gate']];
 for(const capture of [f.reference,f.candidate]){
  capture.contractSha256=digest(f.contract);capture.observations=structuredClone(f.contract.expected);
 }
 assert.equal(judgeGameStudio(f).status,'PASS');
 f.candidate.observations[1].state.ticks=1;
 assert.equal(judgeGameStudio(f).status,'FAIL');
});
test('missing environment evidence is unverified rather than an exception',()=>{
 const f=fixture();delete f.candidate.environment;
 assert.equal(judgeGameStudio(f).status,'UNVERIFIED');
});
test('a contract requiring intra-step event traces cannot pass snapshot-only evidence',()=>{
 const f=fixture();f.contract.requireGameplayEventTrace=true;
 for(const capture of [f.reference,f.candidate])capture.contractSha256=digest(f.contract);
 assert.equal(judgeGameStudio(f).status,'UNVERIFIED');
});
