/** Recheck the owned native-consumer fixture through its pinned OS verifier.
 * Never execute model-edited JavaScript directly with host permissions. */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

const root=realpathSync(process.argv[2]);
assert.ok(root.startsWith('/private/tmp/fw-pi-submodule-')&&root.endsWith('/consumer'));
const packageRoot=join(root,'forgewright');
process.env.FORGEWRIGHT_WORKSPACE=root;
const {verifierRun}=await import(pathToFileURL(join(packageRoot,'integrations/pi/worker-runtime.mjs')).href);
const {createWorkspaceScope}=await import(pathToFileURL(join(packageRoot,'integrations/pi/workspace.mjs')).href);
const governor=await import(pathToFileURL(join(packageRoot,'integrations/pi/host-governor.mjs')).href);
const {ProcessPolicyEvaluator}=await import(pathToFileURL(join(packageRoot,'mcp/build/middleware/guardrail.js')).href);
const task=JSON.parse(readFileSync(join(root,'task.json'),'utf8'));
assert.equal(task.schema,'forgewright-pi-task/v1');
assert.deepEqual(task.readPaths,['source.mjs','verify.mjs']);
assert.deepEqual(task.writePaths,['source.mjs']);
assert.deepEqual(task.verifiers,[{id:'check',argv:[process.execPath,'verify.mjs']}]);
// Host-created read-only verification capability, not a mutation of the user's
// task or verifier. Existing model edits are read, never granted write access.
const contract={root,path:join(root,'task.json'),task:{...task,writePaths:[]},verifierFiles:['verify.mjs'],
  limits:{fileBytes:65536,outputBytes:16384,verifierTimeoutMs:10000}};
const runId='independent-'+randomUUID();
const runDir=join(root,'.forgewright/runtime/independent-verifiers',runId);mkdirSync(runDir,{recursive:true,mode:0o700});
const controller=new AbortController();
const run={runId,runDir,assertOpen:()=>controller.signal.throwIfAborted()};
const scope=createWorkspaceScope(contract,{assertOpen:run.assertOpen});
const evaluator=new ProcessPolicyEvaluator({cwd:root,policyFile:join(root,'.forgewright/execution-policy.yaml'),scriptPath:join(packageRoot,'scripts/lite/policy-check.sh')});
let worker;let quiescent=false;let result;
try {
  worker=await governor.acquireHostSlot({projectRoot:root,runId,memoryMiB:64,waitMs:15000,signal:controller.signal});
  result=await verifierRun({verifier:task.verifiers[0],contract,run,scope,signal:controller.signal,worker,governor,evaluator});
  quiescent=true;
} finally {
  if(worker){const released=await worker.release({quiescent});assert.equal(released.state,'released');}
}
assert.equal(result.terminationSignal,null);
console.log(JSON.stringify({id:result.id,exitCode:result.exitCode,outputSha256:result.outputSha256,assertionFailure:/AssertionError|ERR_ASSERTION/.test(result.output),sandbox:'darwin-scoped-single-process',quiescence:'confirmed'}));
process.exitCode=result.exitCode===0?0:1;
