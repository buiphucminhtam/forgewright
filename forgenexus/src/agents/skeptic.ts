/**
 * Skeptic Agent for ForgeWright Anti-Hallucination System
 * 
 * A verification agent that critically examines claims and validates them
 * against provided evidence.
 */

import type {
  VerificationResult,
  DocumentVerification,
  ClaimVerification,
  Evidence,
  SourceReference,
  GuardedResult,
  GroundingContext,
  VerificationStatus,
} from './types.js';
import { 
  buildVerificationPrompt,
  buildDocumentVerificationPrompt,
  buildImpactVerificationPrompt,
  parseVerificationResponse,
  extractConfidenceScore,
  SKEPTIC_SYSTEM_PROMPT,
} from './prompts.js';

// ============================================================================
// Skeptic Agent
// ============================================================================

export interface SkepticAgentOptions {
  llm: {
    generate(prompt: string, options?: { temperature?: number; system?: string }): Promise<GuardedResult>;
  };
  calibration?: 'strict' | 'moderate' | 'lenient';
  maxIterations?: number;
}

export class SkepticAgent {
  private llm: SkepticAgentOptions['llm'];
  private calibration: 'strict' | 'moderate' | 'lenient';
  private maxIterations: number;
  
  constructor(options: SkepticAgentOptions) {
    this.llm = options.llm;
    this.calibration = options.calibration ?? 'moderate';
    this.maxIterations = options.maxIterations ?? 3;
  }
  
  /**
   * Verify a factual claim against evidence
   */
  async verifyClaim(params: {
    claim: string;
    evidence: Evidence[];
    sources?: Array<{ file: string; line?: number; snippet: string }>;
  }): Promise<VerificationResult> {
    const evidenceText = this.formatEvidence(params.evidence);
    const prompt = buildVerificationPrompt({
      claims: [params.claim],
      evidence: evidenceText,
    });
    
    try {
      const response = await this.llm.generate(prompt, {
        temperature: 0.1, // Low temperature for deterministic verification
        system: SKEPTIC_SYSTEM_PROMPT,
      });
      
      return this.parseVerificationResult(response.content, params.evidence);
    } catch (error) {
      return this.handleError(error as Error, params.claim);
    }
  }
  
  /**
   * Verify multiple claims at once
   */
  async verifyClaims(params: {
    claims: string[];
    evidence: Evidence[];
    sources?: Array<{ file: string; line?: number; snippet: string }>;
  }): Promise<VerificationResult> {
    const evidenceText = this.formatEvidence(params.evidence);
    const prompt = buildVerificationPrompt({
      claims: params.claims,
      evidence: evidenceText,
    });
    
    try {
      const response = await this.llm.generate(prompt, {
        temperature: 0.1,
        system: SKEPTIC_SYSTEM_PROMPT,
      });
      
      return this.parseVerificationResult(response.content, params.evidence);
    } catch (error) {
      return this.handleError(error as Error, params.claims.join('; '));
    }
  }
  
  /**
   * Verify a document against grounding context
   */
  async verifyDocument(params: {
    content: string;
    grounding: GroundingContext;
  }): Promise<DocumentVerification> {
    const evidenceText = this.formatGroundingContext(params.grounding);
    const prompt = buildDocumentVerificationPrompt({
      document: params.content,
      evidence: evidenceText,
      citationRequired: true,
    });
    
    try {
      const response = await this.llm.generate(prompt, {
        temperature: 0.1,
        system: SKEPTIC_SYSTEM_PROMPT,
      });
      
      return this.parseDocumentVerification(response.content, params.content);
    } catch (error) {
      return this.handleDocumentError(error as Error);
    }
  }
  
  /**
   * Verify an impact analysis claim
   */
  async verifyImpactClaim(params: {
    symbol: string;
    claim: string;
    graphData: {
      affectedFiles?: string[];
      callChain?: string[];
      dependencies?: string[];
    };
  }): Promise<VerificationResult> {
    const graphText = this.formatGraphData(params.graphData);
    const prompt = buildImpactVerificationPrompt({
      symbol: params.symbol,
      claim: params.claim,
      graphData: graphText,
    });
    
    try {
      const response = await this.llm.generate(prompt, {
        temperature: 0.1,
        system: SKEPTIC_SYSTEM_PROMPT,
      });
      
      const parsed = parseVerificationResponse(response.content);
      
      return {
        status: parsed.status,
        confidence: extractConfidenceScore(response.content),
        reasoning: parsed.reasoning,
        evidence: [],
        issues: parsed.issues,
      };
    } catch (error) {
      return this.handleError(error as Error, params.claim);
    }
  }
  
  /**
   * Verify citations in content against sources
   */
  async verifyCitations(params: {
    content: string;
    sources: Map<string, { lineCount: number; content: string }>;
  }): Promise<{
    valid: boolean;
    issues: string[];
    verifiedCitations: number;
    totalCitations: number;
  }> {
    const citationPattern = /\[source:([^\]:]+)(?::(\d+))?\]/g;
    const citations: Array<{ file: string; line?: number }> = [];
    let match;
    
    // Extract all citations
    while ((match = citationPattern.exec(params.content)) !== null) {
      citations.push({
        file: match[1],
        line: match[2] ? parseInt(match[2], 10) : undefined,
      });
    }
    
    const issues: string[] = [];
    let verifiedCount = 0;
    
    // Verify each citation
    for (const citation of citations) {
      const source = params.sources.get(citation.file);
      
      if (!source) {
        issues.push(`Citation file not found: ${citation.file}`);
        continue;
      }
      
      if (citation.line && (citation.line < 1 || citation.line > source.lineCount)) {
        issues.push(`Invalid line number ${citation.line} in ${citation.file} (max: ${source.lineCount})`);
        continue;
      }
      
      verifiedCount++;
    }
    
    return {
      valid: issues.length === 0,
      issues,
      verifiedCitations: verifiedCount,
      totalCitations: citations.length,
    };
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  private formatEvidence(evidence: Evidence[]): string {
    if (evidence.length === 0) {
      return 'No evidence provided.';
    }
    
    return evidence.map((e, i) => 
      `[Evidence ${i + 1}] (${e.type})\nFile: ${e.source}${e.line ? `:${e.line}` : ''}\n${e.content}`
    ).join('\n\n');
  }
  
  private formatGroundingContext(context: GroundingContext): string {
    const parts: string[] = [];
    
    parts.push(`Repository: ${context.repoPath}`);
    parts.push(`Relevance: ${(context.relevance * 100).toFixed(0)}%`);
    parts.push(`Freshness: ${context.freshness}`);
    parts.push(`\nEvidence:\n`);
    
    for (const chunk of context.chunks) {
      parts.push(`[Source: ${chunk.file}:${chunk.lineStart}-${chunk.lineEnd}]`);
      parts.push(chunk.text);
      parts.push('');
    }
    
    return parts.join('\n');
  }
  
  private formatGraphData(data: {
    affectedFiles?: string[];
    callChain?: string[];
    dependencies?: string[];
  }): string {
    const parts: string[] = [];
    
    if (data.affectedFiles && data.affectedFiles.length > 0) {
      parts.push('Affected Files:');
      data.affectedFiles.forEach(f => parts.push(`  - ${f}`));
    }
    
    if (data.callChain && data.callChain.length > 0) {
      parts.push('\nCall Chain:');
      parts.push(data.callChain.join(' → '));
    }
    
    if (data.dependencies && data.dependencies.length > 0) {
      parts.push('\nDependencies:');
      data.dependencies.forEach(d => parts.push(`  - ${d}`));
    }
    
    return parts.join('\n') || 'No graph data available';
  }
  
  private parseVerificationResult(content: string, evidence: Evidence[]): VerificationResult {
    const parsed = parseVerificationResponse(content);
    
    // Adjust confidence based on calibration
    let confidence = extractConfidenceScore(content);
    if (this.calibration === 'strict') {
      confidence = Math.min(confidence, 0.85);
    } else if (this.calibration === 'lenient') {
      confidence = Math.min(1, confidence * 1.1);
    }
    
    // Determine status
    let status: VerificationStatus = parsed.status;
    if (status === 'uncertain' && this.calibration === 'strict') {
      status = 'unconfirmed';
    }
    
    // Filter evidence to only relevant ones
    const relevantEvidence = evidence.slice(0, 5); // Limit to top 5
    
    return {
      status,
      confidence: Math.min(1, Math.max(0, confidence)),
      reasoning: parsed.reasoning || 'Verification completed',
      evidence: relevantEvidence,
      issues: parsed.issues,
    };
  }
  
  private parseDocumentVerification(content: string, originalContent: string): DocumentVerification {
    const claims = this.extractClaims(originalContent);
    const claimVerifications: ClaimVerification[] = [];
    const issues: string[] = [];
    
    // Parse each claim
    for (const claim of claims) {
      // Simple check: does the claim match any evidence pattern?
      const hasEvidence = /source:\S+/i.test(content) || /\[NOT_VERIFIED\]/i.test(claim);
      
      claimVerifications.push({
        claim,
        verified: hasEvidence,
        status: hasEvidence ? 'confirmed' : 'uncertain',
        evidence: [],
        issues: hasEvidence ? [] : ['Claim not verified'],
        sourceReferences: [],
      });
    }
    
    // Check for NOT_VERIFIED markers
    const unverifiedCount = (content.match(/\[NOT_VERIFIED\]/gi) || []).length;
    if (unverifiedCount > 0) {
      issues.push(`${unverifiedCount} unverified claims found`);
    }
    
    // Check for missing citations
    const citationCount = (content.match(/\[source:/gi) || []).length;
    if (citationCount === 0 && claims.length > 0) {
      issues.push('No citations found');
    }
    
    const verifiedCount = claimVerifications.filter(c => c.verified).length;
    const confidence = claims.length > 0 ? verifiedCount / claims.length : 1;
    
    return {
      verified: issues.length === 0 && verifiedCount === claims.length,
      confidence,
      claims: claimVerifications,
      issues,
      warnings: unverifiedCount > 0 ? [`${unverifiedCount} claims marked as unverified`] : [],
    };
  }
  
  private extractClaims(content: string): string[] {
    // Simple claim extraction - split by sentences
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    return sentences.map(s => s.trim());
  }
  
  private handleError(error: Error, claim: string): VerificationResult {
    return {
      status: 'uncertain',
      confidence: 0,
      reasoning: `Verification failed: ${error.message}`,
      evidence: [],
      issues: [`Error verifying claim: ${claim}`],
      warnings: ['Verification system encountered an error'],
    };
  }
  
  private handleDocumentError(error: Error): DocumentVerification {
    return {
      verified: false,
      confidence: 0,
      claims: [],
      issues: [`Verification failed: ${error.message}`],
      warnings: ['Document verification failed'],
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSkepticAgent(options: SkepticAgentOptions): SkepticAgent {
  return new SkepticAgent(options);
}
