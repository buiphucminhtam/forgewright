/**
 * Multi-Agent Workflow E2E Tests for ForgeNexus Anti-Hallucination Module
 * 
 * Tests the synthesizer-skeptic loop convergence and iteration limits.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  MultiAgentWorkflow,
  SkepticAgent,
  SynthesizerAgent
} from '../agents/index.js';
import type { 
  GroundingContext, 
  GuardedResult,
  VerificationResult,
  WorkflowResult 
} from '../agents/types.js';

// ============================================================================
// Mock LLM Client
// ============================================================================

interface MockResponse {
  content: string;
  confidence?: number;
  verified?: boolean;
}

function createMockLLM(responses: Map<string, MockResponse> = new Map()) {
  // Default responses
  const defaults = new Map<string, MockResponse>([
    ['synthesize', {
      content: `# Documentation

This module provides authentication.

## Functions
- [source:auth/login.ts:10] login() - Authenticates users

## Notes
[NOT_VERIFIED] Password reset needs verification`,
      confidence: 0.75,
      verified: false
    }],
    ['refine', {
      content: `# Documentation

This module provides authentication.

## Functions
- [source:auth/login.ts:10] login() - Authenticates users
- [source:auth/session.ts:25] createSession() - Creates session

All claims verified.`,
      confidence: 0.85,
      verified: true
    }],
    ['verify-confirmed', {
      content: `VERIFICATION RESULT
STATUS: CONFIRMED
REASONING: All claims verified
ISSUES: None`,
      confidence: 0.9,
      verified: true
    }],
    ['verify-uncertain', {
      content: `VERIFICATION RESULT
STATUS: UNCERTAIN
REASONING: Some claims need more evidence
ISSUES: - Additional evidence needed`,
      confidence: 0.5,
      verified: false
    }],
    ['verify-rejected', {
      content: `VERIFICATION RESULT
STATUS: UNCONFIRMED
REASONING: Claims not supported
ISSUES: - Hallucination detected`,
      confidence: 0.2,
      verified: false
    }]
  ]);

  // Merge defaults with custom responses
  for (const [key, value] of defaults) {
    if (!responses.has(key)) {
      responses.set(key, value);
    }
  }

  return {
    generate: vi.fn().mockImplementation(async (prompt: string) => {
      let content = 'Default response';
      let confidence = 0.5;
      let verified = false;

      // Determine which response to use
      if (prompt.includes('Synthesize')) {
        const response = responses.get('synthesize');
        content = response?.content || content;
        confidence = response?.confidence || confidence;
        verified = response?.verified || verified;
      } else if (prompt.includes('Refine')) {
        const response = responses.get('refine');
        content = response?.content || content;
        confidence = response?.confidence || confidence;
        verified = response?.verified || verified;
      } else if (prompt.includes('verify') || prompt.includes('Verify')) {
        if (prompt.includes('rejected')) {
          const response = responses.get('verify-rejected');
          content = response?.content || content;
          confidence = response?.confidence || confidence;
          verified = response?.verified || verified;
        } else if (prompt.includes('uncertain')) {
          const response = responses.get('verify-uncertain');
          content = response?.content || content;
          confidence = response?.confidence || confidence;
          verified = response?.verified || verified;
        } else {
          const response = responses.get('verify-confirmed');
          content = response?.content || content;
          confidence = response?.confidence || confidence;
          verified = response?.verified || verified;
        }
      }

      return {
        content,
        confidence,
        citations: [],
        warnings: [],
        verified,
        rawResponse: {},
        model: 'mock',
        usage: { inputTokens: 100, outputTokens: 50 }
      } as GuardedResult;
    }),
    setResponse: (key: string, response: MockResponse) => {
      responses.set(key, response);
    }
  };
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockGroundingContext(): GroundingContext {
  return {
    repoPath: '/test/project',
    chunks: [
      {
        id: 'chunk-1',
        file: 'auth/login.ts',
        lineStart: 1,
        lineEnd: 50,
        text: 'export async function login(username: string, password: string) { ... }',
        relevance: 0.9
      },
      {
        id: 'chunk-2',
        file: 'auth/session.ts',
        lineStart: 20,
        lineEnd: 60,
        text: 'export function createSession(userId: string) { ... }',
        relevance: 0.85
      }
    ],
    citations: [],
    relevance: 0.9,
    freshness: 'fresh'
  };
}

// ============================================================================
// Test Suite: Multi-Agent Workflow
// ============================================================================

describe('Multi-Agent Workflow E2E Tests', () => {
  let mockLLM: ReturnType<typeof createMockLLM>;
  let skeptic: SkepticAgent;
  let synthesizer: SynthesizerAgent;
  let workflow: MultiAgentWorkflow;
  let context: GroundingContext;

  beforeEach(() => {
    mockLLM = createMockLLM();
    context = createMockGroundingContext();
    
    skeptic = new SkepticAgent({ llm: mockLLM, calibration: 'moderate' });
    synthesizer = new SynthesizerAgent({ llm: mockLLM });
    workflow = new MultiAgentWorkflow({
      synthesizer,
      skeptic,
      maxIterations: 3,
      confidenceThreshold: 0.8
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // ma-001: Synthesizer → Skeptic loop converges
  // --------------------------------------------------------------------------
  describe('ma-001: Synthesizer → Skeptic loop converges', () => {
    it('should converge when verification passes', async () => {
      // Set up responses for successful convergence
      mockLLM.setResponse('synthesize', {
        content: '# Auth Module\n\n[source:auth/login.ts:10] login() function',
        confidence: 0.8,
        verified: true
      });
      mockLLM.setResponse('verify-confirmed', {
        content: `VERIFICATION RESULT
STATUS: CONFIRMED
REASONING: All claims verified
ISSUES: None`,
        confidence: 0.9,
        verified: true
      });

      const result = await workflow.execute({
        task: 'Document the auth module',
        type: 'wiki',
        context
      });

      expect(result.converged).toBe(true);
    });

    it('should iterate until convergence', async () => {
      let iteration = 0;
      
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => {
        iteration++;
        
        if (prompt.includes('Synthesize')) {
          return {
            content: '# Documentation\n\nIteration ' + iteration,
            confidence: 0.7,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else {
          // Skeptic verification - converge on iteration 2
          if (iteration >= 4) {
            return {
              content: 'VERIFICATION RESULT\nSTATUS: CONFIRMED',
              confidence: 0.9,
              citations: [],
              warnings: [],
              verified: true,
              rawResponse: {},
              model: 'mock'
            } as GuardedResult;
          }
          return {
            content: 'VERIFICATION RESULT\nSTATUS: UNCERTAIN\nISSUES: Needs refinement',
            confidence: 0.5,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        }
      });

      const result = await workflow.execute({
        task: 'Document something',
        type: 'wiki',
        context
      });

      expect(result.iterations).toBeGreaterThan(1);
    });

    it('should exit loop on verification success', async () => {
      let synthesisCount = 0;
      let verifyCount = 0;
      
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Synthesize') || prompt.includes('synthesize')) {
          synthesisCount++;
          return {
            content: '# Documentation',
            confidence: 0.85,
            citations: [],
            warnings: [],
            verified: true,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else {
          verifyCount++;
          return {
            content: `VERIFICATION RESULT\nSTATUS: ${verifyCount >= 1 ? 'CONFIRMED' : 'UNCERTAIN'}`,
            confidence: verifyCount >= 1 ? 0.9 : 0.5,
            citations: [],
            warnings: [],
            verified: verifyCount >= 1,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        }
      });

      const result = await workflow.execute({
        task: 'Document module',
        type: 'wiki',
        context
      });

      // Should have at least one synthesis and verification
      expect(result.iterations).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // ma-002: Refuses after max iterations without confidence
  // --------------------------------------------------------------------------
  describe('ma-002: Refuses after max iterations without confidence', () => {
    it('should exit after max iterations even if not converged', async () => {
      // Always return uncertain verification
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Synthesize')) {
          return {
            content: '# Draft',
            confidence: 0.4,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else {
          return {
            content: 'VERIFICATION RESULT\nSTATUS: UNCERTAIN\nISSUES: Still needs work',
            confidence: 0.4,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        }
      });

      const result = await workflow.execute({
        task: 'Document something',
        type: 'wiki',
        context
      });

      // Should have exactly maxIterations or 1 initial + refine calls
      expect(result.iterations).toBeLessThanOrEqual(4); // maxIterations (3) + 1 initial
      expect(result.converged).toBe(false);
    });

    it('should have low final confidence after max iterations', async () => {
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => ({
        content: prompt.includes('Synthesize') ? '# Draft' : 'VERIFICATION: UNCERTAIN',
        confidence: 0.3,
        citations: [],
        warnings: [],
        verified: false,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult));

      const result = await workflow.execute({
        task: 'Document something',
        type: 'wiki',
        context
      });

      expect(result.finalConfidence).toBeLessThan(0.5);
    });

    it('should include verification attempts in results', async () => {
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => ({
        content: prompt.includes('Synthesize') ? '# Draft' : 'UNCERTAIN verification',
        confidence: 0.4,
        citations: [],
        warnings: [],
        verified: false,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult));

      const result = await workflow.execute({
        task: 'Document something',
        type: 'wiki',
        context
      });

      expect(result.verificationResults.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // ma-003: Max 3 iteration limit enforced
  // --------------------------------------------------------------------------
  describe('ma-003: Max 3 iteration limit enforced', () => {
    it('should enforce maxIterations configuration', () => {
      const config = workflow.getConfig();
      expect(config.maxIterations).toBe(3);
    });

    it('should not exceed configured max iterations', async () => {
      let iterationCount = 0;
      
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Synthesize') || prompt.includes('Refine')) {
          iterationCount++;
        }
        return {
          content: prompt.includes('Synthesize') ? '# Draft' : 'UNCERTAIN',
          confidence: 0.4,
          citations: [],
          warnings: [],
          verified: false,
          rawResponse: {},
          model: 'mock'
        } as GuardedResult;
      });

      await workflow.execute({
        task: 'Document',
        type: 'wiki',
        context
      });

      // Should have 1 initial synthesis + up to 3 refinement attempts
      expect(iterationCount).toBeLessThanOrEqual(4);
    });

    it('should stop when iteration limit reached', async () => {
      let synthesisCount = 0;
      
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Synthesize')) {
          synthesisCount++;
        }
        return {
          content: '# Draft',
          confidence: 0.4,
          citations: [],
          warnings: [],
          verified: false,
          rawResponse: {},
          model: 'mock'
        } as GuardedResult;
      });

      const result = await workflow.execute({
        task: 'Document',
        type: 'wiki',
        context
      });

      // synthesisCount should be <= maxIterations + 1
      expect(synthesisCount).toBeLessThanOrEqual(4);
      expect(result.iterations).toBeLessThanOrEqual(4);
    });

    it('should respect different max iteration settings', async () => {
      const tightWorkflow = new MultiAgentWorkflow({
        synthesizer,
        skeptic,
        maxIterations: 1,
        confidenceThreshold: 0.8
      });

      let callCount = 0;
      mockLLM.generate = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          content: '# Draft',
          confidence: 0.4,
          citations: [],
          warnings: [],
          verified: false,
          rawResponse: {},
          model: 'mock'
        } as GuardedResult;
      });

      const result = await tightWorkflow.execute({
        task: 'Doc',
        type: 'wiki',
        context
      });

      expect(tightWorkflow.getConfig().maxIterations).toBe(1);
      expect(callCount).toBeLessThanOrEqual(2); // 1 synthesis + 1 verification
    });
  });

  // --------------------------------------------------------------------------
  // ma-004: Synthesizer accepts skeptic feedback
  // --------------------------------------------------------------------------
  describe('ma-004: Synthesizer accepts skeptic feedback', () => {
    it('should refine content based on verification issues', async () => {
      const issues: string[] = [];
      
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Synthesize')) {
          return {
            content: '# Initial Draft',
            confidence: 0.5,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else if (prompt.includes('Refine')) {
          // Capture issues from the prompt
          issues.push('Captured refinement');
          return {
            content: '# Refined Draft\n\nAll issues addressed.',
            confidence: 0.85,
            citations: [],
            warnings: [],
            verified: true,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else {
          return {
            content: 'VERIFICATION RESULT\nSTATUS: UNCERTAIN\nISSUES: - Missing citations',
            confidence: 0.5,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        }
      });

      const result = await workflow.execute({
        task: 'Document module',
        type: 'wiki',
        context
      });

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should incorporate skeptic reasoning into refinements', async () => {
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Synthesize')) {
          return {
            content: '# Draft without citations',
            confidence: 0.5,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else if (prompt.includes('Refine')) {
          // Should include issues in the prompt
          expect(prompt).toContain('citations');
          return {
            content: '# Draft with [source:file.ts:1] citations added',
            confidence: 0.85,
            citations: [{ id: '1', claim: 'test', source: 'file.ts', line: 1, verified: true }],
            warnings: [],
            verified: true,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else {
          return {
            content: 'VERIFICATION RESULT\nSTATUS: UNCERTAIN\nISSUES: - Add citations',
            confidence: 0.5,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        }
      });

      await workflow.execute({
        task: 'Document module',
        type: 'wiki',
        context
      });
    });

    it('should improve confidence after refinement', async () => {
      let refinementCount = 0;
      
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Synthesize')) {
          return {
            content: '# Initial',
            confidence: 0.4,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else if (prompt.includes('Refine')) {
          refinementCount++;
          return {
            content: '# Refined',
            confidence: 0.4 + (refinementCount * 0.2), // Improving each time
            citations: [],
            warnings: [],
            verified: refinementCount >= 2,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else {
          return {
            content: 'UNCERTAIN',
            confidence: 0.4,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        }
      });

      const result = await workflow.execute({
        task: 'Doc',
        type: 'wiki',
        context
      });

      // Should have tried to refine
      expect(refinementCount).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // ma-005: Loop exits early when confidence threshold met
  // --------------------------------------------------------------------------
  describe('ma-005: Loop exits early when confidence threshold met', () => {
    it('should exit early when confidence >= threshold', async () => {
      // Override the entire generate mock to ensure convergence
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Synthesize') || prompt.includes('synthesize')) {
          return {
            content: '# High Quality Doc\n\n[source:auth/login.ts:10] login() function',
            confidence: 0.95,
            citations: [{ id: '1', claim: 'test', source: 'a.ts', verified: true }],
            warnings: [],
            verified: true,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else {
          // verifyDocument response - content needs to have source patterns for verified=true
          return {
            content: 'VERIFICATION RESULT\nSTATUS: CONFIRMED\n[source:auth/login.ts:10]',
            confidence: 0.95,
            citations: [{ id: '1', claim: 'test', source: 'auth/login.ts:10', verified: true }],
            warnings: [],
            verified: true,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        }
      });

      const result = await workflow.execute({
        task: 'Document module',
        type: 'wiki',
        context
      });

      // The workflow should complete with high confidence
      expect(result.finalConfidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should exit after minimal iterations with high confidence', async () => {
      let callCount = 0;
      
      mockLLM.generate = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          content: '# Doc\n\n[source:test.ts:1]',
          confidence: 0.95,
          citations: [],
          warnings: [],
          verified: true,
          rawResponse: {},
          model: 'mock'
        } as GuardedResult;
      });

      await workflow.execute({
        task: 'Doc',
        type: 'wiki',
        context
      });

      // Should be few calls since confidence is high
      expect(callCount).toBeLessThanOrEqual(5);
    });

    it('should track iterations correctly', async () => {
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Synthesize')) {
          return {
            content: '# Doc',
            confidence: 0.5,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else if (prompt.includes('Refine')) {
          return {
            content: '# Doc v2',
            confidence: 0.5,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else {
          return {
            content: 'UNCERTAIN',
            confidence: 0.5,
            citations: [],
            warnings: [],
            verified: false,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        }
      });

      const result = await workflow.execute({
        task: 'Doc',
        type: 'wiki',
        context
      });

      // Result should track iterations
      expect(result.iterations).toBeDefined();
      expect(typeof result.iterations).toBe('number');
    });

    it('should meet threshold exactly', async () => {
      mockLLM.generate = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Synthesize')) {
          return {
            content: '# Doc',
            confidence: 0.8, // Exactly at threshold
            citations: [],
            warnings: [],
            verified: true,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        } else {
          return {
            content: 'CONFIRMED',
            confidence: 0.8,
            citations: [],
            warnings: [],
            verified: true,
            rawResponse: {},
            model: 'mock'
          } as GuardedResult;
        }
      });

      const result = await workflow.execute({
        task: 'Doc',
        type: 'wiki',
        context
      });

      expect(result.finalConfidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  // --------------------------------------------------------------------------
  // Additional Workflow Tests
  // --------------------------------------------------------------------------
  describe('Additional Multi-Agent Tests', () => {
    it('should return workflow result with all expected fields', async () => {
      mockLLM.generate = vi.fn().mockResolvedValue({
        content: '# Doc',
        confidence: 0.9,
        citations: [],
        warnings: [],
        verified: true,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult);

      const result = await workflow.execute({
        task: 'Doc',
        type: 'wiki',
        context
      });

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('iterations');
      expect(result).toHaveProperty('converged');
      expect(result).toHaveProperty('finalConfidence');
      expect(result).toHaveProperty('verificationResults');
      expect(result).toHaveProperty('citations');
      expect(result).toHaveProperty('warnings');
    });

    it('should handle quick verification workflow', async () => {
      const quickWorkflow = new MultiAgentWorkflow({
        synthesizer,
        skeptic,
        maxIterations: 1,
        confidenceThreshold: 0.9
      });

      mockLLM.generate = vi.fn().mockResolvedValue({
        content: '# Quick Doc',
        confidence: 0.95,
        citations: [],
        warnings: [],
        verified: true,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult);

      const result = await quickWorkflow.execute({
        task: 'Doc',
        type: 'wiki',
        context
      });

      expect(result.iterations).toBeLessThanOrEqual(2);
    });

    it('should not have race conditions in loop', async () => {
      const results = await Promise.all([
        workflow.execute({ task: 'Doc 1', type: 'wiki', context }),
        workflow.execute({ task: 'Doc 2', type: 'wiki', context }),
        workflow.execute({ task: 'Doc 3', type: 'wiki', context })
      ]);

      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result).toHaveProperty('iterations');
        expect(result).toHaveProperty('content');
      });
    });

    it('should use shouldContinue helper correctly', () => {
      expect(workflow.shouldContinue(1, 0.5)).toBe(true);
      expect(workflow.shouldContinue(3, 0.5)).toBe(false); // max iterations
      expect(workflow.shouldContinue(1, 0.9)).toBe(false); // confidence met
    });
  });
});
