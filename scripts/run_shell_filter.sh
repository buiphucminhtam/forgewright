#!/usr/bin/env bash
# run_shell_filter — RTK delegation wrapper for shell output filtering
#
# Usage:
#   source run_shell_filter.sh        # Source for use in scripts
#   echo "output" | bash run_shell_filter.sh [cmd] [args...]  # Pipe mode
#
# Priority: rtk > chop > snip > ctx > tkill > forgewright-shell-filter
#
# This script reads settings from .forgewright/settings.env if available,
# otherwise auto-detects available compressors.

# ── Detection ────────────────────────────────────────────────────────────────

detect_compressor() {
    # Check SHELL_COMPRESSOR env var first
    if [[ -n "${SHELL_COMPRESSOR:-}" ]]; then
        echo "$SHELL_COMPRESSOR"
        return
    fi

    # Check settings.env if exists
    local settings_file="${FORGEWRIGHT_DIR:-.}/.forgewright/settings.env"
    if [[ -f "$settings_file" ]]; then
        # shellcheck source=/dev/null
        source "$settings_file" 2>/dev/null || true
        if [[ -n "${SHELL_COMPRESSOR:-}" ]]; then
            echo "$SHELL_COMPRESSOR"
            return
        fi
    fi

    # Auto-detect (priority order)
    if command -v rtk &>/dev/null; then
        echo "rtk"
    elif command -v chop &>/dev/null; then
        echo "chop"
    elif command -v snip &>/dev/null; then
        echo "snip"
    elif command -v ctx &>/dev/null; then
        echo "ctx"
    elif command -v tkill &>/dev/null; then
        echo "tkill"
    else
        echo "forgewright-shell-filter"
    fi
}

# ── Run shell filter ───────────────────────────────────────────────────────

run_shell_filter() {
    local compressor
    compressor=$(detect_compressor)

    case "$compressor" in
        rtk)
            if [[ $# -eq 0 ]]; then
                rtk
            else
                rtk "$@"
            fi
            ;;
        chop)
            if [[ $# -eq 0 ]]; then
                chop run
            else
                chop run -- "$@"
            fi
            ;;
        snip)
            if [[ $# -eq 0 ]]; then
                snip exec
            else
                snip exec -- "$@"
            fi
            ;;
        ctx)
            if [[ $# -eq 0 ]]; then
                ctx
            else
                ctx "$@"
            fi
            ;;
        tkill)
            if [[ $# -eq 0 ]]; then
                tkill
            else
                tkill "$@"
            fi
            ;;
        forgewright-shell-filter|*)
            local filter_path="${FORGEWRIGHT_DIR:-.}/scripts/forgewright-shell-filter.sh"
            if [[ -f "$filter_path" ]]; then
                if [[ $# -eq 0 ]]; then
                    bash "$filter_path"
                else
                    bash "$filter_path" "$@"
                fi
            else
                # Fallback: no-op, just cat
                cat
            fi
            ;;
    esac
}

# ── CLI mode ───────────────────────────────────────────────────────────────

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Executed directly (not sourced)
    if [[ $# -eq 0 ]]; then
        # Pipe mode: read from stdin, apply filter
        run_shell_filter
    else
        # Pass through mode: run command, filter output
        "$@"
    fi
else
    # Sourced: export function
    export -f run_shell_filter
    export -f detect_compressor
fi
