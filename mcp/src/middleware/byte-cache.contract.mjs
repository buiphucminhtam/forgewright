import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
// Execute current TS source using the installed TypeScript compiler, no bundler worker.
const temporary=mkdtempSync(join(tmpdir(),'fw-cache-contract-'));
after(()=>rmSync(temporary,{recursive:true,force:true}));
for(const name of ['byte-cache','session-deduplication']){
 const source=readFileSync(new URL(`./${name}.ts`,import.meta.url),'utf8');
 writeFileSync(join(temporary,`${name}.mjs`),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("./byte-cache.js","./byte-cache.mjs"));
}
const {SessionDeduplicationMiddleware:Middleware}=await import(pathToFileURL(join(temporary,'session-deduplication.mjs')).href);
let sequence=0;
function context(key,result){return {call:{id:`c${++sequence}`,toolName:'Read',toolArgs:{key},startTime:0,result},skillId:'software-engineer',mode:'feature',phase:'build',turnNumber:1,sessionId:'contract',userMessage:''};}
function project(name){const root=join(temporary,name);mkdirSync(root,{recursive:true});return root;}
function create(root){const mw=new Middleware();mw.configure({project_root:root});return mw;}
function put(mw,key,result){const ctx=context(key,result);mw.before_tool(ctx);mw.after_tool(ctx);}
const result=text=>({content:[{type:'text',text}]});
test('snapshots isolate both caller and cache-hit mutations including structured payload',()=>{
 const mw=create(project('snapshot'));
 try {
  const original={...result('stable'),structuredContent:{nested:{value:'owned'}}};put(mw,'a',original);
  original.structuredContent.nested.value='changed';original.content[0].text='changed';
  const hit=mw.before_tool(context('a'));assert.equal(hit.action,'cached');assert.equal(hit.cachedResult.structuredContent.nested.value,'owned');
  hit.cachedResult.content[0].text='mutated hit';assert.equal(mw.before_tool(context('a')).cachedResult.content[0].text,'stable');
 } finally {mw.reset();}
});
test('oversized structuredContent and cycles bypass caching without touching source result',()=>{
 const mw=create(project('oversize'));
 try {
  const original={...result('small text'),structuredContent:{large:'😀'.repeat(180000)}};put(mw,'large',original);
  assert.equal(mw.before_tool(context('large')).action,'pass');assert.equal(original.structuredContent.large.length,360000);
  const cyclic=result('cycle');cyclic.structuredContent={cyclic};put(mw,'cycle',cyclic);assert.equal(mw.before_tool(context('cycle')).action,'pass');
 } finally {mw.reset();}
});
test('same-project owners share quota, project change clears old namespace',()=>{
 const root=project('shared'),a=create(root),b=create(root),other=create(project('isolated'));
 try {
  put(a,'old',result('x'.repeat(40000)));put(other,'keep',result('keep'));
  for(let i=0;i<19;i++)put(b,`b${i}`,result('x'.repeat(40000)));
  assert.equal(a.before_tool(context('old')).action,'pass');assert.equal(other.before_tool(context('keep')).action,'cached');
  b.configure({project_root:project('new-root')});assert.equal(b.getStoreSize(),0);
 } finally {a.reset();b.reset();other.reset();}
});
test('process total quota bounds multiple projects while latest entries survive',()=>{
 const owners=Array.from({length:5},(_,i)=>create(project(`global-${i}`)));
 try {
  for(const mw of owners)for(let i=0;i<14;i++)put(mw,`entry${i}`,result('x'.repeat(40000)));
  assert.equal(owners[0].before_tool(context('entry0')).action,'pass');
  assert.equal(owners[4].before_tool(context('entry13')).action,'cached');
 } finally {for(const mw of owners)mw.reset();}
});

test('symlink project aliases share their physical-root quota',()=>{
 const root=project('physical'),alias=join(temporary,'alias');symlinkSync(root,alias,'junction');
 const a=create(root),b=create(alias);
 try {
  put(a,'old',result('x'.repeat(40000)));
  for(let i=0;i<19;i++)put(b,`alias${i}`,result('x'.repeat(40000)));
  assert.equal(a.before_tool(context('old')).action,'pass');
 } finally {a.reset();b.reset();}
});
test('unserializable root result bypasses the cache without throwing',()=>{
 const mw=create(project('undefined-json'));
 try {put(mw,'a',{...result('original'),toJSON:()=>undefined});assert.equal(mw.before_tool(context('a')).action,'pass');}
 finally {mw.reset();}
});
