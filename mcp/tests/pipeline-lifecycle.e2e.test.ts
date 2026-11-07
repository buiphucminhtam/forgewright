import { it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

it.each(['checkout', 'installed'])(
  'real %s stdio pipeline refuses missing/stale evidence and completes only after actual replay',
  async (surface) => {
    const framework = fileURLToPath(new URL('../../', import.meta.url));
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'pipeline-stdio-')));
    const runtime = join(root, '.forgewright/runtime/stdio');
    mkdirSync(runtime, { recursive: true });
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Fixture');
    writeFileSync(
      join(root, 'check.py'),
      `import os, pathlib, subprocess, sys, time\ncontrol = pathlib.Path('.forgewright/runtime/stdio')\nif (control / 'slow').exists():\n    child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])\n    (control / 'replay-pids.json').write_text(__import__('json').dumps([os.getpgrp(), os.getpid(), child.pid]))\n    time.sleep(30)\ndef bounded(value):\n    if value < 0: raise ValueError("negative")\n    return value\nassert bounded(7) == 7\ntry:\n    bounded(-1)\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError("negative accepted")\nprint("bounded input and rejection checked")\n`,
    );
    writeFileSync(join(root, '.gitignore'), '.forgewright/runtime/\n.forgewright/verify/\n');
    copyFileSync(
      join(framework, '.forgewright/execution-policy.yaml'),
      join(root, '.forgewright/execution-policy.yaml'),
    );
    git('add', '.');
    git('commit', '-qm', 'fixture baseline');
    if (surface === 'checkout') {
      const cli = join(framework, 'src/cli/dist/index.js');
      execFileSync(process.execPath, [cli, 'docs', 'init', root, '--json']);
      const manifestPath = join(root, '.forgewright/docs-manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifest.sources.push({ path: 'docs/guide.md', type: 'documentation' });
      manifest.privacy.allow.push('docs/guide.md');
      writeFileSync(manifestPath, JSON.stringify(manifest));
      writeFileSync(
        join(root, 'docs/guide.md'),
        '# Guide\n' + 'Verified project documentation.\n'.repeat(21000),
      );
      execFileSync(process.execPath, [cli, 'docs', 'build', root, '--json']);
      expect(readFileSync(join(root, '.forgewright/cache/docs-index.json')).length).toBeGreaterThan(
        512 * 1024,
      );
    }
    let entry = join(framework, 'mcp/build/index.js');
    if (surface === 'installed') {
      const installation = join(runtime, 'mcp-server');
      mkdirSync(installation);
      cpSync(join(framework, 'mcp/build'), join(installation, 'build'), { recursive: true });
      copyFileSync(join(framework, 'mcp/package.json'), join(installation, 'package.json'));
      const dependencies = Object.keys(
        JSON.parse(readFileSync(join(framework, 'mcp/package.json'), 'utf8')).dependencies,
      );
      for (const name of dependencies) {
        const local = join(framework, 'mcp/node_modules', name);
        const source = existsSync(local) ? local : join(framework, 'node_modules', name);
        const destination = join(installation, 'node_modules', name);
        mkdirSync(dirname(destination), { recursive: true });
        symlinkSync(source, destination, 'dir');
      }
      execFileSync(
        'bash',
        [
          '-c',
          'source "$1"; FORGEWRIGHT_DIR="$2"; CANONICAL_STAGE_DIR="$3"; stage_runtime_support',
          'stage-support',
          join(framework, 'scripts/mcp/forgewright-mcp-setup.sh'),
          framework,
          installation,
        ],
        { cwd: installation },
      );
      entry = join(installation, 'build/index.js');
    }
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      cwd: root,
      stderr: 'pipe',
      env: {
        PATH: process.env.PATH ?? '',
        HOME: runtime,
        TMPDIR: tmpdir(),
        LANG: 'en_US.UTF-8',
        FORGEWRIGHT_WORKSPACE: root,
        FORGEWRIGHT_DIR: framework,
        FORGEWRIGHT_RUNTIME_MODE: 'local',
        FORGEWRIGHT_SESSION_ID: 'pipeline-e2e',
        FORGEWRIGHT_MCP_LEASE_ROOT: join(runtime, 'leases'),
        FORGEWRIGHT_TRAJECTORY_ROOT: join(runtime, 'trajectories'),
        FORGEWRIGHT_TRAJECTORY_ID: 'pipeline-e2e',
        FORGEWRIGHT_TELEMETRY_DIR: join(root, '.forgewright/telemetry'),
        PYTHONDONTWRITEBYTECODE: '1',
      },
    });
    let diagnostics = '';
    transport.stderr?.on('data', (chunk) => {
      diagnostics = (diagnostics + chunk.toString()).slice(-4096);
    });
    const client = new Client({ name: 'pipeline-lifecycle-e2e', version: '1' });
    const call = (name: string, args: Record<string, unknown> = {}) =>
      client.callTool({ name, arguments: args });
    const state = () =>
      JSON.parse(readFileSync(join(root, '.forgewright/pipeline-state.json'), 'utf8')).state;
    try {
      await client.connect(transport);
      const started = await call('fw_start_pipeline', {
        mode: 'Local correction',
        kind: surface === 'checkout' ? 'existing' : 'mechanical',
      });
      expect(started.isError, JSON.stringify(started)).not.toBe(true);
      const runId = state().runId;
      expect((await call('fw_advance_to_next_phase')).isError).toBe(true);
      expect(state().currentPhase).toBe(1);
      mkdirSync(join(root, '.forgewright/research'), { recursive: true });
      writeFileSync(
        join(root, '.forgewright/research', `${runId}.json`),
        JSON.stringify({
          schema_version: 1,
          run_id: runId,
          status: 'supported',
          queries: ['inspect local bounded input'],
          sources: [{ url: 'check.py', revision: 'fixture baseline' }],
          candidates: [],
          decision: 'not_applicable',
          reason: 'Established local correction; no new idea or capability',
        }),
      );
      if (surface === 'checkout') {
        const guide = join(root, 'docs/guide.md');
        const content = readFileSync(guide);
        writeFileSync(guide, '# Stale after build\n');
        expect((await call('fw_advance_to_next_phase')).isError).toBe(true);
        expect(state().currentPhase).toBe(1);
        writeFileSync(guide, content);
        execFileSync(process.execPath, [
          join(framework, 'src/cli/dist/index.js'),
          'docs',
          'build',
          root,
          '--json',
        ]);
      }
      expect((await call('fw_advance_to_next_phase')).isError).not.toBe(true);
      expect(state().currentPhase).toBe(2);
      expect((await call('fw_advance_to_next_phase')).isError).not.toBe(true);
      expect(state().currentPhase).toBe(3);
      expect((await call('fw_advance_to_next_phase', { turn: 'missing' })).isError).toBe(true);
      const capture = () =>
        execFileSync(
          'python3',
          [
            '-B',
            join(framework, 'scripts/lite/run_check.py'),
            '--turn',
            'pipeline-proof',
            '--acceptance',
            'bounded=Local bounded input rejects negatives',
            '--test-ref',
            'check.py',
            '--tier',
            'contract',
            '--phase',
            'verification',
            '--risk',
            'standard',
            '--change-kind',
            'feature',
            '--negative-path',
            'negative input rejected',
            '--negative-path-binding',
            'negative=negative input rejected|bounded|check.py',
            '--implementer-id',
            'fixture-implementer',
            '--reviewer-status',
            'not_required',
            '--limitations',
            'Local deterministic fixture, not production',
            '--',
            'python3',
            'check.py',
          ],
          { cwd: root, encoding: 'utf8', timeout: 30000 },
        );
      capture();
      const beforeCancellation = readFileSync(
        join(root, '.forgewright/pipeline-state.json'),
        'utf8',
      );
      const eventsBefore = readFileSync(join(root, '.forgewright/events.log'), 'utf8');
      const controller = new AbortController();
      writeFileSync(join(runtime, 'slow'), 'request-scoped cancellation probe');
      const cancelled = client
        .callTool(
          { name: 'fw_advance_to_next_phase', arguments: { turn: 'pipeline-proof' } },
          undefined,
          { signal: controller.signal },
        )
        .then(
          () => false,
          () => true,
        );
      let ownedGroup: number | undefined;
      try {
        const deadline = Date.now() + 10000;
        while (!existsSync(join(runtime, 'replay-pids.json')) && Date.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 20));
        const pids: number[] = JSON.parse(readFileSync(join(runtime, 'replay-pids.json'), 'utf8'));
        ownedGroup = pids[0];
        controller.abort();
        expect(await cancelled).toBe(true);
        const alive = (pid: number) => {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        };
        const cleanupDeadline = Date.now() + 3000;
        while (pids.some(alive) && Date.now() < cleanupDeadline)
          await new Promise((resolve) => setTimeout(resolve, 20));
        expect(
          pids.filter(alive),
          'cancelled request must reclaim checker, replay and child',
        ).toEqual([]);
        expect(readFileSync(join(root, '.forgewright/pipeline-state.json'), 'utf8')).toBe(
          beforeCancellation,
        );
        expect(readFileSync(join(root, '.forgewright/events.log'), 'utf8')).toBe(eventsBefore);
        expect((await call('fw_get_current_phase')).isError).not.toBe(true);
      } finally {
        controller.abort();
        if (ownedGroup) {
          try {
            process.kill(-ownedGroup, 'SIGKILL');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
          }
        }
        rmSync(join(runtime, 'slow'), { force: true });
      }
      const hardened = await call('fw_advance_to_next_phase', { turn: 'pipeline-proof' });
      expect(hardened.isError, JSON.stringify(hardened)).not.toBe(true);
      expect(state().currentPhase).toBe(4);
      writeFileSync(join(root, 'post-release.txt'), 'changed delivery tree');
      expect((await call('fw_advance_to_next_phase', { turn: 'pipeline-proof' })).isError).toBe(
        true,
      );
      expect(state().status).toBe('IN_PROGRESS');
      capture();
      const completed = await call('fw_advance_to_next_phase', { turn: 'pipeline-proof' });
      expect(completed.isError, JSON.stringify(completed)).not.toBe(true);
      expect(state().status).toBe('COMPLETED');
      expect((await call('fw_advance_to_next_phase', { turn: 'pipeline-proof' })).isError).toBe(
        true,
      );
    } catch (error) {
      throw new Error(`${String(error)}\nNative diagnostics: ${diagnostics}`, { cause: error });
    } finally {
      await client.close();
      await transport.close();
      expect(transport.pid).toBeNull();
      rmSync(root, { recursive: true, force: true });
    }
  },
  60000,
);
