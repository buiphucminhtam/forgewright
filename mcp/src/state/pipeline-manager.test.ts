import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgewright-test-'));
process.env.CURSOR_WORKSPACE_ROOT = tmpDir;

const STATE_FILE = path.join(tmpDir, '.forgewright', 'pipeline-state.json');

function cleanState() {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}

describe('Pipeline Manager', () => {
  beforeEach(() => {
    cleanState();
  });

  afterEach(() => {
    cleanState();
  });

  afterAll(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('Failed to clean up temp test directory:', e);
    }
  });

  it('getState returns default state when no state file exists', async () => {
    const { getState, resetWorkspaceRoot } = await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();
    const state = getState();
    expect(state.currentPhase).toBe(0);
    expect(state.status).toBe('IDLE');
    expect(state.currentMode).toBeNull();
  });

  it('startPipeline sets mode and phase', async () => {
    const { startPipeline, getState, resetWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();
    const result = startPipeline('Full Build');
    expect(result).toContain('Full Build');
    expect(result).toContain('Phase 1');
    const state = getState();
    expect(state.currentMode).toBe('Full Build');
    expect(state.currentPhase).toBe(1);
    expect(state.status).toBe('IN_PROGRESS');
  });

  it('advancePhase increments phase', async () => {
    const { startPipeline, advancePhase, getState, resetWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();
    startPipeline('Feature');
    const result = advancePhase();
    expect(result).toContain('Phase 2');
    expect(getState().currentPhase).toBe(2);
  });

  it('advancePhase blocked when waiting for gate', async () => {
    const { startPipeline, requestGateApproval, advancePhase, resetWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();
    startPipeline('Feature');
    requestGateApproval('test gate');
    const result = advancePhase();
    expect(result).toContain('Error');
    expect(result).toContain('frozen');
  });

  it('advancePhase completes pipeline at end', async () => {
    const { startPipeline, advancePhase, getState, resetWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();
    startPipeline('Feature');
    for (let i = 0; i < 5; i++) {
      const { status } = getState();
      if (status === 'COMPLETED') break;
      advancePhase();
    }
    const state = getState();
    expect(state.status).toBe('COMPLETED');
  });

  it('requestGateApproval locks pipeline', async () => {
    const { startPipeline, requestGateApproval, getState, resetWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();
    startPipeline('Feature');
    const result = requestGateApproval('GDD is ready');
    expect(result).toContain('locked');
    expect(result).toContain('GDD is ready');
    expect(getState().status).toBe('WAITING_FOR_GATE');
  });

  it('approveGate unlocks pipeline', async () => {
    const { startPipeline, requestGateApproval, approveGate, getState, resetWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();
    startPipeline('Feature');
    requestGateApproval('test');
    const result = approveGate();
    expect(result).toContain('approved');
    expect(getState().status).toBe('IN_PROGRESS');
  });

  it('approveGate errors when not waiting', async () => {
    const { startPipeline, approveGate, resetWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();
    startPipeline('Feature');
    const result = approveGate();
    expect(result).toContain('Error');
  });

  it('PIPELINE_PHASES has correct phases', async () => {
    const { PIPELINE_PHASES } = await import('../state/pipeline-manager.js');
    expect(PIPELINE_PHASES.length).toBe(5);
    expect(PIPELINE_PHASES[0]).toContain('Phase 0');
    expect(PIPELINE_PHASES[4]).toContain('Phase 4');
  });

  it('saveState writes atomically', async () => {
    const { saveState, getState, resetWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();

    const state = {
      currentPhase: 2,
      currentMode: 'Feature',
      status: 'IN_PROGRESS' as const,
      history: ['Started'],
      activeAction: 'Testing atomic write',
      phaseProgress: 0.5,
      selfHealing: null,
      qualityGate: null,
    };

    saveState(state);

    // The state file should be present and equal
    expect(fs.existsSync(STATE_FILE)).toBe(true);
    // The temporary file should not exist
    expect(fs.existsSync(STATE_FILE + '.tmp')).toBe(false);

    const readState = getState();
    expect(readState.activeAction).toBe('Testing atomic write');
    expect(readState.phaseProgress).toBe(0.5);
  });

  it('getState backward compatibility fills undefined fields with null', async () => {
    const { getState, resetWorkspaceRoot } = await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();

    // Write legacy JSON state
    const legacyState = {
      currentPhase: 1,
      currentMode: 'Harden',
      status: 'IN_PROGRESS',
      history: ['Initial'],
    };

    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(legacyState), 'utf-8');

    const state = getState();
    expect(state.currentPhase).toBe(1);
    expect(state.status).toBe('IN_PROGRESS');
    expect(state.activeAction).toBeNull();
    expect(state.phaseProgress).toBeNull();
    expect(state.selfHealing).toBeNull();
    expect(state.qualityGate).toBeNull();
  });

  it('requestGateApproval accepts qualityGate details', async () => {
    const { startPipeline, requestGateApproval, getState, resetWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();
    startPipeline('Feature');

    const gateInfo = {
      score: 8.5,
      threshold: 9.0,
      failedCriteria: [
        {
          name: 'Risk Awareness',
          score: 7.5,
          reason: 'Missing rollback strategies',
        },
      ],
    };

    requestGateApproval('test gate', gateInfo);

    const state = getState();
    expect(state.status).toBe('WAITING_FOR_GATE');
    expect(state.qualityGate).toEqual(gateInfo);
  });

  it('updateSubTask and updateSelfHealing mutate state', async () => {
    const { startPipeline, updateSubTask, updateSelfHealing, getState, resetWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();
    startPipeline('Feature');

    updateSubTask('Running Vitest...', 0.65);
    let state = getState();
    expect(state.activeAction).toBe('Running Vitest...');
    expect(state.phaseProgress).toBe(0.65);

    const healing = {
      isHealing: true,
      currentAttempt: 2,
      maxAttempts: 3,
      lastError: 'Vitest assertion error',
    };

    updateSelfHealing(healing);
    state = getState();
    expect(state.selfHealing).toEqual(healing);
  });

  it('failPipeline updates status to FAILED and clears progress/action details', async () => {
    const { startPipeline, updateSubTask, failPipeline, getState, resetWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();
    cleanState();
    startPipeline('Feature');
    updateSubTask('Working on it', 0.8);

    const result = failPipeline('Compiling failed');
    expect(result).toContain('FAILED');

    const state = getState();
    expect(state.status).toBe('FAILED');
    expect(state.history).toContain('Pipeline failed: Compiling failed');
    expect(state.activeAction).toBeNull();
    expect(state.phaseProgress).toBeNull();
    expect(state.selfHealing).toBeNull();
    expect(state.qualityGate).toBeNull();
  });

  it('logTokenUsage logs usage in JSON Lines format to ~/.forgewright/usage/<folderName>/usage.log', async () => {
    const { logTokenUsage, resetWorkspaceRoot, getWorkspaceRoot } =
      await import('../state/pipeline-manager.js');
    resetWorkspaceRoot();

    const entry = {
      inputTokens: 1024,
      outputTokens: 256,
      model: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      cost: 0.0069,
      timestamp: '2026-06-26T13:04:00Z',
      skill: 'software-engineer',
    };

    logTokenUsage(entry);

    const wsRoot = getWorkspaceRoot();
    const folderName = path.basename(wsRoot);
    const logDir = path.join(os.homedir(), '.forgewright', 'usage', folderName);
    const logFile = path.join(logDir, 'usage.log');

    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed).toEqual(entry);

    // Clean up
    try {
      fs.rmSync(logDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Failed to clean up test usage log:', e);
    }
  });
});
