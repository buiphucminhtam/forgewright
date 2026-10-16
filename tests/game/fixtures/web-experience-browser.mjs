/** Runs one admitted browser/context/page. Failure receipts never claim PASS. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runGameTest} from '../../../scripts/runtime/game-test-session.mjs';
import {createGameBrowser} from '../../../scripts/runtime/game-test-browser.mjs';
const root=fileURLToPath(new URL('../../..',import.meta.url));
export function experienceFailure(error,browserExecuted,phase='runtime'){
 const failed=browserExecuted||phase==='build';const status=failed?'FAIL':'UNVERIFIED';return {status,exitCode:failed?1:2,reason:String(error?.message??error)};
}
export async function checkExperience({engine,version,prepare,serve,chromium,drive,manifest}){
 const out=join(root,'.forgewright/runtime/game-process-research/20261015/implementation/browser');mkdirSync(out,{recursive:true});
 const receipt={engine,declaredVersion:version,status:'UNVERIFIED',browserExecuted:false,manifest_sha256:createHash('sha256').update(readFileSync(manifest)).digest('hex'),limitations:['Touch input is emulated, not a physical mobile device.','No claim of player enjoyment, visual superiority or measured device performance.']};
 let phase='build';
 try{
  if(typeof prepare!=='function')throw new Error('pinned compiler preparation is required');
  receipt.preparation=await prepare();phase='admission';
  const checked=await runGameTest({projectRoot:root},async session=>{
   const host=await serve();await session.own({close:()=>new Promise((resolve,reject)=>host.server.close(e=>e?reject(e):resolve())),isClosed:()=>!host.server.listening});
   receipt.build=host.build;
   const type={launch:async options=>{const browser=await chromium.launch({...options,...(process.env.FORGEWRIGHT_GAME_CHROMIUM?{executablePath:process.env.FORGEWRIGHT_GAME_CHROMIUM}:{})});receipt.browserExecuted=true;return browser;}};
   const managed=await createGameBrowser(session,type,{viewport:{width:960,height:800},hasTouch:true,deviceScaleFactor:1});
   const page=await managed.page();phase='runtime';const errors=[],screenshots=[];
   page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   const shot=async name=>{const path=join(out,`${engine}-${host.build}-${name}.png`);await page.screenshot({path});screenshots.push(path);};
   const observations=await drive({page,url:host.url,shot});assert.deepEqual(errors,[]);
   return {observations,screenshots,errors,build:host.build,viewports:[[960,800],[390,844]]};
  });
  Object.assign(receipt,checked.result,{status:'PASS',quiescence:checked.quiescence});
 }catch(error){const failure=experienceFailure(error,receipt.browserExecuted,phase);receipt.status=failure.status;receipt.reason=failure.reason;receipt.failureStage=phase;receipt.quiescence='not-certified';process.exitCode=failure.exitCode;}
 const path=join(out,`${engine}-latest.json`);writeFileSync(path,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({...receipt,receipt:path}));return receipt;
}
