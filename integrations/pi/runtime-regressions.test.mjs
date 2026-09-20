import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveProvider } from './provider.mjs';
import { readWorkerConfig, writeWorkerConfig, createRun } from './runtime-state.mjs';
import { runWorker, verifierRun, packageRoot } from './worker-runtime.mjs';
import { loadTaskContract, createWorkspaceScope } from './workspace.mjs';
import { ProcessPolicyEvaluator } from '../../mcp/build/middleware/guardrail.js';

function fixture(t) {
 const root=realpathSync(mkdtempSync(join(tmpdir(),'fw-runtime-boundary-')));
 t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'.forgewright'));
 writeFileSync(join(root,'.forgewright/execution-policy.yaml'),readFileSync(join(packageRoot,'.forgewright/execution-policy.yaml')),{mode:0o600});
 writeFileSync(join(root,'source.mjs'),'export const sum=(a,b)=>a+b;\n');
 writeFileSync(join(root,'verify.mjs'),"console.log('check')\n");
 writeFileSync(join(root,'CONTRACT.json'),JSON.stringify({schema:'forgewright-pi-task/v1',taskId:'boundary',objective:'Verify only',acceptance:['Correct source'],readPaths:['source.mjs','verify.mjs'],writePaths:['source.mjs'],verifiers:[{id:'check',argv:[process.execPath,'verify.mjs']}]}));
 writeWorkerConfig(root,{enabled:true,provider:'local',endpoint:'http://127.0.0.1:12345/v1',model:'fixture'});return root;
}
test('BOUNDARY-01: startup callback cannot adopt a changed verifier or source',async(t)=>{
 for(const file of ['source.mjs','verify.mjs','CONTRACT.json']) {
  const root=fixture(t);
  const result=await runWorker({projectRoot:root,contractPath:'CONTRACT.json',onStarted:()=>writeFileSync(join(root,file),'foreign editor bytes')});
  assert.equal(result.errorCode,'pi_foreign_edit_conflict');assert.equal(result.turns,0);
  assert.equal(readFileSync(join(root,file),'utf8'),'foreign editor bytes');
 }
});
test('BOUNDARY-02: explicit Codex profile is used without default-profile fallback',async(t)=>{
 const root=fixture(t);const profile=join(root,'profile');mkdirSync(profile);mkdirSync(join(root,'.codex'));
 const token='e30.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+600,'https://api.openai.com/auth':{chatgpt_account_id:'fixture-profile'}})).toString('base64url')+'.fixture';
 writeFileSync(join(profile,'auth.json'),JSON.stringify({auth_mode:'chatgpt',tokens:{access_token:token}}),{mode:0o600});
 writeFileSync(join(profile,'config.toml'),'model="exact-profile-model"\n');
 const result=await resolveProvider({provider:'current',authSource:'codex'},{home:root,codexHome:profile});
 assert.equal(result.model.id,'exact-profile-model');assert.equal(result.getApiKey(),token);
 writeFileSync(join(profile,'config.toml'),'model="model-behind-another-provider"\nmodel_provider="custom"\n');
 await assert.rejects(resolveProvider({provider:'current',authSource:'codex'},{home:root,codexHome:profile}),/pi_current_provider_incompatible/);
 await assert.rejects(resolveProvider({provider:'openai-codex',authSource:'codex',model:'fixture'},{home:root,codexHome:join(root,'absent')}),/pi_auth_required/);
});
test('BOUNDARY-03: canonical YAML preserves other settings and selected-worker switching',async(t)=>{
 const root=fixture(t);
 const yaml=join(root,'.production-grade.yaml');writeFileSync(yaml,'# owner note\nproject: keep-me\n');
 writeWorkerConfig(root,{enabled:true,provider:'local',endpoint:'http://127.0.0.1:12345/v1',model:'fixture'});
 assert.match(readFileSync(yaml,'utf8'),/# owner note/);assert.match(readFileSync(yaml,'utf8'),/project: keep-me/);
 const cli=(...args)=>spawnSync(process.execPath,[join(packageRoot,'src/cli/dist/index.js'),'delegate',...args],{cwd:root,encoding:'utf8',timeout:15000,env:{...process.env,FORGEWRIGHT_WORKSPACE:root,FORGE_DELEGATION_NOTICE:'0'}});
 assert.equal(cli('off').status,0);assert.equal(readWorkerConfig(root).enabled,false);
 assert.equal(cli('on','--worker','agy').status,0);
 assert.equal(readWorkerConfig(root).enabled,false);
 const status=cli('status');assert.equal(status.status,0);assert.equal(JSON.parse(status.stdout).data.delegationMode.workerCli,'agy');
 const pi=cli('on','--worker','pi','--provider','local','--model','fixture','--endpoint','http://127.0.0.1:12345/v1');assert.equal(pi.status,0,pi.stderr);
 assert.equal(readWorkerConfig(root).enabled,true);assert.equal(JSON.parse(cli('status').stdout).worker,'pi');
});

async function sandbox(t, body) {
 const root=fixture(t);writeFileSync(join(root,'.env'),'private-marker');
 writeFileSync(join(root,'verify.mjs'),body);
 const contract=loadTaskContract(root,'CONTRACT.json');const run=createRun(root,{});const scope=createWorkspaceScope(contract,{assertOpen:run.assertOpen});
 const evaluator=new ProcessPolicyEvaluator({cwd:root,policyFile:join(root,'.forgewright/execution-policy.yaml'),scriptPath:join(packageRoot,'scripts/lite/policy-check.sh')});
 const governor={async acquireHostSlot(){return {heartbeat:async()=>{},release:async({quiescent})=>assert.equal(quiescent,true)};}};
 const result=await verifierRun({verifier:contract.task.verifiers[0],contract,run,scope,signal:new AbortController().signal,worker:{id:'host-fixture'},governor,evaluator});
 assert.equal(result.exitCode,0,JSON.stringify(result));assert.match(result.output,/SECURITY_BOUNDARY_OK/);
 assert.equal(readFileSync(join(root,'source.mjs'),'utf8'),'export const sum=(a,b)=>a+b;\n');
}
test('BOUNDARY-04: verifier cannot fork detached descendants',async(t)=>sandbox(t,"import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const child=spawnSync(process.execPath,['-e','setTimeout(()=>{},1000)'],{detached:true,stdio:'ignore',timeout:1500});assert.ok(child.error,'fork must be denied by kernel');assert.ok(['EPERM','EACCES'].includes(child.error.code));console.log('SECURITY_BOUNDARY_OK');\n"));
test('BOUNDARY-05: verifier cannot overwrite source or read unapproved credentials',async(t)=>sandbox(t,"import assert from 'node:assert/strict';import fs from 'node:fs';assert.throws(()=>fs.writeFileSync('source.mjs','foreign'),e=>['EPERM','EACCES'].includes(e.code));assert.throws(()=>fs.readFileSync('.env'),e=>['EPERM','EACCES'].includes(e.code));console.log('SECURITY_BOUNDARY_OK');\n"));
test('BOUNDARY-06: verifier cannot access the network',async(t)=>sandbox(t,"import assert from 'node:assert/strict';import net from 'node:net';await new Promise((resolve,reject)=>{const s=net.createConnection({host:'127.0.0.1',port:9});const timer=setTimeout(()=>{s.destroy();reject(Error('unexpected hang'));},1000);s.once('error',e=>{clearTimeout(timer);assert.ok(['EPERM','EACCES'].includes(e.code),e.code);resolve();});s.once('connect',()=>{clearTimeout(timer);s.destroy();reject(Error('network escaped'));});});console.log('SECURITY_BOUNDARY_OK');\n"));
