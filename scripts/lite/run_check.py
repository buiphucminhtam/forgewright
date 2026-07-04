#!/usr/bin/env python3
"""
scripts/lite/run_check.py
Atomic evidence writer — called by run-check.sh.

Usage (internal):
    python3 run_check.py --turn ID --out DIR --redact 1|0 -- CMD [ARGS...]

Writes: <out>/<turn>.json  (schema_version "1")
Always exits 0.  Callers inspect exit_code inside the JSON.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from datetime import datetime, timezone


# ── secret patterns for in-memory redaction ───────────────────────────────────
_SECRET_PATTERNS = [
    (re.compile(r"sk-[a-zA-Z0-9]{20,}"),          "sk-[REDACTED]"),
    (re.compile(r"ghp_[a-zA-Z0-9]{20,}"),         "ghp_[REDACTED]"),
    (re.compile(r"AKIA[A-Z0-9]{16}"),              "AKIA[REDACTED]"),
    (re.compile(r"xoxb-[0-9A-Za-z\-]{20,}"),      "xoxb-[REDACTED]"),
    (re.compile(
        r"-----BEGIN(?:\s+[A-Z]+)?\s+PRIVATE KEY-----[\s\S]+?"
        r"-----END(?:\s+[A-Z]+)?\s+PRIVATE KEY-----"
    ), "-----BEGIN PRIVATE KEY-----\n[REDACTED]\n-----END PRIVATE KEY-----"),
]

_OUTPUT_MAX = 16_384  # 16 KB


def _redact(text: str) -> str:
    """Redact secrets from an in-memory string copy. Source is never touched."""
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _tree_sha(workspace: Path) -> str:
    """Return a stable tree fingerprint without mutating any file."""
    try:
        subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=workspace, capture_output=True, timeout=5, check=True
        )
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        # Non-git: hash the directory listing
        try:
            listing = "\n".join(sorted(str(p) for p in workspace.iterdir()))
            import hashlib
            h = hashlib.sha256(listing.encode()).hexdigest()[:16]
        except Exception:
            h = "UNKNOWN"
        return f"NONGIT:{h}"

    # Inside git
    try:
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=workspace, capture_output=True, text=True, timeout=5
        ).stdout.strip() or "NOHEAD"

        dirty = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=workspace, capture_output=True, text=True, timeout=5
        ).stdout.strip()

        if dirty:
            idx = subprocess.run(
                ["git", "write-tree"],
                cwd=workspace, capture_output=True, text=True, timeout=5
            ).stdout.strip() or "NOIDX"
            return f"DIRTY:{head[:12]}:{idx[:12]}"
        return head
    except Exception:
        return "GITERR"


def _workspace() -> Path:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5
        )
        if r.returncode == 0:
            return Path(r.stdout.strip()).resolve()
    except Exception:
        pass
    return Path.cwd().resolve()


def main() -> None:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--turn",     default=None)
    parser.add_argument("--out",      default=None)
    parser.add_argument("--redact",   default="1")
    parser.add_argument("--help", "-h", action="store_true")
    parser.add_argument("cmd", nargs=argparse.REMAINDER)

    args = parser.parse_args()

    if args.help:
        print(__doc__)
        sys.exit(0)

    # Strip leading '--' separator
    cmd_argv = args.cmd
    if cmd_argv and cmd_argv[0] == "--":
        cmd_argv = cmd_argv[1:]

    if not cmd_argv:
        print("[run-check] ERROR: no command supplied.", file=sys.stderr)
        sys.exit(2)

    do_redact = args.redact not in ("0", "false", "no")
    workspace = _workspace()
    out_dir   = Path(args.out) if args.out else workspace / ".forgewright" / "verify"
    turn      = args.turn or (
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"_{os.getpid()}"
    )

    timestamp_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    tree_sha = _tree_sha(workspace)

    # ── run the command ────────────────────────────────────────────────────────
    try:
        proc = subprocess.run(
            cmd_argv,
            capture_output=True,
            text=True,
            cwd=str(workspace),
            timeout=300,
        )
        exit_code = proc.returncode
        raw_output = (proc.stdout or "") + (proc.stderr or "")
    except FileNotFoundError as e:
        exit_code = 127
        raw_output = f"[run-check] Command not found: {e}"
    except subprocess.TimeoutExpired:
        exit_code = 124
        raw_output = "[run-check] Command timed out after 300s"

    # ── in-memory redaction (source files NEVER mutated) ──────────────────────
    output = _redact(raw_output) if do_redact else raw_output
    output_truncated = False
    if len(output) > _OUTPUT_MAX:
        output = output[:_OUTPUT_MAX]
        output_truncated = True

    # ── write evidence atomically ──────────────────────────────────────────────
    out_dir.mkdir(parents=True, exist_ok=True)
    evidence_file = out_dir / f"{turn}.json"

    ev = {
        "schema_version":   "1",
        "turn":             turn,
        "command":          cmd_argv,
        "exit_code":        exit_code,
        "output":           output,
        "output_truncated": output_truncated,
        "timestamp_utc":    timestamp_utc,
        "workspace":        str(workspace),
        "tree_sha":         tree_sha,
    }

    # Atomic write: temp then rename
    fd, tmp_path = tempfile.mkstemp(
        prefix=".ev_", suffix=".json", dir=str(out_dir)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(ev, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, str(evidence_file))
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise

    print(
        f"[run-check] Evidence -> {evidence_file}  exit_code={exit_code}",
        file=sys.stderr,
    )
    # Always exit 0 — gate reads exit_code from JSON
    sys.exit(0)


if __name__ == "__main__":
    main()
