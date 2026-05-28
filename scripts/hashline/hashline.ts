/**
 * Hashline — Content-Hash File Editing for AI Agents
 *
 * Solves the stale-line error problem:
 * - Every line read gets a LINE#HASH content hash
 * - Edits reference the hash, not line numbers
 * - If the file changed, the hash won't match and the edit is rejected
 *
 * Inspired by OmO's Hashline implementation.
 * Grok Code success rate improved 6.7% → 68.3% with hashline editing.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, statSync } from 'fs';

const HASH_LEN = 6;
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Interface for a single hashline
 */
export interface Hashline {
  number: number;     // Line number (1-indexed)
  hash: string;      // 6-char base62 hash
  content: string;    // Line content
  ref: string;        // Format: "LINE#HASH" (e.g., "33#MB")
}

/**
 * Interface for a hashline-formatted file
 */
export interface HashlineFile {
  path: string;
  mtime: number;
  lines: Hashline[];
}

/**
 * Generate a 6-char base62 hash from string content.
 * Uses truncated SHA-256 for deterministic, fast hashing.
 */
export function hashLine(content: string): string {
  const hash = createHash('sha256').update(content).digest('base64');
  let result = '';
  for (let i = 0; i < HASH_LEN && i < hash.length; i++) {
    const code = hash.charCodeAt(i);
    result += CHARSET[code % 62];
  }
  return result;
}

/**
 * Format a hashline reference: LINE#HASH
 */
export function formatRef(line: number, hash: string): string {
  return `${line}#${hash}`;
}

/**
 * Parse a hashline reference string
 * @returns { line: number, hash: string } or null if invalid
 */
export function parseRef(ref: string): { line: number; hash: string } | null {
  const match = ref.match(/^(\d+)#([A-Za-z0-9]{6})$/);
  if (!match) return null;
  return { line: parseInt(match[1], 10), hash: match[2] };
}

/**
 * Read a file and return hashline-formatted content
 */
export function readHashlineSync(path: string): HashlineFile {
  const content = readFileSync(path, 'utf8');
  const stat = statSync(path);
  const rawLines = content.split('\n');

  const lines: Hashline[] = rawLines.map((lineContent, index) => {
    const hash = hashLine(lineContent);
    return {
      number: index + 1,
      hash,
      content: lineContent,
      ref: formatRef(index + 1, hash),
    };
  });

  return {
    path,
    mtime: stat.mtimeMs,
    lines,
  };
}

/**
 * Read a specific range of lines
 */
export function readHashlineRangeSync(
  path: string,
  startLine: number,
  endLine: number
): HashlineFile {
  const file = readHashlineSync(path);
  const start = Math.max(1, startLine) - 1;
  const end = Math.min(file.lines.length, endLine);

  return {
    ...file,
    lines: file.lines.slice(start, end),
  };
}

/**
 * Format hashline content as string (for AI context)
 * Each line: "LINE#HASH| content"
 */
export function formatHashlineContent(file: HashlineFile): string {
  return file.lines
    .map(line => `${line.ref}| ${line.content}`)
    .join('\n');
}

/**
 * Verify a hashline reference against current file state
 * @returns true if the hash matches (line unchanged)
 */
export function verifyHashlineRef(
  path: string,
  lineNumber: number,
  expectedHash: string
): { valid: boolean; currentContent: string; currentHash: string } {
  const file = readHashlineSync(path);
  const line = file.lines[lineNumber - 1];

  if (!line) {
    return {
      valid: false,
      currentContent: '',
      currentHash: '',
    };
  }

  return {
    valid: line.hash === expectedHash,
    currentContent: line.content,
    currentHash: line.hash,
  };
}

/**
 * Apply an edit using hashline reference
 * @returns result with success status and diff if hash mismatch
 */
export function applyHashlineEdit(
  path: string,
  lineNumber: number,
  expectedHash: string,
  newContent: string
): { success: boolean; error?: string; diff?: { expected: string; actual: string } } {
  const file = readHashlineSync(path);
  const line = file.lines[lineNumber - 1];

  if (!line) {
    return {
      success: false,
      error: `Line ${lineNumber} does not exist in file`,
    };
  }

  // Verify hash match
  if (line.hash !== expectedHash) {
    return {
      success: false,
      error: `HASH_MISMATCH: Line ${lineNumber} has changed since last read.`,
      diff: {
        expected: line.content,
        actual: line.content,
      },
    };
  }

  // Apply the edit
  const allLines = readFileSync(path, 'utf8').split('\n');
  allLines[lineNumber - 1] = newContent;
  writeFileSync(path, allLines.join('\n'), 'utf8');

  return { success: true };
}

/**
 * CLI interface for reading files with hashline format
 */
export function hashlineReadCLI(path: string, startLine?: number, endLine?: number): string {
  let file: HashlineFile;

  if (startLine !== undefined && endLine !== undefined) {
    file = readHashlineRangeSync(path, startLine, endLine);
  } else {
    file = readHashlineSync(path);
  }

  return formatHashlineContent(file);
}

/**
 * CLI interface for applying hashline edits
 */
export function hashlineEditCLI(
  path: string,
  lineNumber: number,
  expectedHash: string,
  newContent: string
): { success: boolean; message: string; diff?: object } {
  const result = applyHashlineEdit(path, lineNumber, expectedHash, newContent);

  if (result.success) {
    return { success: true, message: `Line ${lineNumber} updated successfully.` };
  }

  return {
    success: false,
    message: result.error || 'Edit failed',
    diff: result.diff,
  };
}
