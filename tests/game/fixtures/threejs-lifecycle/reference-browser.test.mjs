/** Opt-in real reference replay. Never adapts inputs to candidate hints. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './server.mjs';
import {runGameTest} from '../../../../scripts/runtime/game-test-session.mjs';
import {createGameBrowser} from '../../../../scripts/runtime/game-test-browser.mjs';
import {digest,judgeGameStudio} from '../../../../scripts/runtime/game-reference.mjs';

const root=fileURLToPath(new URL('../../../..',import.meta.url));
const output=join(root,'.forgewright/runtime/game-reference');mkdirSync(output,{recursive:true});
const contract=JSON.parse(readFileSync(new URL('reference-contract.json',import.meta.url)));
let browserExecuted=false;
try{
 const checked=await runGameTest({projectRoot:root},async session=>{
  const servers=[];
  for(const polish of [false,true]){
   const host=await serve(0,{polish});servers.push(host);
   await session.own({close:()=>new Promise((resolve,reject)=>host.server.close(e=>e?reject(e):resolve())),isClosed:()=>!host.server.listening});
  }
  const errors=[];
  const browserType={launch:async options=>{
   const browser=await chromium.launch({...options,...(process.env.FORGEWRIGHT_GAME_CHROMIUM?{executablePath:process.env.FORGEWRIGHT_GAME_CHROMIUM}:{})});
   browserExecuted=true;return browser;
  }};
  const managed=await createGameBrowser(session,browserType,{viewport:{width:960,height:800},deviceScaleFactor:1});
  const captures=[];
  for(const host of servers){
   const page=await managed.page();page.on('pageerror',e=>errors.push(String(e)));
   page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
   await page.goto(host.url);await page.waitForFunction(()=>document.querySelector('#state').textContent==='ready');
   await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
   const build=(await page.request.get(host.url+'/build.json').then(r=>r.json())).hash;
   const observations=[];
   for(const input of contract.inputs){
    session.signal.throwIfAborted();
    if(input.action==='click')await page.locator(input.target).click();
    else if(input.action==='key')await page.keyboard.press(input.key);
    else if(input.action==='wait')await page.clock.runFor(input.ms);
    else if(input.action!=='observe')throw new Error('unsupported_frozen_action');
    const state=await page.evaluate(()=>({phase:document.querySelector('#state').textContent,lane:Number(document.querySelector('canvas').dataset.lane),ticks:Number(document.querySelector('canvas').dataset.ticks),score:Number(document.querySelector('#score').textContent.split(' / ')[0])}));
    observations.push({id:input.id,state});
   }
   const path=join(output,build+'.png');await page.screenshot({path});
   captures.push({schema:'game-reference-capture/v1',build,contractSha256:digest(contract),inputSha256:digest(contract.inputs),seed:7,
    environment:{engine:'threejs',viewport:[page.viewportSize().width,page.viewportSize().height],browser:'chromium',fixedStepHz:60},
    observations,screenshot:{path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')},engineCapability:errors.length?'unknown':'observed',
    playtest:{kind:'automated-public-input',build,completed:errors.length===0}});
   await managed.closePage(page);
  }
  return captures;
 });
 const [reference,candidate]=checked.result.map(c=>({...c,quiescence:checked.quiescence}));
 const result=judgeGameStudio({contract,reference,candidate,currentBuild:candidate.build});
 writeFileSync(join(output,'reference.json'),JSON.stringify(reference,null,2)+'\n');
 writeFileSync(join(output,'candidate.json'),JSON.stringify(candidate,null,2)+'\n');
 writeFileSync(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));process.exitCode=result.status==='PASS'?0:result.status==='FAIL'?1:2;
}catch(error){
 const result={status:'UNVERIFIED',reason:error.code??error.message,actualBrowserExecuted:browserExecuted,
  limitations:['resource admission/cleanup are mandatory','no new human game-quality or device-performance claim']};
 writeFileSync(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=2;
}
