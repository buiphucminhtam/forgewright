#!/usr/bin/env bash
# Verification script for Promptfoo integration

set -e

echo "=== Verifying Promptfoo Integration ==="

# Check Phase 1: Internal Benchmarking Config
if [ ! -f "tests/prompts/promptfooconfig.yaml" ]; then
    echo "❌ Error: tests/prompts/promptfooconfig.yaml is missing"
    exit 1
fi
echo "✓ Phase 1: tests/prompts/promptfooconfig.yaml exists"

# Check syntax of yaml config
python3 -c "import yaml; yaml.safe_load(open('tests/prompts/promptfooconfig.yaml'))" 2>/dev/null || {
    echo "❌ Error: tests/prompts/promptfooconfig.yaml has invalid YAML syntax"
    exit 1
}
echo "✓ Phase 1: tests/prompts/promptfooconfig.yaml syntax is valid"

# Check Phase 2: llm-tester skill
if [ ! -f "skills/llm-tester/SKILL.md" ]; then
    echo "❌ Error: skills/llm-tester/SKILL.md is missing"
    exit 1
fi
echo "✓ Phase 2: skills/llm-tester/SKILL.md exists"

# Check Phase 3: prompt-healing script
if [ ! -f "scripts/prompt-healing.sh" ]; then
    echo "❌ Error: scripts/prompt-healing.sh is missing"
    exit 1
fi
if [ ! -x "scripts/prompt-healing.sh" ]; then
    echo "❌ Error: scripts/prompt-healing.sh is not executable"
    exit 1
fi
echo "✓ Phase 3: scripts/prompt-healing.sh is executable"

echo "✅ All promptfoo integration components are verified successfully!"
exit 0
