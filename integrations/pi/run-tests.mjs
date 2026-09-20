/** Run optional integration checks from the canonical root. Test logs stay in
 * verifier-owned runtime locations; no shell or hook bypass is involved. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const suites = {
  bridge: ['contracts.test.mjs', 'host-adapter.test.mjs', 'budget.test.mjs'],
  all: ['adapter.test.mjs', 'sdk.test.mjs', 'harness.test.mjs', 'deadline.test.mjs', 'contracts.test.mjs', 'host-adapter.test.mjs', 'release-gates.test.mjs', 'canary-integration.test.mjs', 'budget.test.mjs'],
  release: [],
  worker: ['worker-runtime.test.mjs', 'verifier-runtime.test.mjs', 'config-consumer.test.mjs', 'governor-process.test.mjs', 'consumer-cancel.test.mjs', 'runtime-regressions.test.mjs', 'config-parser.test.mjs', 'activation-regressions.test.mjs', 'cli-portable.test.mjs'],
};
const suite = process.argv[2] ?? 'all';
if (!Object.hasOwn(suites, suite)) { console.error('Unknown Pi test suite'); process.exit(2); }
const commands = [];
if (suites[suite].length) commands.push(['--test', ...suites[suite].map((file) => `integrations/pi/${file}`)]);
// `all` must exercise the consumer worker too, not merely the historical pilot.
if (suite === 'all') commands.push(['--test', ...suites.worker.map((file) => `integrations/pi/${file}`)]);
if (suite === 'all' || suite === 'release') {
  for (const tier of ['contract', 'runtime', 'e2e']) commands.push(['integrations/pi/release-acceptance.mjs', tier]);
}
for (const command of commands) {
  const result = spawnSync(process.execPath, command, {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: 'inherit', shell: false, timeout: 120000,
  });
  if (result.error) { console.error('Pi test runner failed:', result.error.code ?? 'unknown'); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
