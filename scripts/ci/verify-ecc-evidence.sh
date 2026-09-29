#!/usr/bin/env bash
# Maintained local ECC verification entrypoint. No model, network or promotion calls.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
PYTHON="${ROOT}/.forgewright/local-ci-venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
    PYTHON="$(command -v python3)"
fi
PATH="$(dirname "$PYTHON"):$PATH"
export PATH
export PYTHONDONTWRITEBYTECODE=1
LOG_ROOT="$ROOT/.forgewright/runtime/ecc-verification"
mkdir -p "$LOG_ROOT"
SCRATCH="$(mktemp -d "$LOG_ROOT/run.XXXXXXXX")"
# Keep complete test output in verifier-owned runtime storage for inspection.
# These logs are not source and must never be staged for a release.

run_step() {
    local name="$1"
    shift
    local output="$SCRATCH/$name.log"
    local code=0
    "$@" > "$output" 2>&1 || code=$?
    printf '\nECC_CHECK %s EXIT=%s\n' "$name" "$code"
    "$PYTHON" -c 'import hashlib,sys; print("OUTPUT_SHA256="+hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$output"
    # A byte tail may begin inside a UTF-8 character. Render a valid text tail;
    # the complete original bytes and their digest above remain authoritative.
    "$PYTHON" -c 'import os,sys; f=open(sys.argv[1],"rb"); f.seek(max(0,os.fstat(f.fileno()).st_size-900)); print(f.read(900).decode("utf-8",errors="replace"),end="")' "$output"
    printf '\nRAW_LOG=%s\n' "$output"
    if [[ "$code" != 0 ]]; then
        return "$code"
    fi
}

printf 'ECC_SCOPE root=%s branch=%s head=%s\n' "$ROOT" "$(git branch --show-current)" "$(git rev-parse HEAD)"
[[ "$(git rev-parse --show-toplevel)" == "$ROOT" ]]
[[ "$(git config --get core.hooksPath)" == '.husky' ]]
run_step observer npm run check:observer
run_step mcp-build npm --prefix mcp run build
run_step mcp-lint npm --prefix mcp run lint
run_step python-ecc "$PYTHON" -m pytest -q -p no:cacheprovider \
    tests/unit_tests/test_context_packets.py \
    tests/unit_tests/test_context_packets_supplemental.py \
    tests/unit_tests/test_parallel_dispatch_runner.py \
    tests/unit_tests/test_research_and_handoff.py \
    tests/unit_tests/test_instinct_observer.py \
    tests/unit_tests/test_ecc_evidence_repairs.py \
    tests/unit_tests/test_ecc_context_boundaries.py \
    tests/unit_tests/test_ecc_parent_retrieval.py \
    tests/unit_tests/test_ecc_dispatch_entrypoint.py \
    tests/unit_tests/test_ecc_local_scenarios.py
run_step native-learning npm --prefix mcp test -- \
    src/product-factory/native-learning-adapter.test.ts \
    src/product-factory/learning-foundry-real-clock.test.ts \
    src/product-factory/learning-foundry.test.ts \
    src/api/learning-foundry-tools.test.ts \
    src/runtime/execution-containment.test.ts \
    src/middleware/chain.test.ts --maxWorkers=1 --minWorkers=1
run_step paired-benchmark npm --prefix src/cli test -- \
    tests/bench-e5-scenarios.test.ts tests/bench-comparable.test.ts \
    tests/bench-product-factory.test.ts --maxWorkers=1 --minWorkers=1
run_step product-truth "$PYTHON" scripts/ci/verify-product-truth.py
run_step docs node src/cli/dist/index.js docs gate . --worktree --json
run_step diff git diff --check
printf '\nECC_RESULT PASS; native intake is proposal-only; scenario authority=test-only; model usage unavailable; no performance gain claimed.\n'
