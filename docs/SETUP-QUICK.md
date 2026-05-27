# Quick Start Guide

> 5 minutes to MCP setup. Zero configuration.

---

## TL;DR

```bash
# 1. Go to your project
cd /path/to/project

# 2. Run setup (one command — sets up Cursor + Claude + Antigravity + Codex CLI)
bash forgewright/scripts/forgewright-mcp-setup.sh

# 3. Restart your IDE (all platforms)
# Done!
```

---

## Step by Step

### 1. Navigate to Your Project

```bash
cd ~/Projects/my-app
```

### 2. Run the Setup

```bash
bash forgewright/scripts/forgewright-mcp-setup.sh
```

Expected output:
```
⚡ Forgewright Universal MCP Setup

  Forgewright: /path/to/forgewright
  Project:     /path/to/project
  Platforms:   Cursor + Claude Code + Antigravity

  ➜ Generating MCP server...
  ✓ MCP server generated
  ➜ Syncing MCP server to canonical location...
  ✓ Canonical MCP server synced → ~/.forgewright/mcp-server/
  ➜ Setting up Cursor MCP...
  ✓ Updated ~/.cursor/mcp.json
  ➜ Setting up Claude Code MCP...
  ✓ Updated ~/.claude/settings.json
  ➜ Setting up Antigravity MCP...
  ✓ Antigravity MCP setup complete
  ➜ Setting up OpenAI Codex CLI MCP...
  ✓ Updated ~/.codex/config.toml

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ Universal MCP Setup Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Configured for:
    ✓ Cursor (~/.cursor/mcp.json)
    ✓ Claude Code (~/.claude/settings.json)
    ✓ Antigravity (MCP workspace)
    ✓ OpenAI Codex CLI (~/.codex/config.toml)

  Next: Restart your AI clients to activate MCP servers
        Verify: bash forgewright/scripts/forgewright-mcp-setup.sh --check
```

### 3. Restart All AI Clients

```
1. Quit Cursor completely (Cmd+Q)
2. Quit Claude Desktop completely
3. Quit Codex CLI
4. Restart Antigravity (if running)
```

### 4. Verify (All 3 Platforms)

```bash
bash forgewright/scripts/forgewright-mcp-setup.sh --check
```

Expected output:
```
━━━ MCP Status (All Platforms) ━━━
  ➜ Project: /path/to/project

  ✓ Cursor: ~/.cursor/mcp.json
    forgewright: CONFIGURED
    gitnexus: CONFIGURED

  ✓ Claude Code: ~/.claude/settings.json
    forgewright: CONFIGURED
    gitnexus: CONFIGURED

  ➜ Antigravity:
    ✓ Server: ~/.cursor/projects/<hash>/mcps/user-forgewright/
    forgewright: CONFIGURED

  ✓ Manifest: /path/to/project/.antigravity/mcp-manifest.json

  ✓ Codex CLI: ~/.codex/config.toml
    forgewright: CONFIGURED
    gitnexus: CONFIGURED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## For Experts

### Setup Individual Platform

```bash
# Cursor only
bash forgewright/scripts/forgewright-mcp-setup.sh --cursor

# Claude Code only
bash forgewright/scripts/forgewright-mcp-setup.sh --claude-code

# Antigravity only
bash forgewright/scripts/forgewright-mcp-setup.sh --antigravity

# OpenAI Codex CLI only
bash forgewright/scripts/forgewright-mcp-setup.sh --codex
```

### Check Status

```bash
bash forgewright/scripts/forgewright-mcp-setup.sh --check
```

### Force Re-setup

```bash
bash forgewright/scripts/forgewright-mcp-setup.sh --force
```

### Just GitNexus

```bash
npm install -g gitnexus
gitnexus setup
```

---

## Uninstall

```bash
bash forgewright/scripts/forgewright-mcp-setup.sh --uninstall
```

---

## Verify Checklist

After setup, confirm all 4 platforms are configured:

- [ ] **Cursor**: Restart Cursor, check MCP tools appear
- [ ] **Claude Code**: Restart Claude, check MCP tools appear
- [ ] **Antigravity**: Restart Antigravity, check MCP tools appear
- [ ] **OpenAI Codex CLI**: Restart Codex, run `codex mcp list` to verify
- [ ] **Script check**: `bash forgewright/scripts/forgewright-mcp-setup.sh --check` shows all ✓

---

## Need Help?

- Full docs: [docs/SETUP.md](SETUP.md)
- Troubleshooting: [docs/SETUP.md#troubleshooting](SETUP.md#troubleshooting)
- Issues: [GitHub](https://github.com/buiphucminhtam/forgewright/issues)
