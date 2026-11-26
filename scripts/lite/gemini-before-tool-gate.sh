#!/usr/bin/env bash
# Gemini BeforeTool hook: adapt the native JSON payload to Forgewright policy.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MAX_PAYLOAD_BYTES=1048576
PYTHON_COMMAND=()
for _cand in "${FORGEWRIGHT_PYTHON_BIN:-}" python3 python python3.13 python3.12 python3.11; do
  [[ -n "$_cand" ]] || continue
  _exe="$(command -v "$_cand" 2>/dev/null || true)"
  if [[ -n "$_exe" ]]; then
    PYTHON_COMMAND=("$_exe")
    break
  fi
done
if [[ ${#PYTHON_COMMAND[@]} -eq 0 ]]; then
  _py="$(command -v py.exe 2>/dev/null || command -v py 2>/dev/null || true)"
  [[ -n "$_py" ]] && PYTHON_COMMAND=("$_py" "-3")
fi
[[ ${#PYTHON_COMMAND[@]} -gt 0 ]] || exit 2
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/forgewright-before-tool.XXXXXX")" || exit 2
PAYLOAD_FILE="${TEMP_ROOT}/payload.json"
TOOL_FILE="${TEMP_ROOT}/tool-name"
ARGS_FILE="${TEMP_ROOT}/tool-args"
WORKSPACE_FILE="${TEMP_ROOT}/workspace"
cleanup() {
  rm -f "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE" "$WORKSPACE_FILE"
  rmdir "$TEMP_ROOT" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 2' HUP INT TERM

touch "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE" "$WORKSPACE_FILE" || exit 2
chmod 700 "$TEMP_ROOT" 2>/dev/null || true
chmod 600 "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE" "$WORKSPACE_FILE" 2>/dev/null || true

deny() {
  echo "Forgewright policy denied this tool call." >&2
  exit 2
}

"${PYTHON_COMMAND[@]}" -c 'import sys; path=sys.argv[1]; limit=int(sys.argv[2]); data=sys.stdin.buffer.read(limit + 1); open(path, "wb").write(data)' \
  "$PAYLOAD_FILE" "$MAX_PAYLOAD_BYTES" || deny
PAYLOAD_SIZE="$(wc -c < "$PAYLOAD_FILE" | tr -d ' ')"
[[ "$PAYLOAD_SIZE" -le "$MAX_PAYLOAD_BYTES" ]] || deny

"${PYTHON_COMMAND[@]}" - "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE" "$WORKSPACE_FILE" "$FRAMEWORK_ROOT" <<'PYEOF' || deny
import json
import os
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if not isinstance(payload, dict):
    raise ValueError("payload must be an object")
tool_name = payload.get("tool_name")
tool_input = payload.get("tool_input")
if not isinstance(tool_name, str) or not tool_name.strip():
    raise ValueError("tool_name is required")
if not isinstance(tool_input, dict):
    raise ValueError("tool_input must be an object")

payload_cwd = payload.get("cwd")
framework_root = sys.argv[5] if len(sys.argv) > 5 else None
candidate_paths = [
    payload_cwd,
    os.getcwd(),
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
        if os.path.lexists(os.path.join(resolved, ".forgewright", "execution-policy.yaml")):
            workspaces.append(resolved)
            break
        parent = os.path.dirname(resolved)
        if parent == resolved:
            break
        resolved = parent
if not workspaces and isinstance(framework_root, str) and framework_root.strip():
    resolved_fw = os.path.realpath(framework_root)
    if os.path.isdir(resolved_fw) and os.path.lexists(
        os.path.join(resolved_fw, ".forgewright", "execution-policy.yaml")
    ):
        workspaces.append(resolved_fw)
workspace = workspaces[0] if workspaces else None
if workspace is None:
    raise ValueError("no workspace contains a Forgewright execution policy")

args = None
for key in ("command", "cmd"):
    candidate = tool_input.get(key)
    if isinstance(candidate, str):
        args = candidate
        break
if args is None:
    args = json.dumps(tool_input, ensure_ascii=True, separators=(",", ":"), sort_keys=True)

Path(sys.argv[2]).write_text(tool_name.strip(), encoding="utf-8")
Path(sys.argv[3]).write_text(args, encoding="utf-8")
Path(sys.argv[4]).write_text(workspace, encoding="utf-8")
PYEOF

TOOL_NAME="$(cat "$TOOL_FILE")"
TOOL_ARGS="$(cat "$ARGS_FILE")"
WORKSPACE="$(cat "$WORKSPACE_FILE")"
FORGEWRIGHT_WORKSPACE="$WORKSPACE" bash "${SCRIPT_DIR}/policy-check.sh" \
  check "$TOOL_NAME" "$TOOL_ARGS" >/dev/null 2>/dev/null
POLICY_RC=$?

case "$POLICY_RC" in
  0|2)
    printf '{}\n'
    exit 0
    ;;
  *)
    deny
    ;;
esac
