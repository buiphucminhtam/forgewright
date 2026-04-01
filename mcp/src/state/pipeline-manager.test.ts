import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// ─── Helpers ─────────────────────────────────────────────────────────

async function withWorkspace<T>(rootVar: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-pm-'))
  const fwDir = path.join(dir, '.forgewright')
  fs.mkdirSync(fwDir, { recursive: true })

  const prevForgewrightRoot = process.env.FORGEWRIGHT_ROOT
  const prevWorkspace = process.env[rootVar]
  const prevCwd = process.cwd()

  process.env.FORGEWRIGHT_ROOT = dir
  if (rootVar !== 'FORGEWRIGHT_ROOT') {
    process.env[rootVar] = dir
  }
  process.chdir(dir)
  vi.resetModules()

  try {
    return await fn(dir)
  } finally {
    process.chdir(prevCwd)
    fs.rmSync(dir, { recursive: true, force: true })
    if (prevForgewrightRoot !== undefined) {
      process.env.FORGEWRIGHT_ROOT = prevForgewrightRoot
    } else {
      delete process.env.FORGEWRIGHT_ROOT
    }
    if (prevWorkspace !== undefined) {
      process.env[rootVar] = prevWorkspace
    } else {
      delete process.env[rootVar]
    }
    vi.resetModules()
  }
}

function writeState(wsDir: string, state: object) {
  fs.writeFileSync(path.join(wsDir, '.forgewright', 'pipeline-state.json'), JSON.stringify(state))
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('PIPELINE_PHASES', async () => {
  const { PIPELINE_PHASES } = await import('./pipeline-manager.js')

  it('should have exactly 5 phases', () => {
    expect(PIPELINE_PHASES).toHaveLength(5)
  })

  it('should have correct phase names', () => {
    expect(PIPELINE_PHASES[0]).toBe('Phase 0: Project Initiation & Mode Selection')
    expect(PIPELINE_PHASES[1]).toBe('Phase 1: Research & Discovery (PM/BA/Architect)')
    expect(PIPELINE_PHASES[2]).toBe('Phase 2: Execution (BE/FE/Engine Engineers)')
    expect(PIPELINE_PHASES[3]).toBe('Phase 3: QA & Hardening')
    expect(PIPELINE_PHASES[4]).toBe('Phase 4: Release & Deployment')
  })

  it('should have 5 elements matching phase numbers', () => {
    PIPELINE_PHASES.forEach((phase, i) => {
      expect(phase).toContain(`Phase ${i}`)
    })
  })
})

describe('DEFAULT_STATE', async () => {
  const { DEFAULT_STATE } = await import('./pipeline-manager.js')

  it('should have correct initial values', () => {
    expect(DEFAULT_STATE.currentPhase).toBe(0)
    expect(DEFAULT_STATE.currentMode).toBeNull()
    expect(DEFAULT_STATE.history).toEqual([])
    expect(DEFAULT_STATE.status).toBe('IDLE')
  })
})

describe('getForgewrightRoot', () => {
  it('should resolve FORGEWRIGHT_ROOT from env var', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async (dir) => {
      process.env.FORGEWRIGHT_ROOT = dir
      vi.resetModules()
      const { getForgewrightRoot } = await import('./pipeline-manager.js')
      expect(getForgewrightRoot()).toBe(dir)
    })
  })
})

describe('getState / saveState', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('should create DEFAULT_STATE when no state file exists', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async (dir) => {
      vi.resetModules()
      const { getState, DEFAULT_STATE } = await import('./pipeline-manager.js')

      const state = getState()
      expect(state).toEqual(DEFAULT_STATE)

      // Verify the file was created
      const stateFile = path.join(dir, '.forgewright', 'pipeline-state.json')
      expect(fs.existsSync(stateFile)).toBe(true)
    })
  })

  it('should save and read state atomically', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async () => {
      vi.resetModules()
      const { saveState, getState } = await import('./pipeline-manager.js')

      const newState = {
        currentPhase: 2,
        currentMode: 'Feature',
        history: ['Started', 'Advanced'],
        status: 'IN_PROGRESS' as const,
      }

      saveState(newState)
      const read = getState()

      expect(read.currentPhase).toBe(2)
      expect(read.currentMode).toBe('Feature')
      expect(read.history).toEqual(['Started', 'Advanced'])
      expect(read.status).toBe('IN_PROGRESS')
    })
  })

  it('should validate state shape and return default if invalid', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async (dir) => {
      vi.resetModules()
      writeState(dir, {
        currentPhase: 'not-a-number',
        history: 'not-an-array',
        status: 'INVALID',
      })

      const { getState, DEFAULT_STATE } = await import('./pipeline-manager.js')
      const state = getState()
      expect(state).toEqual(DEFAULT_STATE)
    })
  })

  it('should handle JSON parse errors gracefully', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async (dir) => {
      vi.resetModules()
      fs.writeFileSync(path.join(dir, '.forgewright', 'pipeline-state.json'), 'not valid json {{{')

      const { getState, DEFAULT_STATE } = await import('./pipeline-manager.js')
      const state = getState()
      expect(state).toEqual(DEFAULT_STATE)
    })
  })

  it('should use atomic write — no temp files left behind', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async (dir) => {
      vi.resetModules()
      const { saveState } = await import('./pipeline-manager.js')

      saveState({ currentPhase: 0, currentMode: null, history: [], status: 'IDLE' as const })

      const fwDir = path.join(dir, '.forgewright')
      const files = fs.readdirSync(fwDir)
      const tempFiles = files.filter((f) => f.includes('.tmp'))
      expect(tempFiles).toHaveLength(0)
    })
  })
})

describe('startPipeline', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('should start pipeline with correct mode and phase', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async () => {
      vi.resetModules()
      const { startPipeline, getState } = await import('./pipeline-manager.js')

      const result = startPipeline('Full Build')

      expect(result).toContain('Full Build')
      expect(result).toContain('Phase 1')

      const state = getState()
      expect(state.currentMode).toBe('Full Build')
      expect(state.currentPhase).toBe(1)
      expect(state.status).toBe('IN_PROGRESS')
      expect(state.history).toContain('Started pipeline in mode: Full Build')
    })
  })

  it('should accept any mode string', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async () => {
      vi.resetModules()
      const { startPipeline, getState } = await import('./pipeline-manager.js')

      startPipeline('Mobile Test')

      const state = getState()
      expect(state.currentMode).toBe('Mobile Test')
    })
  })
})

describe('advancePhase', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('should advance from phase 1 to phase 2', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async () => {
      vi.resetModules()
      const { advancePhase, getState, startPipeline } = await import('./pipeline-manager.js')

      startPipeline('Full Build')
      const result = advancePhase()

      expect(result).toContain('Phase 2')
      const state = getState()
      expect(state.currentPhase).toBe(2)
    })
  })

  it('should block advancement when WAITING_FOR_GATE', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async () => {
      vi.resetModules()
      const { advancePhase, requestGateApproval } = await import('./pipeline-manager.js')

      requestGateApproval('BRD pending')
      const result = advancePhase()

      expect(result).toContain('frozen')
      expect(result).toContain('HITL')
    })
  })

  it('should complete pipeline when at last phase', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async (dir) => {
      vi.resetModules()
      writeState(dir, {
        currentPhase: 4,
        currentMode: 'Full Build',
        history: [],
        status: 'IN_PROGRESS',
      })

      const { advancePhase, getState } = await import('./pipeline-manager.js')
      const result = advancePhase()

      expect(result).toContain('Fully Completed')
      const state = getState()
      expect(state.status).toBe('COMPLETED')
    })
  })
})

describe('requestGateApproval', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('should set status to WAITING_FOR_GATE', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async () => {
      vi.resetModules()
      const { requestGateApproval, getState } = await import('./pipeline-manager.js')

      const result = requestGateApproval('GDD is ready')

      expect(result).toContain('locked')
      expect(result).toContain('GDD is ready')

      const state = getState()
      expect(state.status).toBe('WAITING_FOR_GATE')
      expect(state.history).toContain('Requested Gate Approval: GDD is ready')
    })
  })
})

describe('approveGate', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('should unlock gate and resume IN_PROGRESS', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async (dir) => {
      vi.resetModules()
      writeState(dir, {
        currentPhase: 1,
        currentMode: 'Full Build',
        history: ['Requested Gate Approval'],
        status: 'WAITING_FOR_GATE',
      })

      const { approveGate, getState } = await import('./pipeline-manager.js')
      const result = approveGate()

      expect(result).toContain('successfully approved')
      const state = getState()
      expect(state.status).toBe('IN_PROGRESS')
      expect(state.history).toContain('Gate approved by user.')
    })
  })

  it('should return error if not waiting for gate', async () => {
    await withWorkspace('FORGEWRIGHT_ROOT', async (dir) => {
      vi.resetModules()
      writeState(dir, {
        currentPhase: 1,
        currentMode: 'Full Build',
        history: [],
        status: 'IN_PROGRESS',
      })

      const { approveGate } = await import('./pipeline-manager.js')
      const result = approveGate()
      expect(result).toContain('Error')
      expect(result).toContain('not waiting')
    })
  })
})

describe('resetWorkspaceRoot', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('should allow workspace root to be reset and re-set', async () => {
    const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-pm-r1-'))
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-pm-r2-'))
    const prevCwd = process.cwd()

    try {
      fs.mkdirSync(path.join(dir1, '.forgewright'), { recursive: true })
      fs.mkdirSync(path.join(dir2, '.forgewright'), { recursive: true })

      process.chdir(dir1)
      process.env.CURSOR_WORKSPACE_ROOT = dir1
      vi.resetModules()

      const { setWorkspaceRoot, resetWorkspaceRoot, getWorkspaceRoot } =
        await import('./pipeline-manager.js')

      setWorkspaceRoot()
      const first = getWorkspaceRoot()

      resetWorkspaceRoot()
      process.env.CURSOR_WORKSPACE_ROOT = dir2
      setWorkspaceRoot()
      const second = getWorkspaceRoot()

      expect(second).not.toBe(first)
    } finally {
      process.chdir(prevCwd)
      fs.rmSync(dir1, { recursive: true, force: true })
      fs.rmSync(dir2, { recursive: true, force: true })
      delete process.env.CURSOR_WORKSPACE_ROOT
    }
  })
})
