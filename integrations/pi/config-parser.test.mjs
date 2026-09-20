import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolveProvider } from './provider.mjs';
import { readWorkerConfig } from './runtime-state.mjs';
import { packageRoot } from './worker-runtime.mjs';

function profile(t) {
 const home=realpathSync(mkdtempSync(join(tmpdir(),'fw-parser-')));
 t.after(()=>rmSync(home,{recursive:true,force:true}));
 const codexHome=join(home,'codex-profile');mkdirSync(codexHome);
 // No auth file on purpose: incompatible routing must reject BEFORE credential lookup.
 return {home,codexHome};
}
test('PARSE-01: valid commented/literal/escaped TOML cannot hide an incompatible current provider',async(t)=>{
 const p=profile(t);
 for(const line of ['model_provider="custom" # comment',"model_provider='custom'",'model_provider="cust\\u006fm"','"model_provider" = "custom"',"model_provider = '''custom'''"]){
  writeFileSync(join(p.codexHome,'config.toml'),'model="fixture-model"\n'+line+'\n');
  await assert.rejects(resolveProvider({provider:'current',authSource:'codex'},p),/pi_current_provider_incompatible/,line);
 }
});
test('PARSE-02: malformed or unsupported current-provider configuration fails before auth',async(t)=>{
 const p=profile(t);
 for(const content of ['model="a"\nmodel="b"\n','model_provider=123\nmodel="fixture"\n','model="unclosed\n','profile="custom-profile"\nmodel="fixture"\n[profiles.custom-profile]\nmodel_provider="custom"\n']){
  writeFileSync(join(p.codexHome,'config.toml'),content);
  await assert.rejects(resolveProvider({provider:'current',authSource:'codex'},p),/pi_current_provider_(?:unresolved|incompatible)/);
 }
});
test('PARSE-05: current rejects provider-prefixed external model IDs before auth lookup',async(t)=>{
 const p=profile(t);
 writeFileSync(join(p.codexHome,'config.toml'),"model = 'google-antigravity/gemini-3.8-flash'\n");
 await assert.rejects(resolveProvider({provider:'current',authSource:'codex'},p),/pi_current_provider_incompatible/);
});

test('PARSE-03: standard TOML strings and comments retain exact model selection',async(t)=>{
 const p=profile(t);
 const access='e30.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+600,'https://api.openai.com/auth':{chatgpt_account_id:'fixture'}})).toString('base64url')+'.fixture';
 writeFileSync(join(p.codexHome,'auth.json'),JSON.stringify({auth_mode:'chatgpt',tokens:{access_token:access}}),{mode:0o600});
 writeFileSync(join(p.codexHome,'config.toml'),"model = 'exact-model' # comment\nmodel_provider = 'openai' # comment\n");
 const result=await resolveProvider({provider:'current',authSource:'codex'},p);
 assert.equal(result.model.id,'exact-model');
});
test('PARSE-04: unqualified public CLI and runtime agree on commented and flow-style YAML',async(t)=>{
 const p=profile(t);mkdirSync(join(p.home,'.forgewright'));
 const cases=[
  'delegationMode:\n  enabled: on\n  worker:\n    cli: pi # selected\n    provider: local\n    model: fixture\n    endpoint: http://127.0.0.1:12345/v1\n',
  'delegationMode: {enabled: on, worker: {cli: pi, provider: local, model: fixture, endpoint: "http://127.0.0.1:12345/v1"}}\n',
 ];
 for(const source of cases){
  writeFileSync(join(p.home,'.production-grade.yaml'),source);
  assert.equal(readWorkerConfig(p.home).enabled,true);
  const result=spawnSync(process.execPath,[join(packageRoot,'src/cli/dist/index.js'),'delegate','status'],{cwd:p.home,encoding:'utf8',timeout:15000,env:{...process.env,FORGEWRIGHT_WORKSPACE:p.home,FORGE_DELEGATION_NOTICE:'0'}});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).worker,'pi');
 }
});
