import { mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  LifecycleLeaseStore,
  type ProcessIdentity,
  type ProcessInspector,
  type SignalSender,
} from './lifecycle-lease.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'forgewright-lease-'));
  roots.push(root);
  let identity: ProcessIdentity | null = {
    pid: 901,
    pidStartedAt: 'start-a',
    pgid: 901,
    parentPid: 800,
    parentStartedAt: 'parent-a',
    commandDigest: 'a'.repeat(64),
  };
  const signals: Array<{ pid: number; signal: NodeJS.Signals }> = [];
  const inspector: ProcessInspector = { inspect: async () => identity };
  const sender: SignalSender = {
    signal: async (pid, signal) => {
      signals.push({ pid, signal });
    },
  };
  const store = new LifecycleLeaseStore({ root, inspector, sender, now: () => 1_000 });
  return {
    root,
    store,
    signals,
    setIdentity(value: ProcessIdentity | null) {
      identity = value;
    },
  };
}

describe('MCP lifecycle ownership lease', () => {
  it('refuses to signal an unowned process', async () => {
    const { store, signals } = fixture();
    await expect(store.reap('missing', 'not-an-owner')).resolves.toBe('unowned');
    expect(signals).toEqual([]);
  });

  it('rechecks PID start identity immediately before signalling', async () => {
    const { store, signals, setIdentity } = fixture();
    const lease = await store.acquire({
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      identity: await store.inspectCurrent(901),
      ttlMs: 10,
    });
    setIdentity({ ...lease.identity, pidStartedAt: 'reused-pid-start' });

    await expect(store.reap(lease.leaseId, lease.ownerToken)).resolves.toBe('identity_mismatch');
    expect(signals).toEqual([]);
  });

  it('rotates owner tokens with compare-and-swap handoff', async () => {
    const { store } = fixture();
    const lease = await store.acquire({
      workspaceId: 'workspace-a',
      sessionId: 'old-session',
      identity: await store.inspectCurrent(901),
      ttlMs: 10,
    });
    const handed = await store.handoff(
      lease.leaseId,
      lease.ownerToken,
      lease.version,
      'new-session',
    );

    expect(handed.ownerToken).not.toBe(lease.ownerToken);
    expect(handed.version).toBe(lease.version + 1);
    await expect(store.release(lease.leaseId, lease.ownerToken, lease.version)).resolves.toBe(
      'owner_mismatch',
    );
    await expect(store.release(handed.leaseId, handed.ownerToken, handed.version)).resolves.toBe(
      'released',
    );
  });

  it('holds an expired lease while work is in flight', async () => {
    const { store, signals } = fixture();
    const lease = await store.acquire({
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      identity: await store.inspectCurrent(901),
      ttlMs: 0,
      inFlight: 1,
    });

    await expect(store.reap(lease.leaseId, lease.ownerToken)).resolves.toBe('in_flight');
    expect(signals).toEqual([]);
    const persisted = JSON.parse(readFileSync(join(store.root, `${lease.leaseId}.json`), 'utf8'));
    expect(persisted.inFlight).toBe(1);
  });

  it('refuses a selection-to-signal race when identity changes before TERM', async () => {
    const root = mkdtempSync(join(tmpdir(), 'forgewright-lease-race-'));
    roots.push(root);
    const identity: ProcessIdentity = {
      pid: 902,
      pidStartedAt: 'start-a',
      pgid: 902,
      parentPid: 800,
      parentStartedAt: 'parent-a',
      commandDigest: 'b'.repeat(64),
    };
    let reads = 0;
    const inspector: ProcessInspector = {
      inspect: async () => {
        reads += 1;
        return reads >= 3 ? { ...identity, pidStartedAt: 'start-b' } : identity;
      },
    };
    const signals: Array<{ pid: number; signal: NodeJS.Signals }> = [];
    const sender: SignalSender = {
      signal: async (pid, signal) => {
        signals.push({ pid, signal });
      },
    };
    const store = new LifecycleLeaseStore({ root, inspector, sender, now: () => 1_000 });
    const lease = await store.acquire({
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      identity: await store.inspectCurrent(902),
      ttlMs: 0,
    });

    await expect(store.reap(lease.leaseId, lease.ownerToken)).resolves.toBe('identity_mismatch');
    expect(signals).toEqual([]);
  });

  it('uses TERM then bounded KILL only for an exact expired owned lease', async () => {
    const { store, signals } = fixture();
    const lease = await store.acquire({
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      identity: await store.inspectCurrent(901),
      ttlMs: 0,
    });

    await expect(store.reap(lease.leaseId, lease.ownerToken)).resolves.toBe('reaped');
    expect(signals).toEqual([
      { pid: 901, signal: 'SIGTERM' },
      { pid: 901, signal: 'SIGKILL' },
    ]);
  });

  it('rejects a changed command digest before signalling', async () => {
    const { store, signals } = fixture();
    const lease = await store.acquire({
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      identity: await store.inspectCurrent(901),
      ttlMs: 0,
    });
    const path = join(store.root, `${lease.leaseId}.json`);
    const changed = JSON.parse(readFileSync(path, 'utf8'));
    changed.commandDigest = '0'.repeat(64);
    writeFileSync(path, JSON.stringify(changed));

    await expect(store.reap(lease.leaseId, lease.ownerToken)).resolves.toBe('identity_mismatch');
    expect(signals).toEqual([]);
  });

  it('serializes concurrent reapers so an owned process is signalled once', async () => {
    const { store, signals } = fixture();
    const lease = await store.acquire({
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      identity: await store.inspectCurrent(901),
      ttlMs: 0,
    });

    const results = await Promise.all([
      store.reap(lease.leaseId, lease.ownerToken),
      store.reap(lease.leaseId, lease.ownerToken),
    ]);

    expect(results.sort()).toEqual(['closed', 'reaped']);
    expect(signals).toEqual([
      { pid: 901, signal: 'SIGTERM' },
      { pid: 901, signal: 'SIGKILL' },
    ]);
  });

  it('reconciles a dead production lease without sending a signal', async () => {
    const { store, signals, setIdentity } = fixture();
    const lease = await store.acquire({
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      identity: await store.inspectCurrent(901),
      ttlMs: 10,
    });
    setIdentity(null);

    const results = await store.reconcile();

    expect(results).toEqual([{ leaseId: lease.leaseId, result: 'dead_reclaimed' }]);
    expect(signals).toEqual([]);
    const persisted = JSON.parse(readFileSync(join(store.root, `${lease.leaseId}.json`), 'utf8'));
    expect(persisted.status).toBe('closed');
  });

  it('reconciles old leases on the production startup path before acquire', () => {
    const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    expect(source.indexOf('await leaseStore.reconcile()')).toBeGreaterThan(-1);
    expect(source.indexOf('await leaseStore.reconcile()')).toBeLessThan(
      source.indexOf('await leaseStore.acquire('),
    );
  });

  it('skips a contended startup lease without waiting or touching it and still reclaims a later dead lease', async () => {
    const { root, store, signals } = fixture();
    const leases = await Promise.all(
      [0, 1].map(async (index) =>
        store.acquire({
          workspaceId: 'workspace-a',
          sessionId: `session-${index}`,
          identity: await store.inspectCurrent(901),
          ttlMs: 0,
        }),
      ),
    );
    leases.sort((a, b) => a.leaseId.localeCompare(b.leaseId));
    const [contended, dead] = leases;
    const lock = join(root, `${contended.leaseId}.lock`);
    const leasePath = join(root, `${contended.leaseId}.json`);
    writeFileSync(lock, 'another owner', { flag: 'wx', mode: 0o600 });
    const before = { inode: statSync(lock).ino, lease: readFileSync(leasePath, 'utf8') };
    const waits: number[] = [];
    let inspections = 0;
    const startup = new LifecycleLeaseStore({
      root,
      now: () => 1_000,
      inspector: {
        inspect: async () => {
          inspections += 1;
          return null;
        },
      },
      sender: {
        signal: async (pid, signal) => {
          signals.push({ pid, signal });
        },
      },
      wait: async (delay) => {
        waits.push(delay);
      },
    });

    expect(await startup.reconcile()).toEqual([
      { leaseId: contended.leaseId, result: 'reconcile_error' },
      { leaseId: dead.leaseId, result: 'dead_reclaimed' },
    ]);
    expect(waits).toEqual([]);
    expect(inspections).toBe(1);
    expect(signals).toEqual([]);
    expect(statSync(lock).ino).toBe(before.inode);
    expect(readFileSync(lock, 'utf8')).toBe('another owner');
    expect(readFileSync(leasePath, 'utf8')).toBe(before.lease);
    expect(JSON.parse(readFileSync(join(root, `${dead.leaseId}.json`), 'utf8')).status).toBe(
      'closed',
    );
  });

  it('retains direct reaper lock retries until the existing owner releases', async () => {
    const { root, store, signals } = fixture();
    const lease = await store.acquire({
      workspaceId: 'workspace-a',
      sessionId: 'direct-reap',
      identity: await store.inspectCurrent(901),
      ttlMs: 0,
    });
    const lock = join(root, `${lease.leaseId}.lock`);
    writeFileSync(lock, 'existing owner', { flag: 'wx', mode: 0o600 });
    const waits: number[] = [];
    const direct = new LifecycleLeaseStore({
      root,
      inspector: { inspect: async () => null },
      sender: {
        signal: async (pid, signal) => {
          signals.push({ pid, signal });
        },
      },
      wait: async (delay) => {
        waits.push(delay);
        unlinkSync(lock);
      },
    });
    expect(await direct.reap(lease.leaseId, lease.ownerToken)).toBe('dead_reclaimed');
    expect(waits).toEqual([5]);
    expect(signals).toEqual([]);
    expect(() => statSync(lock)).toThrow();
  });
});
