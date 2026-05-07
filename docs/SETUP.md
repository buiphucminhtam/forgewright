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
  ✓ ForgeNexus Launcher: ✓
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
    },
    "forgenexus": {
      "command": "bash",
      "args": ["/path/to/forgewright/scripts/forgenexus-mcp-launcher.sh"]
    }
  }
}
```

2. Restart Cursor

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

2. Add servers:

```json
{
  "mcpServers": {
    "forgewright": {
      "command": "bash",
      "args": ["/absolute/path/to/forgewright/scripts/forgewright-mcp-launcher.sh"]
    },
    "forgenexus": {
      "command": "bash",
      "args": ["/absolute/path/to/forgewright/scripts/forgenexus-mcp-launcher.sh"]
    }
  }
}
```

3. Restart Claude Desktop

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

# ForgeNexus
bash fw-mcp.sh forgenexus         # Setup ForgeNexus only

# Help
bash fw-mcp.sh --help
bash fw-mcp.sh --version
```

### forgenexus-setup.sh

One-command ForgeNexus installer.

```bash
# Install
bash forgenexus-setup.sh

# Check status
bash forgenexus-setup.sh --check

# Force re-install
bash forgenexus-setup.sh --force

# Analyze project
bash forgenexus-setup.sh analyze
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

### ForgeNexus Index Stale

**Symptoms:** Query returns old/outdated results

**Solution:**
```bash
node forgewright/forgenexus/dist/cli/index.js analyze --force
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

### Q: What's the difference between ForgeWright and ForgeNexus MCP?

**A:**
- **ForgeWright** provides project intelligence, skills, and orchestration
- **ForgeNexus** provides code graph, context analysis, and impact detection

Both work together. You typically need both.

### Q: Can I use just ForgeNexus without ForgeWright?

**A:** Yes. Run:
```bash
bash fw-mcp.sh forgenexus
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

### Q: Where is my data stored?

**A:**
- **Manifest**: `.antigravity/mcp-manifest.json`
- **ForgeNexus Index**: `.forgenexus/codebase.db`
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
- [ForgeNexus](../forgenexus/README.md) - Code intelligence documentation
