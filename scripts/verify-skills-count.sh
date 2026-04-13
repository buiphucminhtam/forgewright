#!/bin/bash
# Skills count verification script

set -e

echo "=== Forgewright Skills Count Verification ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$SCRIPT_DIR/../skills"

total=0
missing=0

for dir in "$SKILLS_DIR"/*/; do
    name=$(basename "$dir")
    
    if [ "$name" == "_shared" ]; then
        continue
    fi
    
    if [ -f "$dir/SKILL.md" ]; then
        echo "✓ $name"
        total=$((total + 1))
    else
        echo "✗ $name MISSING SKILL.md"
        missing=$((missing + 1))
    fi
done

echo ""
echo "=== Summary ==="
echo "Total skills: $total"
echo "Missing SKILL.md: $missing"

if [ $total -ne 55 ]; then
    echo "⚠️  WARNING: Expected 55 skills, found $total"
fi

if [ $missing -gt 0 ]; then
    echo "⚠️  ERROR: Missing SKILL.md files"
    exit 1
fi

echo ""
echo "✅ All 55 skills verified"
