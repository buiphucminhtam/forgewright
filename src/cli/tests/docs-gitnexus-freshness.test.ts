import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterEach,describe,it,expect} from 'vitest';
import {collectProjectFacts,hashContent} from '../src/docs/normalize.js';
import {initManifest} from '../src/docs/manifest.js';

const roots:string[]=[],initialPath=process.env.PATH,initialStoragePath=process.env.GITNEXUS_STORAGE_PATH;
afterEach(()=>{process.env.PATH=initialPath;if(initialStoragePath===undefined)delete process.env.GITNEXUS_STORAGE_PATH;else process.env.GITNEXUS_STORAGE_PATH=initialStoragePath;for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(dirty=true){
 const root=mkdtempSync(join(tmpdir(),'fw-native-freshness-'));roots.push(root);
 const git=(...args:string[])=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
 git('init');git('config','user.name','Freshness Test');git('config','user.email','freshness@example.test');
 writeFileSync(join(root,'readme.md'),'# Source A\n');git('add','readme.md');git('commit','-m','fixture');
 if(dirty)writeFileSync(join(root,'readme.md'),'# Source B\n');
 const manifest=initManifest(root).manifest;manifest.adapters={...manifest.adapters,gitnexus:true};
 const storage=join(root,'.gitnexus');mkdirSync(storage,{recursive:true});
 const meta={repoPath:root,storagePath:storage,lastCommit:git('rev-parse','HEAD'),indexedAt:'2026-10-11T10:00:00.000Z',runnerIdentity:{schemaVersion:4,cliVersion:'1.6.12',build:{digest:'sha256:'+ 'a'.repeat(64)}},fileHashes:{'readme.md':hashContent(readFileSync(join(root,'readme.md')))},stats:{nodes:10,processes:2}};
 const receipt:any={schemaVersion:1,repository:root,index:{commit:meta.lastCommit,indexedAt:meta.indexedAt,runnerIdentity:meta.runnerIdentity,runnerIdentityStatus:'current',incompleteReasons:[]},current:{commit:meta.lastCommit,runnerIdentity:{alias:'native handles aliases'}},contentDrift:{status:'current',coveredFiles:1},status:'up-to-date'};
 const tools=join(root,'tools');mkdirSync(tools);
 // Isolated subprocess fixture, not native proof or a production verifier.
 writeFileSync(join(tools,'gitnexus'),`#!${process.execPath}\nconst fs=require('fs');const args=process.argv.slice(2);if(JSON.stringify(args)!=='["status","--json"]')process.exit(23);fs.writeFileSync(${JSON.stringify(join(root,'invocation.json'))},JSON.stringify({args,cwd:process.cwd()}));process.stdout.write(fs.readFileSync(${JSON.stringify(join(root,'status.json'))}));\n`,{mode:0o700});
 const save=()=>{const bytes=JSON.stringify(meta);writeFileSync(join(storage,'gitnexus.json'),bytes);writeFileSync(join(storage,'meta.json'),bytes);writeFileSync(join(root,'status.json'),JSON.stringify(receipt));};save();
 process.env.PATH=tools+delimiter+initialPath;
 return {root,storage,tools,manifest,meta,receipt,save,git,facts:()=>collectProjectFacts(root,manifest)};
}
describe('native GitNexus freshness at Docs boundary',()=>{
 it('accepts exact native current proof over indexed dirty content and keeps Git dirty',()=>{const f=fixture();expect(f.facts().gitnexus.status).toBe('available');expect(f.facts().git.dirty).toBe(true);expect(JSON.parse(readFileSync(join(f.root,'invocation.json'),'utf8'))).toEqual({args:['status','--json'],cwd:f.root});});
 for(const kind of ['changed','added','deleted','clean-revert'])it(`rejects native ${kind} content drift despite matching HEAD`,()=>{const f=fixture(kind!=='clean-revert');f.receipt.status='stale';f.receipt.contentDrift={status:'drifted',counts:{changed:kind==='changed'||kind==='clean-revert'?1:0,added:kind==='added'?1:0,deleted:kind==='deleted'?1:0}};f.save();expect(f.facts().gitnexus.status).toBe('stale');});
 it('pins the subprocess to the validated local index despite inherited storage redirection',()=>{const f=fixture();process.env.GITNEXUS_STORAGE_PATH=join(tmpdir(),'foreign-index');writeFileSync(join(f.tools,'gitnexus'),`#!${process.execPath}\nconst fs=require('fs');if(process.env.GITNEXUS_STORAGE_PATH!==${JSON.stringify(f.storage)})process.exit(31);process.stdout.write(fs.readFileSync(${JSON.stringify(join(f.root,'status.json'))}));\n`,{mode:0o700});expect(f.facts().gitnexus.status).toBe('available');expect(process.env.GITNEXUS_STORAGE_PATH).toBe(join(tmpdir(),'foreign-index'));});
 it('accepts canonical current metadata even when legacy mirror is stale',()=>{const f=fixture(false);writeFileSync(join(f.storage,'meta.json'),JSON.stringify({...f.meta,lastCommit:'c'.repeat(40)}));expect(f.facts().gitnexus.status).toBe('available');});
 for(const kind of ['repository','commit','indexedAt','runner','content','schema','incomplete','provenance'])it(`rejects mismatched ${kind} native evidence`,()=>{
  const f=fixture(false);if(kind==='repository')f.receipt.repository=tmpdir();if(kind==='commit')f.receipt.current.commit='c'.repeat(40);if(kind==='indexedAt')f.receipt.index.indexedAt='2026-10-10T10:00:00.000Z';if(kind==='runner')f.receipt.index.runnerIdentity={schemaVersion:4,build:{digest:'other'}};if(kind==='content')f.receipt.contentDrift.status='not-checked';if(kind==='schema')f.receipt.schemaVersion=2;if(kind==='incomplete')f.receipt.index.incompleteReasons=['incremental-in-progress'];if(kind==='provenance')f.receipt.index.runnerIdentityStatus='stale-or-unknown';f.save();expect(f.facts().gitnexus.status).not.toBe('available');
 });
 it('rejects legacy clean metadata without per-file content proof',()=>{const f=fixture(false);delete (f.meta as any).fileHashes;f.receipt.contentDrift={status:'unmeasurable',reason:'no-file-hashes'};f.save();expect(f.facts().gitnexus.status).not.toBe('available');});
 it('unavailable command fails closed without any installer fallback',()=>{const f=fixture(false);rmSync(join(f.tools,'gitnexus'));process.env.PATH='/usr/bin:/bin';expect(f.facts().gitnexus.status).not.toBe('available');});
 it('malformed subprocess output fails closed',()=>{const f=fixture(false);writeFileSync(join(f.root,'status.json'),'not-json');expect(f.facts().gitnexus.status).not.toBe('available');});
 it('rejects metadata mutation during probe',()=>{const f=fixture(false);writeFileSync(join(f.tools,'gitnexus'),`#!${process.execPath}\nconst fs=require('fs');fs.appendFileSync(${JSON.stringify(join(f.storage,'gitnexus.json'))},' ');process.stdout.write(fs.readFileSync(${JSON.stringify(join(f.root,'status.json'))}));\n`,{mode:0o700});expect(f.facts().gitnexus.status).not.toBe('available');});
 it('rejects metadata storage owned by another path',()=>{const f=fixture(false);f.meta.storagePath=tmpdir();f.save();expect(f.facts().gitnexus.status).not.toBe('available');});
 it('subprocess failure with valid looking output cannot pass',()=>{const f=fixture(false);writeFileSync(join(f.tools,'gitnexus'),`#!${process.execPath}\nconst fs=require('fs');process.stdout.write(fs.readFileSync(${JSON.stringify(join(f.root,'status.json'))}));process.exitCode=1;\n`,{mode:0o700});expect(f.facts().gitnexus.status).not.toBe('available');});
});
