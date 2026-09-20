/** Machine-wide slots over a single idle-exiting Python/SQLite broker.
 * No cloud, classifier, per-project daemon, or extra model request is required.
 */
import { createConnection } from 'node:net';
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fail } from './contracts.mjs';

const SCHEMA = 'forgewright-host-admission/v1';
const BROKER = fileURLToPath(new URL('../../scripts/runtime/host_admission_broker.py', import.meta.url));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let starting;

function homePath() {
  // Host-only test/installation override; never taken from project/model payload.
  const value = process.env.FORGEWRIGHT_ADMISSION_HOME || join(homedir(), '.forgewright/runtime/admission');
  if (!existsSync(value)) mkdirSync(value, { recursive: true, mode: 0o700 });
  const stat = lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077)))) fail('pi_unsafe_admission_home');
  return realpathSync(value);
}

function rpc(home, request) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(join(home, 'broker.sock'));
    let response = ''; let settled = false;
    const done = (error, data) => {
      if (settled) return;
      settled = true; socket.destroy();
      if (error) reject(error); else resolve(data);
    };
    socket.setTimeout(4000, () => done(Object.assign(new Error('broker-timeout'), { code: 'ETIMEDOUT' })));
    socket.on('error', (error) => done(error));
    socket.on('connect', () => socket.write(JSON.stringify({ schema: SCHEMA, ...request }) + '\n'));
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (Buffer.byteLength(response) > 65536) return done(new Error('response-too-large'));
      const newline = response.indexOf('\n');
      if (newline < 0) return;
      try {
        const value = JSON.parse(response.slice(0, newline));
        if (value.schema !== SCHEMA) throw new Error('protocol-mismatch');
        if (!value.ok) throw Object.assign(new Error(value.error), { admissionCode: value.error });
        done(null, value.data);
      } catch (error) { done(error); }
    });
    socket.on('end', () => { if (!settled) done(new Error('broker-disconnected')); });
  });
}

async function ensureBroker(home) {
  // Liveness is intentionally cheap; do not scan all processes/memory twice
  // for one acquisition. enqueue/poll/status keep their fresh safety checks.
  try { return await rpc(home, { action: 'ping' }); }
  catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error; }
  if (!starting) starting = (async () => {
    const bootstrap = 'import runpy,sys;sys.path.insert(0,sys.argv[1]);sys.argv=sys.argv[2:];runpy.run_path(sys.argv[0],run_name="__main__")';
    const child = spawn(process.env.FORGEWRIGHT_PYTHON || 'python3', ['-I', '-B', '-c', bootstrap, dirname(BROKER), BROKER, '--home', home], {
      cwd: dirname(BROKER), detached: true, stdio: 'ignore', shell: false,
      env: { PATH: process.env.PATH, HOME: homedir(), LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1' },
    });
    let error;
    child.once('error', (e) => { error = e; }); child.unref();
    for (let i = 0; i < 40; i++) {
      if (error) throw error;
      await delay(75);
      try { return await rpc(home, { action: 'ping' }); }
      catch (e) { if (!['ENOENT', 'ECONNREFUSED'].includes(e.code)) throw e; }
    }
    throw new Error('broker-start-timeout');
  })().finally(() => { starting = undefined; });
  return starting;
}

async function request(home, action, data = {}) {
  // Once effects may exist, transport errors never silently recreate a lease.
  try { return await rpc(home, { action, ...data }); }
  catch (error) {
    const code = error.admissionCode;
    fail(typeof code === 'string' && /^[a-z0-9-]+$/.test(code) ? `pi_host_${code.replaceAll('-', '_')}` : 'pi_host_admission_unavailable');
  }
}

export async function getHostAdmissionStatus() {
  if (process.platform === 'win32') fail('pi_host_platform_unavailable');
  const home = homePath();
  try { await ensureBroker(home); return await rpc(home, { action: 'status' }); }
  catch { fail('pi_host_admission_unavailable'); }
}

export async function acquireHostSlot({ projectRoot, runId, kind = 'worker', parentLeaseId, memoryMiB = kind === 'heavy' ? 512 : 256, signal, waitMs = 30000 }) {
  if (!Number.isSafeInteger(waitMs) || waitMs < 1 || waitMs > 180000) fail('pi_invalid_wait_limit');
  signal?.throwIfAborted();
  const home = homePath();
  try { await ensureBroker(home); } catch { fail('pi_host_admission_unavailable'); }
  signal?.throwIfAborted();
  const id = `slot-${randomUUID()}`; const token = randomUUID() + randomUUID();
  const owned = { job_id: id, token, owner_pid: process.pid };
  let row; let enqueued = false;
  try {
    enqueued = true; // A lost reply can still mean the transaction committed.
    row = await request(home, 'enqueue', { ...owned, project_root: realpathSync(projectRoot), run_id: runId, kind, memory_mib: memoryMiB, ...(parentLeaseId ? { parent_lease_id: parentLeaseId } : {}) });
    const deadline = performance.now() + waitMs;
    while (row.state === 'queued') {
      signal?.throwIfAborted();
      if (performance.now() >= deadline) fail('pi_host_capacity_timeout');
      await delay(Math.min(250, Math.max(1, deadline - performance.now())));
      signal?.throwIfAborted();
      row = await request(home, 'poll', owned);
    }
    if (row.state !== 'active') fail('pi_host_admission_closed');
    signal?.throwIfAborted();
  } catch (error) {
    if (enqueued) { try { await request(home, 'release', { ...owned, quiescent: true }); } catch { /* No execution was started; uncertain admission stays accounted. */ } }
    throw error;
  }
  let released = false;
  return Object.freeze({ id,
    async heartbeat() {
      if (released) fail('pi_host_lease_closed');
      const current = await request(home, 'poll', owned);
      if (current.state !== 'active') fail('pi_host_lease_lost');
      return current;
    },
    async release({ quiescent = true } = {}) {
      if (released) return;
      const value = await request(home, 'release', { ...owned, quiescent });
      released = true;
      return value;
    },
  });
}
