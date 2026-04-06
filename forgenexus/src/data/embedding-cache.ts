/**
 * Embedding cache — stores embeddings in DB for incremental updates.
 *
 * On incremental analysis, we load existing embeddings from the DB,
 * embed only changed nodes, then save back. This avoids re-embedding
 * unchanged symbols.
 */

import type { ForgeDB } from './db.js';
import type { CodeNode } from '../types.js';

/**
 * Embedding cache: uid → embedding vector.
 */
export class EmbeddingCache {
  private cache: Map<string, number[]>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Load embeddings from the database for the given node UIDs.
   * Returns a cache with existing embeddings pre-loaded.
   */
  static fromDB(db: ForgeDB, uids?: string[]): EmbeddingCache {
    const cache = new EmbeddingCache();

    try {
      let rows: any[];
      if (uids && uids.length > 0) {
        const placeholders = uids.map(() => '?').join(', ');
        rows = (db as any).db.prepare(
          `SELECT uid, embedding FROM nodes WHERE embedding IS NOT NULL AND uid IN (${placeholders})`
        ).all(...uids) as any[];
      } else {
        rows = (db as any).db.prepare(
          "SELECT uid, embedding FROM nodes WHERE embedding IS NOT NULL"
        ).all() as any[];
      }

      for (const row of rows) {
        try {
          const embedding = JSON.parse(row.embedding);
          if (Array.isArray(embedding) && embedding.length > 0) {
            cache.cache.set(row.uid, embedding);
          }
        } catch {
          // skip malformed embeddings
        }
      }
    } catch {
      // DB might not have embedding column
    }

    return cache;
  }

  /**
   * Get an embedding from cache.
   */
  get(uid: string): number[] | undefined {
    return this.cache.get(uid);
  }

  /**
   * Set an embedding in cache.
   */
  set(uid: string, embedding: number[]): void {
    this.cache.set(uid, embedding);
  }

  /**
   * Get nodes that are missing from the cache.
   */
  missingUids(allUids: string[]): string[] {
    return allUids.filter(uid => !this.cache.has(uid));
  }

  /**
   * Get all cached embeddings as uid→vector map.
   */
  getAll(): Map<string, number[]> {
    return new Map(this.cache);
  }

  /**
   * Save all cached embeddings back to the database.
   */
  saveToDB(db: ForgeDB): number {
    const uids: string[] = [];
    const embeddings: number[][] = [];

    for (const [uid, embedding] of this.cache) {
      uids.push(uid);
      embeddings.push(embedding);
    }

    if (uids.length === 0) return 0;

    db.upsertEmbeddingsBatch(uids, embeddings);
    return uids.length;
  }

  get size(): number {
    return this.cache.size;
  }
}
