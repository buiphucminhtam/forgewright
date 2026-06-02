/**
 * Verification Metrics — telemetry for monitoring anti-hallucination performance
 */

export interface VerificationMetrics {
  verificationAttempts: number;
  verificationPassed: number;
  verificationFailed: number;
  citationAccuracy: number;       // 0-1
  averageConfidence: number;      // 0-1
  skepticLatency: number;        // ms
  ragRetrievalLatency: number;   // ms
  hallucinationRate: number;     // 0-1
  totalQueries: number;
  totalWikiGenerated: number;
  totalImpactAnalysis: number;
}

export class MetricsCollector {
  private metrics: VerificationMetrics = {
    verificationAttempts: 0,
    verificationPassed: 0,
    verificationFailed: 0,
    citationAccuracy: 0,
    averageConfidence: 0,
    skepticLatency: 0,
    ragRetrievalLatency: 0,
    hallucinationRate: 0,
    totalQueries: 0,
    totalWikiGenerated: 0,
    totalImpactAnalysis: 0,
  };

  private latencies: number[] = [];
  private confidences: number[] = [];

  recordVerification(passed: boolean, latencyMs: number) {
    this.metrics.verificationAttempts++;
    if (passed) {
      this.metrics.verificationPassed++;
    } else {
      this.metrics.verificationFailed++;
    }
    this.latencies.push(latencyMs);
    this.metrics.skepticLatency = this.average(this.latencies);
  }

  recordRagRetrieval(latencyMs: number) {
    this.metrics.ragRetrievalLatency = latencyMs;
  }

  recordConfidence(confidence: number) {
    this.confidences.push(confidence);
    this.metrics.averageConfidence = this.average(this.confidences);
  }

  recordWikiGenerated() {
    this.metrics.totalWikiGenerated++;
  }

  recordImpactAnalysis() {
    this.metrics.totalImpactAnalysis++;
  }

  recordQuery() {
    this.metrics.totalQueries++;
  }

  recordCitationAccuracy(accuracy: number) {
    this.metrics.citationAccuracy = accuracy;
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  getSnapshot(): VerificationMetrics {
    return { ...this.metrics };
  }

  reset() {
    this.metrics = {
      verificationAttempts: 0,
      verificationPassed: 0,
      verificationFailed: 0,
      citationAccuracy: 0,
      averageConfidence: 0,
      skepticLatency: 0,
      ragRetrievalLatency: 0,
      hallucinationRate: 0,
      totalQueries: 0,
      totalWikiGenerated: 0,
      totalImpactAnalysis: 0,
    };
    this.latencies = [];
    this.confidences = [];
  }

  toJSON(): VerificationMetrics {
    const snap = this.getSnapshot();
    return {
      ...snap,
      hallucinationRate: snap.verificationAttempts > 0
        ? snap.verificationFailed / snap.verificationAttempts
        : 0,
    };
  }
}

export const globalMetrics = new MetricsCollector();

export function printMetrics(): string {
  const m = globalMetrics.toJSON();
  const passRate = m.verificationAttempts > 0
    ? (m.verificationPassed / m.verificationAttempts * 100).toFixed(1)
    : '0';

  return [
    `Verification Metrics`,
    `─────────────────────`,
    `Verification: ${m.verificationPassed}/${m.verificationAttempts} passed (${passRate}%)`,
    `Avg Confidence: ${(m.averageConfidence * 100).toFixed(1)}%`,
    `Skeptic Latency: ${m.skepticLatency.toFixed(1)}ms`,
    `RAG Latency: ${m.ragRetrievalLatency.toFixed(1)}ms`,
    `Citation Accuracy: ${(m.citationAccuracy * 100).toFixed(1)}%`,
    `Hallucination Rate: ${(m.hallucinationRate * 100).toFixed(1)}%`,
    `Queries: ${m.totalQueries}`,
    `Wiki Generated: ${m.totalWikiGenerated}`,
    `Impact Analysis: ${m.totalImpactAnalysis}`,
  ].join('\n');
}
