#!/usr/bin/env python3
"""
Forgewright Memory Middleware
============================
Automatic memory checkpoint system for cross-IDE compatibility.
Works with Claude Code, Cursor, VS Code, JetBrains, etc.

Triggers:
  - Every N messages (configurable)
  - Token threshold reached
  - Before long operations
  - Manual trigger

Usage:
  python3 memory-middleware.py tick          # Increment message count
  python3 memory-middleware.py checkpoint   # Force save
  python3 memory-middleware.py resume       # Load context
  python3 memory-middleware.py status      # Show status
  python3 memory-middleware.py daemon      # Run as background daemon

Environment Variables:
  MEMORY_CHECKPOINT_INTERVAL: Messages between checkpoints (default: 3)
  MEMORY_TOKEN_THRESHOLD: Context % to trigger checkpoint (default: 70)
  MEMORY_DB_DIR: Session storage directory
"""

import argparse
import json
import os
import sys
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

#────────────────────────────────────────────────────────────────────────────
# Configuration
#────────────────────────────────────────────────────────────────────────────

HOME = Path.home()
MEMORY_DB_DIR = Path(os.environ.get("MEMORY_DB_DIR", f"{HOME}/.forgewright/sessions"))
SESSION_FILE = MEMORY_DB_DIR / "current-session.json"
SUMMARY_FILE = Path(".forgewright/subagent-context/CONVERSATION_SUMMARY.md")

CHECKPOINT_INTERVAL = int(os.environ.get("MEMORY_CHECKPOINT_INTERVAL", "3"))
TOKEN_THRESHOLD = int(os.environ.get("MEMORY_TOKEN_THRESHOLD", "70"))


#────────────────────────────────────────────────────────────────────────────
# Colors (for terminal output)
#────────────────────────────────────────────────────────────────────────────

class Colors:
    GREEN = "\033[0;32m"
    YELLOW = "\033[1;33m"
    RED = "\033[0;31m"
    BLUE = "\033[0;34m"
    NC = "\033[0m"


def log(msg: str, color: str = Colors.GREEN):
    print(f"{color}[memory-middleware]{Colors.NC} {msg}")


def warn(msg: str):
    print(f"{Colors.YELLOW}[memory-middleware]{Colors.NC} WARNING: {msg}", file=sys.stderr)


def error(msg: str):
    print(f"{Colors.RED}[memory-middleware]{Colors.NC} ERROR: {msg}", file=sys.stderr)


#────────────────────────────────────────────────────────────────────────────
# Session Management
#────────────────────────────────────────────────────────────────────────────

def get_project_name() -> str:
    """Get project name from git remote."""
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            name = result.stdout.strip().split("/")[-1]
            return name.replace(".git", "")
    except Exception:
        pass
    return "local-project"


def init_session() -> dict:
    """Initialize new session."""
    MEMORY_DB_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_FILE.parent.mkdir(parents=True, exist_ok=True)

    session = {
        "session_id": f"session-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
        "project": get_project_name(),
        "started_at": datetime.now(timezone.utc).isoformat() + "Z",
        "message_count": 0,
        "last_checkpoint_at": datetime.now(timezone.utc).isoformat() + "Z",
        "checkpoints": [],
    }

    with open(SESSION_FILE, "w") as f:
        json.dump(session, f, indent=2)

    log(f"Session started: {session['session_id']}")
    return session


def load_session() -> dict:
    """Load current session or create new one."""
    if SESSION_FILE.exists():
        with open(SESSION_FILE) as f:
            return json.load(f)
    return init_session()


def save_session(session: dict):
    """Save session to file."""
    with open(SESSION_FILE, "w") as f:
        json.dump(session, f, indent=2)


#────────────────────────────────────────────────────────────────────────────
# Memory Operations
#────────────────────────────────────────────────────────────────────────────

def save_to_mem0(summary: str, checkpoint_id: str):
    """Save checkpoint to mem0-v2."""
    try:
        script_dir = Path(__file__).parent
        cmd = [
            "python3",
            str(script_dir / "mem0-v2.py"),
            "add",
            f"CHECKPOINT: [{checkpoint_id}] | {summary}",
            "--category", "session"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            warn(f"mem0 save failed: {result.stderr[:100]}")
    except Exception as e:
        warn(f"Could not save to mem0: {e}")


def append_to_summary(checkpoint_id: str, reason: str, summary: str):
    """Append to conversation summary file."""
    if not SUMMARY_FILE.exists():
        SUMMARY_FILE.parent.mkdir(parents=True, exist_ok=True)
        SUMMARY_FILE.write_text("# Conversation Summary\n\n## Session Log\n\n")
        SUMMARY_FILE.write_text("| Timestamp | Checkpoint | Reason | Summary |\n")
        SUMMARY_FILE.write_text("|-----------|------------|--------|---------|\n")

    timestamp = datetime.now(timezone.utc).isoformat() + "Z"
    with open(SUMMARY_FILE, "a") as f:
        f.write(f"| {timestamp} | {checkpoint_id} | {reason} | {summary} |\n")


def update_memory_bank_progress(summary: str):
    """Update Memory Bank progress.md at checkpoint (NEW v8.0)."""
    progress_file = Path(".forgewright/memory-bank/progress.md")
    
    if not progress_file.exists():
        return
    
    try:
        content = progress_file.read_text()
        
        # Update last_updated in header
        today = datetime.now().strftime("%Y-%m-%d")
        if "Last Updated:" in content:
            import re
            content = re.sub(
                r"Last Updated: \d{4}-\d{2}-\d{2}",
                f"Last Updated: {today}",
                content
            )
        
        progress_file.write_text(content)
        log(f"Memory Bank progress.md updated")
    except Exception as e:
        warn(f"Could not update Memory Bank: {e}")


def generate_summary(reason: str) -> str:
    """Generate checkpoint summary from git status."""
    try:
        result = subprocess.run(
            ["git", "status", "--short"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            files = result.stdout.strip().split("\n")[:5]
            file_list = " ".join(f.split()[1] if len(f.split()) > 1 else f for f in files)
            return f"files_changed:{file_list}"
    except Exception:
        pass
    return reason


#────────────────────────────────────────────────────────────────────────────
# Checkpoint Operations
#────────────────────────────────────────────────────────────────────────────

def do_checkpoint(reason: str = "manual"):
    """Create memory checkpoint."""
    session = load_session()
    checkpoint_id = f"cp-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"

    # Generate summary
    summary = generate_summary(reason)

    # Save to mem0
    save_to_mem0(summary, checkpoint_id)

    # Update Memory Bank (NEW v8.0)
    update_memory_bank_progress(summary)

    # Update session
    session["message_count"] = 0
    session["last_checkpoint_at"] = datetime.now(timezone.utc).isoformat() + "Z"
    session["checkpoints"].append({
        "id": checkpoint_id,
        "reason": reason,
        "at": datetime.now(timezone.utc).isoformat() + "Z",
        "summary": summary,
    })
    save_session(session)

    # Update summary file
    append_to_summary(checkpoint_id, reason, summary)

    log(f"Checkpoint created: {checkpoint_id} (reason: {reason})")
    return checkpoint_id


def increment_message():
    """Increment message counter, trigger checkpoint if needed."""
    session = load_session()
    session["message_count"] = session.get("message_count", 0) + 1
    save_session(session)

    msg_count = session["message_count"]

    # Check interval trigger
    if msg_count % CHECKPOINT_INTERVAL == 0:
        do_checkpoint(f"interval:{CHECKPOINT_INTERVAL}")
    else:
        log(f"Message count: {msg_count} (next checkpoint in {CHECKPOINT_INTERVAL - (msg_count % CHECKPOINT_INTERVAL)})")


#────────────────────────────────────────────────────────────────────────────
# Commands
#────────────────────────────────────────────────────────────────────────────

def cmd_start():
    """Initialize session tracking."""
    init_session()
    log("Memory middleware ready")
    log(f"Checkpoint interval: every {CHECKPOINT_INTERVAL} messages")


def cmd_tick():
    """Called after each user message (hook)."""
    increment_message()


def cmd_checkpoint():
    """Force checkpoint."""
    do_checkpoint("manual")


def cmd_status():
    """Show session status."""
    if not SESSION_FILE.exists():
        print("No active session. Run 'start' to initialize.")
        return

    session = load_session()
    print(f"=== Memory Session Status ===")
    print(f"Session ID: {session['session_id']}")
    print(f"Project: {session['project']}")
    print(f"Started: {session['started_at']}")
    print(f"Messages since checkpoint: {session['message_count']}")
    print(f"Last checkpoint: {session['last_checkpoint_at']}")
    print(f"Total checkpoints: {len(session['checkpoints'])}")
    print(f"Checkpoint interval: every {CHECKPOINT_INTERVAL} messages")


def cmd_resume():
    """Resume session - load context."""
    log("Resuming session...")

    session = load_session()
    print(f"\nSession: {session['session_id']}")
    print(f"Project: {session['project']}")

    # Load summary file
    if SUMMARY_FILE.exists():
        print(f"\n=== Conversation Summary (last 10) ===")
        lines = SUMMARY_FILE.read_text().strip().split("\n")
        for line in lines[-10:]:
            print(line)

    # Search mem0 for recent
    try:
        script_dir = Path(__file__).parent
        result = subprocess.run(
            ["python3", str(script_dir / "mem0-v2.py"), "list", "--category", "session", "--limit", "5"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            print(f"\n=== Recent Memories ===")
            print(result.stdout)
    except Exception as e:
        warn(f"Could not load mem0 memories: {e}")


#────────────────────────────────────────────────────────────────────────────
# Main
#────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Forgewright Memory Middleware")
    parser.add_argument("command", nargs="?", default="status",
                        choices=["start", "tick", "checkpoint", "status", "resume", "daemon"])
    args = parser.parse_args()

    if args.command == "daemon":
        error("Daemon mode not yet implemented - use cron/systemd")
        sys.exit(1)

    commands = {
        "start": cmd_start,
        "tick": cmd_tick,
        "checkpoint": cmd_checkpoint,
        "status": cmd_status,
        "resume": cmd_resume,
    }

    commands[args.command]()


if __name__ == "__main__":
    main()
