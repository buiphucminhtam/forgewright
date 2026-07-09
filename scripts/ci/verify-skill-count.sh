#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Skills Count Verification — prevents count oscillation
# Run: bash scripts/verify-skill-count.sh
#
# Reads expected count from skills/skills-registry.yaml
# Falls back to dynamic counting if registry is missing
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGISTRY="$PROJECT_ROOT/skills/skills-registry.yaml"
SKILLS_DIR="$PROJECT_ROOT/skills"

# ── Determine expected count from registry or dynamic scan ──
if [ -f "$REGISTRY" ]; then
  # Count entries in the registry (lines matching "  - name:")
  EXPECTED=$(grep -c '^\s*- name:' "$REGISTRY")
  SOURCE="skills-registry.yaml"
else
  # Fallback: count SKILL.md files dynamically
  EXPECTED=$(find "$SKILLS_DIR" -maxdepth 2 -name 'SKILL.md' \
    -not -path '*/_shared/*' \
    -not -path '*/_test/*' \
    -not -path '*/generated/*' | wc -l | tr -d ' ')
  SOURCE="dynamic scan (registry missing)"
fi

# ── Count actual skill directories (dirs with SKILL.md, excluding special dirs) ──
ACTUAL=$(find "$SKILLS_DIR" -maxdepth 2 -name 'SKILL.md' \
  -not -path '*/_shared/*' \
  -not -path '*/_test/*' \
  -not -path '*/generated/*' | wc -l | tr -d ' ')

# ── Count by type if registry exists ──
CANONICAL=0
ALIAS=0
if [ -f "$REGISTRY" ]; then
  CANONICAL=$(grep -c 'type: canonical' "$REGISTRY" || true)
  ALIAS=$(grep -c 'type: alias' "$REGISTRY" || true)
fi

echo "━━━ Skills Count Verification ━━━"
echo "  Source:    $SOURCE"
echo "  Expected: $EXPECTED"
echo "  Actual:   $ACTUAL"
if [ -f "$REGISTRY" ]; then
  echo "  Canonical: $CANONICAL"
  echo "  Aliases:   $ALIAS"
fi
echo ""

# ── Show all skills for transparency ──
echo "  Skills with SKILL.md:"
find "$SKILLS_DIR" -maxdepth 2 -name 'SKILL.md' \
  -not -path '*/_shared/*' \
  -not -path '*/_test/*' \
  -not -path '*/generated/*' \
  -exec dirname {} \; | xargs -I{} basename {} | sort | sed 's/^/    /'

echo ""

# ── Check for LITE.md coverage ──
LITE_COUNT=$(find "$SKILLS_DIR" -maxdepth 2 -name 'LITE.md' \
  -not -path '*/_shared/*' \
  -not -path '*/_test/*' \
  -not -path '*/generated/*' | wc -l | tr -d ' ')
echo "  LITE.md coverage: $LITE_COUNT / $ACTUAL"

# ── Find skills missing LITE.md ──
MISSING_LITE=""
for skill_md in $(find "$SKILLS_DIR" -maxdepth 2 -name 'SKILL.md' \
  -not -path '*/_shared/*' \
  -not -path '*/_test/*' \
  -not -path '*/generated/*'); do
  skill_dir=$(dirname "$skill_md")
  if [ ! -f "$skill_dir/LITE.md" ]; then
    MISSING_LITE="$MISSING_LITE    $(basename "$skill_dir")\n"
  fi
done

if [ -n "$MISSING_LITE" ]; then
  echo ""
  echo "  ⚠ Skills missing LITE.md:"
  printf "$MISSING_LITE"
fi

# ── Verdict ──
if [ "$ACTUAL" -eq "$EXPECTED" ]; then
  echo ""
  echo "✓ Skill count matches ($ACTUAL skills)"
  exit 0
else
  echo ""
  echo "✗ SKILL COUNT MISMATCH!"
  echo "  Expected: $EXPECTED (from $SOURCE)"
  echo "  Actual:   $ACTUAL"
  echo ""
  echo "  Fix: Update skills/skills-registry.yaml to match actual skills,"
  echo "  or add/remove skill directories to match the registry."
  exit 1
fi
