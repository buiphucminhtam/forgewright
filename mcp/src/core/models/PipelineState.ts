export interface SelfHealingState {
  isHealing: boolean;
  currentAttempt: number;
  maxAttempts: number;
  lastError?: string;
}

export interface FailedCriterion {
  name: string;
  score: number;
  reason: string;
}

export interface QualityGateState {
  score: number;
  threshold: number;
  failedCriteria: FailedCriterion[];
}

export interface PhaseState {
  key: 'interpret' | 'define' | 'build' | 'harden' | 'ship';
  status:
    | 'not_started'
    | 'running'
    | 'waiting_review'
    | 'passed'
    | 'failed'
    | 'skipped'
    | 'blocked';
  progress: number; // 0.0 to 1.0
  activeAction?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  errorSummary?: string | null;
}

export interface PipelineState {
  currentPhase: number;
  currentMode: string | null;
  status: 'IDLE' | 'IN_PROGRESS' | 'WAITING_FOR_GATE' | 'COMPLETED' | 'FAILED';
  history: string[];
  activeAction?: string | null;
  phaseProgress?: number | null;
  selfHealing?: SelfHealingState | null;
  qualityGate?: QualityGateState | null;
  phases: PhaseState[];
}

export const PIPELINE_PHASES = [
  'Phase 0: Project Initiation & Mode Selection',
  'Phase 1: Research & Discovery (PM/BA/Architect)',
  'Phase 2: Execution (BE/FE/Engine Engineers)',
  'Phase 3: QA & Hardening',
  'Phase 4: Release & Deployment',
];

export const PHASE_KEYS: PhaseState['key'][] = ['interpret', 'define', 'build', 'harden', 'ship'];

export function initializeDefaultPhases(
  currentPhaseIndex: number,
  currentStatus: string,
): PhaseState[] {
  return PHASE_KEYS.map((key, index) => {
    let status: PhaseState['status'] = 'not_started';
    let progress = 0;
    let startedAt: string | null = null;
    let endedAt: string | null = null;

    if (index < currentPhaseIndex) {
      status = 'passed';
      progress = 1.0;
      endedAt = new Date().toISOString();
    } else if (index === currentPhaseIndex) {
      status =
        currentStatus === 'FAILED'
          ? 'failed'
          : currentStatus === 'WAITING_FOR_GATE'
            ? 'waiting_review'
            : currentStatus === 'IDLE'
              ? 'not_started'
              : 'running';
      progress = 0.0;
      if (currentStatus !== 'IDLE') {
        startedAt = new Date().toISOString();
      }
    }

    return { key, status, progress, startedAt, endedAt };
  });
}

export const DEFAULT_STATE: PipelineState = {
  currentPhase: 0,
  currentMode: null,
  history: [],
  status: 'IDLE',
  activeAction: null,
  phaseProgress: null,
  selfHealing: null,
  qualityGate: null,
  phases: initializeDefaultPhases(0, 'IDLE'),
};
