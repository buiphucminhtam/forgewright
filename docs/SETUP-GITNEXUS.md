# GitNexus Setup Guide

> **GitNexus** is the recommended code intelligence tool for ForgeWright projects. It provides 38K+ stars, npm installation, auto-setup for all editors, and 16 MCP tools for deep code understanding.

## Why GitNexus?

| Feature | GitNexus | ForgeNexus (Legacy) |
|---------|----------|---------------------|
| Installation | `npm install -g gitnexus` | Manual submodule setup |
| Setup | `gitnexus setup` (auto-detects editors) | Manual config per editor |
| Editors | Claude, Cursor, Codex, Windsurf, OpenCode | Claude Desktop, Cursor (basic) |
| Community | 38K+ stars, active Discord | Internal only |
| License | PolyForm Noncommercial | MIT |
| Multi-repo | Yes (`gitnexus group`) | No |

## Installation

### 1. Install GitNexus

```bash
npm install -g gitnexus
```

Verify installation:

```bash
gitnexus --version
# Should output: 1.6.x
```

### 2. Setup for All Editors

```bash
gitnexus setup
```

This auto-configures MCP for:
- Claude Code
- Cursor
- OpenCode
- Codex

### 3. Index Your Project

```bash
cd /path/to/your/project
gitnexus analyze
```

First-time indexing may take 30-60 seconds depending on project size.

## Editor Configuration

### Claude Code

GitNexus auto-configures Claude Code with:
- MCP server connection
- 7 skills (exploring, debugging, impact analysis, refactoring, CLI)
- PreToolUse hooks (auto-enrich searches with graph context)
- PostToolUse hooks (detect stale index after commits)

Manual setup (if needed):

```bash
claude mcp add gitnexus -- npx -y gitnexus@latest mcp
```

### Cursor

Auto-configured via `gitnexus setup`. Creates `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
```

### Manual Config

If auto-setup fails, manually add to your editor's MCP config:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
```

## CLI Commands

```bash
# Analyze/re-index repository
gitnexus analyze [path]

# Force full re-index
gitnexus analyze --force

# Skip embedding generation (faster)
gitnexus analyze --skip-embeddings

# Generate repo-specific skills
gitnexus analyze --skills

# Check index status
gitnexus status

# List all indexed repositories
gitnexus list

# Clean index for current repo
gitnexus clean

# Clean all indexes
gitnexus clean --all --force

# Generate repository wiki
gitnexus wiki [path]

# Multi-repo groups
gitnexus group create <name>
gitnexus group add <group> <path> <registryName>
gitnexus group sync <name>
```

## MCP Tools

GitNexus provides 16 MCP tools:

| Tool | Purpose |
|------|---------|
| `list_repos` | Discover all indexed repositories |
| `query` | Process-grouped hybrid search (BM25 + semantic + RRF) |
| `context` | 360-degree symbol view — callers, callees, process participation |
| `impact` | Blast radius analysis with depth grouping and confidence |
| `detect_changes` | Git-diff impact — maps changed lines to affected processes |
| `rename` | Multi-file coordinated rename with graph + text search |
| `cypher` | Raw Cypher graph queries |
| `group_list` | List configured repository groups |
| `group_sync` | Extract contracts and match across repos |
| `group_contracts` | Inspect extracted contracts and cross-links |
| `group_query` | Search execution flows across all repos in a group |
| `group_status` | Check staleness of repos in a group |

## MCP Resources

| Resource | Purpose |
|----------|---------|
| `gitnexus://repos` | List all indexed repositories |
| `gitnexus://repo/{name}/context` | Codebase overview, staleness check |
| `gitnexus://repo/{name}/clusters` | All functional clusters with cohesion scores |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{name}` | Full process trace with steps |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher queries |

## ForgeWright Integration

ForgeWright uses GitNexus for:

### Impact Analysis (MANDATORY)

Before editing any symbol:

```
gitnexus_impact({target: "symbolName", direction: "upstream"})
```

Report the blast radius to the user.

### Pre-Commit Check (MANDATORY)

Before committing:

```
gitnexus_detect_changes({scope: "staged"})
```

Verify changes only affect expected scope.

### Code Exploration

Instead of grepping:

```
gitnexus_query({query: "auth validation"})
```

Returns process-grouped results ranked by relevance.

### Symbol Context

```
gitnexus_context({name: "validateUser"})
```

Shows all callers, callees, and process participation.

## Keeping Index Fresh

After code changes, re-index:

```bash
gitnexus analyze
```

The index becomes stale after:
- File additions/deletions
- Symbol renames
- Import changes
- Large refactors

## Troubleshooting

### "Index stale" warnings

Run:

```bash
gitnexus analyze --force
```

### MCP connection issues

1. Restart your IDE
2. Check MCP config:

```bash
cat ~/.cursor/mcp.json  # Cursor
cat ~/Library/Application Support/Claude/claude_desktop_config.json  # Claude
```

3. Re-setup:

```bash
gitnexus clean
gitnexus analyze
```

### Performance issues

For large repos, skip embeddings:

```bash
gitnexus analyze --skip-embeddings
```

## Migration from ForgeNexus

If you were using ForgeNexus:

```bash
# 1. Install GitNexus
npm install -g gitnexus

# 2. Setup
gitnexus setup

# 3. Analyze projects
gitnexus analyze

# 4. Update AGENTS.md/CLAUDE.md references
# Change forgenexus_* to gitnexus_*
```

ForgeNexus can be safely removed after migration:

```bash
rm -rf /path/to/forgewright/forgenexus
```

## License

GitNexus uses **PolyForm Noncommercial** license. Free for non-commercial use. For commercial use, see [akonlabs.com](https://akonlabs.com).
