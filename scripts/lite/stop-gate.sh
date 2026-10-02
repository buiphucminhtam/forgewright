#!/usr/bin/env bash
# Bounded Stop-hook entry point. All validation and retry decisions are owned
# by stop_gate.py so a single Stop event can replay completion evidence at most
# once.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STOP_GATE_PY="${SCRIPT_DIR}/stop_gate.py"
POSIX_DEFERRAL=false
case "$(uname -s 2>/dev/null || true)" in
  Darwin|Linux) POSIX_DEFERRAL=true ;;
  MINGW*|MSYS*|CYGWIN*)
    if command -v cygpath >/dev/null 2>&1; then
      STOP_GATE_PY="$(cygpath -am "$STOP_GATE_PY")"
    fi
    ;;
esac
PLATFORM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="${2:-}"; shift 2 ;;
    --help|-h)
      echo "Usage: stop-gate.sh --platform CLAUDE|GEMINI|CURSOR|CODEX"
      exit 0
      ;;
    *) shift ;;
  esac
done

PLATFORM="$(printf '%s' "$PLATFORM" | tr '[:lower:]' '[:upper:]')"

PYTHON_COMMAND=()
if [[ -n "${FORGEWRIGHT_PYTHON_BIN:-}" && -x "${FORGEWRIGHT_PYTHON_BIN}" ]] &&
  "${FORGEWRIGHT_PYTHON_BIN}" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' >/dev/null 2>&1; then
  PYTHON_COMMAND=("${FORGEWRIGHT_PYTHON_BIN}")
fi

if [[ ${#PYTHON_COMMAND[@]} -eq 0 ]]; then
  for candidate in python3.13 python3.12 python3.11 python3 python; do
    python_executable="$(command -v "$candidate" 2>/dev/null || true)"
    if [[ -n "$python_executable" ]] &&
      "$python_executable" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' >/dev/null 2>&1; then
      PYTHON_COMMAND=("$python_executable")
      break
    fi
  done
fi

if [[ ${#PYTHON_COMMAND[@]} -eq 0 ]]; then
  python_launcher="$(command -v py.exe 2>/dev/null || command -v py 2>/dev/null || true)"
  if [[ -n "$python_launcher" ]]; then
    for selector in -3.13 -3.12 -3.11 -3; do
      if "$python_launcher" "$selector" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' >/dev/null 2>&1; then
        PYTHON_COMMAND=("$python_launcher" "$selector")
        break
      fi
    done
  fi
fi
if [[ ${#PYTHON_COMMAND[@]} -eq 0 ]]; then
  printf '%s\n' 'Forgewright Stop requires Python 3.11 or newer.' >&2
  exit 1
fi

# A project-local Codex gate is canonical. Parse only its actual active Stop
# registration, before requiring adjacent Python modules. The heredoc leaves
# the original hook payload on this shell's stdin for the validator below.
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
PROJECT_LITE_DIR="${PROJECT_ROOT:+${PROJECT_ROOT}/scripts/lite}"
PROJECT_CODEX_CONFIG="${PROJECT_ROOT}/.codex/config.toml"
if [[ "$POSIX_DEFERRAL" == true && "$PLATFORM" == "CODEX" && -n "$PROJECT_ROOT" &&
      ! "$SCRIPT_DIR" -ef "$PROJECT_LITE_DIR" &&
      -f "$PROJECT_LITE_DIR/stop-gate.sh" && ! -L "$PROJECT_LITE_DIR/stop-gate.sh" &&
      -f "$PROJECT_CODEX_CONFIG" ]] &&
  "${PYTHON_COMMAND[@]}" - "$PROJECT_CODEX_CONFIG" <<'PY'
import sys
import tomllib

legacy = "bash scripts/lite/stop-gate.sh --platform CODEX"
canonical = "bash -c 'root=\"$(git rev-parse --show-toplevel 2>/dev/null)\" || exit 1; cd \"$root\" || exit 1; exec bash scripts/lite/stop-gate.sh --platform CODEX'"
try:
    with open(sys.argv[1], "rb") as handle:
        config = tomllib.load(handle)
    if config.get("features", {}).get("hooks") is not True:
        raise SystemExit(1)
    groups = config.get("hooks", {}).get("Stop", [])
    if not isinstance(groups, list) or len(groups) != 1:
        raise SystemExit(1)
    group = groups[0]
    if not isinstance(group, dict) or set(group) - {"matcher", "hooks", "enabled"}:
        raise SystemExit(1)
    if group.get("enabled", True) is not True or group.get("matcher") != "*":
        raise SystemExit(1)
    hooks = group.get("hooks")
    if not isinstance(hooks, list) or len(hooks) != 1:
        raise SystemExit(1)
    hook = hooks[0]
    if not isinstance(hook, dict) or set(hook) - {"type", "command", "command_windows", "enabled"}:
        raise SystemExit(1)
    if hook.get("enabled", True) is not True or hook.get("type") != "command":
        raise SystemExit(1)
    if "command_windows" in hook and not isinstance(hook["command_windows"], str):
        raise SystemExit(1)
    command = hook.get("command")
    if isinstance(command, str) and command.strip(" \t\n") in (legacy, canonical):
        raise SystemExit(0)
except (OSError, ValueError, TypeError, AttributeError):
    pass
raise SystemExit(1)
PY
then
  printf '{"continue": true}\n'
  exit 0
fi

exec "${PYTHON_COMMAND[@]}" "$STOP_GATE_PY" --platform "$PLATFORM" --typed-stop-decision
