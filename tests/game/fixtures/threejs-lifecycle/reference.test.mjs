import test from 'node:test';
import assert from 'node:assert/strict';
import {serve} from './server.mjs';

test('visual-only fixture has distinct served build but identical game code',async()=>{
 const baseline=await serve();let polish;
 try{
  polish=await serve(0,{polish:true});
  assert.notEqual(baseline.build,polish.build);
  const read=async(host,path)=>fetch(host.url+path).then(r=>r.text());
  assert.equal(await read(baseline,'/dist/model.js'),await read(polish,'/dist/model.js'));
  assert.equal(await read(baseline,'/dist/app.js'),await read(polish,'/dist/app.js'));
  assert.notEqual(await read(baseline,'/'),await read(polish,'/'));
  assert.equal((await fetch(polish.url+'/build.json').then(r=>r.json())).hash,polish.build);
 }finally{
  await Promise.all([baseline,polish].filter(Boolean).map(({server})=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))));
 }
});
