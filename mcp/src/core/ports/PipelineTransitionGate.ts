import type { PipelineKind } from '../models/PipelineState.js';

export interface PipelineTransitionRequest {
  runId: string;
  phase: number;
  kind: PipelineKind;
  startedAt: string;
  /** Caller-selected evidence turn; this is not authenticated host identity. */
  turn?: string;
}

export interface PipelineTransitionGate {
  /** Reject before persistence when any executable prerequisite is absent or fails. */
  check(request: PipelineTransitionRequest, signal?: AbortSignal): Promise<void>;
}
