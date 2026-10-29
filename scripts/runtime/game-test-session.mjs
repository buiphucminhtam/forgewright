/** Managed game test admission and owned teardown; no native provider provisioning. */
import {randomUUID} from 'node:crypto';
import * as sharedGovernor from '../../integrations/pi/host-governor.mjs';
import {createMemoryGuard,OBSERVED_BROWSER_MEMORY} from './game-test-memory.mjs';

export const GAME_RESERVATION_MIB = Object.freeze({browser:1024, emulator:2048, combined:3072});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const failure = code => Object.assign(new Error(code), {code});
function bounded(promise, ms, code) {
 let timer;
 return Promise.race([promise, new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure(code)),ms);})]).finally(()=>clearTimeout(timer));
}

export async function runGameTest({projectRoot, runId=`game-${randomUUID()}`, resourceKind='browser',
 timeoutMs=120000, cleanupMs=5000, waitMs=30000, signal, governor=sharedGovernor,memoryPolicy='fixed'}, work) {
 if(!Object.hasOwn(GAME_RESERVATION_MIB,resourceKind) || typeof work!=='function' ||
    !['fixed','observed'].includes(memoryPolicy) || (memoryPolicy==='observed'&&resourceKind!=='browser') ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>1800000 ||
    !Number.isSafeInteger(cleanupMs) || cleanupMs<1 || cleanupMs>30000) throw failure('game_invalid_limits');
 const controller=new AbortController();
 const abort=reason=>{if(!controller.signal.aborted)controller.abort(reason);};
 const relay=()=>abort(signal.reason);
 signal?.throwIfAborted();signal?.addEventListener('abort',relay,{once:true});
 const stop=()=>abort(failure('game_cancelled'));
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 const timer=setTimeout(()=>abort(failure('game_timeout')),timeoutMs);
 const resources=[];const roles=new Set();let closing=false,worker,heavy,heartbeat,heartbeatBusy=false,settled=true;
 let result,primary,quiescent=true;
 const memory=memoryPolicy==='observed'?createMemoryGuard({getStatus:()=>governor.getHostAdmissionStatus(),abort}):undefined;
 const session=Object.freeze({signal:controller.signal,memoryPolicy,
  async observeBrowser(child){if(!memory)throw failure('game_memory_policy');return memory.attach(child);},
  async browserClosed(){return memory?memory.isClosed():false;},
  async checkMemory(){controller.signal.throwIfAborted();if(memory)await memory.check();},
  abort,
  claim(role) {
   if(closing || !heavy)throw failure('game_session_closed');
   controller.signal.throwIfAborted();
   const allowed=resourceKind==='combined'?['browser','emulator']:[resourceKind];
   if(!allowed.includes(role))throw failure('game_resource_role_unavailable');
   if(roles.has(role))throw failure('game_resource_already_claimed');
   roles.add(role);
  },
  async own(resource) {
   if(!resource || typeof resource.close!=='function' || typeof resource.isClosed!=='function') throw failure('game_invalid_resource');
   if(closing) {
    // A non-cooperative late effect must still be closed; the lease remains uncertain.
    await bounded(Promise.resolve().then(()=>resource.close()),cleanupMs,'game_late_cleanup_timeout');
    throw failure('game_session_closed');
   }
   resources.push(resource);return resource;
  },
 });
 try {
  worker=await governor.acquireHostSlot({projectRoot,runId,kind:'worker',signal:controller.signal,waitMs});
  heavy=await governor.acquireHostSlot({projectRoot,runId,kind:'heavy',parentLeaseId:worker.id,
   memoryMiB:memory?OBSERVED_BROWSER_MEMORY.startupMiB:GAME_RESERVATION_MIB[resourceKind],signal:controller.signal,waitMs});
  if(memory)await memory.start();
  controller.signal.throwIfAborted();
  heartbeat=setInterval(()=>{
   if(heartbeatBusy)return;
   heartbeatBusy=true;
   Promise.all([worker.heartbeat(),heavy.heartbeat()]).catch(()=>abort(failure('game_lease_lost'))).finally(()=>{heartbeatBusy=false;});
  },1000);
  settled=false;
  const operation=Promise.resolve().then(()=>{controller.signal.throwIfAborted();return work(session);});
  const observed=operation.then(value=>{settled=true;return value;},error=>{settled=true;throw error;});
  let abortListener;
  const aborted=new Promise((_,reject)=>{
   abortListener=()=>reject(controller.signal.reason ?? failure('game_cancelled'));
   controller.signal.addEventListener('abort',abortListener,{once:true});
   if(controller.signal.aborted)abortListener();
  });
  try {result=await Promise.race([observed,aborted]);}
  finally {
   controller.signal.removeEventListener('abort',abortListener);
   if(!settled)await Promise.race([observed.catch(()=>{}),pause(cleanupMs)]);
  }
 } catch(error) {primary=error;}
 finally {
  closing=true;abort(failure('game_session_closed'));clearTimeout(timer);clearInterval(heartbeat);
  if(memory){await memory.stop();const reason=memory.receipt().failureReason;if(reason&&!primary)primary=failure(reason);}
  // Always attempt every closer, even when another closer fails or times out.
  const closed=[];
  for(const resource of resources.toReversed()) {
   try {
    await bounded(Promise.resolve().then(()=>resource.close()).then(async()=>{
     if(await resource.isClosed()!==true)throw failure('game_cleanup_unconfirmed');
    }),cleanupMs,'game_cleanup_timeout');
    closed.push({status:'fulfilled'});
   } catch(reason) {closed.push({status:'rejected',reason});}
  }
  quiescent=settled && closed.every(value=>value.status==='fulfilled');
  if(!quiescent)primary=new AggregateError([...(primary?[primary]:[]),...closed.filter(v=>v.status==='rejected').map(v=>v.reason)],'game_cleanup_uncertain'+(primary?`: ${primary.message}`:''));
  for(const lease of [heavy,worker]) if(lease) {
   try {await lease.release({quiescent});}
   catch(error){quiescent=false;primary=new AggregateError([...(primary?[primary]:[]),error],'game_release_failed');}
  }
  signal?.removeEventListener('abort',relay);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
 }
 if(primary){if(memory&&typeof primary==='object')primary.memory=memory.receipt(quiescent?'confirmed':'uncertain');throw primary;}
 return {result,quiescence:'confirmed',resourceKind,...(memory?{memory:memory.receipt('confirmed')}:{})};
}
