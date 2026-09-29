#!/usr/bin/env node
// Local-only executable scenarios. Never starts a model or treats fixture data as production authority.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { scenarios } from './scenarios.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
export async function runLocalScenarios({ negativeControls = true } = {}) {
  const contractsBytes = readFileSync(new URL('./contracts.json', import.meta.url));
  const contracts = JSON.parse(contractsBytes.toString('utf8'));
  const fixtureSha256 = sha(readFileSync(new URL('./scenarios.mjs', import.meta.url)));
  assert.deepEqual(Object.keys(scenarios).sort(), [...contracts.requiredScenarios].sort());
  const identity = { contractsSha256: sha(contractsBytes), fixtureSha256, provider: 'none', model: null, reasoningEffort: null, runtime: `node-${process.versions.node}`, budgetMs: contracts.comparison.maximumScenarioTimeMs };
  const variants = [];
  for (const variant of ['baseline', 'candidate']) {
    const results = [];
    for (const id of contracts.requiredScenarios) {
      const started = performance.now();
      const observations = await scenarios[id]();
      const elapsedMs = performance.now() - started;
      assert.ok(elapsedMs <= identity.budgetMs, 'Fixture exceeded its frozen time budget');
      results.push({ id, status: 'PASS', elapsedMs, ...observations, usage: { status: 'unavailable', tokens: null, costUsd: null } });
    }
    variants.push({ variant, identity: structuredClone(identity), results });
  }
  assert.deepEqual(variants[0].identity, variants[1].identity);
  assert.deepEqual(variants[0].results.map(r => [r.id, r.status]), variants[1].results.map(r => [r.id, r.status]));
  const controls = [];
  if (negativeControls) {
    for (const [id, verify] of Object.entries(scenarios)) {
      let rejected = false;
      try { await verify({ mutate: true }); } catch { rejected = true; }
      assert.equal(rejected, true, `Negative control ${id} did not trip its unchanged oracle`);
      controls.push({ id, mutationRejected: true });
    }
  }
  return { schema: 'forgewright-ecc-local-results/v1', authority: 'test-only', identity, variants, negativeControls: controls,
    comparable: true, promotionEligible: false, performanceImprovementClaimed: false, limitations: contracts.limitations };
}
if (process.argv[1] && import.meta.url === pathToFileURL(fileURLToPath(pathToFileURL(process.argv[1]))).href) {
  runLocalScenarios().then(report => console.log(JSON.stringify(report, null, 2))).catch(() => { console.error('ECC local scenario verification failed'); process.exitCode = 1; });
}
