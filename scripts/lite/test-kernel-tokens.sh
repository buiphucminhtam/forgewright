#!/usr/bin/env bash
# scripts/lite/test-kernel-tokens.sh
# Tests if the kernel fits within the strict 7000 deterministic token budget.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Running kernel token tests..."
cd "$PROJECT_ROOT"

# sync-kernel.py natively verifies token limits and exits 1 if exceeded.
if python3 scripts/lite/sync-kernel.py; then
    echo "Kernel token budget is OK."
else
    echo "Kernel token budget EXCEEDED." >&2
    exit 1
fi
