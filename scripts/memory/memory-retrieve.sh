#!/usr/bin/env bash
# Compatibility entry: bounded, cited, project/session-scoped retrieval.
# Diagnostics go to stderr; stdout is only the context packet.

memory_retrieve_main() {
    if [[ "${MEM0_DISABLED:-}" =~ ^(true|1|yes)$ ]] || [[ "${FORGEWRIGHT_SKIP_MEM0:-}" =~ ^(true|1|yes)$ ]]; then
        return 0
    fi
    if [[ $# -lt 1 ]]; then
        echo 'Usage: memory-retrieve.sh "<request>"' >&2
        return 0
    fi
    if ! command -v python3 >/dev/null 2>&1; then
        echo 'Optional memory unavailable: Python 3 missing.' >&2
        return 0
    fi
    local memory_script_dir
    memory_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    python3 "${memory_script_dir}/memory_flow.py" context "$1"
}

memory_retrieve_main "$@"
