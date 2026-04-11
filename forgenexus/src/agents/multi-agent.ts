/**
 * Multi-Agent Workflow for ForgeWright Anti-Hallucination System
 * 
 * Orchestrates synthesizer and skeptic agents in a verification loop.
 */

import type {
  WorkflowConfig,
  WorkflowResult,
  GroundingContext,
  TaskType,
  VerificationResult,
  Citation,
  Evidence,
} from './types.js';

// ============================================================================
// Multi-Agent Workflow
// ============================================================================

export interface MultiAgentOptions {
  synthesizer: {
    synthesize(params: {
      type: TaskType;
      task: string;
      verifiedClaims: Array<{ claim: string; sources: string[] }>;
      context: GroundingContext;
    }): Promise<{ content: string; citations: Citation[] }>;
    refine(params: {
      draft: string;
      issues: string[];
      context: GroundingContext;
    }): Promise<string>;
  };
  skeptic: {
    verifyDocument(params: {
      content: string;
      grounding: GroundingContext;
    }): Promise<VerificationResult>;
    verifyClaim(params: {
      claim: string;
      evidence: Evidence[];
      sources?: Array<{ file: string; line?: number; snippet: string }>;
    }): Promise<VerificationResult>;
  };
  maxIterations?: number;
  confidenceThreshold?: number;
}

export class MultiAgentWorkflow {
  private synthesizer: MultiAgentOptions['synthesizer'];
  private skeptic: MultiAgentOptions['skeptic'];
  private maxIterations: number;
  private confidenceThreshold: number;

  constructor(options: MultiAgentOptions) {
    this.synthesizer = options.synthesizer;
    this.skeptic = options.skeptic;
    this.maxIterations = options.maxIterations ?? 3;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.8;
  }

  /**
   * Execute the multi-agent workflow
   */
  async execute(params: {
    task: string;
    type: TaskType;
    context: GroundingContext;
  }): Promise<WorkflowResult> {
    const { task, type, context } = params;
    
    let draft = '';
    let iterations = 0;
    const verificationResults: VerificationResult[] = [];
    const allCitations: Citation[] = [];
    const allWarnings: string[] = [];

    // Initial synthesis
    const initial = await this.synthesizer.synthesize({
      type: type as 'wiki' | 'impact' | 'query',
      task,
      verifiedClaims: [],
      context,
    });
    
    draft = initial.content;
    allCitations.push(...initial.citations);
    iterations = 1;

    // Verification loop
    let converged = false;
    let currentConfidence = 0;

    for (let i = 0; i < this.maxIterations; i++) {
      // Verify current draft
      const verification = await this.skeptic.verifyDocument({
        content: draft,
        grounding: context,
      });

      verificationResults.push(verification);
      currentConfidence = verification.confidence;
      allWarnings.push(...(verification.warnings ?? []));

      // Check if we meet threshold
      if (verification.confidence >= this.confidenceThreshold) {
        converged = true;
        break;
      }

      // If not verified, try to refine
      if (!verification.verified && verification.issues.length > 0) {
        const refined = await this.synthesizer.refine({
          draft,
          issues: verification.issues,
          context,
        });
        
        draft = refined;
        iterations++;
      } else {
        // Verified but issues remain
        break;
      }
    }

    return {
      content: draft,
      iterations,
      converged,
      finalConfidence: currentConfidence,
      verificationResults,
      citations: allCitations,
      warnings: allWarnings,
    };
  }

  /**
   * Run a quick verification without full synthesis
   */
  async verify(params: {
    content: string;
    context: GroundingContext;
  }): Promise<{
    verified: boolean;
    confidence: number;
    issues: string[];
  }> {
    const result = await this.skeptic.verifyDocument({ content: params.content, grounding: params.context });
    return {
      verified: result.verified ?? (result.status === 'confirmed'),
      confidence: result.confidence,
      issues: result.issues,
    };
  }

  /**
   * Check if workflow should continue
   */
  shouldContinue(
    currentIteration: number,
    confidence: number
  ): boolean {
    return (
      currentIteration < this.maxIterations &&
      confidence < this.confidenceThreshold
    );
  }

  /**
   * Get configuration
   */
  getConfig(): { maxIterations: number; confidenceThreshold: number } {
    return {
      maxIterations: this.maxIterations,
      confidenceThreshold: this.confidenceThreshold,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMultiAgentWorkflow(
  options: MultiAgentOptions
): MultiAgentWorkflow {
  return new MultiAgentWorkflow(options);
}
