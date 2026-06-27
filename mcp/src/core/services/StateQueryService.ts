import { IStateRepository } from '../ports/IStateRepository.js';
import { PipelineState, DEFAULT_STATE, initializeDefaultPhases } from '../models/PipelineState.js';

export class StateQueryService {
  constructor(private stateRepo: IStateRepository<PipelineState>) {}

  async getState(): Promise<PipelineState> {
    const state = await this.stateRepo.load();
    const finalState = state || { ...DEFAULT_STATE };

    // Backward compatibility initialization
    if (finalState.activeAction === undefined) finalState.activeAction = null;
    if (finalState.phaseProgress === undefined) finalState.phaseProgress = null;
    if (finalState.selfHealing === undefined) finalState.selfHealing = null;
    if (finalState.qualityGate === undefined) finalState.qualityGate = null;
    if (!finalState.phases || !Array.isArray(finalState.phases) || finalState.phases.length === 0) {
      finalState.phases = initializeDefaultPhases(finalState.currentPhase, finalState.status);
    }

    return finalState;
  }
}
