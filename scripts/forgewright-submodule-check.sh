#!/usr/bin/env bash
# Backward-compatible entrypoint for parent hooks installed by older releases.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/lite/submodule-auto-update.sh" "$@"
