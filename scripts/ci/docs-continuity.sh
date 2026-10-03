#!/usr/bin/env bash
# Shared aggregate selection. The caller supplies its existing CLI argv prefix.
run_docs_continuity() {
  local base_ref="${FORGEWRIGHT_DOCS_BASE_REF:-}"
  if [[ -z "$base_ref" ]] \
    && git rev-parse --verify --quiet origin/main >/dev/null \
    && ! git diff --quiet origin/main...HEAD; then
    base_ref="origin/main"
  fi

  if [[ -n "$base_ref" ]]; then
    "$@" docs gate . --base-ref "$base_ref" --json
  else
    "$@" docs gate . --worktree --json
  fi
}
