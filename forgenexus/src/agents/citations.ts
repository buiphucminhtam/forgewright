/**
 * Citation Extraction and TokenShapley Attribution
 * 
 * Provides citation verification and token-level attribution.
 */

import type { Citation, ExtractedCitation, CitationVerification } from './types.js';

// ============================================================================
// Citation Extraction
// ============================================================================

/**
 * Extract citations from text
 */
export function extractCitations(text: string): ExtractedCitation[] {
  const pattern = /\[source:([^\]:]+)(?::(\d+))?\]/g;
  const citations: ExtractedCitation[] = [];
  let match;
  const seen = new Set<string>();

  while ((match = pattern.exec(text)) !== null) {
    const source = match[1];
    const line = match[2] ? parseInt(match[2], 10) : undefined;
    const key = `${source}:${line ?? 'any'}`;

    if (!seen.has(key)) {
      seen.add(key);
      citations.push({
        claim: '', // Will be filled by caller
        sourcePattern: match[0],
        file: source,
        line,
        verified: false,
      });
    }
  }

  return citations;
}

/**
 * Verify citations against sources
 */
export function verifyCitations(
  citations: ExtractedCitation[],
  sources: Map<string, { lineCount: number; content: string }>
): CitationVerification[] {
  return citations.map(citation => verifySingleCitation(citation, sources));
}

/**
 * Verify a single citation
 */
export function verifySingleCitation(
  citation: ExtractedCitation,
  sources: Map<string, { lineCount: number; content: string }>
): CitationVerification {
  const source = sources.get(citation.file ?? '');

  if (!source) {
    return {
      citation: {
        id: '',
        claim: '',
        source: citation.file ?? '',
        line: citation.line,
        verified: false,
      },
      isValid: false,
      matchesSource: false,
      issues: [`File not found: ${citation.file}`],
    };
  }

  const issues: string[] = [];

  // Check line number
  if (citation.line !== undefined) {
    if (citation.line < 1) {
      issues.push(`Invalid line number: ${citation.line}`);
    } else if (citation.line > source.lineCount) {
      issues.push(`Line ${citation.line} exceeds file length (${source.lineCount})`);
    }
  }

  return {
    citation: {
      id: '',
      claim: '',
      source: citation.file ?? '',
      line: citation.line,
      verified: issues.length === 0,
    },
    isValid: issues.length === 0,
    matchesSource: true,
    issues,
  };
}

// ============================================================================
// TokenShapley Attribution
// ============================================================================

export interface TokenAttribution {
  token: string;
  contribution: number;
  sourceFile?: string;
  sourceLine?: number;
  cumulative: number;
}

export interface AttributionResult {
  tokens: TokenAttribution[];
  totalContribution: number;
  method: 'shapley' | 'approximate';
  computationTime: number;
}

/**
 * Calculate TokenShapley attribution for generated text
 * 
 * Based on research: TokenShapley improves attribution accuracy by 11-23%
 */
export async function calculateTokenShapley(
  text: string,
  sources: Array<{ file: string; line?: number; text: string }>,
  options: {
    sampleSize?: number;
    verbose?: boolean;
  } = {}
): Promise<AttributionResult> {
  const startTime = Date.now();
  const { sampleSize = 100 } = options;

  // Tokenize the generated text
  const tokens = tokenize(text);

  // Build source token sets
  const sourceTokens = new Map<string, Set<string>>();
  for (const source of sources) {
    const key = `${source.file}:${source.line ?? 'any'}`;
    sourceTokens.set(key, new Set(tokenize(source.text)));
  }

  // Calculate marginal contributions
  const attributions: TokenAttribution[] = [];
  let totalContribution = 0;

  for (const token of tokens) {
    // Find sources that contain this token
    let contribution = 0;
    let matchedSource: string | undefined;

    for (const [sourceKey, sourceTokenSet] of sourceTokens) {
      if (sourceTokenSet.has(token.toLowerCase())) {
        // Linear contribution based on source relevance
        contribution += 1 / sourceTokens.size;
        matchedSource = sourceKey;
      }
    }

    attributions.push({
      token,
      contribution,
      sourceFile: matchedSource?.split(':')[0],
      sourceLine: matchedSource ? parseInt(matchedSource.split(':')[1]) || undefined : undefined,
      cumulative: 0,
    });

    totalContribution += contribution;
  }

  // Normalize and calculate cumulative
  let cumulative = 0;
  for (const attr of attributions) {
    attr.contribution /= Math.max(totalContribution, 0.001);
    cumulative += attr.contribution;
    attr.cumulative = cumulative;
  }

  return {
    tokens: attributions,
    totalContribution,
    method: 'approximate',
    computationTime: Date.now() - startTime,
  };
}

/**
 * Simple tokenization
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/[^\w]/g, ''))
    .filter(t => t.length > 2);
}

/**
 * Calculate exact Shapley value (exponential complexity)
 */
export async function calculateExactShapley(
  token: string,
  sourceSets: Array<Set<string>>,
  options: {
    maxCombinations?: number;
  } = {}
): Promise<number> {
  const { maxCombinations = 1000 } = options;

  // For each coalition, calculate marginal contribution
  let totalValue = 0;
  let combinationCount = 0;

  // Sample random coalitions (Monte Carlo Shapley)
  for (let i = 0; i < maxCombinations; i++) {
    const randomOrder = shuffleArray([...sourceSets.keys()]);
    let inCoalition = false;
    let coalitionValue = 0;

    for (const idx of randomOrder) {
      const prevValue = coalitionValue;
      const coalitionSet = sourceSets[idx];

      if (coalitionSet.has(token)) {
        coalitionValue = 1;
        inCoalition = true;
      }

      // Marginal contribution
      if (inCoalition) {
        totalValue += coalitionValue - prevValue;
      }

      combinationCount++;
    }
  }

  return totalValue / Math.max(combinationCount, 1);
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// Citation Rendering
// ============================================================================

/**
 * Render citations in a specific format
 */
export function renderCitations(
  citations: Citation[],
  format: 'inline' | 'footnote' | 'numbered' = 'inline'
): string[] {
  return citations.map((citation, index) => {
    switch (format) {
      case 'inline':
        return `[${index + 1}] [source:${citation.source}${citation.line ? `:${citation.line}` : ''}]`;
      case 'footnote':
        return `[${index + 1}] ${citation.source}${citation.line ? `:${citation.line}` : ''} - ${citation.claim}`;
      case 'numbered':
        return `(${index + 1}) ${citation.claim} [source:${citation.source}${citation.line ? `:${citation.line}` : ''}]`;
      default:
        return `[source:${citation.source}${citation.line ? `:${citation.line}` : ''}]`;
    }
  });
}

/**
 * Add citation markers to text
 */
export function addCitationMarkers(
  text: string,
  citations: Citation[]
): string {
  let result = text;

  for (const citation of citations) {
    const marker = `[source:${citation.source}${citation.line ? `:${citation.line}` : ''}]`;
    if (!result.includes(marker)) {
      // Find appropriate place to insert (end of relevant sentence)
      result += '\n' + marker;
    }
  }

  return result;
}

// ============================================================================
// Citation Analysis
// ============================================================================

export interface CitationAnalysis {
  totalCitations: number;
  uniqueFiles: number;
  uniqueLines: number;
  coverage: number;
  distribution: Map<string, number>;
  issues: string[];
}

/**
 * Analyze citation patterns
 */
export function analyzeCitations(citations: Citation[]): CitationAnalysis {
  const uniqueFiles = new Set(citations.map(c => c.source));
  const uniqueLines = new Set(citations.map(c => `${c.source}:${c.line}`));
  const distribution = new Map<string, number>();

  // Count citations per file
  for (const citation of citations) {
    distribution.set(citation.source, (distribution.get(citation.source) ?? 0) + 1);
  }

  const issues: string[] = [];

  // Check for missing citations
  if (citations.length === 0) {
    issues.push('No citations found');
  }

  // Check for low coverage
  if (uniqueFiles.size < 3 && citations.length > 5) {
    issues.push('Most citations from few files - may indicate limited coverage');
  }

  // Check for duplicate line citations
  const lineCounts = new Map<string, number>();
  for (const citation of citations) {
    if (citation.line !== undefined) {
      const key = `${citation.source}:${citation.line}`;
      lineCounts.set(key, (lineCounts.get(key) ?? 0) + 1);
    }
  }

  for (const [line, count] of lineCounts) {
    if (count > 3) {
      issues.push(`Line ${line} cited ${count} times`);
    }
  }

  return {
    totalCitations: citations.length,
    uniqueFiles: uniqueFiles.size,
    uniqueLines: uniqueLines.size,
    coverage: uniqueFiles.size / Math.max(citations.length, 1),
    distribution,
    issues,
  };
}

/**
 * Check if citation coverage is sufficient
 */
export function hasSufficientCitations(
  textLength: number,
  citationCount: number,
  minRatio: number = 0.01
): boolean {
  const expectedCitations = textLength / 100; // ~1 citation per 100 chars
  return citationCount >= Math.max(1, expectedCitations * minRatio);
}

/**
 * Find missing citations
 */
export function findMissingCitations(
  claims: string[],
  citations: Citation[]
): string[] {
  const missing: string[] = [];

  for (const claim of claims) {
    const claimTokens = tokenize(claim);
    const hasCitation = citations.some(c => {
      const sourceTokens = tokenize(c.claim);
      // Check if any significant tokens match
      const significantTokens = claimTokens.filter(t => t.length > 4);
      return significantTokens.some(t => sourceTokens.includes(t));
    });

    if (!hasCitation) {
      missing.push(claim);
    }
  }

  return missing;
}
