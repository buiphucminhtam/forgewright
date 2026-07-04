#!/usr/bin/env bash
set -euo pipefail

echo "Running temp-HOME hook tests..."

TEMP_HOME=$(mktemp -d)
export HOME="$TEMP_HOME"
export FORGEWRIGHT_DIR="$HOME/.forgewright"

echo "Test 1: Install hooks"
bash scripts/forgewright-install.sh --profile minimal --yes --skip-mcp --skip-skills --skip-config
if [[ ! -f "$HOME/.gemini/settings.json" ]]; then
    echo "FAILED: Gemini settings not installed"
    exit 1
fi
if [[ ! -f "$HOME/.claude/settings.json" ]]; then
    echo "FAILED: Claude settings not installed"
    exit 1
fi
if [[ ! -f "$HOME/.cursor/hooks.json" ]]; then
    echo "FAILED: Cursor settings not installed"
    exit 1
fi
if [[ ! -f "$HOME/.codex/config.toml" ]]; then
    echo "FAILED: Codex settings not installed"
    exit 1
fi

echo "Test 2: Validate hook schemas"
is_array=$(node -e "var c=JSON.parse(require('fs').readFileSync('$HOME/.gemini/settings.json')); console.log(Array.isArray(c.hooks.AfterAgent));")
if [[ "$is_array" != "true" ]]; then
    echo "FAILED: Gemini AfterAgent must be an array"
    exit 1
fi

if ! grep -q -e "--platform GEMINI" "$HOME/.gemini/settings.json"; then
    echo "FAILED: Gemini missing platform arg"
    exit 1
fi
if ! grep -q -e "--platform CLAUDE" "$HOME/.claude/settings.json"; then
    echo "FAILED: Claude missing platform arg"
    exit 1
fi

echo "Test 3: Run Doctor"
export FORGEWRIGHT_HOOK_PROFILE="minimal"
bash scripts/forgewright-hook-doctor.sh --quick

echo "Test 4: Run Compliance Enforcer"
mkdir -p .forgewright/memory-bank
touch .forgewright/session-log.json
mkdir -p .forgewright/subagent-context
bash scripts/forgewright-compliance-enforcer.sh

echo "All tests passed."
rm -rf "$TEMP_HOME"
