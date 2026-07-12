import { IStateRepository } from '../ports/IStateRepository.js';
import { IEventPublisher } from '../ports/IEventPublisher.js';
import {
  PipelineState,
  PIPELINE_PHASES,
  PHASE_KEYS,
  initializeDefaultPhases,
  DEFAULT_STATE,
  QualityGateState,
  SelfHealingState,
} from '../models/PipelineState.js';

/**
 * Retain the most recent 100 state-history entries. Older entries are removed
 * from the front so persisted state remains bounded and trim order is stable.
 */
const PIPELINE_HISTORY_MAX_ENTRIES = 100;

export class PipelineService {
  constructor(
    private stateRepo: IStateRepository<PipelineState>,
    private eventPublisher: IEventPublisher,
  ) {}

  private normalizeState(state: PipelineState | null): PipelineState {
    if (!state) {
      return {
        ...DEFAULT_STATE,
        history: [],
        phases: initializeDefaultPhases(0, 'IDLE'),
      };
    }

    // Backward compatibility initialization
    if (state.activeAction === undefined) state.activeAction = null;
    if (state.phaseProgress === undefined) state.phaseProgress = null;
    if (state.selfHealing === undefined) state.selfHealing = null;
    if (state.qualityGate === undefined) state.qualityGate = null;
    if (!state.phases || !Array.isArray(state.phases) || state.phases.length === 0) {
      state.phases = initializeDefaultPhases(state.currentPhase, state.status);
    }
    this.trimHistory(state);
    return state;
  }

  private trimHistory(state: PipelineState): void {
    if (state.history.length > PIPELINE_HISTORY_MAX_ENTRIES) {
      state.history.splice(0, state.history.length - PIPELINE_HISTORY_MAX_ENTRIES);
    }
  }

  private appendHistory(state: PipelineState, entry: string): void {
    state.history.push(entry);
    this.trimHistory(state);
  }

  private async transactAndPublish(
    mutator: (state: PipelineState) => PipelineState | null | Promise<PipelineState | null>,
  ): Promise<PipelineState | null> {
    const state = await this.stateRepo.transact(async (current) => {
      return mutator(this.normalizeState(current));
    });
    if (state) this.eventPublisher.publish('PIPELINE_STATE_UPDATE', state);
    return state;
  }

  async startPipeline(mode: string): Promise<string> {
    await this.transactAndPublish((state) => {
      state.currentPhase = 1;
      state.currentMode = mode;
      state.status = 'IN_PROGRESS';
      this.appendHistory(state, `Started pipeline in mode: ${mode}`);
      state.activeAction = null;
      state.phaseProgress = null;
      state.selfHealing = null;
      state.qualityGate = null;
      state.phases = initializeDefaultPhases(1, 'IN_PROGRESS');
      return state;
    });
    return `Successfully started pipeline in ${mode} mode. You are now at Phase 1: Research & Discovery. Follow the Forgewright orchestrator instructions.`;
  }

  async advancePhase(): Promise<string> {
    let result = '';
    await this.transactAndPublish((state) => {
      if (state.status === 'WAITING_FOR_GATE') {
        result =
          'Error: You cannot advance the phase yet. The current phase is frozen pending human-in-the-loop (HITL) gate approval.';
        return null;
      }
      const now = new Date().toISOString();
      const currentPhaseState = state.phases.find((p) => p.key === PHASE_KEYS[state.currentPhase]);
      if (currentPhaseState)
        Object.assign(currentPhaseState, { status: 'passed', endedAt: now, progress: 1.0 });
      if (state.currentPhase >= PIPELINE_PHASES.length - 1) {
        Object.assign(state, {
          status: 'COMPLETED',
          activeAction: null,
          phaseProgress: null,
          selfHealing: null,
          qualityGate: null,
        });
        this.appendHistory(state, 'Pipeline completed.');
        result = 'Success: Pipeline is now Fully Completed.';
        return state;
      }
      state.currentPhase += 1;
      const phaseName = PIPELINE_PHASES[state.currentPhase];
      Object.assign(state, {
        status: 'IN_PROGRESS',
        activeAction: null,
        phaseProgress: null,
        selfHealing: null,
        qualityGate: null,
      });
      this.appendHistory(state, `Advanced to ${phaseName}`);
      const newPhaseState = state.phases.find((p) => p.key === PHASE_KEYS[state.currentPhase]);
      if (newPhaseState)
        Object.assign(newPhaseState, { status: 'running', startedAt: now, progress: 0.0 });
      result = `Successfully advanced to ${phaseName}. Check the Forgewright instructions for roles required in this phase.`;
      return state;
    });
    return result;
  }

  async requestGateApproval(
    message: string,
    qualityGate?: QualityGateState | null,
  ): Promise<string> {
    await this.transactAndPublish((state) => {
      state.status = 'WAITING_FOR_GATE';
      this.appendHistory(state, `Requested Gate Approval: ${message}`);
      state.qualityGate = qualityGate || null;
      const phase = state.phases.find((p) => p.key === PHASE_KEYS[state.currentPhase]);
      if (phase) phase.status = 'waiting_review';
      return state;
    });
    return `System is now locked. Ask the user for explicit approval to pass the gate: "${message}".`;
  }

  async approveGate(): Promise<string> {
    let result = '';
    await this.transactAndPublish((state) => {
      if (state.status !== 'WAITING_FOR_GATE') {
        result = 'Error: System is not waiting for any gate approval.';
        return null;
      }
      state.status = 'IN_PROGRESS';
      this.appendHistory(state, 'Gate approved by user.');
      state.qualityGate = null;
      const phase = state.phases.find((p) => p.key === PHASE_KEYS[state.currentPhase]);
      if (phase) phase.status = 'running';
      result = 'Gate successfully approved. Proceed to next step or advance phase.';
      return state;
    });
    return result;
  }

  async failPipeline(reason?: string): Promise<string> {
    await this.transactAndPublish((state) => {
      state.status = 'FAILED';
      this.appendHistory(state, reason ? `Pipeline failed: ${reason}` : 'Pipeline failed.');
      Object.assign(state, {
        activeAction: null,
        phaseProgress: null,
        selfHealing: null,
        qualityGate: null,
      });
      const phase = state.phases.find((p) => p.key === PHASE_KEYS[state.currentPhase]);
      if (phase)
        Object.assign(phase, { status: 'failed', errorSummary: reason || 'Unknown failure' });
      return state;
    });
    return `Pipeline status updated to FAILED.`;
  }

  async updateSubTask(activeAction: string | null, phaseProgress: number | null): Promise<void> {
    await this.transactAndPublish((state) => {
      state.activeAction = activeAction;
      state.phaseProgress = phaseProgress;
      const phase = state.phases.find((p) => p.key === PHASE_KEYS[state.currentPhase]);
      if (phase) {
        phase.activeAction = activeAction;
        if (phaseProgress !== null) phase.progress = phaseProgress;
      }
      return state;
    });
  }

  async updateSelfHealing(selfHealing: SelfHealingState | null): Promise<void> {
    await this.transactAndPublish((state) => {
      state.selfHealing = selfHealing;
      return state;
    });
  }
}
