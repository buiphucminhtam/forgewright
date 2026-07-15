#!/usr/bin/env bash
# Antigravity CLI PreToolUse hook: adapt camelCase hook payloads to policy-check.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAX_PAYLOAD_BYTES=1048576
if ! TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/forgewright-antigravity-hook.XXXXXX")"; then
  printf '%s\n' '{"decision":"deny","reason":"Forgewright could not validate this tool call."}'
  exit 0
fi
PAYLOAD_FILE="${TEMP_ROOT}/payload.json"
TOOL_FILE="${TEMP_ROOT}/tool-name"
ARGS_FILE="${TEMP_ROOT}/tool-args"
WORKSPACE_FILE="${TEMP_ROOT}/workspace"

cleanup() {
  rm -f "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE" "$WORKSPACE_FILE"
  rmdir "$TEMP_ROOT" 2>/dev/null || true
}
trap cleanup EXIT
trap 'emit_deny; exit 0' HUP INT TERM

emit_decision() {
  python3 -c 'import json,sys; print(json.dumps({"decision":sys.argv[1],"reason":sys.argv[2]}, separators=(",", ":")))' "$1" "$2"
}
emit_deny() {
  emit_decision deny "Forgewright could not validate this tool call."
}

touch "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE" "$WORKSPACE_FILE" || {
  emit_deny
  exit 0
}
chmod 700 "$TEMP_ROOT" 2>/dev/null || true
chmod 600 "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE" "$WORKSPACE_FILE" 2>/dev/null || true

python3 -c 'import sys; path=sys.argv[1]; limit=int(sys.argv[2]); data=sys.stdin.buffer.read(limit + 1); open(path, "wb").write(data)' \
  "$PAYLOAD_FILE" "$MAX_PAYLOAD_BYTES" || {
    emit_deny
    exit 0
  }
PAYLOAD_SIZE="$(wc -c < "$PAYLOAD_FILE" | tr -d ' ')"
if [[ "$PAYLOAD_SIZE" -gt "$MAX_PAYLOAD_BYTES" ]]; then
  emit_deny
  exit 0
fi

if ! python3 - "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE" "$WORKSPACE_FILE" <<'PYEOF'
import json
import os
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if not isinstance(payload, dict):
    raise ValueError("payload must be an object")
tool_call = payload.get("toolCall")
workspace_paths = payload.get("workspacePaths")
if not isinstance(tool_call, dict):
    raise ValueError("toolCall is required")
tool_name = tool_call.get("name")
tool_args = tool_call.get("args")
if not isinstance(tool_name, str) or not tool_name.strip():
    raise ValueError("toolCall.name is required")
if not isinstance(tool_args, dict):
    raise ValueError("toolCall.args must be an object")
payload_cwd = payload.get("cwd")
candidate_paths = workspace_paths if isinstance(workspace_paths, list) else []
candidate_paths = [
    *candidate_paths,
    payload_cwd,
    os.environ.get("FORGEWRIGHT_WORKSPACE"),
]

workspaces = []
for candidate in candidate_paths:
    if not isinstance(candidate, str) or not candidate.strip():
        continue
    resolved = os.path.realpath(candidate)
    if not os.path.isdir(resolved):
        continue
    while True:
        if os.path.isfile(os.path.join(resolved, ".forgewright", "execution-policy.yaml")):
            workspaces.append(resolved)
            break
        parent = os.path.dirname(resolved)
        if parent == resolved:
            break
        resolved = parent
workspace = workspaces[0] if workspaces else None
if workspace is None:
    raise ValueError("no workspace contains a Forgewright execution policy")

args = next(
    (
        tool_args[key]
        for key in ("command", "cmd")
        if isinstance(tool_args.get(key), str)
    ),
    None,
)
if args is None:
    args = json.dumps(tool_args, ensure_ascii=True, separators=(",", ":"), sort_keys=True)

Path(sys.argv[2]).write_text(tool_name.strip(), encoding="utf-8")
Path(sys.argv[3]).write_text(args, encoding="utf-8")
Path(sys.argv[4]).write_text(workspace, encoding="utf-8")
PYEOF
then
  emit_deny
  exit 0
fi

TOOL_NAME="$(cat "$TOOL_FILE")"
TOOL_ARGS="$(cat "$ARGS_FILE")"
WORKSPACE="$(cat "$WORKSPACE_FILE")"
FORGEWRIGHT_WORKSPACE="$WORKSPACE" bash "${SCRIPT_DIR}/policy-check.sh" \
  check "$TOOL_NAME" "$TOOL_ARGS" >/dev/null 2>/dev/null
POLICY_RC=$?

case "$POLICY_RC" in
  0) emit_decision allow "Forgewright policy allowed this tool call." ;;
  2) emit_decision force_ask "Forgewright policy requires explicit permission." ;;
  *) emit_deny ;;
esac
exit 0
