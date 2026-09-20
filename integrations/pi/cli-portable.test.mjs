import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,writeFileSync,copyFileSync,rmSync,mkdirSync,symlinkSync,existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

test('CLI-PORTABLE-01: relocated core CLI can initialize and onboard without the optional Pi runtime',t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'fw-portable-cli-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const cli=join(root,'forge.mjs');copyFileSync(fileURLToPath(new URL('../../src/cli/dist/index.js',import.meta.url)),cli);
 // Relocation removes the optional Pi runtime, not the core CLI's declared
 // npm dependencies. Install only those packages into the disposable fixture;
 // do not link the Forgewright checkout or its integrations directory.
 const require=createRequire(new URL('../../src/cli/package.json',import.meta.url));
 const manifest=JSON.parse(readFileSync(new URL('../../src/cli/package.json',import.meta.url),'utf8'));
 mkdirSync(join(root,'node_modules'));
 for(const dependency of Object.keys(manifest.dependencies)){
  let folder=dirname(require.resolve(dependency));let found=false;
  for(let depth=0;depth<10;depth++){
   const metadata=join(folder,'package.json');
   if(existsSync(metadata)&&JSON.parse(readFileSync(metadata,'utf8')).name===dependency){found=true;break;}
   const parent=dirname(folder);if(parent===folder)break;folder=parent;
  }
  assert.equal(found,true,`Core dependency ${dependency} must resolve`);
  symlinkSync(folder,join(root,'node_modules',dependency),'junction');
 }
 assert.equal(existsSync(join(root,'integrations/pi')),false);
 const original='{"name":"portable-consumer","private":true}\n';writeFileSync(join(root,'package.json'),original);
 for(const args of [['--json','init',root],['--json','onboard',root],['--version']]){
  const result=spawnSync(process.execPath,[cli,...args],{cwd:root,env:{...process.env,FORGE_DELEGATION_NOTICE:'0'},encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');
  if(args[0]==='--json')assert.equal(JSON.parse(result.stdout).ok,true);
 }
});
