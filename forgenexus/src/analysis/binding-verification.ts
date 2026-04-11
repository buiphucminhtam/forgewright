/**
 * Binding Verification Module for ForgeWright
 * 
 * Multi-pass verification of symbol bindings to catch errors early.
 */

export interface BindingLocation {
  file: string;
  line: number;
  column: number;
  context: string;
}

export interface Binding {
  symbol: string;
  kind: 'function' | 'variable' | 'class' | 'type' | 'interface' | 'enum' | 'constant';
  definition?: BindingLocation;
  references: BindingLocation[];
  type?: string;
}

export interface BindingIssue {
  type: 'missing' | 'ambiguous' | 'inconsistent' | 'circular' | 'shadowing';
  symbol: string;
  locations: string[];
  suggestion?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface BindingVerification {
  consistent: boolean;
  issues: BindingIssue[];
  confidence: number;
  verifiedBindings: number;
  totalBindings: number;
}

export interface VerificationContext {
  file: string;
  bindings: Map<string, Binding>;
  fileContents: Map<string, string>;
}

/**
 * Multi-pass binding verification
 */
export async function verifyBindings(
  bindings: Map<string, Binding>,
  context: VerificationContext
): Promise<BindingVerification> {
  const issues: BindingIssue[] = [];

  // Pass 1: Check for missing definitions
  const missingIssues = pass1MissingDefinitions(bindings);
  issues.push(...missingIssues);

  // Pass 2: Check for ambiguous symbols
  const ambiguousIssues = pass2AmbiguousSymbols(bindings);
  issues.push(...ambiguousIssues);

  // Pass 3: Check for type inconsistencies
  const inconsistencyIssues = pass3TypeInconsistencies(bindings);
  issues.push(...inconsistencyIssues);

  // Pass 4: Check for circular dependencies
  const circularIssues = await pass4CircularDependencies(bindings, context);
  issues.push(...circularIssues);

  // Calculate confidence
  const confidence = calculateConfidence(issues, bindings.size);

  return {
    consistent: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    confidence,
    verifiedBindings: bindings.size - issues.filter(i => i.type === 'missing').length,
    totalBindings: bindings.size,
  };
}

/**
 * Pass 1: Check for missing definitions
 */
function pass1MissingDefinitions(bindings: Map<string, Binding>): BindingIssue[] {
  const issues: BindingIssue[] = [];

  for (const [name, binding] of bindings) {
    if (!binding.definition && binding.references.length > 0) {
      issues.push({
        type: 'missing',
        symbol: name,
        locations: binding.references.map(r => `${r.file}:${r.line}`),
        suggestion: `Define '${name}' or check import statement`,
        severity: 'error',
      });
    }
  }

  return issues;
}

/**
 * Pass 2: Check for ambiguous symbols
 */
function pass2AmbiguousSymbols(bindings: Map<string, Binding>): BindingIssue[] {
  const issues: BindingIssue[] = [];

  // Group bindings by name
  const byName = new Map<string, Binding[]>();
  for (const [name, binding] of bindings) {
    const existing = byName.get(name) ?? [];
    existing.push(binding);
    byName.set(name, existing);
  }

  // Check for ambiguities
  for (const [name, bindingsList] of byName) {
    if (bindingsList.length > 1) {
      // Multiple definitions with same name
      const definitions = bindingsList.filter(b => b.definition);
      if (definitions.length > 1) {
        issues.push({
          type: 'ambiguous',
          symbol: name,
          locations: definitions.map(d => `${d.definition?.file}:${d.definition?.line}`),
          suggestion: `Use qualified name or disambiguate ${name}`,
          severity: 'warning',
        });
      }
    }
  }

  return issues;
}

/**
 * Pass 3: Check for type inconsistencies
 */
function pass3TypeInconsistencies(bindings: Map<string, Binding>): BindingIssue[] {
  const issues: BindingIssue[] = [];

  for (const [name, binding] of bindings) {
    if (!binding.type) continue;

    // Check if references use consistent types
    // This is a simplified check
    const typeUsages = binding.references.filter(r => r.context.includes(binding.type!));
    
    if (binding.references.length > 0 && typeUsages.length < binding.references.length * 0.5) {
      issues.push({
        type: 'inconsistent',
        symbol: name,
        locations: binding.references.map(r => `${r.file}:${r.line}`),
        suggestion: `Verify type consistency for '${name}'`,
        severity: 'info',
      });
    }
  }

  return issues;
}

/**
 * Pass 4: Check for circular dependencies
 */
async function pass4CircularDependencies(
  bindings: Map<string, Binding>,
  context: VerificationContext
): Promise<BindingIssue[]> {
  const issues: BindingIssue[] = [];

  // Build dependency graph
  const dependencies = new Map<string, Set<string>>();

  for (const [name, binding] of bindings) {
    const deps = new Set<string>();
    
    for (const ref of binding.references) {
      deps.add(ref.context);
    }
    
    dependencies.set(name, deps);
  }

  // Detect cycles using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(node: string, path: string[]): string[] | null {
    if (recursionStack.has(node)) {
      // Found cycle
      const cycleStart = path.indexOf(node);
      return [...path.slice(cycleStart), node];
    }

    if (visited.has(node)) {
      return null;
    }

    visited.add(node);
    recursionStack.add(node);

    const deps = dependencies.get(node) ?? new Set();
    for (const dep of deps) {
      const cycle = hasCycle(dep, [...path, node]);
      if (cycle) return cycle;
    }

    recursionStack.delete(node);
    return null;
  }

  // Check all nodes
  for (const name of bindings.keys()) {
    if (!visited.has(name)) {
      const cycle = hasCycle(name, []);
      if (cycle) {
        issues.push({
          type: 'circular',
          symbol: cycle[0],
          locations: cycle,
          suggestion: 'Review circular dependency in module imports',
          severity: 'warning',
        });
      }
    }
  }

  return issues;
}

/**
 * Calculate confidence based on issues
 */
function calculateConfidence(issues: BindingIssue[], totalBindings: number): number {
  if (totalBindings === 0) return 1;

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  // Deduct based on issues
  const errorPenalty = errorCount * 0.2;
  const warningPenalty = warningCount * 0.1;
  const infoPenalty = infoCount * 0.02;

  const confidence = Math.max(0, 1 - errorPenalty - warningPenalty - infoPenalty);

  return Math.round(confidence * 100) / 100;
}

/**
 * Create empty verification result
 */
export function createEmptyVerification(): BindingVerification {
  return {
    consistent: true,
    issues: [],
    confidence: 1,
    verifiedBindings: 0,
    totalBindings: 0,
  };
}

/**
 * Check if bindings are consistent
 */
export function isConsistent(verification: BindingVerification): boolean {
  return verification.consistent;
}

/**
 * Get issues by severity
 */
export function getIssuesBySeverity(
  verification: BindingVerification,
  severity: 'error' | 'warning' | 'info'
): BindingIssue[] {
  return verification.issues.filter(i => i.severity === severity);
}

/**
 * Get issues by type
 */
export function getIssuesByType(
  verification: BindingVerification,
  type: BindingIssue['type']
): BindingIssue[] {
  return verification.issues.filter(i => i.type === type);
}

/**
 * Format issues for display
 */
export function formatIssues(verification: BindingVerification): string {
  if (verification.issues.length === 0) {
    return 'No binding issues found.';
  }

  const lines: string[] = [];
  lines.push(`Found ${verification.issues.length} binding issues:`);
  lines.push('');

  for (const issue of verification.issues) {
    const severityIcon = {
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
    }[issue.severity];

    lines.push(`${severityIcon} ${issue.type.toUpperCase()}: ${issue.symbol}`);
    
    if (issue.locations.length > 0) {
      lines.push(`   Locations: ${issue.locations.join(', ')}`);
    }
    
    if (issue.suggestion) {
      lines.push(`   Suggestion: ${issue.suggestion}`);
    }
    
    lines.push('');
  }

  return lines.join('\n');
}
