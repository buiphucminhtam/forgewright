import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { emitRpcEvent } from './rpc-client.js';
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
let _forgewrightRoot = null;
let _workspaceRoot = null;
function _getForgewrightRoot() {
    if (!_forgewrightRoot) {
        // Walk up from __dirname until we find package.json (MCP root)
        let dir = __dirname;
        for (let i = 0; i < 10; i++) {
            if (fs.existsSync(path.join(dir, 'package.json'))) {
                _forgewrightRoot = path.dirname(dir);
                return _forgewrightRoot;
            }
            const parent = path.dirname(dir);
            if (parent === dir)
                break;
            dir = parent;
        }
        _forgewrightRoot = path.resolve(FORGEWRIGHT_ROOT);
    }
    return _forgewrightRoot;
}
// ─── Workspace Detection ────────────────────────────────────────────
// The workspace is where the agent is currently running (Cursor project)
export function getForgewrightRoot() {
    return _getForgewrightRoot();
}
/**
 * Check if a path contains unresolved IDE template variables like ${workspaceFolder}.
 * These are Cursor-specific and are NOT resolved by other IDEs (e.g., Antigravity, Codex).
 * Returns true if the path is safe to use, false if it contains unresolved variables.
 */
export function _isResolvedPath(p) {
    if (!p)
        return false;
    // Detect unresolved ${...} template variables
    if (/\$\{[^}]+\}/.test(p)) {
        console.error(`[Forgewright Global MCP] Warning: Skipping unresolved template variable in path: "${p}"`);
        return false;
    }
    return true;
}
export function setWorkspaceRoot() {
    if (_workspaceRoot)
        return; // already set
    // Try environment variables first (set by Cursor when calling MCP)
    // Filter out unresolved template variables (e.g., literal "${workspaceFolder}")
    const candidates = [
        process.env.FORGEWRIGHT_WORKSPACE,
        process.env.CURSOR_WORKSPACE_ROOT,
        process.env.CLASSD_WORKSPACE_ROOT,
        process.env.AGENTS_WORKSPACE,
    ];
    let ws = candidates.find(_isResolvedPath) || undefined;
    if (!ws) {
        // Fallback: check if .forgewright exists in cwd
        const candidate = path.join(process.cwd(), '.forgewright');
        if (fs.existsSync(candidate)) {
            ws = process.cwd();
        }
    }
    if (!ws) {
        // Last resort: use FORGEWRIGHT_ROOT itself (dev mode)
        console.error(`[Forgewright Global MCP] Warning: Could not detect workspace. Using FORGEWRIGHT_ROOT.`);
        console.error(`[Forgewright Global MCP] Set FORGEWRIGHT_WORKSPACE or CURSOR_WORKSPACE_ROOT env var for multi-project support.`);
        ws = _getForgewrightRoot();
    }
    _workspaceRoot = path.resolve(ws);
    process.chdir(_workspaceRoot);
    console.error(`[Forgewright Global MCP] Workspace: ${_workspaceRoot}`);
}
export function getWorkspaceRoot() {
    if (!_workspaceRoot) {
        setWorkspaceRoot();
    }
    return _workspaceRoot;
}
export const PIPELINE_PHASES = [
    'Phase 0: Project Initiation & Mode Selection',
    'Phase 1: Research & Discovery (PM/BA/Architect)',
    'Phase 2: Execution (BE/FE/Engine Engineers)',
    'Phase 3: QA & Hardening',
    'Phase 4: Release & Deployment',
];
export const PHASE_KEYS = ['interpret', 'define', 'build', 'harden', 'ship'];
export function initializeDefaultPhases(currentPhaseIndex, currentStatus) {
    return PHASE_KEYS.map((key, index) => {
        let status = 'not_started';
        let progress = 0;
        let startedAt = null;
        let endedAt = null;
        if (index < currentPhaseIndex) {
            status = 'passed';
            progress = 1.0;
            endedAt = new Date().toISOString();
        }
        else if (index === currentPhaseIndex) {
            status =
                currentStatus === 'FAILED'
                    ? 'failed'
                    : currentStatus === 'WAITING_FOR_GATE'
                        ? 'waiting_review'
                        : currentStatus === 'IDLE'
                            ? 'not_started'
                            : 'running';
            progress = 0.0;
            if (currentStatus !== 'IDLE') {
                startedAt = new Date().toISOString();
            }
        }
        return { key, status, progress, startedAt, endedAt };
    });
}
export function resetWorkspaceRoot() {
    _workspaceRoot = null;
}
export { DEFAULT_STATE };
const DEFAULT_STATE = {
    currentPhase: 0,
    currentMode: null,
    history: [],
    status: 'IDLE',
    activeAction: null,
    phaseProgress: null,
    selfHealing: null,
    qualityGate: null,
    phases: initializeDefaultPhases(0, 'IDLE'),
};
function ensureDirSync(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}
function getStateFile() {
    const wsRoot = getWorkspaceRoot();
    const fwDir = path.join(wsRoot, '.forgewright');
    ensureDirSync(fwDir);
    return path.join(fwDir, 'pipeline-state.json');
}
export function getState() {
    const stateFile = getStateFile();
    if (!fs.existsSync(stateFile)) {
        saveState(DEFAULT_STATE);
        return DEFAULT_STATE;
    }
    try {
        const raw = fs.readFileSync(stateFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed.currentPhase !== 'number' ||
            !Array.isArray(parsed.history) ||
            !['IDLE', 'IN_PROGRESS', 'WAITING_FOR_GATE', 'COMPLETED', 'FAILED'].includes(parsed.status)) {
            console.error('State has invalid shape, returning default');
            return DEFAULT_STATE;
        }
        // Backward compatibility: initialize new fields if they are missing
        if (parsed.activeAction === undefined)
            parsed.activeAction = null;
        if (parsed.phaseProgress === undefined)
            parsed.phaseProgress = null;
        if (parsed.selfHealing === undefined)
            parsed.selfHealing = null;
        if (parsed.qualityGate === undefined)
            parsed.qualityGate = null;
        if (!parsed.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) {
            parsed.phases = initializeDefaultPhases(parsed.currentPhase, parsed.status);
        }
        return parsed;
    }
    catch (e) {
        console.error('Failed to read state, returning default', e);
        return DEFAULT_STATE;
    }
}
function emitOscEvent(state) {
    try {
        const payload = {
            ...state,
            history: undefined, // Strip history to optimize payload size
        };
        const jsonStr = JSON.stringify(payload);
        const base64 = Buffer.from(jsonStr).toString('base64');
        process.stdout.write(`\u001b]777;status;${base64}\u0007\n`);
    }
    catch (e) {
        console.error('Failed to emit OSC event:', e);
    }
}
export function saveState(state) {
    const stateFile = getStateFile();
    const tempFile = stateFile + '.tmp';
    try {
        fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
        fs.renameSync(tempFile, stateFile);
        emitOscEvent(state);
        emitRpcEvent('PIPELINE_STATE_UPDATE', state);
    }
    catch (e) {
        if (fs.existsSync(tempFile)) {
            try {
                fs.unlinkSync(tempFile);
            }
            catch (err) {
                // ignore to preserve original exception
            }
        }
        throw e;
    }
}
export function startPipeline(mode) {
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
    // Initialize the phases (Requirement 2.1)
    state.phases = initializeDefaultPhases(1, 'IN_PROGRESS');
    saveState(state);
    return `Successfully started pipeline in ${mode} mode. You are now at Phase 1: Research & Discovery. Follow the Forgewright orchestrator instructions.`;
}
export function advancePhase() {
    const state = getState();
    if (state.status === 'WAITING_FOR_GATE') {
        return `Error: You cannot advance the phase yet. The current phase is frozen pending human-in-the-loop (HITL) gate approval.`;
    }
    const now = new Date().toISOString();
    // Mark the current phase in phases as 'passed', update endedAt = now, and set progress = 1.0 (Requirement 2.2)
    const currentPhaseKey = PHASE_KEYS[state.currentPhase];
    const currentPhaseState = state.phases.find((p) => p.key === currentPhaseKey);
    if (currentPhaseState) {
        currentPhaseState.status = 'passed';
        currentPhaseState.endedAt = now;
        currentPhaseState.progress = 1.0;
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
    // Mark the new currentPhase in phases as 'running', set startedAt = now, and progress = 0.0 (Requirement 2.2)
    const newPhaseKey = PHASE_KEYS[state.currentPhase];
    const newPhaseState = state.phases.find((p) => p.key === newPhaseKey);
    if (newPhaseState) {
        newPhaseState.status = 'running';
        newPhaseState.startedAt = now;
        newPhaseState.progress = 0.0;
    }
    saveState(state);
    return `Successfully advanced to ${phaseName}. Check the Forgewright instructions for roles required in this phase.`;
}
export function requestGateApproval(message, qualityGate) {
    const state = getState();
    state.status = 'WAITING_FOR_GATE';
    state.history.push(`Requested Gate Approval: ${message}`);
    state.qualityGate = qualityGate || null;
    // Mark current phase in phases as 'waiting_review' (Requirement 2.3)
    const currentPhaseKey = PHASE_KEYS[state.currentPhase];
    const currentPhaseState = state.phases.find((p) => p.key === currentPhaseKey);
    if (currentPhaseState) {
        currentPhaseState.status = 'waiting_review';
    }
    saveState(state);
    return `System is now locked. Ask the user for explicit approval to pass the gate: "${message}".`;
}
export function approveGate() {
    const state = getState();
    if (state.status !== 'WAITING_FOR_GATE') {
        return 'Error: System is not waiting for any gate approval.';
    }
    state.status = 'IN_PROGRESS';
    state.history.push('Gate approved by user.');
    state.qualityGate = null; // Clear quality gate info after approval
    // Mark current phase back to 'running'
    const currentPhaseKey = PHASE_KEYS[state.currentPhase];
    const currentPhaseState = state.phases.find((p) => p.key === currentPhaseKey);
    if (currentPhaseState) {
        currentPhaseState.status = 'running';
    }
    saveState(state);
    return 'Gate successfully approved. Proceed to next step or advance phase.';
}
export function updateSubTask(activeAction, phaseProgress) {
    const state = getState();
    state.activeAction = activeAction;
    state.phaseProgress = phaseProgress;
    // Synchronize to the current active phase
    const currentPhaseKey = PHASE_KEYS[state.currentPhase];
    const currentPhaseState = state.phases.find((p) => p.key === currentPhaseKey);
    if (currentPhaseState) {
        if (activeAction !== undefined)
            currentPhaseState.activeAction = activeAction;
        if (phaseProgress !== null && phaseProgress !== undefined) {
            currentPhaseState.progress = phaseProgress;
        }
    }
    saveState(state);
}
export function updateSelfHealing(selfHealing) {
    const state = getState();
    state.selfHealing = selfHealing;
    saveState(state);
}
export function failPipeline(reason) {
    const state = getState();
    state.status = 'FAILED';
    const entry = reason ? `Pipeline failed: ${reason}` : 'Pipeline failed.';
    state.history.push(entry);
    state.activeAction = null;
    state.phaseProgress = null;
    state.selfHealing = null;
    state.qualityGate = null;
    // Mark current phase in phases as 'failed' and set errorSummary = reason (Requirement 2.4)
    const currentPhaseKey = PHASE_KEYS[state.currentPhase];
    const currentPhaseState = state.phases.find((p) => p.key === currentPhaseKey);
    if (currentPhaseState) {
        currentPhaseState.status = 'failed';
        currentPhaseState.errorSummary = reason || 'Unknown failure';
    }
    saveState(state);
    return `Pipeline status updated to FAILED.`;
}
export function logTokenUsage(entry) {
    const wsRoot = getWorkspaceRoot();
    const folderName = path.basename(wsRoot);
    const usageDir = path.join(os.homedir(), '.forgewright', 'usage', folderName);
    ensureDirSync(usageDir);
    const logFile = path.join(usageDir, 'usage.log');
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
    emitRpcEvent('COST_UPDATE', entry);
}
