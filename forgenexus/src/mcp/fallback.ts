/**
 * Text-Search Fallback Module
 * 
 * Provides grep/find-based fallbacks when the graph is unavailable.
 * This enables ForgeNexus to work even without running `forgenexus analyze`.
 */

import { execSync } from 'child_process'
import { existsSync, statSync, readdirSync } from 'fs'
import { join, extname, relative } from 'path'
import { promisify } from 'util'

const exec = promisify(execSync)

// Configuration
const FALLBACK_CONFIG = {
  maxFiles: 1000,
  maxResults: 50,
  timeoutMs: 10000,
  excludes: [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '__pycache__',
    '.venv',
    'venv',
    '*.min.js',
    '*.map',
    '.cache',
    '.tmp',
  ],
  includeExtensions: [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.pyw',
    '.java', '.kt', '.scala',
    '.go',
    '.rs',
    '.rb', '.erb',
    '.php',
    '.cs', '.fs',
    '.cpp', '.c', '.h', '.hpp',
    '.swift',
    '.kt',
    '.vue', '.svelte',
  ],
}

// Rate limiting
let fallbackCount = 0
let fallbackWindowStart = Date.now()
const FALLBACK_RATE_LIMIT = 10 // max fallbacks per minute

interface FallbackResult {
  success: boolean
  results: string[]
  tool: string
  query: string
  partial?: boolean
  error?: string
}

interface SearchOptions {
  query: string
  cwd: string
  extensions?: string[]
  maxResults?: number
}

/**
 * Check if fallback is allowed (rate limiting)
 */
export function canUseFallback(): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute
  
  // Reset counter if window has passed
  if (now - fallbackWindowStart > windowMs) {
    fallbackCount = 0
    fallbackWindowStart = now
  }
  
  const remaining = Math.max(0, FALLBACK_CONFIG.maxFiles - fallbackCount)
  return {
    allowed: fallbackCount < FALLBACK_CONFIG.maxFiles,
    remaining: FALLBACK_CONFIG.maxFiles - fallbackCount,
  }
}

/**
 * Mark a fallback as used
 */
function useFallback(): void {
  fallbackCount++
}

/**
 * Build grep exclude pattern
 */
function buildExcludePattern(): string {
  return FALLBACK_CONFIG.excludes
    .map(e => e.startsWith('*.') 
      ? `--exclude-glob="${e}"` 
      : `--exclude-dir="${e}"`)
    .join(' ')
}

/**
 * Search files by content using grep
 */
export async function searchContent(options: SearchOptions): Promise<FallbackResult> {
  const { query, cwd, extensions, maxResults } = options
  const limit = maxResults ?? FALLBACK_CONFIG.maxResults

  // Rate limit check
  const { allowed, remaining } = canUseFallback()
  if (!allowed) {
    return {
      success: false,
      results: [],
      tool: 'search',
      query,
      error: `Fallback rate limit exceeded (${FALLBACK_CONFIG.maxFiles} searches/minute). Run 'forgenexus analyze' for unlimited access.`,
    }
  }

  useFallback()

  try {
    // Build extensions filter
    const extFilter = (extensions ?? FALLBACK_CONFIG.includeExtensions)
      .map(e => `--include="*${e}"`)
      .join(' ')

    // Build command
    const excludePattern = buildExcludePattern()
    const cmd = `grep -rn ${extFilter} ${excludePattern} -e "${query}" "${cwd}" 2>/dev/null | head -${limit}`

    const stdout = execSync(cmd, {
      encoding: 'utf8',
      timeout: FALLBACK_CONFIG.timeoutMs,
      cwd,
    })

    const results = stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        // Parse grep output: filepath:line:content
        const colonIndex = line.indexOf(':')
        if (colonIndex === -1) return line
        
        const filepath = line.substring(0, colonIndex)
        const rest = line.substring(colonIndex + 1)
        const secondColonIndex = rest.indexOf(':')
        
        if (secondColonIndex === -1) {
          return `${filepath}:${rest}`
        }
        
        const lineNum = rest.substring(0, secondColonIndex)
        const content = rest.substring(secondColonIndex + 1)
        
        return `${filepath}:${lineNum}: ${content.substring(0, 100)}`
      })

    return {
      success: true,
      results,
      tool: 'search',
      query,
      partial: results.length >= limit,
    }
  } catch (e: any) {
    // grep returns non-zero when no matches
    if (e.status === 1) {
      return {
        success: true,
        results: [],
        tool: 'search',
        query,
      }
    }
    
    return {
      success: false,
      results: [],
      tool: 'search',
      query,
      error: `Search failed: ${e.message}`,
    }
  }
}

/**
 * Find files by name pattern
 */
export async function findByName(pattern: string, cwd: string): Promise<FallbackResult> {
  const { allowed } = canUseFallback()
  if (!allowed) {
    return {
      success: false,
      results: [],
      tool: 'find',
      query: pattern,
      error: `Fallback rate limit exceeded. Run 'forgenexus analyze' for unlimited access.`,
    }
  }

  useFallback()

  try {
    const cmd = `find "${cwd}" -type f \\( ${FALLBACK_CONFIG.includeExtensions.map(e => `-name "*${e}"`).join(' -o ') } \\) -name "*${pattern}*" 2>/dev/null | head -${FALLBACK_CONFIG.maxResults}`

    const stdout = execSync(cmd, {
      encoding: 'utf8',
      timeout: FALLBACK_CONFIG.timeoutMs,
      cwd,
    })

    const results = stdout.split('\n').filter(Boolean)

    return {
      success: true,
      results,
      tool: 'find',
      query: pattern,
    }
  } catch (e: any) {
    return {
      success: false,
      results: [],
      tool: 'find',
      query: pattern,
      error: `Find failed: ${e.message}`,
    }
  }
}

/**
 * Get file outline (function/class definitions)
 */
export async function getFileOutline(filePath: string): Promise<FallbackResult> {
  const { allowed } = canUseFallback()
  if (!allowed) {
    return {
      success: false,
      results: [],
      tool: 'outline',
      query: filePath,
      error: `Fallback rate limit exceeded. Run 'forgenexus analyze' for unlimited access.`,
    }
  }

  useFallback()

  try {
    const ext = extname(filePath).toLowerCase()
    let pattern = ''

    // Different patterns for different languages
    switch (ext) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
        // Function/class definitions
        pattern = '^(export\\s+)?(function|class|const|let|var)\\s+'
        break
      case '.py':
        pattern = '^(def|class)\\s+'
        break
      case '.go':
        pattern = '^func(tion)?\\s+'
        break
      case '.rs':
        pattern = '^(pub\\s+)?(fn|struct|impl|enum|trait)\\s+'
        break
      case '.java':
      case '.kt':
      case '.scala':
        pattern = '^(public|private|protected)?\\s*(class|interface|function|val|var)\\s+'
        break
      case '.cs':
        pattern = '^(public|private|protected)?\\s*(class|interface|struct|void|async)\\s+'
        break
      case '.rb':
        pattern = '^(def|class|module)\\s+'
        break
      case '.php':
        pattern = '^(function|class|interface|trait)\\s+'
        break
      default:
        pattern = '^(export\\s+)?(function|class|const)\\s+'
    }

    const cmd = `grep -n "${pattern}" "${filePath}" 2>/dev/null | head -50`

    const stdout = execSync(cmd, {
      encoding: 'utf8',
      timeout: FALLBACK_CONFIG.timeoutMs,
    })

    const results = stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [lineNum, ...content] = line.split(':')
        return `${filePath}:${lineNum}: ${content.join(':').substring(0, 80)}`
      })

    return {
      success: true,
      results,
      tool: 'outline',
      query: filePath,
    }
  } catch (e: any) {
    if (e.status === 1) {
      return {
        success: true,
        results: [],
        tool: 'outline',
        query: filePath,
      }
    }
    
    return {
      success: false,
      results: [],
      tool: 'outline',
      query: filePath,
      error: `Outline failed: ${e.message}`,
    }
  }
}

/**
 * Get context around a symbol (callers/callees via grep)
 */
export async function getSymbolContext(symbolName: string, cwd: string): Promise<FallbackResult> {
  const { allowed } = canUseFallback()
  if (!allowed) {
    return {
      success: false,
      results: [],
      tool: 'context',
      query: symbolName,
      error: `Fallback rate limit exceeded. Run 'forgenexus analyze' for unlimited access.`,
    }
  }

  useFallback()

  try {
    const extFilter = FALLBACK_CONFIG.includeExtensions
      .map(e => `--include="*${e}"`)
      .join(' ')

    const excludePattern = buildExcludePattern()
    
    // Find files that reference this symbol
    const cmd = `grep -rn ${extFilter} ${excludePattern} -e "\\b${symbolName}\\b" "${cwd}" 2>/dev/null | head -${FALLBACK_CONFIG.maxResults}`

    const stdout = execSync(cmd, {
      encoding: 'utf8',
      timeout: FALLBACK_CONFIG.timeoutMs,
      cwd,
    })

    const results = stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const parts = line.split(':')
        if (parts.length < 3) return line
        const [filepath, lineNum, ...content] = parts
        return `${filepath}:${lineNum}: ${content.join(':').substring(0, 100)}`
      })

    return {
      success: true,
      results,
      tool: 'context',
      query: symbolName,
    }
  } catch (e: any) {
    if (e.status === 1) {
      return {
        success: true,
        results: [],
        tool: 'context',
        query: symbolName,
      }
    }
    
    return {
      success: false,
      results: [],
      tool: 'context',
      query: symbolName,
      error: `Context search failed: ${e.message}`,
    }
  }
}

/**
 * Format fallback results for display
 */
export function formatFallbackResult(result: FallbackResult): string {
  const lines: string[] = []

  lines.push(`## Fallback Search: ${result.query}`)
  lines.push('')

  if (!result.success) {
    lines.push(`❌ ${result.error}`)
    lines.push('')
    lines.push('💡 Run `forgenexus analyze` for full graph-powered search.')
    return lines.join('\n')
  }

  if (result.results.length === 0) {
    lines.push('No results found.')
    return lines.join('\n')
  }

  lines.push(`⚠️ **Fallback Mode** (graph unavailable)`)
  lines.push('')
  lines.push(`Found ${result.results.length} result(s)${result.partial ? ' (truncated)' : ''}:`)
  lines.push('')

  for (const r of result.results) {
    lines.push(`- ${r}`)
  }

  lines.push('')
  lines.push('💡 Run `forgenexus analyze` for full graph-powered search with better accuracy.')

  return lines.join('\n')
}

/**
 * Check if fallback mode is needed
 */
export function isFallbackNeeded(db: any): boolean {
  try {
    const repos = db.listRepos()
    return repos.length === 0
  } catch {
    return true
  }
}
