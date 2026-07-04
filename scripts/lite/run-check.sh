#!/usr/bin/env bash
# scripts/lite/run-check.sh
# Atomic evidence writer for the Forgewright verify-gate.
#
# Usage:
#   bash scripts/lite/run-check.sh [OPTIONS] -- <command> [args...]
#
# Options:
#   --turn <id>      Turn/session identifier (default: $FORGEWRIGHT_TURN or timestamp_PID)
#   --out  <dir>     Evidence output directory (default: <workspace>/.forgewright/verify)
#   --no-redact      Skip in-memory output redaction
#   --help           Show this help
#
# Contract (schema_version "1"):
#   Writes <out>/<turn>.json atomically containing:
#     schema_version  - "1"
#     turn            - identifier string
#     command         - argv as JSON array
#     exit_code       - integer exit code of <command>
#     output          - redacted combined stdout+stderr (≤16 KB)
#     output_truncated- bool: true if output was capped
#     timestamp_utc   - ISO-8601 UTC at execution start
#     workspace       - absolute git worktree root (or $PWD)
#     tree_sha        - HEAD SHA, "DIRTY:<head>:<idx>" if dirty, "NONGIT:<hash>"
#
# Security: source files are NEVER mutated. Redaction acts on in-memory copy only.
# Exit: always 0 — callers inspect exit_code inside the JSON.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REDACT_FLAG="1"
TURN_FLAG=""
OUT_FLAG=""
PASS_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --turn)      TURN_FLAG="$2"; shift 2 ;;
    --out)       OUT_FLAG="$2";  shift 2 ;;
    --no-redact) REDACT_FLAG="0"; shift  ;;
    --help|-h)
      grep '^#' "${BASH_SOURCE[0]}" | sed 's/^# \?//' | head -30
      exit 0
      ;;
    --)  shift; break ;;
    *)   break ;;
  esac
done

if [[ $# -eq 0 ]]; then
  echo "[run-check] ERROR: No command supplied. Usage: run-check.sh [opts] -- <cmd>" >&2
  exit 2
fi

# Build python argv
PYARGS=("--redact" "$REDACT_FLAG")
[[ -n "$TURN_FLAG" ]] && PYARGS+=("--turn" "$TURN_FLAG")
[[ -n "$OUT_FLAG"  ]] && PYARGS+=("--out"  "$OUT_FLAG")
[[ -n "${FORGEWRIGHT_TURN:-}" && -z "$TURN_FLAG" ]] && PYARGS+=("--turn" "$FORGEWRIGHT_TURN")

exec python3 "${SCRIPT_DIR}/run_check.py" "${PYARGS[@]}" -- "$@"
