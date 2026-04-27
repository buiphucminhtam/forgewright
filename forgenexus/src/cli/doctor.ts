/**
 * doctor subcommand — Diagnose ForgeNexus setup and common issues.
 * 
 * Checks:
 * - Node.js version
 * - Git repository
 * - Index existence and integrity
 * - Database lock status
 * - Staleness
 * - Dependencies
 */

import { existsSync, statSync, readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { execSync } from 'child_process'
import { ForgeDB } from '../data/db.js'
import { nexusDataDir, defaultCodebaseDbPath, ensureNexusDataDirMigrated } from '../paths.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface DoctorResult {
  checks: DoctorCheck[]
  summary: {
    total: number
    passed: number
    warnings: number
    errors: number
  }
  recommendations: string[]
}

interface DoctorCheck {
  name: string
  status: 'ok' | 'warn' | 'error'
  message: string
  details?: string
  fix?: string
}

export function doctor(opts: { repoPath: string; fix?: boolean; verbose?: boolean }): void {
  const { repoPath, fix = false, verbose = false } = opts
  const checks: DoctorCheck[] = []
  const recommendations: string[] = []

  // ── Check 1: Node.js version ────────────────────────────────────────────────
  checks.push(checkNodeVersion())

  // ── Check 2: Git repository ─────────────────────────────────────────────────
  checks.push(checkGitRepo(repoPath))

  // ── Check 3: Index directory ────────────────────────────────────────────────
  const indexCheck = checkIndexDirectory(repoPath)
  checks.push(indexCheck)

  // ── Check 4: Index integrity (if exists) ───────────────────────────────────
  if (indexCheck.status !== 'error') {
    const integrityCheck = checkIndexIntegrity(repoPath, verbose)
    checks.push(...integrityCheck)
  }

  // ── Check 5: Lock file ──────────────────────────────────────────────────────
  checks.push(checkLockFile(repoPath))

  // ── Check 6: Staleness (if indexed) ────────────────────────────────────────
  if (indexCheck.status === 'ok') {
    const stalenessCheck = checkStaleness(repoPath)
    checks.push(stalenessCheck)
  }

  // ── Check 7: KuzuDB native binding ─────────────────────────────────────────
  checks.push(checkKuzuBinding(verbose))

  // ── Check 8: Tree-sitter parsers ───────────────────────────────────────────
  checks.push(checkTreeSitter(verbose))

  // ── Summary ─────────────────────────────────────────────────────────────────
  const passed = checks.filter(c => c.status === 'ok').length
  const warnings = checks.filter(c => c.status === 'warn').length
  const errors = checks.filter(c => c.status === 'error').length

  // Generate recommendations
  for (const check of checks) {
    if (check.fix) {
      recommendations.push(`${check.fix}`)
    }
  }

  // ── Output ─────────────────────────────────────────────────────────────────
  printDoctorOutput(checks, { passed, warnings, errors }, recommendations, fix)

  // Auto-fix if requested
  if (fix && errors > 0) {
    console.log('\n🔧 Attempting automatic fixes...\n')
    attemptAutoFix(repoPath, checks)
  }
}

function checkNodeVersion(): DoctorCheck {
  const version = process.version
  const major = parseInt(version.slice(1).split('.')[0])
  
  if (major >= 18) {
    return {
      name: 'Node.js',
      status: 'ok',
      message: `v${version} (${major >= 20 ? 'recommended' : 'supported'})`,
    }
  }
  return {
    name: 'Node.js',
    status: 'error',
    message: `v${version} (unsupported)`,
    details: 'ForgeNexus requires Node.js 18 or higher.',
    fix: 'Update Node.js: nvm install 20 && nvm use 20',
  }
}

function checkGitRepo(repoPath: string): DoctorCheck {
  const gitPath = join(repoPath, '.git')
  
  if (existsSync(gitPath)) {
    try {
      const branch = execSync('git branch --show-current', { cwd: repoPath, encoding: 'utf8' }).trim()
      return {
        name: 'Git',
        status: 'ok',
        message: `Repository on branch "${branch || 'detached'}"`,
      }
    } catch {
      return {
        name: 'Git',
        status: 'ok',
        message: 'Git repository detected (branch unknown)',
      }
    }
  }
  
  return {
    name: 'Git',
    status: 'warn',
    message: 'Not a git repository',
    details: 'Some features (staleness check, change detection) require git.',
  }
}

function checkIndexDirectory(repoPath: string): DoctorCheck {
  ensureNexusDataDirMigrated(repoPath)
  const nexusDir = nexusDataDir(repoPath)
  const dbPath = defaultCodebaseDbPath(repoPath)
  
  if (!existsSync(nexusDir)) {
    return {
      name: 'Index',
      status: 'error',
      message: 'Index directory not found',
      details: `Expected at: ${nexusDir}`,
      fix: `Run 'forgenexus analyze' to create the index`,
    }
  }
  
  if (!existsSync(dbPath)) {
    return {
      name: 'Index',
      status: 'error',
      message: 'Index database not found',
      details: `Expected at: ${dbPath}`,
      fix: `Run 'forgenexus analyze' to create the index`,
    }
  }
  
  try {
    const stats = statSync(dbPath)
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
    return {
      name: 'Index',
      status: 'ok',
      message: `Found (${sizeMB} MB)`,
      details: `Location: ${dbPath}`,
    }
  } catch {
    return {
      name: 'Index',
      status: 'error',
      message: 'Cannot read index file',
      details: `Path: ${dbPath}`,
      fix: `Run 'forgenexus analyze --force' to rebuild`,
    }
  }
}

function checkIndexIntegrity(repoPath: string, verbose: boolean): DoctorCheck[] {
  const checks: DoctorCheck[] = []
  const dbPath = defaultCodebaseDbPath(repoPath)
  
  try {
    // Detect format
    const header = readFileSync(dbPath)
    const isKuzuDB = !(header.length >= 16 && header.slice(0, 16).toString('utf8').startsWith('SQLite'))
    
    if (!isKuzuDB) {
      checks.push({
        name: 'Format',
        status: 'warn',
        message: 'Legacy SQLite format detected',
        details: 'Consider migrating to KuzuDB for better performance.',
        fix: 'Run forgenexus analyze --force to migrate',
      })
    } else {
      checks.push({
        name: 'Format',
        status: 'ok',
        message: 'KuzuDB format',
      })
    }

    // Open database and check stats
    const db = new ForgeDB(dbPath, { readOnly: true })
    const stats = db.getStats()
    
    if (stats.nodes === 0 && stats.edges === 0) {
      checks.push({
        name: 'Integrity',
        status: 'warn',
        message: 'Index appears empty (0 nodes, 0 edges)',
        details: 'The index may be incomplete or corrupted.',
        fix: 'Run forgenexus analyze --force to rebuild',
      })
    } else {
      checks.push({
        name: 'Integrity',
        status: 'ok',
        message: `${stats.nodes.toLocaleString()} nodes, ${stats.edges.toLocaleString()} edges`,
      })
    }
    
    // Check for lock error
    if (db.hasLockError) {
      checks.push({
        name: 'Lock',
        status: 'error',
        message: 'Database lock conflict detected',
        details: 'Another process may be using the database.',
        fix: 'Stop other ForgeNexus processes: pkill -f forgenexus',
      })
    }
    
    db.close()
  } catch (e: any) {
    checks.push({
      name: 'Integrity',
      status: 'error',
      message: `Cannot open database: ${e.message}`,
      details: verbose ? e.stack : undefined,
      fix: 'Run forgenexus analyze --force to rebuild',
    })
  }
  
  return checks
}

function checkLockFile(repoPath: string): DoctorCheck {
  const lockPath = join(repoPath, '.forgenexus', '.lock')
  
  if (!existsSync(lockPath)) {
    return {
      name: 'Lock File',
      status: 'ok',
      message: 'No lock file (no active server)',
    }
  }
  
  try {
    const stats = statSync(lockPath)
    const ageMs = Date.now() - stats.mtimeMs
    const ageMinutes = Math.floor(ageMs / 60000)
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60))
    
    if (ageMinutes > 5) {
      return {
        name: 'Lock File',
        status: 'warn',
        message: `Stale lock (${ageMinutes > 60 ? `${ageHours}h` : `${ageMinutes}m`} old)`,
        details: `Created: ${stats.mtime.toISOString()}`,
        fix: 'Run pkill -f forgenexus to clear stale locks',
      }
    }
    
    return {
      name: 'Lock File',
      status: 'ok',
      message: `Active lock (${ageMinutes}m old)`,
    }
  } catch {
    return {
      name: 'Lock File',
      status: 'warn',
      message: 'Lock file exists but cannot be read',
    }
  }
}

function checkStaleness(repoPath: string): DoctorCheck {
  const dbPath = defaultCodebaseDbPath(repoPath)
  
  try {
    const db = new ForgeDB(dbPath, { readOnly: true })
    const indexedAt = db.getMeta('indexed_at')
    const lastCommit = db.getMeta('last_commit')
    db.close()
    
    if (!indexedAt) {
      return {
        name: 'Freshness',
        status: 'warn',
        message: 'No indexed_at metadata',
        details: 'Index may be incomplete.',
      }
    }
    
    const hoursSinceIndex = (Date.now() - new Date(indexedAt).getTime()) / (1000 * 60 * 60)
    
    if (hoursSinceIndex > 168) { // 1 week
      return {
        name: 'Freshness',
        status: 'error',
        message: `Very stale (${(hoursSinceIndex / 24).toFixed(1)} days old)`,
        details: `Last indexed: ${indexedAt}`,
        fix: 'Run forgenexus analyze to update',
      }
    }
    
    if (hoursSinceIndex > 24) {
      return {
        name: 'Freshness',
        status: 'warn',
        message: `Stale (${hoursSinceIndex.toFixed(1)}h old)`,
        details: `Last indexed: ${indexedAt}`,
        fix: 'Run forgenexus analyze to update',
      }
    }
    
    return {
      name: 'Freshness',
      status: 'ok',
      message: `Fresh (${hoursSinceIndex.toFixed(1)}h ago)`,
    }
  } catch (e: any) {
    return {
      name: 'Freshness',
      status: 'warn',
      message: 'Cannot check freshness',
      details: e.message,
    }
  }
}

function checkKuzuBinding(verbose: boolean): DoctorCheck {
  try {
    // Try to require kuzu
    require.resolve('kuzu')
    return {
      name: 'KuzuDB',
      status: 'ok',
      message: 'Native binding available',
    }
  } catch {
    return {
      name: 'KuzuDB',
      status: 'error',
      message: 'Native binding not found',
      details: 'KuzuDB is required for ForgeNexus to work.',
      fix: 'Run npm install to install dependencies',
    }
  }
}

function checkTreeSitter(verbose: boolean): DoctorCheck {
  const requiredParsers = [
    'tree-sitter-javascript',
    'tree-sitter-typescript',
    'tree-sitter-python',
  ]
  
  const missing: string[] = []
  
  for (const parser of requiredParsers) {
    try {
      require.resolve(parser)
    } catch {
      missing.push(parser.replace('tree-sitter-', ''))
    }
  }
  
  if (missing.length > 0) {
    return {
      name: 'Tree-sitter',
      status: 'warn',
      message: `Missing parsers: ${missing.join(', ')}`,
      details: 'Some language support may be limited.',
      fix: 'Run npm install to install all dependencies',
    }
  }
  
  return {
    name: 'Tree-sitter',
    status: 'ok',
    message: 'All required parsers available',
  }
}

function printDoctorOutput(
  checks: DoctorCheck[],
  summary: { passed: number; warnings: number; errors: number },
  recommendations: string[],
  fix: boolean
): void {
  const total = checks.length
  const border = '═'.repeat(66)
  
  console.log('')
  console.log(`╔${border}╗`)
  console.log('║' + ' ForgeNexus Doctor v2.3.0'.padEnd(66) + '║')
  console.log(`╠${border}╣`)
  
  for (const check of checks) {
    const icon = check.status === 'ok' ? '✓' : check.status === 'warn' ? '⚠' : '✗'
    const statusStr = check.status === 'ok' ? 'OK' : check.status === 'warn' ? 'WARN' : 'ERROR'
    const line = `║  ${check.name.padEnd(12)} ${icon} ${statusStr.padEnd(7)} ${check.message.substring(0, 35).padEnd(35)} ║`
    console.log(line)
  }
  
  console.log(`╠${border}╣`)
  
  const statusLine = `║  Status: ${summary.passed} passed, ${summary.warnings} warnings, ${summary.errors} errors`.padEnd(66) + '║'
  console.log(statusLine)
  
  if (recommendations.length > 0) {
    console.log(`╠${border}╣`)
    console.log('║  Recommendations:'.padEnd(66) + '║')
    for (const rec of recommendations.slice(0, 5)) {
      const recLine = `║    • ${rec.substring(0, 55)}`.padEnd(66) + '║'
      console.log(recLine)
    }
  }
  
  console.log(`╚${border}╝`)
  
  if (summary.errors > 0) {
    console.log('\n❌ Some checks failed. Run "forgenexus doctor --fix" to attempt automatic repair.')
  } else if (summary.warnings > 0) {
    console.log('\n⚠️  Some checks have warnings. Your setup may not be optimal.')
  } else {
    console.log('\n✅ All checks passed! ForgeNexus is ready to use.')
  }
  
  console.log('')
}

function attemptAutoFix(repoPath: string, checks: DoctorCheck[]): void {
  for (const check of checks) {
    if (check.status === 'error' && check.fix) {
      console.log(`  Attempting to fix: ${check.name}`)
      // For now, just print the command
      console.log(`    Run: ${check.fix}`)
    }
  }
}
