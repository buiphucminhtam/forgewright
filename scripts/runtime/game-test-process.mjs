/** Supervise an owned POSIX group or Windows Job; never infer ownership by PID. */
import {spawn} from 'node:child_process';
import {stat} from 'node:fs/promises';
import {delimiter, extname, resolve} from 'node:path';
import {TrustedWindowsJobClient} from './game-windows-job-client.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const groupAlive=pid=>{try{process.kill(-pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;if(process.platform==='darwin'&&error.code==='EPERM')return true;throw error;}};

// Preserve spawn's missing-command/cwd failure before starting a supervisor.
// The resolved executable still runs only inside the admitted Windows Job.
async function windowsExecutable(command,cwd) {
 const missing=()=>Object.assign(new Error(`spawn ${command} ENOENT`),{code:'ENOENT'});
 if(!(await stat(cwd)).isDirectory())throw missing();
 const paths=/[\\/]/.test(command)?[resolve(cwd,command)]:
  [process.cwd(),...(process.env.PATH || '').split(delimiter)].map(directory=>resolve(directory,command));
 for(const path of paths)for(const candidate of extname(path)?[path]:[path,`${path}.exe`]) {
  try {if((await stat(candidate)).isFile())return candidate;}
  catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
 }
 throw missing();
}

async function runWindowsGameProcess(session,argv,{cwd,onSpawn,windowsCompletionParent}) {
 const client=new TrustedWindowsJobClient(windowsCompletionParent);
 let child,closed,started=false,setup=Promise.resolve(),confirmed=false,forced=false,killTimer;
 let callbackError;
 const abort=()=>{
  if(!child)return;
  child.stdin.end(); // EOF is the supervisor's only cancellation protocol.
  killTimer ??= setTimeout(()=>{
   if(child.exitCode===null && child.signalCode===null) {
    forced=true;
    child.kill(); // Exact owned supervisor only; kill-on-close is NOT completion proof.
   }
  },5000);
 };
 const resource={
  async close() {
   session.signal.removeEventListener('abort',abort);
   abort();
   await setup.catch(()=>{});
   abort();
   try {
    if(child) {
     const {code}=await closed;
     if(forced)throw new Error('game_process_cleanup_unconfirmed');
     if(started)await client.validate(code);
    }
    await client.cleanup();
    confirmed=true;
   } finally {clearTimeout(killTimer);}
  },
  isClosed:()=>confirmed,
 };
 await session.own(resource);
 session.signal.addEventListener('abort',abort,{once:true});
 setup=(async()=>{
  const executable=await windowsExecutable(argv[0],cwd);
  session.signal.throwIfAborted();
  await client.prepare();
  session.signal.throwIfAborted();
  const command=client.argv([executable,...argv.slice(1)]);
  child=spawn(command[0],command.slice(1),{cwd,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let spawnError;
  closed=new Promise(resolveClose=>{
   child.once('spawn',()=>{
    started=true;
    // Windows reports the owned supervisor PID; workload/descendant PIDs are
    // never used as termination authority or as a substitute for its receipt.
    try {onSpawn?.(child.pid);}catch(error){callbackError=error;abort();}
    if(session.signal.aborted)abort();
   });
   child.once('error',error=>{spawnError=error;});
   child.once('close',(code,signal)=>{clearTimeout(killTimer);resolveClose({code,signal,error:spawnError});});
  });
  child.stdin.on('error',()=>{}); // EPIPE is not proof; close + receipt decide cleanup.
  let bytes=0;
  for(const [stream,target] of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',chunk=>{
   bytes+=chunk.length;
   if(bytes>1024*1024)session.abort(new Error('game_process_output_limit'));else target.write(chunk);
  });
  if(session.signal.aborted)abort();
 })();
 await setup;
 const result=await closed;
 if(callbackError)throw callbackError;
 if(result.error)throw result.error;
 if(result.code!==0)throw new Error(`game_process_exit:${result.code ?? result.signal}`);
 return {exitCode:result.code};
}

export async function runGameProcess(session,argv,{cwd=process.cwd(),onSpawn,windowsCompletionParent}={}) {
 if(!Array.isArray(argv)||!argv.length||argv.some(v=>typeof v!=='string'||!v||v.includes('\0')))throw new Error('game_invalid_argv');
 session.claim('emulator');
 if(process.platform==='win32')return runWindowsGameProcess(session,argv,{cwd,onSpawn,windowsCompletionParent});
 const child=spawn(argv[0],argv.slice(1),{cwd,detached:true,shell:false,stdio:['ignore','pipe','pipe']});
 let started=false;
 const result=new Promise((resolve,reject)=>{
  child.once('spawn',()=>{started=true;try{onSpawn?.(child.pid);}catch(error){reject(error);}});
  child.once('error',reject);
  child.once('exit',(code,signal)=>{if(code===0)resolve({exitCode:code});else reject(new Error(`game_process_exit:${code ?? signal}`));});
 });
 // Attach rejection observation before registering ownership/awaiting work.
 void result.catch(()=>{});
 const terminate=signal=>{if(!started||!groupAlive(child.pid))return;try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH'&&!(process.platform==='darwin'&&error.code==='EPERM'))throw error;}};
 const abort=()=>{try{terminate('SIGTERM');}catch{/* Final cleanup retains the slot on failure. */}};
 session.signal.addEventListener('abort',abort,{once:true});
 let bytes=0;
 for(const [stream,target] of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',chunk=>{
  bytes+=chunk.length;
  if(bytes>1024*1024)session.abort(new Error('game_process_output_limit'));else target.write(chunk);
 });
 await session.own({
  async close(){
   session.signal.removeEventListener('abort',abort);
   // The spawn event can still arrive after cancellation or registration.
   await new Promise(resolve=>{if(started||child.pid===undefined)resolve();else {child.once('spawn',resolve);child.once('error',resolve);}});
   if(!started)return;
   terminate('SIGTERM');
   for(let i=0;i<20&&groupAlive(child.pid);i++)await pause(25);
   if(groupAlive(child.pid))terminate('SIGKILL');
   for(let i=0;i<80&&groupAlive(child.pid);i++)await pause(25);
   if(groupAlive(child.pid))throw new Error('game_process_cleanup_unconfirmed');
  },
  isClosed:()=>!started||!groupAlive(child.pid),
 });
 if(session.signal.aborted)abort();
 return result;
}
