#!/usr/bin/env bash
# Focused offline verifier for the provider-neutral H4 loop journal.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

tests=("$@")
if [[ ${#tests[@]} -eq 0 ]]; then
  tests=(
    tests/unit_tests/test_agent_loop_replay.py
    tests/unit_tests/test_forgewright_orchestrator.py
  )
fi

python_bin="${FORGEWRIGHT_PYTHON:-}"
if [[ -z "$python_bin" ]]; then
  for candidate in \
    "$root/.forgewright/local-ci-venv/bin/python" \
    "$root/.forgewright/local-ci-venv/Scripts/python.exe" \
    "$root/.forgewright/runtime/ci-venv/bin/python" \
    "$root/.forgewright/runtime/ci-venv/Scripts/python.exe"; do
    if [[ -x "$candidate" ]]; then
      python_bin="$candidate"
      break
    fi
  done
fi
if [[ -z "$python_bin" ]]; then
  python_bin="$(command -v python3 || command -v python || true)"
fi
if [[ -z "$python_bin" ]]; then
  echo "H4 verifier requires Python 3.11+ with pytest and ruff" >&2
  exit 6
fi

"$python_bin" -m pytest -q -p no:cacheprovider "${tests[@]}"
"$python_bin" -m ruff check \
  scripts/runtime/agent_loop_replay.py \
  scripts/runtime/forgewright-orchestrator.py \
  tests/unit_tests/test_agent_loop_replay.py \
  tests/unit_tests/test_forgewright_orchestrator.py
echo "H4 record/replay verifier: PASS"
