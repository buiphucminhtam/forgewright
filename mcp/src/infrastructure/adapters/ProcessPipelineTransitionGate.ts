import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type {
  PipelineTransitionGate,
  PipelineTransitionRequest,
} from '../../core/ports/PipelineTransitionGate.js';

/** Trusted framework runner; never executes a script selected from the client workspace. */
const packagedSupport = fileURLToPath(new URL('../../../runtime-support/', import.meta.url));

interface Completion {
  completion_file: string;
  completion_token: string;
  directory_device: string;
  directory_inode: string;
}

export class ProcessPipelineTransitionGate implements PipelineTransitionGate {
  constructor(
    private workspace: string,
    private framework: string,
    private timeoutMs = 320_000,
  ) {}

  private requestCleanup(child: ChildProcessWithoutNullStreams): void {
    if (process.platform === 'win32') child.stdin.end();
    else if (child.pid) process.kill(-child.pid, 'SIGKILL');
  }

  private probeProcessGroup(pgid: number): void {
    process.kill(-pgid, 0);
  }

  private async waitForPosixGroupQuiescence(pgid: number, budgetMs = 500): Promise<void> {
    const deadline = performance.now() + budgetMs;
    let lastStatus = 'group still present';
    for (;;) {
      try {
        this.probeProcessGroup(pgid);
        lastStatus = 'group still present';
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ESRCH') return;
        lastStatus = code ?? (error instanceof Error ? error.message : String(error));
      }
      if (performance.now() >= deadline) {
        throw new Error(
          `Gate process cleanup failed: POSIX process group cleanup unconfirmed (${lastStatus})`,
        );
      }
      await delay(5);
    }
  }

  private completionCommand(
    support: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolveCommand, rejectCommand) => {
      execFile(
        'python',
        [
          '-I',
          '-B',
          '-X',
          'utf8',
          resolve(support, 'scripts/runtime/windows_job_client.py'),
          ...args,
        ],
        {
          cwd: this.workspace,
          env,
          shell: false,
          windowsHide: true,
          timeout: 5000,
          maxBuffer: 128 * 1024,
          encoding: 'utf8',
        },
        (error, stdout, stderr) => {
          if (error) {
            // execFile's message includes argv, including the private nonce.
            rejectCommand(
              new Error(
                `Windows job completion ${args[0]} failed: ${stderr.slice(0, 500) || error.code}`,
              ),
            );
            return;
          }
          try {
            const result: unknown = JSON.parse(stdout);
            if (!result || typeof result !== 'object' || Array.isArray(result)) {
              throw new Error('invalid client result');
            }
            resolveCommand(result as Record<string, unknown>);
          } catch {
            rejectCommand(
              new Error(`Windows job completion ${args[0]} failed: invalid client result`),
            );
          }
        },
      );
    });
  }

  async check(request: PipelineTransitionRequest, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new Error('Pipeline gate cancelled');
    const windows = process.platform === 'win32';
    const support = existsSync(packagedSupport) ? packagedSupport : this.framework;
    const script = resolve(support, 'scripts/lite/pipeline_transition_gate.py');
    // Credentials and gate overrides are never forwarded to either trusted client.
    const env: NodeJS.ProcessEnv = {};
    for (const key of [
      'PATH',
      'HOME',
      'USERPROFILE',
      'TMPDIR',
      'TMP',
      'TEMP',
      'LANG',
      'LC_ALL',
      'SYSTEMROOT',
      'COMSPEC',
      'PATHEXT',
    ]) {
      if (process.env[key]) env[key] = process.env[key];
    }
    const resolvedHome = homedir();
    if (resolvedHome) {
      env.HOME ??= resolvedHome;
      if (windows) env.USERPROFILE ??= resolvedHome;
    }
    let completion: Completion | undefined;
    if (windows) {
      const explicit = process.env.FORGEWRIGHT_BOOTSTRAP_HOME?.trim();
      const xdg = process.env.XDG_CONFIG_HOME?.trim();
      const expandHome = (value: string) =>
        value === '~' ? homedir() : /^~[\\/]/.test(value) ? join(homedir(), value.slice(2)) : value;
      const parent = explicit
        ? resolve(this.workspace, expandHome(explicit))
        : xdg
          ? resolve(this.workspace, expandHome(xdg), 'forgewright')
          : join(homedir(), '.config', 'forgewright');
      const prepared = await this.completionCommand(support, ['prepare', '--parent', parent], env);
      if (
        typeof prepared.completion_file !== 'string' ||
        !isAbsolute(prepared.completion_file) ||
        typeof prepared.completion_token !== 'string' ||
        !/^[0-9a-f]{64}$/.test(prepared.completion_token) ||
        typeof prepared.directory_device !== 'string' ||
        !/^\d+$/.test(prepared.directory_device) ||
        typeof prepared.directory_inode !== 'string' ||
        !/^\d+$/.test(prepared.directory_inode)
      )
        throw new Error('Windows job completion prepare failed: invalid identity');
      completion = prepared as unknown as Completion;
    }
    const identity = completion
      ? [
          '--completion-file',
          completion.completion_file,
          '--directory-device',
          completion.directory_device,
          '--directory-inode',
          completion.directory_inode,
        ]
      : [];
    const args = [
      '-I',
      '-B',
      '-X',
      'utf8',
      ...(completion
        ? [
            resolve(support, 'scripts/lite/windows_job_supervisor.py'),
            '--completion-file',
            completion.completion_file,
            '--completion-token',
            completion.completion_token,
            '--script',
          ]
        : []),
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
    let supervisorStopped = true;
    let checkFailure: unknown;
    try {
      if (signal?.aborted) throw new Error('Pipeline gate cancelled; state unchanged');
      await new Promise<void>((resolveCheck, rejectCheck) => {
        // Python isolation ignores PYTHONPATH and user site; credentials and gate
        // override variables are not forwarded to the verifier or its replay.
        const child = spawn(windows ? 'python' : 'python3', args, {
          cwd: this.workspace,
          env,
          shell: false,
          detached: !windows,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const ownedPgid = !windows && child.pid ? child.pid : undefined;
        let posixQuiescencePromise: Promise<void> | undefined;
        const ensurePosixQuiescence = (): Promise<void> | undefined => {
          if (ownedPgid === undefined) return undefined;
          if (!posixQuiescencePromise) {
            posixQuiescencePromise = this.waitForPosixGroupQuiescence(ownedPgid);
            void posixQuiescencePromise.catch((error) => {
              const msg = error instanceof Error ? error.message : String(error);
              cleanupFailure = new Error(
                Array.from(new Set([cleanupFailure?.message, msg].filter(Boolean))).join('; '),
              );
              if (settled) return;
              settled = true;
              supervisorStopped = false;
              clearTimeout(timer);
              clearTimeout(cleanupTimer);
              clearTimeout(retryTimer);
              clearTimeout(reapTimer);
              signal?.removeEventListener('abort', abort);
              child.stdin.destroy();
              child.stdout.destroy();
              child.stderr.destroy();
              rejectCheck(
                new Error(
                  Array.from(
                    new Set([failure?.message, cleanupFailure?.message].filter(Boolean)),
                  ).join('; '),
                ),
              );
            });
          }
          return posixQuiescencePromise;
        };
        supervisorStopped = false;
        let stdout = '';
        let stderr = '';
        let bytes = 0;
        let failure: Error | undefined;
        let cleanupFailure: Error | undefined;
        let terminationRequested = false;
        let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        let reapTimer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        const cleanup = () => {
          if (settled) return;
          if (windows && child.exitCode !== null) return;
          if (child.pid && !terminationRequested) {
            if (windows && !cleanupTimer) {
              cleanupTimer = setTimeout(() => {
                clearTimeout(timer);
                clearTimeout(retryTimer);
                signal?.removeEventListener('abort', abort);
                const unconfirmed = 'Gate process cleanup failed: Windows job cleanup unconfirmed';
                cleanupFailure ??= new Error(unconfirmed);
                // Reap the forced supervisor before deleting its receipt directory.
                // If reaping cannot be observed, retain it and fail closed boundedly.
                reapTimer = setTimeout(() => {
                  if (settled) return;
                  settled = true;
                  supervisorStopped = false;
                  rejectCheck(
                    new Error(
                      Array.from(
                        new Set(
                          [failure?.message, cleanupFailure?.message, unconfirmed].filter(Boolean),
                        ),
                      ).join('; '),
                    ),
                  );
                }, 1000);
                try {
                  child.kill();
                } catch (error) {
                  cleanupFailure ??= error as Error;
                }
                child.stdin.destroy();
                child.stdout.destroy();
                child.stderr.destroy();
              }, 5000);
            }
            try {
              if (windows) {
                // EOF requests cooperative job termination and active-process
                // confirmation. Killing only the supervisor cannot prove cleanup.
                this.requestCleanup(child);
              } else this.requestCleanup(child);
              terminationRequested = true;
            } catch (error) {
              const code = (error as NodeJS.ErrnoException).code;
              if (code === 'ESRCH') terminationRequested = true;
              else {
                cleanupFailure ??= new Error(`Gate process cleanup failed: ${code}`);
                if (windows) retryTimer = setTimeout(cleanup, 25);
              }
            }
          }
          if (!windows) ensurePosixQuiescence();
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
          cleanup();
        });
        child.stdin.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code !== 'EPIPE') cleanupFailure = error;
        });
        // Descendants may inherit stdout/stderr; waiting for close before killing
        // them would keep those pipes open until the global deadline.
        child.on('exit', () => {
          if (!settled) supervisorStopped = true;
          clearTimeout(cleanupTimer);
          clearTimeout(retryTimer);
          clearTimeout(reapTimer);
          cleanup();
        });
        child.on('close', (code) => {
          if (!settled) supervisorStopped = true;
          clearTimeout(timer);
          clearTimeout(cleanupTimer);
          clearTimeout(retryTimer);
          clearTimeout(reapTimer);
          signal?.removeEventListener('abort', abort);
          cleanup();
          if (settled) return;
          settled = true;
          void (async () => {
            if (ownedPgid !== undefined) {
              try {
                await ensurePosixQuiescence();
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                cleanupFailure = new Error(
                  Array.from(new Set([cleanupFailure?.message, msg].filter(Boolean))).join('; '),
                );
              }
            }
            if (completion) {
              try {
                if (code === null) throw new Error('supervisor exit unconfirmed');
                const receipt = await this.completionCommand(
                  support,
                  [
                    'validate',
                    ...identity,
                    '--completion-token',
                    completion.completion_token,
                    '--exit-code',
                    String(code),
                  ],
                  env,
                );
                if (
                  receipt.schema !== 'forgewright-windows-job-completion/v1' ||
                  receipt.token !== completion.completion_token ||
                  receipt.exit_code !== code ||
                  receipt.quiescent !== true
                )
                  throw new Error('invalid completion proof');
              } catch (error) {
                cleanupFailure = new Error(
                  [
                    cleanupFailure?.message,
                    'Windows job completion unconfirmed',
                    error instanceof Error ? error.message : String(error),
                  ]
                    .filter(Boolean)
                    .join('; '),
                );
              }
            }
            if (failure || cleanupFailure) {
              rejectCheck(
                new Error(
                  Array.from(
                    new Set([failure?.message, cleanupFailure?.message].filter(Boolean)),
                  ).join('; '),
                ),
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
                  Array.isArray(result.reasons) && result.reasons.length
                    ? result.reasons.join('; ')
                    : stderr.slice(0, 500) || 'Invalid gate result',
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
          })().catch(rejectCheck);
        });
      });
    } catch (error) {
      checkFailure = error;
    }
    if (completion && supervisorStopped) {
      try {
        const cleaned = await this.completionCommand(support, ['cleanup', ...identity], env);
        if (cleaned.cleaned !== true) throw new Error('Windows job completion cleanup unconfirmed');
      } catch (error) {
        checkFailure = new Error(
          [
            checkFailure instanceof Error ? checkFailure.message : checkFailure,
            error instanceof Error ? error.message : String(error),
          ]
            .filter(Boolean)
            .join('; '),
        );
      }
    }
    if (checkFailure) throw checkFailure;
    if (signal?.aborted) throw new Error('Pipeline gate cancelled; state unchanged');
  }
}
