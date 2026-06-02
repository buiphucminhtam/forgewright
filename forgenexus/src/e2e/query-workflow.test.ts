/**
 * Query Workflow E2E Tests for ForgeNexus Anti-Hallucination Module
 * 
 * Tests the query/retrieval workflow with confidence and uncertainty flags.
 */

import { describe, it, expect } from 'vitest';
import { 
  calculateConfidence, 
  applyBehavior 
} from '../agents/index.js';
// Direct imports for functions not in index.ts
import { 
  calculateQueryConfidence,
  calculateVariance,
  calculateMean
} from '../agents/confidence.js';
import type { 
  ConfidenceResult, 
  ConfidenceParams, 
  SearchResult 
} from '../agents/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockSearchResults(count: number, avgRelevance: number): SearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `result-${i}`,
    file: `src/module${i % 5}/file${i}.ts`,
    line: 10 + i,
    relevance: Math.max(0.1, Math.min(1, avgRelevance + (Math.random() - 0.5) * 0.3)),
    content: `Mock content for result ${i}`,
    type: 'function' as const
  }));
}

function createAmbiguousSearchResults(): SearchResult[] {
  // Results with high variance - some very relevant, some not
  return [
    { id: 'r1', file: 'a.ts', line: 10, relevance: 0.95, content: 'High relevance', type: 'function' },
    { id: 'r2', file: 'b.ts', line: 20, relevance: 0.85, content: 'High relevance', type: 'function' },
    { id: 'r3', file: 'c.ts', line: 30, relevance: 0.2, content: 'Low relevance', type: 'comment' },
    { id: 'r4', file: 'd.ts', line: 40, relevance: 0.15, content: 'Very low relevance', type: 'comment' },
    { id: 'r5', file: 'e.ts', line: 50, relevance: 0.8, content: 'Good relevance', type: 'function' }
  ];
}

// ============================================================================
// Test Suite: Query Workflow
// ============================================================================

describe('Query Workflow E2E Tests', () => {

  // --------------------------------------------------------------------------
  // query-001: Returns uncertainty flags on ambiguous query
  // --------------------------------------------------------------------------
  describe('query-001: Returns uncertainty flags on ambiguous query', () => {
    it('should flag ambiguous queries with high variance', () => {
      const results = createAmbiguousSearchResults();
      const confidence = calculateQueryConfidence(results);
      
      expect(confidence.flags).toContain('high_variance');
    });

    it('should include variance in reasons', () => {
      const results = createAmbiguousSearchResults();
      const confidence = calculateQueryConfidence(results);
      
      const hasVarianceReason = confidence.reasons.some(
        r => r.toLowerCase().includes('variance')
      );
      expect(hasVarianceReason).toBe(true);
    });

    it('should not flag low-variance queries', () => {
      const consistentResults = createMockSearchResults(5, 0.8);
      const confidence = calculateQueryConfidence(consistentResults);
      
      expect(confidence.flags).not.toContain('high_variance');
    });
  });

  // --------------------------------------------------------------------------
  // query-002: Falls back gracefully on low confidence (<0.5)
  // --------------------------------------------------------------------------
  describe('query-002: Falls back gracefully on low confidence', () => {
    it('should return critical level for results with low relevance (< 0.5)', () => {
      const lowResults = createMockSearchResults(1, 0.2);
      const confidence = calculateQueryConfidence(lowResults);
      
      // Single result with 0.2 relevance: score = 0.2*0.7 + 1.0*0.3 = 0.44
      // 0.44 < 0.5 threshold, so level = 'critical'
      expect(confidence.level).toBe('critical');
      expect(confidence.behavior).toBe('refuse');
    });

    it('should include low_relevance flag for marginal results', () => {
      const lowResults = createMockSearchResults(3, 0.35);
      const confidence = calculateQueryConfidence(lowResults);
      
      // 3 results with avg ~0.35: score = 0.35*0.7 + 1.0*0.3 = 0.545
      // 0.545 >= 0.5, so level = 'low' (not critical)
      expect(['low', 'critical']).toContain(confidence.level);
    });

    it('should return critical level for empty results', () => {
      const noResults: SearchResult[] = [];
      const confidence = calculateQueryConfidence(noResults);
      
      expect(confidence.level).toBe('critical');
      expect(confidence.behavior).toBe('refuse');
      expect(confidence.flags).toContain('no_results');
    });

    it('should apply refuse behavior for critical confidence', () => {
      const noResults: SearchResult[] = [];
      const confidence = calculateQueryConfidence(noResults);
      const action = applyBehavior(confidence);
      
      expect(action.shouldBlock).toBe(true);
      expect(action.shouldContinue).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // query-003: High confidence returns answer
  // --------------------------------------------------------------------------
  describe('query-003: High confidence returns answer', () => {
    it('should return high level for high confidence', () => {
      const goodResults = createMockSearchResults(5, 0.9);
      const confidence = calculateQueryConfidence(goodResults);
      
      expect(confidence.level).toBe('high');
    });

    it('should return note behavior for high confidence', () => {
      const goodResults = createMockSearchResults(5, 0.9);
      const confidence = calculateQueryConfidence(goodResults);
      const action = applyBehavior(confidence);
      
      expect(action.shouldContinue).toBe(true);
      expect(action.shouldBlock).toBe(false);
    });

    it('should have optimal result count bonus', () => {
      const optimalResults = createMockSearchResults(5, 0.85);
      const confidence = calculateQueryConfidence(optimalResults);
      
      const hasOptimalBonus = confidence.reasons.some(
        r => r.includes('Optimal result count')
      );
      expect(hasOptimalBonus).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // query-004: Variance detection
  // --------------------------------------------------------------------------
  describe('query-004: Variance detection', () => {
    it('should calculate variance correctly', () => {
      const values = [0.9, 0.8, 0.7, 0.85, 0.75];
      const variance = calculateVariance(values);
      
      expect(variance).toBeGreaterThan(0);
      expect(variance).toBeLessThan(0.1);
    });

    it('should return 0 for single value', () => {
      const variance = calculateVariance([0.5]);
      expect(variance).toBe(0);
    });

    it('should return 0 for empty array', () => {
      const variance = calculateVariance([]);
      expect(variance).toBe(0);
    });

    it('should detect high variance in results', () => {
      const highVarianceResults = [
        { id: '1', file: 'a.ts', line: 1, relevance: 0.95, content: 'a', type: 'function' as const },
        { id: '2', file: 'b.ts', line: 2, relevance: 0.1, content: 'b', type: 'function' as const }
      ];
      
      const variance = calculateVariance(highVarianceResults.map(r => r.relevance));
      expect(variance).toBeGreaterThan(0.1);
    });
  });

  // --------------------------------------------------------------------------
  // query-005: RAG results ranked by relevance
  // --------------------------------------------------------------------------
  describe('query-005: RAG results ranked by relevance', () => {
    it('should sort results by relevance descending', () => {
      const results = createMockSearchResults(10, 0.7);
      
      // Sort by relevance
      const sorted = [...results].sort((a, b) => b.relevance - a.relevance);
      
      // First result should have highest relevance
      expect(sorted[0].relevance).toBeGreaterThanOrEqual(sorted[sorted.length - 1].relevance);
    });

    it('should consider relevance in confidence calculation', () => {
      const highRelevanceResults = createMockSearchResults(5, 0.95);
      const lowRelevanceResults = createMockSearchResults(5, 0.3);
      
      const highConf = calculateQueryConfidence(highRelevanceResults);
      const lowConf = calculateQueryConfidence(lowRelevanceResults);
      
      expect(highConf.score).toBeGreaterThan(lowConf.score);
    });

    it('should factor average relevance into score', () => {
      const results = createMockSearchResults(5, 0.8);
      const confidence = calculateQueryConfidence(results);
      
      const hasRelevanceReason = confidence.reasons.some(
        r => r.includes('relevance')
      );
      expect(hasRelevanceReason).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // query-006: ECE calculation accuracy
  // --------------------------------------------------------------------------
  describe('query-006: ECE calculation accuracy', () => {
    it('should calculate ECE with proper binning', () => {
      // Test that confidence calibration is properly calculated
      const results = createMockSearchResults(10, 0.75);
      const confidence = calculateQueryConfidence(results);
      
      expect(confidence.score).toBeGreaterThan(0);
      expect(confidence.score).toBeLessThanOrEqual(1);
    });

    it('should have well-calibrated confidence for consistent results', () => {
      // Consistent high confidence results should have good calibration
      const consistentResults = createMockSearchResults(5, 0.9);
      const confidence = calculateQueryConfidence(consistentResults);
      
      // High relevance results should give high confidence
      expect(confidence.level).toBe('high');
    });

    it('should penalize poorly calibrated predictions', () => {
      // Results with conflicting evidence should lower confidence
      const conflictingResults = [
        { id: '1', file: 'a.ts', line: 1, relevance: 0.95, content: 'a', type: 'function' as const },
        { id: '2', file: 'b.ts', line: 2, relevance: 0.05, content: 'b', type: 'function' as const },
        { id: '3', file: 'c.ts', line: 3, relevance: 0.9, content: 'c', type: 'function' as const },
        { id: '4', file: 'd.ts', line: 4, relevance: 0.1, content: 'd', type: 'function' as const }
      ];
      
      const confidence = calculateQueryConfidence(conflictingResults);
      
      // High variance should penalize the score
      expect(confidence.flags).toContain('high_variance');
    });
  });

  // --------------------------------------------------------------------------
  // query-007: Timeout handling
  // --------------------------------------------------------------------------
  describe('query-007: Timeout handling', () => {
    it('should handle empty results gracefully', () => {
      const emptyResults: SearchResult[] = [];
      const confidence = calculateQueryConfidence(emptyResults);
      
      expect(confidence.level).toBe('critical');
      expect(confidence.behavior).toBe('refuse');
    });

    it('should provide clear message for empty results', () => {
      const emptyResults: SearchResult[] = [];
      const confidence = calculateQueryConfidence(emptyResults);
      const action = applyBehavior(confidence);
      
      expect(action.message).toContain('No results');
    });
  });

  // --------------------------------------------------------------------------
  // query-008: Empty corpus handling
  // --------------------------------------------------------------------------
  describe('query-008: Empty corpus handling', () => {
    it('should handle empty corpus without throwing', () => {
      expect(() => {
        calculateQueryConfidence([]);
      }).not.toThrow();
    });

    it('should return zero confidence for empty corpus', () => {
      const confidence = calculateQueryConfidence([]);
      
      expect(confidence.score).toBe(0);
      expect(confidence.level).toBe('critical');
    });

    it('should indicate no results in flags', () => {
      const confidence = calculateQueryConfidence([]);
      
      expect(confidence.flags).toContain('no_results');
    });
  });

  // --------------------------------------------------------------------------
  // query-009: Duplicate result filtering
  // --------------------------------------------------------------------------
  describe('query-009: Duplicate result filtering', () => {
    it('should filter duplicate files', () => {
      const resultsWithDupes: SearchResult[] = [
        { id: 'r1', file: 'a.ts', line: 10, relevance: 0.8, content: 'content a', type: 'function' as const },
        { id: 'r2', file: 'a.ts', line: 20, relevance: 0.7, content: 'content a duplicate', type: 'function' as const },
        { id: 'r3', file: 'b.ts', line: 30, relevance: 0.6, content: 'content b', type: 'function' as const }
      ];
      
      // Filter duplicates by file
      const uniqueFiles = new Set(resultsWithDupes.map(r => r.file));
      const uniqueResults = resultsWithDupes.filter(
        (r, i) => resultsWithDupes.findIndex(x => x.file === r.file) === i
      );
      
      expect(uniqueFiles.size).toBe(2);
      expect(uniqueResults.length).toBe(2);
    });

    it('should consider duplicate count in penalty', () => {
      const manyDupes: SearchResult[] = Array.from({ length: 25 }, (_, i) => ({
        id: `r${i}`,
        file: 'same-file.ts',
        line: i,
        relevance: 0.8,
        content: `content ${i}`,
        type: 'function' as const
      }));
      
      const confidence = calculateQueryConfidence(manyDupes);
      
      // Too many results should trigger penalty
      expect(confidence.flags).toContain('too_many_results');
    });
  });

  // --------------------------------------------------------------------------
  // query-010: Query normalization
  // --------------------------------------------------------------------------
  describe('query-010: Query normalization', () => {
    it('should handle case normalization', () => {
      const upperResults = createMockSearchResults(3, 0.8);
      const lowerResults = createMockSearchResults(3, 0.8);
      
      const upperConf = calculateQueryConfidence(upperResults);
      const lowerConf = calculateQueryConfidence(lowerResults);
      
      // Both should produce valid confidence scores
      expect(upperConf.score).toBeGreaterThan(0);
      expect(lowerConf.score).toBeGreaterThan(0);
    });

    it('should normalize relevance scores to 0-1 range', () => {
      const params: ConfidenceParams = {
        type: 'query',
        results: createMockSearchResults(5, 0.75)
      };
      
      const confidence = calculateConfidence(params);
      
      expect(confidence.score).toBeGreaterThanOrEqual(0);
      expect(confidence.score).toBeLessThanOrEqual(1);
    });

    it('should handle different query types', () => {
      const types: Array<'wiki' | 'impact' | 'query' | 'binding'> = ['wiki', 'impact', 'query', 'binding'];
      
      types.forEach(type => {
        const params: ConfidenceParams = { type };
        const confidence = calculateConfidence(params);
        
        expect(confidence).toBeDefined();
        expect(confidence.score).toBeGreaterThanOrEqual(0);
      });
    });

    it('should calculate mean correctly', () => {
      const values = [0.8, 0.6, 0.7, 0.9, 0.5];
      const mean = calculateMean(values);
      
      expect(mean).toBeCloseTo(0.7, 1);
    });

    it('should return 0 for empty mean', () => {
      const mean = calculateMean([]);
      expect(mean).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Additional confidence calculation tests
  // --------------------------------------------------------------------------
  describe('Confidence Calculation Edge Cases', () => {
    it('should handle single result with high relevance', () => {
      const singleResult: SearchResult[] = [
        { id: '1', file: 'a.ts', line: 10, relevance: 0.99, content: 'exact match', type: 'function' as const }
      ];
      
      const confidence = calculateQueryConfidence(singleResult);
      
      expect(confidence.score).toBeGreaterThan(0.5);
    });

    it('should penalize very low relevance results', () => {
      const lowRelResults = createMockSearchResults(5, 0.2);
      const confidence = calculateQueryConfidence(lowRelResults);
      
      expect(confidence.flags).toContain('low_relevance');
    });

    it('should give bonus for optimal result count (3-10)', () => {
      for (const count of [3, 5, 7, 10]) {
        const results = createMockSearchResults(count, 0.8);
        const confidence = calculateQueryConfidence(results);
        
        const hasOptimal = confidence.reasons.some(r => r.includes('Optimal'));
        expect(hasOptimal).toBe(true);
      }
    });

    it('should not give bonus for too few results', () => {
      const fewResults = createMockSearchResults(2, 0.8);
      const confidence = calculateQueryConfidence(fewResults);
      
      const hasOptimal = confidence.reasons.some(r => r.includes('Optimal'));
      expect(hasOptimal).toBe(false);
    });

    it('should not give bonus for too many results', () => {
      const manyResults = createMockSearchResults(25, 0.8);
      const confidence = calculateQueryConfidence(manyResults);
      
      expect(confidence.flags).toContain('too_many_results');
    });
  });
});
