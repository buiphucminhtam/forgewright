import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { StateError, ErrorCode, getErrorMessage } from '../errors.js'

// ─── Forgewright Root Detection ──────────────────────────────────────
// Resolved once at module load. Supports override via FORGEWRIGHT_ROOT env var.

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const MCP_BUILD_DIR = __dirname // FORGEWRIGHT/mcp/build
const MCP_ROOT_DIR = path.dirname(MCP_BUILD_DIR) // FORGEWRIGHT/mcp
const DEFAULT_FORGEWRIGHT_ROOT = path.dirname(MCP_ROOT_DIR) // FORGEWRIGHT

let _forgewrightRoot: string | null = null
let _workspaceRoot: string | null = null

function _getForgewrightRoot(): string {
  if (!_forgewrightRoot) {
    // Env var takes priority (useful for testing / custom deployments)
    _forgewrightRoot = process.env.FORGEWRIGHT_ROOT
      ? path.resolve(process.env.FORGEWRIGHT_ROOT)
      : path.resolve(DEFAULT_FORGEWRIGHT_ROOT)
  }
  return _forgewrightRoot
}

// ─── Workspace Detection ────────────────────────────────────────────

export function getForgewrightRoot(): string {
  return _getForgewrightRoot()
}

export function setWorkspaceRoot(): void {
  if (_workspaceRoot) return

  const ws =
    process.env.CURSOR_WORKSPACE_ROOT ||
    process.env.CLASSD_WORKSPACE_ROOT ||
    process.env.AGENTS_WORKSPACE

  let resolved = ws
  if (!resolved) {
    const candidate = path.join(process.cwd(), '.forgewright')
    if (fs.existsSync(candidate)) {
      resolved = process.cwd()
    }
  }

  if (!resolved) {
    resolved = _getForgewrightRoot()
    console.error(
      `[Forgewright Global MCP] Warning: Could not detect workspace. Using FORGEWRIGHT_ROOT.`,
    )
    console.error(
      `[Forgewright Global MCP] Set CURSOR_WORKSPACE_ROOT env var for multi-project support.`,
    )
  }

  _workspaceRoot = path.resolve(resolved)
  process.chdir(_workspaceRoot)
  console.error(`[Forgewright Global MCP] Workspace: ${_workspaceRoot}`)
}

export function getWorkspaceRoot(): string {
  if (!_workspaceRoot) {
    setWorkspaceRoot()
  }
  return _workspaceRoot!
}

export function resetWorkspaceRoot(): void {
  _workspaceRoot = null
}

// ─── Pipeline State ────────────────────────────────────────────────

export interface PipelineState {
  currentPhase: number
  currentMode: string | null
  history: string[]
  status: 'IDLE' | 'IN_PROGRESS' | 'WAITING_FOR_GATE' | 'COMPLETED'
}

export const PIPELINE_PHASES = [
  'Phase 0: Project Initiation & Mode Selection',
  'Phase 1: Research & Discovery (PM/BA/Architect)',
  'Phase 2: Execution (BE/FE/Engine Engineers)',
  'Phase 3: QA & Hardening',
  'Phase 4: Release & Deployment',
] as const

export const DEFAULT_STATE: PipelineState = {
  currentPhase: 0,
  currentMode: null,
  history: [],
  status: 'IDLE',
}

function ensureDirSync(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function getStateFile(): string {
  const wsRoot = getWorkspaceRoot()
  const fwDir = path.join(wsRoot, '.forgewright')
  ensureDirSync(fwDir)
  return path.join(fwDir, 'pipeline-state.json')
}

/**
 * Reads and parses the pipeline state from disk.
 * Returns DEFAULT_STATE if the file does not exist or is corrupted.
 */
export function getState(): PipelineState {
  const stateFile = getStateFile()
  if (!fs.existsSync(stateFile)) {
    saveState(DEFAULT_STATE)
    return DEFAULT_STATE
  }
  try {
    const raw = fs.readFileSync(stateFile, 'utf-8')
    const parsed = JSON.parse(raw) as PipelineState
    // Validate required fields
    if (
      typeof parsed.currentPhase !== 'number' ||
      !Array.isArray(parsed.history) ||
      !['IDLE', 'IN_PROGRESS', 'WAITING_FOR_GATE', 'COMPLETED'].includes(parsed.status)
    ) {
      console.error(
        '[Forgewright Global MCP] State file has invalid shape, returning default:',
        stateFile,
      )
      return DEFAULT_STATE
    }
    return parsed
  } catch (e: unknown) {
    const msg = getErrorMessage(e)
    console.error(`[Forgewright Global MCP] Failed to read state (${msg}), returning default`)
    return DEFAULT_STATE
  }
}

/**
 * Atomically saves state using a temp-file + rename pattern.
 * This prevents corruption from concurrent writes.
 */
export function saveState(state: PipelineState): void {
  const stateFile = getStateFile()
  try {
    const tmpFile = `${stateFile}.tmp.${process.pid}`
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8')
    fs.renameSync(tmpFile, stateFile)
  } catch (e: unknown) {
    const msg = getErrorMessage(e)
    throw new StateError(ErrorCode.STATE_SAVE_ERROR, `Failed to save state: ${msg}`, {
      stateFile,
      cause: msg,
    })
  }
}

export function startPipeline(mode: string): string {
  const state = getState()
  state.currentPhase = 1
  state.currentMode = mode
  state.status = 'IN_PROGRESS'
  state.history.push(`Started pipeline in mode: ${mode}`)
  saveState(state)

  return `Successfully started pipeline in ${mode} mode. You are now at Phase 1: Research & Discovery. Follow the Forgewright orchestrator instructions.`
}

export function advancePhase(): string {
  const state = getState()
  if (state.status === 'WAITING_FOR_GATE') {
    return `Error: You cannot advance the phase yet. The current phase is frozen pending human-in-the-loop (HITL) gate approval.`
  }

  if (state.currentPhase >= PIPELINE_PHASES.length - 1) {
    state.status = 'COMPLETED'
    state.history.push(`Pipeline completed.`)
    saveState(state)
    return `Success: Pipeline is now Fully Completed.`
  }

  state.currentPhase += 1
  const phaseName = PIPELINE_PHASES[state.currentPhase]
  state.history.push(`Advanced to ${phaseName}`)
  saveState(state)

  return `Successfully advanced to ${phaseName}. Check the Forgewright instructions for roles required in this phase.`
}

export function requestGateApproval(message: string): string {
  const state = getState()
  state.status = 'WAITING_FOR_GATE'
  state.history.push(`Requested Gate Approval: ${message}`)
  saveState(state)

  return `System is now locked. Ask the user for explicit approval to pass the gate: "${message}".`
}

export function approveGate(): string {
  const state = getState()
  if (state.status !== 'WAITING_FOR_GATE') {
    return 'Error: System is not waiting for any gate approval.'
  }
  state.status = 'IN_PROGRESS'
  state.history.push('Gate approved by user.')
  saveState(state)
  return 'Gate successfully approved. Proceed to next step or advance phase.'
}
