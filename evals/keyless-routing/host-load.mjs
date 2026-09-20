/** Reproducible five-project load/idle measurements. No model/network inference.
 * All jobs are owned synthetic waits plus a fixed, single-process arithmetic
 * verifier. This is scheduler evidence, not product throughput or a 4GiB claim. */
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const SELF=fileURLToPath(import.meta.url);
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]??null;
const sha=(path)=>createHash('sha256').update(readFileSync(path)).digest('hex');
if(process.argv[2]==='child'){
 const initialRss=process.memoryUsage().rss;
 const {acquireHostSlot,getHostAdmissionStatus}=await import('../../integrations/pi/host-governor.mjs');
 const projectRoot=process.argv[3], deadline=Number(process.argv[4]);
 let completed=0,blocked=0,failed=0,maxWorkers=0,maxHeavy=0,peakBrokerMiB=0;const waits=[];
 while(Date.now()<deadline){
  let worker,heavy;const start=performance.now();
  try{
   const runId='load-'+process.pid+'-'+(completed+blocked+failed);
   worker=await acquireHostSlot({projectRoot,runId,memoryMiB:64,waitMs:10000});
   waits.push(performance.now()-start);
   await pause(120); // controlled synthetic I/O wait, not a model call
   heavy=await acquireHostSlot({projectRoot,runId,kind:'heavy',parentLeaseId:worker.id,memoryMiB:64,waitMs:10000});
   const state=await getHostAdmissionStatus();
   maxWorkers=Math.max(maxWorkers,state.active_workers);maxHeavy=Math.max(maxHeavy,state.active_heavy);
   peakBrokerMiB=Math.max(peakBrokerMiB,state.coordinator?.peakRssMiB??0);
   if(maxWorkers>2||maxHeavy>1||state.quarantined)throw Error('admission invariant failed');
   const result=spawnSync(process.execPath,['-e','const a=2+3;if(a!==5)process.exit(1)'],{shell:false,timeout:3000,stdio:'ignore'});
   if(result.status!==0)throw Error('fixed verifier failed');completed++;
  }catch(error){
   if(/capacity_timeout/.test(error.message))blocked++;else{failed++;console.error(error.message);}
  }finally{
   if(heavy)await heavy.release({quiescent:true});
   if(worker)await worker.release({quiescent:true});
  }
  await pause(200);
 }
 console.log(JSON.stringify({projectRoot,completed,blocked,failed,maxWorkers,maxHeavy,peakBrokerMiB,waitSamplesMs:waits,initialRss,peakRss:process.resourceUsage().maxRSS*1024}));
}else{
 const durationMs=Number(process.argv[2]??1800000);
 if(!Number.isSafeInteger(durationMs)||durationMs<1000||durationMs>1800000)throw Error('Duration must be 1000..1800000ms');
 const destination=process.argv[3]??join(ROOT,'.forgewright/runtime/keyless-pi/host-load.json');
 const root=realpathSync(mkdtempSync('/private/tmp/fw-host-load-'));
 process.env.FORGEWRIGHT_ADMISSION_HOME=join(root,'state');
 const {acquireHostSlot,getHostAdmissionStatus}=await import('../../integrations/pi/host-governor.mjs');
 const startState=await getHostAdmissionStatus();
 const warm=[];const warmProject=join(root,'warm');mkdirSync(warmProject);
 for(let i=0;i<1000;i++){
  const t=performance.now();const slot=await acquireHostSlot({projectRoot:warmProject,runId:'warm-'+i,memoryMiB:64,waitMs:10000});
  await slot.release({quiescent:true});warm.push(performance.now()-t);
 }
 const loadStarted=Date.now(); const end=loadStarted+durationMs;
 const children=[];
 const results=await Promise.all(Array.from({length:5},(_,i)=>{
  const project=join(root,'project-'+i);mkdirSync(project);
  return new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[SELF,'child',project,String(end)],{shell:false,stdio:['ignore','pipe','pipe'],env:process.env});children.push(child);
   let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
   child.on('error',reject);child.on('close',code=>{if(code!==0)reject(Error(err||'load child failed'));else{try{resolve(JSON.parse(out));}catch(e){reject(e);}}});
  });
 }));
 const loadEnded=Date.now();const finalState=await getHostAdmissionStatus();
 if(finalState.active_workers||finalState.active_heavy||finalState.queued||finalState.quarantined)throw Error('Unsettled load resources');
 const idleStartCpu=finalState.coordinator.cpuSeconds;const idleStarted=Date.now();
 await pause(60000);
 const exited=JSON.parse(readFileSync(join(root,'state/last-exit.json'),'utf8'));
 const brokerExited=!existsSync(join(root,'state/broker.sock'))&&exited.pid===finalState.coordinator.pid;
 const report={schema:'forgewright-host-load/v1',scope:'Five synthetic project clients, actual IPC/SQLite/OS memory sensing and fixed arithmetic processes. No model, product benchmark, OOM certification or provider savings.',node:process.version,createdAt:new Date().toISOString(),root,
  sourceSha256:Object.fromEntries(['integrations/pi/host-governor.mjs','scripts/runtime/host_admission.py','scripts/runtime/host_scheduler.py','scripts/runtime/host_capacity.py','scripts/runtime/host_resources.py'].map(p=>[p,sha(join(ROOT,p))])),
  warm:{count:warm.length,p50Ms:percentile(warm,.5),p95Ms:percentile(warm,.95),semantics:'acquire+release round trip; includes PID/sensor/SQLite work; no queue delay'},
  load:{requestedMs:durationMs,actualMs:loadEnded-loadStarted,projects:results,completed:results.reduce((s,r)=>s+r.completed,0),failed:results.reduce((s,r)=>s+r.failed,0),blocked:results.reduce((s,r)=>s+r.blocked,0),allProjectsProgressed:results.every(r=>r.completed>0)},
  memory:{brokerPeakMiB:Math.max(...results.map(r=>r.peakBrokerMiB)),incrementalClientHighWaterMiB:results.reduce((s,r)=>s+Math.max(0,r.peakRss-r.initialRss),0)/1048576,scope:'Process high-water increments include the synthetic harness; not model/IDE/verifier process RSS'},
  idle:{intervalMs:Date.now()-idleStarted,brokerExited,cpuPercentOfOneCore:Math.max(0,exited.cpuSeconds-idleStartCpu)/60*100},
  before:startState,after:finalState,workerCapsRespected:results.every(r=>r.maxWorkers<=2&&r.maxHeavy<=1)};
 writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({report:destination,complete:report.load.completed,failures:report.load.failed,allProgressed:report.load.allProjectsProgressed,warm:report.warm,memory:report.memory,idle:report.idle,caps:report.workerCapsRespected}));
 if(report.load.failed||!report.load.allProjectsProgressed||!report.workerCapsRespected||!brokerExited)process.exitCode=1;
}
