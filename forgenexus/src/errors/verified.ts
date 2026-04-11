/**
 * Verified Errors Module for ForgeWright Anti-Hallucination System
 * 
 * Provides structured error types for verification failures.
 */

// ============================================================================
// Error Types
// ============================================================================

export class ForgeWrightError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ForgeWrightError';
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
    };
  }
}

export class VerificationError extends ForgeWrightError {
  constructor(
    message: string,
    public verificationResult?: {
      status: string;
      confidence: number;
      issues: string[];
    },
    context?: Record<string, unknown>
  ) {
    super(message, 'VERIFICATION_ERROR', context);
    this.name = 'VerificationError';
  }
}

export class ConfidenceError extends ForgeWrightError {
  constructor(
    message: string,
    public score: number,
    public level: 'high' | 'medium' | 'low' | 'critical',
    context?: Record<string, unknown>
  ) {
    super(message, 'CONFIDENCE_ERROR', context);
    this.name = 'ConfidenceError';
  }
}

export class StaleDataError extends ForgeWrightError {
  constructor(
    message: string,
    public lastIndexed: Date,
    public staleness: 'fresh' | 'stale' | 'critical',
    context?: Record<string, unknown>
  ) {
    super(message, 'STALE_DATA_ERROR', context);
    this.name = 'StaleDataError';
  }
}

export class HallucinationError extends ForgeWrightError {
  constructor(
    message: string,
    public claims: Array<{
      claim: string;
      evidence?: string[];
      expected?: string[];
    }>,
    context?: Record<string, unknown>
  ) {
    super(message, 'HALLUCINATION_DETECTED', context);
    this.name = 'HallucinationError';
  }
}

export class CitationError extends ForgeWrightError {
  constructor(
    message: string,
    public citations: Array<{
      source: string;
      line?: number;
      valid: boolean;
      issues: string[];
    }>,
    context?: Record<string, unknown>
  ) {
    super(message, 'CITATION_ERROR', context);
    this.name = 'CitationError';
  }
}

// ============================================================================
// Error Handler
// ============================================================================

export interface ErrorHandlerOptions {
  onVerificationError?: (error: VerificationError) => void;
  onConfidenceError?: (error: ConfidenceError) => void;
  onStaleDataError?: (error: StaleDataError) => void;
  onHallucinationError?: (error: HallucinationError) => void;
  onCitationError?: (error: CitationError) => void;
  onUnknownError?: (error: Error) => void;
  debug?: boolean;
}

export class ErrorHandler {
  private options: ErrorHandlerOptions;

  constructor(options: ErrorHandlerOptions = {}) {
    this.options = {
      debug: false,
      ...options,
    };
  }

  handle(error: unknown): { handled: boolean; error?: ForgeWrightError } {
    if (error instanceof ForgeWrightError) {
      return this.handleForgeWrightError(error);
    }

    if (error instanceof Error) {
      return this.handleUnknownError(error);
    }

    return {
      handled: false,
    };
  }

  private handleForgeWrightError(error: ForgeWrightError): { handled: boolean; error: ForgeWrightError } {
    if (this.options.debug) {
      console.error(`[${error.code}] ${error.message}`, error.context);
    }

    switch (error.name) {
      case 'VerificationError':
        if (this.options.onVerificationError) {
          this.options.onVerificationError(error as VerificationError);
        }
        break;

      case 'ConfidenceError':
        if (this.options.onConfidenceError) {
          this.options.onConfidenceError(error as ConfidenceError);
        }
        break;

      case 'StaleDataError':
        if (this.options.onStaleDataError) {
          this.options.onStaleDataError(error as StaleDataError);
        }
        break;

      case 'HallucinationError':
        if (this.options.onHallucinationError) {
          this.options.onHallucinationError(error as HallucinationError);
        }
        break;

      case 'CitationError':
        if (this.options.onCitationError) {
          this.options.onCitationError(error as CitationError);
        }
        break;
    }

    return { handled: true, error };
  }

  private handleUnknownError(error: Error): { handled: boolean; error: ForgeWrightError } {
    if (this.options.debug) {
      console.error('[UNKNOWN_ERROR]', error.message, error.stack);
    }

    const wrapped = new ForgeWrightError(
      error.message,
      'UNKNOWN_ERROR',
      { originalError: error.stack }
    );

    if (this.options.onUnknownError) {
      this.options.onUnknownError(error);
    }

    return { handled: true, error: wrapped };
  }
}

// ============================================================================
// Recovery Suggestions
// ============================================================================

export interface RecoverySuggestion {
  action: string;
  command?: string;
  priority: 'high' | 'medium' | 'low';
}

export function getRecoverySuggestions(error: ForgeWrightError): RecoverySuggestion[] {
  switch (error.code) {
    case 'VERIFICATION_ERROR':
      return [
        { action: 'Add more evidence to verify claims', priority: 'high' },
        { action: 'Check source file citations', priority: 'high' },
        { action: 'Lower confidence threshold if needed', command: '--threshold 0.6', priority: 'medium' },
      ];

    case 'CONFIDENCE_ERROR':
      return [
        { action: 'Run fresh analysis to update graph', command: 'forgenexus analyze --force', priority: 'high' },
        { action: 'Verify graph data freshness', command: 'forgenexus status', priority: 'high' },
        { action: 'Try with stricter verification', command: '--strict', priority: 'medium' },
      ];

    case 'STALE_DATA_ERROR':
      return [
        { action: 'Refresh graph data', command: 'forgenexus analyze --force', priority: 'high' },
        { action: 'Check when last analysis was run', command: 'forgenexus status', priority: 'medium' },
      ];

    case 'HALLUCINATION_DETECTED':
      return [
        { action: 'Review flagged claims and add evidence', priority: 'high' },
        { action: 'Run verification with stricter mode', command: '--strict', priority: 'high' },
        { action: 'Add source file citations', priority: 'medium' },
      ];

    case 'CITATION_ERROR':
      return [
        { action: 'Verify cited files exist', priority: 'high' },
        { action: 'Check line numbers in citations', priority: 'high' },
        { action: 'Use correct citation format: [source:filepath:line]', priority: 'medium' },
      ];

    default:
      return [
        { action: 'Retry the operation', priority: 'medium' },
        { action: 'Check for updates', command: 'forgenexus version', priority: 'low' },
      ];
  }
}

// ============================================================================
// Error Reporter
// ============================================================================

export interface ErrorReport {
  id: string;
  timestamp: Date;
  error: {
    name: string;
    message: string;
    code: string;
    context?: Record<string, unknown>;
  };
  suggestions: RecoverySuggestion[];
}

export class ErrorReporter {
  private reports: ErrorReport[] = [];

  report(error: ForgeWrightError): string {
    const id = `ERR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const report: ErrorReport = {
      id,
      timestamp: new Date(),
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        context: error.context,
      },
      suggestions: getRecoverySuggestions(error),
    };

    this.reports.push(report);

    return id;
  }

  getReports(): ErrorReport[] {
    return [...this.reports];
  }

  clearReports(): void {
    this.reports = [];
  }

  formatReport(id: string): string {
    const report = this.reports.find(r => r.id === id);
    if (!report) return `Report not found: ${id}`;

    const lines: string[] = [];
    lines.push(`Error Report: ${report.id}`);
    lines.push(`Time: ${report.timestamp.toISOString()}`);
    lines.push(`Error: [${report.error.code}] ${report.error.name}`);
    lines.push(`Message: ${report.error.message}`);
    lines.push('');
    lines.push('Suggestions:');

    for (const suggestion of report.suggestions) {
      lines.push(`  [${suggestion.priority.toUpperCase()}] ${suggestion.action}`);
      if (suggestion.command) {
        lines.push(`    Run: ${suggestion.command}`);
      }
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Global Error Reporter
// ============================================================================

export const globalReporter = new ErrorReporter();

// ============================================================================
// CLI Error Display
// ============================================================================

export function displayError(error: ForgeWrightError): void {
  console.error(`
╔══════════════════════════════════════════════════════════════╗
║  ERROR: ${error.code.padEnd(53)}║
╠══════════════════════════════════════════════════════════════╣
║  ${error.message.substring(0, 60).padEnd(60)}║
╚══════════════════════════════════════════════════════════════╝
`);

  const suggestions = getRecoverySuggestions(error);
  if (suggestions.length > 0) {
    console.error('\nRecovery suggestions:');
    for (const suggestion of suggestions) {
      const icon = suggestion.priority === 'high' ? '🔴' : suggestion.priority === 'medium' ? '🟡' : '🟢';
      console.error(`  ${icon} ${suggestion.action}`);
      if (suggestion.command) {
        console.error(`     Run: ${suggestion.command}`);
      }
    }
  }
}
