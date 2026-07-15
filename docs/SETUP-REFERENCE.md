# MCP Setup Technical Reference

> Detailed technical documentation for ForgeWright MCP setup across Cursor, Claude Code, Antigravity, and OpenAI Codex CLI.

## Table of Contents

- [Architecture](#architecture)
- [File Structure](#file-structure)
- [Launcher Scripts](#launcher-scripts)
- [Manifest Format](#manifest-format)
- [IDE Configuration](#ide-configuration)
- [Environment Variables](#environment-variables)
- [Exit Codes](#exit-codes)
- [ShellCheck Compliance](#shellcheck-compliance)

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    AI IDE (Cursor/Claude)               │
└─────────────────────────────────────────────────────────┘
                           │
                           │ MCP Protocol (stdio)
                           ▼
┌─────────────────────────────────────────────────────────┐
│              forgewright-mcp-launcher.sh                │
│                                                         │
│  Detects workspace:                                     │
│  1. FORGEWRIGHT_WORKSPACE env var                       │
│  2. MCP_WORKSPACE_ROOT env var                          │
│  3. Git repository root                                │
│  4. Current working directory                           │
└─────────────────────────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ ForgeWright │ │ ForgeNexus│ │ Antigrav │
        │   MCP      │ │   MCP    │ │  Manifest│
        └──────────┘ └──────────┘ └──────────┘
```

### Multi-Project Support

Each project has isolated configuration:

```
~/.cursor/mcp.json (global)
├── forgewright → forgewright-mcp-launcher.sh
└── forgenexus → forgenexus-mcp-launcher.sh

Project A/.antigravity/mcp-manifest.json
Project B/.antigravity/mcp-manifest.json
Project C/.antigravity/mcp-manifest.json
```

---

## File Structure

### Setup Creates

```
project/
├── .antigravity/
│   └── mcp-manifest.json      # MCP server manifest
├── .forgewright/
│   ├── settings.env            # ForgeWright settings
│   └── mcp-server/            # Generated MCP server
└── .forgenexus/               # Code graph index
    └── codebase.db
```

### Script Location

```
forgewright/
├── scripts/
│   ├── forgewright-mcp-setup.sh                    # Unified MCP manager
│   ├── forgenexus-setup.sh          # ForgeNexus installer
│   ├── forgewright-mcp-launcher.sh   # FW MCP launcher
│   ├── forgenexus-mcp-launcher.sh   # FNX MCP launcher
│   └── templates/
│       ├── mcp.cursor.json          # Cursor config template
│       ├── mcp.claude.json          # Claude config template
│       └── mcp.antigravity.json    # Antigravity template
```

---

## Launcher Scripts

### forgewright-mcp-launcher.sh

Main launcher that routes to ForgeWright MCP server.

**Key Functions:**
1. Detect ForgeWright directory
2. Detect workspace (env/git/cwd)
3. Find/create manifest
4. Execute MCP server

**Environment Variables:**
- `FORGEWRIGHT_WORKSPACE` - Override workspace
- `FORGEWRIGHT_DEBUG=1` - Enable debug output

### forgenexus-mcp-launcher.sh

Launcher for ForgeNexus code intelligence.

**Key Functions:**
1. Detect ForgeNexus installation
2. Detect workspace
3. Verify index exists
4. Execute ForgeNexus CLI

**Environment Variables:**
- `FORGENEXUS_WORKSPACE` - Override workspace
- `FORGENEXUS_DEBUG=1` - Enable debug output

---

## Manifest Format

### Version 2.0

```json
{
  "manifest_version": "2.0",
  "workspace": "/absolute/path/to/project",
  "forgewright_path": "/path/to/forgewright",
  "generated_at": "2026-05-07T10:00:00Z",
  "forgewright_version": "8.3.0",
  "servers": [
    {
      "name": "forgewright",
      "type": "forgewright",
      "enabled": true,
      "description": "ForgeWright project intelligence"
    },
    {
      "name": "forgenexus",
      "type": "forgenexus",
      "enabled": true,
      "description": "Code intelligence graph"
    }
  ]
}
```

### Field Descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `manifest_version` | Yes | Version of manifest format (2.0) |
| `workspace` | Yes | Absolute path to project |
| `forgewright_path` | Yes | Absolute path to ForgeWright |
| `generated_at` | Yes | ISO-8601 timestamp |
| `forgewright_version` | No | ForgeWright version |
| `servers` | Yes | Array of MCP servers |

### Server Entry

```json
{
  "name": "server-name",
  "type": "forgewright|forgenexus|custom",
  "enabled": true,
  "description": "What this server does",
  "config": {}
}
```

---

## IDE Configuration

### Cursor

**Config File:** `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "forgewright": {
      "command": "bash",
      "args": ["/path/to/forgewright/scripts/forgewright-mcp-launcher.sh"]
    },
    "forgenexus": {
      "command": "bash",
      "args": ["/path/to/forgewright/scripts/forgenexus-mcp-launcher.sh"]
    }
  }
}
```

### Claude Desktop

**Config File:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "forgewright": {
      "command": "bash",
      "args": ["/path/to/forgewright/scripts/forgewright-mcp-launcher.sh"]
    },
    "forgenexus": {
      "command": "bash",
      "args": ["/path/to/forgewright/scripts/forgenexus-mcp-launcher.sh"]
    }
  }
}
```

### Antigravity

**Config Location:** `~/.cursor/projects/<hash>/mcps/user-forgewright/`

Antigravity uses the **canonical MCP server** at `~/.forgewright/mcp-server/src/index.ts`. The per-project manifest (`.antigravity/mcp-manifest.json`) provides workspace context only — it does NOT contain a separate server.

#### Canonical Server Rule

```
~/.forgewright/mcp-server/src/index.ts  ← CANONICAL (single source of truth)
│
├── ~/.cursor/mcp.json              → Cursor
├── ~/.claude/settings.json        → Claude Code
└── Antigravity project workspace   → Manifest provides context, server is canonical
```

**Key points:**
- `.antigravity/mcp-manifest.json` stores project metadata (workspace, forgewright path) — NOT server code
- Antigravity launcher `~/.cursor/projects/<hash>/mcps/user-forgewright/launcher.sh` uses the canonical server
- Never point Antigravity to a submodule Forgewright path

#### Setup Command

```bash
bash forgewright/scripts/forgewright-mcp-setup.sh --antigravity
```

#### Verify

```bash
bash forgewright/scripts/forgewright-mcp-setup.sh --check
```

### OpenAI Codex CLI

**Config Location:** `~/.codex/config.toml`

OpenAI Codex CLI uses the **canonical MCP server** at `~/.forgewright/mcp-server/src/index.ts`. Codex uses TOML config format.

#### Canonical Server Rule

```
~/.forgewright/mcp-server/src/index.ts  ← CANONICAL (single source of truth)
│
├── ~/.cursor/mcp.json              → Cursor
├── ~/.claude/settings.json        → Claude Code
└── ~/.codex/config.toml            → OpenAI Codex CLI (TOML)
```

#### Config Format

```toml
[mcp_servers.forgewright]
enabled = true
transport = { type = "stdio" }
command = "~/.forgewright/mcp-server/node_modules/.bin/tsx"
args = ["~/.forgewright/mcp-server/src/index.ts"]
env = { FORGEWRIGHT_WORKSPACE = "$PROJECT_ROOT" }

[mcp_servers.gitnexus]
enabled = true
transport = { type = "stdio" }
command = "gitnexus"
args = ["mcp"]
```

**Note:** Codex CLI only supports **STDIO transport** for local MCP servers. Remote HTTP/SSE servers are not yet supported.

#### Setup Command

```bash
bash forgewright/scripts/forgewright-mcp-setup.sh --codex
```

#### Verify

```bash
bash forgewright/scripts/forgewright-mcp-setup.sh --check
# or native
codex mcp list
```

---

## Environment Variables

### Workspace Detection

| Variable | Priority | Description |
|----------|----------|-------------|
| `FORGEWRIGHT_WORKSPACE` | 1 | ForgeWright workspace override |
| `MCP_WORKSPACE_ROOT` | 2 | MCP standard workspace |
| `CLAUDE_DESKTOP_WORKSPACE` | 3 | Claude Desktop workspace |
| Git root | 4 | Auto-detected from `.git` |
| PWD | 5 | Current directory |

### Debug Options

| Variable | Values | Effect |
|----------|--------|--------|
| `FORGEWRIGHT_DEBUG` | 0, 1 | Enable debug output in launcher |
| `FORGENEXUS_DEBUG` | 0, 1 | Enable ForgeNexus debug |
| `FW_MCP_VERBOSE` | 0, 1 | Verbose output for forgewright-mcp-setup.sh |
| `FNX_VERBOSE` | 0, 1 | Verbose output for forgenexus-setup.sh |

---

## Exit Codes

### forgewright-mcp-setup.sh

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Prerequisites missing |

### forgenexus-setup.sh

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Installation failed |
| 2 | Invalid arguments |
| 3 | Prerequisites missing |

---

## ShellCheck Compliance

All scripts comply with ShellCheck standards:

### Shebang
```bash
#!/usr/bin/env bash  # Not #!/bin/bash
```

### Error Handling
```bash
set -euo pipefail  # Strict error handling
```

### Variable Quoting
```bash
# Always quote
echo "$variable"
[[ -f "$file" ]]

# Use ${var:-default} for defaults
path="${FORGEWRIGHT_DIR:-/default}"
```

### Path Handling
```bash
# Use absolute paths
resolved="$(cd "$(dirname "$script")" && pwd -P)"

# Quote all expansions
command -v "$cmd" &> /dev/null
```

### No Bash-isms
```bash
# Avoid (breaks on sh):
[[ ]]           # Use [ ]
${var//a/b}    # Use external tools
arrays          # Use positional params

# Use instead:
[ "$a" = "$b" ]
echo "$var" | sed 's/a/b/'
set -- "item1" "item2"
```

---

## Testing

### Test Scripts

```bash
# Test help
bash forgewright-mcp-setup.sh --help

# Test check
bash forgewright-mcp-setup.sh --check

# Test diagnose
bash forgewright-mcp-setup.sh --diagnose

# Test wizard (non-interactive)
echo "" | bash forgewright-mcp-setup.sh wizard
```

### ShellCheck

```bash
# Check scripts
shellcheck scripts/forgewright-mcp-setup.sh
shellcheck scripts/forgenexus-setup.sh
shellcheck scripts/forgewright-mcp-launcher.sh
shellcheck scripts/forgenexus-mcp-launcher.sh
```

### Integration Test

```bash
# Create test project
mkdir /tmp/fw-test
cd /tmp/fw-test
git init

# Run setup
bash /path/to/forgewright/scripts/forgewright-mcp-setup.sh setup

# Verify
bash /path/to/forgewright/scripts/forgewright-mcp-setup.sh --check

# Clean up
cd /
rm -rf /tmp/fw-test
```

---

## Troubleshooting Reference

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `command not found: node` | Node.js not installed | Install from nodejs.org |
| `launcher not found` | Wrong path | Re-run setup |
| `workspace mismatch` | Manifest stale | `forgewright-mcp-setup.sh setup --force` |
| `npm install failed` | Network/proxy | Check npm config |

### Debug Commands

```bash
# Verbose output
FW_MCP_VERBOSE=1 bash forgewright-mcp-setup.sh --diagnose

# Debug launcher
FORGEWRIGHT_DEBUG=1 bash scripts/forgewright-mcp-launcher.sh

# Debug ForgeNexus
FORGENEXUS_DEBUG=1 bash scripts/forgenexus-mcp-launcher.sh
```

---

## See Also

- [Setup Guide](SETUP.md) - User documentation
- [Quick Start](SETUP-QUICK.md) - Fast setup
- [ForgeNexus](../forgenexus/README.md) - Code intelligence docs
