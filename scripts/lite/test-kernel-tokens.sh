#!/usr/bin/env bash
# scripts/lite/test-kernel-tokens.sh
# Verifies the kernel fits within the strict 7000-token deterministic budget.
#
# Measurement scope (per correction #6):
#   - Root instruction payload: all 5 kernel/*.md files (ENTRY, SOLVE, VERIFY, ESCALATE, CLARIFY)
#   - INDEX discovery cost: kernel/INDEX.md (one-time read on boot)
#   - One maximum skill overlay: the largest LITE.md file found in skills/
#
# The test FAILS if the sum of these three components exceeds 7000 tokens.
# Token estimate: chars / 4 (deterministic, matches sync-kernel.py).
#
# Run: bash scripts/lite/test-kernel-tokens.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TOKEN_LIMIT=7000

char_tokens() {
    # Deterministic: chars / 4, consistent with sync-kernel.py
    local chars
    chars=$(wc -c < "$1" | tr -d ' ')
    echo $(( chars / 4 ))
}

echo "=== Kernel Token Budget Test ==="
echo "Limit: ${TOKEN_LIMIT} tokens (chars/4, deterministic)"
echo ""

# 1. Root instruction payload: kernel/*.md files assembled by sync-kernel.py
KERNEL_CHARS=0
KERNEL_FILES=("ENTRY.md" "SOLVE.md" "VERIFY.md" "ESCALATE.md" "CLARIFY.md")
for f in "${KERNEL_FILES[@]}"; do
    fpath="${PROJECT_ROOT}/kernel/${f}"
    if [[ ! -f "$fpath" ]]; then
        echo "ERROR: Required kernel file not found: $fpath" >&2
        exit 1
    fi
    c=$(wc -c < "$fpath" | tr -d ' ')
    KERNEL_CHARS=$(( KERNEL_CHARS + c ))
    echo "  kernel/$f: $(( c / 4 )) tokens"
done
KERNEL_TOKENS=$(( KERNEL_CHARS / 4 ))
echo "  → Kernel subtotal: ${KERNEL_TOKENS} tokens"
echo ""

# 2. INDEX discovery cost (informational only — INDEX is lazy-loaded, not at boot)
INDEX_PATH="${PROJECT_ROOT}/kernel/INDEX.md"
if [[ -f "$INDEX_PATH" ]]; then
    INDEX_TOKENS=$(char_tokens "$INDEX_PATH")
    echo "  kernel/INDEX.md: ${INDEX_TOKENS} tokens  [LAZY — not counted in boot total]"
else
    INDEX_TOKENS=0
    echo "  kernel/INDEX.md: not found"
fi
echo ""

# 3. One maximum skill overlay: largest LITE.md under skills/
MAX_OVERLAY_TOKENS=0
MAX_OVERLAY_PATH="(none)"
SKILLS_DIR="${PROJECT_ROOT}/skills"
if [[ -d "$SKILLS_DIR" ]]; then
    while IFS= read -r -d '' fpath; do
        t=$(char_tokens "$fpath")
        if (( t > MAX_OVERLAY_TOKENS )); then
            MAX_OVERLAY_TOKENS=$t
            MAX_OVERLAY_PATH="$fpath"
        fi
    done < <(find "$SKILLS_DIR" -name "LITE.md" -print0 2>/dev/null)
fi
echo "  Max skill overlay: ${MAX_OVERLAY_TOKENS} tokens  (${MAX_OVERLAY_PATH##"${PROJECT_ROOT}"/})"
echo ""

# Total boot payload excludes INDEX.md because ENTRY.md now lazy-loads the
# full index only on specialized routing fallback.
TOTAL=$(( KERNEL_TOKENS + MAX_OVERLAY_TOKENS ))
echo "=== Total boot payload: ${TOTAL} / ${TOKEN_LIMIT} tokens ==="

if (( TOTAL > TOKEN_LIMIT )); then
    echo "FAIL: Boot payload exceeds ${TOKEN_LIMIT}-token limit by $(( TOTAL - TOKEN_LIMIT )) tokens." >&2
    echo "  Fix options:" >&2
    echo "    a) Trim kernel/*.md files to reduce root instruction payload." >&2
    echo "    b) Move INDEX.md content to on-demand discovery (lazy loading)." >&2
    echo "    c) Shrink the largest LITE.md overlay." >&2
    exit 1
fi

echo "PASS"

# Also verify sync-kernel.py (generated files) succeeds independently
echo ""
echo "=== sync-kernel.py generated-file check ==="
cd "$PROJECT_ROOT"
if python3 scripts/lite/sync-kernel.py; then
    echo "Generated kernel files: OK"
else
    echo "FAIL: sync-kernel.py reported an error." >&2
    exit 1
fi
