import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// ─── Forgewright Root Detection ──────────────────────────────────────
// Compiled entry: FORGEWRIGHT/mcp/build/index.js
// __dirname at runtime: FORGEWRIGHT/mcp/build
// Navigate up 2 levels to get FORGEWRIGHT

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MCP_BUILD_DIR = __dirname; // FORGEWRIGHT/mcp/build
const MCP_ROOT_DIR = path.dirname(MCP_BUILD_DIR); // FORGEWRIGHT/mcp
const FORGEWRIGHT_ROOT = path.dirname(MCP_ROOT_DIR); // FORGEWRIGHT

// Always use absolute, pre-computed path (never recalculate after chdir)
let _forgewrightRoot: string | null = null;
let _workspaceRoot: string | null = null;

function _getForgewrightRoot(): string {
  if (!_forgewrightRoot) {
    // Walk up from __dirname until we find package.json (MCP root)
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        _forgewrightRoot = path.dirname(dir);
        return _forgewrightRoot;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    _forgewrightRoot = path.resolve(FORGEWRIGHT_ROOT);
  }
  return _forgewrightRoot;
}

// ─── Workspace Detection ────────────────────────────────────────────
// The workspace is where the agent is currently running (Cursor project)

export function getForgewrightRoot(): string {
  return _getForgewrightRoot();
}

export function setWorkspaceRoot(): void {
  if (_workspaceRoot) return; // already set

  // Try environment variables first (set by Cursor when calling MCP)
  let ws =
    process.env.FORGEWRIGHT_WORKSPACE ||
    process.env.CURSOR_WORKSPACE_ROOT ||
    process.env.CLASSD_WORKSPACE_ROOT ||
    process.env.AGENTS_WORKSPACE;

  if (!ws) {
    // Fallback: check if .forgewright exists in cwd
    const candidate = path.join(process.cwd(), '.forgewright');
    if (fs.existsSync(candidate)) {
      ws = process.cwd();
    }
  }

  if (!ws) {
    // Last resort: use FORGEWRIGHT_ROOT itself (dev mode)
    console.error(
      `[Forgewright Global MCP] Warning: Could not detect workspace. Using FORGEWRIGHT_ROOT.`,
    );
    console.error(
      `[Forgewright Global MCP] Set FORGEWRIGHT_WORKSPACE or CURSOR_WORKSPACE_ROOT env var for multi-project support.`,
    );
    ws = _getForgewrightRoot();
  }

  _workspaceRoot = path.resolve(ws);
  process.chdir(_workspaceRoot);
  console.error(`[Forgewright Global MCP] Workspace: ${_workspaceRoot}`);
}

export function getWorkspaceRoot(): string {
  if (!_workspaceRoot) {
    setWorkspaceRoot();
  }
  return _workspaceRoot!;
}

// ─── Pipeline State ────────────────────────────────────────────────

export interface SelfHealingState {
  isHealing: boolean;
  currentAttempt: number;
  maxAttempts: number;
  lastError?: string;
}

export interface FailedCriterion {
  name: string;
  score: number;
  reason: string;
}

export interface QualityGateState {
  score: number;
  threshold: number;
  failedCriteria: FailedCriterion[];
}

export interface PipelineState {
  currentPhase: number;
  currentMode: string | null;
  status: 'IDLE' | 'IN_PROGRESS' | 'WAITING_FOR_GATE' | 'COMPLETED' | 'FAILED';
  history: string[];
  activeAction?: string | null;
  phaseProgress?: number | null;
  selfHealing?: SelfHealingState | null;
  qualityGate?: QualityGateState | null;
}

export const PIPELINE_PHASES = [
  'Phase 0: Project Initiation & Mode Selection',
  'Phase 1: Research & Discovery (PM/BA/Architect)',
  'Phase 2: Execution (BE/FE/Engine Engineers)',
  'Phase 3: QA & Hardening',
  'Phase 4: Release & Deployment',
];

export function resetWorkspaceRoot(): void {
  _workspaceRoot = null;
}

export { DEFAULT_STATE };

const DEFAULT_STATE: PipelineState = {
  currentPhase: 0,
  currentMode: null,
  history: [],
  status: 'IDLE',
  activeAction: null,
  phaseProgress: null,
  selfHealing: null,
  qualityGate: null,
};

function ensureDirSync(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getStateFile(): string {
  const wsRoot = getWorkspaceRoot();
  const fwDir = path.join(wsRoot, '.forgewright');
  ensureDirSync(fwDir);
  return path.join(fwDir, 'pipeline-state.json');
}

export function getState(): PipelineState {
  const stateFile = getStateFile();
  if (!fs.existsSync(stateFile)) {
    saveState(DEFAULT_STATE);
    return DEFAULT_STATE;
  }
  try {
    const raw = fs.readFileSync(stateFile, 'utf-8');
    const parsed = JSON.parse(raw) as PipelineState;
    if (
      typeof parsed.currentPhase !== 'number' ||
      !Array.isArray(parsed.history) ||
      !['IDLE', 'IN_PROGRESS', 'WAITING_FOR_GATE', 'COMPLETED', 'FAILED'].includes(parsed.status)
    ) {
      console.error('State has invalid shape, returning default');
      return DEFAULT_STATE;
    }
    // Backward compatibility: initialize new fields if they are missing
    if (parsed.activeAction === undefined) parsed.activeAction = null;
    if (parsed.phaseProgress === undefined) parsed.phaseProgress = null;
    if (parsed.selfHealing === undefined) parsed.selfHealing = null;
    if (parsed.qualityGate === undefined) parsed.qualityGate = null;
    return parsed;
  } catch (e) {
    console.error('Failed to read state, returning default', e);
    return DEFAULT_STATE;
  }
}

export function saveState(state: PipelineState) {
  const stateFile = getStateFile();
  const tempFile = stateFile + '.tmp';
  try {
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempFile, stateFile);
  } catch (e) {
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch (err) {
        // ignore to preserve original exception
      }
    }
    throw e;
  }
}

export function startPipeline(mode: string): string {
  const state = getState();
  state.currentPhase = 1;
  state.currentMode = mode;
  state.status = 'IN_PROGRESS';
  state.history.push(`Started pipeline in mode: ${mode}`);
  // Clear any existing sub-task, self-healing, quality-gate details
  state.activeAction = null;
  state.phaseProgress = null;
  state.selfHealing = null;
  state.qualityGate = null;
  saveState(state);

  return `Successfully started pipeline in ${mode} mode. You are now at Phase 1: Research & Discovery. Follow the Forgewright orchestrator instructions.`;
}

export function advancePhase(): string {
  const state = getState();
  if (state.status === 'WAITING_FOR_GATE') {
    return `Error: You cannot advance the phase yet. The current phase is frozen pending human-in-the-loop (HITL) gate approval.`;
  }

  if (state.currentPhase >= PIPELINE_PHASES.length - 1) {
    state.status = 'COMPLETED';
    state.history.push(`Pipeline completed.`);
    state.activeAction = null;
    state.phaseProgress = null;
    state.selfHealing = null;
    state.qualityGate = null;
    saveState(state);
    return `Success: Pipeline is now Fully Completed.`;
  }

  state.currentPhase += 1;
  const phaseName = PIPELINE_PHASES[state.currentPhase];
  state.status = 'IN_PROGRESS'; // Set status to IN_PROGRESS on phase transition (Requirement 3.1)
  state.history.push(`Advanced to ${phaseName}`);
  // Reset sub-task details, self-healing, and quality-gate when beginning a new phase
  state.activeAction = null;
  state.phaseProgress = null;
  state.selfHealing = null;
  state.qualityGate = null;
  saveState(state);

  return `Successfully advanced to ${phaseName}. Check the Forgewright instructions for roles required in this phase.`;
}

export function requestGateApproval(
  message: string,
  qualityGate?: QualityGateState | null,
): string {
  const state = getState();
  state.status = 'WAITING_FOR_GATE';
  state.history.push(`Requested Gate Approval: ${message}`);
  state.qualityGate = qualityGate || null;
  saveState(state);

  return `System is now locked. Ask the user for explicit approval to pass the gate: "${message}".`;
}

export function approveGate(): string {
  const state = getState();
  if (state.status !== 'WAITING_FOR_GATE') {
    return 'Error: System is not waiting for any gate approval.';
  }
  state.status = 'IN_PROGRESS';
  state.history.push('Gate approved by user.');
  state.qualityGate = null; // Clear quality gate info after approval
  saveState(state);
  return 'Gate successfully approved. Proceed to next step or advance phase.';
}

export function updateSubTask(activeAction: string | null, phaseProgress: number | null): void {
  const state = getState();
  state.activeAction = activeAction;
  state.phaseProgress = phaseProgress;
  saveState(state);
}

export function updateSelfHealing(selfHealing: SelfHealingState | null): void {
  const state = getState();
  state.selfHealing = selfHealing;
  saveState(state);
}

export function failPipeline(reason?: string): string {
  const state = getState();
  state.status = 'FAILED';
  const entry = reason ? `Pipeline failed: ${reason}` : 'Pipeline failed.';
  state.history.push(entry);
  state.activeAction = null;
  state.phaseProgress = null;
  state.selfHealing = null;
  state.qualityGate = null;
  saveState(state);
  return `Pipeline status updated to FAILED.`;
}

export interface TokenUsageEntry {
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  cost?: number | null;
  timestamp: string;
  skill: string;
}

export function logTokenUsage(entry: TokenUsageEntry): void {
  const wsRoot = getWorkspaceRoot();
  const folderName = path.basename(wsRoot);
  const usageDir = path.join(os.homedir(), '.forgewright', 'usage', folderName);
  ensureDirSync(usageDir);
  const logFile = path.join(usageDir, 'usage.log');
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
}
