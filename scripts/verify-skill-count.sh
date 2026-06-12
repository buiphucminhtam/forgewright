#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Skills Count Verification — prevents count oscillation
# Run: bash scripts/verify-skill-count.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

EXPECTED=80
ACTUAL=$(ls -1p skills/ | grep '/$' | grep -v '_shared/' | grep -v '_test/' | wc -l | tr -d ' ')

echo "━━━ Skills Count Verification ━━━"
echo "  Expected: $EXPECTED"
echo "  Actual:   $ACTUAL"
echo ""

# Show all skills for transparency
echo "  Skills list:"
ls -1p skills/ | grep '/$' | grep -v '_shared/' | sort | sed 's/^/    /'

if [ "$ACTUAL" -eq "$EXPECTED" ]; then
  echo ""
  echo "✓ Skill count matches ($ACTUAL skills)"
  exit 0
else
  echo ""
  echo "✗ SKILL COUNT MISMATCH!"
  echo "  Expected: $EXPECTED, got: $ACTUAL"
  echo ""
  echo "  Fix: Add or remove skills to match expected count of $EXPECTED"
  echo "  Then update AGENTS.md skill count and SKILL.md header."
  exit 1
fi
