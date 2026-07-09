/**
 * Instinct Store — JSON-based pattern storage for learned behaviors
 * 
 * Stores hashed patterns with confidence scores, occurrences, and context.
 * GDPR-aware: patterns are hashed, no raw code or user-specific data stored.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

// ─── Types ─────────────────────────────────────────────────────────

export interface ProjectContext {
  language?: string;
  framework?: string;
  fileTypes?: string[];
  projectType?: string;
}

export interface InstinctPattern {
  id: string;
  toolSequence: string[];        // e.g., ["read", "grep", "str_replace"]
  projectContext: ProjectContext;
  confidence: number;             // 0.3-0.9
  occurrences: number;
  firstSeen: string;              // ISO date
  lastSeen: string;               // ISO date
  suggested: boolean;
  crossProject: boolean;           // Seen in multiple projects
  projectIds: string[];           // Projects where pattern was seen
  avgSessionLength?: number;      // Optional: avg tools per session
}

export interface InstinctStore {
  patterns: InstinctPattern[];
  version: string;
  lastUpdated: string;
}

export interface StoreConfig {
  storePath: string;
  maxPatterns: number;
  pruneThreshold: number;          // Confidence below this gets pruned
}

// ─── Defaults ──────────────────────────────────────────────────────

const DEFAULT_CONFIG: StoreConfig = {
  storePath: resolve(process.env.FORGEWRIGHT_DIR || '', '.forgewright/instincts/store.json'),
  maxPatterns: 1000,
  pruneThreshold: 0.15,
};

// ─── Utility Functions ─────────────────────────────────────────────

/**
 * Generate a short hash for tool sequences
 * GDPR-aware: stores hash, not raw data
 */
export function hashToolSequence(tools: string[]): string {
  const normalized = tools.join('|').toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Generate UUID for patterns
 */
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Deep clone to prevent mutation
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ─── Store Class ───────────────────────────────────────────────────

export class InstinctStoreManager {
  private config: StoreConfig;
  private store: InstinctStore;
  private dirty: boolean = false;

  constructor(config: Partial<StoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = this.load();
  }

  /**
   * Load store from disk, or create new if doesn't exist
   */
  private load(): InstinctStore {
    const { storePath } = this.config;
    
    // Ensure directory exists
    const dir = dirname(storePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (existsSync(storePath)) {
      try {
        const raw = readFileSync(storePath, 'utf-8');
        const parsed = JSON.parse(raw) as InstinctStore;
        return {
          patterns: parsed.patterns || [],
          version: parsed.version || '1.0.0',
          lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        };
      } catch (err) {
        console.error(`[InstinctStore] Failed to parse store, creating fresh:`, err);
        return this.createFresh();
      }
    }

    return this.createFresh();
  }

  /**
   * Create a fresh store structure
   */
  private createFresh(): InstinctStore {
    return {
      patterns: [],
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Persist store to disk (debounced writes)
   */
  save(): void {
    if (!this.dirty) return;

    const { storePath } = this.config;
    const dir = dirname(storePath);
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      this.store.lastUpdated = new Date().toISOString();
      writeFileSync(storePath, JSON.stringify(this.store, null, 2), 'utf-8');
      this.dirty = false;
    } catch (err) {
      console.error(`[InstinctStore] Failed to save store:`, err);
    }
  }

  /**
   * Add or update a pattern
   */
  recordPattern(
    toolSequence: string[],
    projectContext: ProjectContext,
    projectId: string,
    confidence: number
  ): InstinctPattern {
    const hash = hashToolSequence(toolSequence);
    const now = new Date().toISOString();

    // Find existing pattern
    const existing = this.store.patterns.find(p => p.id === hash);

    if (existing) {
      // Update existing pattern
      existing.occurrences += 1;
      existing.lastSeen = now;
      existing.confidence = Math.max(existing.confidence, confidence);
      
      // Track cross-project
      if (!existing.projectIds.includes(projectId)) {
        existing.projectIds.push(projectId);
        existing.crossProject = existing.projectIds.length > 1;
      }

      // Merge context (keep non-empty values)
      if (projectContext.language && !existing.projectContext.language) {
        existing.projectContext.language = projectContext.language;
      }
      if (projectContext.framework && !existing.projectContext.framework) {
        existing.projectContext.framework = projectContext.framework;
      }

      this.dirty = true;
      return deepClone(existing);
    }

    // Create new pattern
    const newPattern: InstinctPattern = {
      id: hash,
      toolSequence,
      projectContext,
      confidence,
      occurrences: 1,
      firstSeen: now,
      lastSeen: now,
      suggested: false,
      crossProject: false,
      projectIds: [projectId],
    };

    this.store.patterns.push(newPattern);
    this.dirty = true;

    // Prune if needed
    if (this.store.patterns.length > this.config.maxPatterns) {
      this.pruneLowConfidence();
    }

    return deepClone(newPattern);
  }

  /**
   * Find patterns matching a tool sequence
   */
  findPattern(toolSequence: string[]): InstinctPattern | null {
    const hash = hashToolSequence(toolSequence);
    return this.store.patterns.find(p => p.id === hash) || null;
  }

  /**
   * Get all patterns for a project
   */
  getPatternsForProject(projectId: string): InstinctPattern[] {
    return this.store.patterns.filter(p => p.projectIds.includes(projectId));
  }

  /**
   * Get patterns ready for promotion (confidence >= threshold)
   */
  getPromotablePatterns(minConfidence: number = 0.7): InstinctPattern[] {
    return this.store.patterns
      .filter(p => p.confidence >= minConfidence && !p.suggested)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Mark a pattern as suggested
   */
  markSuggested(patternId: string): void {
    const pattern = this.store.patterns.find(p => p.id === patternId);
    if (pattern) {
      pattern.suggested = true;
      this.dirty = true;
    }
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): InstinctPattern[] {
    return deepClone(this.store.patterns);
  }

  /**
   * Prune low-confidence patterns to manage store size
   */
  private pruneLowConfidence(): void {
    const before = this.store.patterns.length;
    this.store.patterns = this.store.patterns
      .filter(p => p.confidence >= this.config.pruneThreshold)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxPatterns);
    
    const pruned = before - this.store.patterns.length;
    if (pruned > 0) {
      console.log(`[InstinctStore] Pruned ${pruned} low-confidence patterns`);
    }
  }

  /**
   * Get store stats
   */
  getStats(): {
    totalPatterns: number;
    avgConfidence: number;
    crossProjectCount: number;
    lastUpdated: string;
  } {
    const patterns = this.store.patterns;
    return {
      totalPatterns: patterns.length,
      avgConfidence: patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
        : 0,
      crossProjectCount: patterns.filter(p => p.crossProject).length,
      lastUpdated: this.store.lastUpdated,
    };
  }

  /**
   * Clear all patterns (for testing/reset)
   */
  clear(): void {
    this.store = this.createFresh();
    this.dirty = true;
    this.save();
  }
}

// ─── Singleton Instance ───────────────────────────────────────────

let _instance: InstinctStoreManager | null = null;

export function getInstinctStore(config?: Partial<StoreConfig>): InstinctStoreManager {
  if (!_instance) {
    _instance = new InstinctStoreManager(config);
  }
  return _instance;
}

// ─── CLI Interface ────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  // Direct execution: show stats
  const store = getInstinctStore();
  const stats = store.getStats();
  console.log(JSON.stringify(stats, null, 2));
}
