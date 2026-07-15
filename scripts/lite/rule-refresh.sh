#!/usr/bin/env bash
# scripts/lite/rule-refresh.sh
# Forgewright Phase 3 — Rule Refresh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "### RULE REFRESH ###"
echo "1. VERIFY claim success w/ output"
echo "2. IMPACT analysis before edit"
echo "3. NO INVENT paths/apis"
echo "4. STUCK rule: STOP after 2 fails"
echo "5. SCOPE: Stay in bounds"
echo "6. GUARDRAIL: Never bypass"

echo "### FORGOTTEN RULES TO FOCUS ON ###"
if [[ -x "scripts/lite/rule-ledger.sh" ]]; then
    bash scripts/lite/rule-ledger.sh recent 3 violation
else
    echo "No forgotten rules logged yet."
fi
