import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  PipelineTransitionGate,
  PipelineTransitionRequest,
} from '../../core/ports/PipelineTransitionGate.js';

/** Trusted framework runner; never executes a script selected from the client workspace. */
const packagedSupport = fileURLToPath(new URL('../../../runtime-support/', import.meta.url));

export class ProcessPipelineTransitionGate implements PipelineTransitionGate {
  constructor(
    private workspace: string,
    private framework: string,
    private timeoutMs = 320_000,
  ) {}

  async check(request: PipelineTransitionRequest, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new Error('Pipeline gate cancelled');
    // Detached process groups provide owned-descendant cleanup. Do not silently
    // claim that guarantee on hosts without it.
    if (process.platform === 'win32')
      throw new Error('Pipeline gate requires a process-group capable host');
    const support = existsSync(packagedSupport) ? packagedSupport : this.framework;
    const script = resolve(support, 'scripts/lite/pipeline_transition_gate.py');
    const args = [
      '-I',
      '-B',
      script,
      '--workspace',
      this.workspace,
      '--run-id',
      request.runId,
      '--phase',
      String(request.phase),
      '--kind',
      request.kind,
      '--started-at',
      request.startedAt,
    ];
    if (request.turn !== undefined) args.push('--turn', request.turn);
    await new Promise<void>((resolveCheck, rejectCheck) => {
      // Python isolation ignores PYTHONPATH and user site; credentials and gate
      // override variables are not forwarded to the verifier or its replay.
      const env: NodeJS.ProcessEnv = {};
      for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT']) {
        if (process.env[key]) env[key] = process.env[key];
      }
      const child = spawn('python3', args, {
        cwd: this.workspace,
        env,
        shell: false,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let bytes = 0;
      let failure: Error | undefined;
      let cleanupFailure: Error | undefined;
      let terminationRequested = false;
      const cleanup = () => {
        if (child.pid && !terminationRequested) {
          try {
            process.kill(-child.pid, 'SIGKILL');
            terminationRequested = true;
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ESRCH') terminationRequested = true;
            else cleanupFailure = new Error(`Gate process cleanup failed: ${code}`);
          }
        }
      };
      const abort = () => {
        failure = new Error('Pipeline gate cancelled; state unchanged');
        cleanup();
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      const timer = setTimeout(() => {
        failure = new Error('Pipeline gate timed out; state unchanged');
        cleanup();
      }, this.timeoutMs);
      const collect = (chunk: Buffer, channel: 'out' | 'err') => {
        bytes += chunk.byteLength;
        if (bytes > 128 * 1024) {
          failure = new Error('Pipeline gate output limit exceeded');
          cleanup();
          return;
        }
        if (channel === 'out') stdout += chunk.toString('utf8');
        else stderr += chunk.toString('utf8');
      };
      child.stdout.on('data', (chunk) => collect(chunk, 'out'));
      child.stderr.on('data', (chunk) => collect(chunk, 'err'));
      child.on('error', (error) => {
        failure = error;
      });
      // Descendants may inherit stdout/stderr; waiting for close before killing
      // them would keep those pipes open until the global deadline.
      child.on('exit', cleanup);
      child.on('close', (code) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        cleanup();
        if (failure || cleanupFailure) {
          rejectCheck(
            new Error([failure?.message, cleanupFailure?.message].filter(Boolean).join('; ')),
          );
          return;
        }
        try {
          const result = JSON.parse(stdout);
          if (
            code !== 0 ||
            result.allow !== true ||
            !Array.isArray(result.reasons) ||
            result.reasons.length
          ) {
            throw new Error(
              Array.isArray(result.reasons) ? result.reasons.join('; ') : 'Invalid gate result',
            );
          }
          resolveCheck();
        } catch (error) {
          rejectCheck(
            new Error(
              `Pipeline prerequisites failed: ${error instanceof Error ? error.message : stderr.slice(0, 500)}`,
            ),
          );
        }
      });
    });
  }
}
