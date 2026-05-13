# ForgeWright MCP Setup Guide

> Complete guide to setting up ForgeWright MCP (Model Context Protocol) for your AI IDE.

## Table of Contents

- [Quick Start (5 minutes)](#quick-start-5-minutes)
- [Prerequisites](#prerequisites)
- [IDE-Specific Setup](#ide-specific-setup)
  - [Cursor](#cursor)
  - [Claude Desktop](#claude-desktop)
  - [Antigravity](#antigravity)
- [Commands Reference](#commands-reference)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Quick Start (5 minutes)

### One-Command Setup

```bash
# Navigate to your project
cd /path/to/your/project

# Run the setup wizard
bash forgewright/scripts/fw-mcp.sh wizard

# Or use quick setup (all defaults)
bash forgewright/scripts/fw-mcp.sh setup
```

### Verify Installation

```bash
bash forgewright/scripts/fw-mcp.sh check
```

Expected output:
```
━━━ MCP Status ━━━
  ➜ Project: /path/to/project
  ✓ Manifest: ✓
  ✓ ForgeWright Launcher: ✓
  ✓ GitNexus: ✓ (16K nodes indexed)
```

---

## Prerequisites

| Tool | Required | Version | Install |
|------|----------|---------|---------|
| Node.js | Yes | 18+ | [nodejs.org](https://nodejs.org) |
| npm | Yes | 8+ | Comes with Node.js |
| git | Recommended | Any | `brew install git` |

### Verify Prerequisites

```bash
node --version    # Should show v18+
npm --version     # Should show 8+
git --version     # Should show 2.x+
```

---

## IDE-Specific Setup

### Cursor

#### Option 1: Automated Setup (Recommended)

```bash
# From your project directory
cd /path/to/project
bash forgewright/scripts/fw-mcp.sh setup
```

This automatically:
1. Creates `.antigravity/mcp-manifest.json`
2. Updates `~/.cursor/mcp.json`

#### Option 2: Manual Setup

1. Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "forgewright": {
      "command": "bash",
      "args": ["/path/to/forgewright/scripts/forgewright-mcp-launcher.sh"]
    }
  }
}
```

**Note:** GitNexus MCP is configured separately via `gitnexus setup`.

2. Setup GitNexus separately:

```bash
npm install -g gitnexus
gitnexus setup
```

3. Restart Cursor

#### Verify Cursor Setup

```bash
bash forgewright/scripts/fw-mcp.sh check
```

Look for:
```
  ➜ IDE: cursor
  ✓ Config: ✓
  ✓ ForgeWright: configured
```

---

### Claude Desktop

#### Option 1: Automated Setup (Recommended)

```bash
cd /path/to/project
bash forgewright/scripts/fw-mcp.sh setup
```

#### Option 2: Manual Setup

1. Find your config file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add forgewright server:

```json
{
  "mcpServers": {
    "forgewright": {
      "command": "bash",
      "args": ["/absolute/path/to/forgewright/scripts/forgewright-mcp-launcher.sh"]
    }
  }
}
```

3. Setup GitNexus separately:

```bash
npm install -g gitnexus
gitnexus setup
```

4. Restart Claude Desktop

#### Verify Claude Setup

```bash
bash forgewright/scripts/fw-mcp.sh check
```

---

### Antigravity

Antigravity has native ForgeWright support. Setup is automatic.

#### Automated Setup

```bash
cd /path/to/project
bash forgewright/scripts/fw-mcp.sh setup
```

This creates `.antigravity/mcp-manifest.json` which Antigravity reads automatically.

#### How It Works

```
Antigravity reads .antigravity/mcp-manifest.json
                    ↓
        Lists available MCP servers
                    ↓
        Starts forgewright-mcp-launcher.sh
                    ↓
        Launcher detects current workspace
                    ↓
        MCP server starts with correct context
```

#### Manual Config

If needed, add to your Antigravity config:

```json
{
  "mcpServers": {
    "forgewright-workspace": {
      "command": "bash",
      "args": ["/path/to/forgewright/scripts/forgewright-mcp-launcher.sh"],
      "env": {
        "FORGEWRIGHT_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

---

## Multi-IDE Setup (Cursor + Claude + Antigravity)

If you use multiple AI IDEs with the same project, here's how it works:

### Architecture Overview

```
Project/
├── .antigravity/mcp-manifest.json    # Antigravity reads this
├── .forgewright/                    # Shared ForgeWright state
└── .gitnexus/                       # GitNexus code graph (index)

~/.cursor/mcp.json                   # Cursor MCP config
~/Library/.../claude_desktop_config.json  # Claude Desktop MCP config
~/.gitnexus/                         # GitNexus registry
```

### Setup Steps

#### Step 1: Run Setup Once

```bash
cd /path/to/project
bash forgewright/scripts/fw-mcp.sh setup
```

This creates the shared files:
- `.antigravity/mcp-manifest.json`
- `.forgewright/fw-mcp-launcher.sh`
- `.gitnexus/` (GitNexus code graph index)

#### Step 2: Restart All IDEs

```
1. Quit Cursor completely (Cmd+Q)
2. Quit Claude Desktop completely
3. Restart Antigravity (if running)
```

#### Step 3: Verify All IDEs

Each IDE will automatically detect the workspace and load the correct context.

### How Each IDE Loads MCP

| IDE | Config Location | Auto-Detection |
|-----|---------------|-----------------|
| **Cursor** | `~/.cursor/mcp.json` | Updated by `fw-mcp.sh` |
| **Claude Desktop** | `~/.config/Claude/...` | Updated by `fw-mcp.sh` |
| **Antigravity** | `.antigravity/` | Reads manifest automatically |

### Workspace Detection Per IDE

```
┌─────────────────────────────────────────────────────────────┐
│ Cursor                                                      │
│   ↓ ~/.cursor/mcp.json → forgewright-mcp-launcher.sh      │
│   ↓ Workspace: git rev-parse --show-toplevel               │
│   ↓ Project context loaded                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Claude Desktop                                              │
│   ↓ ~/.config/Claude/... → forgewright-mcp-launcher.sh    │
│   ↓ Workspace: git rev-parse --show-toplevel               │
│   ↓ Project context loaded                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Antigravity                                                 │
│   ↓ Reads .antigravity/mcp-manifest.json                   │
│   ↓ Sets FORGEWRIGHT_WORKSPACE env var                     │
│   ↓ forgewright-mcp-launcher.sh uses this env var          │
│   ↓ Project context loaded                                 │
└─────────────────────────────────────────────────────────────┘
```

### Benefits of Shared Setup

| Feature | Benefit |
|---------|---------|
| **Shared code graph** | `.gitnexus/` index works across all IDEs |
| **Shared manifest** | Antigravity auto-detects project |
| **Same launchers** | No duplicate configs to maintain |
| **Consistent context** | All IDEs see same project state |

### Switching Between IDEs

When you switch from one IDE to another:

1. **Workspace is preserved**: All IDEs use the same git root detection
2. **Code index is shared**: No need to re-index
3. **Context is consistent**: Same project files, same skills

### Testing Multi-IDE Setup

```bash
# Check which IDEs are configured
bash forgewright/scripts/fw-mcp.sh check

# Run diagnostics for detailed view
bash forgewright/scripts/fw-mcp.sh diagnose
```

---

## Commands Reference

### fw-mcp.sh

Unified MCP manager for ForgeWright.

```bash
# Setup
bash fw-mcp.sh setup              # Full setup
bash fw-mcp.sh setup --force       # Force re-setup

# Status
bash fw-mcp.sh check               # Check installation
bash fw-mcp.sh diagnose            # Detailed diagnostics

# Management
bash fw-mcp.sh uninstall           # Remove MCP
bash fw-mcp.sh wizard             # Interactive wizard

# GitNexus
bash fw-mcp.sh gitnexus            # Setup GitNexus (recommended)

# Help
bash fw-mcp.sh --help
bash fw-mcp.sh --version
```

### GitNexus CLI

```bash
# Install
npm install -g gitnexus

# Setup for all editors
gitnexus setup

# Analyze project
gitnexus analyze

# Check status
gitnexus status

# Clean index
gitnexus clean

# List indexed repos
gitnexus list
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FORGEWRIGHT_WORKSPACE` | Override workspace detection | Auto-detected |
| `MCP_WORKSPACE_ROOT` | MCP standard workspace | Auto-detected |
| `FW_MCP_VERBOSE` | Enable debug output | 0 |
| `FW_MCP_FORCE` | Force operations | 0 |

### Debug Mode

```bash
# Enable verbose output
FW_MCP_VERBOSE=1 bash fw-mcp.sh diagnose

# Or use --verbose flag
bash fw-mcp.sh diagnose --verbose
```

---

## Troubleshooting

### MCP Server Not Starting

**Symptoms:** Tools not appearing in IDE

**Solutions:**

1. Check status:
   ```bash
   bash fw-mcp.sh check
   ```

2. Run diagnostics:
   ```bash
   bash fw-mcp.sh diagnose
   ```

3. Restart IDE

4. Check logs in IDE console

### Workspace Detection Issues

**Symptoms:** Wrong project context

**Solutions:**

1. Set workspace explicitly:
   ```bash
   export FORGEWRIGHT_WORKSPACE=/path/to/project
   bash fw-mcp.sh check
   ```

2. Run from project directory:
   ```bash
   cd /path/to/project
   bash fw-mcp.sh check
   ```

### GitNexus Index Stale

**Symptoms:** Query returns old/outdated results

**Solution:**
```bash
# Re-analyze with GitNexus
gitnexus analyze --force
```

### Launcher Script Not Found

**Symptoms:** `launcher.sh not found` error

**Solution:** Re-run setup:
```bash
bash fw-mcp.sh setup --force
```

### npm Install Failures

**Symptoms:** Dependencies not installing

**Solutions:**

1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

2. Use offline mode:
   ```bash
   npm install --prefer-offline
   ```

3. Check npm version:
   ```bash
   npm --version  # Should be 8+
   ```

---

## FAQ

### Q: What's the difference between ForgeWright and GitNexus?

**A:**
- **ForgeWright** provides project intelligence, skills, and orchestration
- **GitNexus** provides code graph, context analysis, and impact detection

Both work together. You typically need both.

### Q: Can I use just GitNexus without ForgeWright?

**A:** Yes. Run:
```bash
npm install -g gitnexus
gitnexus setup
```

### Q: How do I update ForgeWright MCP?

**A:**
```bash
cd forgewright
git pull origin main
bash scripts/fw-mcp.sh setup --force
```

### Q: Multiple projects - do I need separate configs?

**A:** No! With Antigravity, one config works for all projects. With Cursor/Claude, launchers auto-detect workspace from git root.

### Q: What if I use VS Code?

**A:** VS Code has MCP support but it's preview. For now, use Cursor or Claude Desktop for best experience.

### Q: How do I uninstall MCP?

**A:**
```bash
bash fw-mcp.sh uninstall
```

### Q: Can I use ForgeWright with multiple IDEs simultaneously?

**A:** Yes! Setup once, use everywhere:

```bash
# Setup once
bash forgewright/scripts/fw-mcp.sh setup

# Restart all IDEs (Cursor + Claude Desktop + Antigravity)
# They all share the same:
#   - .antigravity/mcp-manifest.json
#   - .forgewright/ (state)
#   - .gitnexus/ (code graph)
```

See [Multi-IDE Setup](#multi-ide-setup-cursor--claude--antigravity) section above for details.

### Q: Where is my data stored?

**A:**
- **Manifest**: `.antigravity/mcp-manifest.json`
- **GitNexus Index**: `.gitnexus/` (in project directory)
- **GitNexus Registry**: `~/.gitnexus/registry.json`
- **Settings**: `.forgewright/settings.env`

All are in your project directory and can be committed to git.

---

## Support

- **GitHub Issues**: [Report bugs](https://github.com/buiphucminhtam/forgewright/issues)
- **Documentation**: [docs/SETUP-REFERENCE.md](SETUP-REFERENCE.md)

---

## See Also

- [Quick Start Guide](SETUP-QUICK.md) - Fast 1-minute setup
- [Technical Reference](SETUP-REFERENCE.md) - Detailed technical docs
- [GitNexus Setup](SETUP-GITNEXUS.md) - Code intelligence setup guide
