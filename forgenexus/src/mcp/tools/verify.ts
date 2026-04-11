/**
 * MCP Verification Tools for ForgeWright
 * 
 * Provides MCP tools for claim verification, confidence analysis, and freshness checks.
 */

import type { VerificationResult, ConfidenceResult } from '../../agents/types.js';
import { checkStaleness } from '../../data/freshness.js';
import { calculateConfidence } from '../../agents/confidence.js';
import { calculateSemanticEnergy } from '../../agents/semantic-energy.js';
import { extractCitations } from '../../agents/citations.js';

// ============================================================================
// Tool Definitions
// ============================================================================

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================================================
// verify_claim Tool
// ============================================================================

export const verifyClaimTool: MCPToolDefinition = {
  name: 'verify_claim',
  description: 'Verify a factual claim against evidence from the codebase',
  inputSchema: {
    type: 'object',
    properties: {
      claim: {
        type: 'string',
        description: 'The claim to verify',
      },
      evidence: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            source: { type: 'string' },
            line: { type: 'number' },
          },
        },
        description: 'Evidence supporting or contradicting the claim',
      },
    },
    required: ['claim', 'evidence'],
  },
};

/**
 * Verify a factual claim
 */
export async function verifyClaim(params: {
  claim: string;
  evidence: Array<{
    content: string;
    source: string;
    line?: number;
  }>;
}): Promise<MCPToolResult> {
  try {
    // Simple verification logic
    const evidenceMatches = params.evidence.filter(e => 
      params.claim.toLowerCase().includes(e.content.toLowerCase()) ||
      e.content.toLowerCase().includes(params.claim.toLowerCase())
    );

    const matchRatio = evidenceMatches.length / Math.max(params.evidence.length, 1);
    
    let status: 'confirmed' | 'unconfirmed' | 'uncertain';
    let reasoning: string;

    if (matchRatio >= 0.8) {
      status = 'confirmed';
      reasoning = 'Strong evidence supports this claim';
    } else if (matchRatio >= 0.3) {
      status = 'uncertain';
      reasoning = 'Partial evidence found, verification inconclusive';
    } else {
      status = 'unconfirmed';
      reasoning = 'Insufficient evidence to verify this claim';
    }

    const confidence = matchRatio;

    const result: VerificationResult = {
      status,
      confidence,
      reasoning,
      evidence: params.evidence.map(e => ({
        type: 'code' as const,
        content: e.content,
        source: e.source,
        line: e.line,
        relevance: matchRatio,
      })),
      issues: matchRatio < 0.3 ? ['Low evidence match'] : [],
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

// ============================================================================
// analyze_confidence Tool
// ============================================================================

export const analyzeConfidenceTool: MCPToolDefinition = {
  name: 'analyze_confidence',
  description: 'Calculate confidence score for generated content',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text content to analyze',
      },
      type: {
        type: 'string',
        enum: ['wiki', 'impact', 'query', 'binding'],
        description: 'Type of content',
      },
      evidence: {
        type: 'array',
        items: { type: 'string' },
        description: 'Evidence supporting the content',
      },
    },
    required: ['text', 'type'],
  },
};

/**
 * Analyze confidence of generated content
 */
export async function analyzeConfidence(params: {
  text: string;
  type: 'wiki' | 'impact' | 'query' | 'binding';
  evidence?: string[];
}): Promise<MCPToolResult> {
  try {
    // Calculate base confidence
    const baseConfidence = calculateConfidence({
      type: params.type,
      text: params.text,
      evidence: params.evidence?.map(e => ({
        type: 'code' as const,
        content: e,
        source: 'unknown',
        relevance: 0.5,
      })),
    });

    // Extract citations
    const citations = extractCitations(params.text);

    // Calculate semantic energy (simplified)
    let semanticEnergy = 0.5;
    if (params.text.length > 100) {
      // Heuristic: longer more varied text = higher uncertainty
      const words = params.text.split(/\s+/);
      const uniqueRatio = new Set(words).size / words.length;
      semanticEnergy = 1 - uniqueRatio;
    }

    // Combine scores
    const combinedScore = baseConfidence.score * 0.7 + (1 - semanticEnergy) * 0.3;

    const result: ConfidenceResult & { semanticEnergy: number } = {
      ...baseConfidence,
      score: combinedScore,
      semanticEnergy,
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Confidence analysis failed',
    };
  }
}

// ============================================================================
// check_freshness Tool
// ============================================================================

export const checkFreshnessTool: MCPToolDefinition = {
  name: 'check_freshness',
  description: 'Check the freshness of graph data',
  inputSchema: {
    type: 'object',
    properties: {
      repoPath: {
        type: 'string',
        description: 'Path to the repository',
      },
      lastIndexed: {
        type: 'string',
        description: 'ISO timestamp of last analysis',
      },
      commitHash: {
        type: 'string',
        description: 'Git commit hash at last analysis',
      },
    },
    required: ['repoPath'],
  },
};

/**
 * Check graph data freshness
 */
export async function checkFreshness(params: {
  repoPath: string;
  lastIndexed?: string;
  commitHash?: string;
}): Promise<MCPToolResult> {
  try {
    const metadata = {
      repoPath: params.repoPath,
      lastIndexed: params.lastIndexed ? new Date(params.lastIndexed) : new Date(),
      commitHash: params.commitHash ?? 'unknown',
      indexVersion: '1.0.0',
    };

    const freshness = checkStaleness(metadata);

    return {
      success: true,
      data: {
        staleness: freshness.staleness,
        lastIndexed: freshness.lastIndexed.toISOString(),
        hoursSinceIndex: freshness.hoursSinceIndex,
        freshnessScore: freshness.freshnessScore,
        warnings: freshness.warnings,
        recommendations: freshness.recommendations,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Freshness check failed',
    };
  }
}

// ============================================================================
// Citation Extraction Tool
// ============================================================================

export const extractCitationsToolDefinition: MCPToolDefinition = {
  name: 'extract_citations',
  description: 'Extract and verify citations from text',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text containing citations',
      },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            lineCount: { type: 'number' },
          },
        },
        description: 'Available source files',
      },
    },
    required: ['text'],
  },
};

export const extractCitationsTool: MCPToolDefinition = extractCitationsToolDefinition;

/**
 * Extract citations from text
 */
export async function runExtractCitations(params: {
  text: string;
  sources?: Array<{ file: string; lineCount: number }>;
}): Promise<MCPToolResult> {
  try {
    const citations = extractCitations(params.text);

    // Verify against sources if provided
    const sourceMap = new Map(
      (params.sources ?? []).map(s => [s.file, s.lineCount])
    );

    const verifiedCitations = citations.map((c) => {
      const lineCount = sourceMap.get((c as any).source ?? (c as any).file);
      const valid = lineCount !== undefined && 
        (c.line === undefined || (c.line >= 1 && c.line <= lineCount));

      return {
        ...c,
        verified: valid,
        issues: valid ? [] : lineCount === undefined 
          ? ['File not found']
          : ['Invalid line number'],
      };
    });

    const validCount = verifiedCitations.filter(c => c.verified).length;

    return {
      success: true,
      data: {
        citations: verifiedCitations,
        total: citations.length,
        valid: validCount,
        invalid: citations.length - validCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Citation extraction failed',
    };
  }
}

// ============================================================================
// Tool Registry
// ============================================================================

export const MCP_VERIFICATION_TOOLS: MCPToolDefinition[] = [
  verifyClaimTool,
  analyzeConfidenceTool,
  checkFreshnessTool,
  extractCitationsTool,
];

/**
 * Get tool handler by name
 */
export function getToolHandler(name: string): ((params: unknown) => Promise<MCPToolResult>) | undefined {
  switch (name) {
    case 'verify_claim':
      return (params) => verifyClaim(params as Parameters<typeof verifyClaim>[0]);
    case 'analyze_confidence':
      return (params) => analyzeConfidence(params as Parameters<typeof analyzeConfidence>[0]);
    case 'check_freshness':
      return (params) => checkFreshness(params as Parameters<typeof checkFreshness>[0]);
    case 'extract_citations':
      return (params) => runExtractCitations(params as Parameters<typeof runExtractCitations>[0]);
    default:
      return undefined;
  }
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  name: string,
  params: unknown
): Promise<MCPToolResult> {
  const handler = getToolHandler(name);
  
  if (!handler) {
    return {
      success: false,
      error: `Unknown tool: ${name}`,
    };
  }

  try {
    return await handler(params);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tool execution failed',
    };
  }
}

/**
 * Register all verification tools with MCP server
 */
export function registerVerificationTools(server: {
  setRequestHandler: (schema: unknown, handler: (request: unknown) => Promise<unknown>) => void;
}): void {
  for (const tool of MCP_VERIFICATION_TOOLS) {
    server.setRequestHandler(
      { type: 'object', properties: { name: { type: 'string' } } },
      async (request: unknown) => {
        const req = request as { name: string; arguments?: unknown };
        if (req.name === tool.name) {
          const result = await executeTool(tool.name, req.arguments);
          return result;
        }
        return { success: false, error: 'Tool not found' };
      }
    );
  }
}
