#!/usr/bin/env bash
#────────────────────────────────────────────────────────────────────────────
# Forgewright Memory Session Manager
#────────────────────────────────────────────────────────────────────────────
# Purpose: Automatic memory checkpoint system that works across all AI IDEs
# Triggers: Every N messages OR at token threshold
#
# Usage:
#   memory-session.sh start              # Start session tracking
#   memory-session.sh checkpoint         # Force checkpoint
#   memory-session.sh status            # Show session status
#   memory-session.sh resume            # Resume from last checkpoint
#
# Environment:
#   MEMORY_CHECKPOINT_INTERVAL=3        # Checkpoint every N messages
#   MEMORY_TOKEN_THRESHOLD=70          # Checkpoint at N% context
#────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${MEM0_DISABLED:-}" =~ ^(true|1|yes)$ ]] || [[ "${FORGEWRIGHT_SKIP_MEM0:-}" =~ ^(true|1|yes)$ ]]; then
    if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 0; else exit 0; fi
fi
MEMORY_WORKSPACE="${FORGEWRIGHT_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
MEMORY_WORKSPACE="$(cd "${MEMORY_WORKSPACE}" && pwd -P)"
MEMORY_DB_DIR="${MEMORY_DB_DIR:-${MEMORY_WORKSPACE}/.forgewright/runtime/memory}"
MEMORY_SESSION_ID="${FORGEWRIGHT_SESSION:-${FORGEWRIGHT_SESSION_ID:-}}"
if [[ -n "${MEMORY_SESSION_ID}" ]]; then
    if [[ ! "$MEMORY_SESSION_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$ ]]; then
        echo "Invalid memory session identity" >&2
        if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 1; else exit 1; fi
    fi
    if [[ "$(printf '%s' "$MEMORY_SESSION_ID" | python3 "${SCRIPT_DIR}/memory_redaction.py")" != "$MEMORY_SESSION_ID" ]]; then
        echo "Unsafe memory session identity" >&2
        if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 1; else exit 1; fi
    fi
    MEMORY_DB_DIR="${MEMORY_DB_DIR}/sessions/${MEMORY_SESSION_ID}"
fi
SESSION_FILE="${MEMORY_DB_DIR}/current-session.json"
SUMMARY_FILE="${MEMORY_DB_DIR}/CONVERSATION_SUMMARY.md"

# Defaults
CHECKPOINT_INTERVAL="${MEMORY_CHECKPOINT_INTERVAL:-0}"
TOKEN_THRESHOLD="${MEMORY_TOKEN_THRESHOLD:-70}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

redact_text() { python3 "${SCRIPT_DIR}/memory_redaction.py"; }
log() { printf '%b%s\n' "${GREEN}[memory-session]${NC} " "$1" | redact_text; }
warn() { printf '%b%s\n' "${YELLOW}[memory-session]${NC} WARNING: " "$1" | redact_text >&2; }
error() { printf '%b%s\n' "${RED}[memory-session]${NC} ERROR: " "$1" | redact_text >&2; }

#────────────────────────────────────────────────────────────────────────────
# Session State
#────────────────────────────────────────────────────────────────────────────

init_session() {
    mkdir -p "${MEMORY_DB_DIR}"
    mkdir -p "$(dirname "${SUMMARY_FILE}")" 2>/dev/null || true

    local session_id="${MEMORY_SESSION_ID:-session-$(python3 -c 'import uuid; print(uuid.uuid4().hex)')}"
    local project_name
    project_name=$(git -C "${MEMORY_WORKSPACE}" remote get-url origin 2>/dev/null) || project_name="local"
    project_name=$(basename "${project_name}" .git)

    local initial_json
    initial_json=$(python3 -c '
import json, sys
session_id, project, now = sys.argv[1:]
print(json.dumps({
    "session_id": session_id, "project": project, "started_at": now,
    "message_count": 0, "last_checkpoint_at": now, "checkpoints": [],
}, indent=2))
' "${session_id}" "${project_name}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")
    state_transaction "${1:-start}" "${initial_json}" >/dev/null

    log "Session started: ${session_id}"
    log "Project: ${project_name}"
    log "Checkpoint interval: every ${CHECKPOINT_INTERVAL} messages"
}

ensure_session() {
    if [[ ! -f "${SESSION_FILE}" ]]; then
        init_session initialize >&2
    fi
}

load_session() {
    ensure_session
    state_transaction read
}

state_transaction() {
    # The process owning the kernel lock also owns the complete state mutation.
    # No child writer can outlive a dead lock owner on Windows or POSIX.
    python3 -c '
import json, os, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, sys.argv.pop(1))
from memory_redaction import redact
target, operation, *args = sys.argv[1:]
target = Path(target)
with open(target.with_suffix(".lock"), "a+b") as lock:
    if os.name == "nt":
        import msvcrt
        def acquire():
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        def acquire():
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    deadline = time.monotonic() + 5
    while True:
        try:
            acquire()
            break
        except OSError:
            if time.monotonic() >= deadline:
                raise TimeoutError("memory session writer is busy")
            time.sleep(0.05)
    if operation == "start" or (operation == "initialize" and not target.exists()):
        data = json.loads(args[0])
    else:
        with target.open() as stream:
            data = json.load(stream)
    if not isinstance(data, dict):
        raise ValueError("memory session must be an object")
    count = data.get("message_count", 0)
    if type(count) is not int or count < 0:
        raise ValueError("memory session message_count must be a nonnegative integer")
    if not isinstance(data.get("checkpoints", []), list):
        raise ValueError("memory session checkpoints must be a list")
    data.setdefault("message_count", 0)
    data.setdefault("checkpoints", [])
    checkpoint = None
    if operation in ("tick", "checkpoint"):
        if operation == "tick":
            interval = int(args.pop(0))
            if interval <= 0:
                raise ValueError("memory checkpoint interval must be positive")
            count += 1
            data["message_count"] = count
        if operation == "checkpoint" or count % interval == 0:
            checkpoint_id, reason, now, summary = args
            checkpoint = {"id": checkpoint_id, "reason": reason, "at": now, "summary": summary}
            data["message_count"] = 0
            data["last_checkpoint_at"] = now
            data["checkpoints"].append(checkpoint)
    if operation != "read" and not (operation == "initialize" and target.exists()):
        fd, temporary = tempfile.mkstemp(prefix=".current-session-", dir=target.parent)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(redact(data), stream, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    if operation == "read":
        print(json.dumps(redact(data)))
    else:
        print(json.dumps(redact({"checkpoint": checkpoint, "checkpoint_message_count": count})))
' "${SCRIPT_DIR}" "${SESSION_FILE}" "$@"
}

#────────────────────────────────────────────────────────────────────────────
# Checkpoint Operations
#────────────────────────────────────────────────────────────────────────────

do_checkpoint() {
    local reason="${1:-manual}"

    ensure_session

    local checkpoint_id="cp-$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"

    # Generate checkpoint summary
    local summary
    summary=$(generate_checkpoint_summary "${reason}")

    local result message_count
    result=$(state_transaction checkpoint "${checkpoint_id}" "${reason}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${summary}")
    message_count=$(printf '%s\n' "${result}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["checkpoint_message_count"])')
    record_checkpoint "${checkpoint_id}" "${message_count}" "${reason}" "${summary}"
}

record_checkpoint() {
    local checkpoint_id="$1" message_count="$2" reason="$3" summary="$4"

    # The shell and redaction helper can keep local state without a full
    # framework install. Only the shared adapter can acknowledge SQLite capture.
    if [[ -f "${SCRIPT_DIR}/memory_flow.py" ]]; then
        local capture_session
        capture_session=$(load_session | python3 -c 'import json,sys; print(json.load(sys.stdin)["session_id"])')
        python3 -c 'import json,sys; print(json.dumps({"kind":"handoff","summary":sys.stdin.read()}))' <<< "$summary" |
            python3 "${SCRIPT_DIR}/memory_flow.py" capture --session "$capture_session" --event "$checkpoint_id" || return 1
    else
        warn "Local checkpoint only; full memory adapter unavailable."
    fi

    # Update conversation summary file
    append_to_summary "${checkpoint_id}" "${reason}" "${summary}"

    log "Checkpoint created: ${checkpoint_id} (reason: ${reason})"
}

generate_checkpoint_summary() {
    local reason="$1"
    # Generate a summary from recent git changes, file modifications
    local summary="checkpoint"
    local git_status
    git_status=$(git -C "${MEMORY_WORKSPACE}" status --short 2>/dev/null | head -5 | tr '\n' ' ' || echo "")

    if [[ -n "${git_status}" ]]; then
        printf '%s\n' "files_changed:${git_status}" | redact_text
    else
        printf '%s\n' "${reason}" | redact_text
    fi
}

append_to_summary() {
    local checkpoint_id="$1"
    local reason="$2"
    local summary="$3"

    mkdir -p "$(dirname "${SUMMARY_FILE}")" 2>/dev/null || true

    if [[ ! -f "${SUMMARY_FILE}" ]]; then
        cat > "${SUMMARY_FILE}" << EOF
# Conversation Summary

## Session Log

EOF
    fi

    printf '| %s | %s | %s | %s |\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${checkpoint_id}" "${reason}" "${summary}" | redact_text >> "${SUMMARY_FILE}"
}

#────────────────────────────────────────────────────────────────────────────
# Message Counter (called after each user message)
#────────────────────────────────────────────────────────────────────────────

increment_message() {
    if [[ "$CHECKPOINT_INTERVAL" == "0" ]]; then
        log "Tick observed; checkpoints require a material boundary."
        return 0
    fi
    ensure_session
    local reason="interval:${CHECKPOINT_INTERVAL}"
    local checkpoint_id="cp-$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
    local summary result message_count
    summary=$(generate_checkpoint_summary "${reason}")
    result=$(state_transaction tick "${CHECKPOINT_INTERVAL}" "${checkpoint_id}" "${reason}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${summary}")
    message_count=$(printf '%s\n' "${result}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["checkpoint_message_count"] if d["checkpoint"] else "")')
    if [[ -n "${message_count}" ]]; then
        record_checkpoint "${checkpoint_id}" "${message_count}" "${reason}" "${summary}"
    fi
}

#────────────────────────────────────────────────────────────────────────────
# Commands
#────────────────────────────────────────────────────────────────────────────

cmd_start() {
    init_session
    log "Memory session manager ready"
    log "Use 'memory-session.sh checkpoint' to force save"
}

cmd_checkpoint() {
    do_checkpoint "manual"
}

cmd_status() {
    if [[ ! -f "${SESSION_FILE}" ]]; then
        echo "No active session"
        return
    fi

    echo "=== Memory Session Status ==="
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("Session:", d["session_id"]); print("Messages since checkpoint:", d["message_count"]); print("Last checkpoint:", d["last_checkpoint_at"]); print("Total checkpoints:", len(d["checkpoints"]))' "${SESSION_FILE}" | redact_text
}

cmd_resume() {
    log "Resuming session..."
    load_session

    if [[ -f "${SUMMARY_FILE}" ]]; then
        log "Loaded conversation summary:"
        tail -10 "${SUMMARY_FILE}" | redact_text
    fi

    # Search recent memories
    if command -v python3 &>/dev/null; then
        echo ""
        log "Recent memories:"
        python3 "${SCRIPT_DIR}/mem0-v2.py" list --category session --limit 5 2>/dev/null || true
    fi
}

cmd_tick() {
    # Called by Claude Code hook after each message
    increment_message
}

#────────────────────────────────────────────────────────────────────────────
# Main
#────────────────────────────────────────────────────────────────────────────

main() {
    local cmd="${1:-status}"

    case "${cmd}" in
        start)
            cmd_start
            ;;
        checkpoint|cp)
            cmd_checkpoint
            ;;
        status)
            cmd_status
            ;;
        resume)
            cmd_resume
            ;;
        tick)
            cmd_tick
            ;;
        *)
            echo "Usage: $0 {start|checkpoint|status|resume|tick}"
            echo ""
            echo "Commands:"
            echo "  start       Initialize session tracking"
            echo "  checkpoint  Force save memory checkpoint"
            echo "  status      Show current session status"
            echo "  resume      Resume from last checkpoint"
            echo "  tick        Increment message count (call after each message)"
            exit 1
            ;;
    esac
}

main "$@"
