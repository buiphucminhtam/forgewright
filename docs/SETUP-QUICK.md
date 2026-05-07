# Quick Start Guide

> 5 minutes to MCP setup. Zero configuration.

---

## TL;DR

```bash
# 1. Go to your project
cd /path/to/project

# 2. Run setup (one command)
bash forgewright/scripts/fw-mcp.sh setup

# 3. Restart your IDE
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
bash forgewright/scripts/fw-mcp.sh setup
```

Expected output:
```
⚡ ForgeWright MCP Setup v2.0.0

  ➜ Checking prerequisites...
  ✓ Node.js v20.0.0
  ✓ npm 10.0.0

  ➜ Detected IDE: cursor
  ✓ Directories created
  ✓ Manifest created
  ✓ Launcher created
  ✓ Config updated

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ MCP Setup Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Next steps:
    1. Restart your AI IDE (Cursor/Claude)
    2. Verify: bash fw-mcp.sh check
```

### 3. Restart Your IDE

Close and reopen Cursor or Claude Desktop.

### 4. Verify (Optional)

```bash
bash forgewright/scripts/fw-mcp.sh check
```

---

## For Experts

### Silent Setup

```bash
bash forgewright/scripts/fw-mcp.sh setup --force
```

### Check Status

```bash
bash forgewright/scripts/fw-mcp.sh check
```

### Just ForgeNexus

```bash
bash forgewright/scripts/forgenexus-setup.sh
```

---

## Uninstall

```bash
bash fw-mcp.sh uninstall
```

---

## Need Help?

- Full docs: [docs/SETUP.md](SETUP.md)
- Troubleshooting: [docs/SETUP.md#troubleshooting](SETUP.md#troubleshooting)
- Issues: [GitHub](https://github.com/buiphucminhtam/forgewright/issues)
