#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Skills Count Verification (detailed per-skill check)
# Run: bash scripts/verify-skills-count.sh
#
# Reads expected count from skills/skills-registry.yaml
# Falls back to dynamic counting if registry is missing
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -e

echo "=== Forgewright Skills Count Verification ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$SCRIPT_DIR/../../skills"
REGISTRY="$SKILLS_DIR/skills-registry.yaml"

# ── Determine expected count from registry or dynamic scan ──
if [ -f "$REGISTRY" ]; then
  EXPECTED=$(grep -c '^\s*- name:' "$REGISTRY")
  SOURCE="skills-registry.yaml"
else
  EXPECTED=$(find "$SKILLS_DIR" -maxdepth 2 -name 'SKILL.md' \
    -not -path '*/_shared/*' \
    -not -path '*/_test/*' \
    -not -path '*/generated/*' | wc -l | tr -d ' ')
  SOURCE="dynamic scan (registry missing)"
fi

total=0
missing=0
aliases=0

for dir in "$SKILLS_DIR"/*/; do
    name=$(basename "$dir")

    # Skip excluded directories
    if [ "$name" == "_shared" ] || [ "$name" == "_test" ] || [ "$name" == "generated" ]; then
        continue
    fi

    if [ -f "$dir/SKILL.md" ]; then
        # Check if it's an alias
        if grep -q 'type: alias' "$dir/SKILL.md" 2>/dev/null; then
            target=$(grep 'alias_target:' "$dir/SKILL.md" 2>/dev/null | head -1 | sed 's/.*alias_target:\s*//')
            echo "✓ $name (alias → $target)"
            aliases=$((aliases + 1))
        else
            echo "✓ $name"
        fi
        total=$((total + 1))
    else
        echo "✗ $name MISSING SKILL.md"
        missing=$((missing + 1))
    fi
done

echo ""
echo "=== Summary ==="
echo "Source:       $SOURCE"
echo "Total skills: $total"
echo "  Canonical:  $((total - aliases))"
echo "  Aliases:    $aliases"
echo "Missing SKILL.md: $missing"

if [ "$total" -ne "$EXPECTED" ]; then
    echo ""
    echo "⚠️  WARNING: Expected $EXPECTED skills (from $SOURCE), found $total"
    echo "   Fix: Update skills/skills-registry.yaml to match actual skills,"
    echo "   or add/remove skill directories to match the registry."
fi

if [ $missing -gt 0 ]; then
    echo ""
    echo "⚠️  ERROR: $missing directories missing SKILL.md"
    exit 1
fi

echo ""
echo "✅ All $total skills verified (from $SOURCE)"
