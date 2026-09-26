#!/usr/bin/env bash
# Local acceptance layers; authenticated native host tests remain separate.
set -euo pipefail

scope="${1:-}"
case "$scope" in
  contract|runtime|e2e) ;;
  *) printf 'Usage: bash scripts/ci/verify-auto-bootstrap-local.sh {contract|runtime|e2e}\n' >&2; exit 2 ;;
esac
if [[ "$scope" != contract && "${FORGEWRIGHT_RUN_AUTO_BOOTSTRAP_RUNTIME:-}" != 1 ]]; then
  printf 'Runtime/E2E requires FORGEWRIGHT_RUN_AUTO_BOOTSTRAP_RUNTIME=1 (isolated local profiles only).\n' >&2
  exit 2
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
bootstrap_python="${FORGEWRIGHT_BOOTSTRAP_PYTHON:-python3}"
export PYTHONDONTWRITEBYTECODE=1

# These same negative-path contracts run in every layer. Do not replace them
# with an evidence marker or let a successful runtime hide a contract failure.
"$bootstrap_python" -m pytest -p no:cacheprovider -q --tb=line \
  tests/unit_tests/test_auto_bootstrap*.py \
  tests/unit_tests/test_host_admission.py \
  tests/unit_tests/test_project_policy_seed.py

if [[ "$scope" != contract ]]; then
  "$bootstrap_python" scripts/ci/verify-auto-bootstrap-runtime.py --run --scope "$scope"
fi
