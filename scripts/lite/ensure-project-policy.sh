#!/usr/bin/env bash
# Seed Forgewright's execution policy into a project without overwriting local policy.

set -euo pipefail

if [[ $# -ne 2 ]]; then
    echo "usage: $0 <forgewright-root> <project-root>" >&2
    exit 64
fi

source_root="$(cd "$1" && pwd -P)"
project_root="$(cd "$2" && pwd -P)"
source_policy="${source_root}/.forgewright/execution-policy.yaml"
target_dir="${project_root}/.forgewright"
target_policy="${target_dir}/execution-policy.yaml"
temporary_policy=""

# Invoked indirectly by the signal/exit trap below.
# shellcheck disable=SC2329
cleanup() {
    if [[ -n "$temporary_policy" ]]; then
        rm -f -- "$temporary_policy"
    fi
}
trap cleanup EXIT HUP INT TERM

if [[ ! -s "$source_policy" ]]; then
    echo "error: canonical execution policy is missing or empty: $source_policy" >&2
    exit 66
fi

mkdir -p -- "$target_dir"

# Preserve both regular files and symlinks, including broken symlinks.
if [[ -f "$target_policy" || -L "$target_policy" ]]; then
    echo "preserved:$target_policy"
    exit 0
fi
if [[ -e "$target_policy" ]]; then
    echo "error: execution-policy path exists but is not a file or symlink: $target_policy" >&2
    exit 65
fi

# The temporary file lives beside the destination so hard-link publication is
# same-filesystem and atomic. The hard link fails instead of replacing a winner.
temporary_policy="$(mktemp "${target_dir}/.execution-policy.yaml.XXXXXX")"
cp -- "$source_policy" "$temporary_policy"
chmod 0644 "$temporary_policy"

if ln -- "$temporary_policy" "$target_policy" 2>/dev/null; then
    echo "created:$target_policy"
    exit 0
fi

# A concurrent installer may have won after the initial existence check.
if [[ -f "$target_policy" || -L "$target_policy" ]]; then
    echo "preserved:$target_policy"
    exit 0
fi

echo "error: could not publish execution policy: $target_policy" >&2
exit 73
