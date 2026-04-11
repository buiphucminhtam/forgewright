import { describe, it, expect } from 'vitest';
import { calculateConfidence, getConfidenceLevel, getBehavior } from './confidence.js';

describe('ConfidenceModule', () => {
  describe('calculateConfidence', () => {
    it('returns critical for no results', () => {
      const result = calculateConfidence({
        type: 'query',
        results: [],
      });
      expect(result.level).toBe('critical');
      expect(result.behavior).toBe('refuse');
    });

    it('handles wiki type with evidence', () => {
      const result = calculateConfidence({
        type: 'wiki',
        evidence: [
          {
            type: 'code',
            content: 'function test() {}',
            source: 'test.ts',
            line: 1,
            relevance: 0.9,
          },
        ],
      });
      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('handles impact type', () => {
      const result = calculateConfidence({
        type: 'impact',
        evidence: [
          {
            type: 'documentation',
            content: 'API docs',
            source: 'api.md',
            relevance: 0.8,
          },
        ],
      });
      expect(result).toBeDefined();
    });

    it('handles unknown type', () => {
      const result = calculateConfidence({ type: 'unknown' as any });
      expect(result.level).toBe('medium');
      expect(result.flags).toContain('unknown_type');
    });
  });

  describe('getConfidenceLevel', () => {
    it('returns correct levels', () => {
      expect(getConfidenceLevel(0.9)).toBe('high');
      expect(getConfidenceLevel(0.6)).toBe('low');
      expect(getConfidenceLevel(0.1)).toBe('critical');
    });
  });

  describe('getBehavior', () => {
    it('returns refuse for critical', () => {
      expect(getBehavior('critical')).toBe('refuse');
    });

    it('returns block for low', () => {
      expect(getBehavior('low')).toBe('block');
    });

    it('returns warn for medium', () => {
      expect(getBehavior('medium')).toBe('warn');
    });

    it('returns note for high', () => {
      expect(getBehavior('high')).toBe('note');
    });
  });
});
