import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {serve} from './server.mjs';
const output=fileURLToPath(new URL('../../../../.forgewright/runtime/game-host-upgrade/game-render/',import.meta.url));
mkdirSync(output,{recursive:true});
const {server,url,build}=await serve();
let browser;
const errors=[];const screenshots=[];
try {
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:960,height:800},hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#state').textContent==='ready');
 await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
 const state=()=>page.locator('#state').textContent();
 const shot=async name=>{const path=join(output,`${build}-${name}.png`);await page.screenshot({path});screenshots.push(path);};
 const steer=async()=>{
  const safe=['LEFT','CENTRE','RIGHT'].indexOf(await page.locator('#next').textContent());
  let lane=Number(await page.locator('canvas').getAttribute('data-lane'));
  while(lane!==safe){await page.keyboard.press(lane<safe?'ArrowRight':'ArrowLeft');lane+=lane<safe?1:-1;}
 };
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await shot('boot');
 for(let restart=0;restart<3;restart++){
  await page.locator('#start').click();assert.equal(await state(),'playing');
  await page.locator('#pause').click();const ticks=await page.locator('canvas').getAttribute('data-ticks');
  await page.clock.runFor(1000);assert.equal(await page.locator('canvas').getAttribute('data-ticks'),ticks);
  await page.locator('#pause').click();
  for(let gate=0;gate<3;gate++){await steer();await page.clock.runFor(gate===0?2050:2000);}
  assert.equal(await state(),'won');assert.equal(await page.locator('#score').textContent(),'3 / 3');
 }
 await shot('won');
 await page.locator('#start').click();
 const safe=['LEFT','CENTRE','RIGHT'].indexOf(await page.locator('#next').textContent());
 const wrong=(safe+1)%3;let lane=1;
 while(lane!==wrong){await page.keyboard.press(lane<wrong?'ArrowRight':'ArrowLeft');lane+=lane<wrong?1:-1;}
 await page.clock.runFor(2050);assert.equal(await state(),'lost');await shot('lost');
 await page.setViewportSize({width:390,height:844});await page.clock.runFor(50);
 await page.locator('#start').tap();await page.locator('#left').tap();
 assert.equal(await page.locator('canvas').getAttribute('data-lane'),'0');
 await page.locator('#pause').tap();assert.equal(await state(),'paused');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await shot('touch-paused');assert.deepEqual(errors,[]);
 writeFileSync(join(output,`${build}.json`),JSON.stringify({build,screenshots,errors,viewports:[[960,800],[390,844]],touch:'emulated',mobilePerformance:'UNVERIFIED',result:'PASS'},null,2)+'\n');
 console.log(JSON.stringify({result:'PASS',build,screenshots}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
