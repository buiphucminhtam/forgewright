/** Use the fixture's pinned local compiler; never serve stale output after failure. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../..',import.meta.url));
const compiler=fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc',import.meta.url));
export function buildExperience(project){
 const config=project instanceof URL?fileURLToPath(project):resolve(project);
 const command=[compiler,'-p',config,'--incremental','false','--noEmit','false','--emitDeclarationOnly','false','--noEmitOnError'];
 try{execFileSync(process.execPath,command,{cwd:dirname(config),timeout:30000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});}
 catch(error){throw new Error(`experience build failed: ${String(error.message).slice(0,1024)} ${String(error.stdout??'').slice(0,3072)}`,{cause:error});}
 return {status:'PASS',compiler:'typescript',version:JSON.parse(readFileSync(new URL('../../../node_modules/typescript/package.json',import.meta.url),'utf8')).version,config:relative(root,config),command:[process.execPath,...command],timeoutMs:30000};
}
