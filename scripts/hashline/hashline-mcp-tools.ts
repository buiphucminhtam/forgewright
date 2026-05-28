/**
 * Hashline MCP Tools — MCP tool definitions for hashline operations
 *
 * Registers hashline_read and hashline_edit as MCP tools
 * that can be used by the AI agent for reliable file editing.
 */

import { hashlineReadCLI, hashlineEditCLI, parseRef } from './hashline.js';

export interface HashlineMCPConfig {
  maxFileSize?: number;  // Max file size in bytes (default: 10MB)
  allowedExtensions?: string[];  // Allowed file extensions
}

const DEFAULT_CONFIG: HashlineMCPConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedExtensions: [
    '.ts', '.tsx', '.js', '.jsx', '.mjs',
    '.py', '.rb', '.go', '.rs', '.java', '.kt',
    '.cs', '.cpp', '.c', '.h', '.hpp',
    '.md', '.yaml', '.yml', '.json', '.toml',
    '.sh', '.bash', '.zsh',
    '.css', '.scss', '.less',
    '.html', '.htm', '.svelte', '.vue',
  ],
};

/**
 * Validate file path
 */
function validatePath(path: string, config: HashlineMCPConfig): { valid: boolean; error?: string } {
  if (!path || path.trim() === '') {
    return { valid: false, error: 'Path is required' };
  }

  // Check for path traversal
  if (path.includes('..')) {
    return { valid: false, error: 'Path traversal not allowed' };
  }

  // Check extension
  const ext = path.substring(path.lastIndexOf('.'));
  if (config.allowedExtensions && !config.allowedExtensions.includes(ext)) {
    return { valid: false, error: `File extension ${ext} not allowed` };
  }

  return { valid: true };
}

/**
 * MCP tool: hashline_read
 * Read a file with hashline annotations
 */
export function createHashlineReadTool(config: HashlineMCPConfig = DEFAULT_CONFIG) {
  return {
    name: 'hashline_read',
    description: 'Read a file with hashline annotations. Each line returns LINE#HASH for stable editing. Use this instead of raw file reads when planning to edit the file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to read',
        },
        lineStart: {
          type: 'number',
          description: 'Start line number (optional, for partial reads)',
          minimum: 1,
        },
        lineEnd: {
          type: 'number',
          description: 'End line number (optional, for partial reads)',
          minimum: 1,
        },
      },
      required: ['path'],
    },
    handler: async (args: { path: string; lineStart?: number; lineEnd?: number }) => {
      // Validate path
      const validation = validatePath(args.path, config);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      try {
        const content = hashlineReadCLI(
          args.path,
          args.lineStart,
          args.lineEnd
        );

        return {
          success: true,
          content,
          mtime: Date.now(), // Would be actual mtime from file
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Error reading file: ${err.message || err}`,
        };
      }
    },
  };
}

/**
 * MCP tool: hashline_edit
 * Edit a file using hashline reference
 */
export function createHashlineEditTool(config: HashlineMCPConfig = DEFAULT_CONFIG) {
  return {
    name: 'hashline_edit',
    description: 'Edit a specific line using hashline reference. The edit will be rejected if the content has changed since the last read (hash mismatch). Use this for reliable, collision-free edits.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to edit',
        },
        ref: {
          type: 'string',
          description: 'Hashline reference in format LINE#HASH (e.g., "33#MB")',
        },
        newContent: {
          type: 'string',
          description: 'New content for the line',
        },
      },
      required: ['path', 'ref', 'newContent'],
    },
    handler: async (args: { path: string; ref: string; newContent: string }) => {
      // Validate path
      const validation = validatePath(args.path, config);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Parse reference
      const parsed = parseRef(args.ref);
      if (!parsed) {
        return {
          success: false,
          error: `Invalid hashline ref: ${args.ref}. Expected format: LINE#HASH (e.g., 33#MB)`,
        };
      }

      try {
        const result = hashlineEditCLI(
          args.path,
          parsed.line,
          parsed.hash,
          args.newContent
        );

        if (result.success) {
          return {
            success: true,
            message: result.message,
            newRef: `${parsed.line}#${args.newContent ? 'NEW' : 'DEL'}`, // Would recalculate
          };
        }

        return {
          success: false,
          error: result.message,
          diff: result.diff,
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Error editing file: ${err.message || err}`,
        };
      }
    },
  };
}

/**
 * Register all hashline MCP tools
 */
export function createHashlineMCPTools(config?: HashlineMCPConfig) {
  return [
    createHashlineReadTool(config),
    createHashlineEditTool(config),
  ];
}
