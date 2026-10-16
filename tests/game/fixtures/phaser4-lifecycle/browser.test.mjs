import assert from 'node:assert/strict';import {chromium} from 'playwright';import {serve} from './server.mjs';import {checkExperience} from '../web-experience-browser.mjs';
await checkExperience({engine:'phaser',version:'4.2.1',serve,chromium,manifest:new URL('experience.json',import.meta.url),async drive({page,url,shot}){
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.assetLoaded==='true');
 assert.equal(await page.locator('#engine-version').textContent(),'4.2.1');await shot('boot');
 const start=async()=>{const before=Number(await page.locator('canvas').getAttribute('data-scene-starts'));await page.locator('#start').click();await page.waitForFunction(n=>Number(document.querySelector('canvas').dataset.sceneStarts)>n,before);};
 for(let restart=0;restart<3;restart++){
  await start();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('canvas').getAttribute('data-lane'),'0');
  await page.locator('#pause').click();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('canvas').getAttribute('data-lane'),'0');await page.locator('#pause').click();
  await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator('#state').textContent(),'won');assert.equal(await page.locator('#score').textContent(),'3 / 3');
 }
 await shot('won');await start();await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#state').textContent(),'lost');await shot('lost');
 await start();const lane=await page.locator('canvas').getAttribute('data-lane');await page.locator('#settings').click();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('canvas').getAttribute('data-lane'),lane);await page.keyboard.press('Escape');assert.equal(await page.locator('#settings').evaluate(el=>el===document.activeElement),true);
 await page.setViewportSize({width:390,height:844});await start();await page.locator('#left').tap();assert.equal(await page.locator('canvas').getAttribute('data-lane'),'0');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot('touch');
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));assert.equal(await page.locator('#state').textContent(),'paused');await page.locator('#pause').click();assert.equal(await page.locator('#state').textContent(),'playing');
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.assetLoaded==='true');await shot('reduced-motion');
 await page.goto(url+'/ui/preview.html');assert.equal(await page.locator('.game-ui button:disabled').count(),2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot('kit-gallery');
 return {engine:'Phaser 4.2.1 observed',sprite:'loaded',sceneRestarts:3,winLose:true,menuInput:'blocked',horizontalOverflow:false,touch:'emulated'};
}});
