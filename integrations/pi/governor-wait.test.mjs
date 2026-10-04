/** Real JS client -> Unix IPC -> Python scheduler. Synthetic telemetry only. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {acquireHostSlot, getHostAdmissionStatus} from './host-governor.mjs';

test('GOV-WAIT-01: real client times out, cancels, recovers, respects reservations and cleans owned broker', {timeout:50000}, async()=>{
 const root=mkdtempSync('/tmp/fw-wait-');
 const home=join(root,'state'); const project=join(root,'project'); mkdirSync(project);
 const telemetry=join(root,'telemetry.json');
 const sample={total_bytes:8*1024**3,available_bytes:44*1024**2,pressure:'critical',source:'darwin-vm-stat+memorystatus',load_ratio:0.1,reclaimable_estimate_bytes:700*1024**2,swap_total_bytes:100};
 writeFileSync(telemetry,JSON.stringify(sample));
 const runtime=fileURLToPath(new URL('../../scripts/runtime/',import.meta.url));
 const bootstrap=`import sys,json\nfrom pathlib import Path\nsys.path.insert(0,sys.argv[1])\nimport host_admission_broker as b\nfrom host_resources import MemorySnapshot\noriginal=b.HostAdmission\ndef sensor():\n return MemorySnapshot(**json.loads(Path(sys.argv[3]).read_text()))\nb.HostAdmission=lambda home:original(home,sensor=sensor)\nb.serve(Path(sys.argv[2]))`;
 const child=spawn(process.env.FORGEWRIGHT_PYTHON||'python3',['-B','-c',bootstrap,runtime,home,telemetry],{stdio:['ignore','ignore','pipe']});
 let errors=''; child.stderr.on('data',data=>errors=(errors+data).slice(-4000));
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 const previous=process.env.FORGEWRIGHT_ADMISSION_HOME;
 const leases=[];
 process.env.FORGEWRIGHT_ADMISSION_HOME=home;
 try {
  const started=performance.now();
  while(!existsSync(join(home,'broker.sock')) && child.exitCode===null && performance.now()-started<5000) await pause(25);
  assert.ok(existsSync(join(home,'broker.sock')),errors);
  const options={projectRoot:project,runId:'bounded-wait',memoryMiB:128};
  const timeoutStarted=performance.now();
  await assert.rejects(acquireHostSlot({...options,waitMs:300}),{code:'pi_host_capacity_timeout'});
  assert.ok(performance.now()-timeoutStarted<3000,'capacity timeout must be bounded');
  const controller=new AbortController();
  const pending=acquireHostSlot({...options,waitMs:30000,signal:controller.signal});
  const queuedDeadline=performance.now()+2000;
  while((await getHostAdmissionStatus()).queued!==1 && performance.now()<queuedDeadline) await pause(25);
  assert.equal((await getHostAdmissionStatus()).queued,1,'cancel must exercise an enqueued lease');
  controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  let status=await getHostAdmissionStatus();
  assert.equal(status.queued,0); assert.equal(status.active_workers,0);
  sample.pressure='normal'; writeFileSync(telemetry,JSON.stringify(sample));
  assert.equal((await getHostAdmissionStatus()).paused,true,'first normal sample cannot bypass recovery');
  const recoveredAt=performance.now();
  const worker=await acquireHostSlot({...options,waitMs:25000}); leases.push(worker);
  assert.ok(performance.now()-recoveredAt>=14000,'must observe the recovery window');
  status=await getHostAdmissionStatus();
  assert.equal(status.worker_limit,1); assert.equal(status.active_workers,1);
  assert.equal(status.reservedMiB,128);
  // 744 - 128 worker - 128 child < unchanged 512 MiB headroom.
  await assert.rejects(acquireHostSlot({...options,kind:'heavy',parentLeaseId:worker.id,waitMs:300}),{code:'pi_host_capacity_timeout'});
  assert.equal((await getHostAdmissionStatus()).active_heavy,0);
  const heavy=await acquireHostSlot({...options,kind:'heavy',memoryMiB:64,parentLeaseId:worker.id,waitMs:1000}); leases.push(heavy);
  assert.equal((await getHostAdmissionStatus()).active_heavy,1);
  await heavy.release();
  await worker.release();
  const next=await acquireHostSlot({...options,runId:'next-bounded-job',waitMs:1000}); leases.push(next);
  await next.release();
  status=await getHostAdmissionStatus();
  assert.equal(status.queued,0); assert.equal(status.active_workers,0); assert.equal(status.reservedMiB,0);
  const result=await Promise.race([exited,pause(18000).then(()=>null)]);
  assert.deepEqual(result,{code:0,signal:null},errors);
  assert.equal(existsSync(join(home,'broker.sock')),false);
  const receipt=JSON.parse(readFileSync(join(home,'last-exit.json'),'utf8'));
  assert.equal(receipt.reason,'idle-exit'); assert.equal(receipt.pid,child.pid);
  console.log(JSON.stringify({telemetry:'synthetic',brokerPid:child.pid,state:'reclaimed',cpuSeconds:receipt.cpuSeconds}));
 } finally {
  for(const lease of leases) await lease.release().catch(()=>{});
  if(child.exitCode===null && child.signalCode===null){child.kill('SIGTERM'); await exited;}
  if(previous===undefined) delete process.env.FORGEWRIGHT_ADMISSION_HOME; else process.env.FORGEWRIGHT_ADMISSION_HOME=previous;
  rmSync(root,{recursive:true,force:true});
 }
});
