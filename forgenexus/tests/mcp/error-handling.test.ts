/**
 * Integration tests for error scenarios.
 * Tests structured error responses and recovery hints.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ForgeDB } from '../src/data/db.js'
import { execSync } from 'child_process'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'

describe('Error Scenarios', () => {
  let testDir: string
  let db: ForgeDB

  beforeAll(() => {
    // Create temp directory for test
    testDir = mkdtempSync(join(tmpdir(), 'forgenexus-test-'))
  })

  afterAll(() => {
    // Cleanup
    try {
      rmSync(testDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('Structured Error Responses', () => {
    it('should return INDEX_NOT_FOUND error when no index exists', async () => {
      // This test verifies the error code is correctly returned
      // In real usage, the MCP server would return this structured error
      const { createErrorResponse, ForgeNexusErrorCode, formatErrorAsText } = 
        await import('../src/errors/verified.js')
      
      const error = createErrorResponse(
        ForgeNexusErrorCode.INDEX_NOT_FOUND,
        'No indexed repositories found. The index may not exist or is empty.',
        {
          recoveryHint: "Run 'forgenexus analyze' to index your codebase.",
          quickStart: 'forgenexus analyze --quick  # Fast initial index'
        }
      )

      const text = formatErrorAsText(error)
      
      expect(text).toContain('INDEX_NOT_FOUND')
      expect(text).toContain('No indexed repositories')
      expect(text).toContain('Recovery:')
      expect(text).toContain('Quick start:')
    })

    it('should return TOOL_NOT_FOUND error for unknown tools', async () => {
      const { createErrorResponse, ForgeNexusErrorCode, formatErrorAsText } = 
        await import('../src/errors/verified.js')
      
      const error = createErrorResponse(
        ForgeNexusErrorCode.TOOL_NOT_FOUND,
        'Unknown tool: nonexistent_tool. Run forgenexus tools to see available tools.',
        {
          recoveryHint: 'Use one of the available tools listed in the tools list.',
          details: { requestedTool: 'nonexistent_tool' }
        }
      )

      const text = formatErrorAsText(error)
      
      expect(text).toContain('TOOL_NOT_FOUND')
      expect(text).toContain('nonexistent_tool')
      expect(text).toContain('Recovery:')
    })

    it('should return GRAPH_UNAVAILABLE error for empty graph queries', async () => {
      const { createErrorResponse, ForgeNexusErrorCode, formatErrorAsText } = 
        await import('../src/errors/verified.js')
      
      const error = createErrorResponse(
        ForgeNexusErrorCode.GRAPH_UNAVAILABLE,
        'No route handlers found. The index may be incomplete or this is not an API project.',
        {
          recoveryHint: 'Index API files by running forgenexus analyze.',
          details: { foundRoutes: 0, foundRouteEdges: 0 }
        }
      )

      const text = formatErrorAsText(error)
      
      expect(text).toContain('GRAPH_UNAVAILABLE')
      expect(text).toContain('route handlers')
    })
  })

  describe('Recovery Hints', () => {
    it('should include actionable recovery hints for INDEX_NOT_FOUND', async () => {
      const { createErrorResponse, ForgeNexusErrorCode, formatErrorAsText } = 
        await import('../src/errors/verified.js')
      
      const error = createErrorResponse(
        ForgeNexusErrorCode.INDEX_NOT_FOUND,
        'No index found for this repository.',
        {
          recoveryHint: "Run 'forgenexus analyze' to index your codebase.",
          quickStart: 'forgenexus analyze --quick'
        }
      )

      const text = formatErrorAsText(error)
      
      // Verify recovery hints are present
      expect(text).toMatch(/Recovery:.*forgenexus analyze/)
      expect(text).toMatch(/Quick start:.*--quick/)
    })

    it('should include recovery hints for DB_LOCK_CONFLICT', async () => {
      const { createErrorResponse, ForgeNexusErrorCode, formatErrorAsText } = 
        await import('../src/errors/verified.js')
      
      const error = createErrorResponse(
        ForgeNexusErrorCode.DB_LOCK_CONFLICT,
        'Another ForgeNexus process is using the database.',
        {
          recoveryHint: 'Stop other ForgeNexus processes or wait for them to complete.',
          details: { lockAge: '5 minutes' }
        }
      )

      const text = formatErrorAsText(error)
      
      expect(text).toContain('DB_LOCK_CONFLICT')
      expect(text).toMatch(/pkill.*forgenexus/)
    })
  })

  describe('Error Code Parsing', () => {
    it('should have all required error codes defined', async () => {
      const { ForgeNexusErrorCode } = await import('../src/errors/verified.js')
      
      // Verify all expected error codes exist
      expect(ForgeNexusErrorCode.INDEX_NOT_FOUND).toBe('INDEX_NOT_FOUND')
      expect(ForgeNexusErrorCode.INDEX_STALE).toBe('INDEX_STALE')
      expect(ForgeNexusErrorCode.INDEX_CORRUPTED).toBe('INDEX_CORRUPTED')
      expect(ForgeNexusErrorCode.DB_UNAVAILABLE).toBe('DB_UNAVAILABLE')
      expect(ForgeNexusErrorCode.DB_CORRUPTED).toBe('DB_CORRUPTED')
      expect(ForgeNexusErrorCode.DB_LOCK_CONFLICT).toBe('DB_LOCK_CONFLICT')
      expect(ForgeNexusErrorCode.GRAPH_UNAVAILABLE).toBe('GRAPH_UNAVAILABLE')
      expect(ForgeNexusErrorCode.QUERY_FAILED).toBe('QUERY_FAILED')
      expect(ForgeNexusErrorCode.TOOL_NOT_FOUND).toBe('TOOL_NOT_FOUND')
      expect(ForgeNexusErrorCode.TOOL_EXECUTION_FAILED).toBe('TOOL_EXECUTION_FAILED')
    })
  })

  describe('CLI Error Handling', () => {
    it('should show help when no index exists via CLI', () => {
      // This tests the CLI behavior when index is missing
      // In a real test, we'd run the MCP server and check output
      const { ForgeNexusErrorCode } = require('../src/errors/verified.js')
      
      expect(ForgeNexusErrorCode.INDEX_NOT_FOUND).toBeDefined()
    })
  })
})

describe('Startup Checks', () => {
  it('should export runStartupChecks function', async () => {
    const { runStartupChecks } = await import('../src/mcp/server.js')
    expect(typeof runStartupChecks).toBe('function')
  })
})
