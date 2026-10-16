#!/usr/bin/env bash
# Behavioral replacement for legacy keyword/format checks; all state is temporary.
set -euo pipefail
memory_test_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec python3 "$memory_test_root/tests/memory-system/run_lane.py" tests/unit_tests/test_memory_session_identity.py tests/unit_tests/test_memory_session_hooks.py
