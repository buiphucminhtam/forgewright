/**
 * RAG Module - Retriever for ForgeWright
 * 
 * Main retrieval interface that combines hybrid search with citations.
 */

import { hybridSearch, advancedHybridSearch } from './hybrid-search.js';
import { defaultReranker } from './reranker.js';
import { CITATION_PATTERN } from '../agents/prompts.js';

// Re-export citation pattern
export { CITATION_PATTERN } from '../agents/prompts.js';

export interface RetrievedChunk {
  id: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  text: string;
  relevance: number;
  score: number;
  scoreBreakdown?: {
    bm25: number;
    vector: number;
    combined: number;
  };
}

export interface Citation {
  id: string;
  claim: string;
  source: string;
  line?: number;
  verified: boolean;
  relevance?: number;
}

export interface RetrievedContext {
  chunks: RetrievedChunk[];
  citations: Citation[];
  relevance: number;
  totalChunks: number;
  query: string;
  metadata: {
    searchType: 'hybrid' | 'bm25' | 'vector';
    reranked: boolean;
    retrievalTime: number;
  };
}

export interface RetrieveOptions {
  limit?: number;
  minRelevance?: number;
  hybrid?: boolean;
  rerank?: boolean;
  includeCitations?: boolean;
}

export interface DocumentStore {
  search(query: string, options?: { limit?: number }): Promise<Array<{
    id: string;
    file: string;
    lineStart?: number;
    lineEnd?: number;
    text: string;
  }>>;
}

/**
 * Create a RAG retriever
 */
export function createRetriever(
  documentStore: DocumentStore,
  options: {
    hybrid?: boolean;
    rerank?: boolean;
    defaultLimit?: number;
    minRelevance?: number;
  } = {}
): Retriever {
  return new Retriever(documentStore, options);
}

/**
 * Retriever class
 */
export class Retriever {
  private documentStore: DocumentStore;
  private hybrid: boolean;
  private rerank: boolean;
  private defaultLimit: number;
  private minRelevance: number;

  constructor(documentStore: DocumentStore, options: {
    hybrid?: boolean;
    rerank?: boolean;
    defaultLimit?: number;
    minRelevance?: number;
  } = {}) {
    this.documentStore = documentStore;
    this.hybrid = options.hybrid ?? true;
    this.rerank = options.rerank ?? true;
    this.defaultLimit = options.defaultLimit ?? 20;
    this.minRelevance = options.minRelevance ?? 0.1;
  }

  /**
   * Retrieve chunks with citations
   */
  async retrieve(
    query: string,
    options: RetrieveOptions = {}
  ): Promise<RetrievedContext> {
    const startTime = Date.now();
    
    const limit = options.limit ?? this.defaultLimit;
    
    // Search document store
    const docs = await this.documentStore.search(query, { limit: limit * 2 });
    
    if (docs.length === 0) {
      return {
        chunks: [],
        citations: [],
        relevance: 0,
        totalChunks: 0,
        query,
        metadata: {
          searchType: this.hybrid ? 'hybrid' : 'bm25',
          reranked: false,
          retrievalTime: Date.now() - startTime,
        },
      };
    }
    
    // Format for search
    const searchDocs = docs.map(d => ({
      id: `${d.file}:${d.lineStart ?? 0}`,
      text: d.text,
    }));
    
    // Search
    let searchResults;
    if (this.hybrid) {
      searchResults = advancedHybridSearch(query, searchDocs, { limit });
    } else {
      searchResults = hybridSearch(query, searchDocs, { limit });
    }
    
    // Map back to chunks
    let chunks: RetrievedChunk[] = searchResults
      .filter(r => r.score >= this.minRelevance)
      .map(r => {
        const doc = docs.find(d => `${d.file}:${d.lineStart ?? 0}` === r.id);
        return {
          id: r.id,
          file: doc?.file ?? r.file,
          lineStart: doc?.lineStart ?? 0,
          lineEnd: doc?.lineEnd ?? 0,
          text: doc?.text ?? r.text,
          relevance: r.score,
          score: r.score,
          scoreBreakdown: r.scoreBreakdown,
        };
      });
    
    // Rerank
    if (this.rerank && chunks.length > 1) {
      const reranked = defaultReranker(chunks, { topK: limit });
      chunks = reranked.map((r, i) => ({
        ...chunks.find(c => c.id === r.id)!,
        relevance: 1 - i / chunks.length,
      }));
    }
    
    // Extract citations
    const citations = options.includeCitations !== false
      ? this.extractCitations(chunks)
      : [];
    
    // Calculate average relevance
    const avgRelevance = chunks.length > 0
      ? chunks.reduce((sum, c) => sum + c.relevance, 0) / chunks.length
      : 0;
    
    return {
      chunks: chunks.slice(0, limit),
      citations,
      relevance: avgRelevance,
      totalChunks: chunks.length,
      query,
      metadata: {
        searchType: this.hybrid ? 'hybrid' : 'bm25',
        reranked: this.rerank,
        retrievalTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Retrieve with citations for wiki generation
   */
  async retrieveWithCitations(
    query: string,
    options: RetrieveOptions = {}
  ): Promise<{
    context: RetrievedContext;
    groundingContext: string;
  }> {
    const context = await this.retrieve(query, {
      ...options,
      includeCitations: true,
    });
    
    // Build grounding context with citations
    const groundingContext = this.buildGroundingContext(context);
    
    return { context, groundingContext };
  }

  /**
   * Extract citations from chunks
   */
  private extractCitations(chunks: RetrievedChunk[]): Citation[] {
    const citations: Citation[] = [];
    const seen = new Set<string>();
    
    for (const chunk of chunks) {
      const matches = chunk.text.match(new RegExp(CITATION_PATTERN));
      
      if (matches) {
        for (const match of matches) {
          const parsed = this.parseCitation(match);
          
          if (!seen.has(parsed.source)) {
            seen.add(parsed.source);
            citations.push({
              id: `cite-${citations.length + 1}`,
              claim: this.extractClaimFromChunk(chunk.text, match),
              source: parsed.source,
              line: parsed.line,
              verified: true,
              relevance: chunk.relevance,
            });
          }
        }
      }
    }
    
    return citations;
  }

  /**
   * Parse a citation string
   */
  private parseCitation(citation: string): { source: string; line?: number } {
    const match = citation.match(/\[source:([^\]:]+)(?::(\d+))?\]/);
    
    if (match) {
      return {
        source: match[1],
        line: match[2] ? parseInt(match[2], 10) : undefined,
      };
    }
    
    return { source: citation };
  }

  /**
   * Extract the claim associated with a citation
   */
  private extractClaimFromChunk(text: string, citation: string): string {
    // Find the sentence containing the citation
    const citationIndex = text.indexOf(citation);
    if (citationIndex === -1) return '';
    
    // Get surrounding context
    const start = Math.max(0, citationIndex - 150);
    const end = Math.min(text.length, citationIndex + citation.length + 150);
    const context = text.slice(start, end);
    
    // Extract the sentence
    const sentenceMatch = context.match(/[^.!?]*\[[^\]]+\][^.!?]*[.!?]?/);
    return sentenceMatch ? sentenceMatch[0].trim() : context.trim();
  }

  /**
   * Build grounding context with citations
   */
  private buildGroundingContext(context: RetrievedContext): string {
    const parts: string[] = [];
    
    // Header
    parts.push(`## Evidence for Query: "${context.query}"`);
    parts.push(`Relevance: ${(context.relevance * 100).toFixed(0)}% | Sources: ${context.chunks.length}`);
    parts.push('');
    
    // Add chunks with citations
    for (const chunk of context.chunks) {
      parts.push(`### [Source: ${chunk.file}:${chunk.lineStart}-${chunk.lineEnd}]`);
      parts.push(`Relevance: ${(chunk.relevance * 100).toFixed(0)}%`);
      parts.push('');
      parts.push('```');
      parts.push(chunk.text);
      parts.push('```');
      parts.push('');
    }
    
    // Add citation summary
    if (context.citations.length > 0) {
      parts.push('## Citations');
      parts.push('');
      
      for (const citation of context.citations) {
        parts.push(`- [source:${citation.source}${citation.line ? `:${citation.line}` : ''}] ${citation.claim}`);
      }
    }
    
    return parts.join('\n');
  }
}

/**
 * Mock document store for testing
 */
export class MockDocumentStore implements DocumentStore {
  private documents: Array<{
    id: string;
    file: string;
    lineStart: number;
    lineEnd: number;
    text: string;
  }>;

  constructor(documents: Array<{
    file: string;
    lineStart?: number;
    lineEnd?: number;
    text: string;
  }>) {
    this.documents = documents.map((d, i) => ({
      id: `${d.file}:${d.lineStart ?? 0}`,
      file: d.file,
      lineStart: d.lineStart ?? 0,
      lineEnd: d.lineEnd ?? (d.lineStart ?? 0) + d.text.split('\n').length,
      text: d.text,
    }));
  }

  async search(_query: string, options?: { limit?: number }): Promise<Array<{
    id: string;
    file: string;
    lineStart?: number;
    lineEnd?: number;
    text: string;
  }>> {
    const limit = options?.limit ?? this.documents.length;
    return this.documents.slice(0, limit);
  }
}

/**
 * Create a simple in-memory document store
 */
export function createInMemoryStore(documents: Array<{
  file: string;
  lineStart?: number;
  lineEnd?: number;
  text: string;
}>): MockDocumentStore {
  return new MockDocumentStore(documents);
}
