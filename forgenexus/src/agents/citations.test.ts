import { describe, it, expect } from 'vitest';
import { extractCitations, addCitationMarkers } from './citations.js';

describe('CitationModule', () => {
  describe('extractCitations', () => {
    it('extracts citations from text', () => {
      const text = 'According to source [1], the answer is 42.';
      const sources = [
        { id: '1', content: 'The answer is 42', metadata: {} },
      ];
      const citations = extractCitations(text, sources);
      expect(Array.isArray(citations)).toBe(true);
    });

    it('handles empty inputs', () => {
      const citations = extractCitations('', []);
      expect(Array.isArray(citations)).toBe(true);
    });
  });

  describe('addCitationMarkers', () => {
    it('adds markers to text', () => {
      const text = 'The answer is 42.';
      const citations = [
        { id: '1', source: 'doc1', text: '42', relevance: 0.9 },
      ];
      const result = addCitationMarkers(text, citations);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('handles empty citations', () => {
      const text = 'Plain text.';
      const result = addCitationMarkers(text, []);
      expect(result).toBe(text);
    });
  });
});
