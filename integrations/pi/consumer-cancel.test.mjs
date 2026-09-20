import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {packageRoot} from './worker-runtime.mjs';
const delay=(n)=>new Promise(r=>setTimeout(r,n));

test('CONSUMER-CANCEL-01: public CLI cancellation fences late provider tool requests, preserves source and releases slots', {timeout:35000},async()=>{
 const root=realpathSync(mkdtempSync('/tmp/fw-consumer-cancel-'));
 const home=join(root,'admission');const env={...process.env,FORGEWRIGHT_ADMISSION_HOME:home,FORGE_DELEGATION_NOTICE:'0'};
 mkdirSync(join(root,'.forgewright'));
 copyFileSync(join(packageRoot,'.forgewright/execution-policy.yaml'),join(root,'.forgewright/execution-policy.yaml'));
 writeFileSync(join(root,'package.json'),'{"name":"cancel-fixture","private":true}\n');
 writeFileSync(join(root,'source.txt'),'original');
 writeFileSync(join(root,'task.json'),JSON.stringify({schema:'forgewright-pi-task/v1',taskId:'cancel-public',objective:'Wait for provider test',acceptance:['No writes after cancellation'],readPaths:['source.txt'],writePaths:['source.txt'],verifiers:[],limits:{timeoutMs:15000,turns:2}}));
 let entered;const requestArrived=new Promise(r=>entered=r);let response;
 const server=createServer((_req,res)=>{response=res;entered();});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const cli=join(packageRoot,'src/cli/dist/index.js');
 const command=(args)=>spawnSync(process.execPath,[cli,'delegate',...args],{cwd:root,env,encoding:'utf8',timeout:6000});
 let child;
 try{
  const enabled=command(['on','--worker','pi','--provider','local','--endpoint',`http://127.0.0.1:${server.address().port}/v1`,'--model','fixture-model']);
  assert.equal(enabled.status,0,enabled.stderr);assert.equal(JSON.parse(enabled.stdout).ready,true);
  child=spawn(process.execPath,[cli,'delegate','run','--contract','task.json'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';let runId;let resolveStarted;
  const started=new Promise(r=>resolveStarted=r);
  child.stdout.on('data',b=>stdout+=b);
  child.stderr.on('data',b=>{stderr+=b;for(const line of stderr.split('\n')){try{const value=JSON.parse(line);if(value.runId){runId=value.runId;resolveStarted();}}catch{}}});
  const closed=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve(code));});
  const readiness=Promise.all([started,requestArrived]);
  await Promise.race([readiness,delay(10000).then(()=>{throw Error('Provider request/start receipt not observed');})]);
  const cancelled=command(['cancel',runId]);assert.equal(cancelled.status,0,cancelled.stderr);assert.equal(JSON.parse(cancelled.stdout).admission,'closed');
  if(response&&!response.destroyed){response.writeHead(200,{'content-type':'text/event-stream'});response.end('data: '+JSON.stringify({id:'late',choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:'late-write',type:'function',function:{name:'pi_patch_file',arguments:JSON.stringify({path:'source.txt',beforeHash:'wrong',content:'LATE'})}}]},finish_reason:'tool_calls'}]})+'\n\ndata: [DONE]\n\n');}
  assert.equal(await closed,1);
  const receipt=JSON.parse(stdout);assert.equal(receipt.status,'cancelled');assert.equal(receipt.errorCode,'pi_cancelled');assert.equal(receipt.effects.length,0);assert.equal(receipt.quiescence,'confirmed');assert.equal(readFileSync(join(root,'source.txt'),'utf8'),'original');
  const status=JSON.parse(command(['resources']).stdout);assert.equal(status.active_workers,0);assert.equal(status.active_heavy,0);assert.equal(status.quarantined,0);
 }finally{
  if(child&&child.exitCode===null)child.kill();server.closeAllConnections();server.close();
  const end=Date.now()+18000;while(existsSync(join(home,'broker.sock'))&&Date.now()<end)await delay(100);
  if(!existsSync(join(home,'broker.sock')))rmSync(root,{recursive:true,force:true});
 }
});
