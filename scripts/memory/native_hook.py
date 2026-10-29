#!/usr/bin/env python3
"""Optional Codex SessionStart/Stop adapter for structured local memory.

No transcript ingestion, model call, implicit migration or hook-trust changes.
Host delivery must be verified separately from direct invocation of this file.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

MAX_INPUT_BYTES = 256 * 1024
MAX_OUTPUT_BYTES = 8192
CONTEXT_CHARS = 2000
CHILD_TIMEOUT = 1.5
ALLOW = {"continue": True}
# The selected summary may precede strict VERIFY and a terminal citation
# appendix. Only this unique fenced JSON value is captured, never its suffix.
SUMMARY = re.compile(r"(?m)^```forgewright-memory\r?\n(.*?)\r?\n```[ \t]*\r?$", re.S)


def handle(payload, workspace):
    """Treat native fields as data; an unavailable optional adapter allows work."""
    try:
        if any(
            os.environ.get(key, "").lower() in {"1", "true", "yes"}
            for key in ("MEM0_DISABLED", "FORGEWRIGHT_SKIP_MEM0")
        ):
            return ALLOW.copy()
        if not isinstance(payload, dict):
            return ALLOW.copy()
        workspace = Path(workspace).resolve(strict=True)
        native_cwd = payload.get("cwd")
        if (
            not workspace.is_dir()
            or not isinstance(native_cwd, str)
            or not native_cwd
            or Path(native_cwd).resolve(strict=True) != workspace
        ):
            return ALLOW.copy()
        session = payload.get("session_id")
        if not isinstance(session, str) or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", session
        ):
            return ALLOW.copy()
        event = payload.get("hook_event_name")
        environment = {
            **{
                key: value
                for key, value in os.environ.items()
                if key
                not in {
                    "MEM0_DB_PATH",
                    "MEM0_PROJECT_ID",
                    "MEMORY_DB_DIR",
                    "FORGEWRIGHT_CONTINUITY_ROOT",
                }
            },
            "FORGEWRIGHT_WORKSPACE": str(workspace),
            "FORGEWRIGHT_SESSION": session,
            "FORGEWRIGHT_SESSION_ID": session,
        }
        command = [sys.executable, str(Path(__file__).with_name("memory_flow.py"))]
        summary = None
        if event == "SessionStart":
            query = os.environ.get("FORGEWRIGHT_MEMORY_QUERY", "").strip()
            if not query or len(query) > 1024:
                return ALLOW.copy()
            command += [
                "context",
                query,
                "--session",
                session,
                "--char-cap",
                str(CONTEXT_CHARS),
                "--json",
            ]
        elif event == "Stop":
            if os.environ.get("FORGEWRIGHT_MEMORY_CAPTURE", "").lower() not in {
                "1",
                "true",
                "yes",
            } or payload.get("stop_hook_active"):
                return ALLOW.copy()
            turn = payload.get("turn_id")
            message = payload.get("last_assistant_message")
            if (
                not isinstance(turn, str)
                or not turn
                or len(turn) > 128
                or not isinstance(message, str)
            ):
                return ALLOW.copy()
            if message.count("```forgewright-memory") != 1:
                return ALLOW.copy()
            match = SUMMARY.search(message)
            if not match:
                return ALLOW.copy()
            summary = json.loads(match[1])
            event_id = "codex-stop-" + hashlib.sha256(turn.encode()).hexdigest()[:32]
            command += ["capture", "--session", session, "--event", event_id]
        else:
            return ALLOW.copy()
        result = subprocess.run(
            command,
            cwd=workspace,
            env=environment,
            input=json.dumps(summary) if summary is not None else None,
            capture_output=True,
            text=True,
            timeout=CHILD_TIMEOUT,
        )
        if result.returncode or len(result.stdout.encode()) > 32 * 1024:
            return ALLOW.copy()
        data = json.loads(result.stdout)
        response = ALLOW.copy()
        if event == "SessionStart":
            context = data.get("context", "")
            if (
                data.get("status") == "retrieved"
                and isinstance(context, str)
                and len(context) <= CONTEXT_CHARS
            ):
                response["hookSpecificOutput"] = {
                    "hookEventName": event,
                    "additionalContext": context,
                }
        elif data.get("status") in {"captured", "duplicate"}:
            response["systemMessage"] = (
                f"Forgewright memory: {data['status']} (mem0:{int(data['observation_id'])})."
            )
        if (
            len((json.dumps(response, ensure_ascii=False) + "\n").encode())
            > MAX_OUTPUT_BYTES
        ):
            return ALLOW.copy()
        return response
    except (OSError, ValueError, TypeError, RuntimeError, subprocess.TimeoutExpired):
        return ALLOW.copy()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    args = parser.parse_args()
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        response = (
            handle(json.loads(raw), args.workspace)
            if len(raw) <= MAX_INPUT_BYTES
            else ALLOW.copy()
        )
    except (OSError, ValueError):
        response = ALLOW.copy()
    print(json.dumps(response, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
