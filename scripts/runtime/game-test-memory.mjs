/** Opt-in browser bootstrap with sampled abort thresholds, never an OS RSS cap. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const execFileAsync=promisify(execFile);
export const OBSERVED_BROWSER_MEMORY=Object.freeze({startupMiB:256,ceilingMiB:512,hostMarginMiB:64,intervalMs:1000,sampleTimeoutMs:2000});
const failure=reason=>Object.assign(new Error(`game_memory_${reason}`),{code:`game_memory_${reason}`});

export async function readProcessTable() {
 if(process.platform==='win32'){
  // Import only the installed sibling helper; never resolve from workload cwd.
  const py="import json,sys\nsys.path.insert(0,sys.argv[1])\nfrom windows_processes import NativeProcesses\nprint(json.dumps(NativeProcesses().memory_snapshot(),separators=(',',':')))";
  const {stdout}=await execFileAsync(process.env.FORGEWRIGHT_PYTHON||'python',
   ['-I','-S','-c',py,fileURLToPath(new URL('.',import.meta.url))],
   {encoding:'utf8',timeout:1500,maxBuffer:2*1024*1024});
  const rows=JSON.parse(stdout),seen=new Set();
  if(!Array.isArray(rows)||!rows.length||rows.length>65536)throw failure('process_telemetry');
  for(const row of rows){
   if(!row||![row.pid,row.ppid,row.pgid].every(Number.isSafeInteger)||row.pid<=0||row.ppid<0||row.pgid!==row.pid||seen.has(row.pid)||
      (row.rssKiB!==null&&(!Number.isSafeInteger(row.rssKiB)||row.rssKiB<0))||
      (row.start!==null&&(typeof row.start!=='string'||!/^windows-filetime:[1-9][0-9]{0,19}$/.test(row.start))))throw failure('process_telemetry');
   seen.add(row.pid);
  }
  if(!seen.has(process.pid))throw failure('process_telemetry');
  return rows;
 }
 const {stdout}=await execFileAsync('/bin/ps',['-axo','pid=,ppid=,pgid=,rss=,lstart=,comm='],
  {encoding:'utf8',timeout:1000,maxBuffer:2*1024*1024,env:{...process.env,LC_ALL:'C',LANG:'C'}});
 return stdout.trim().split('\n').filter(Boolean).map(line=>{
  const [pid,ppid,pgid,rss,...birth]=line.trim().split(/\s+/);
  const row={pid:Number(pid),ppid:Number(ppid),pgid:Number(pgid),rssKiB:Number(rss),start:birth.join(' ')};
  if(![row.pid,row.ppid,row.pgid,row.rssKiB].every(Number.isSafeInteger)||row.pid<=0||row.rssKiB<0||birth.length<6)throw failure('process_telemetry');
  return row;
 });
}

export function createMemoryGuard({getStatus,abort,readProcesses=readProcessTable,clock=()=>performance.now()}) {
 let timer,running,stopped=false,failed=false,child,rootBirth,failureReason=null,epoch=0;
 const generation=randomUUID(),history=[];
 const known=new Map();let samples=0,peakBrowserRssMiB=0,minAvailableMiB=Infinity;
 const fail=error=>{if(!failed){failed=true;epoch++;failureReason=error.code;abort(error);}return error;};
 const current=version=>{if(stopped||failed||version!==epoch)throw failure('guard_closed');};
 const digest=()=>createHash('sha256').update(JSON.stringify([...known].sort((a,b)=>a[0]-b[0]))).digest('hex');
 async function measure(version) {
  const rows=await readProcesses();current(version);
  const root=rows.find(row=>row.pid===child.pid);
  if(!root||child.exitCode!==null||child.signalCode!==null||root.ppid!==process.pid||root.pgid!==child.pid||root.start!==rootBirth)throw failure('process_identity');
  // Playwright owns a detached process group. Include reparented members as
  // well as descendants that changed groups; remember identities for teardown.
  const owned=new Set(rows.filter(row=>row.pgid===child.pid||known.has(row.pid)).map(row=>row.pid));
  let changed=true;
  while(changed){changed=false;for(const row of rows)if(owned.has(row.ppid)&&!owned.has(row.pid)){owned.add(row.pid);changed=true;}}
  let rss=0;
  for(const row of rows)if(owned.has(row.pid)){
   if(typeof row.start!=='string'||!row.start||(known.has(row.pid)&&known.get(row.pid)!==row.start))throw failure('process_identity');
   if(!Number.isSafeInteger(row.rssKiB)||row.rssKiB<0)throw failure('process_telemetry');
   known.set(row.pid,row.start);rss+=row.rssKiB;
   if(!Number.isSafeInteger(rss))throw failure('process_telemetry');
  }
  const mib=rss/1024;peakBrowserRssMiB=Math.max(peakBrowserRssMiB,mib);
  if(mib>OBSERVED_BROWSER_MEMORY.ceilingMiB)throw failure('rss_ceiling');
 }
 async function inspect(version) {
  const began=clock();
  const status=await getStatus();
  current(version);
  history.push(Object.freeze({sequence:history.length?history.at(-1).sequence+1:1,at:new Date().toISOString(),pressure:['normal','warning','critical','unknown'].includes(status?.pressure)?status.pressure:'unknown',
   availableMiB:Number.isFinite(status?.availableMiB)?status.availableMiB:null,headroomMiB:Number.isFinite(status?.headroomMiB)?status.headroomMiB:null}));
  if(history.length>32)history.shift();
  // Live OS availability already reflects running allocations. This is a host
  // margin, not extra unallocated capacity after subtracting lease estimates.
  if(status?.pressure!=='normal'||status.paused!==false||status.observationReady!==true||
     !Number.isFinite(status.availableMiB)||!Number.isFinite(status.headroomMiB)||status.headroomMiB<=0||
     status.availableMiB<status.headroomMiB+OBSERVED_BROWSER_MEMORY.hostMarginMiB)throw failure('host_pressure');
  minAvailableMiB=Math.min(minAvailableMiB,status.availableMiB);
  if(child&&rootBirth)await measure(version);
  current(version);
  if(clock()-began>OBSERVED_BROWSER_MEMORY.sampleTimeoutMs)throw failure('stale_sample');
  samples++;
 }
 async function check() {
  if(stopped||failed)throw failure('guard_closed');
  if(running)return running;
  let deadline;
  running=Promise.race([inspect(epoch),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(failure('sample_timeout')),OBSERVED_BROWSER_MEMORY.sampleTimeoutMs);})])
   .catch(error=>{throw fail(error?.code?.startsWith('game_memory_')?error:failure('telemetry_unavailable'));})
   .finally(()=>{clearTimeout(deadline);running=undefined;});
  return running;
 }
 async function isClosed() {
  if(!child||!rootBirth)return false;
  if(child.exitCode===null&&child.signalCode===null)return false;
  const rows=await readProcesses();
  // Unknown birth for a remembered PID cannot establish that the owned process
  // exited. Parent links also catch children created after the last sample.
  return !rows.some(row=>row.pgid===child.pid||known.has(row.ppid)||
   (known.has(row.pid)&&(typeof row.start!=='string'||!row.start||known.get(row.pid)===row.start)));
 }
 return Object.freeze({check,isClosed,
  async start(){await check();timer=setInterval(()=>{check().catch(()=>{});},OBSERVED_BROWSER_MEMORY.intervalMs);},
  async attach(value){
   if(stopped||failed||child||!Number.isSafeInteger(value?.pid)||value.pid<=0)throw failure('process_identity');
   // Finish any pre-launch host census before installing a process identity.
   await running;
   if(stopped||failed)throw failure('guard_closed');
   child=value;
   const version=epoch;
   let rows;
   try{rows=await readProcesses();}catch{throw fail(failure('telemetry_unavailable'));}
   const root=rows.find(row=>row.pid===child.pid);
   current(version);
   if(!root||root.ppid!==process.pid||root.pgid!==child.pid||typeof root.start!=='string'||!root.start)throw fail(failure('process_identity'));
   rootBirth=root.start;known.set(child.pid,rootBirth);await check();return {isClosed};
  },
  async stop(){clearInterval(timer);await running?.catch(()=>{});stopped=true;epoch++;},
  receipt(cleanup='pending'){return Object.freeze({policy:'observed',...OBSERVED_BROWSER_MEMORY,samples,peakBrowserRssMiB,minAvailableMiB:Number.isFinite(minAvailableMiB)?minAvailableMiB:null,
   failureReason,cleanup,rootPid:child?.pid??null,generation,processIdentitySha256:known.size?digest():null,history:Object.freeze([...history]),
   limitation:'Sampled RSS is not a hard OS cap; browser group/descendants only. Encoder/worker allocations affect live host checks, not this RSS total. Windows uses FILETIME birth and observed parent links (pgid is a compatibility PID); POSIX uses second-resolution ps birth, executable and group. Unobserved reparenting/detached escapes are not contained.'});},
 });
}
