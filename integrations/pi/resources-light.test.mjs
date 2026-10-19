import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('resource status never imports the optional worker SDK', t => {
  const root = mkdtempSync(join(tmpdir(), 'fw-resource-light-'));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  mkdirSync(join(root, 'src'), {recursive:true});
  mkdirSync(join(root, 'integrations/pi'), {recursive:true});
  copyFileSync(new URL('../../src/cli/src/delegation/pi-worker.ts', import.meta.url), join(root, 'src/pi-worker.ts'));
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(root, 'integrations/pi/worker-runtime.mjs'), 'throw new Error("SDK must not load");');
  writeFileSync(join(root, 'integrations/pi/host-governor.mjs'), 'export const getHostAdmissionStatus = async () => ({probe:"resources-only"});');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', 'import {piAction} from "./src/pi-worker.ts"; await piAction(process.cwd(), "resources");'], {cwd:root, encoding:'utf8', timeout:5000});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {probe:'resources-only'});
});
