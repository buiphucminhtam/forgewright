#!/usr/bin/env bash
# Gemini BeforeTool hook: adapt the native JSON payload to Forgewright policy.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAX_PAYLOAD_BYTES=1048576
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/forgewright-before-tool.XXXXXX")" || exit 2
PAYLOAD_FILE="${TEMP_ROOT}/payload.json"
TOOL_FILE="${TEMP_ROOT}/tool-name"
ARGS_FILE="${TEMP_ROOT}/tool-args"
cleanup() {
  rm -f "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE"
  rmdir "$TEMP_ROOT" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 2' HUP INT TERM

touch "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE" || exit 2
chmod 700 "$TEMP_ROOT" 2>/dev/null || true
chmod 600 "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE" 2>/dev/null || true

deny() {
  echo "Forgewright policy denied this tool call." >&2
  exit 2
}

python3 -c 'import sys; path=sys.argv[1]; limit=int(sys.argv[2]); data=sys.stdin.buffer.read(limit + 1); open(path, "wb").write(data)' \
  "$PAYLOAD_FILE" "$MAX_PAYLOAD_BYTES" || deny
PAYLOAD_SIZE="$(wc -c < "$PAYLOAD_FILE" | tr -d ' ')"
[[ "$PAYLOAD_SIZE" -le "$MAX_PAYLOAD_BYTES" ]] || deny

python3 - "$PAYLOAD_FILE" "$TOOL_FILE" "$ARGS_FILE" <<'PYEOF' || deny
import json
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
PYEOF

TOOL_NAME="$(cat "$TOOL_FILE")"
TOOL_ARGS="$(cat "$ARGS_FILE")"
FORGEWRIGHT_WORKSPACE="$(pwd -P)" bash "${SCRIPT_DIR}/policy-check.sh" \
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
