#!/bin/sh
# husky.sh — Husky Git hooks helper
# Sourced by all hook scripts to ensure consistent shell environment

# Resolve to the .husky root directory
husky_dir="$(dirname "$(dirname "$0")")"
hook_dir="$husky_dir/_"

# Load .huskyrc if it exists
if [ -f "$hook_dir/.huskyrc" ]; then
    . "$hook_dir/.huskyrc"
fi
