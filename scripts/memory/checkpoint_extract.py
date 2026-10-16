"""Read-only checkpoint metadata; all repository/user strings remain data."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import uuid

from memory_common import continuity, project_id, redact, runtime_root, workspace_root


def git(workspace, *args):
    result = subprocess.run(
        ["git", *args], cwd=workspace, capture_output=True, timeout=5
    )
    return result.stdout.decode("utf-8", "replace") if result.returncode == 0 else ""


def extract(reason, session=""):
    if session:
        continuity._validate_id("session", session)
    workspace = workspace_root()
    changed = set()
    for args in (
        ("diff", "--cached", "--name-only", "-z"),
        ("diff", "--name-only", "-z"),
        ("ls-files", "--others", "--exclude-standard", "-z"),
    ):
        changed.update(path for path in git(workspace, *args).split("\0") if path)
    counts = dict.fromkeys(
        ("skills", "scripts", "docs", "configs", "tests", "other"), 0
    )
    for path in changed:
        category = (
            "skills"
            if path.startswith("skills/")
            else "scripts"
            if path.startswith("scripts/")
            else "docs"
            if path.startswith("docs/") or path.endswith(".md")
            else "configs"
            if path.endswith((".json", ".yaml", ".yml"))
            else "tests"
            if "test" in path or "spec" in path
            else "other"
        )
        counts[category] += 1
    state_root = runtime_root() / "sessions" / session if session else runtime_root()
    log_path = Path(
        os.environ.get("FORGEWRIGHT_SESSION_LOG", state_root / "session-log.json")
    )
    selected = None
    if log_path.is_file() and log_path.stat().st_size <= 2 * 1024 * 1024:
        try:
            rows = json.loads(log_path.read_text()).get("sessions", [])
            visible = [
                row
                for row in rows
                if isinstance(row, dict)
                and row.get("project_id") == project_id()
                and (
                    row.get("session_id") == session
                    if session
                    else row.get("scope") == "project"
                )
            ]
            selected = visible[-1] if visible else None
        except (ValueError, OSError):
            pass
    return redact(
        {
            "checkpoint_id": "cp-" + uuid.uuid4().hex,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "session_mode": (selected or {}).get("mode", "unknown"),
            "reason": reason,
            "intent": "modified" if changed else "no staged changes",
            "intent_detail": "Observed file metadata; not a verified semantic decision",
            "file_counts": counts,
            "total_files_changed": len(changed),
            "files": sorted(changed)[:10],
            "diff_stats": git(workspace, "diff", "--stat")[-2000:],
            "recent_commits": git(workspace, "log", "--oneline", "-5")[:2000],
            "session_summary": (selected or {}).get("summary", "") or "",
            "workspace": str(workspace),
        }
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reason", default="manual")
    parser.add_argument(
        "--session",
        default=os.environ.get(
            "FORGEWRIGHT_SESSION", os.environ.get("FORGEWRIGHT_SESSION_ID", "")
        ),
    )
    args = parser.parse_args()
    print(json.dumps(extract(args.reason, args.session), ensure_ascii=False, indent=2))
