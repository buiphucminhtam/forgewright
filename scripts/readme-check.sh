#!/bin/bash
# Forgewright README Compliance Check
# Run this before committing to ensure README is up to date

echo "🔍 Checking README compliance..."

README_FILE="README.md"
RULES_FILE=".github/README_RULES.md"

# Check if README exists
if [ ! -f "$README_FILE" ]; then
    echo "❌ README.md not found!"
    exit 1
fi

# Check if rules file exists
if [ ! -f "$RULES_FILE" ]; then
    echo "⚠️  .github/README_RULES.md not found - consider creating it"
fi

# Get last commit message
LAST_MSG=$(git log -1 --format="%s")

echo ""
echo "📝 Last commit: $LAST_MSG"
echo ""

# Analyze commit type
COMMIT_TYPE="unknown"
if echo "$LAST_MSG" | grep -qi "feat"; then
    COMMIT_TYPE="feature"
elif echo "$LAST_MSG" | grep -qi "fix"; then
    COMMIT_TYPE="bugfix"
elif echo "$LAST_MSG" | grep -qi "docs"; then
    COMMIT_TYPE="docs"
elif echo "$LAST_MSG" | grep -qi "refactor"; then
    COMMIT_TYPE="refactor"
elif echo "$LAST_MSG" | grep -qi "skill"; then
    COMMIT_TYPE="skill"
fi

echo "📦 Commit type detected: $COMMIT_TYPE"
echo ""

# Checklist based on commit type
case "$COMMIT_TYPE" in
    feature)
        echo "✅ Feature commit - checking README:"
        echo "   [ ] Added new section to README?"
        echo "   [ ] Added quick start commands?"
        echo "   [ ] Updated architecture if needed?"
        echo "   [ ] Added troubleshooting tips?"
        echo ""
        echo "⚠️  Run: git diff README.md"
        ;;
    skill)
        echo "✅ Skill commit - checking README:"
        echo "   [ ] Added to Skills table?"
        echo "   [ ] Updated skills count badge (56 → 57)?"
        echo "   [ ] Added example usage?"
        echo ""
        echo "⚠️  Current skills count: $(grep -oP '(?<=\[skills-)\d+(?=\])' $README_FILE || echo 'check manually')"
        ;;
    bugfix)
        echo "✅ Bugfix commit - checking README:"
        echo "   [ ] Added to Troubleshooting section?"
        echo "   [ ] Updated FAQ if needed?"
        ;;
    docs)
        echo "✅ Docs commit - looks good!"
        ;;
    *)
        echo "ℹ️  General commit - verify README is still accurate"
        ;;
esac

echo ""
echo "📋 README Sections Status:"
echo ""

# Check for essential sections
sections=(
    "Quick Start"
    "Token Tracking"
    "GitNexus"
    "Troubleshooting"
    "FAQ"
)

for section in "${sections[@]}"; do
    if grep -qi "$section" "$README_FILE"; then
        echo "   ✅ $section"
    else
        echo "   ❌ $section (MISSING)"
    fi
done

echo ""
echo "💡 Tip: Review .github/README_RULES.md for full checklist"
echo ""
