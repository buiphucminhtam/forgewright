import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, mkdirSync, rmSync, realpathSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {acquireHostSlot,getHostAdmissionStatus,HOST_MEMORY_RESERVATION_MIB} from './host-governor.mjs';

const pause=(n)=>new Promise(r=>setTimeout(r,n));
const SELF=fileURLToPath(import.meta.url);
if(process.argv[2]==='child'){
 const projectRoot=process.argv[3]; const runId=process.argv[4];
 const lease=await acquireHostSlot({projectRoot,runId,memoryMiB:64,waitMs:12000});
 const h=await acquireHostSlot({projectRoot,runId,kind:'heavy',parentLeaseId:lease.id,memoryMiB:64,waitMs:12000});
 console.log(JSON.stringify({event:'active',runId,state:await getHostAdmissionStatus()}));
 await pause(80); await h.release(); await lease.release();
 console.log(JSON.stringify({event:'finished',runId}));
}else{
 test('GOVERNOR-MEM-01: default scheduling reservations retain measured low-resource margin',()=>{
  assert.deepEqual(HOST_MEMORY_RESERVATION_MIB,{worker:192,heavy:128});
 });
 test('GOV-PROCESS-01: five actual project processes share worker/heavy caps and finish, then broker exits idle', {timeout:35000},async()=>{
  const previous=process.env.FORGEWRIGHT_ADMISSION_HOME;
  const root=realpathSync(mkdtempSync(join(tmpdir(),'fw-gov-process-')));
  const home=join(root,'state');process.env.FORGEWRIGHT_ADMISSION_HOME=home;
  const children=[];
  try{
   const baseline=await getHostAdmissionStatus();
   assert.equal(baseline.paused,false,`Host under pressure: ${JSON.stringify(baseline)}`);
   const results=await Promise.all(Array.from({length:5},(_,i)=>{
    const project=join(root,`p${i}`);mkdirSync(project);
    return new Promise((resolve,reject)=>{
     const child=spawn(process.execPath,[SELF,'child',project,`project-${i}`],{env:process.env,stdio:['ignore','pipe','pipe'],shell:false});children.push(child);
     let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);
     child.on('close',code=>{try{assert.equal(code,0,err);resolve(out.trim().split('\n').filter(Boolean).map(JSON.parse));}catch(e){reject(e);}});
    });
   }));
   const events=results.flat();assert.equal(events.filter(e=>e.event==='finished').length,5);
   for(const e of events.filter(e=>e.state)){assert.ok(e.state.active_workers<=2);assert.ok(e.state.active_heavy<=1);assert.equal(e.state.quarantined,0);}
   const state=await getHostAdmissionStatus();assert.equal(state.active_workers,0);assert.equal(state.active_heavy,0);assert.equal(state.queued,0);
   const end=Date.now()+18000;while(existsSync(join(home,'broker.sock'))&&Date.now()<end)await pause(100);
   assert.equal(existsSync(join(home,'broker.sock')),false,'Broker must exit rather than remain resident for idle projects');
  }finally{
   for(const child of children)if(child.exitCode===null)child.kill();
   if(previous===undefined)delete process.env.FORGEWRIGHT_ADMISSION_HOME;else process.env.FORGEWRIGHT_ADMISSION_HOME=previous;
   if(!existsSync(join(home,'broker.sock')))rmSync(root,{recursive:true,force:true});
  }
 });
}
