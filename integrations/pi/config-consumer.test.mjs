import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readWorkerConfig,writeWorkerConfig,workerConfigurationFile} from './runtime-state.mjs';
import {loadTaskContract} from './workspace.mjs';
import {runWorker,packageRoot} from './worker-runtime.mjs';
import {mkdirSync,copyFileSync,realpathSync} from 'node:fs';

test('CONFIG-01: canonical parent YAML preserves owner fields and comments with no second writable config',(t)=>{
 const root=mkdtempSync(join(tmpdir(),'fw-config-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 writeFileSync(join(root,'.production-grade.yaml'),'# Owner comment\nprojectName: original\npaths:\n  source: src\n');
 writeWorkerConfig(root,{enabled:true,provider:'current',authSource:'codex'});
 const text=readFileSync(join(root,'.production-grade.yaml'),'utf8');assert.match(text,/# Owner comment/);assert.match(text,/projectName: original/);assert.match(text,/source: src/);
 assert.equal(existsSync(join(root,'.forgewright/pi-worker.json')),false);
 assert.equal(workerConfigurationFile(root),'.production-grade.yaml');
 assert.deepEqual(readWorkerConfig(root),{enabled:true,worker:'pi',provider:'current',authSource:'codex'});
 writeWorkerConfig(root,{...readWorkerConfig(root),enabled:false});assert.equal(readWorkerConfig(root).enabled,false);
});
test('CONFIG-02: explicit Agy choice wins over dormant Pi prototype settings',(t)=>{
 const root=mkdtempSync(join(tmpdir(),'fw-config-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 writeWorkerConfig(root,{enabled:true,provider:'current',authSource:'codex'});
 writeFileSync(join(root,'.production-grade.yaml'),'delegationMode:\n  enabled: on\n  worker:\n    cli: agy\n');
 assert.equal(readWorkerConfig(root).enabled,false);
});
test('CONFIG-04: startup cannot adopt a foreign edit made by onStarted',async(t)=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'fw-startup-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'.forgewright'));copyFileSync(join(packageRoot,'.forgewright/execution-policy.yaml'),join(root,'.forgewright/execution-policy.yaml'));
 writeFileSync(join(root,'source.mjs'),'original');
 writeFileSync(join(root,'task.json'),JSON.stringify({schema:'forgewright-pi-task/v1',taskId:'startup-binding',objective:'Preserve foreign changes',acceptance:['No adoption of foreign edits'],readPaths:['source.mjs'],writePaths:['source.mjs'],verifiers:[]}));
 writeWorkerConfig(root,{enabled:true,provider:'local',model:'not-used',endpoint:'http://127.0.0.1:12345/v1'});
 const receipt=await runWorker({projectRoot:root,contractPath:'task.json',onStarted(){writeFileSync(join(root,'source.mjs'),'foreign');}});
 assert.equal(receipt.errorCode,'pi_foreign_edit_conflict');assert.equal(receipt.turns,0);assert.equal(readFileSync(join(root,'source.mjs'),'utf8'),'foreign');
 const task=JSON.parse(readFileSync(join(root,'task.json'),'utf8'));task.readPaths=['.production-grade.yaml'];task.writePaths=[];
 writeFileSync(join(root,'task.json'),JSON.stringify(task));
 assert.throws(()=>loadTaskContract(root,'task.json'),/pi_protected_path/);
});

test('CONFIG-03: malformed, duplicate or aliased owner configuration fails closed',(t)=>{
 const root=mkdtempSync(join(tmpdir(),'fw-config-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const text of ['key: 1\nkey: 2\n','delegationMode: [','value: &ref [1]\ncopy: *ref\n']){
  writeFileSync(join(root,'.production-grade.yaml'),text);assert.throws(()=>readWorkerConfig(root));
 }
});
