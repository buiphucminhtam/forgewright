/**
 * src/cli/src/bench/compare.ts
 *
 * Comparable-report validation for the Forgewright cheap-model uplift
 * evaluation harness.
 *
 * Two benchmark result files are only comparable when they were produced with
 * the same provider, model, task suite, attempt count, and verifier version.
 * Comparing a mock run to a live run is explicitly forbidden because the mock
 * always produces perfect scores that do not reflect real model capability.
 */

export interface ComparableReport {
  /** "mock" | "live" — mock runs are never comparable to anything. */
  mode: string;
  /** Provider identifier (e.g. "agy", "gemini", "codex"). */
  provider: string;
  /** Model identifier string as passed to the adapter. */
  model: string;
  /** Suite JSON version field. */
  suiteVersion: string;
  /** Suite name — must match exactly so apples-to-apples is guaranteed. */
  suiteName: string;
  /** Number of attempts per task (k). Must be ≥ 3 for statistical validity. */
  defaultAttempts: number;
  /** Total number of tasks evaluated. */
  totalTasks: number;
  /**
   * Verifier version token. Bump this whenever verifier commands change so
   * stale comparisons are automatically rejected.
   */
  verifierVersion: string;
  /** ISO-8601 timestamp of when the report was produced. */
  timestamp: string;
}

export interface ComparisonValidationResult {
  comparable: boolean;
  reason?: string;
}

/**
 * Validate that two reports are comparable.
 *
 * Returns `{ comparable: true }` when the pair is safe to compare, or
 * `{ comparable: false, reason: "<human-readable explanation>" }` when they
 * are not.
 *
 * Rules (all must pass):
 *  1. Neither report may be in mock mode.
 *  2. provider must match.
 *  3. model must match.
 *  4. suiteName must match.
 *  5. totalTasks must match.
 *  6. defaultAttempts must match and be ≥ 3.
 *  7. verifierVersion must match (prevents stale-verifier comparisons).
 */
export function validateComparableReports(
  a: ComparableReport,
  b: ComparableReport,
): ComparisonValidationResult {
  if (a.mode === "mock" || b.mode === "mock") {
    return {
      comparable: false,
      reason:
        "Mock runs are not comparable to anything — mock always scores 100% regardless of real model capability.",
    };
  }

  if (a.provider !== b.provider) {
    return {
      comparable: false,
      reason: `Provider mismatch: '${a.provider}' vs '${b.provider}'. Both runs must use the same provider.`,
    };
  }

  if (a.model !== b.model) {
    return {
      comparable: false,
      reason: `Model mismatch: '${a.model}' vs '${b.model}'. Both runs must use the same model so only the kernel/prompt changes.`,
    };
  }

  if (a.suiteName !== b.suiteName) {
    return {
      comparable: false,
      reason: `Suite name mismatch: '${a.suiteName}' vs '${b.suiteName}'. Runs must evaluate the same task suite.`,
    };
  }

  if (a.totalTasks !== b.totalTasks) {
    return {
      comparable: false,
      reason: `Task count mismatch: ${a.totalTasks} vs ${b.totalTasks}. Both runs must evaluate the same number of tasks.`,
    };
  }

  if (a.defaultAttempts !== b.defaultAttempts) {
    return {
      comparable: false,
      reason: `Attempt count mismatch: k=${a.defaultAttempts} vs k=${b.defaultAttempts}. Both runs must use the same k for pass@k to be meaningful.`,
    };
  }

  if (a.defaultAttempts < 3) {
    return {
      comparable: false,
      reason: `Attempt count too low: k=${a.defaultAttempts}. A minimum of k=3 is required for statistically valid pass@k aggregation.`,
    };
  }

  if (a.verifierVersion !== b.verifierVersion) {
    return {
      comparable: false,
      reason: `Verifier version mismatch: '${a.verifierVersion}' vs '${b.verifierVersion}'. One run used stale verifiers — re-run both with the same verifier suite.`,
    };
  }

  return { comparable: true };
}
