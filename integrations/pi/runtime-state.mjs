import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fail } from './contracts.mjs';
import projectConfig from './project-config.cjs';
import { relativeFile } from './workspace.mjs';

export function stateDirectory(projectRoot) {
  const root = realpathSync(projectRoot); let dir = root;
  for (const name of ['.forgewright', 'runtime', 'pi-worker']) {
    dir = join(dir, name);
    if (!existsSync(dir)) mkdirSync(dir, { mode: 0o700 });
    const stat = lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(dir) !== dir) fail('pi_state_path_denied');
  }
  return dir;
}

function atomicText(root, path, text) {
  // Validate the parent every time; no symlink traversal into another project.
  const parent = relative(root, join(path, '..'));
  if (parent) relativeFile(root, parent, { protectedPaths: false, directory: true });
  if (existsSync(path)) relativeFile(root, relative(root, path), { protectedPaths: false });
  const tmp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, path);
}

export function atomicJson(root, path, data) { atomicText(root, path, `${JSON.stringify(data, null, 2)}\n`); }

export function workerConfigurationFile(projectRoot) {
  return existsSync(join(projectRoot, '.production-grade.yaml')) ? '.production-grade.yaml' : '.forgewright/pi-worker.json';
}

function yamlConfig(projectRoot) {
  try { return projectConfig.readProjectYaml(projectRoot); }
  catch { fail('pi_invalid_config'); }
}

export function readWorkerConfig(projectRoot) {
  const doc = yamlConfig(projectRoot);
  const mode = doc.get('delegationMode', true)?.toJSON?.();
  // An explicit canonical disable is authoritative even without worker.cli.
  // Keep selected Pi provider fields below, so explicit re-enable remains usable.
  if (!mode?.worker?.cli && (mode?.enabled === false || mode?.enabled === 'off')) return { enabled: false };
  if (mode?.worker?.cli) {
    if (mode.worker.cli !== 'pi') return { enabled: false };
    if (![true, false, 'on', 'off'].includes(mode.enabled)) fail('pi_invalid_config');
    const { provider, model, authSource, endpoint } = mode.worker;
    return { enabled: mode.enabled === true || mode.enabled === 'on', worker: 'pi',
      ...Object.fromEntries(Object.entries({ provider, model, authSource, endpoint }).filter(([,v]) => v !== undefined)) };
  }
  // Read-only compatibility for an explicitly existing prototype config.
  const path = join(projectRoot, '.forgewright/pi-worker.json');
  if (!existsSync(path)) return { enabled: false };
  relativeFile(realpathSync(projectRoot), '.forgewright/pi-worker.json', { protectedPaths: false });
  try {
    if (lstatSync(path).size > 8192) fail('pi_invalid_config');
    const config = JSON.parse(readFileSync(path, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config) || typeof config.enabled !== 'boolean' ||
        Object.keys(config).some((key) => !['enabled', 'worker', 'provider', 'model', 'authSource', 'endpoint'].includes(key))) fail('pi_invalid_config');
    return config;
  } catch { fail('pi_invalid_config'); }
}

export function writeWorkerConfig(projectRoot, config) {
  projectRoot = realpathSync(projectRoot);
  stateDirectory(projectRoot);
  const doc = yamlConfig(projectRoot);
  doc.setIn(['delegationMode', 'enabled'], config.enabled ? 'on' : 'off');
  doc.setIn(['delegationMode', 'worker'], Object.fromEntries(Object.entries({ cli: 'pi', provider: config.provider,
    model: config.model, authSource: config.authSource, endpoint: config.endpoint }).filter(([,v]) => v !== undefined)));
  atomicText(projectRoot, join(projectRoot, '.production-grade.yaml'), String(doc));
}

export function createRun(projectRoot, data) {
  projectRoot = realpathSync(projectRoot);
  const dir = stateDirectory(projectRoot);
  if (readdirSync(dir).filter((name) => /^pi-/.test(name)).length >= 100) fail('pi_receipt_capacity_reached');
  const runId = `pi-${randomUUID()}`;
  const runDir = join(dir, runId); mkdirSync(runDir, { mode: 0o700 });
  const receipt = { schema: 'forgewright-pi-run/v1', runId, projectRoot, startedAt: new Date().toISOString(),
    status: 'starting', verified: false, revision: 0, usage: [], ...data };
  const save = () => atomicJson(projectRoot, join(runDir, 'receipt.json'), receipt);
  save();
  const assertOpen = () => {
    relativeFile(projectRoot, relative(projectRoot, runDir), { protectedPaths: false, directory: true });
    if (existsSync(join(runDir, 'cancel.json'))) fail('pi_cancelled');
    if (!readWorkerConfig(projectRoot).enabled) fail('pi_disabled');
  };
  return { runId, runDir, receipt, save, assertOpen, withWrite(operation) {
    assertOpen();
    const gate = join(runDir, 'effect.lock');
    try { mkdirSync(gate, { mode: 0o700 }); } catch { fail('pi_effect_busy'); }
    try { assertOpen(); return operation(); } finally { rmdirSync(gate); }
  } };
}

export function cancelRun(projectRoot, runId) {
  projectRoot = realpathSync(projectRoot);
  if (!/^pi-[a-f0-9-]{36}$/.test(runId)) fail('pi_invalid_run_id');
  const dir = stateDirectory(projectRoot);
  const receiptPath = relativeFile(projectRoot, relative(projectRoot, join(dir, runId, 'receipt.json')), { protectedPaths: false });
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (receipt.runId !== runId || receipt.projectRoot !== projectRoot) fail('pi_invalid_run_id');
  if (['finished', 'failed', 'cancelled'].includes(receipt.status)) return { runId, status: receipt.status };
  atomicJson(projectRoot, join(dir, runId, 'cancel.json'), { runId, requestedAt: Date.now() });
  // The marker closes new effects immediately. Wait for a synchronously admitted
  // write to leave its critical section before acknowledging effect settlement.
  const gate = join(dir, runId, 'effect.lock'); const end = Date.now() + 2000;
  while (existsSync(gate) && Date.now() < end) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  return { runId, status: 'cancellation-requested', admission: 'closed',
    fileEffects: existsSync(gate) ? 'pending' : 'settled', quiescence: 'pending' };
}
