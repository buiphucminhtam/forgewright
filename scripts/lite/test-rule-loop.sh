#!/usr/bin/env bash
# scripts/lite/test-rule-loop.sh
# Phase 6: E2E Test for Rule Compliance Loop

set -euo pipefail

echo "Testing Telemetry..."
bash scripts/lite/telemetry.sh emit test '{"status": "ok"}'

echo "Testing Rule Ledger..."
bash scripts/lite/rule-ledger.sh add test-rule hit "test run"
bash scripts/lite/rule-ledger.sh top 3

echo "Testing Rule Refresh..."
bash scripts/lite/rule-refresh.sh

echo "Testing Rule Validator..."
python3 scripts/lite/rule-validator.py --static

echo "Testing Context Manager..."
python3 scripts/lite/context-manager.py load

echo "Testing Policy Check..."
bash scripts/lite/policy-check.sh show

echo "All tests passed successfully!"
