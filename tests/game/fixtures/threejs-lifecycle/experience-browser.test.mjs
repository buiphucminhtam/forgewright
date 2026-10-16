import assert from 'node:assert/strict';import {chromium} from 'playwright';import {serve} from './experience-server.mjs';import {checkExperience} from '../web-experience-browser.mjs';
await checkExperience({engine:'threejs',version:'0.183.2',serve,chromium,manifest:new URL('experience.json',import.meta.url),async drive({page,url,shot}){
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});await page.goto(url);await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.assetLoaded==='true');await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
 assert.match(await page.locator('canvas').getAttribute('data-asset-clips'),/hover/);await shot('boot-glb');
 await page.locator('#start').click();await page.locator('#settings').click();const lane=await page.locator('canvas').getAttribute('data-lane');await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('canvas').getAttribute('data-lane'),lane);await page.keyboard.press('Escape');assert.equal(await page.locator('#settings').evaluate(el=>el===document.activeElement),true);
 for(let restart=0;restart<3;restart++){
  await page.locator('#start').click();for(let gate=0;gate<3;gate++){const safe=['LEFT','CENTRE','RIGHT'].indexOf(await page.locator('#next').textContent());let current=Number(await page.locator('canvas').getAttribute('data-lane'));while(current!==safe){await page.keyboard.press(current<safe?'ArrowRight':'ArrowLeft');current+=current<safe?1:-1;}await page.clock.runFor(gate===0?2050:2000);}
  assert.equal(await page.locator('#state').textContent(),'won');
 }
 await shot('won-glb');await page.locator('#start').click();const safe=['LEFT','CENTRE','RIGHT'].indexOf(await page.locator('#next').textContent());let current=1;const wrong=(safe+1)%3;while(current!==wrong){await page.keyboard.press(current<wrong?'ArrowRight':'ArrowLeft');current+=current<wrong?1:-1;}await page.clock.runFor(2050);assert.equal(await page.locator('#state').textContent(),'lost');
 await page.setViewportSize({width:390,height:844});await page.locator('#start').tap();await page.locator('#left').tap();assert.equal(await page.locator('canvas').getAttribute('data-lane'),'0');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot('touch-glb');
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.assetLoaded==='true');await shot('reduced-motion');
 return {engine:'Three.js',glb:'loaded',clips:['hover'],winLose:true,menuInput:'blocked',horizontalOverflow:false,touch:'emulated'};
}});
