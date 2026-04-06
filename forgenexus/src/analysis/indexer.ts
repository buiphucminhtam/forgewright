/**
 * ForgeNexus Indexer — High-Performance Incremental Code Intelligence Pipeline.
 *
 * Architecture:
 *   1. Scan      — discover source files via glob
 *   2. Parse     — tree-sitter AST → nodes + edges (chunked + parallel)
 *   3. Resolve    — bind UNKNOWN:* edges + module imports (suffix trie, O(1))
 *   4. Propagate  — cross-file binding propagation via topological sort
 *   5. Community  — Leiden algorithm (well-connected, timeout-protected)
 *   6. Process    — BFS execution flow tracing from entry points
 *   7. FTS        — incremental FTS5 update (only changed nodes)
 *   8. Embeddings — cache-first embedding generation
 *   9. Meta       — commit tracking + stats
 *
 * Performance optimizations (vs original):
 *   - Suffix trie import resolution: O(1) vs O(n*m)
 *   - Leiden community detection: well-connected, timeout, degree filtering
 *   - Incremental FTS: only changed nodes vs full rebuild
 *   - Embedding cache: skip re-embedding unchanged symbols
 *   - Early exit on unchanged git commit
 *   - Chunked byte-budget parsing
 */

import { readFileSync } from "fs";
import { basename } from "path";
import { execSync } from "child_process";
import { FileScanner, type ScannedFile } from "./scanner.js";
import { ParserEngine } from "./parser.js";
import { ForgeDB } from "../data/db.js";
import { detectLeidenCommunities } from "../data/leiden.js";
import { traceProcesses } from "../data/graph.js";
import { generateEmbeddings, detectProvider } from "../data/embeddings.js";
import { incrementalFTSUpdate } from "../data/fts-incremental.js";
import { buildSuffixIndex, resolveImportPath, buildNameUidMap, buildFileSymbolMap } from "./import-resolver.js";
import { parseFilesParallel, estimateBytes } from "./parallel.js";
import { propagateBindings, shouldSkipBindingPropagation } from "./binding-propagation.js";
import { detectFrameworks } from "./framework-detection.js";
import type { ForgeNexusConfig, RepoStats, CodeNode, CodeEdge } from "../types.js";
import type { ParseTask } from "./parallel.js";
import { defaultCodebaseDbPath } from "../paths.js";

export type Phase = "scanning" | "parsing" | "edges" | "binding" | "communities" | "processes" | "fts" | "embeddings" | "complete";

export class Indexer {
  private scanner: FileScanner;
  private parser: ParserEngine;
  private db: ForgeDB;
  private config: Required<ForgeNexusConfig>;

  constructor(basePath: string, config: ForgeNexusConfig = {}) {
    this.config = {
      languages: config.languages ?? [
        "typescript", "javascript", "python",
        "go", "rust", "java", "csharp",
        "cpp", "c", "kotlin", "php", "ruby", "swift", "dart",
      ],
      maxFileSize: config.maxFileSize ?? 512 * 1024,
      skipPatterns: config.skipPatterns ?? [],
      includeEmbeddings: config.includeEmbeddings ?? false,
      repoName: config.repoName ?? basename(basePath),
      repoPath: config.repoPath ?? basePath,
      dbPath: config.dbPath ?? defaultCodebaseDbPath(basePath),
    };
    this.scanner = new FileScanner(basePath, this.config);
    this.parser = new ParserEngine();
    this.db = new ForgeDB(this.config.dbPath);
  }

  async analyze(
    onProgress?: (phase: Phase, pct: number) => void,
    incremental = true
  ): Promise<RepoStats> {
    const progress = (phase: Phase, pct: number) => {
      if (onProgress) onProgress(phase, pct);
    };

    // ── 0. Early exit on unchanged commit ─────────────────────────────────────
    if (incremental) {
      const earlyExit = this.checkEarlyExit();
      if (earlyExit) {
        progress("complete", 100);
        return this.db.getStats();
      }
    }

    // ── 1. Scan files ─────────────────────────────────────────────────────────
    progress("scanning", 0);
    const files = await this.scanner.scan();
    progress("scanning", 100);

    let filesToParse: ScannedFile[] = files;

    if (incremental) {
      filesToParse = this.getChangedFilesSinceLastIndex(files);
    }

    const pathsToParse = new Set(filesToParse.map(f => f.path));

    if (filesToParse.length === 0) {
      progress("complete", 100);
      const stats = this.db.getStats();
      this.db.setMeta("indexed_at", new Date().toISOString());
      return stats;
    }

    // ── 2. Parallel/chunked parsing ────────────────────────────────────────────
    progress("parsing", 0);

    // Build parse tasks
    const tasks: ParseTask[] = [];
    for (const scannedFile of filesToParse) {
      try {
        const content = readFileSync(scannedFile.path, "utf8");
        tasks.push({
          filePath: scannedFile.path,
          content,
          language: scannedFile.language,
        });
      } catch {
        // skip unreadable files
      }
    }

    const estimatedMB = Math.round(estimateBytes(tasks) / 1024 / 1024);
    const isLargeRepo = tasks.length > 100 || estimatedMB > 5;

    let newNodes: CodeNode[] = [];
    let newEdges: CodeEdge[] = [];

    if (isLargeRepo) {
      // Use parallel parser for large repos
      const os = await import("os");
      const result = await parseFilesParallel(tasks, {
        concurrency: Math.max(1, Math.floor(os.cpus().length * 0.75)),
      });
      newNodes = result.nodes;
      newEdges = result.edges;
    } else {
      // Sequential for small repos (avoids worker spawn overhead)
      const engine = new ParserEngine();
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        try {
          const { nodes, edges } = await engine.parseFile(task.filePath, task.content, task.language);
          newNodes.push(...nodes);
          newEdges.push(...edges);
        } catch {
          // skip
        }
        if (i % 100 === 0 || i === tasks.length - 1) {
          progress("parsing", Math.round((i / tasks.length) * 100));
        }
      }
    }

    progress("parsing", 100);

    // ── 3. Incremental update: remove old nodes for changed files ──────────────
    const changedFilePaths = new Set([...pathsToParse]);
    const deletedFiles = this.getDeletedFiles();

    if (incremental && (newNodes.length > 0 || deletedFiles.length > 0)) {
      for (const fp of [...changedFilePaths, ...deletedFiles]) {
        this.removeNodesForFile(fp);
      }
    }

    // ── 4. Insert nodes ───────────────────────────────────────────────────────
    this.db.insertNodesBatch(newNodes);
    const changedUids = new Set(newNodes.map(n => n.uid));

    // ── 5. Resolve edges (with suffix trie for O(1) import resolution) ─────────
    progress("edges", 0);

    // Build suffix index from ALL files (not just changed)
    const allPaths = [...new Set([...files.map(f => f.path), ...[...this.db.getAllFilePaths()]])];
    const suffixIndex = buildSuffixIndex(allPaths);

    // Build fast name→uid map: O(n) single pass
    const allNodes = this.db.getAllNodes();
    const nameToUid = buildNameUidMap(allNodes);
    const fileSymbolMap = buildFileSymbolMap(allNodes);

    const resolvedEdges = this.resolveEdgesFast(allNodes, newEdges, nameToUid);
    progress("edges", 50);

    const moduleEdges = this.resolveModuleImportsFast(
      allNodes, newEdges, nameToUid, fileSymbolMap, suffixIndex
    );
    this.db.insertEdgesBatch(resolvedEdges);
    this.db.insertEdgesBatch(moduleEdges);
    progress("edges", 100);

    // ── 6. Cross-file binding propagation ────────────────────────────────────
    progress("binding", 0);
    const allEdgesNow = this.db.getAllEdges();
    if (!shouldSkipBindingPropagation(allNodes, allEdgesNow)) {
      const propagated = propagateBindings(allNodes, allEdgesNow);
      if (propagated.length > 0) {
        this.db.insertEdgesBatch(propagated);
      }
    }
    progress("binding", 100);

    // ── 7. Community detection (Leiden) ─────────────────────────────────────────
    progress("communities", 0);

    // Determine if full rebuild or partial
    const nodeNames = new Map(allNodes.map(n => [n.uid, n.name]));
    const allEdgesForComm = this.db.getAllEdges();
    const commEdges = allEdgesForComm
      .filter(e => ['CALLS', 'IMPORTS', 'HAS_METHOD', 'HAS_PROPERTY', 'EXTENDS', 'IMPLEMENTS', 'MEMBER_OF'].includes(e.type))
      .map(e => ({ from: e.fromUid, to: e.toUid, weight: e.confidence }));

    const allNodeIds = allNodes.map(n => n.uid);

    // Check if incremental community update is viable
    if (incremental && changedFilePaths.size > 0) {
      // Partial: delete only affected communities, keep the rest
      this.deleteAffectedCommunities(changedFilePaths);
    } else {
      // Full rebuild
      this.db.db.exec('DELETE FROM communities');
      this.db.db.exec('UPDATE nodes SET community = NULL');
    }

    // Run Leiden with timeout protection
    const communities = detectLeidenCommunities(
      allNodeIds,
      commEdges,
      nodeNames,
      {
        resolution: allNodes.length > 10000 ? 2.0 : 1.0,
        maxIterations: allNodes.length > 10000 ? 3 : 10,
      }
    );

    // Communities table was already cleared above (partial or full)
    // Now insert the new communities
    for (const community of communities) {
      this.db.insertCommunity(community);
      for (const nodeUid of community.nodes) {
        const node = this.db.getNode(nodeUid);
        if (node) {
          this.db.insertNode({ ...node, community: community.id });
        }
      }
    }
    progress("communities", 100);

    // ── 8. Process tracing ───────────────────────────────────────────────────
    progress("processes", 0);
    this.db.db.exec('DELETE FROM processes');
    this.db.db.exec('UPDATE nodes SET process_name = NULL');

    const processes = traceProcesses(this.db);
    for (const proc of processes) {
      this.db.insertProcess(proc);
      for (const step of proc.steps) {
        const node = this.db.getNode(step.uid);
        if (node) {
          this.db.insertNode({ ...node, process: proc.id });
        }
      }
    }
    progress("processes", 100);

    // ── 9. Incremental FTS update ─────────────────────────────────────────────
    progress("fts", 0);
    if (incremental) {
      incrementalFTSUpdate(this.db, changedUids, allNodes.length);
    } else {
      this.db.rebuildFTS();
    }
    progress("fts", 100);

    // ── 10. Embeddings (cache-first via generateEmbeddings internal logic) ──────
    if (this.config.includeEmbeddings) {
      progress("embeddings", 0);
      try {
        const provider = (process.env.EMBEDDING_PROVIDER as any) ?? detectProvider();
        // generateEmbeddings auto-selects nodes WHERE embedding IS NULL,
        // so changed/new nodes get embedded; unchanged nodes are skipped.
        const result = await generateEmbeddings(this.db, { provider });
        console.error(`[ForgeNexus] Embeddings: ${result.count} generated (${result.elapsedMs}ms) via ${result.provider}`);
      } catch (e) {
        console.warn(`[ForgeNexus] Embeddings skipped: ${e}`);
      }
      progress("embeddings", 100);
    }

    // ── 11. Update meta ──────────────────────────────────────────────────────
    const stats = this.db.getStats();
    this.db.setMeta("indexed_at", new Date().toISOString());
    try {
      const lastCommit = execSync("git rev-parse HEAD 2>/dev/null", { encoding: "utf8" }).trim();
      this.db.setMeta("last_commit", lastCommit);
    } catch { /* not a git repo */ }
    this.db.setMeta("repo_name", this.config.repoName);
    this.db.setMeta("repo_path", this.config.repoPath);

    // Track indexed files
    const allPathsStr = files.map(f => f.path).join('\n');
    this.db.setMeta("indexed_files", allPathsStr);

    // Detect frameworks for metadata
    try {
      const allContents = new Map<string, string>();
      for (const f of files.slice(0, 50)) {
        try {
          allContents.set(f.path, readFileSync(f.path, 'utf8'));
        } catch { /* skip */ }
      }
      const frameworks = detectFrameworks(files.map(f => f.path), allContents);
      if (frameworks.length > 0) {
        this.db.setMeta("detected_frameworks", frameworks.map(f => f.framework).join(','));
      }
    } catch { /* framework detection is best-effort */ }

    progress("complete", 100);
    return stats;
  }

  /**
   * Check if the repo is already up-to-date (early exit).
   */
  private checkEarlyExit(): boolean {
    try {
      const lastCommit = this.db.getMeta("last_commit");
      const lastIndexedAt = this.db.getMeta("indexed_at");
      if (!lastCommit || !lastIndexedAt) return false;

      const currentCommit = execSync("git rev-parse HEAD 2>/dev/null", { encoding: "utf8" }).trim();
      return currentCommit === lastCommit;
    } catch {
      return false;
    }
  }

  /**
   * Get list of files that have changed since the last index.
   */
  private getChangedFilesSinceLastIndex(allFiles: ScannedFile[]): ScannedFile[] {
    const lastCommit = this.db.getMeta("last_commit");
    const lastIndexedAt = this.db.getMeta("indexed_at");

    if (!lastCommit || !lastIndexedAt) {
      return allFiles;
    }

    try {
      const output = execSync(
        `git diff --name-only ${lastCommit} HEAD`,
        { encoding: "utf8" }
      ).trim();

      const changedInCommit = new Set(output.split("\n").map(l => l.trim()).filter(Boolean));

      // Also check uncommitted changes
      let uncommitted: string[] = [];
      try {
        const uncommittedOutput = execSync("git diff --name-only", { encoding: "utf8" }).trim();
        uncommitted = uncommittedOutput.split("\n").map(l => l.trim()).filter(Boolean);
      } catch { /* no uncommitted changes */ }

      try {
        const stagedOutput = execSync("git diff --cached --name-only", { encoding: "utf8" }).trim();
        uncommitted.push(...stagedOutput.split("\n").map(l => l.trim()).filter(Boolean));
      } catch { /* no staged changes */ }

      const allChanged = new Set([...changedInCommit, ...uncommitted]);
      const repoPath = this.config.repoPath;

      const changedFiles = allFiles.filter(f => {
        const relPath = f.path.replace(repoPath + '/', '').replace(repoPath, '');
        return allChanged.has(relPath) || allChanged.has('./' + relPath);
      });

      if (changedFiles.length > allFiles.length * 0.5) {
        return allFiles;
      }

      return changedFiles.length > 0 ? changedFiles : allFiles;
    } catch {
      return allFiles;
    }
  }

  /**
   * Get files that were deleted since last index.
   */
  private getDeletedFiles(): string[] {
    try {
      const lastCommit = this.db.getMeta("last_commit");
      if (!lastCommit) return [];
      const output = execSync(
        `git diff --name-status ${lastCommit} HEAD`,
        { encoding: "utf8" }
      ).trim();
      return output.split("\n")
        .map(l => l.trim())
        .filter(l => l.startsWith('D\t') || l.startsWith('D '))
        .map(l => l.replace(/^[AMD]\t/, ''));
    } catch {
      return [];
    }
  }

  /**
   * Remove nodes and edges for a specific file.
   * Uses indexed file_path column (not LIKE patterns).
   */
  private removeNodesForFile(filePath: string): void {
    // Use indexed file_path column for fast lookup
    const nodesToDelete = (this.db as any).db.prepare(
      'SELECT uid FROM nodes WHERE file_path = ?'
    ).all(filePath) as any[];

    const uidsToDelete = new Set(nodesToDelete.map((r: any) => r.uid));

    if (uidsToDelete.size > 0) {
      // Delete edges referencing these nodes
      const placeholders = [...uidsToDelete].map(() => '?').join(', ');
      (this.db as any).db.prepare(
        `DELETE FROM edges WHERE from_uid IN (${placeholders}) OR to_uid IN (${placeholders})`
      ).run(...[...uidsToDelete], ...[...uidsToDelete]);

      // Delete nodes
      (this.db as any).db.prepare('DELETE FROM nodes WHERE file_path = ?').run(filePath);
    }
  }

  /**
   * Delete only communities that contain nodes in changed files.
   */
  private deleteAffectedCommunities(changedFilePaths: Set<string>): void {
    // Find communities that have nodes in changed files
    const affectedComms = new Set<string>();
    for (const fp of changedFilePaths) {
      const nodes = (this.db as any).db.prepare(
        'SELECT DISTINCT community FROM nodes WHERE file_path = ? AND community IS NOT NULL'
      ).all(fp) as any[];
      for (const row of nodes) {
        if (row.community) affectedComms.add(row.community);
      }
    }

    if (affectedComms.size > 0 && affectedComms.size < 20) {
      const placeholders = [...affectedComms].map(() => '?').join(', ');
      (this.db as any).db.prepare(`DELETE FROM communities WHERE id IN (${placeholders})`)
        .run(...[...affectedComms]);

      // Clear community assignment for affected nodes
      const nodePlaceholders = [...changedFilePaths].map(() => '?').join(', ');
      (this.db as any).db.prepare(
        `UPDATE nodes SET community = NULL WHERE file_path IN (${nodePlaceholders})`
      ).run(...[...changedFilePaths]);
    } else {
      // Too many affected communities — full rebuild
      (this.db as any).db.exec('DELETE FROM communities');
      (this.db as any).db.exec('UPDATE nodes SET community = NULL');
    }
  }

  /**
   * Fast edge resolution using pre-built name→uid map.
   * O(n) instead of O(n²) table scan.
   */
  private resolveEdgesFast(
    nodes: CodeNode[],
    edges: CodeEdge[],
    nameToUid: Map<string, string>
  ): CodeEdge[] {
    const resolved: CodeEdge[] = [];

    for (const edge of edges) {
      const toUid = edge.toUid;

      // Skip non-UNKNOWN edges
      if (toUid.startsWith("IMPORT:") || toUid.startsWith("QUERY:") ||
          toUid.startsWith("Route:") || toUid.startsWith("Tool:") ||
          toUid.startsWith("MEMBER_OF:") || toUid.startsWith("ORM:")) {
        resolved.push(edge);
        continue;
      }

      if (toUid.startsWith("UNKNOWN:")) {
        const parts = toUid.split(":");
        const type = parts[1];
        const calleeName = parts[2];

        if (!type || !calleeName) {
          resolved.push(edge);
          continue;
        }

        const key = `${type}:${calleeName}`;
        const resolvedUid = nameToUid.get(key);

        if (resolvedUid) {
          resolved.push({ ...edge, toUid: resolvedUid });
        } else {
          resolved.push(edge);
        }
      } else {
        resolved.push(edge);
      }
    }

    return resolved;
  }

  /**
   * Fast module import resolution using suffix trie.
   * O(1) path lookup instead of O(n*m) suffix matching.
   */
  private resolveModuleImportsFast(
    nodes: CodeNode[],
    edges: CodeEdge[],
    nameToUid: Map<string, string>,
    fileSymbolMap: Map<string, Set<string>>,
    suffixIndex: ReturnType<typeof buildSuffixIndex>
  ): CodeEdge[] {
    const moduleEdges: CodeEdge[] = [];

    for (const edge of edges) {
      if (edge.type === "IMPORTS" && edge.toUid.startsWith("IMPORT:")) {
        const parts = edge.toUid.split(":");
        const source = parts[1];
        const symbol = parts[2] ?? "default";

        let resolvedUid: string | null = null;

        // Try exact symbol name first (fast path)
        if (symbol !== "module" && symbol !== "default" && symbol !== "file" && symbol !== "wildcard") {
          resolvedUid = nameToUid.get(`${symbol}:${symbol}`) ?? null;
        }

        // Try suffix trie resolution for path-based imports
        if (!resolvedUid && source && (source.startsWith(".") || source.startsWith("/"))) {
          const fromFile = edge.fromUid.split(':')[0];
          const resolvedPath = resolveImportPath(source, fromFile, suffixIndex);

          if (resolvedPath) {
            // Find symbol in resolved file
            const symbols = fileSymbolMap.get(resolvedPath);
            if (symbols) {
              if (symbol !== "default" && symbols.has(symbol)) {
                resolvedUid = nameToUid.get(`${symbol}:${symbol}`) ?? null;
              }
              if (!resolvedUid) {
                // Take any symbol from the file (default export)
                const anySymbol = [...symbols][0];
                if (anySymbol) {
                  resolvedUid = nameToUid.get(`${anySymbol}:${anySymbol}`) ?? null;
                }
              }
            }
          }
        }

        if (resolvedUid) {
          moduleEdges.push({
            ...edge,
            toUid: resolvedUid,
            confidence: Math.min(edge.confidence + 0.1, 1.0),
            reason: 'suffix-trie-resolved',
          });
        } else {
          moduleEdges.push(edge);
        }
      } else {
        moduleEdges.push(edge);
      }
    }

    return moduleEdges;
  }

  getDB(): ForgeDB { return this.db; }
  close(): void { this.db.close(); }
}
