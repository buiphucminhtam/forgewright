/**
 * Consistency Checks Module for ForgeWright
 * 
 * Runs various consistency checks on the codebase graph.
 */

export interface ConsistencyCheck {
  type: string;
  passed: boolean;
  confidence: number;
  details: string;
  issues?: string[];
}

export interface CodeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  type: 'file' | 'function' | 'class' | 'interface' | 'variable' | 'module';
  file?: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'imports' | 'calls' | 'extends' | 'implements' | 'uses';
}

/**
 * Run all consistency checks
 */
export async function runConsistencyChecks(graph: CodeGraph): Promise<ConsistencyCheck[]> {
  const checks: ConsistencyCheck[] = [];

  checks.push(checkOrphanNodes(graph));
  checks.push(checkCircularDependencies(graph));
  checks.push(checkMissingTypes(graph));
  checks.push(checkUnresolvedImports(graph));
  checks.push(checkDeadCode(graph));

  return checks;
}

/**
 * Check for orphan nodes (nodes with no connections)
 */
export function checkOrphanNodes(graph: CodeGraph): ConsistencyCheck {
  const connectedNodes = new Set<string>();
  
  for (const edge of graph.edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }

  const orphans = graph.nodes.filter(n => !connectedNodes.has(n.id));

  if (orphans.length === 0) {
    return {
      type: 'orphan_nodes',
      passed: true,
      confidence: 0.95,
      details: 'No orphan nodes found.',
    };
  }

  return {
    type: 'orphan_nodes',
    passed: false,
    confidence: 0.85,
    details: `Found ${orphans.length} orphan nodes.`,
    issues: orphans.map(n => 
      `${n.type}: ${n.id}${n.file ? ` (${n.file})` : ''}`
    ),
  };
}

/**
 * Check for circular dependencies
 */
export function checkCircularDependencies(graph: CodeGraph): ConsistencyCheck {
  const adj = new Map<string, Set<string>>();
  
  for (const node of graph.nodes) {
    adj.set(node.id, new Set());
  }
  
  for (const edge of graph.edges) {
    if (edge.type === 'imports' || edge.type === 'uses') {
      adj.get(edge.source)?.add(edge.target);
    }
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (recursionStack.has(node)) {
      // Found cycle
      const cycleStart = path.indexOf(node);
      cycles.push([...path.slice(cycleStart), node]);
      return;
    }

    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    recursionStack.add(node);

    const neighbors = adj.get(node) ?? new Set();
    for (const neighbor of neighbors) {
      dfs(neighbor, [...path, node]);
    }

    recursionStack.delete(node);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  }

  if (cycles.length === 0) {
    return {
      type: 'circular_dependencies',
      passed: true,
      confidence: 0.9,
      details: 'No circular dependencies detected.',
    };
  }

  return {
    type: 'circular_dependencies',
    passed: false,
    confidence: 0.8,
    details: `Found ${cycles.length} circular dependency chains.`,
    issues: cycles.map(c => c.join(' → ')),
  };
}

/**
 * Check for missing type definitions
 */
export function checkMissingTypes(graph: CodeGraph): ConsistencyCheck {
  const definedTypes = new Set<string>();
  const usedTypes = new Set<string>();
  const typePatterns = ['Type', 'Interface', 'Enum', 'Class', 'Struct'];

  for (const node of graph.nodes) {
    if (typePatterns.some(p => node.id.endsWith(p))) {
      definedTypes.add(node.id);
    }
    
    // Check metadata for type references
    if (node.metadata?.type) {
      usedTypes.add(String(node.metadata.type));
    }
  }

  const missingTypes = [...usedTypes].filter(t => !definedTypes.has(t));

  if (missingTypes.length === 0) {
    return {
      type: 'missing_types',
      passed: true,
      confidence: 0.85,
      details: 'No missing type definitions found.',
    };
  }

  return {
    type: 'missing_types',
    passed: false,
    confidence: 0.75,
    details: `Found ${missingTypes.length} potentially missing types.`,
    issues: missingTypes.slice(0, 10), // Limit to 10 for display
  };
}

/**
 * Check for unresolved imports
 */
export function checkUnresolvedImports(graph: CodeGraph): ConsistencyCheck {
  const existingNodes = new Set(graph.nodes.map(n => n.id));
  const unresolved: string[] = [];

  for (const edge of graph.edges) {
    if (edge.type === 'imports') {
      // Parse import path
      const importPath = edge.target;
      
      // Check if it resolves to an existing node
      if (!existingNodes.has(importPath) && !importPath.startsWith('.')) {
        // External imports are OK
        continue;
      }
      
      if (!existingNodes.has(importPath)) {
        unresolved.push(`${edge.source} imports ${edge.target}`);
      }
    }
  }

  if (unresolved.length === 0) {
    return {
      type: 'unresolved_imports',
      passed: true,
      confidence: 0.9,
      details: 'All imports resolved.',
    };
  }

  return {
    type: 'unresolved_imports',
    passed: false,
    confidence: 0.8,
    details: `Found ${unresolved.length} potentially unresolved imports.`,
    issues: unresolved.slice(0, 10),
  };
}

/**
 * Check for dead code
 */
export function checkDeadCode(graph: CodeGraph): ConsistencyCheck {
  const referencedNodes = new Set<string>();
  
  for (const edge of graph.edges) {
    if (edge.type === 'calls' || edge.type === 'uses') {
      referencedNodes.add(edge.target);
    }
  }

  const exportedNodes = graph.nodes.filter(n => 
    n.metadata?.exported === true
  );

  const deadCode = exportedNodes.filter(n => !referencedNodes.has(n.id));

  if (deadCode.length === 0) {
    return {
      type: 'dead_code',
      passed: true,
      confidence: 0.85,
      details: 'No dead exported code found.',
    };
  }

  return {
    type: 'dead_code',
    passed: false,
    confidence: 0.7,
    details: `Found ${deadCode.length} potentially dead exported functions/classes.`,
    issues: deadCode.map(n => `${n.type}: ${n.id}`),
  };
}

/**
 * Run specific check
 */
export async function runSpecificCheck(
  type: ConsistencyCheck['type'],
  graph: CodeGraph
): Promise<ConsistencyCheck> {
  switch (type) {
    case 'orphan_nodes':
      return checkOrphanNodes(graph);
    case 'circular_dependencies':
      return checkCircularDependencies(graph);
    case 'missing_types':
      return checkMissingTypes(graph);
    case 'unresolved_imports':
      return checkUnresolvedImports(graph);
    case 'dead_code':
      return checkDeadCode(graph);
    default:
      return {
        type,
        passed: true,
        confidence: 0,
        details: 'Unknown check type.',
      };
  }
}

/**
 * Get overall health score
 */
export function calculateHealthScore(checks: ConsistencyCheck[]): {
  score: number;
  grade: string;
  details: string;
} {
  if (checks.length === 0) {
    return { score: 1, grade: 'A', details: 'No checks run.' };
  }

  const totalConfidence = checks.reduce((sum, c) => sum + c.confidence, 0);
  const avgConfidence = totalConfidence / checks.length;
  
  const passRate = checks.filter(c => c.passed).length / checks.length;
  
  // Weighted score
  const score = avgConfidence * passRate;

  let grade: string;
  if (score >= 0.9) grade = 'A';
  else if (score >= 0.8) grade = 'B';
  else if (score >= 0.7) grade = 'C';
  else if (score >= 0.5) grade = 'D';
  else grade = 'F';

  const failedChecks = checks.filter(c => !c.passed);
  const details = failedChecks.length === 0
    ? 'All checks passed.'
    : `Failed checks: ${failedChecks.map(c => c.type).join(', ')}`;

  return { score: Math.round(score * 100) / 100, grade, details };
}
