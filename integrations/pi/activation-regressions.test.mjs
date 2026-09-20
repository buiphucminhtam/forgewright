import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readWorkerConfig,writeWorkerConfig} from './runtime-state.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
function fixture(t){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'fw-activation-')));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'.forgewright'));writeFileSync(join(root,'package.json'),'{"private":true}\n');
 return root;
}
function cli(root,args,environment={}){
 const r=spawnSync(process.execPath,[join(ROOT,'src/cli/dist/index.js'),...args],{cwd:root,encoding:'utf8',timeout:15000,env:{...process.env,FORGEWRIGHT_WORKSPACE:root,FORGE_CONTROLLER_CLI:'codex',...environment}});
 assert.equal(r.status,0,r.stderr);return r;
}
function legacy(root){writeFileSync(join(root,'.forgewright/pi-worker.json'),JSON.stringify({enabled:true,worker:'pi',provider:'local',model:'fixture',endpoint:'http://127.0.0.1:12345/v1'}));}
test('ACTIVATION-01: explicit canonical disable defeats enabled prototype config',t=>{
 for(const value of ['off','false']){const root=fixture(t);legacy(root);writeFileSync(join(root,'.production-grade.yaml'),`delegationMode: {enabled: ${value}}\n`);assert.equal(readWorkerConfig(root).enabled,false,value);}
});
test('ACTIVATION-02: public dispatch does not select an enabled prototype over canonical disable',t=>{
 for(const value of ['off','false']){const root=fixture(t);legacy(root);writeFileSync(join(root,'.production-grade.yaml'),`delegationMode: {enabled: ${value}}\n`);const data=JSON.parse(cli(root,['delegate','status']).stdout);assert.equal(data.data.delegationMode.active,false);assert.equal(data.data.delegationMode.reason,'disabled');}
});
test('ACTIVATION-03: a disabled configured Pi preserves its provider for explicit re-enable',t=>{
 const root=fixture(t);writeWorkerConfig(root,{enabled:false,provider:'local',endpoint:'http://127.0.0.1:12345/v1',model:'configured-model'});
 const config=readWorkerConfig(root);assert.equal(config.enabled,false);assert.equal(config.model,'configured-model');assert.equal(config.provider,'local');
 writeWorkerConfig(root,{...config,enabled:true});assert.equal(readWorkerConfig(root).enabled,true);assert.match(readFileSync(join(root,'.production-grade.yaml'),'utf8'),/configured-model/);
});
test('ACTIVATION-04: installed legacy Agy settings cannot report executable readiness or enabled notices',t=>{
 const root=fixture(t);mkdirSync(join(root,'bin'));
 writeFileSync(join(root,'bin/agy'),'#!/bin/sh\nprintf "agy-test-version\\n"\n',{mode:0o700});
 writeFileSync(join(root,'.production-grade.yaml'),'delegationMode:\n  enabled: on\n  controller: codex\n  worker:\n    cli: agy\n    model: fixture\n  notify: true\n');
 const env={PATH:join(root,'bin')+':'+process.env.PATH,FORGE_DELEGATION_NOTICE:'1'};
 const status=JSON.parse(cli(root,['delegate','status'],env).stdout).data;
 assert.equal(status.worker.available,true);assert.equal(status.ready,false);assert.equal(status.delegationMode.active,false);assert.equal(status.delegationMode.reason,'worker-unavailable');
 const version=cli(root,['--version'],env);assert.doesNotMatch(version.stderr,/Delegation (?:auto-)?enabled:/);
});
