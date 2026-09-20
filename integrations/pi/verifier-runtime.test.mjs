import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadTaskContract,createWorkspaceScope} from './workspace.mjs';
import {verifierRun,packageRoot} from './worker-runtime.mjs';
import {createRun,writeWorkerConfig} from './runtime-state.mjs';
import {ProcessPolicyEvaluator} from '../../mcp/build/middleware/guardrail.js';

// Darwin verifier acceptance only. Other platforms explicitly report unsupported;
// do not present this as portable sandbox certification.
test('VERIFIER-01: approved Node verifier executes in the actual OS sandbox and reports exit code', async(t)=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'fw-verifier-real-')));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'.forgewright'));
 writeFileSync(join(root,'.forgewright/execution-policy.yaml'),readFileSync(join(packageRoot,'.forgewright/execution-policy.yaml')),{mode:0o600});
 writeFileSync(join(root,'source.mjs'),'export const sum=(a,b)=>a+b;\n');
 writeFileSync(join(root,'verify.mjs'),"import assert from 'node:assert/strict';import {sum} from './source.mjs';assert.equal(sum(2,3),5);console.log('SANDBOX_VERIFIER_OK');\n");
 writeFileSync(join(root,'CONTRACT.json'),JSON.stringify({schema:'forgewright-pi-task/v1',taskId:'sandbox-verifier',objective:'Verify only',acceptance:['Correct sum'],readPaths:['source.mjs','verify.mjs'],writePaths:[],verifiers:[{id:'check',argv:[process.execPath,'verify.mjs']}]}));
 writeWorkerConfig(root,{enabled:true});
 const contract=loadTaskContract(root,'CONTRACT.json'); const run=createRun(root,{});
 const scope=createWorkspaceScope(contract,{assertOpen:run.assertOpen});
 const evaluator=new ProcessPolicyEvaluator({cwd:root,policyFile:join(root,'.forgewright/execution-policy.yaml'),scriptPath:join(packageRoot,'scripts/lite/policy-check.sh')});
 let admitted=0,released=0;
 const governor={async acquireHostSlot(options){assert.equal(options.kind,'heavy');admitted++;return{heartbeat:async()=>{},release:async({quiescent})=>{assert.equal(quiescent,true);released++;}};}};
 const result=await verifierRun({verifier:contract.task.verifiers[0],contract,run,signal:new AbortController().signal,scope,worker:{id:'fixture-parent'},governor,evaluator});
 assert.equal(result.exitCode,0,JSON.stringify(result)); assert.match(result.output,/SANDBOX_VERIFIER_OK/);
 assert.equal(admitted,1);assert.equal(released,1);
});

test('VERIFIER-03: OS sandbox admits a dynamically linked Homebrew Node runtime without widening project reads', { skip: process.platform !== 'darwin' || !existsSync('/opt/homebrew/bin/node') }, async(t)=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'fw-verifier-homebrew-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'.forgewright'));
 writeFileSync(join(root,'.forgewright/execution-policy.yaml'),readFileSync(join(packageRoot,'.forgewright/execution-policy.yaml')),{mode:0o600});
 writeFileSync(join(root,'source.mjs'),'export const value=7;\n');
 writeFileSync(join(root,'verify.mjs'),"import assert from 'node:assert/strict';import {value} from './source.mjs';assert.equal(value,7);assert.throws(()=>process.getBuiltinModule('node:fs').readFileSync('.env'),e=>['EPERM','EACCES','ENOENT'].includes(e.code));console.log('HOMEBREW_RUNTIME_OK');\n");
 writeFileSync(join(root,'.env'),'must-remain-unreadable\n');
 const homebrewNode=realpathSync('/opt/homebrew/bin/node');
 writeFileSync(join(root,'task.json'),JSON.stringify({schema:'forgewright-pi-task/v1',taskId:'homebrew-runtime',objective:'Check runtime dependency closure only',acceptance:['Verifier runs without reading unapproved project files'],readPaths:['source.mjs','verify.mjs'],writePaths:[],verifiers:[{id:'check',argv:[homebrewNode,'verify.mjs']}]}));
 writeWorkerConfig(root,{enabled:true});const contract=loadTaskContract(root,'task.json');const run=createRun(root,{});const scope=createWorkspaceScope(contract,{assertOpen:run.assertOpen});
 const evaluator=new ProcessPolicyEvaluator({cwd:root,policyFile:join(root,'.forgewright/execution-policy.yaml'),scriptPath:join(packageRoot,'scripts/lite/policy-check.sh')});
 const governor={async acquireHostSlot(){return{id:'homebrew-heavy',heartbeat:async()=>{},release:async({quiescent})=>assert.equal(quiescent,true)};}};
 const result=await verifierRun({verifier:contract.task.verifiers[0],contract,run,signal:new AbortController().signal,scope,worker:{id:'homebrew-parent'},governor,evaluator});
 assert.equal(result.exitCode,0,result.output);assert.match(result.output,/HOMEBREW_RUNTIME_OK/);assert.equal(readFileSync(join(root,'.env'),'utf8'),'must-remain-unreadable\n');
});

test('VERIFIER-02: OS sandbox refuses detached descendants rather than claiming their cleanup',async(t)=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'fw-verifier-fork-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'.forgewright'));
 writeFileSync(join(root,'.forgewright/execution-policy.yaml'),readFileSync(join(packageRoot,'.forgewright/execution-policy.yaml')),{mode:0o600});
 writeFileSync(join(root,'deny-fork.mjs'),`import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const denied=(error)=>{assert.ok(['EPERM','EACCES'].includes(error.code));console.log('DESCENDANT_DENIED');};
try {
 const child=spawn(process.execPath,['-e','setTimeout(()=>{},1000)'],{detached:true,stdio:'ignore'});
 child.once('error',denied);
 child.once('spawn',()=>{child.kill('SIGKILL');console.log('DESCENDANT_ALLOWED');process.exitCode=1;});
} catch(error) { denied(error); }
`);
 writeFileSync(join(root,'task.json'),JSON.stringify({schema:'forgewright-pi-task/v1',taskId:'fork-boundary',objective:'Check sandbox denial',acceptance:['No detached process admitted'],readPaths:['deny-fork.mjs'],writePaths:[],verifiers:[{id:'check',argv:[process.execPath,'deny-fork.mjs']}]}));
 writeWorkerConfig(root,{enabled:true});const contract=loadTaskContract(root,'task.json');const run=createRun(root,{});const scope=createWorkspaceScope(contract,{assertOpen:run.assertOpen});
 const evaluator=new ProcessPolicyEvaluator({cwd:root,policyFile:join(root,'.forgewright/execution-policy.yaml'),scriptPath:join(packageRoot,'scripts/lite/policy-check.sh')});
 const governor={async acquireHostSlot(){return{id:'test-heavy',heartbeat:async()=>{},release:async()=>{}};}};
 const result=await verifierRun({verifier:contract.task.verifiers[0],contract,run,signal:new AbortController().signal,scope,worker:{id:'test-worker'},governor,evaluator});
 assert.equal(result.exitCode,0,result.output);assert.match(result.output,/DESCENDANT_DENIED/);assert.doesNotMatch(result.output,/DESCENDANT_ALLOWED/);
});
