#!/usr/bin/env bash
# Bounded project footprint report. No deletion or ownership inference.
# Existing --root/--json/--strict flags remain; v2 counts the complete tree.
# Partial scans return UNVERIFIED and exit 2, never zero usage or OK.
set -euo pipefail
RUNTIME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
exec python3 -I -B -c 'import sys;sys.path.insert(0,sys.argv.pop(1));from project_disk import main;raise SystemExit(main(sys.argv[1:]))' "$RUNTIME_DIR" "$@"
