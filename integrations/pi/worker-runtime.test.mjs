import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { digest } from './contracts.mjs';
import { loadTaskContract, createWorkspaceScope } from './workspace.mjs';
import { localEndpoint, resolveProvider, createProviderRequest } from './provider.mjs';
import { readWorkerConfig, writeWorkerConfig, createRun, cancelRun } from './runtime-state.mjs';
import { packageRoot, runWorker, workerStatus } from './worker-runtime.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'fw-pi-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.forgewright'));
  writeFileSync(join(root, '.forgewright/execution-policy.yaml'), readFileSync(join(packageRoot, '.forgewright/execution-policy.yaml')));
  writeFileSync(join(root, 'source.txt'), 'original');
  writeFileSync(join(root, 'verify.mjs'), 'process.exit(0)');
  const task = { schema: 'forgewright-pi-task/v1', taskId: 'fixture', objective: 'Read source', acceptance: ['Return observed source'],
    readPaths: ['source.txt'], writePaths: [], verifiers: [], limits: { turns: 2, timeoutMs: 10000 } };
  const contract = (patch = {}) => { writeFileSync(join(root, 'CONTRACT.json'), JSON.stringify({ ...task, ...patch })); return loadTaskContract(root, 'CONTRACT.json'); };
  return { root, task, contract };
}

test('default-off and provider-required do not call a provider', async (t) => {
  const f = fixture(t); f.contract();
  assert.equal(readWorkerConfig(f.root).enabled, false);
  await assert.rejects(runWorker({ projectRoot: f.root, contractPath: 'CONTRACT.json' }), /pi_disabled/);
  writeWorkerConfig(f.root, { enabled: true });
  const result = await runWorker({ projectRoot: f.root, contractPath: 'CONTRACT.json' });
  assert.equal(result.errorCode, 'pi_provider_required'); assert.equal(result.turns, 0);
  assert.equal(result.verified, false);
});

test('contract rejects traversal, symlink, secret, tests write and submodule', (t) => {
  const f = fixture(t);
  assert.throws(() => f.contract({ readPaths: ['../elsewhere'] }), /pi_path_denied/);
  symlinkSync(join(f.root, 'source.txt'), join(f.root, 'link.txt'));
  assert.throws(() => f.contract({ readPaths: ['link.txt'] }), /pi_path_denied/);
  writeFileSync(join(f.root, '.env'), 'secret');
  assert.throws(() => f.contract({ readPaths: ['.env'] }), /pi_protected_path/);
  mkdirSync(join(f.root, 'tests')); writeFileSync(join(f.root, 'tests/check.mjs'), '');
  assert.throws(() => f.contract({ writePaths: ['tests/check.mjs'] }), /pi_protected_path/);
  mkdirSync(join(f.root, 'sub')); writeFileSync(join(f.root, 'sub/.git'), 'gitdir: elsewhere'); writeFileSync(join(f.root, 'sub/a'), 'a');
  assert.throws(() => f.contract({ readPaths: ['sub/a'] }), /pi_submodule_denied/);
  assert.throws(() => f.contract({ acceptance: [] }), /pi_invalid_contract/);
  assert.throws(() => f.contract({ limits: { turns: 7 } }), /pi_invalid_limits/);
});

test('CAS advances own revision and rejects foreign source, contract or policy changes', (t) => {
  const f = fixture(t); const contract = f.contract({ writePaths: ['source.txt'] });
  const scope = createWorkspaceScope(contract, { assertOpen() {}, extraFiles: ['.forgewright/execution-policy.yaml'] });
  const first = scope.read('source.txt');
  assert.equal(scope.patch('source.txt', first.beforeHash, 'own').revision, 1);
  assert.equal(scope.read('source.txt').content, 'own');
  assert.throws(() => scope.patch('source.txt', first.beforeHash, 'stale'), /pi_foreign_edit_conflict/);
  writeFileSync(join(f.root, 'source.txt'), 'foreign');
  assert.throws(() => scope.read('source.txt'), /pi_foreign_edit_conflict/);
  assert.equal(readFileSync(join(f.root, 'source.txt'), 'utf8'), 'foreign');
  const next = createWorkspaceScope(contract, { assertOpen() {} });
  writeFileSync(join(f.root, 'CONTRACT.json'), '{}');
  assert.throws(() => next.read('source.txt'), /pi_foreign_edit_conflict/);
});

test('cancel is durable and blocks a retained patch callback', (t) => {
  const f = fixture(t); const contract = f.contract({ writePaths: ['source.txt'] });
  writeWorkerConfig(f.root, { enabled: true });
  const run = createRun(f.root, {}); const scope = createWorkspaceScope(contract, { assertOpen: run.assertOpen });
  const before = scope.read('source.txt');
  assert.equal(cancelRun(f.root, run.runId).status, 'cancellation-requested');
  assert.throws(() => scope.patch('source.txt', before.beforeHash, 'late'), /pi_cancelled/);
  assert.equal(readFileSync(join(f.root, 'source.txt'), 'utf8'), 'original');
});

test('approved verifier file cannot overlap writes and foreign test changes conflict', (t) => {
  const f = fixture(t);
  assert.throws(() => f.contract({ writePaths: ['verify.mjs'], verifiers: [{ id: 'check', argv: ['node', 'verify.mjs'] }] }), /pi_verifier_write_overlap/);
  const contract = f.contract({ verifiers: [{ id: 'check', argv: ['node', 'verify.mjs'] }] });
  const scope = createWorkspaceScope(contract, { assertOpen() {} });
  writeFileSync(join(f.root, 'verify.mjs'), 'foreign edit');
  assert.throws(() => scope.read('source.txt'), /pi_foreign_edit_conflict/);
});

test('local provider rejects cloud, ambiguous DNS, URL credentials and invalid endpoint', () => {
  for (const url of ['https://api.openai.com/v1', 'http://localhost:8000/v1', 'http://127.0.0.1:8000/', 'http://user:pass@127.0.0.1/v1', 'file:///v1', 'http://127.0.0.1/v1?key=a'])
    assert.throws(() => localEndpoint(url), /pi_invalid_local_endpoint/);
  assert.equal(localEndpoint('http://127.0.0.1:1234/v1/'), 'http://127.0.0.1:1234/v1');
});

test('Codex OAuth reuse is explicit, read-only and rejects expiry/API-key credentials', async (t) => {
  const f = fixture(t); mkdirSync(join(f.root, '.codex'));
  await assert.rejects(resolveProvider({ provider: 'openai-codex', model: 'host-model' }, { home: f.root }), /pi_auth_source_required/);
  const token = (exp) => `e30.${Buffer.from(JSON.stringify({ exp, 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture' } })).toString('base64url')}.fixture`;
  const authPath = join(f.root, '.codex/auth.json');
  const auth = { auth_mode: 'chatgpt', tokens: { access_token: token(Math.floor(Date.now() / 1000) + 600) } };
  writeFileSync(authPath, JSON.stringify(auth));
  const before = readFileSync(authPath);
  const config = { provider: 'openai-codex', model: 'host-model', authSource: 'codex' };
  const provider = await resolveProvider(config, { home: f.root });
  assert.equal(provider.model.id, 'host-model'); provider.getApiKey();
  assert.deepEqual(readFileSync(authPath), before);
  writeFileSync(authPath, JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'fixture' }));
  await assert.rejects(resolveProvider(config, { home: f.root }), /pi_auth_required/);
  writeFileSync(authPath, JSON.stringify({ tokens: { access_token: token(1) } }));
  await assert.rejects(resolveProvider(config, { home: f.root }), /pi_auth_required/);
});

test('real pinned pi-ai local stream preserves missing usage and rejects redirects without retries (fixture server)', async (t) => {
  let requests = 0; let mode = 'text';
  const server = createServer((_req, res) => {
    requests++;
    if (mode === 'redirect') { res.writeHead(302, { location: 'https://example.com/' }); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('data: '+ JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: 'fixture output' }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); t.after(() => { server.closeAllConnections(); server.close(); });
  const provider = await resolveProvider({ provider: 'local', model: 'fixture', endpoint: `http://127.0.0.1:${server.address().port}/v1` });
  const request = createProviderRequest(provider, { signal: new AbortController().signal, maxTokens: 32, timeoutMs: 3000 });
  const stream = request.stream({ messages: [{ role: 'user', content: 'fixture', timestamp: Date.now() }] });
  for await (const _ of stream) { /* real parser */ }
  assert.equal((await stream.result()).stopReason, 'stop');
  assert.equal(request.settle().nativeUsage, null); assert.equal(request.settle().costUsd, null);
  mode = 'redirect';
  const redirect = createProviderRequest(provider, { signal: new AbortController().signal, maxTokens: 32, timeoutMs: 3000 });
  const rejected = redirect.stream({ messages: [{ role: 'user', content: 'fixture', timestamp: Date.now() }] });
  for await (const _ of rejected) { /* drain */ }
  assert.equal((await rejected.result()).stopReason, 'error'); assert.equal(requests, 2);
});

test('consumer CLI resolves package separately and reports provider-required honestly', (t) => {
  const f = fixture(t); f.contract();
  const cli = (...args) => spawnSync(process.execPath, [join(packageRoot, 'src/cli/dist/index.js'), 'delegate', ...args], {
    cwd: f.root, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, FORGEWRIGHT_WORKSPACE: f.root, FORGE_DELEGATION_NOTICE: '0' } });
  const initial = cli('status', '--worker', 'pi'); assert.equal(initial.status, 0, initial.stderr);
  assert.equal(JSON.parse(initial.stdout).enabled, false);
  const missing = cli('on', '--worker', 'pi'); assert.equal(missing.status, 1); assert.match(missing.stderr, /pi_provider_required/);
  const enabled = cli('on', '--worker', 'pi', '--provider', 'local', '--endpoint', 'http://127.0.0.1:12345/v1', '--model', 'fixture');
  assert.equal(enabled.status, 0, enabled.stderr);
  const status = JSON.parse(enabled.stdout);
  assert.equal(status.projectRoot, f.root); assert.equal(status.packageRoot.replace(/\/$/, ''), packageRoot.replace(/\/$/, ''));
  assert.equal(status.verified, false);
  const off = cli('off'); assert.equal(off.status, 0); assert.equal(JSON.parse(off.stdout).enabled, false);
  const run = cli('run', '--contract', 'CONTRACT.json'); assert.equal(run.status, 1); assert.match(run.stderr, /pi_disabled/);
});

test('offline pinned Pi stream parser rejects redirects and HTTP auth/quota with one request and no synthetic usage', async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let requests = 0; let status = 200;
  globalThis.fetch = async (_url, options) => {
    requests++; assert.equal(options.redirect, 'manual');
    if (status !== 200) return new Response('must not expose this error body', { status, headers: status === 302 ? { location: 'https://example.com' } : {} });
    return new Response('data: ' + JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content: 'fixture only' }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  };
  const provider = await resolveProvider({ provider: 'local', model: 'fixture', endpoint: 'http://127.0.0.1:12345/v1' });
  for (const [http, expected] of [[200, null], [302, 'pi_provider_redirect_denied'], [401, 'pi_auth_required'], [429, 'pi_quota_exhausted']]) {
    status = http;
    const request = createProviderRequest(provider, { signal: new AbortController().signal, maxTokens: 32, timeoutMs: 1000 });
    const stream = request.stream({ messages: [{ role: 'user', content: 'fixture', timestamp: Date.now() }] });
    for await (const _ of stream) { /* pinned parser, fixture HTTP only */ }
    assert.equal((await stream.result()).stopReason, http === 200 ? 'stop' : 'error');
    assert.equal(request.errorCode, expected); assert.equal(request.settle().requests, 1);
    assert.equal(request.settle().nativeUsage, null); assert.equal(request.settle().costUsd, null);
  }
  assert.equal(requests, 4);
});

test('user work in git index/working tree is rejected without overwriting it', (t) => {
  const f = fixture(t);
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: f.root }).status, 0);
  assert.equal(spawnSync('git', ['add', 'source.txt'], { cwd: f.root }).status, 0);
  writeFileSync(join(f.root, 'source.txt'), 'existing user edits');
  assert.throws(() => f.contract({ writePaths: ['source.txt'] }), /pi_existing_user_edits/);
  assert.equal(readFileSync(join(f.root, 'source.txt'), 'utf8'), 'existing user edits');
});

test('scope and state ancestry substitutions fail closed', (t) => {
  const f = fixture(t); const contract = f.contract({ writePaths: ['source.txt'] });
  const scope = createWorkspaceScope(contract, { assertOpen() {} });
  assert.throws(() => scope.read('verify.mjs'), /pi_scope_denied/);
  const before = scope.read('source.txt');
  rmSync(join(f.root, 'source.txt')); symlinkSync(join(f.root, 'verify.mjs'), join(f.root, 'source.txt'));
  assert.throws(() => scope.patch('source.txt', before.beforeHash, 'late'), /pi_path_denied/);
  mkdirSync(join(f.root, 'elsewhere')); symlinkSync(join(f.root, 'elsewhere'), join(f.root, '.forgewright/runtime'));
  assert.throws(() => writeWorkerConfig(f.root, { enabled: false }), /pi_state_path_denied/);
  assert.equal(existsSync(join(f.root, 'elsewhere/pi-worker')), false);
});
