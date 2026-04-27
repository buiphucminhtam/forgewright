/**
 * Verified Errors Module for ForgeWright Anti-Hallucination System
 * 
 * Provides structured error types for verification failures and
 * ForgeNexus-specific error codes for MCP operations.
 */

// ============================================================================
// ForgeNexus Error Codes (MCP Operations)
// ============================================================================

export enum ForgeNexusErrorCode {
  // Index errors
  INDEX_NOT_FOUND = 'INDEX_NOT_FOUND',
  INDEX_CORRUPTED = 'INDEX_CORRUPTED',
  INDEX_STALE = 'INDEX_STALE',
  
  // Database errors
  DB_UNAVAILABLE = 'DB_UNAVAILABLE',
  DB_CORRUPTED = 'DB_CORRUPTED',
  DB_LOCK_CONFLICT = 'DB_LOCK_CONFLICT',
  
  // Setup errors
  SETUP_INCOMPLETE = 'SETUP_INCOMPLETE',
  DEPENDENCY_MISSING = 'DEPENDENCY_MISSING',
  
  // Query errors
  GRAPH_UNAVAILABLE = 'GRAPH_UNAVAILABLE',
  QUERY_FAILED = 'QUERY_FAILED',
  EMBEDDING_FAILED = 'EMBEDDING_FAILED',
  
  // Tool errors
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  
  // Fallback errors
  FALLBACK_DISABLED = 'FALLBACK_DISABLED',
  FALLBACK_TIMEOUT = 'FALLBACK_TIMEOUT',
  
  // Generic
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ============================================================================
// ForgeNexus Structured Error Response
// ============================================================================

export interface ForgeNexusErrorResponse {
  error: {
    code: ForgeNexusErrorCode;
    message: string;
    recoveryHint?: string;
    quickStart?: string;
    details?: Record<string, unknown>;
  };
}

export function createErrorResponse(
  code: ForgeNexusErrorCode,
  message: string,
  options?: {
    recoveryHint?: string;
    quickStart?: string;
    details?: Record<string, unknown>;
  }
): ForgeNexusErrorResponse {
  return {
    error: {
      code,
      message,
      ...(options?.recoveryHint && { recoveryHint: options.recoveryHint }),
      ...(options?.quickStart && { quickStart: options.quickStart }),
      ...(options?.details && { details: options.details }),
    },
  };
}

export function formatErrorAsText(error: ForgeNexusErrorResponse): string {
  const { error: err } = error;
  let text = `⚠️ ${err.code}\n\n${err.message}`;
  
  if (err.recoveryHint) {
    text += `\n\n💡 Recovery: ${err.recoveryHint}`;
  }
  
  if (err.quickStart) {
    text += `\n\n🚀 Quick start: \`${err.quickStart}\``;
  }
  
  return text;
}

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
    // ForgeNexus-specific errors
    case 'INDEX_NOT_FOUND':
      return [
        { action: 'Run forgenexus analyze to index the codebase', command: 'forgenexus analyze', priority: 'high' },
        { action: 'Quick index for fast setup', command: 'forgenexus analyze --quick', priority: 'medium' },
        { action: 'Run forgenexus doctor to check setup', command: 'forgenexus doctor', priority: 'low' },
      ];

    case 'INDEX_STALE':
      return [
        { action: 'Update the index with latest code changes', command: 'forgenexus analyze', priority: 'high' },
        { action: 'Force re-index if there are issues', command: 'forgenexus analyze --force', priority: 'medium' },
        { action: 'Check what changed with forgenexus status', command: 'forgenexus status', priority: 'low' },
      ];

    case 'INDEX_CORRUPTED':
    case 'DB_CORRUPTED':
      return [
        { action: 'Rebuild the index from scratch', command: 'forgenexus analyze --force', priority: 'high' },
        { action: 'Check for backup and restore if needed', command: './scripts/rollback-forgenexus.sh', priority: 'medium' },
        { action: 'Run doctor to diagnose issues', command: 'forgenexus doctor', priority: 'low' },
      ];

    case 'DB_LOCK_CONFLICT':
      return [
        { action: 'Stop other ForgeNexus processes', command: 'pkill -f forgenexus', priority: 'high' },
        { action: 'Wait 5 seconds and retry', priority: 'medium' },
        { action: 'Check running processes', command: 'ps aux | grep forgenexus', priority: 'low' },
      ];

    case 'SETUP_INCOMPLETE':
      return [
        { action: 'Complete ForgeNexus setup', command: 'forgenexus setup', priority: 'high' },
        { action: 'Run doctor to see missing setup steps', command: 'forgenexus doctor', priority: 'medium' },
        { action: 'Check prerequisites (Node.js, git)', priority: 'low' },
      ];

    case 'GRAPH_UNAVAILABLE':
      return [
        { action: 'Check if the index was created', command: 'forgenexus analyze', priority: 'high' },
        { action: 'Try with text-search fallback (if enabled)', priority: 'medium' },
        { action: 'Run doctor to diagnose', command: 'forgenexus doctor', priority: 'low' },
      ];

    case 'EMBEDDING_FAILED':
      return [
        { action: 'Check API key configuration', command: 'forgenexus doctor', priority: 'high' },
        { action: 'Retry without semantic search', command: 'EMBEDDING_PROVIDER=none forgenexus analyze', priority: 'medium' },
        { action: 'Use local embeddings', command: 'EMBEDDING_PROVIDER=transformers forgenexus analyze', priority: 'medium' },
      ];

    // Original ForgeWright errors
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
        { action: 'Run doctor to diagnose', command: 'forgenexus doctor', priority: 'low' },
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
