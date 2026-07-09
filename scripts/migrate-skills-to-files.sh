#!/usr/bin/env bash
# THIS_FILE_IS_A_MIGRATION_SHIM
echo "WARNING: migrate-skills-to-files.sh has been moved to skills/migrate-skills-to-files.sh. This shim will be removed in the next release." >&2
if [ -n "${BASH_SOURCE[0]:-}" ]; then
    _SHIM_SOURCE="${BASH_SOURCE[0]}"
elif [ -n "${ZSH_VERSION:-}" ]; then
    _SHIM_SOURCE="${(%):-%N}"
else
    _SHIM_SOURCE="$0"
fi
DIR="$( cd "$( dirname "$_SHIM_SOURCE" )" && pwd )"
if [[ "$_SHIM_SOURCE" != "${0}" ]]; then
    source "$DIR/skills/migrate-skills-to-files.sh" "$@"
else
    exec "$DIR/skills/migrate-skills-to-files.sh" "$@"
fi
