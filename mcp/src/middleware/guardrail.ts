import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type PolicyAction = 'allow' | 'warn' | 'block' | 'config-error';

export interface PolicyEvaluation {
  action: PolicyAction;
  reason?: string;
}

export interface PolicyEvaluator {
  evaluate(toolName: string, arguments_: Record<string, unknown>): Promise<PolicyEvaluation>;
}

export interface ProcessPolicyEvaluatorOptions {
  cwd?: string;
  scriptPath?: string;
  policyFile?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const ANSI_COLOR_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function cleanOutput(output: string): string {
  return output.replace(ANSI_COLOR_PATTERN, '').trim();
}

function isConfigurationError(output: string): boolean {
  return /execution policy is missing, unreadable, empty, or malformed|policy configuration error/i.test(
    output,
  );
}

function serializePolicyArguments(arguments_: Record<string, unknown>): string {
  if (typeof arguments_.cmd === 'string') return arguments_.cmd;
  if (typeof arguments_.command === 'string') return arguments_.command;
  return JSON.stringify(arguments_);
}

function findPolicyScript(startDirectory: string): string {
  let directory = resolve(startDirectory);
  let candidate = resolve(directory, 'scripts/lite/policy-check.sh');
  while (!existsSync(candidate)) {
    const parent = dirname(directory);
    if (parent === directory) return candidate;
    directory = parent;
    candidate = resolve(directory, 'scripts/lite/policy-check.sh');
  }
  return candidate;
}

function findWorkspaceRoot(startDirectory: string): string {
  let directory = resolve(startDirectory);
  let policyFile = resolve(directory, '.forgewright/execution-policy.yaml');
  while (!existsSync(policyFile)) {
    const parent = dirname(directory);
    if (parent === directory) return resolve(startDirectory);
    directory = parent;
    policyFile = resolve(directory, '.forgewright/execution-policy.yaml');
  }
  return directory;
}

function defaultScriptPath(workspaceRoot: string): string {
  const configuredRoot = process.env.FORGEWRIGHT_DIR;
  if (configuredRoot) {
    const configuredScript = resolve(configuredRoot, 'scripts/lite/policy-check.sh');
    if (existsSync(configuredScript)) return configuredScript;
  }
  const workspaceScript = findPolicyScript(workspaceRoot);
  if (existsSync(workspaceScript)) return workspaceScript;
  return findPolicyScript(process.cwd());
}

export class ProcessPolicyEvaluator implements PolicyEvaluator {
  private readonly cwd: string;
  private readonly scriptPath: string;
  private readonly policyFile: string;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(options: ProcessPolicyEvaluatorOptions = {}) {
    this.cwd = process.env.FORGEWRIGHT_WORKSPACE
      ? resolve(process.env.FORGEWRIGHT_WORKSPACE)
      : findWorkspaceRoot(options.cwd ?? process.cwd());
    this.scriptPath = options.scriptPath ?? defaultScriptPath(this.cwd);
    this.policyFile = resolve(
      options.policyFile ??
        (process.env.FORGEWRIGHT_POLICY_FILE ||
          resolve(this.cwd, '.forgewright/execution-policy.yaml')),
    );
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  }

  evaluate(toolName: string, arguments_: Record<string, unknown>): Promise<PolicyEvaluation> {
    return new Promise((resolveEvaluation) => {
      const child = spawn(
        'bash',
        [this.scriptPath, 'check', toolName, serializePolicyArguments(arguments_)],
        {
          cwd: this.cwd,
          env: { ...process.env, FORGEWRIGHT_POLICY_FILE: this.policyFile },
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      let outputBytes = 0;
      let settled = false;

      const finish = (evaluation: PolicyEvaluation) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveEvaluation(evaluation);
      };
      const append = (chunk: Buffer) => {
        outputBytes += chunk.byteLength;
        if (outputBytes > this.maxOutputBytes) {
          child.kill('SIGKILL');
          finish({
            action: 'config-error',
            reason: `Execution policy output limit exceeded (${this.maxOutputBytes} bytes).`,
          });
          return;
        }
        output += chunk.toString('utf8');
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish({
          action: 'config-error',
          reason: `Execution policy timed out after ${this.timeoutMs}ms.`,
        });
      }, this.timeoutMs);

      child.stdout.on('data', append);
      child.stderr.on('data', append);
      child.on('error', (error) => {
        finish({
          action: 'config-error',
          reason: `Execution policy failed to start: ${error.message}`,
        });
      });
      child.on('close', (code, signal) => {
        if (settled) return;
        const reason = cleanOutput(output);
        if (signal) {
          finish({
            action: 'config-error',
            reason: `Execution policy terminated by ${signal}${reason ? `: ${reason}` : '.'}`,
          });
          return;
        }
        if (
          isConfigurationError(reason) ||
          (code === 0 && /policy file .*not found.*bootstrap mode/i.test(reason))
        ) {
          finish({ action: 'config-error', reason: reason || 'Execution policy file is missing.' });
          return;
        }
        const action: PolicyAction =
          code === 0 ? 'allow' : code === 1 ? 'block' : code === 2 ? 'warn' : 'config-error';
        finish({
          action,
          reason:
            reason ||
            (action === 'config-error'
              ? `Execution policy exited with unsupported code ${String(code)}.`
              : undefined),
        });
      });
    });
  }
}

export class GuardrailMiddleware {
  constructor(private readonly evaluator?: PolicyEvaluator) {}

  async beforeTool(
    toolName: string,
    arguments_: Record<string, unknown>,
  ): Promise<PolicyEvaluation> {
    if (!this.evaluator) return { action: 'allow' };
    try {
      return await this.evaluator.evaluate(toolName, arguments_);
    } catch (error) {
      return {
        action: 'config-error',
        reason: `Execution policy evaluator failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
