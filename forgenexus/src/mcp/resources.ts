/**
 * ForgeNexus MCP Resources
 *
 * Provides structured on-demand data to AI agents.
 * Includes static resources, dynamic templates, staleness checks,
 * and a setup resource (forgenexus://setup) for dynamic onboarding.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ForgeDB } from "../data/db.js";
import { checkStaleness } from "./tools.js";

export function registerResources(server: Server, db: ForgeDB, cwd: string): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: "forgenexus://repos", name: "All Indexed Repositories", mimeType: "text/yaml" },
      { uri: "forgenexus://schema", name: "Graph Schema", mimeType: "text/yaml" },
      { uri: "forgenexus://setup", name: "ForgeNexus Setup Content", mimeType: "text/markdown" },
    ],
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      { uriTemplate: "forgenexus://repo/{name}/context", name: "Repo Overview", mimeType: "text/yaml" },
      { uriTemplate: "forgenexus://repo/{name}/clusters", name: "Repo Modules", mimeType: "text/yaml" },
      { uriTemplate: "forgenexus://repo/{name}/processes", name: "Repo Processes", mimeType: "text/yaml" },
      { uriTemplate: "forgenexus://repo/{name}/schema", name: "Graph Schema", mimeType: "text/yaml" },
      { uriTemplate: "forgenexus://repo/{name}/cluster/{clusterName}", name: "Module Detail", mimeType: "text/yaml" },
      { uriTemplate: "forgenexus://repo/{name}/process/{processName}", name: "Process Trace", mimeType: "text/yaml" },
      { uriTemplate: "forgenexus://repo/{name}/stats", name: "Detailed Stats", mimeType: "text/yaml" },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    try {
      const text = await readResource(uri, db, cwd);
      return { contents: [{ uri, mimeType: "text/yaml", text }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { contents: [{ uri, mimeType: "text/plain", text: `Error: ${msg}` }] };
    }
  });
}

// ─── Resource Reader ────────────────────────────────────────────────────────

async function readResource(uri: string, db: ForgeDB, cwd: string): Promise<string> {
  // ── Static: schema ─────────────────────────────────────────────────────
  if (uri === "forgenexus://schema") {
    return [
      "# ForgeNexus Graph Schema",
      "",
      "## Node Types",
      "- File, Folder, Function, Class, Interface, Method, Property, Variable,",
      "  Struct, Enum, Trait, Impl, TypeAlias, Module",
      "",
      "## Edge Types (17 types — single edges table with type property)",
      "- CONTAINS, DEFINES, CALLS, IMPORTS, EXTENDS, IMPLEMENTS",
      "- HAS_METHOD, HAS_PROPERTY, ACCESSES, OVERRIDES",
      "- MEMBER_OF, STEP_IN_PROCESS, HANDLES_ROUTE, FETCHES",
      "- HANDLES_TOOL, ENTRY_POINT_OF, QUERIES",
      "",
      "## Community Detection",
      "- Leiden-inspired greedy modularity optimization",
      "- Communities stored in 'communities' table",
      "",
      "## Process Tracing",
      "- Entry point detection: HTTP routes, CLI commands, main functions",
      "- BFS call-chain traversal to find process steps",
      "- Processes stored in 'processes' table",
      "",
      "## Example Cypher Queries",
      "MATCH (a)-[:CALLS]->(b:Function {name: 'validateUser'})",
      "  RETURN a.name, a.filePath",
      "MATCH (f)-[:MEMBER_OF]->(c)",
      "  WHERE c.name = 'auth'",
      "  RETURN f.name",
      "MATCH (c:Class)-[:EXTENDS|:IMPLEMENTS]->(p)",
      "  RETURN c.name, p.name",
    ].join("\n");
  }

  // ── Static: setup (onboarding) ─────────────────────────────────────────
  if (uri === "forgenexus://setup") {
    return [
      "# ForgeNexus MCP",
      "",
      "This project is indexed by ForgeNexus. Use the ForgeNexus MCP tools to",
      "understand code, assess impact, and navigate safely.",
      "",
      "## Tools",
      "",
      "| Tool | What it gives you |",
      "|------|-------------------|",
      "| `query` | Process-grouped code intelligence — execution flows related to a concept |",
      "| `context` | 360-degree symbol view — categorized refs, processes it participates in |",
      "| `impact` | Symbol blast radius — what breaks at depth 1/2/3 with confidence |",
      "| `detect_changes` | Git-diff impact — what do your current changes affect |",
      "| `pr_review` | PR blast radius — breaking changes, risk, recommended reviewers |",
      "| `rename` | Multi-file coordinated rename with confidence-tagged edits |",
      "| `cypher` | Raw graph queries |",
      "| `route_map` | API route → handler mappings |",
      "| `tool_map` | MCP/RPC tool definitions |",
      "| `shape_check` | API response shape mismatches |",
      "| `api_impact` | Pre-change route impact report |",
      "| `list_repos` | Discover indexed repos |",
      "",
      "## Rules",
      "",
      "- **MUST run impact analysis before editing any symbol.**",
      "- **MUST run `forgenexus_detect_changes()` before committing.**",
      "- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk.",
      "",
      "## Resources",
      "",
      "- `forgenexus://repo/{name}/context` — Stats, staleness check",
      "- `forgenexus://repo/{name}/clusters` — All functional areas",
      "- `forgenexus://repo/{name}/processes` — All execution flows",
      "- `forgenexus://repo/{name}/schema` — Graph schema for Cypher",
      "",
      "## Keeping the Index Fresh",
      "",
      "After committing code changes, run:",
      "```bash",
      "npx forgenexus analyze",
      "```",
    ].join("\n");
  }

  // ── Repos list ──────────────────────────────────────────────────────────
  if (uri === "forgenexus://repos") {
    const repos = db.listRepos();
    if (repos.length === 0) {
      return "repos: []\n# No repositories indexed. Run: forgenexus analyze";
    }
    const lines = ["repos:"];
    for (const repo of repos) {
      lines.push(`  - name: "${repo.name}"`);
      lines.push(`    path: "${repo.path}"`);
      lines.push(`    indexed: "${repo.indexedAt}"`);
      lines.push(`    symbols: ${repo.stats.nodes ?? 0}`);
      lines.push(`    edges: ${repo.stats.edges ?? 0}`);
      lines.push(`    processes: ${repo.stats.processes ?? 0}`);
    }
    if (repos.length > 1) {
      lines.push("");
      lines.push("# Multiple repos indexed. Use repo parameter in tool calls:");
      lines.push(`# forgenexus_query({query: "auth", repo: "${repos[0].name}"})`);
    }
    return lines.join("\n");
  }

  // ── Dynamic: repo-scoped resources ──────────────────────────────────────
  const parts = uri.replace("forgenexus://", "").split("/");

  // context — overview with staleness check
  if (parts[0] === "repo" && parts[2] === "context") {
    const stats = db.getDetailedStats();
    const meta = {
      indexedAt: db.getMeta("indexed_at"),
      lastCommit: db.getMeta("last_commit"),
      repoName: db.getMeta("repo_name"),
    };
    const staleness = meta.lastCommit ? checkStaleness(cwd, meta.lastCommit) : { isStale: false, commitsBehind: 0 };
    const lines: string[] = [
      `# ${meta.repoName ?? cwd.split("/").pop() ?? "Repo"}`,
      "",
    ];
    if (staleness.isStale && staleness.hint) {
      lines.push(staleness.hint);
      lines.push("");
    }
    lines.push("stats:");
    lines.push(`  files: ${stats.files}`);
    lines.push(`  symbols: ${stats.nodes}`);
    lines.push(`  processes: ${stats.processes}`);
    if (stats.hasEmbeddings) lines.push("  embeddings: enabled");
    lines.push("");
    lines.push("nodes_by_type:");
    for (const [t, c] of Object.entries(stats.byType ?? {})) {
      lines.push(`  ${t}: ${c}`);
    }
    lines.push("");
    lines.push("edges_by_type:");
    for (const [t, c] of Object.entries(stats.byEdgeType ?? {})) {
      lines.push(`  ${t}: ${c}`);
    }
    lines.push("");
    lines.push("tools_available:");
    lines.push("  - query: Process-grouped code intelligence");
    lines.push("  - context: 360-degree symbol view (categorized refs, process participation)");
    lines.push("  - impact: Blast radius analysis (what breaks if you change a symbol)");
    lines.push("  - detect_changes: Git-diff impact analysis (what do your changes affect)");
    lines.push("  - pr_review: PR blast radius analysis (breaking changes, reviewers)");
    lines.push("  - rename: Multi-file coordinated rename with confidence tags");
    lines.push("  - cypher: Raw graph queries");
    lines.push("  - list_repos: Discover all indexed repositories");
    lines.push("  - route_map: API route → handler mappings");
    lines.push("  - shape_check: API response shape mismatches");
    lines.push("  - api_impact: Pre-change route impact report");
    lines.push("");
    lines.push("resources_available:");
    lines.push("  - forgenexus://repos: All indexed repositories");
    lines.push("  - forgenexus://schema: Graph schema for Cypher queries");
    lines.push(`  - forgenexus://repo/{name}/clusters: All functional areas`);
    lines.push(`  - forgenexus://repo/{name}/processes: All execution flows`);
    lines.push(`  - forgenexus://repo/{name}/cluster/{name}: Module detail`);
    lines.push(`  - forgenexus://repo/{name}/process/{name}: Process trace`);
    lines.push("");
    lines.push("re_index: Run `forgenexus analyze` if data is stale");
    return lines.join("\n");
  }

  // stats — detailed metrics
  if (parts[0] === "repo" && parts[2] === "stats") {
    const stats = db.getDetailedStats();
    const meta = {
      indexedAt: db.getMeta("indexed_at"),
      lastCommit: db.getMeta("last_commit"),
      repoName: db.getMeta("repo_name"),
    };
    const staleness = meta.lastCommit ? checkStaleness(cwd, meta.lastCommit) : { isStale: false, commitsBehind: 0 };

    const lines: string[] = [
      "# Detailed Repository Statistics",
      "",
      "meta:",
      `  indexed_at: ${meta.indexedAt ?? "unknown"}`,
      `  last_commit: ${meta.lastCommit ?? "none"}`,
      `  repo_name: ${meta.repoName ?? "unknown"}`,
      `  commits_behind: ${staleness.commitsBehind}`,
    ];
    if (staleness.isStale && staleness.hint) {
      lines.push(`  staleness: "${staleness.hint}"`);
    }
    lines.push("");
    lines.push("summary:");
    lines.push(`  files: ${stats.files}`);
    lines.push(`  symbols: ${stats.nodes}`);
    lines.push(`  edges: ${stats.edges}`);
    lines.push(`  communities: ${stats.communities}`);
    lines.push(`  processes: ${stats.processes}`);
    lines.push(`  has_embeddings: ${stats.hasEmbeddings}`);
    lines.push("");
    lines.push("nodes_by_type:");
    for (const [t, c] of Object.entries(stats.byType ?? {})) {
      lines.push(`  ${t}: ${c}`);
    }
    lines.push("");
    lines.push("edges_by_type:");
    for (const [t, c] of Object.entries(stats.byEdgeType ?? {})) {
      lines.push(`  ${t}: ${c}`);
    }
    return lines.join("\n");
  }

  // clusters — functional areas
  if (parts[0] === "repo" && parts[2] === "clusters") {
    const comms = db.getAllCommunities();
    const lines: string[] = ["modules:"];
    for (const c of comms.slice(0, 20)) {
      lines.push(`  - name: "${c.name}"`);
      lines.push(`    symbols: ${c.symbolCount}`);
      lines.push(`    cohesion: ${(c.cohesion * 100).toFixed(0)}%`);
      if (c.keywords?.length > 0) lines.push(`    keywords: [${c.keywords.slice(0, 5).join(", ")}]`);
      if (c.description) lines.push(`    description: "${c.description}"`);
    }
    if (comms.length > 20) {
      lines.push(`# ... and ${comms.length - 20} more modules.`);
    }
    return lines.join("\n");
  }

  // processes — execution flows
  if (parts[0] === "repo" && parts[2] === "processes") {
    const procs = db.getAllProcesses();
    const lines: string[] = ["processes:"];
    for (const p of procs.slice(0, 20)) {
      lines.push(`  - name: "${p.name}"`);
      lines.push(`    type: ${p.type}`);
      lines.push(`    steps: ${p.steps?.length ?? 0}`);
      if (p.communities?.length > 0) lines.push(`    communities: [${p.communities.slice(0, 3).join(", ")}]`);
    }
    if (procs.length > 20) {
      lines.push(`# ... and ${procs.length - 20} more processes.`);
    }
    return lines.join("\n");
  }

  // cluster detail
  if (parts[0] === "repo" && parts[2] === "cluster" && parts[3]) {
    const clusterName = parts[3];
    const community =
      db.getCommunity(`comm_${clusterName}`) ??
      db.getAllCommunities().find(c => c.name === clusterName || c.id.includes(clusterName));

    if (!community) return `# Unknown community: ${clusterName}`;
    const nodes = db.getNodesByCommunity(community.id);
    const lines: string[] = [
      `# ${community.name}`,
      `symbols: ${community.symbolCount}`,
      `cohesion: ${community.cohesion}`,
    ];
    if (community.keywords?.length > 0) lines.push(`keywords: [${community.keywords.join(", ")}]`);
    if (community.description) lines.push(`description: "${community.description}"`);
    lines.push("");
    lines.push("members:");
    for (const n of nodes.slice(0, 50)) {
      lines.push(`  - [${n.type}] ${n.name} — ${n.filePath}:${n.line}`);
    }
    if (nodes.length > 50) lines.push(`# ... and ${nodes.length - 50} more`);
    return lines.join("\n");
  }

  // process detail
  if (parts[0] === "repo" && parts[2] === "process" && parts[3]) {
    const processName = parts[3];
    const process =
      db.getProcess(`proc_${processName}`) ??
      db.getAllProcesses().find(p => p.name.includes(processName) || p.id.includes(processName));

    if (!process) return `# Unknown process: ${processName}`;
    const steps = (db as any).db?.prepare?.(
      "SELECT uid, name, file_path, line, type FROM nodes WHERE process_name = ? ORDER BY line"
    )?.all(process.id) ?? [];

    const lines: string[] = [
      `# ${process.name}`,
      `type: ${process.type}`,
      `entry_point: ${process.entryPointUid}`,
      `communities: [${process.communities.join(", ")}]`,
      "",
      "trace:",
    ];
    for (const s of steps as any[]) {
      lines.push(`  - [${s.type}] ${s.name} — ${s.file_path}:${s.line}`);
    }
    if (steps.length === 0) lines.push("  # No step data available");
    return lines.join("\n");
  }

  // schema for specific repo
  if (parts[0] === "repo" && parts[2] === "schema") {
    return [
      "# ForgeNexus Graph Schema",
      "",
      "## Node Types",
      "- File, Folder, Function, Class, Interface, Method, Property, Variable,",
      "  Struct, Enum, Trait, Impl, TypeAlias, Module",
      "",
      "## Edge Types (17 types — single edges table)",
      "- CONTAINS, DEFINES, CALLS, IMPORTS, EXTENDS, IMPLEMENTS",
      "- HAS_METHOD, HAS_PROPERTY, ACCESSES, OVERRIDES",
      "- MEMBER_OF, STEP_IN_PROCESS, HANDLES_ROUTE, FETCHES",
      "- HANDLES_TOOL, ENTRY_POINT_OF, QUERIES",
      "",
      "## Example Cypher Queries",
      "MATCH (a)-[:CALLS]->(b:Function {name: 'validateUser'})",
      "  RETURN a.name, a.filePath",
      "MATCH (c:Class)-[:EXTENDS|:IMPLEMENTS]->(p)",
      "  RETURN c.name, p.name",
    ].join("\n");
  }

  return `# Unknown resource: ${uri}`;
}
