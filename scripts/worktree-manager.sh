#!/usr/bin/env bash
# THIS_FILE_IS_A_MIGRATION_SHIM
echo "WARNING: worktree-manager.sh has been moved to runtime/worktree-manager.sh. This shim will be removed in the next release." >&2
if [ -n "${BASH_SOURCE[0]:-}" ]; then
    _SHIM_SOURCE="${BASH_SOURCE[0]}"
elif [ -n "${ZSH_VERSION:-}" ]; then
    _SHIM_SOURCE="${(%):-%N}"
else
    _SHIM_SOURCE="$0"
fi
DIR="$( cd "$( dirname "$_SHIM_SOURCE" )" && pwd )"
if [[ "$_SHIM_SOURCE" != "${0}" ]]; then
    source "$DIR/runtime/worktree-manager.sh" "$@"
else
    exec "$DIR/runtime/worktree-manager.sh" "$@"
fi
