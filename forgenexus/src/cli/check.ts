/**
 * check subcommand — Quick status check for ForgeNexus.
 * 
 * Provides a quick overview without full stats.
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { nexusDataDir, defaultCodebaseDbPath } from '../paths.js'
import { ForgeDB } from '../data/db.js'

export function check(opts: { repoPath: string }): void {
  const { repoPath } = opts
  const nexusDir = nexusDataDir(repoPath)
  const dbPath = defaultCodebaseDbPath(repoPath)

  // Quick checks
  let indexExists = false
  let hasLock = false
  let isStale = false
  let stats = { files: 0, nodes: 0, edges: 0 }

  // Check index
  if (existsSync(dbPath)) {
    indexExists = true
    
    try {
      const db = new ForgeDB(dbPath, { readOnly: true })
      stats = db.getStats()
      
      // Check lock
      hasLock = db.hasLockError
      
      // Check freshness
      const indexedAt = db.getMeta('indexed_at')
      if (indexedAt) {
        const hoursSinceIndex = (Date.now() - new Date(indexedAt).getTime()) / (1000 * 60 * 60)
        isStale = hoursSinceIndex > 24
      }
      
      db.close()
    } catch {
      // Ignore errors
    }
  }

  // Check lock file
  const lockPath = join(nexusDir, '.lock')
  const lockExists = existsSync(lockPath)

  // Output
  console.log('')
  
  if (indexExists) {
    console.log('✅ Index exists')
    console.log(`   Nodes: ${stats.nodes.toLocaleString()}`)
    console.log(`   Edges: ${stats.edges.toLocaleString()}`)
    
    if (isStale) {
      console.log('⚠️  Index is stale (run forgenexus analyze to update)')
    } else {
      console.log('✅ Index is fresh')
    }
    
    if (hasLock) {
      console.log('🔒 Lock conflict detected')
    }
  } else {
    console.log('❌ No index found')
    console.log('   Run: forgenexus analyze')
  }
  
  if (lockExists && !hasLock) {
    console.log('🔒 Lock file exists (server may be running)')
  }
  
  console.log('')
}
