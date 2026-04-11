/**
 * RAG Module - Chunking Strategies for ForgeWright
 * 
 * Provides text chunking for RAG retrieval.
 */

export interface ChunkOptions {
  maxTokens?: number;
  overlap?: number;
  splitOn?: 'sentence' | 'paragraph' | 'line';
}

export interface Chunk {
  id: string;
  text: string;
  startLine: number;
  endLine: number;
  metadata: Record<string, unknown>;
}

/**
 * Split text into chunks with configurable strategies
 */
export function chunkText(
  text: string,
  lines: string[],
  options: ChunkOptions = {}
): Chunk[] {
  const {
    maxTokens = 512,
    overlap = 50,
    splitOn = 'sentence',
  } = options;

  const chunks: Chunk[] = [];
  let currentChunk = '';
  let currentLines: number[] = [];
  let chunkId = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokens(line);

    // Check if adding this line exceeds limit
    const currentTokens = estimateTokens(currentChunk);
    if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        id: `chunk-${chunkId++}`,
        text: currentChunk.trim(),
        startLine: currentLines[0] ?? 0,
        endLine: currentLines[currentLines.length - 1] ?? 0,
        metadata: {
          tokenCount: estimateTokens(currentChunk),
          lineCount: currentLines.length,
        },
      });

      // Start new chunk with overlap
      const overlapLines = currentLines.slice(-Math.floor(overlap / 10));
      currentChunk = lines.slice(overlapLines[0] ?? 0, i).join('\n');
      currentLines = [i];
    }

    currentChunk += (currentChunk.length > 0 ? '\n' : '') + line;
    currentLines.push(i);

    // Handle split strategy
    if (splitOn === 'sentence' && /[.!?]$/.test(line.trim())) {
      // Sentence boundary - could split here
    }
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push({
      id: `chunk-${chunkId}`,
      text: currentChunk.trim(),
      startLine: currentLines[0] ?? 0,
      endLine: currentLines[currentLines.length - 1] ?? 0,
      metadata: {
        tokenCount: estimateTokens(currentChunk),
        lineCount: currentLines.length,
      },
    });
  }

  return chunks;
}

/**
 * Split code into chunks based on structure
 */
export function chunkCode(
  code: string,
  language: string
): Chunk[] {
  const lines = code.split('\n');
  const chunks: Chunk[] = [];
  
  // Language-specific patterns
  const patterns: Record<string, RegExp[]> = {
    typescript: [
      /^export (class|interface|type|function|const|enum)/m,
      /^class \w+/m,
      /^interface \w+/m,
      /^function \w+/m,
      /export \{ \w+ \}/m,
    ],
    javascript: [
      /^export (class|function|const|let|var)/m,
      /^class \w+/m,
      /^function \w+/m,
    ],
    python: [
      /^class \w+/m,
      /^def \w+/m,
      /^[A-Z_]+\s*=/m,
    ],
    go: [
      /^func \w+/m,
      /^type \w+ struct/m,
      /^type \w+ interface/m,
    ],
    rust: [
      /^struct \w+/m,
      /^impl \w+/m,
      /^fn \w+/m,
      /^pub (struct|fn|mod)/m,
    ],
  };

  const langPatterns = patterns[language] || patterns.javascript;
  
  let currentChunk = '';
  let currentLines: number[] = [];
  let chunkId = 0;
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBoundary = langPatterns.some(p => p.test(line));
    
    // Start new chunk at boundaries
    if (isBoundary && currentChunk.length > 200) {
      chunks.push({
        id: `chunk-${chunkId++}`,
        text: currentChunk.trim(),
        startLine,
        endLine: i - 1,
        metadata: {
          language,
          chunkType: 'function',
        },
      });
      currentChunk = '';
      startLine = i;
    }

    currentChunk += (currentChunk.length > 0 ? '\n' : '') + line;
    currentLines.push(i);
  }

  // Add final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `chunk-${chunkId}`,
      text: currentChunk.trim(),
      startLine,
      endLine: lines.length - 1,
      metadata: {
        language,
        chunkType: 'module',
      },
    });
  }

  return chunks;
}

/**
 * Estimate token count (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Recursive text chunking for long documents
 */
export function recursiveChunk(
  text: string,
  options: {
    maxTokens?: number;
    minChunkSize?: number;
    delimiters?: string[];
  } = {}
): Chunk[] {
  const {
    maxTokens = 512,
    minChunkSize = 50,
    delimiters = ['\n\n', '\n', '. ', ' '],
  } = options;

  if (estimateTokens(text) <= maxTokens) {
    return [{
      id: 'chunk-0',
      text,
      startLine: 0,
      endLine: 0,
      metadata: {},
    }];
  }

  const chunks: Chunk[] = [];
  
  for (const delimiter of delimiters) {
    const parts = text.split(delimiter);
    
    if (parts.length > 1) {
      let currentChunk = '';
      let chunkId = 0;
      
      for (const part of parts) {
        const testChunk = currentChunk + (currentChunk.length > 0 ? delimiter : '') + part;
        
        if (estimateTokens(testChunk) > maxTokens && currentChunk.length > 0) {
          if (estimateTokens(currentChunk) >= minChunkSize) {
            chunks.push({
              id: `chunk-${chunkId++}`,
              text: currentChunk.trim(),
              startLine: 0,
              endLine: 0,
              metadata: { delimiter },
            });
          }
          currentChunk = part;
        } else {
          currentChunk = testChunk;
        }
      }
      
      // Add remaining
      if (currentChunk.trim().length >= minChunkSize) {
        chunks.push({
          id: `chunk-${chunkId}`,
          text: currentChunk.trim(),
          startLine: 0,
          endLine: 0,
          metadata: { delimiter },
        });
      }
      
      break;
    }
  }

  return chunks;
}

/**
 * Semantic chunking - split by meaning boundaries
 */
export function semanticChunk(
  text: string,
  options: {
    targetChunkSize?: number;
    overlap?: number;
  } = {}
): Chunk[] {
  const { targetChunkSize = 500, overlap = 100 } = options;
  
  const lines = text.split('\n');
  const chunks: Chunk[] = [];
  
  // Find semantic boundaries (headings, code blocks, etc.)
  const boundaries: number[] = [0];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Markdown headings, code block markers, etc.
    if (/^#{1,6}\s/.test(line) || /^```/.test(line) || /^!!!/.test(line)) {
      boundaries.push(i);
    }
  }
  boundaries.push(lines.length);
  
  // Create chunks around boundaries
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const sectionText = lines.slice(start, end).join('\n');
    
    // Split large sections
    if (estimateTokens(sectionText) > targetChunkSize * 2) {
      const subChunks = recursiveChunk(sectionText, {
        maxTokens: targetChunkSize,
        minChunkSize: overlap,
      });
      chunks.push(...subChunks.map((c, idx) => ({
        ...c,
        id: `chunk-${i}-${idx}`,
        startLine: start + c.startLine,
        endLine: start + c.endLine,
      })));
    } else {
      chunks.push({
        id: `chunk-${i}`,
        text: sectionText.trim(),
        startLine: start,
        endLine: end - 1,
        metadata: {},
      });
    }
  }
  
  return chunks;
}
