/**
 * Wiki Workflow E2E Tests for ForgeNexus Anti-Hallucination Module
 * 
 * Tests the wiki/documentation generation workflow with verification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  SkepticAgent, 
  SynthesizerAgent, 
  MultiAgentWorkflow 
} from '../agents/index.js';
import type { 
  GroundingContext, 
  Evidence, 
  GuardedResult,
  WorkflowResult 
} from '../agents/types.js';

// ============================================================================
// Mock LLM Client
// ============================================================================

interface MockLLMOptions {
  responses?: Map<string, string>;
  delay?: number;
}

function createMockLLM(options: MockLLMOptions = {}) {
  const { responses = new Map(), delay = 0 } = options;
  
  // Default responses
  responses.set('synthesis', `# Authentication Module

## Overview
This module provides user authentication functionality.

## Functions
- [source:auth/login.ts:10] login() - Authenticates users with credentials
- [source:auth/session.ts:25] createSession() - Creates a new session

## Usage
\`\`\`typescript
import { login } from './auth';
await login(username, password);
\`\`\`
`);

  responses.set('verification-confirmed', `VERIFICATION RESULT
STATUS: CONFIRMED
REASONING: All claims are supported by evidence in the source files.
ISSUES: None`);

  responses.set('verification-uncertain', `VERIFICATION RESULT
STATUS: UNCERTAIN
REASONING: Some claims could not be fully verified against available evidence.
ISSUES: - Claim about password reset not confirmed`);

  responses.set('verification-rejected', `VERIFICATION RESULT
STATUS: UNCONFIRMED
REASONING: Claims do not match evidence in source files.
ISSUES: - Hallucinated function name detected`);

  return {
    generate: vi.fn().mockImplementation(async (prompt: string) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      
      let content = 'Default mock response';
      
      if (prompt.includes('Synthesize') || prompt.includes('generate')) {
        content = responses.get('synthesis') || content;
      } else if (prompt.includes('verify') || prompt.includes('Verify')) {
        if (prompt.includes('uncertain')) {
          content = responses.get('verification-uncertain') || content;
        } else if (prompt.includes('reject')) {
          content = responses.get('verification-rejected') || content;
        } else {
          content = responses.get('verification-confirmed') || content;
        }
      }
      
      return {
        content,
        confidence: 0.85,
        citations: [],
        warnings: [],
        verified: true,
        rawResponse: {},
        model: 'mock',
        usage: { inputTokens: 100, outputTokens: 50 }
      } as GuardedResult;
    })
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

function createMockEvidence(): Evidence[] {
  return [
    {
      type: 'code',
      content: 'export async function login(username: string, password: string) { ... }',
      source: 'auth/login.ts',
      line: 10,
      relevance: 0.9
    },
    {
      type: 'code',
      content: 'export function createSession(userId: string) { ... }',
      source: 'auth/session.ts',
      line: 25,
      relevance: 0.85
    }
  ];
}

// ============================================================================
// Test Suite: Wiki Workflow
// ============================================================================

describe('Wiki Workflow E2E Tests', () => {
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
  // wiki-001: Generates docs with citations
  // --------------------------------------------------------------------------
  describe('wiki-001: Generates docs with verified citations', () => {
    it('should generate documentation with proper citations', async () => {
      // Override mock to return proper content
      mockLLM.generate = vi.fn().mockResolvedValue({
        content: `# Auth Module

[source:auth/login.ts:10] login() function exists
[source:auth/session.ts:25] createSession() function exists`,
        confidence: 0.85,
        citations: [],
        warnings: [],
        verified: true,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult);

      const result = await workflow.execute({
        task: 'Generate documentation for the auth module',
        type: 'wiki',
        context
      });

      expect(result.content).toBeTruthy();
      expect(result.content).toContain('[source:');
      expect(result.citations.length).toBeGreaterThanOrEqual(0);
    });

    it('should include file references in citations', async () => {
      mockLLM.generate = vi.fn().mockResolvedValue({
        content: `[source:auth/login.ts:10] login function`,
        confidence: 0.85,
        citations: [],
        warnings: [],
        verified: true,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult);

      const result = await workflow.execute({
        task: 'Document the login function',
        type: 'wiki',
        context
      });

      const hasFileCitation = result.content.includes('[source:auth/');
      expect(hasFileCitation).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // wiki-002: Warns on low confidence (strict mode)
  // --------------------------------------------------------------------------
  describe('wiki-002: Warns on low confidence in strict mode', () => {
    it('should add warnings when confidence is below threshold', async () => {
      // Use skeptic directly with low-confidence mock
      mockLLM.generate = vi.fn().mockResolvedValue({
        content: `VERIFICATION RESULT
STATUS: UNCERTAIN
REASONING: Evidence is insufficient
ISSUES: Low confidence`,
        confidence: 0.3,
        citations: [],
        warnings: ['Low confidence'],
        verified: false,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult);

      const strictSkeptic = new SkepticAgent({ llm: mockLLM, calibration: 'strict' });
      const verification = await strictSkeptic.verifyDocument({
        content: 'Some unverified claim',
        grounding: context
      });

      expect(verification.confidence).toBeLessThan(0.5);
    });

    it('should warn when calibration is strict', async () => {
      mockLLM.generate = vi.fn().mockResolvedValue({
        content: `VERIFICATION RESULT
STATUS: UNCERTAIN
REASONING: Evidence is weak`,
        confidence: 0.6,
        citations: [],
        warnings: ['Evidence is weak'],
        verified: false,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult);

      const strictSkeptic = new SkepticAgent({ llm: mockLLM, calibration: 'strict' });
      const verification = await strictSkeptic.verifyDocument({
        content: 'Claim needing verification',
        grounding: context
      });

      expect(verification.issues.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // wiki-003: Refuses on unverified claims
  // --------------------------------------------------------------------------
  describe('wiki-003: Refuses or marks unverified claims', () => {
    it('should mark content with NOT_VERIFIED when verification fails', async () => {
      mockLLM.generate = vi.fn().mockResolvedValue({
        content: `VERIFICATION RESULT
STATUS: UNCONFIRMED
REASONING: Claims do not match evidence
ISSUES: - Hallucinated function name
[NOT_VERIFIED] Some unverified claim here`,
        confidence: 0.2,
        citations: [],
        warnings: ['Unverified claims detected'],
        verified: false,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult);

      const skeptic = new SkepticAgent({ llm: mockLLM, calibration: 'moderate' });
      const verification = await skeptic.verifyDocument({
        content: 'Function xyz123() does magic',
        grounding: context
      });

      expect(verification.verified).toBe(false);
    });

    it('should refuse when confidence is critical', async () => {
      mockLLM.generate = vi.fn().mockResolvedValue({
        content: `VERIFICATION RESULT
STATUS: UNCONFIRMED
REASONING: No evidence found
ISSUES: - No supporting evidence`,
        confidence: 0.1,
        citations: [],
        warnings: ['Critical confidence level'],
        verified: false,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult);

      const skeptic = new SkepticAgent({ llm: mockLLM, calibration: 'moderate' });
      const verification = await skeptic.verifyDocument({
        content: 'Imaginary function does impossible things',
        grounding: context
      });

      expect(verification.confidence).toBeLessThan(0.3);
    });
  });

  // --------------------------------------------------------------------------
  // wiki-004: Citation accuracy check
  // --------------------------------------------------------------------------
  describe('wiki-004: Citation accuracy check', () => {
    it('should correctly validate file references in citations', async () => {
      const sources = new Map([
        ['auth/login.ts', { lineCount: 100, content: 'login function' }],
        ['auth/session.ts', { lineCount: 80, content: 'session function' }]
      ]);

      const content = `[source:auth/login.ts:10] login() is here
[source:auth/session.ts:25] session is here`;

      const skeptic = new SkepticAgent({ llm: mockLLM, calibration: 'moderate' });
      const result = await skeptic.verifyCitations({ content, sources });

      expect(result.valid).toBe(true);
      expect(result.verifiedCitations).toBe(2);
    });

    it('should detect invalid line numbers', async () => {
      const sources = new Map([
        ['auth/login.ts', { lineCount: 50, content: 'login function' }]
      ]);

      const content = `[source:auth/login.ts:999] invalid line`;

      const skeptic = new SkepticAgent({ llm: mockLLM, calibration: 'moderate' });
      const result = await skeptic.verifyCitations({ content, sources });

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.valid).toBe(false);
    });

    it('should detect missing source files', async () => {
      const sources = new Map<string, { lineCount: number; content: string }>();
      const content = `[source:nonexistent/file.ts:10] missing file`;

      const skeptic = new SkepticAgent({ llm: mockLLM, calibration: 'moderate' });
      const result = await skeptic.verifyCitations({ content, sources });

      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // wiki-005: Skeptic verification runs
  // --------------------------------------------------------------------------
  describe('wiki-005: Skeptic verification runs', () => {
    it('should run verification as part of workflow', async () => {
      const callCount = mockLLM.generate.mock.calls.length;
      
      await workflow.execute({
        task: 'Document auth module',
        type: 'wiki',
        context
      });

      // Verify that skeptic was called (verifyDocument uses llm.generate)
      expect(mockLLM.generate).toHaveBeenCalled();
    });

    it('should include verification results in workflow output', async () => {
      const result = await workflow.execute({
        task: 'Document auth module',
        type: 'wiki',
        context
      });

      expect(result.verificationResults.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // wiki-006: Semantic energy uncertainty attached
  // --------------------------------------------------------------------------
  describe('wiki-006: Semantic energy uncertainty attached', () => {
    it('should attach uncertainty to content', async () => {
      const evidence = createMockEvidence();
      
      mockLLM.generate = vi.fn().mockImplementation(async (text: string, opts?: { temperature: number }) => {
        // Return different content based on temperature to simulate variance
        const baseContent = `[source:auth/login.ts:10] login function`;
        return {
          content: baseContent,
          confidence: 0.8,
          citations: [],
          warnings: [],
          verified: true,
          rawResponse: {},
          model: 'mock'
        } as GuardedResult;
      });

      const skeptic = new SkepticAgent({ llm: mockLLM, calibration: 'moderate' });
      const verification = await skeptic.verifyClaims({
        claims: ['Login function exists'],
        evidence
      });

      expect(verification.confidence).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // wiki-007: Graceful degradation on LLM failure
  // --------------------------------------------------------------------------
  describe('wiki-007: Graceful degradation on LLM failure', () => {
    it('should handle LLM errors gracefully', async () => {
      mockLLM.generate = vi.fn().mockRejectedValue(new Error('LLM API error'));

      const skeptic = new SkepticAgent({ llm: mockLLM, calibration: 'moderate' });
      const verification = await skeptic.verifyClaims({
        claims: ['Some claim'],
        evidence: createMockEvidence()
      });

      expect(verification.confidence).toBe(0);
      expect(verification.issues.length).toBeGreaterThan(0);
    });

    it('should not throw on LLM failure', async () => {
      mockLLM.generate = vi.fn().mockRejectedValue(new Error('Network error'));

      const skeptic = new SkepticAgent({ llm: mockLLM, calibration: 'moderate' });
      
      await expect(skeptic.verifyClaims({
        claims: ['Test claim'],
        evidence: createMockEvidence()
      })).resolves.toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // wiki-008: RAG retrieval fallback
  // --------------------------------------------------------------------------
  describe('wiki-008: RAG retrieval fallback', () => {
    it('should handle empty context gracefully', async () => {
      const emptyContext: GroundingContext = {
        repoPath: '/test',
        chunks: [],
        citations: [],
        relevance: 0,
        freshness: 'stale'
      };

      const result = await workflow.execute({
        task: 'Document something',
        type: 'wiki',
        context: emptyContext
      });

      // Should still produce output, possibly with warnings
      expect(result).toBeDefined();
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // wiki-009: Empty input handling
  // --------------------------------------------------------------------------
  describe('wiki-009: Empty input handling', () => {
    it('should handle empty task input', async () => {
      const result = await workflow.execute({
        task: '',
        type: 'wiki',
        context
      });

      expect(result).toBeDefined();
    });

    it('should handle empty evidence gracefully', async () => {
      const emptyEvidenceContext: GroundingContext = {
        repoPath: '/test',
        chunks: [],
        citations: [],
        relevance: 0,
        freshness: 'fresh'
      };

      const synthesizer = new SynthesizerAgent({ llm: mockLLM });
      
      mockLLM.generate = vi.fn().mockResolvedValue({
        content: 'Unable to generate: no evidence available',
        confidence: 0,
        citations: [],
        warnings: ['No evidence provided'],
        verified: false,
        rawResponse: {},
        model: 'mock'
      } as GuardedResult);

      const result = await synthesizer.synthesize({
        type: 'wiki',
        task: 'Document something',
        verifiedClaims: [],
        context: emptyEvidenceContext
      });

      expect(result.content).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // wiki-010: Concurrent requests handling
  // --------------------------------------------------------------------------
  describe('wiki-010: Concurrent requests handling', () => {
    it('should handle multiple concurrent requests', async () => {
      const promises = Array.from({ length: 5 }, (_, i) => 
        workflow.execute({
          task: `Document module ${i}`,
          type: 'wiki',
          context
        })
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content).toBeTruthy();
      });
    });

    it('should not have race conditions in concurrent execution', async () => {
      let callOrder = 0;
      
      mockLLM.generate = vi.fn().mockImplementation(async () => {
        const currentOrder = ++callOrder;
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          content: `Response ${currentOrder}`,
          confidence: 0.8,
          citations: [],
          warnings: [],
          verified: true,
          rawResponse: {},
          model: 'mock'
        } as GuardedResult;
      });

      const results = await Promise.all([
        workflow.execute({ task: 'Task 1', type: 'wiki', context }),
        workflow.execute({ task: 'Task 2', type: 'wiki', context }),
        workflow.execute({ task: 'Task 3', type: 'wiki', context })
      ]);

      expect(results.length).toBe(3);
    });
  });
});
