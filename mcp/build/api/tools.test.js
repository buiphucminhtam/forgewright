import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Test the pipeline-manager functions directly (no MCP SDK mocking needed)
import { PIPELINE_PHASES, DEFAULT_STATE, getForgewrightRoot } from '../state/pipeline-manager.js';
// ─── PIPELINE_PHASES ────────────────────────────────────────────────
describe('PIPELINE_PHASES', () => {
    it('should have exactly 5 phases', () => {
        expect(PIPELINE_PHASES).toHaveLength(5);
    });
    it('should have correct phase names', () => {
        expect(PIPELINE_PHASES[0]).toBe('Phase 0: Project Initiation & Mode Selection');
        expect(PIPELINE_PHASES[1]).toBe('Phase 1: Research & Discovery (PM/BA/Architect)');
        expect(PIPELINE_PHASES[2]).toBe('Phase 2: Execution (BE/FE/Engine Engineers)');
        expect(PIPELINE_PHASES[3]).toBe('Phase 3: QA & Hardening');
        expect(PIPELINE_PHASES[4]).toBe('Phase 4: Release & Deployment');
    });
    it('should have 5 elements matching phase numbers', () => {
        PIPELINE_PHASES.forEach((phase, i) => {
            expect(phase).toContain(`Phase ${i}`);
        });
    });
});
// ─── DEFAULT_STATE ──────────────────────────────────────────────────
describe('DEFAULT_STATE', () => {
    it('should have correct initial values', () => {
        expect(DEFAULT_STATE.currentPhase).toBe(0);
        expect(DEFAULT_STATE.currentMode).toBeNull();
        expect(DEFAULT_STATE.history).toEqual([]);
        expect(DEFAULT_STATE.status).toBe('IDLE');
    });
    it('should have valid status', () => {
        const valid = ['IDLE', 'IN_PROGRESS', 'WAITING_FOR_GATE', 'COMPLETED'];
        expect(valid).toContain(DEFAULT_STATE.status);
    });
});
// ─── getForgewrightRoot ────────────────────────────────────────────
describe('getForgewrightRoot', () => {
    it('discovers the repository root above the MCP package', () => {
        expect(getForgewrightRoot()).toBe(path.resolve(fileURLToPath(new URL('../../../', import.meta.url))));
    });
});
