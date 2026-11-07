import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  return root;
}

describe('owned pipeline verifier subprocess', () => {
  it('preserves timeout after successful group termination without signalling the retired group again', async () => {
    const root = fixture('import time\ntime.sleep(0.5)\n');
    const kill = process.kill.bind(process);
    let attempts = 0;
    const spy = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid < 0 && signal === 'SIGKILL' && ++attempts > 1) {
        throw Object.assign(new Error('retired group is no longer signalable'), { code: 'EPERM' });
      }
      return kill(pid, signal);
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
    const kill = process.kill.bind(process);
    let attempts = 0;
    const spy = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid < 0 && signal === 'SIGKILL' && ++attempts === 1) {
        throw Object.assign(new Error('initial group signal denied'), { code: 'EPERM' });
      }
      return kill(pid, signal);
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
    try {
      await expect(
        new ProcessPipelineTransitionGate(root, root, 500).check(request),
      ).rejects.toThrow('timed out');
      const pid = Number(readFileSync(join(root, 'child.pid'), 'utf8'));
      // Reaping by launchd can lag group teardown briefly.
      let alive = true;
      for (let i = 0; i < 30 && alive; i++) {
        try {
          process.kill(pid, 0);
          await new Promise((r) => setTimeout(r, 20));
        } catch {
          alive = false;
        }
      }
      expect(alive).toBe(false);
    } finally {
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
    const timer = setTimeout(() => controller.abort(), 200);
    try {
      await expect(
        new ProcessPipelineTransitionGate(root, root).check(request, controller.signal),
      ).rejects.toThrow('cancelled');
      const pid = Number(readFileSync(join(root, 'checker.pid'), 'utf8'));
      expect(() => process.kill(pid, 0)).toThrow();
      const childPid = Number(readFileSync(join(root, 'child.pid'), 'utf8'));
      let alive = true;
      for (let i = 0; i < 30 && alive; i++) {
        try {
          process.kill(childPid, 0);
          await new Promise((r) => setTimeout(r, 20));
        } catch {
          alive = false;
        }
      }
      expect(alive).toBe(false);
    } finally {
      clearTimeout(timer);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
