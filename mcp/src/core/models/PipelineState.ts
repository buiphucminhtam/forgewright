import { z } from 'zod';

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
    'not_started' | 'running' | 'waiting_review' | 'passed' | 'failed' | 'skipped' | 'blocked';
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

const SelfHealingStateSchema = z
  .object({
    isHealing: z.boolean(),
    currentAttempt: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
    lastError: z.string().optional(),
  })
  .strict();

const QualityGateStateSchema = z
  .object({
    score: z.number().finite(),
    threshold: z.number().finite(),
    failedCriteria: z.array(
      z.object({ name: z.string(), score: z.number().finite(), reason: z.string() }).strict(),
    ),
  })
  .strict();

const PhaseStateSchema = z
  .object({
    key: z.enum(['interpret', 'define', 'build', 'harden', 'ship']),
    status: z.enum([
      'not_started',
      'running',
      'waiting_review',
      'passed',
      'failed',
      'skipped',
      'blocked',
    ]),
    progress: z.number().min(0).max(1),
    activeAction: z.string().nullable().optional(),
    startedAt: z.string().nullable().optional(),
    endedAt: z.string().nullable().optional(),
    errorSummary: z.string().nullable().optional(),
  })
  .strict();

const PipelineStateSchema = z
  .object({
    currentPhase: z.number().int().min(0).max(4),
    currentMode: z.string().nullable(),
    status: z.enum(['IDLE', 'IN_PROGRESS', 'WAITING_FOR_GATE', 'COMPLETED', 'FAILED']),
    history: z.array(z.string()),
    activeAction: z.string().nullable().optional(),
    phaseProgress: z.number().min(0).max(1).nullable().optional(),
    selfHealing: SelfHealingStateSchema.nullable().optional(),
    qualityGate: QualityGateStateSchema.nullable().optional(),
    phases: z.array(PhaseStateSchema).optional().default([]),
  })
  .strict();

/** Runtime validation boundary for persisted pipeline state. */
export function parsePipelineState(value: unknown): PipelineState {
  return PipelineStateSchema.parse(value) as PipelineState;
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
