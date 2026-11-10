import { describe, expect, it, vi } from 'vitest';
import { execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ProcessPipelineTransitionGate } from './ProcessPipelineTransitionGate.js';

const request = {
  runId: '00000000-0000-4000-8000-000000000001',
  phase: 1,
  kind: 'mechanical' as const,
  startedAt: '2026-11-07T00:00:00.000Z',
};
function fixture(script: string) {
  const root = mkdtempSync(join(tmpdir(), 'pipeline-process-'));
  mkdirSync(join(root, 'scripts/lite'), { recursive: true });
  writeFileSync(join(root, 'scripts/lite/pipeline_transition_gate.py'), script);
  copyFileSync(
    fileURLToPath(new URL('../../../../scripts/lite/windows_job_supervisor.py', import.meta.url)),
    join(root, 'scripts/lite/windows_job_supervisor.py'),
  );
  mkdirSync(join(root, 'scripts/runtime'), { recursive: true });
  for (const name of ['windows_job_client.py', 'windows_security.py']) {
    copyFileSync(
      fileURLToPath(new URL(`../../../../scripts/runtime/${name}`, import.meta.url)),
      join(root, 'scripts/runtime', name),
    );
  }
  copyFileSync(
    fileURLToPath(new URL('../../../../scripts/lite/windows_secure_io.py', import.meta.url)),
    join(root, 'scripts/lite/windows_secure_io.py'),
  );
  return root;
}

// Instrument the cleanup boundary on either platform, preserving the same
// failure scenarios and assertions while selecting the native primitive.
const cleanupTarget = ProcessPipelineTransitionGate.prototype as unknown as {
  requestCleanup(child: ChildProcessWithoutNullStreams): void;
  probeProcessGroup?(pgid: number): void;
  completionCommand(
    support: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ): Promise<Record<string, unknown>>;
};

function expectPidAbsent(pid: number, message?: string): void {
  if (process.platform === 'win32') {
    expect(() => process.kill(pid, 0), message).toThrow();
    return;
  }
  let caught: NodeJS.ErrnoException | undefined;
  try {
    process.kill(pid, 0);
  } catch (error) {
    caught = error as NodeJS.ErrnoException;
  }
  expect(caught?.code, message).toBe('ESRCH');
}

describe('owned pipeline verifier subprocess', () => {
  it.each([0, 1])(
    'rejects a Windows supervisor exiting %s without completion proof',
    async (code) => {
      const root = fixture('print(\'{"allow":true,"reasons":[]}\')');
      writeFileSync(
        join(root, 'scripts/lite/windows_job_supervisor.py'),
        `import os,pathlib\npathlib.Path('supervisor-executed').touch()\nprint('{"allow":true,"reasons":[]}', flush=True)\nos._exit(${code})\n`,
      );
      try {
        const check = new ProcessPipelineTransitionGate(root, root).check(request);
        if (process.platform === 'win32') {
          await expect(check).rejects.toThrow(/completion/i);
          expect(existsSync(join(root, 'supervisor-executed'))).toBe(true);
        }
        // POSIX continues to execute the checker directly, without this helper.
        else await expect(check).resolves.toBeUndefined();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it.each(['token', 'quiescent', 'exit_code'])(
    'rejects a mismatched Windows completion %s',
    async (field) => {
      const root = fixture('print(\'{"allow":true,"reasons":[]}\')');
      writeFileSync(
        join(root, 'scripts/lite/windows_job_supervisor.py'),
        `import sys,json,pathlib
pathlib.Path('supervisor-executed').touch()
args=sys.argv[1:]
receipt=dict(schema='forgewright-windows-job-completion/v1',token=args[3],exit_code=0,quiescent=True)
receipt['${field}']=${{ token: "'0'*64", quiescent: 'False', exit_code: '1' }[field]}
pathlib.Path(args[1]).write_text(json.dumps(receipt),encoding='utf-8')
print('{"allow":true,"reasons":[]}',flush=True)
`,
      );
      try {
        const check = new ProcessPipelineTransitionGate(root, root).check(request);
        if (process.platform === 'win32') {
          await expect(check).rejects.toThrow(/completion/i);
          expect(existsSync(join(root, 'supervisor-executed'))).toBe(true);
        } else await expect(check).resolves.toBeUndefined();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it('passes the managed state parent and preserves string identities through validation and cleanup', async () => {
    const root = fixture('print(\'{"allow":true,"reasons":[]}\')');
    const client = join(root, 'scripts/runtime/windows_job_client.py');
    const original = readFileSync(client, 'utf8');
    writeFileSync(
      client,
      `import pathlib,sys,json\nif __name__ == '__main__': pathlib.Path('client-calls.jsonl').open('a',encoding='utf-8').write(json.dumps(sys.argv[1:])+'\\n')\n` +
        original.replace('from __future__ import annotations', ''),
    );
    try {
      await expect(
        new ProcessPipelineTransitionGate(root, root).check(request),
      ).resolves.toBeUndefined();
      if (process.platform === 'win32') {
        const calls: string[][] = readFileSync(join(root, 'client-calls.jsonl'), 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        expect(calls.map((args) => args[0])).toEqual(['prepare', 'validate', 'cleanup']);
        expect(calls[0]).toEqual([
          'prepare',
          '--parent',
          join(homedir(), '.config', 'forgewright'),
        ]);
        for (const flag of ['--completion-file', '--directory-device', '--directory-inode']) {
          const value = calls[1][calls[1].indexOf(flag) + 1];
          expect(calls[2][calls[2].indexOf(flag) + 1]).toBe(value);
          if (flag !== '--completion-file') expect(value).toMatch(/^\d+$/);
        }
        expect(calls[2]).not.toContain('--completion-token');
        expect(calls[2]).not.toContain('--exit-code');
        expect(existsSync(calls[1][calls[1].indexOf('--completion-file') + 1])).toBe(false);
      } else expect(existsSync(join(root, 'client-calls.jsonl'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('provisions a missing configured completion parent privately and fails closed on an unsafe existing parent', async () => {
    const root = fixture(
      'import pathlib; pathlib.Path(\'executed\').touch(); print(\'{"allow":true,"reasons":[]}\')',
    );
    const missing = join(root, 'unprovisioned-private-state');
    const unsafe = join(root, 'existing-unsafe-state');
    mkdirSync(unsafe);
    if (process.platform === 'win32') {
      execFileSync('icacls', [unsafe, '/grant', '*S-1-1-0:(OI)(CI)(R)'], { stdio: 'ignore' });
    }
    vi.stubEnv('FORGEWRIGHT_BOOTSTRAP_HOME', missing);
    try {
      await expect(
        new ProcessPipelineTransitionGate(root, root).check(request),
      ).resolves.toBeUndefined();
      if (process.platform === 'win32') {
        expect(existsSync(missing)).toBe(true);
        rmSync(join(root, 'executed'), { force: true });
        vi.stubEnv('FORGEWRIGHT_BOOTSTRAP_HOME', unsafe);
        await expect(new ProcessPipelineTransitionGate(root, root).check(request)).rejects.toThrow(
          /completion prepare failed/i,
        );
        expect(existsSync(join(root, 'executed'))).toBe(false);
      }
    } finally {
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reaps a forced Windows supervisor before cleaning its completion directory', async () => {
    const root = fixture('print(\'{"allow":true,"reasons":[]}\')');
    writeFileSync(
      join(root, 'scripts/lite/windows_job_supervisor.py'),
      "import os,pathlib,time\npathlib.Path('supervisor.pid').write_text(str(os.getpid()))\ntime.sleep(60)\n",
    );
    const client = cleanupTarget.completionCommand;
    let cleaned = false;
    const spy = vi.spyOn(cleanupTarget, 'completionCommand').mockImplementation(function (
      this: typeof cleanupTarget,
      support,
      args,
      env,
    ) {
      if (args[0] === 'cleanup') {
        const pid = Number(readFileSync(join(root, 'supervisor.pid'), 'utf8'));
        expect(
          () => process.kill(pid, 0),
          'receipt cleanup must follow supervisor reaping',
        ).toThrow();
        cleaned = true;
      }
      return client.call(this, support, args, env);
    });
    try {
      const check = new ProcessPipelineTransitionGate(root, root, 500).check(request);
      if (process.platform === 'win32') {
        await expect(check).rejects.toThrow('Windows job cleanup unconfirmed');
        expect(cleaned).toBe(true);
      } else await expect(check).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves Windows home/temp/shell environment without forwarding credentials or gate overrides', async () => {
    const root = fixture(`import json, os, pathlib, tempfile
home = str(pathlib.Path.home())
expanded = str(pathlib.Path('~/probe').expanduser())
probe_dir = tempfile.mkdtemp(prefix='gate-env-')
pathlib.Path(probe_dir).rmdir()
leaked = [k for k in ('OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'FORGEWRIGHT_SKIP_GATE', 'PYTHONPATH', 'PYTHONSTARTUP') if k in os.environ]
pathlib.Path('env-report.json').write_text(json.dumps({
  'home': home,
  'envHome': os.environ.get('HOME'),
  'userprofile': os.environ.get('USERPROFILE'),
  'expanded': expanded,
  'tempParent': str(pathlib.Path(probe_dir).parent.resolve()),
  'envTemp': os.environ.get('TEMP'),
  'envTmp': os.environ.get('TMP'),
  'comspec': os.environ.get('COMSPEC'),
  'pathext': os.environ.get('PATHEXT'),
  'leaked': leaked,
}), encoding='utf-8')
print('{"allow":true,"reasons":[]}')
`);
    const customTemp = mkdtempSync(join(tmpdir(), 'gate-custom-temp-'));
    const savedHome = process.env.HOME;
    const savedTmpdir = process.env.TMPDIR;
    delete process.env.HOME;
    delete process.env.TMPDIR;
    vi.stubEnv('USERPROFILE', homedir());
    vi.stubEnv('TEMP', customTemp);
    vi.stubEnv('TMP', customTemp);
    vi.stubEnv('OPENAI_API_KEY', 'sk-secret-value');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-secret');
    vi.stubEnv('GITHUB_TOKEN', 'ghp_secret');
    vi.stubEnv('FORGEWRIGHT_SKIP_GATE', '1');
    vi.stubEnv('PYTHONPATH', root);
    vi.stubEnv('PYTHONSTARTUP', join(root, 'startup.py'));
    try {
      await expect(
        new ProcessPipelineTransitionGate(root, root).check(request),
      ).resolves.toBeUndefined();
      const report = JSON.parse(readFileSync(join(root, 'env-report.json'), 'utf8'));
      expect(report.home).toBe(homedir());
      expect(report.envHome).toBe(homedir());
      expect(report.expanded).toBe(join(homedir(), 'probe'));
      expect(report.leaked).toEqual([]);
      if (process.platform === 'win32') {
        expect(report.userprofile).toBe(homedir());
        expect(report.envTemp).toBe(customTemp);
        expect(report.envTmp).toBe(customTemp);
        expect(report.tempParent.toLowerCase()).toBe(customTemp.toLowerCase());
        if (process.env.COMSPEC) expect(report.comspec).toBe(process.env.COMSPEC);
        if (process.env.PATHEXT) expect(report.pathext).toBe(process.env.PATHEXT);
      }
    } finally {
      vi.unstubAllEnvs();
      if (savedHome !== undefined) process.env.HOME = savedHome;
      else delete process.env.HOME;
      if (savedTmpdir !== undefined) process.env.TMPDIR = savedTmpdir;
      else delete process.env.TMPDIR;
      rmSync(customTemp, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('clears reapTimer on exit so delayed close does not race receipt cleanup before close', async () => {
    const root = fixture('import time\ntime.sleep(60)\nprint(\'{"allow":true,"reasons":[]}\')\n');
    writeFileSync(
      join(root, 'scripts/lite/windows_job_supervisor.py'),
      "import os,pathlib,time\npathlib.Path('supervisor.pid').write_text(str(os.getpid()))\ntime.sleep(60)\n",
    );
    const client = cleanupTarget.completionCommand;
    const requestCleanup = cleanupTarget.requestCleanup;
    const events: string[] = [];
    let closeEmitted = false;
    let cleanupSawClose = false;
    const spy = vi.spyOn(cleanupTarget, 'completionCommand').mockImplementation(async function (
      this: typeof cleanupTarget,
      support,
      args,
      env,
    ) {
      events.push(args[0]);
      if (args[0] === 'cleanup') cleanupSawClose = closeEmitted;
      return client.call(this, support, args, env);
    });
    const realSetTimeout = globalThis.setTimeout;
    const cleanupSpy = vi.spyOn(cleanupTarget, 'requestCleanup').mockImplementation(function (
      this: typeof cleanupTarget,
      child,
    ) {
      const origEmit = child.emit.bind(child);
      child.emit = ((event: string, ...args: unknown[]) => {
        if (event === 'close' && process.platform === 'win32') {
          realSetTimeout(() => {
            closeEmitted = true;
            origEmit(event, ...args);
          }, 150);
          return true;
        }
        return origEmit(event, ...args);
      }) as typeof child.emit;
      return requestCleanup.call(this, child);
    });
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: (...args: unknown[]) => void,
      ms?: number,
      ...rest: unknown[]
    ) => {
      if (ms === 5000) return realSetTimeout(fn, 50, ...rest);
      if (ms === 1000) return realSetTimeout(fn, 50, ...rest);
      return realSetTimeout(fn, ms, ...rest);
    }) as typeof setTimeout);
    try {
      const check = new ProcessPipelineTransitionGate(root, root, 50).check(request);
      if (process.platform === 'win32') {
        await expect(check).rejects.toThrow('Windows job cleanup unconfirmed');
        expect(cleanupSawClose).toBe(true);
        expect(events).toEqual(['prepare', 'cleanup']);
      } else await expect(check).rejects.toThrow('timed out');
    } finally {
      timeoutSpy.mockRestore();
      cleanupSpy.mockRestore();
      spy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retains the completion directory when reapTimer expires before a late supervisor exit', async () => {
    const root = fixture('import time\ntime.sleep(60)\nprint(\'{"allow":true,"reasons":[]}\')\n');
    writeFileSync(
      join(root, 'scripts/lite/windows_job_supervisor.py'),
      "import os,pathlib,time\npathlib.Path('supervisor.pid').write_text(str(os.getpid()))\ntime.sleep(60)\n",
    );
    const client = cleanupTarget.completionCommand;
    const requestCleanup = cleanupTarget.requestCleanup;
    const events: string[] = [];
    let completionFile = '';
    let heldChild: ChildProcessWithoutNullStreams | undefined;
    let realKill: (() => boolean) | undefined;
    const spy = vi.spyOn(cleanupTarget, 'completionCommand').mockImplementation(async function (
      this: typeof cleanupTarget,
      support,
      args,
      env,
    ) {
      events.push(args[0]);
      const result = await client.call(this, support, args, env);
      if (args[0] === 'prepare' && typeof result.completion_file === 'string') {
        completionFile = result.completion_file;
      }
      return result;
    });
    const realSetTimeout = globalThis.setTimeout;
    const cleanupSpy = vi.spyOn(cleanupTarget, 'requestCleanup').mockImplementation(function (
      this: typeof cleanupTarget,
      child,
    ) {
      heldChild = child;
      const origKill = child.kill.bind(child);
      realKill = () => origKill();
      if (process.platform === 'win32') {
        child.kill = (() => true) as typeof child.kill;
      }
      return requestCleanup.call(this, child);
    });
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: (...args: unknown[]) => void,
      ms?: number,
      ...rest: unknown[]
    ) => {
      if (ms === 5000) return realSetTimeout(fn, 50, ...rest);
      if (ms === 1000) {
        return realSetTimeout(() => {
          fn(...rest);
          // Trigger exit immediately after reapTimer settles to test post-settlement exit guard.
          heldChild?.emit('exit', 1, null);
        }, 50);
      }
      return realSetTimeout(fn, ms, ...rest);
    }) as typeof setTimeout);
    try {
      const check = new ProcessPipelineTransitionGate(root, root, 50).check(request);
      if (process.platform === 'win32') {
        await expect(check).rejects.toThrow('Windows job cleanup unconfirmed');
        expect(events).toEqual(['prepare']);
        expect(completionFile).not.toBe('');
        expect(existsSync(join(completionFile, '..'))).toBe(true);
      } else await expect(check).rejects.toThrow('timed out');
    } finally {
      timeoutSpy.mockRestore();
      cleanupSpy.mockRestore();
      spy.mockRestore();
      if (heldChild && heldChild.exitCode === null && heldChild.signalCode === null) {
        const exited = new Promise((resolveExit) => heldChild?.once('close', resolveExit));
        realKill?.();
        await exited;
      }
      if (completionFile) rmSync(join(completionFile, '..'), { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('cancellation during preparation cleans the receipt directory without spawning a checker', async () => {
    const root = fixture(
      'import pathlib; pathlib.Path(\'executed\').touch(); print(\'{"allow":true,"reasons":[]}\')',
    );
    const controller = new AbortController();
    const client = cleanupTarget.completionCommand;
    const actions: string[] = [];
    const spy = vi.spyOn(cleanupTarget, 'completionCommand').mockImplementation(async function (
      this: typeof cleanupTarget,
      support,
      args,
      env,
    ) {
      actions.push(args[0]);
      const result = await client.call(this, support, args, env);
      if (args[0] === 'prepare') controller.abort();
      return result;
    });
    try {
      const check = new ProcessPipelineTransitionGate(root, root).check(request, controller.signal);
      if (process.platform === 'win32') {
        await expect(check).rejects.toThrow('cancelled');
        expect(actions).toEqual(['prepare', 'cleanup']);
        expect(existsSync(join(root, 'executed'))).toBe(false);
      } else await expect(check).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['normal', 'exception', 'abrupt', 'overflow', 'timeout', 'cancel'])(
    'reclaims redirected descendants on %s exit',
    async (mode) => {
      const finish = {
        normal: `print('{"allow":true,"reasons":[]}')`,
        exception: `raise RuntimeError('checker failure')`,
        abrupt: `os._exit(7)`,
        overflow: `print('X' * 200000, flush=True); time.sleep(60)`,
        timeout: `pathlib.Path('ready').touch(); time.sleep(60)`,
        cancel: `pathlib.Path('ready').touch(); time.sleep(60)`,
      }[mode]!;
      const root = fixture(`import os,subprocess,sys,time,pathlib
child=subprocess.Popen([sys.executable,'-c',"import subprocess,sys,time,pathlib; p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); pathlib.Path('grandchild.pid').write_text(str(p.pid)); time.sleep(60)"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
pathlib.Path('child.pid').write_text(str(child.pid))
while not pathlib.Path('grandchild.pid').exists(): time.sleep(0.01)
${finish}
`);
      const controller = new AbortController();
      const cancelPoll =
        mode === 'cancel'
          ? setInterval(() => {
              if (existsSync(join(root, 'ready'))) controller.abort();
            }, 15)
          : undefined;
      if (mode === 'timeout') {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      }
      try {
        const check = new ProcessPipelineTransitionGate(
          root,
          root,
          mode === 'timeout' ? 500 : 5000,
        ).check(request, mode === 'cancel' ? controller.signal : undefined);
        if (mode === 'timeout') {
          const rejected = expect(check).rejects.toThrow('timed out');
          for (let i = 0; i < 250 && !existsSync(join(root, 'ready')); i++) await delay(20);
          expect(existsSync(join(root, 'grandchild.pid'))).toBe(true);
          await vi.advanceTimersByTimeAsync(500);
          await rejected;
          vi.useRealTimers();
        } else if (mode === 'normal') {
          await expect(check).resolves.toBeUndefined();
        } else if (mode === 'cancel') {
          await expect(check).rejects.toThrow('cancelled');
        } else {
          await expect(check).rejects.toThrow();
        }
        for (const file of ['child.pid', 'grandchild.pid']) {
          const pid = Number(readFileSync(join(root, file), 'utf8'));
          expectPidAbsent(pid, 'all job members must be gone before settlement');
        }
      } finally {
        if (mode === 'timeout') vi.useRealTimers();
        if (cancelPoll) clearInterval(cancelPoll);
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it('already cancelled requests execute no checker', async () => {
    const root = fixture("import pathlib; pathlib.Path('executed').write_text('bad')");
    const controller = new AbortController();
    controller.abort();
    try {
      await expect(
        new ProcessPipelineTransitionGate(root, root).check(request, controller.signal),
      ).rejects.toThrow('cancelled');
      expect(existsSync(join(root, 'executed'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('preserves timeout after successful group termination without signalling the retired group again', async () => {
    const root = fixture('import time\ntime.sleep(0.5)\n');
    const cleanup = cleanupTarget.requestCleanup;
    let attempts = 0;
    const spy = vi.spyOn(cleanupTarget, 'requestCleanup').mockImplementation(function (child) {
      if (++attempts > 1) {
        throw Object.assign(new Error('retired group is no longer signalable'), { code: 'EPERM' });
      }
      return cleanup(child);
    });
    try {
      await expect(
        new ProcessPipelineTransitionGate(root, root, 100).check(request),
      ).rejects.toThrow('timed out; state unchanged');
      expect(attempts).toBe(1);
    } finally {
      spy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retains an initial cleanup failure even when a later termination attempt succeeds', async () => {
    const root = fixture('import time\ntime.sleep(0.3)\n');
    const cleanup = cleanupTarget.requestCleanup;
    let attempts = 0;
    const spy = vi.spyOn(cleanupTarget, 'requestCleanup').mockImplementation(function (child) {
      if (++attempts === 1) {
        throw Object.assign(new Error('initial group signal denied'), { code: 'EPERM' });
      }
      return cleanup(child);
    });
    try {
      const result = await new ProcessPipelineTransitionGate(root, root, 100)
        .check(request)
        .catch((error) => error);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('timed out; state unchanged');
      expect(result.message).toContain('cleanup failed: EPERM');
    } finally {
      spy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['valid', 'print(\'{"allow":true,"reasons":[],"limitations":[]}\')', true],
    ['nonzero', 'print(\'{"allow":true,"reasons":[]}\'); raise SystemExit(1)', false],
    ['denial', 'print(\'{"allow":false,"reasons":["missing evidence"]}\')', false],
    ['bad JSON', 'print("PASS")', false],
    ['contradiction', 'print(\'{"allow":true,"reasons":["failed"]}\')', false],
  ])('handles %s by exit and structured decision', async (_, script, allow) => {
    const root = fixture(script as string);
    try {
      const check = new ProcessPipelineTransitionGate(root, root).check(request);
      if (allow) await expect(check).resolves.toBeUndefined();
      else await expect(check).rejects.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('times out and reclaims the owned process group including a child', async () => {
    const root = fixture(`import subprocess,sys,time,pathlib
child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'])
pathlib.Path('child.pid').write_text(str(child.pid))
time.sleep(60)
`);
    // Drive the same 500ms gate deadline after the descendant exists. Native
    // interpreter/ACL startup latency must not turn this into a no-child test.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const rejected = expect(
        new ProcessPipelineTransitionGate(root, root, 500).check(request),
      ).rejects.toThrow('timed out');
      for (let i = 0; i < 250 && !existsSync(join(root, 'child.pid')); i++) await delay(20);
      expect(existsSync(join(root, 'child.pid'))).toBe(true);
      await vi.advanceTimersByTimeAsync(500);
      await rejected;
      vi.useRealTimers();
      const pid = Number(readFileSync(join(root, 'child.pid'), 'utf8'));
      expectPidAbsent(pid);
    } finally {
      vi.useRealTimers();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('real framework checker denies missing research and does not execute workspace scripts', async () => {
    const root = fixture('raise RuntimeError("must not run workspace script")');
    execFileSync('git', ['init', '-q'], { cwd: root });
    try {
      await expect(
        new ProcessPipelineTransitionGate(
          root,
          fileURLToPath(new URL('../../../../', import.meta.url)),
        ).check(request),
      ).rejects.toThrow(/research/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('reclaims inherited pipes immediately when the checker exits', async () => {
    const root = fixture(
      "import subprocess,sys\nsubprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'])\nprint('{\"allow\":true,\"reasons\":[]}')\n",
    );
    try {
      await expect(
        new ProcessPipelineTransitionGate(root, root, 1500).check(request),
      ).resolves.toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('bounds the combined time of sequential replay commands', async () => {
    const root = fixture(
      "import subprocess,sys\nfor _ in range(10):\n subprocess.run([sys.executable,'-c','import time;time.sleep(0.1)'],check=True)\nprint('{\"allow\":true,\"reasons\":[]}')\n",
    );
    try {
      await expect(
        new ProcessPipelineTransitionGate(root, root, 300).check(request),
      ).rejects.toThrow('timed out; state unchanged');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('cancellation reclaims the checker before resolving its rejected check', async () => {
    const root = fixture(
      "import os,pathlib,time,subprocess,sys\nchild=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)'])\npathlib.Path('child.pid').write_text(str(child.pid))\npathlib.Path('checker.pid').write_text(str(os.getpid()))\ntime.sleep(60)\n",
    );
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (existsSync(join(root, 'checker.pid'))) controller.abort();
    }, 20);
    try {
      await expect(
        new ProcessPipelineTransitionGate(root, root).check(request, controller.signal),
      ).rejects.toThrow('cancelled');
      const pid = Number(readFileSync(join(root, 'checker.pid'), 'utf8'));
      expectPidAbsent(pid);
      const childPid = Number(readFileSync(join(root, 'child.pid'), 'utf8'));
      expectPidAbsent(childPid);
    } finally {
      clearTimeout(timer);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['always-present', 'EPERM', 'EINVAL'])(
    'fails closed on POSIX when process-group quiescence probe reports %s',
    async (probeMode) => {
      if (process.platform === 'win32') return;
      const root = fixture('print(\'{"allow":true,"reasons":[]}\')');
      const origProbe = cleanupTarget.probeProcessGroup;
      cleanupTarget.probeProcessGroup = function (pgid: number) {
        expect(pgid).toBeGreaterThan(0);
        if (probeMode === 'always-present') return;
        throw Object.assign(new Error(`probe failed: ${probeMode}`), { code: probeMode });
      };
      try {
        await expect(
          new ProcessPipelineTransitionGate(root, root, 5000).check(request),
        ).rejects.toThrow(/POSIX process group cleanup unconfirmed/i);
      } finally {
        if (origProbe) cleanupTarget.probeProcessGroup = origProbe;
        else delete cleanupTarget.probeProcessGroup;
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it('rejects boundedly on POSIX when requestCleanup fails and child never closes', async () => {
    if (process.platform === 'win32') return;
    const root = fixture('import time\ntime.sleep(60)\n');
    let heldChild: ChildProcessWithoutNullStreams | undefined;
    const spy = vi.spyOn(cleanupTarget, 'requestCleanup').mockImplementation(function (child) {
      heldChild = child;
      throw Object.assign(new Error('group kill denied'), { code: 'EPERM' });
    });
    try {
      const err: unknown = await new ProcessPipelineTransitionGate(root, root, 80)
        .check(request)
        .catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toContain('timed out; state unchanged');
      expect(msg).toContain('Gate process cleanup failed: EPERM');
      expect(msg).toMatch(/POSIX process group cleanup unconfirmed/i);
    } finally {
      spy.mockRestore();
      if (heldChild?.pid) {
        try {
          process.kill(-heldChild.pid, 'SIGKILL');
        } catch {
          // already gone
        }
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
