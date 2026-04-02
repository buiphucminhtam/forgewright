import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
export function setWorkspaceRoot() {
    if (_workspaceRoot)
        return; // already set
    // Try environment variables first (set by Cursor when calling MCP)
    let ws = process.env.CURSOR_WORKSPACE_ROOT ||
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
        console.error(`[Forgewright Global MCP] Warning: Could not detect workspace. Using FORGEWRIGHT_ROOT.`);
        console.error(`[Forgewright Global MCP] Set CURSOR_WORKSPACE_ROOT env var for multi-project support.`);
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
export function resetWorkspaceRoot() {
    _workspaceRoot = null;
}
export { DEFAULT_STATE };
const DEFAULT_STATE = {
    currentPhase: 0,
    currentMode: null,
    history: [],
    status: 'IDLE',
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
            !['IDLE', 'IN_PROGRESS', 'WAITING_FOR_GATE', 'COMPLETED'].includes(parsed.status)) {
            console.error('State has invalid shape, returning default');
            return DEFAULT_STATE;
        }
        return parsed;
    }
    catch (e) {
        console.error('Failed to read state, returning default', e);
        return DEFAULT_STATE;
    }
}
export function saveState(state) {
    const stateFile = getStateFile();
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}
export function startPipeline(mode) {
    const state = getState();
    state.currentPhase = 1;
    state.currentMode = mode;
    state.status = 'IN_PROGRESS';
    state.history.push(`Started pipeline in mode: ${mode}`);
    saveState(state);
    return `Successfully started pipeline in ${mode} mode. You are now at Phase 1: Research & Discovery. Follow the Forgewright orchestrator instructions.`;
}
export function advancePhase() {
    const state = getState();
    if (state.status === 'WAITING_FOR_GATE') {
        return `Error: You cannot advance the phase yet. The current phase is frozen pending human-in-the-loop (HITL) gate approval.`;
    }
    if (state.currentPhase >= PIPELINE_PHASES.length - 1) {
        state.status = 'COMPLETED';
        state.history.push(`Pipeline completed.`);
        saveState(state);
        return `Success: Pipeline is now Fully Completed.`;
    }
    state.currentPhase += 1;
    const phaseName = PIPELINE_PHASES[state.currentPhase];
    state.history.push(`Advanced to ${phaseName}`);
    saveState(state);
    return `Successfully advanced to ${phaseName}. Check the Forgewright instructions for roles required in this phase.`;
}
export function requestGateApproval(message) {
    const state = getState();
    state.status = 'WAITING_FOR_GATE';
    state.history.push(`Requested Gate Approval: ${message}`);
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
    saveState(state);
    return 'Gate successfully approved. Proceed to next step or advance phase.';
}
