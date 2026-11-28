#!/usr/bin/env bash
# Antigravity CLI PreToolUse hook: single-process policy gate via policy_gate.py.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
GATE_PY="${SCRIPT_DIR}/policy_gate.py"

PYTHON_COMMAND=()
for _cand in "${FORGEWRIGHT_PYTHON_BIN:-}" python3 python python3.13 python3.12 python3.11; do
  [[ -n "$_cand" ]] || continue
  _exe="$(command -v "$_cand" 2>/dev/null || true)"
  if [[ -n "$_exe" ]]; then
    PYTHON_COMMAND=("$_exe")
    break
  fi
done
if [[ ${#PYTHON_COMMAND[@]} -eq 0 ]]; then
  _py="$(command -v py.exe 2>/dev/null || command -v py 2>/dev/null || true)"
  [[ -n "$_py" ]] && PYTHON_COMMAND=("$_py" "-3")
fi
if [[ ${#PYTHON_COMMAND[@]} -eq 0 || ! -f "$GATE_PY" ]]; then
  printf '%s\n' '{"decision":"deny","reason":"Forgewright could not validate this tool call."}'
  exit 0
fi

exec "${PYTHON_COMMAND[@]}" "$GATE_PY" --platform antigravity --framework-root "$FRAMEWORK_ROOT"
