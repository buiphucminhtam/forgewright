#!/bin/bash
# Forgewright Compliance Enforcer

echo "Running compliance checks..."
SCORE=100

# 1. Claude Settings (.claude/settings.json)
if [ ! -f ".claude/settings.json" ]; then
  echo "[-] Local .claude/settings.json missing"
  SCORE=$((SCORE-20))
elif ! grep -q "verify-gate.sh --platform CLAUDE" ".claude/settings.json" 2>/dev/null; then
  echo "[-] Claude settings stop hook not configured with verify-gate.sh --platform CLAUDE"
  SCORE=$((SCORE-10))
fi

# 2. Gemini Settings (.gemini/settings.json)
if [ ! -f ".gemini/settings.json" ]; then
  echo "[-] Local .gemini/settings.json missing"
  SCORE=$((SCORE-20))
elif ! grep -q "verify-gate.sh --platform GEMINI" ".gemini/settings.json" 2>/dev/null; then
  echo "[-] Gemini settings AfterAgent hook not configured with verify-gate.sh --platform GEMINI"
  SCORE=$((SCORE-10))
fi

# 3. Cursor Hooks (.cursor/hooks.json)
if [ ! -f ".cursor/hooks.json" ]; then
  echo "[-] Local .cursor/hooks.json missing"
  SCORE=$((SCORE-20))
elif ! grep -q "verify-gate.sh --platform CURSOR" ".cursor/hooks.json" 2>/dev/null; then
  echo "[-] Cursor hooks stop hook not configured with verify-gate.sh --platform CURSOR"
  SCORE=$((SCORE-10))
fi

# 4. Codex Config (.codex/config.toml)
if [ ! -f ".codex/config.toml" ]; then
  echo "[-] Local .codex/config.toml missing"
  SCORE=$((SCORE-20))
elif ! grep -q "verify-gate.sh --platform CODEX" ".codex/config.toml" 2>/dev/null; then
  echo "[-] Codex config Stop hook not configured with verify-gate.sh --platform CODEX"
  SCORE=$((SCORE-10))
fi

# Legacy Directories
if [ ! -d ".forgewright/memory-bank" ]; then
  echo "[-] Memory Bank directory missing"
  SCORE=$((SCORE-10))
fi

if [ ! -f ".forgewright/session-log.json" ]; then
  echo "[-] session-log.json missing"
  SCORE=$((SCORE-10))
fi

if [ ! -d ".forgewright/subagent-context" ]; then
  echo "[-] Subagent context directory missing"
  SCORE=$((SCORE-10))
fi

echo "Compliance Score: $SCORE%"
if [ $SCORE -ge 80 ]; then
  echo "Status: PASS"
  exit 0
else
  echo "Status: FAIL"
  exit 1
fi
