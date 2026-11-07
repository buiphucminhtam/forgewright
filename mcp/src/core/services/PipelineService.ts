import { randomUUID } from 'node:crypto';
import type { PipelineTransitionGate } from '../ports/PipelineTransitionGate.js';
import { IStateRepository } from '../ports/IStateRepository.js';
import { IEventPublisher } from '../ports/IEventPublisher.js';
import {
  PipelineState,
  PipelineKind,
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
const boundedText = (value: unknown, max = 4096): value is string =>
  typeof value === 'string' && value.length <= max;

export class PipelineService {
  constructor(
    private stateRepo: IStateRepository<PipelineState>,
    private eventPublisher: IEventPublisher,
    private transitionGate?: PipelineTransitionGate,
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
      const next = await mutator(this.normalizeState(structuredClone(current)));
      if (next) {
        const version = (current?.stateVersion ?? 0) + 1;
        if (!Number.isSafeInteger(version)) throw new Error('Pipeline state version exhausted');
        next.stateVersion = version;
      }
      return next;
    });
    if (state) this.eventPublisher.publish('PIPELINE_STATE_UPDATE', state);
    return state;
  }

  async startPipeline(mode: string, kind: PipelineKind = 'new-project'): Promise<string> {
    if (
      typeof mode !== 'string' ||
      !mode.trim() ||
      mode.length > 256 ||
      !['new-project', 'existing', 'mechanical'].includes(kind)
    ) {
      return 'Error: Invalid pipeline mode or kind.';
    }
    const next = await this.transactAndPublish((state) => {
      if (state.status === 'IN_PROGRESS' || state.status === 'WAITING_FOR_GATE') return null;
      state.runId = randomUUID();
      state.kind = kind;
      // Evidence timestamps have second resolution; use the same boundary.
      state.startedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
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
    if (!next)
      return 'Error: Active pipeline cannot be restarted; finish or explicitly fail it first.';
    return `Successfully started pipeline in ${mode} mode. Run ID: ${next.runId}. You are now at Phase 1: Research & Discovery. Follow the Forgewright orchestrator instructions.`;
  }

  async advancePhase(turn?: string, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) return 'Error: Transition cancelled.';
    const snapshot = this.normalizeState(structuredClone(await this.stateRepo.load()));
    if (snapshot.status === 'WAITING_FOR_GATE') {
      return 'Error: You cannot advance the phase yet. The current phase is frozen pending human-in-the-loop (HITL) gate approval.';
    }
    if (snapshot.status !== 'IN_PROGRESS')
      return `Error: Cannot advance ${snapshot.status} pipeline.`;
    if (!snapshot.runId || !snapshot.kind || !snapshot.startedAt)
      return 'Error: Legacy run lacks lifecycle context; explicitly fail and restart it.';
    if (!this.transitionGate) return 'Error: Executable pipeline transition gate is unavailable.';
    if (
      snapshot.qualityGate &&
      (snapshot.qualityGate.score < snapshot.qualityGate.threshold ||
        snapshot.qualityGate.failedCriteria.length)
    ) {
      return 'Error: Quality criteria remain unresolved.';
    }
    const token = JSON.stringify(snapshot);
    try {
      await this.transitionGate.check(
        {
          runId: snapshot.runId,
          phase: snapshot.currentPhase,
          kind: snapshot.kind,
          startedAt: snapshot.startedAt,
          turn,
        },
        signal,
      );
    } catch (error) {
      return `Error: Transition blocked: ${error instanceof Error ? error.message : 'gate failed'}`;
    }
    let result = '';
    await this.transactAndPublish((state) => {
      if (signal?.aborted) {
        result = 'Error: Transition cancelled; state unchanged.';
        return null;
      }
      if (JSON.stringify(state) !== token) {
        result =
          'Error: Pipeline state changed during gate; inspect current state before retrying.';
        return null;
      }
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
    if (!boundedText(message) || !message.trim()) return 'Error: Invalid approval message.';
    if (
      qualityGate &&
      (!Number.isFinite(qualityGate.score) ||
        !Number.isFinite(qualityGate.threshold) ||
        !Array.isArray(qualityGate.failedCriteria) ||
        qualityGate.failedCriteria.length > 50 ||
        qualityGate.failedCriteria.some(
          (c) =>
            !c || !boundedText(c.name, 128) || !boundedText(c.reason) || !Number.isFinite(c.score),
        ))
    )
      return 'Error: Invalid or oversized quality criteria.';
    let denial = 'Error: Cannot request approval outside an active run.';
    const next = await this.transactAndPublish((state) => {
      if (!['IN_PROGRESS', 'WAITING_FOR_GATE'].includes(state.status)) return null;
      if (
        state.qualityGate &&
        qualityGate &&
        (state.qualityGate.score < state.qualityGate.threshold ||
          state.qualityGate.failedCriteria.length) &&
        qualityGate.threshold < state.qualityGate.threshold
      ) {
        denial = 'Error: Cannot lower a failing quality threshold; repair the criteria.';
        return null;
      }
      state.status = 'WAITING_FOR_GATE';
      this.appendHistory(state, `Requested Gate Approval: ${message}`);
      state.qualityGate = qualityGate ?? state.qualityGate ?? null;
      const phase = state.phases.find((p) => p.key === PHASE_KEYS[state.currentPhase]);
      if (phase) phase.status = 'waiting_review';
      return state;
    });
    if (!next) return denial;
    return `System is now locked. Ask the user for explicit approval to pass the gate: "${message}".`;
  }

  async approveGate(): Promise<string> {
    let result = '';
    await this.transactAndPublish((state) => {
      if (state.status !== 'WAITING_FOR_GATE') {
        result = 'Error: System is not waiting for any gate approval.';
        return null;
      }
      if (
        state.qualityGate &&
        (state.qualityGate.score < state.qualityGate.threshold ||
          state.qualityGate.failedCriteria.length)
      ) {
        result = 'Error: Repair failing quality criteria before requesting approval again.';
        return null;
      }
      state.status = 'IN_PROGRESS';
      this.appendHistory(state, 'User approval reported by caller.');
      state.qualityGate = null;
      const phase = state.phases.find((p) => p.key === PHASE_KEYS[state.currentPhase]);
      if (phase) phase.status = 'running';
      result = 'Gate successfully approved. Proceed to next step or advance phase.';
      return state;
    });
    return result;
  }

  async failPipeline(reason?: string): Promise<string> {
    if (reason !== undefined && !boundedText(reason)) return 'Error: Invalid failure reason.';
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
    if (
      (activeAction !== null && !boundedText(activeAction)) ||
      (phaseProgress !== null &&
        (!Number.isFinite(phaseProgress) || phaseProgress < 0 || phaseProgress > 1))
    )
      throw new Error('Invalid subtask action or progress');
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
    if (
      selfHealing &&
      (typeof selfHealing.isHealing !== 'boolean' ||
        (selfHealing.lastError !== undefined && !boundedText(selfHealing.lastError)))
    )
      throw new Error('Invalid self-healing details');
    await this.transactAndPublish((state) => {
      if (selfHealing) {
        if (
          !Number.isInteger(selfHealing.currentAttempt) ||
          selfHealing.currentAttempt < 0 ||
          !Number.isInteger(selfHealing.maxAttempts) ||
          selfHealing.maxAttempts < 1
        ) {
          throw new Error('Invalid self-healing attempt bounds');
        }
        if (state.status !== 'IN_PROGRESS') throw new Error('Self-healing requires an active run');
        const limit = Math.min(selfHealing.maxAttempts, 2);
        if (selfHealing.currentAttempt > limit) {
          state.status = 'FAILED';
          state.activeAction = null;
          state.phaseProgress = null;
          this.appendHistory(
            state,
            'Retry budget exhausted; stop this approach and use recovery/escalation before a new run.',
          );
          const phase = state.phases.find((p) => p.key === PHASE_KEYS[state.currentPhase]);
          if (phase) phase.status = 'failed';
        }
        state.selfHealing = { ...selfHealing, maxAttempts: limit };
      } else {
        state.selfHealing = null;
      }
      return state;
    });
  }
}
