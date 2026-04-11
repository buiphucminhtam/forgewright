/**
 * LLM Client with Guardrails for ForgeWright Anti-Hallucination System
 * 
 * Provides a unified interface for LLM interactions with built-in guardrails,
 * citation extraction, and confidence estimation.
 */

import type {
  LLMClientConfig,
  Guardrails,
  GuardedResult,
  Citation,
  Evidence,
} from './types.js';
import { 
  DEFAULT_GUARDRAILS,
} from './types.js';
import { 
  CITATION_PATTERN, 
  applyGuardrails 
} from './prompts.js';

// ============================================================================
// LLM Client Implementation
// ============================================================================

export interface LLMResponse {
  content: string;
  raw: unknown;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export class BaseLLMClient {
  protected config: LLMClientConfig;
  
  constructor(config?: LLMClientConfig) {
    this.config = config ?? { provider: 'anthropic', model: 'base', maxRetries: 0, timeout: 0 };
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    throw new Error('Not implemented');
  }
  
  supportsLogits?(): boolean;
  getPenultimateLogits?(text: string): Promise<number[]>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  system?: string;
}

// ============================================================================
// Anthropic Client
// ============================================================================

export class AnthropicClient extends BaseLLMClient {
  private client: unknown; // Anthropic SDK client
  
  constructor(config: LLMClientConfig) {
    super();
    this.config = config;
    // Client initialization would happen here
    // For now, we'll use a placeholder
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    // In production, this would call the Anthropic API
    // For now, return a mock response
    return {
      content: `Mock response for: ${prompt.slice(0, 100)}...`,
      raw: {},
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  }
}

// ============================================================================
// OpenAI Client
// ============================================================================

export class OpenAIClient extends BaseLLMClient {
  constructor(config: LLMClientConfig) {
    super();
    this.config = config;
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    // In production, this would call the OpenAI API
    return {
      content: `Mock response for: ${prompt.slice(0, 100)}...`,
      raw: {},
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  }
}

// ============================================================================
// Guarded LLM Client
// ============================================================================

export interface GuardedLLMClientOptions {
  client: BaseLLMClient;
  guardrails: Guardrails;
  onError?: (error: Error) => void;
}

export class GuardedLLMClient {
  private client: BaseLLMClient;
  private guardrails: Guardrails;
  private onError?: (error: Error) => void;
  
  constructor(options: GuardedLLMClientOptions) {
    this.client = options.client;
    this.guardrails = options.guardrails;
    this.onError = options.onError;
  }
  
  /**
   * Generate content with guardrails applied
   */
  async generate(prompt: string, options?: GenerateOptions): Promise<GuardedResult> {
    const guardedPrompt = applyGuardrails(prompt, this.guardrails);
    
    try {
      const response = await this.client.generate(guardedPrompt, {
        temperature: options?.temperature ?? 0.3, // Lower temp for factual tasks
        maxTokens: options?.maxTokens ?? 4096,
        system: options?.system,
      });
      
      return this.processResponse(response);
    } catch (error) {
      this.onError?.(error as Error);
      return this.handleError(error as Error);
    }
  }
  
  /**
   * Generate with structured context
   */
  async generateWithContext(
    context: {
      system?: string;
      user?: string;
      examples?: Array<{ input: string; output: string }>;
    }
  ): Promise<GuardedResult> {
    const parts: string[] = [];
    
    if (context.system) {
      parts.push(`System:\n${context.system}`);
    }
    
    if (context.examples && context.examples.length > 0) {
      parts.push('Examples:');
      context.examples.forEach((ex, i) => {
        parts.push(`Example ${i + 1}:\nInput: ${ex.input}\nOutput: ${ex.output}`);
      });
    }
    
    if (context.user) {
      parts.push(`User Request:\n${context.user}`);
    }
    
    const prompt = parts.join('\n\n');
    return this.generate(prompt);
  }
  
  /**
   * Check if the client supports logit extraction
   */
  supportsLogits(): boolean {
    return typeof this.client.supportsLogits === 'function' && this.client.supportsLogits();
  }
  
  /**
   * Get penultimate layer logits for uncertainty estimation
   */
  async getPenultimateLogits(text: string): Promise<number[]> {
    if (!this.supportsLogits()) {
      throw new Error('This client does not support logit extraction');
    }
    return this.client.getPenultimateLogits!(text);
  }
  
  /**
   * Process raw LLM response
   */
  private processResponse(response: LLMResponse): GuardedResult {
    const content = response.content;
    const citations = this.extractCitations(content);
    const confidence = this.estimateConfidence(content, citations);
    
    return {
      content,
      confidence,
      citations,
      warnings: this.generateWarnings(content, citations),
      verified: confidence >= 0.7,
      rawResponse: response.raw,
      model: (this.client as any).config.model,
      usage: response.usage,
    };
  }
  
  /**
   * Extract citations from content
   */
  private extractCitations(content: string): Citation[] {
    const citations: Citation[] = [];
    const seen = new Set<string>();
    let match;
    const regex = new RegExp(CITATION_PATTERN);
    
    while ((match = regex.exec(content)) !== null) {
      const source = match[1];
      const line = match[2] ? parseInt(match[2], 10) : undefined;
      const key = `${source}:${line ?? 'any'}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        citations.push({
          id: `cite-${citations.length + 1}`,
          claim: this.extractClaimForCitation(content, match[0]),
          source,
          line,
          verified: true, // Initially assume verified
        });
      }
    }
    
    return citations;
  }
  
  /**
   * Extract the claim associated with a citation
   */
  private extractClaimForCitation(content: string, citation: string): string {
    // Find text near the citation
    const citationIndex = content.indexOf(citation);
    if (citationIndex === -1) return '';
    
    const start = Math.max(0, citationIndex - 100);
    const end = Math.min(content.length, citationIndex + citation.length + 100);
    const context = content.slice(start, end);
    
    // Extract the sentence containing the citation
    const sentenceMatch = context.match(/[^.!?]*\[[^\]]+\][^.!?]*[.!?]?/);
    return sentenceMatch ? sentenceMatch[0].trim() : context.trim();
  }
  
  /**
   * Estimate confidence based on content and citations
   */
  private estimateConfidence(content: string, citations: Citation[]): number {
    let score = 0.5; // Base score
    
    // Citation bonus
    const citationRatio = citations.length / Math.max(1, content.split(/\s+/).length / 10);
    score += Math.min(0.3, citationRatio * 0.5);
    
    // NOT_VERIFIED penalty
    if (/\[NOT_VERIFIED\]/i.test(content)) {
      score -= 0.3;
    }
    
    // Uncertainty markers
    if (/uncertain|unclear|might|may|could be/i.test(content)) {
      score -= 0.1;
    }
    
    // Positive indicators
    if (/\bconfirmed|verified|verified:|source:/i.test(content)) {
      score += 0.1;
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Generate warnings based on content analysis
   */
  private generateWarnings(content: string, citations: Citation[]): string[] {
    const warnings: string[] = [];
    
    if (citations.length === 0 && this.guardrails.citationRequired) {
      warnings.push('No citations found but citations are required');
    }
    
    if (/\[NOT_VERIFIED\]/i.test(content)) {
      warnings.push('Content contains unverified claims');
    }
    
    if (/speculate|guess|assume/i.test(content.toLowerCase())) {
      warnings.push('Content may contain speculation');
    }
    
    const unresolvedCitations = citations.filter(c => !c.verified);
    if (unresolvedCitations.length > 0) {
      warnings.push(`${unresolvedCitations.length} citations could not be verified`);
    }
    
    return warnings;
  }
  
  /**
   * Handle errors gracefully
   */
  private handleError(error: Error): GuardedResult {
    const { fallbackBehavior } = this.guardrails;
    
    return {
      content: fallbackBehavior === 'refuse' 
        ? 'UNABLE_TO_VERIFY: Request could not be completed.'
        : fallbackBehavior === 'clarify'
        ? 'UNCERTAIN: Additional information needed to verify.'
        : 'Content generation completed with limitations. Some claims may not be verified.',
      confidence: 0,
      citations: [],
      warnings: [`Error: ${error.message}`],
      verified: false,
      rawResponse: null,
      model: (this.client as any).config.model,
    };
  }
}

// ============================================================================
// Mock LLM Client for Testing
// ============================================================================

export interface MockResponse {
  content: string;
  confidence?: number;
  citations?: Citation[];
  delay?: number;
}

export class MockLLMClient extends BaseLLMClient {
  private responses: Map<string, MockResponse>;
  private defaultResponse: MockResponse;
  private callHistory: Array<{ prompt: string; timestamp: Date }>;
  
  constructor(config?: Partial<LLMClientConfig>) {
    super();
    this.config = {
      provider: 'anthropic' as LLMClientConfig['provider'],
      model: 'mock',
      maxRetries: 0,
      timeout: 5000,
      ...config,
    };
    
    this.responses = new Map();
    this.defaultResponse = { content: 'Mock response' };
    this.callHistory = [];
    
    // Add some default response patterns
    this.addResponse(/verify.*claim/i, {
      content: `VERIFICATION RESULT
STATUS: CONFIRMED
REASONING: Evidence supports the claim
EVIDENCE: Source file contains matching implementation
ISSUES: None`,
      confidence: 0.9,
    });
    
    this.addResponse(/generate.*docs?/i, {
      content: `# Documentation

## Summary
This module provides authentication functionality.

## Usage
Import the module and call the auth functions.

## Functions
- [source:auth/login.ts:10] login() - Authenticates users
- [source:auth/logout.ts:5] logout() - Ends user session

## Notes
[NOT_VERIFIED] Password reset functionality needs verification`,
      confidence: 0.75,
      citations: [
        { id: '1', claim: 'login function', source: 'auth/login.ts', line: 10, verified: true },
        { id: '2', claim: 'logout function', source: 'auth/logout.ts', line: 5, verified: true },
      ],
    });
    
    this.addResponse(/impact.*analysis/i, {
      content: `IMPACT ANALYSIS

Symbol: auth.validateToken
Affected Files: 5
Confidence: HIGH

Files:
- auth/middleware.ts (calls validateToken)
- api/auth.ts (imports from auth)
- tests/auth.test.ts (tests validateToken)
- docs/api.md (documents the function)
- config/auth.ts (configures token validation)

[source:auth/middleware.ts:15]`,
      confidence: 0.85,
    });
  }
  
  /**
   * Add a response pattern
   */
  addResponse(pattern: RegExp, response: MockResponse): void {
    this.responses.set(pattern.source, response);
  }
  
  /**
   * Set the default response
   */
  setDefaultResponse(response: MockResponse): void {
    this.defaultResponse = response;
  }
  
  /**
   * Get call history
   */
  getCallHistory(): Array<{ prompt: string; timestamp: Date }> {
    return [...this.callHistory];
  }
  
  /**
   * Clear call history
   */
  clearHistory(): void {
    this.callHistory = [];
  }
  
  /**
   * Generate a mock response
   */
  async generate(prompt: string, _options?: GenerateOptions): Promise<LLMResponse> {
    // Record the call
    this.callHistory.push({ prompt, timestamp: new Date() });
    
    // Find matching response
    let response = this.defaultResponse;
    for (const [pattern, mockResponse] of this.responses) {
      if (new RegExp(pattern).test(prompt)) {
        response = mockResponse;
        break;
      }
    }
    
    // Simulate delay if specified
    if (response.delay) {
      await new Promise(resolve => setTimeout(resolve, response.delay));
    }
    
    return {
      content: response.content,
      raw: { mock: true },
      usage: {
        inputTokens: prompt.split(/\s+/).length,
        outputTokens: response.content.split(/\s+/).length,
      },
    };
  }
  
  /**
   * Mock client supports logits (returns false for mock)
   */
  supportsLogits(): boolean {
    return false;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createGuardedLLMClient(
  provider: LLMClientConfig['provider'],
  options: {
    apiKey?: string;
    model?: string;
    guardrails?: Guardrails;
  }
): GuardedLLMClient {
  let client: BaseLLMClient;
  
  switch (provider) {
    case 'anthropic':
      client = new AnthropicClient({
        provider: 'anthropic',
        model: options.model ?? 'claude-3-5-sonnet-20241022',
        apiKey: options.apiKey,
        maxRetries: 3,
        timeout: 30000,
      });
      break;
    
    case 'openai':
      client = new OpenAIClient({
        provider: 'openai',
        model: options.model ?? 'gpt-4o',
        apiKey: options.apiKey,
        maxRetries: 3,
        timeout: 30000,
      });
      break;
    
    case 'ollama':
      client = new OpenAIClient({
        provider: 'ollama',
        model: options.model ?? 'llama3',
        baseUrl: 'http://localhost:11434',
        maxRetries: 3,
        timeout: 60000,
      });
      break;
    
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
  
    return new GuardedLLMClient({
    client,
    guardrails: options.guardrails ?? DEFAULT_GUARDRAILS,
  });
}

export function createMockGuardedLLMClient(
  guardrails?: Guardrails
): GuardedLLMClient {
  return new GuardedLLMClient({
    client: new MockLLMClient(),
    guardrails: guardrails ?? DEFAULT_GUARDRAILS,
  });
}
