#!/usr/bin/env bash
# Antigravity CLI Stop hook: run RLG reclaim sweep if installed and allow clean session close.
set -uo pipefail

SWEEP="${FORGEWRIGHT_RLG_SWEEP:-$HOME/.forgewright/scripts/runtime/runtime-sweep.sh}"
if [[ -f "$SWEEP" ]]; then
  bash "$SWEEP" >/dev/null 2>&1 || true
fi
printf '%s\n' '{"continue":true}'
exit 0
