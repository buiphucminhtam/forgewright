/**
 * Framework Detection with Confidence Module
 * 
 * Detects frameworks with confidence scoring based on evidence strength.
 */

export interface FrameworkDetectionResult {
  framework: string;
  confidence: number;
  evidence: string[];
  warnings: string[];
  alternative?: string[];
  metadata?: {
    detectedAt: Date;
    evidenceCount: number;
    evidenceTypes: string[];
  };
}

export interface FrameworkPattern {
  name: string;
  patterns: RegExp[];
  weight: number;
  alternatives?: string[];
  priority?: number;
}

// Framework patterns with weights
const FRAMEWORK_PATTERNS: FrameworkPattern[] = [
  // JavaScript/TypeScript Frameworks
  {
    name: 'Next.js',
    patterns: [/next\.config\.(js|ts|mjs)/, /pages\/|app\//],
    weight: 0.9,
    alternatives: ['React', 'Vite'],
  },
  {
    name: 'React',
    patterns: [/react/, /jsx|tsx?/],
    weight: 0.85,
    alternatives: ['Preact', 'Solid.js'],
  },
  {
    name: 'Vue.js',
    patterns: [/vue/, /\.vue$/],
    weight: 0.85,
    alternatives: ['Nuxt.js', 'Vue 3'],
  },
  {
    name: 'Express.js',
    patterns: [/express/, /app\.get|app\.post|app\.use/],
    weight: 0.8,
    alternatives: ['Fastify', 'Koa'],
  },
  {
    name: 'NestJS',
    patterns: [/@nestjs/, /@Controller\(\)/, /@Module\(\)/],
    weight: 0.85,
    alternatives: ['Express', 'Fastify'],
  },
  {
    name: 'Svelte',
    patterns: [/svelte/],
    weight: 0.85,
    alternatives: ['SvelteKit'],
  },
  // Python Frameworks
  {
    name: 'Django',
    patterns: [/django/, /settings\.py/],
    weight: 0.9,
    alternatives: ['Flask', 'FastAPI'],
  },
  {
    name: 'Flask',
    patterns: [/flask/, /from flask import/],
    weight: 0.8,
    alternatives: ['FastAPI', 'Django'],
  },
  {
    name: 'FastAPI',
    patterns: [/fastapi/, /from fastapi import/],
    weight: 0.85,
    alternatives: ['Flask', 'Django'],
  },
  {
    name: 'FastStream',
    patterns: [/faststream/],
    weight: 0.85,
  },
  // Go Frameworks
  {
    name: 'Gin',
    patterns: [/gin-gonic/, /gin\.Default/],
    weight: 0.8,
    alternatives: ['Echo', 'Fiber'],
  },
  {
    name: 'Echo',
    patterns: [/labstack\/echo/],
    weight: 0.8,
    alternatives: ['Gin', 'Fiber'],
  },
  {
    name: 'Chi',
    patterns: [/go-chi\/chi/],
    weight: 0.8,
    alternatives: ['Gin', 'Echo'],
  },
  // Rust Frameworks
  {
    name: 'Actix-web',
    patterns: [/actix-web/, /actix-rt/],
    weight: 0.85,
    alternatives: ['Rocket', 'Axum'],
  },
  {
    name: 'Rocket',
    patterns: [/rocket/],
    weight: 0.85,
    alternatives: ['Actix-web', 'Axum'],
  },
  // Database
  {
    name: 'Prisma',
    patterns: [/prisma/],
    weight: 0.85,
    alternatives: ['TypeORM', 'Drizzle'],
  },
  {
    name: 'TypeORM',
    patterns: [/typeorm/],
    weight: 0.8,
    alternatives: ['Prisma', 'Drizzle'],
  },
];

/**
 * Detect frameworks with confidence
 */
export async function detectFrameworkWithConfidence(
  repoPath: string,
  fileContents: Map<string, string>
): Promise<FrameworkDetectionResult> {
  const scores = new Map<string, number>();
  const evidence: string[] = [];

  // Analyze each file for framework patterns
  for (const [file, content] of fileContents) {
    for (const pattern of FRAMEWORK_PATTERNS) {
      for (const regex of pattern.patterns) {
        if (regex.test(content) || regex.test(file)) {
          const currentScore = scores.get(pattern.name) ?? 0;
          scores.set(pattern.name, currentScore + pattern.weight);
          
          evidence.push(`${file}: matched ${pattern.name} pattern`);
        }
      }
    }
  }

  // Find best match
  let bestFramework = 'Unknown';
  let bestScore = 0;

  for (const [framework, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestFramework = framework;
    }
  }

  // Calculate confidence
  const confidence = calculateConfidence(bestScore, evidence.length, scores);

  // Generate warnings
  const warnings = generateWarnings(confidence, evidence.length, bestFramework, scores);

  // Find alternatives
  const frameworkPattern = FRAMEWORK_PATTERNS.find(p => p.name === bestFramework);
  const alternatives = frameworkPattern?.alternatives?.filter(
    alt => (scores.get(alt) ?? 0) > 0
  );

  return {
    framework: bestFramework,
    confidence,
    evidence: evidence.slice(0, 10), // Limit to top 10
    warnings,
    alternative: alternatives,
    metadata: {
      detectedAt: new Date(),
      evidenceCount: evidence.length,
      evidenceTypes: detectEvidenceTypes(evidence),
    },
  };
}

/**
 * Calculate confidence based on evidence strength
 */
function calculateConfidence(
  score: number,
  evidenceCount: number,
  allScores: Map<string, number>
): number {
  let confidence = 0.5; // Base confidence

  // Evidence count bonus
  if (evidenceCount >= 5) {
    confidence += 0.2;
  } else if (evidenceCount >= 3) {
    confidence += 0.1;
  } else if (evidenceCount >= 1) {
    confidence += 0.05;
  }

  // Score bonus
  if (score >= 2.0) {
    confidence += 0.2;
  } else if (score >= 1.0) {
    confidence += 0.1;
  }

  // Check if there's competition
  const sortedScores = [...allScores.entries()].sort((a, b) => b[1] - a[1]);
  if (sortedScores.length > 1) {
    const secondScore = sortedScores[1][1];
    const ratio = score / Math.max(secondScore, 0.1);
    
    if (ratio > 2) {
      confidence += 0.1; // Clear winner
    } else if (ratio < 1.5) {
      confidence -= 0.15; // Close competition
    }
  }

  // Cap at 0.95
  return Math.min(confidence, 0.95);
}

/**
 * Generate warnings based on confidence
 */
function generateWarnings(
  confidence: number,
  evidenceCount: number,
  framework: string,
  scores: Map<string, number>
): string[] {
  const warnings: string[] = [];

  if (confidence < 0.7) {
    warnings.push('Low confidence, verify manually');
  }

  if (evidenceCount < 3) {
    warnings.push('Limited evidence, more files needed for confident detection');
  }

  if (framework === 'Unknown') {
    warnings.push('No framework detected, project may use custom structure');
  }

  // Check for unusual patterns
  const sortedScores = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (sortedScores.length > 1) {
    const ratio = sortedScores[0][1] / Math.max(sortedScores[1][1], 0.1);
    if (ratio < 1.2) {
      warnings.push('Multiple frameworks detected, consider specifying explicitly');
    }
  }

  return warnings;
}

/**
 * Detect evidence types from evidence strings
 */
function detectEvidenceTypes(evidence: string[]): string[] {
  const types = new Set<string>();

  for (const e of evidence) {
    if (e.includes('package.json') || e.includes('package-lock')) {
      types.add('package');
    }
    if (e.includes('.ts') || e.includes('.tsx')) {
      types.add('typescript');
    }
    if (e.includes('.js') || e.includes('.mjs')) {
      types.add('javascript');
    }
    if (e.includes('.py')) {
      types.add('python');
    }
    if (e.includes('.go')) {
      types.add('go');
    }
  }

  return [...types];
}

/**
 * Simple framework detection without confidence
 */
export function detectFramework(
  fileContents: Map<string, string>
): { framework: string; score: number }[] {
  const scores = new Map<string, number>();

  for (const [, content] of fileContents) {
    for (const pattern of FRAMEWORK_PATTERNS) {
      for (const regex of pattern.patterns) {
        if (regex.test(content)) {
          scores.set(pattern.name, (scores.get(pattern.name) ?? 0) + pattern.weight);
        }
      }
    }
  }

  return [...scores.entries()]
    .map(([framework, score]) => ({ framework, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Get framework by file extension
 */
export function inferByExtension(files: string[]): string | undefined {
  const extCounts = new Map<string, number>();

  for (const file of files) {
    const ext = file.split('.').pop()?.toLowerCase();
    if (ext) {
      extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
    }
  }

  // Infer from extensions
  if (extCounts.get('tsx') || extCounts.get('ts')) {
    if (extCounts.get('tsx') && extCounts.get('jsx')) {
      return 'React'; // Mixed TSX/JSX
    }
    if (extCounts.get('tsx')) {
      return 'TypeScript-React';
    }
    return 'TypeScript';
  }

  if (extCounts.get('jsx')) {
    return 'React';
  }

  if (extCounts.get('py')) {
    return 'Python';
  }

  if (extCounts.get('go')) {
    return 'Go';
  }

  if (extCounts.get('rs')) {
    return 'Rust';
  }

  return undefined;
}

/**
 * Create detection result for unknown framework
 */
export function createUnknownResult(): FrameworkDetectionResult {
  return {
    framework: 'Unknown',
    confidence: 0,
    evidence: [],
    warnings: ['No framework detected', 'Project may use custom structure'],
    metadata: {
      detectedAt: new Date(),
      evidenceCount: 0,
      evidenceTypes: [],
    },
  };
}

/**
 * Validate detection result
 */
export function isConfident(result: FrameworkDetectionResult): boolean {
  return result.confidence >= 0.7 && result.framework !== 'Unknown';
}
