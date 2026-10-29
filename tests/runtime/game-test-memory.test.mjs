import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {EventEmitter} from 'node:events';
import {runGameTest} from '../../scripts/runtime/game-test-session.mjs';
import {createGameBrowser} from '../../scripts/runtime/game-test-browser.mjs';

const healthy=()=>({pressure:'normal',paused:false,observationReady:true,availableMiB:1000,headroomMiB:512});
const modulePath='../../scripts/runtime/game-test-memory.mjs';
const processRow=(pid,ppid,pgid,rssKiB,start='birth')=>({pid,ppid,pgid,rssKiB,start});
const fakeChild=()=>({pid:23456,exitCode:null,signalCode:null});

test('observed browser uses a bootstrap reservation, legacy and emulator policies remain explicit',async()=>{
 for(const memoryPolicy of ['fixed','observed']) {
  const requests=[],releases=[];
  const governor={getHostAdmissionStatus:async()=>healthy(),acquireHostSlot:async options=>{
   requests.push(options);return {id:options.kind,heartbeat:async()=>{},release:async x=>releases.push(x)};
  }};
  const result=await runGameTest({projectRoot:process.cwd(),memoryPolicy,governor},async()=>42);
  assert.equal(requests[1].memoryMiB,memoryPolicy==='observed'?256:1024);
  assert.deepEqual(releases,[{quiescent:true},{quiescent:true}]);
  if(memoryPolicy==='observed')assert.equal(result.memory.startupMiB,256);
 }
 let effects=0;
 await assert.rejects(runGameTest({projectRoot:process.cwd(),resourceKind:'emulator',memoryPolicy:'observed'},()=>effects++),/invalid/);
 await assert.rejects(runGameTest({projectRoot:process.cwd(),memoryPolicy:'typo'},()=>effects++),/invalid/);
 assert.equal(effects,0);
});

test('unsafe or unavailable host observations prevent effects and release only the original slots',async()=>{
 for(const bad of [{pressure:'critical'},{pressure:'unknown'},{pressure:'warning'},{paused:true},{observationReady:false},{availableMiB:575},{availableMiB:NaN},{headroomMiB:0}]) {
  let effects=0,acquires=0;const releases=[];
  const governor={getHostAdmissionStatus:async()=>({...healthy(),...bad}),acquireHostSlot:async()=>{acquires++;return {id:'lease',release:async v=>releases.push(v),heartbeat:async()=>{}};}};
  await assert.rejects(runGameTest({projectRoot:process.cwd(),memoryPolicy:'observed',governor},()=>effects++),error=>{
   assert.match(error.message,/game_memory/);assert.equal(error.memory.cleanup,'confirmed');assert(Object.isFrozen(error.memory));assert.match(error.memory.failureReason,/game_memory/);return true;
  });
  assert.equal(effects,0);assert.equal(acquires,2);assert.deepEqual(releases,[{quiescent:true},{quiescent:true}]);
 }
});

test('owned tree measurement includes descendants and reparented group members, excludes foreign work',async t=>{
 const {createMemoryGuard}=await import(modulePath);const child=fakeChild();
 let rows=[processRow(child.pid,process.pid,child.pid,100*1024),processRow(23457,child.pid,child.pid,80*1024),processRow(23458,1,child.pid,20*1024),processRow(999,1,999,900*1024)];
 const guard=createMemoryGuard({getStatus:async()=>healthy(),readProcesses:async()=>rows,abort:()=>{}});
 t.after(()=>guard.stop());
 await guard.start();const tracked=await guard.attach(child);assert.equal(guard.receipt().peakBrowserRssMiB,200);
 assert.equal(await tracked.isClosed(),false);
 child.exitCode=0;rows=rows.filter(r=>r.pid!==child.pid);assert.equal(await tracked.isClosed(),false);
 rows=rows.filter(r=>r.pgid!==child.pid);assert.equal(await tracked.isClosed(),true);await guard.stop();
});

test('growth, identity loss and stale telemetry abort instead of guessing or readmitting',async t=>{
 const {createMemoryGuard}=await import(modulePath);
 for(const fault of ['growth','identity','missing','telemetry','stale']) {
  const child=fakeChild();let state=false,now=0;const reasons=[];
  const guard=createMemoryGuard({getStatus:async()=>{if(state&&fault==='telemetry')throw Error('lost');if(state&&fault==='stale')now+=3000;return healthy();},clock:()=>now,
   readProcesses:async()=>state&&fault==='missing'?[]:[processRow(child.pid,process.pid,child.pid,(state&&fault==='growth'?513:100)*1024,state&&fault==='identity'?'other':'birth')],abort:e=>reasons.push(e.code)});
  t.after(()=>guard.stop());
  await guard.start();await guard.attach(child);state=true;
  await assert.rejects(guard.check(),/game_memory/);assert.equal(reasons.length,1);await guard.stop();
 }
});

test('periodic monitoring stops cooperative work and reclaims both original leases',async()=>{
 let reads=0,closed=false,acquires=0;const releases=[];
 const governor={getHostAdmissionStatus:async()=>({...healthy(),pressure:++reads>1?'critical':'normal'}),acquireHostSlot:async()=>{acquires++;return {id:'lease',heartbeat:async()=>{},release:async x=>releases.push(x)};}};
 await assert.rejects(runGameTest({projectRoot:process.cwd(),memoryPolicy:'observed',governor,timeoutMs:3000},async session=>{
  await session.own({close:async()=>{closed=true;},isClosed:()=>closed});
  await new Promise(resolve=>session.signal.addEventListener('abort',resolve,{once:true}));
 }),/game_memory/);
 assert(closed);assert.equal(acquires,2);assert.deepEqual(releases,[{quiescent:true},{quiescent:true}]);
});

test('native owned process group is observed and only confirmed exit permits reclamation',async()=>{
 const {createMemoryGuard}=await import(modulePath);
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
 const guard=createMemoryGuard({getStatus:async()=>healthy(),abort:()=>{}});
 try {await once(child,'spawn');await guard.start();const tracked=await guard.attach(child);assert(guard.receipt().peakBrowserRssMiB>0);assert.equal(await tracked.isClosed(),false);
  const exited=once(child,'exit');child.kill('SIGTERM');await exited;assert.equal(await tracked.isClosed(),true);
 } finally {await guard.stop();if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');}
});

test('observed browser adapter binds loopback launch ownership and reclaims a failed connection',async()=>{
 for(const connectionFails of [false,true]) {
  let child,launches=0,connected=true;const releases=[];const context=new EventEmitter();context.pages=()=>[];context.close=async()=>{};
  const type={async launchServer(options){assert.equal(options.host,'127.0.0.1');launches++;child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});await once(child,'spawn');
   return {process:()=>child,wsEndpoint:()=> 'ws://127.0.0.1/owned',close:async()=>{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}connected=false;}};
  },async connect(endpoint){assert.equal(endpoint,'ws://127.0.0.1/owned');if(connectionFails)throw Error('connect failed');return {newContext:async()=>context,isConnected:()=>connected,close:async()=>{connected=false;}};}};
  const governor={getHostAdmissionStatus:async()=>healthy(),acquireHostSlot:async()=>({id:'lease',heartbeat:async()=>{},release:async x=>releases.push(x)})};
  try {
   const work=runGameTest({projectRoot:process.cwd(),memoryPolicy:'observed',governor},s=>createGameBrowser(s,type));
   if(connectionFails)await assert.rejects(work,/connect failed/);else assert.equal((await work).quiescence,'confirmed');
   assert.equal(launches,1);assert.equal(connected,false);assert.deepEqual(releases,[{quiescent:true},{quiescent:true}]);
  } finally {if(child?.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');}
 }
});

test('late connection after cancellation closes both client and server without releasing quarantine',async()=>{
 let child,resolveConnect,clientClosed=0,serverClosed=0,operation;const controller=new AbortController(),releases=[];
 const type={async launchServer(){child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});await once(child,'spawn');return {
  process:()=>child,wsEndpoint:()=> 'ws://127.0.0.1/owned',close:async()=>{serverClosed++;if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}}
 };},connect(){controller.abort(Error('cancel connect'));return new Promise(resolve=>{resolveConnect=resolve;});}};
 const governor={getHostAdmissionStatus:async()=>healthy(),acquireHostSlot:async()=>({id:'lease',heartbeat:async()=>{},release:async x=>releases.push(x)})};
 await assert.rejects(runGameTest({projectRoot:process.cwd(),memoryPolicy:'observed',governor,signal:controller.signal,cleanupMs:10},s=>{operation=createGameBrowser(s,type);return operation;}),/cleanup_uncertain/);
 resolveConnect({close:async()=>{clientClosed++;},isConnected:()=>false});await assert.rejects(operation,/cancel connect/);
 assert.equal(clientClosed,1);assert.equal(serverClosed,1);assert.deepEqual(releases,[{quiescent:false},{quiescent:false}]);
});

test('unsettled work stays quarantined after the memory watchdog aborts',async()=>{
 let reads=0,closed=false;const releases=[];
 const governor={getHostAdmissionStatus:async()=>({...healthy(),pressure:++reads>1?'unknown':'normal'}),acquireHostSlot:async()=>({id:'lease',heartbeat:async()=>{},release:async x=>releases.push(x)})};
 await assert.rejects(runGameTest({projectRoot:process.cwd(),memoryPolicy:'observed',governor,timeoutMs:3000,cleanupMs:10},async session=>{
  await session.own({close:async()=>{closed=true;},isClosed:()=>closed});await new Promise(()=>{});
 }),/cleanup_uncertain/);
 assert(closed);assert.deepEqual(releases,[{quiescent:false},{quiescent:false}]);
});

test('a timed-out census cannot mutate the receipt after stop or overlap another sample',async()=>{
 const {createMemoryGuard}=await import(modulePath);let finish,calls=0;
 const guard=createMemoryGuard({getStatus:()=>{calls++;return new Promise(resolve=>{finish=resolve;});},abort:()=>{}});
 await assert.rejects(guard.start(),/sample_timeout/);await guard.stop();const sealed=guard.receipt('confirmed');
 finish(healthy());await new Promise(resolve=>setTimeout(resolve,5));
 assert.deepEqual(guard.receipt('confirmed'),sealed);assert.equal(calls,1);await assert.rejects(guard.check(),/guard_closed/);
});

test('a pending unsafe census at work completion cannot be reported as success',async()=>{
 let reads=0,finishWork;const releases=[];
 const governor={getHostAdmissionStatus:async()=>{if(++reads===1)return healthy();finishWork();await new Promise(r=>setTimeout(r,5));return {...healthy(),pressure:'critical'};},acquireHostSlot:async()=>({id:'lease',heartbeat:async()=>{},release:async x=>releases.push(x)})};
 await assert.rejects(runGameTest({projectRoot:process.cwd(),memoryPolicy:'observed',governor,timeoutMs:3000},()=>new Promise(resolve=>{finishWork=resolve;})),/game_memory_host_pressure/);
 assert.deepEqual(releases,[{quiescent:true},{quiescent:true}]);
});
