/**
 * Synthesizer Agent for ForgeWright Anti-Hallucination System
 * 
 * Generates accurate content based on verified evidence.
 */

import type {
  GuardedResult,
  Citation,
  GroundingContext,
  TaskType,
} from './types.js';
import { buildSynthesisPrompt, buildRefinePrompt } from './prompts.js';

// ============================================================================
// Synthesizer Agent
// ============================================================================

export interface SynthesizerOptions {
  llm: {
    generate(prompt: string, options?: { temperature?: number; system?: string }): Promise<GuardedResult>;
  };
  temperature?: number;
  citationStyle?: 'inline' | 'numbered' | 'footnote';
}

export class SynthesizerAgent {
  private llm: SynthesizerOptions['llm'];
  private temperature: number;
  private citationStyle: 'inline' | 'numbered' | 'footnote';

  constructor(options: SynthesizerOptions) {
    this.llm = options.llm;
    this.temperature = options.temperature ?? 0.3;
    this.citationStyle = options.citationStyle ?? 'inline';
  }

  /**
   * Synthesize content based on verified claims
   */
  async synthesize(params: {
    type: TaskType;
    task: string;
    verifiedClaims: Array<{
      claim: string;
      sources: string[];
    }>;
    context: GroundingContext;
  }): Promise<{
    content: string;
    citations: Citation[];
  }> {
    const evidence = this.buildEvidence(params.context);
    
    const prompt = buildSynthesisPrompt({
      type: params.type,
      task: params.task,
      evidence,
      constraints: [
        'Only describe functionality present in the evidence',
        'Cite specific sources for each claim',
        'Mark unverified claims with [NOT_VERIFIED]',
        'Avoid speculation',
      ],
    });

    const response = await this.llm.generate(prompt, {
      temperature: this.temperature,
      system: 'You are a precise documentation synthesizer. Generate accurate content based ONLY on provided evidence.',
    });

    const citations = this.extractCitations(response.content, params.context);

    return {
      content: response.content,
      citations,
    };
  }

  /**
   * Refine content based on issues
   */
  async refine(params: {
    draft: string;
    issues: string[];
    context: GroundingContext;
  }): Promise<string> {
    const evidence = this.buildEvidence(params.context);

    const prompt = buildRefinePrompt({
      draft: params.draft,
      issues: params.issues,
      evidence,
    });

    const response = await this.llm.generate(prompt, {
      temperature: this.temperature,
    });

    return response.content;
  }

  /**
   * Build evidence string from context
   */
  private buildEvidence(context: GroundingContext): string {
    const parts: string[] = [];

    parts.push(`Repository: ${context.repoPath}`);
    parts.push(`Relevance: ${(context.relevance * 100).toFixed(0)}%`);
    parts.push(`Freshness: ${context.freshness}`);
    parts.push('\n---\n');

    for (const chunk of context.chunks) {
      parts.push(`### [Source: ${chunk.file}:${chunk.lineStart}-${chunk.lineEnd}]`);
      parts.push(chunk.text);
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Extract citations from content
   */
  private extractCitations(
    content: string,
    context: GroundingContext
  ): Citation[] {
    const citations: Citation[] = [];
    const pattern = /\[source:([^\]:]+)(?::(\d+))?\]/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const file = match[1];
      const line = match[2] ? parseInt(match[2], 10) : undefined;

      // Check if this is a valid source
      const isValid = context.chunks.some((c: { file: string }) => c.file === file);

      citations.push({
        id: `cite-${citations.length + 1}`,
        claim: this.extractClaim(content, match[0]),
        source: file,
        line,
        verified: isValid,
      });
    }

    return citations;
  }

  /**
   * Extract the claim associated with a citation
   */
  private extractClaim(content: string, citation: string): string {
    const index = content.indexOf(citation);
    if (index === -1) return '';

    const start = Math.max(0, index - 100);
    const end = Math.min(content.length, index + citation.length + 100);
    const context = content.slice(start, end);

    const sentenceMatch = context.match(/[^.!?]*\[[^\]]+\][^.!?]*[.!?]?/);
    return sentenceMatch ? sentenceMatch[0].trim() : context.trim();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSynthesizer(options: SynthesizerOptions): SynthesizerAgent {
  return new SynthesizerAgent(options);
}
