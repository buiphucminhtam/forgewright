import { describe, it, expect } from 'vitest';
import { chunkText, chunkCode, recursiveChunk, semanticChunk } from './chunker.js';

describe('RAG Chunker', () => {
  describe('chunkText', () => {
    it('chunks text with options', () => {
      const text = 'This is a test sentence. This is another sentence. And a third one.';
      const chunks = chunkText(text, { chunkSize: 100, overlap: 10 });
      expect(Array.isArray(chunks)).toBe(true);
    });

    it('handles empty text with options', () => {
      const chunks = chunkText('', { chunkSize: 100, overlap: 10 });
      expect(Array.isArray(chunks)).toBe(true);
    });
  });

  describe('chunkCode', () => {
    it('chunks TypeScript code', () => {
      const code = `function foo() { return 1; }
function bar() { return 2; }`;
      const chunks = chunkCode(code, 'typescript');
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('handles empty code', () => {
      const chunks = chunkCode('', 'typescript');
      expect(Array.isArray(chunks)).toBe(true);
    });
  });

  describe('recursiveChunk', () => {
    it('chunks text recursively', () => {
      const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
      const chunks = recursiveChunk(text);
      expect(Array.isArray(chunks)).toBe(true);
    });
  });

  describe('semanticChunk', () => {
    it('chunks with semantic boundaries', () => {
      const text = '# Header\n\nParagraph one.\n\n## Subheader\n\nParagraph two.';
      const chunks = semanticChunk(text);
      expect(Array.isArray(chunks)).toBe(true);
    });
  });
});
