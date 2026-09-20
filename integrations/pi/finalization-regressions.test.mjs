import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// Public-CLI fault injection lives solely in an owned test preload. The real
// SDK, file scope, OS verifier, lifecycle and global broker still execute.
// Only provider output and finalization acknowledgement are deterministic.
const ROOT = process.cwd();
const { writeWorkerConfig } = await import(pathToFileURL(join(ROOT, 'integrations/pi/runtime-state.mjs')).href);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (const mode of ['throw', 'unconfirmed']) {
  test(`FINALIZATION-${mode}: public CLI cannot report success after uncertain finalization`, { timeout: 40000 }, async () => {
    const root = realpathSync(mkdtempSync('/private/tmp/fw-pi-finalization-'));
    const project = join(root, 'consumer'); mkdirSync(project);
    const home = join(root, 'admission');
    mkdirSync(join(project, '.forgewright'));
    copyFileSync(join(ROOT, '.forgewright/execution-policy.yaml'), join(project, '.forgewright/execution-policy.yaml'));
    writeFileSync(join(project, 'package.json'), '{"private":true,"type":"module"}\n');
    writeFileSync(join(project, 'source.mjs'), 'export const sum=(a,b)=>a+b;\n');
    const verifier = "import assert from 'node:assert/strict';import {sum} from './source.mjs';assert.equal(sum(2,3),5);console.log('IMMUTABLE_CHECK_PASSED');\n";
    writeFileSync(join(project, 'verify.mjs'), verifier);
    writeFileSync(join(project, 'task.json'), JSON.stringify({ schema: 'forgewright-pi-task/v1', taskId: `finalization-${mode}`,
      objective: 'Run the immutable verifier', acceptance: ['The check passes and cleanup is confirmed'],
      readPaths: ['source.mjs', 'verify.mjs'], writePaths: [], verifiers: [{ id: 'check', argv: [process.execPath, 'verify.mjs'] }],
      limits: { turns: 3, timeoutMs: 15000, verifierTimeoutMs: 5000 } }));
    writeWorkerConfig(project, { enabled: true, provider: 'local', model: 'deterministic-test', endpoint: 'http://127.0.0.1:12345/v1' });
    const probe = join(root, 'probe.json');
    const preload = join(root, 'test-preload.mjs');
    writeFileSync(preload, `import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {LifecycleCoordinator} from ${JSON.stringify(pathToFileURL(join(ROOT, 'mcp/build/runtime/lifecycle-coordinator.js')).href)};
let requests=0;
globalThis.fetch=async (url,options)=>{
 assert.equal(String(url),'http://127.0.0.1:12345/v1/chat/completions');
 assert.equal(options.redirect,'manual');requests++;
 assert.ok(requests<=2,'No hidden provider retries');
 const delta=requests===1?{role:'assistant',tool_calls:[{index:0,id:'verify-once',type:'function',function:{name:'pi_verify',arguments:'{"id":"check"}'}}]}:{role:'assistant',content:'The immutable check passed.'};
 const chunks=[{id:'fixture',choices:[{index:0,delta,finish_reason:null}]},{id:'fixture',choices:[{index:0,delta:{},finish_reason:requests===1?'tool_calls':'stop'}]}];
 return new Response(chunks.map(c=>'data: '+JSON.stringify(c)+'\\n\\n').join('')+'data: [DONE]\\n\\n',{headers:{'content-type':'text/event-stream'}});
};
const finalize=LifecycleCoordinator.prototype.finalize;
LifecycleCoordinator.prototype.finalize=async function(options){
 const result=await finalize.call(this,options);
 assert.equal(result.quiescence,'confirmed');
 writeFileSync(${JSON.stringify(probe)},JSON.stringify({requests,actualLocalCleanup:true}));
 ${mode === 'throw' ? "throw new Error('FINALIZATION_STORAGE_UNCERTAIN');" : "return {...result,quiescence:'not_confirmed'};"}
};\n`);
    const env = { ...process.env, FORGEWRIGHT_WORKSPACE: project, FORGEWRIGHT_ADMISSION_HOME: home, FORGE_DELEGATION_NOTICE: '0' };
    for (const name of ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'FORGEWRIGHT_POLICY_FILE']) delete env[name];
    const cli = join(ROOT, 'src/cli/dist/index.js');
    try {
      const result = spawnSync(process.execPath, ['--import', preload, cli, 'delegate', 'run', '--contract', 'task.json'],
        { cwd: project, env, shell: false, encoding: 'utf8', timeout: 20000, maxBuffer: 262144 });
      assert.equal(result.error, undefined, result.error?.message);
      assert.deepEqual(JSON.parse(readFileSync(probe, 'utf8')), { requests: 2, actualLocalCleanup: true });
      const receipt = JSON.parse(result.stdout);
      assert.equal(receipt.verifiers.length, 1, result.stdout);
      assert.equal(receipt.verifiers[0].exitCode, 0, result.stdout);
      assert.equal(receipt.quiescence, 'not_confirmed');
      assert.equal(result.status, 1, `CLI success masked uncertain cleanup: ${result.stdout}`);
      assert.equal(receipt.status, 'failed');
      assert.equal(receipt.verified, false);
      assert.equal(receipt.errorCode, 'pi_finalization_unconfirmed');
      assert.equal(readFileSync(join(project, 'verify.mjs'), 'utf8'), verifier);
      assert.equal(existsSync(join(project, '.forgewright/runtime/pi-worker/active.lock')), true);
      const resources = spawnSync(process.execPath, [cli, 'delegate', 'resources'], { cwd: project, env, shell: false, encoding: 'utf8', timeout: 8000 });
      assert.equal(resources.status, 0, resources.stderr);
      assert.equal(JSON.parse(resources.stdout).quarantined, 1);
    } finally {
      // The broker owns no provider/verifier process and exits even with a
      // quarantined durable reservation. Never release it just to pass a test.
      const until = Date.now() + 18000;
      while (existsSync(join(home, 'broker.sock')) && Date.now() < until) await pause(100);
      assert.equal(existsSync(join(home, 'broker.sock')), false);
      rmSync(root, { recursive: true, force: true });
    }
  });
}
