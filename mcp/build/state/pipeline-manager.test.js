import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
const STATE_FILE = path.join(process.cwd(), '.forgewright', 'pipeline-state.json');
function cleanState() {
    if (fs.existsSync(STATE_FILE))
        fs.unlinkSync(STATE_FILE);
}
describe('Pipeline Manager', () => {
    beforeEach(() => {
        cleanState();
    });
    afterEach(() => {
        cleanState();
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
        const { startPipeline, getState, resetWorkspaceRoot } = await import('../state/pipeline-manager.js');
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
        const { startPipeline, advancePhase, getState, resetWorkspaceRoot } = await import('../state/pipeline-manager.js');
        resetWorkspaceRoot();
        cleanState();
        startPipeline('Feature');
        const result = advancePhase();
        expect(result).toContain('Phase 2');
        expect(getState().currentPhase).toBe(2);
    });
    it('advancePhase blocked when waiting for gate', async () => {
        const { startPipeline, requestGateApproval, advancePhase, resetWorkspaceRoot } = await import('../state/pipeline-manager.js');
        resetWorkspaceRoot();
        cleanState();
        startPipeline('Feature');
        requestGateApproval('test gate');
        const result = advancePhase();
        expect(result).toContain('Error');
        expect(result).toContain('frozen');
    });
    it('advancePhase completes pipeline at end', async () => {
        const { startPipeline, advancePhase, getState, resetWorkspaceRoot } = await import('../state/pipeline-manager.js');
        resetWorkspaceRoot();
        cleanState();
        startPipeline('Feature');
        for (let i = 0; i < 5; i++) {
            const { status } = getState();
            if (status === 'COMPLETED')
                break;
            advancePhase();
        }
        const state = getState();
        expect(state.status).toBe('COMPLETED');
    });
    it('requestGateApproval locks pipeline', async () => {
        const { startPipeline, requestGateApproval, getState, resetWorkspaceRoot } = await import('../state/pipeline-manager.js');
        resetWorkspaceRoot();
        cleanState();
        startPipeline('Feature');
        const result = requestGateApproval('GDD is ready');
        expect(result).toContain('locked');
        expect(result).toContain('GDD is ready');
        expect(getState().status).toBe('WAITING_FOR_GATE');
    });
    it('approveGate unlocks pipeline', async () => {
        const { startPipeline, requestGateApproval, approveGate, getState, resetWorkspaceRoot } = await import('../state/pipeline-manager.js');
        resetWorkspaceRoot();
        cleanState();
        startPipeline('Feature');
        requestGateApproval('test');
        const result = approveGate();
        expect(result).toContain('approved');
        expect(getState().status).toBe('IN_PROGRESS');
    });
    it('approveGate errors when not waiting', async () => {
        const { startPipeline, approveGate, resetWorkspaceRoot } = await import('../state/pipeline-manager.js');
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
});
