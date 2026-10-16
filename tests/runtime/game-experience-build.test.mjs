import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('experience compiler replaces stale output and rejects current invalid source',async()=>{
 const {buildExperience}=await import('../game/fixtures/web-experience-build.mjs');
 const root=mkdtempSync(join(tmpdir(),'fw-experience-build-'));
 try{
  const config=join(root,'tsconfig.json'),source=join(root,'main.ts');
  writeFileSync(config,JSON.stringify({compilerOptions:{target:'ES2022',module:'ES2022',outDir:'dist',types:[],noEmitOnError:true},files:['main.ts']}));
  writeFileSync(source,'export const outcome = "won";');buildExperience(config);
  assert.match(readFileSync(join(root,'dist/main.js'),'utf8'),/"won"/);
  writeFileSync(source,'export const outcome = "lost";');buildExperience(config);
  assert.match(readFileSync(join(root,'dist/main.js'),'utf8'),/"lost"/);
  for(const [name,options] of [['typecheck',{noEmit:true}],['declarations',{declaration:true,emitDeclarationOnly:true}]]){
   const settings=JSON.parse(readFileSync(config,'utf8'));Object.assign(settings.compilerOptions,options);writeFileSync(config,JSON.stringify(settings));
   writeFileSync(source,`export const outcome = "${name}";`);buildExperience(config);
   assert.match(readFileSync(join(root,'dist/main.js'),'utf8'),new RegExp(`"${name}"`));
  }
  writeFileSync(source,'export const outcome: number = "wrong";');
  assert.throws(()=>buildExperience(config),/build failed/);
  const runner=new URL('../game/fixtures/web-experience-browser.mjs',import.meta.url).href;
  const compiler=new URL('../game/fixtures/web-experience-build.mjs',import.meta.url).href;
  const code=`import {checkExperience} from ${JSON.stringify(runner)};import {buildExperience} from ${JSON.stringify(compiler)};await checkExperience({engine:'build-negative-fixture',version:'test',manifest:${JSON.stringify(config)},prepare:()=>buildExperience(${JSON.stringify(config)}),serve(){throw new Error('serve must not execute after a failed build')},chromium:{launch(){throw new Error('browser must not launch after a failed build')}}});`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:35000,maxBuffer:1024*1024});
  assert.equal(child.status,1,child.stdout+child.stderr);
  const receipt=JSON.parse(child.stdout.trim());assert.equal(receipt.status,'FAIL');assert.equal(receipt.failureStage,'build');assert.equal(receipt.browserExecuted,false);assert.equal(receipt.build,undefined);
 }finally{rmSync(root,{recursive:true,force:true});}
});
