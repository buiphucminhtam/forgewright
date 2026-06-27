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

export class PipelineService {
  constructor(
    private stateRepo: IStateRepository<PipelineState>,
    private eventPublisher: IEventPublisher,
  ) {}

  private async getState(): Promise<PipelineState> {
    const state = await this.stateRepo.load();
    if (!state) return { ...DEFAULT_STATE };

    // Backward compatibility initialization
    if (state.activeAction === undefined) state.activeAction = null;
    if (state.phaseProgress === undefined) state.phaseProgress = null;
    if (state.selfHealing === undefined) state.selfHealing = null;
    if (state.qualityGate === undefined) state.qualityGate = null;
    if (!state.phases || !Array.isArray(state.phases) || state.phases.length === 0) {
      state.phases = initializeDefaultPhases(state.currentPhase, state.status);
    }
    return state;
  }

  private async saveAndPublish(state: PipelineState): Promise<void> {
    await this.stateRepo.save(state);
    this.eventPublisher.publish('PIPELINE_STATE_UPDATE', state);
  }

  async startPipeline(mode: string): Promise<string> {
    const state = await this.getState();
    state.currentPhase = 1;
    state.currentMode = mode;
    state.status = 'IN_PROGRESS';
    state.history.push(`Started pipeline in mode: ${mode}`);
    state.activeAction = null;
    state.phaseProgress = null;
    state.selfHealing = null;
    state.qualityGate = null;
    state.phases = initializeDefaultPhases(1, 'IN_PROGRESS');

    await this.saveAndPublish(state);
    return `Successfully started pipeline in ${mode} mode. You are now at Phase 1: Research & Discovery. Follow the Forgewright orchestrator instructions.`;
  }

  async advancePhase(): Promise<string> {
    const state = await this.getState();
    if (state.status === 'WAITING_FOR_GATE') {
      return `Error: You cannot advance the phase yet. The current phase is frozen pending human-in-the-loop (HITL) gate approval.`;
    }

    const now = new Date().toISOString();
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
      await this.saveAndPublish(state);
      return `Success: Pipeline is now Fully Completed.`;
    }

    state.currentPhase += 1;
    const phaseName = PIPELINE_PHASES[state.currentPhase];
    state.status = 'IN_PROGRESS';
    state.history.push(`Advanced to ${phaseName}`);
    state.activeAction = null;
    state.phaseProgress = null;
    state.selfHealing = null;
    state.qualityGate = null;

    const newPhaseKey = PHASE_KEYS[state.currentPhase];
    const newPhaseState = state.phases.find((p) => p.key === newPhaseKey);
    if (newPhaseState) {
      newPhaseState.status = 'running';
      newPhaseState.startedAt = now;
      newPhaseState.progress = 0.0;
    }

    await this.saveAndPublish(state);
    return `Successfully advanced to ${phaseName}. Check the Forgewright instructions for roles required in this phase.`;
  }

  async requestGateApproval(
    message: string,
    qualityGate?: QualityGateState | null,
  ): Promise<string> {
    const state = await this.getState();
    state.status = 'WAITING_FOR_GATE';
    state.history.push(`Requested Gate Approval: ${message}`);
    state.qualityGate = qualityGate || null;

    const currentPhaseKey = PHASE_KEYS[state.currentPhase];
    const currentPhaseState = state.phases.find((p) => p.key === currentPhaseKey);
    if (currentPhaseState) {
      currentPhaseState.status = 'waiting_review';
    }

    await this.saveAndPublish(state);
    return `System is now locked. Ask the user for explicit approval to pass the gate: "${message}".`;
  }

  async approveGate(): Promise<string> {
    const state = await this.getState();
    if (state.status !== 'WAITING_FOR_GATE') {
      return 'Error: System is not waiting for any gate approval.';
    }
    state.status = 'IN_PROGRESS';
    state.history.push('Gate approved by user.');
    state.qualityGate = null;

    const currentPhaseKey = PHASE_KEYS[state.currentPhase];
    const currentPhaseState = state.phases.find((p) => p.key === currentPhaseKey);
    if (currentPhaseState) {
      currentPhaseState.status = 'running';
    }

    await this.saveAndPublish(state);
    return 'Gate successfully approved. Proceed to next step or advance phase.';
  }

  async failPipeline(reason?: string): Promise<string> {
    const state = await this.getState();
    state.status = 'FAILED';
    const entry = reason ? `Pipeline failed: ${reason}` : 'Pipeline failed.';
    state.history.push(entry);
    state.activeAction = null;
    state.phaseProgress = null;
    state.selfHealing = null;
    state.qualityGate = null;

    const currentPhaseKey = PHASE_KEYS[state.currentPhase];
    const currentPhaseState = state.phases.find((p) => p.key === currentPhaseKey);
    if (currentPhaseState) {
      currentPhaseState.status = 'failed';
      currentPhaseState.errorSummary = reason || 'Unknown failure';
    }

    await this.saveAndPublish(state);
    return `Pipeline status updated to FAILED.`;
  }

  async updateSubTask(activeAction: string | null, phaseProgress: number | null): Promise<void> {
    const state = await this.getState();
    state.activeAction = activeAction;
    state.phaseProgress = phaseProgress;

    const currentPhaseKey = PHASE_KEYS[state.currentPhase];
    const currentPhaseState = state.phases.find((p) => p.key === currentPhaseKey);
    if (currentPhaseState) {
      if (activeAction !== undefined) currentPhaseState.activeAction = activeAction;
      if (phaseProgress !== null && phaseProgress !== undefined) {
        currentPhaseState.progress = phaseProgress;
      }
    }

    await this.saveAndPublish(state);
  }

  async updateSelfHealing(selfHealing: SelfHealingState | null): Promise<void> {
    const state = await this.getState();
    state.selfHealing = selfHealing;
    await this.saveAndPublish(state);
  }
}
