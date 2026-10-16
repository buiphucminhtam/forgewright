#!/usr/bin/env bash
# Read-only compatibility entry. JSON is serialized from data, never source text.
set -euo pipefail
checkpoint_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$checkpoint_script_dir/../memory/checkpoint_extract.py" "$@"
