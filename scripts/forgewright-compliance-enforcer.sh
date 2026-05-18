#!/bin/bash
# Forgewright Compliance Enforcer

echo "Running compliance checks..."
SCORE=100

if ! grep -q "memory-session" ~/.claude/settings.json 2>/dev/null; then
  echo "[-] Claude memory hooks missing"
  SCORE=$((SCORE-20))
fi

if [ ! -d ".forgewright/memory-bank" ]; then
  echo "[-] Memory Bank directory missing"
  SCORE=$((SCORE-20))
fi

if [ ! -f ".forgewright/session-log.json" ]; then
  echo "[-] session-log.json missing"
  SCORE=$((SCORE-20))
fi

if [ ! -d ".forgewright/subagent-context" ]; then
  echo "[-] Subagent context directory missing"
  SCORE=$((SCORE-20))
fi

echo "Compliance Score: $SCORE%"
if [ $SCORE -ge 80 ]; then
  echo "Status: PASS"
  exit 0
else
  echo "Status: FAIL"
  exit 1
fi
