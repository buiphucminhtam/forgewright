/**
 * Input Conventions - URL, stdin, @path handling
 *
 * Supported formats:
 * - URL: https://example.com/file.md
 * - stdin: - (dash)
 * - @path: @/path/to/file.md (relative to cwd)
 * - Literal: Just text content
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { AgentEnvelope } from '../types/index.js';
import { EXIT_CODES } from '../exit-codes.js';

/**
 * Input type detection
 */
export type InputType = 'url' | 'stdin' | 'file' | 'literal';

export interface InputResult {
  type: InputType;
  content: string;
  metadata?: {
    url?: string;
    filePath?: string;
    size?: number;
  };
}

/**
 * Detect input type from string
 */
export function detectInputType(input: string): InputType {
  // URL
  if (input.match(/^https?:\/\//i)) {
    return 'url';
  }

  // stdin
  if (input === '-') {
    return 'stdin';
  }

  // @file path
  if (input.startsWith('@')) {
    return 'file';
  }

  // File path (absolute or .something)
  if (isAbsolute(input) || input.startsWith('./') || input.startsWith('../')) {
    return 'file';
  }

  return 'literal';
}

/**
 * Resolve input based on type
 */
export async function resolveInput(input: string): Promise<InputResult> {
  const type = detectInputType(input);

  switch (type) {
    case 'url':
      return resolveUrl(input);

    case 'stdin':
      return resolveStdin();

    case 'file':
      return resolveFilePath(input.startsWith('@') ? input.slice(1) : input);

    case 'literal':
      return {
        type: 'literal',
        content: input,
        metadata: {
          size: input.length,
        },
      };

    default:
      throw new Error(`Unknown input type: ${type}`);
  }
}

/**
 * Resolve URL input
 */
async function resolveUrl(url: string): Promise<InputResult> {
  // Security: Only allow http/https
  if (!url.match(/^https?:\/\//i)) {
    throw new InputError(
      `Invalid URL protocol. Only http:// and https:// are allowed.`,
      EXIT_CODES.USAGE_ERROR
    );
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'Accept': 'text/*, application/json, */*',
      },
    });

    if (!response.ok) {
      throw new InputError(
        `Failed to fetch URL: ${response.status} ${response.statusText}`,
        EXIT_CODES.TOOL_ERROR
      );
    }

    const content = await response.text();

    return {
      type: 'url',
      content,
      metadata: {
        url,
        size: content.length,
      },
    };
  } catch (error) {
    if (error instanceof InputError) {
      throw error;
    }
    throw new InputError(
      `Failed to fetch URL: ${error instanceof Error ? error.message : String(error)}`,
      EXIT_CODES.TOOL_ERROR
    );
  }
}

/**
 * Resolve stdin input
 */
async function resolveStdin(): Promise<InputResult> {
  return new Promise((resolve, reject) => {
    let data = '';
    const maxSize = 10 * 1024 * 1024; // 10MB limit

    process.stdin.on('readable', () => {
      let chunk: string | Buffer | null;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk.toString();

        // Check size limit
        if (data.length > maxSize) {
          reject(
            new InputError(
              `Input exceeds maximum size of ${maxSize} bytes`,
              EXIT_CODES.USAGE_ERROR
            )
          );
          return;
        }
      }
    });

    process.stdin.on('end', () => {
      resolve({
        type: 'stdin',
        content: data,
        metadata: {
          size: data.length,
        },
      });
    });

    process.stdin.on('error', (error) => {
      reject(
        new InputError(
          `Failed to read stdin: ${error.message}`,
          EXIT_CODES.INTERNAL_ERROR
        )
      );
    });
  });
}

/**
 * Resolve file path input
 */
function resolveFilePath(filePath: string): InputResult {
  const resolvedPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);

  // Security: Prevent path traversal
  if (resolvedPath.includes('..')) {
    throw new InputError(
      `Path traversal not allowed: ${filePath}`,
      EXIT_CODES.USAGE_ERROR
    );
  }

  // Security: Only allow certain extensions
  const allowedExtensions = ['.md', '.txt', '.json', '.yaml', '.yml', '.ts', '.js', '.py', '.go', '.rs'];
  const ext = resolvedPath.slice(resolvedPath.lastIndexOf('.')).toLowerCase();

  if (ext && !allowedExtensions.includes(ext)) {
    throw new InputError(
      `File type not allowed: ${ext}. Allowed: ${allowedExtensions.join(', ')}`,
      EXIT_CODES.USAGE_ERROR
    );
  }

  if (!existsSync(resolvedPath)) {
    throw new InputError(
      `File not found: ${filePath}`,
      EXIT_CODES.USAGE_ERROR
    );
  }

  try {
    const content = readFileSync(resolvedPath, 'utf-8');

    return {
      type: 'file',
      content,
      metadata: {
        filePath: resolvedPath,
        size: content.length,
      },
    };
  } catch (error) {
    throw new InputError(
      `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      EXIT_CODES.TOOL_ERROR
    );
  }
}

/**
 * Custom input error
 */
export class InputError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number
  ) {
    super(message);
    this.name = 'InputError';
  }
}

/**
 * Validate JSON input
 */
export function parseJsonInput(input: string): Record<string, unknown> {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new InputError(
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      EXIT_CODES.USAGE_ERROR
    );
  }
}
