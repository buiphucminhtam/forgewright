/**
 * Incremental re-indexing — only re-parse files that have changed since last index.
 * Tracks indexed files via `indexed_files` meta + last_commit.
 */

import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";
import { FileScanner, type ScannedFile } from "./scanner.js";
import { ParserEngine } from "./parser.js";
import { ForgeDB } from "../data/db.js";
import { detectCommunities, traceProcesses } from "../data/graph.js";
import { generateEmbeddings, detectProvider } from "../data/embeddings.js";
import type { ForgeNexusConfig, RepoStats, CodeNode, CodeEdge } from "../types.js";

export type Phase = "scanning" | "parsing" | "edges" | "communities" | "processes" | "fts" | "embeddings" | "complete";

const PIPELINE_PHASES: Phase[] = [
  "scanning", "parsing", "edges", "communities", "processes", "fts", "embeddings", "complete"
];

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
      dbPath: config.dbPath ?? join(basePath, ".gitnexus", "codebase.db"),
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

    // ── 1. Determine changed files (incremental vs full) ──────────────────────
    progress("scanning", 0);
    const files = await this.scanner.scan();
    progress("scanning", 100);

    let filesToParse: ScannedFile[] = files;

    if (incremental) {
      filesToParse = this.getChangedFilesSinceLastIndex(files);
    }

    const pathsToParse = filesToParse.map(f => f.path);

    if (filesToParse.length === 0) {
      progress("complete", 100);
      const stats = this.db.getStats();
      this.db.setMeta("indexed_at", new Date().toISOString());
      return stats;
    }

    // ── 2. Parse only changed files ───────────────────────────────────────────
    progress("parsing", 0);
    const newNodes: CodeNode[] = [];
    const newEdges: CodeEdge[] = [];

    for (let i = 0; i < filesToParse.length; i++) {
      const scannedFile = filesToParse[i];
      const file = scannedFile.path;
      try {
        const content = readFileSync(file, "utf8");
        const { nodes, edges } = await this.parser.parseFile(file, content, scannedFile.language);
        newNodes.push(...nodes);
        newEdges.push(...edges);
      } catch {
        // skip files that fail to parse
      }
      if (i % 100 === 0 || i === filesToParse.length - 1) {
        progress("parsing", Math.round((i / filesToParse.length) * 100));
      }
    }

    // ── 3. Handle incremental updates ─────────────────────────────────────────
    const changedFilePaths = new Set(pathsToParse);
    const deletedFiles = this.getDeletedFiles();

    if (incremental && newNodes.length > 0) {
      // Remove old nodes from changed files
      this.removeNodesForFiles([...changedFilePaths]);
      // Also remove nodes from deleted files
      for (const df of deletedFiles) {
        this.removeNodesForFiles([df]);
      }
    }

    // Insert new nodes
    this.db.insertNodesBatch(newNodes);
    progress("parsing", 100);

    // ── 4. Resolve and insert edges ──────────────────────────────────────────
    progress("edges", 0);
    const allNodes = this.db.db.prepare('SELECT * FROM nodes').all() as any[];
    const resolvedEdges = this.resolveEdges(allNodes, newEdges);
    this.db.insertEdgesBatch(resolvedEdges);
    progress("edges", 50);

    const moduleEdges = this.resolveModuleImports(allNodes, newEdges);
    this.db.insertEdgesBatch(moduleEdges);
    progress("edges", 100);

    // ── 5. Update communities (incremental: re-run on affected only) ───────────
    progress("communities", 0);
    const affectedByChangedFiles = new Set<string>();
    for (const node of newNodes) {
      affectedByChangedFiles.add(node.community ?? '');
    }
    if (incremental && affectedByChangedFiles.size > 0 && affectedByChangedFiles.size < 20) {
      // Partial update: only affected communities
      const placeholders = [...affectedByChangedFiles].map(() => '?').join(',');
      this.db.db.prepare(`DELETE FROM communities WHERE id IN (${placeholders})`)
        .run(...[...affectedByChangedFiles]);
    } else {
      // Full rebuild: clear and rebuild
      this.db.db.exec('DELETE FROM communities');
      this.db.db.exec('UPDATE nodes SET community = NULL');
    }
    const communities = detectCommunities(this.db);
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

    // ── 6. Update processes ──────────────────────────────────────────────────
    progress("processes", 0);
    if (incremental && changedFilePaths.size > 0) {
      // Partial: remove processes with nodes in changed files
      this.db.db.exec('DELETE FROM processes');
      this.db.db.exec('UPDATE nodes SET process_name = NULL');
    } else {
      this.db.db.exec('DELETE FROM processes');
      this.db.db.exec('UPDATE nodes SET process_name = NULL');
    }
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

    // ── 7. Rebuild FTS ────────────────────────────────────────────────────────
    progress("fts", 0);
    this.db.rebuildFTS();
    progress("fts", 100);

    // ── 8. Update embeddings for changed symbols ──────────────────────────────
    let embeddingCount = 0;
    if (this.config.includeEmbeddings) {
      progress("embeddings", 0);
      try {
        const provider = (process.env.EMBEDDING_PROVIDER as any) ?? detectProvider();
        const changedUids = newNodes.map(n => n.uid);

        // Generate embeddings for newly added/changed symbols
        const symbols = this.db.db.prepare(
          "SELECT uid, name, type, file_path, signature FROM nodes WHERE uid IN (" +
          changedUids.map(() => '?').join(',') + ") AND embedding IS NULL"
        ).all(...changedUids) as any[];

        if (symbols.length > 0) {
          const result = await generateEmbeddings(this.db, { provider });
          embeddingCount = result.count;
          console.error(`[ForgeNexus] Incremental embeddings: ${result.count} generated (${result.elapsedMs}ms)`);
        }
      } catch (e) {
        console.warn(`[ForgeNexus] Incremental embeddings skipped: ${e}`);
      }
      progress("embeddings", 100);
    }

    // ── 9. Update meta ────────────────────────────────────────────────────────
    const stats = this.db.getStats();
    this.db.setMeta("indexed_at", new Date().toISOString());
    try {
      const lastCommit = execSync("git rev-parse HEAD 2>/dev/null", { encoding: "utf8" }).trim();
      this.db.setMeta("last_commit", lastCommit);
    } catch { /* not a git repo */ }
    this.db.setMeta("repo_name", this.config.repoName);
    this.db.setMeta("repo_path", this.config.repoPath);

    // Track indexed files
    const allPaths = files.map(f => f).join('\n');
    this.db.setMeta("indexed_files", allPaths);

    progress("complete", 100);
    return stats;
  }

  /**
   * Get list of files that have changed since the last index.
   */
  private getChangedFilesSinceLastIndex(allFiles: ScannedFile[]): ScannedFile[] {
    const lastCommit = this.db.getMeta("last_commit");
    const lastIndexedAt = this.db.getMeta("indexed_at");

    if (!lastCommit || !lastIndexedAt) {
      // Never indexed — parse everything
      return allFiles;
    }

    try {
      // Get files changed since last commit
      const output = execSync(
        `git diff --name-only ${lastCommit} HEAD`,
        { encoding: "utf8" }
      ).trim();

      const changedInCommit = new Set(output.split("\n").map(l => l.trim()).filter(Boolean));
      const repoPath = this.config.repoPath;

      // Also check for any uncommitted changes
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

      // Filter to only files that are in allFiles
      const changedFiles = allFiles.filter(f => {
        const relPath = f.path.replace(repoPath + '/', '').replace(repoPath, '');
        return allChanged.has(relPath) || allChanged.has('./' + relPath);
      });

      // If too many files changed (> 50%), do full re-index
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
   * Remove nodes belonging to specific files from the database.
   */
  private removeNodesForFiles(filePaths: string[]): void {
    if (filePaths.length === 0) return;
    for (const fp of filePaths) {
      // Remove edges referencing this file
      this.db.db.prepare(`DELETE FROM edges WHERE from_uid LIKE ? OR to_uid LIKE ?`)
        .run(`%:${fp}:%`, `%:${fp}:%`);
      // Remove nodes from this file
      this.db.db.prepare(`DELETE FROM nodes WHERE file_path = ?`).run(fp);
    }
  }

  private resolveEdges(nodes: any[], edges: any[]): any[] {
    const nameToUid = new Map<string, string>();
    const fileBaseName = new Map<string, string>();

    for (const n of nodes) {
      const key = `${n.type}:${n.name}`;
      if (!nameToUid.has(key)) {
        nameToUid.set(key, n.uid);
      }
      if (!n.filePath) continue;
      const base = n.filePath.split("/").pop() ?? "";
      if (!fileBaseName.has(base)) {
        fileBaseName.set(base, n.uid);
      }
    }

    const resolved: any[] = [];
    for (const edge of edges) {
      const toUid = edge.toUid;
      if (!toUid) { resolved.push(edge); continue; }
      if (toUid.startsWith("IMPORT:") || toUid.startsWith("QUERY:") || toUid.startsWith("Route:") || toUid.startsWith("Tool:")) {
        resolved.push(edge);
        continue;
      }
      if (toUid.startsWith("UNKNOWN:")) {
        const parts = toUid.split(":");
        const type = parts[1];
        const calleeName = parts[2];
        if (!type || !calleeName) { resolved.push(edge); continue; }
        const exactKey = `${type}:${calleeName}`;
        const resolvedUid = nameToUid.get(exactKey);
        if (resolvedUid) {
          resolved.push({ ...edge, toUid: resolvedUid });
        }
      } else {
        resolved.push(edge);
      }
    }
    return resolved;
  }

  private resolveModuleImports(nodes: any[], edges: any[]): any[] {
    const moduleEdges: any[] = [];
    const fileSymbolMap = new Map<string, Set<string>>();
    for (const n of nodes) {
      if (!fileSymbolMap.has(n.filePath)) {
        fileSymbolMap.set(n.filePath, new Set());
      }
      fileSymbolMap.get(n.filePath)!.add(n.name);
    }
    const symbolToUid = new Map<string, string>();
    for (const n of nodes) {
      if (!symbolToUid.has(n.name)) {
        symbolToUid.set(n.name, n.uid);
      }
    }

    for (const edge of edges) {
      if (edge.type === "IMPORTS" && edge.toUid.startsWith("IMPORT:")) {
        const parts = edge.toUid.split(":");
        const source = parts[1];
        const symbol = parts[2] ?? "default";

        let resolvedUid: string | null = null;
        if (symbol !== "module" && symbol !== "default") {
          resolvedUid = symbolToUid.get(symbol) ?? null;
        }
        if (!resolvedUid && source && (source.startsWith(".") || source.startsWith("/"))) {
          for (const [filePath, symbols] of fileSymbolMap) {
            if (filePath.endsWith(source.replace(/^\.\//, "")) || filePath.endsWith(source + ".ts")
              || filePath.endsWith(source + ".js") || filePath.endsWith(source + "/index.ts")) {
              if (symbols.has(symbol) || symbol === "default") {
                resolvedUid = symbolToUid.get([...symbols][0]) ?? null;
              }
            }
          }
        }
        if (resolvedUid) {
          moduleEdges.push({
            ...edge,
            toUid: resolvedUid,
            confidence: Math.min(edge.confidence + 0.1, 1.0),
            reason: 'resolved-import',
          });
        } else {
          moduleEdges.push(edge);
        }
      }
    }
    return moduleEdges;
  }

  getDB(): ForgeDB { return this.db; }
  close(): void { this.db.close(); }
}
