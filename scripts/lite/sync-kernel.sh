#!/usr/bin/env bash
# scripts/lite/sync-kernel.sh
# Convenient wrapper for sync-kernel.py

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$SCRIPT_DIR/sync-kernel.py"
