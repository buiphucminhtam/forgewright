#!/bin/bash
# MCP & Tool Status Checker

echo "=========================================="
echo "   Forgewright Environment Status"
echo "=========================================="
echo ""

# 1. GitNexus Status
echo "🔮 GitNexus (Code Intelligence)"
echo "-----------------------------------"
if pgrep -f "gitnexus" > /dev/null 2>&1; then
    echo "  Status: ✅ Running (MCP)"
    pgrep -fl "gitnexus" | head -1
else
    echo "  Status: ❌ Not running in background"
fi

# Check gitnexus index
if [ -d ".gitnexus" ]; then
    echo "  Index: ✅ Present (.gitnexus/)"
else
    echo "  Index: ❌ Missing (.gitnexus/)"
fi
echo ""

# 2. Forgewright MCP
echo "🛠️  Forgewright MCP Server"
echo "-----------------------------------"
if ls ~/.cursor/projects/*/mcps/user-forgewright/*.json 2>/dev/null | head -1 > /dev/null; then
    echo "  Config: ✅ Found"
else
    echo "  Config: ⚠️  Missing"
fi

# 3. mmx-cli
echo "⚡ mmx-cli (Antigravity CLI)"
echo "-----------------------------------"
if which mmx > /dev/null 2>&1; then
    VERSION=$(mmx --version 2>/dev/null || echo "unknown")
    echo "  Status: ✅ Installed ($VERSION)"
else
    echo "  Status: ❌ Not installed"
fi
echo ""

# 4. Current Workspace
echo "📁 Current Workspace"
echo "-----------------------------------"
echo "  Path: $(pwd)"
echo "  Git: $(git branch --show-current 2>/dev/null || echo 'N/A')"

# Check manifest
if [ -f ".antigravity/mcp-manifest.json" ]; then
    echo "  MCP Manifest: ✅ Present"
    SERVERS=$(grep -c '"name"' .antigravity/mcp-manifest.json 2>/dev/null || echo "0")
    echo "  Servers configured: $((SERVERS/2))"
else
    echo "  MCP Manifest: ❌ Missing"
fi
echo ""

# 5. Node & Package Managers
echo "📦 Package Managers"
echo "-----------------------------------"
echo "  Node: $(node --version 2>/dev/null || echo 'not found')"
echo "  npm: $(npm --version 2>/dev/null || echo 'not found')"
echo "  pnpm: $(pnpm --version 2>/dev/null || echo 'not found')"
echo ""

# 6. Quick Health Check
echo "🏥 Quick Health Check"
echo "-----------------------------------"

# Check Cursor MCP
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "  Board UI: ✅ Running on port 3000"
else
    echo "  Board UI: ⚠️  Not running"
fi

if curl -s http://localhost:4000 > /dev/null 2>&1; then
    echo "  Multica Hub: ✅ Running on port 4000"
else
    echo "  Multica Hub: ⚠️  Not running"
fi
echo ""

echo "=========================================="
echo "   Ready to work: $([ $? -eq 0 ] && echo '✅ YES' || echo '❌ NO')"
echo "=========================================="
