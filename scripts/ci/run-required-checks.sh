#!/usr/bin/env bash
# Deterministic aggregate gate: each required suite is invoked here; set -e
# means a missing executable, failed suite, or skipped command fails the gate.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

run_required() {
  local name="$1"
  shift
  printf '\n==> required: %s\n' "$name"
  "$@"
}

run_required product-truth python3 scripts/ci/verify-product-truth.py
run_required python-unit-tests python3 -m pytest tests/unit_tests/
run_required mcp-lint npm --prefix mcp run lint
run_required mcp-format npm --prefix mcp run format:check
run_required mcp-build npm --prefix mcp run build
run_required mcp-tests npm --prefix mcp run test
run_required cli-tests npm --prefix src/cli test
