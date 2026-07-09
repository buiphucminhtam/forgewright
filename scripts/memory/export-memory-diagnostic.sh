#!/usr/bin/env bash
# export-memory-diagnostic.sh — Redacted Forgewright memory diagnostics
#
# Usage:
#   bash scripts/export-memory-diagnostic.sh <output-dir> [--include-raw]
#
# Safe default:
#   Raw offload refs are excluded unless --include-raw is passed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export FORGEWRIGHT_SCRIPT_DIR="$SCRIPT_DIR"

usage() {
    echo "Usage: bash scripts/export-memory-diagnostic.sh <output-dir> [--include-raw] [--workspace <path>]" >&2
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 1 ]]; then
    usage
    exit 2
fi

python3 - "$@" <<'PY'
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SECRET_KEY_RE = re.compile(
    r"(api[_-]?key|apikey|auth|bearer|credential|password|passwd|private[_-]?key|secret|token)",
    re.IGNORECASE,
)

SECRET_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"key-[a-zA-Z0-9]{20,}"),
    re.compile(r"Bearer\s+[a-zA-Z0-9\-._~+/]+=*"),
    re.compile(r"(?i)(password\s*[:=]\s*)['\"]?[^\s'\",}]{4,}"),
    re.compile(r"(?i)(secret\s*[:=]\s*)['\"]?[^\s'\",}]{4,}"),
    re.compile(r"(?i)(token\s*[:=]\s*)['\"]?[^\s'\",}]{8,}"),
    re.compile(r"(?i)(credential\s*[:=]\s*)['\"]?[^\s'\",}]{4,}"),
    re.compile(r"postgres://\S+:\S+@"),
    re.compile(r"mysql://\S+:\S+@"),
    re.compile(r"mongodb(?:\+srv)?://\S+:\S+@"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
]

TEXT_EXTENSIONS = {
    ".env",
    ".json",
    ".jsonl",
    ".log",
    ".md",
    ".mmd",
    ".txt",
    ".toml",
    ".yaml",
    ".yml",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def workspace_root(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    env_root = os.environ.get("FORGEWRIGHT_WORKSPACE")
    if env_root:
        return Path(env_root).resolve()
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0 and result.stdout.strip():
        return Path(result.stdout.strip()).resolve()
    return Path.cwd().resolve()


def redact_text(text: str) -> str:
    redacted = text
    for pattern in SECRET_PATTERNS:
        redacted = pattern.sub(lambda m: (m.group(1) if m.lastindex else "") + "[REDACTED]", redacted)
    return redacted


def redact_json(value: Any) -> Any:
    if isinstance(value, dict):
        output: dict[str, Any] = {}
        for key, item in value.items():
            if SECRET_KEY_RE.search(str(key)):
                output[key] = "[REDACTED]"
            else:
                output[key] = redact_json(item)
        return output
    if isinstance(value, list):
        return [redact_json(item) for item in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


def read_redacted(path: Path, max_bytes: int = 2_000_000) -> str:
    raw = path.read_bytes()[:max_bytes]
    text = raw.decode("utf-8", errors="replace")
    if path.stat().st_size > max_bytes:
        text += "\n...[truncated for diagnostic export]\n"
    if path.suffix in {".json"}:
        try:
            return json.dumps(redact_json(json.loads(text)), indent=2, default=str) + "\n"
        except json.JSONDecodeError:
            pass
    if path.suffix == ".jsonl":
        lines = []
        for line in text.splitlines():
            try:
                lines.append(json.dumps(redact_json(json.loads(line)), default=str))
            except json.JSONDecodeError:
                lines.append(redact_text(line))
        return "\n".join(lines) + ("\n" if lines else "")
    return redact_text(text)


def write_text(stage: Path, rel: str, content: str) -> None:
    target = stage / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def include_redacted_file(stage: Path, workspace: Path, source: Path, rel: str) -> bool:
    if not source.exists() or not source.is_file():
        return False
    if source.suffix.lower() not in TEXT_EXTENSIONS and source.name != ".env":
        return False
    try:
        write_text(stage, rel, read_redacted(source))
        return True
    except OSError:
        return False


def sqlite_stats(db_path: Path) -> dict[str, Any]:
    if not db_path.exists():
        return {"exists": False}
    stats: dict[str, Any] = {"exists": True, "size_bytes": db_path.stat().st_size}
    try:
        conn = sqlite3.connect(db_path)
        rows = conn.execute(
            "SELECT type, COUNT(*) FROM observations WHERE archived = 0 GROUP BY type"
        ).fetchall()
        stats["observations_by_type"] = {row[0]: row[1] for row in rows}
        stats["observations_total"] = sum(row[1] for row in rows)
        try:
            stats["flux_nodes"] = conn.execute("SELECT COUNT(*) FROM flux_nodes").fetchone()[0]
            stats["flux_edges"] = conn.execute("SELECT COUNT(*) FROM flux_edges").fetchone()[0]
        except sqlite3.Error:
            stats["flux_nodes"] = 0
            stats["flux_edges"] = 0
    except sqlite3.Error as exc:
        stats["error"] = str(exc)
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return stats


def mem0_stats(workspace: Path) -> str:
    script_dir = Path(os.environ.get("FORGEWRIGHT_SCRIPT_DIR", "scripts")).resolve()
    mem0 = script_dir / "mem0-v2.py"
    if not mem0.exists():
        return "mem0-v2.py not found.\n"
    result = subprocess.run(
        ["python3", str(mem0), "stats"],
        cwd=workspace,
        capture_output=True,
        text=True,
        check=False,
        timeout=15,
    )
    return redact_text((result.stdout or "") + (result.stderr or ""))


def collect_memory_bank(stage: Path, workspace: Path, manifest: dict[str, Any]) -> None:
    bank = workspace / ".forgewright" / "memory-bank"
    files = [
        (bank / "persona.md", "memory-bank/persona.md"),
        (bank / "activeContext.md", "memory-bank/activeContext.md"),
        (bank / "progress.md", "memory-bank/progress.md"),
        (bank / "graph_memory.json", "memory-bank/graph_memory.json"),
    ]
    count = 0
    for source, rel in files:
        if include_redacted_file(stage, workspace, source, rel):
            count += 1
    scenarios = bank / "scenarios"
    if scenarios.exists():
        for source in sorted(scenarios.glob("*.md")):
            if include_redacted_file(stage, workspace, source, f"memory-bank/scenarios/{source.name}"):
                count += 1
    manifest["memory_bank_files"] = count


def collect_config(stage: Path, workspace: Path, manifest: dict[str, Any]) -> None:
    config_files = [
        (workspace / ".production-grade.yaml", "config/.production-grade.yaml"),
        (workspace / ".forgewright" / "skills-config.json", "config/skills-config.json"),
        (workspace / ".forgewright" / "mcp-manifest.json", "config/mcp-manifest.json"),
        (workspace / ".antigravity" / "mcp-manifest.json", "config/antigravity-mcp-manifest.json"),
        (workspace / ".forgewright" / "settings.env", "config/settings.env.redacted"),
        (workspace / ".forgewright" / "pipeline-state.json", "config/pipeline-state.json"),
        (workspace / ".forgewright" / "session-track.json", "config/session-track.json"),
    ]
    count = 0
    for source, rel in config_files:
        if include_redacted_file(stage, workspace, source, rel):
            count += 1
    manifest["config_files"] = count


def collect_offload(
    stage: Path,
    workspace: Path,
    include_raw: bool,
    manifest: dict[str, Any],
) -> None:
    offload = workspace / ".forgewright" / "offload"
    summary: list[dict[str, Any]] = []
    raw_refs_included = 0
    if not offload.exists():
        manifest["offload_sessions"] = []
        manifest["raw_refs_included"] = 0
        write_text(stage, "offload/sessions.json", "[]\n")
        return

    for session_dir in sorted(path for path in offload.iterdir() if path.is_dir()):
        item = {
            "session_id": session_dir.name,
            "has_state": (session_dir / "state.json").exists(),
            "has_canvas": (session_dir / "canvas.mmd").exists(),
            "events": 0,
            "raw_refs": 0,
        }
        events_path = session_dir / "events.jsonl"
        if events_path.exists():
            item["events"] = len([line for line in events_path.read_text().splitlines() if line.strip()])
            include_redacted_file(stage, workspace, events_path, f"offload/{session_dir.name}/events.jsonl")
        include_redacted_file(stage, workspace, session_dir / "state.json", f"offload/{session_dir.name}/state.json")
        include_redacted_file(stage, workspace, session_dir / "canvas.mmd", f"offload/{session_dir.name}/canvas.mmd")

        refs = session_dir / "refs"
        if refs.exists():
            ref_files = [path for path in refs.iterdir() if path.is_file()]
            item["raw_refs"] = len(ref_files)
            if include_raw:
                for ref in sorted(ref_files):
                    if include_redacted_file(stage, workspace, ref, f"offload/{session_dir.name}/refs/{ref.name}"):
                        raw_refs_included += 1
        summary.append(item)

    manifest["offload_sessions"] = summary
    manifest["raw_refs_included"] = raw_refs_included
    write_text(stage, "offload/sessions.json", json.dumps(summary, indent=2) + "\n")


def collect_audit(stage: Path, workspace: Path, manifest: dict[str, Any]) -> None:
    audit = workspace / ".forgewright" / "audit"
    count = 0
    if audit.exists():
        for source in sorted(path for path in audit.rglob("*") if path.is_file()):
            rel = source.relative_to(audit)
            if include_redacted_file(stage, workspace, source, f"audit/{rel}"):
                count += 1
    manifest["audit_files"] = count


def create_archive(stage: Path, output_dir: Path, timestamp: str) -> Path:
    archive = output_dir / f"forgewright-memory-diagnostic-{timestamp}.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        for source in sorted(path for path in stage.rglob("*") if path.is_file()):
            tar.add(source, arcname=str(source.relative_to(stage)))
    return archive


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export redacted Forgewright memory diagnostics")
    parser.add_argument("output_dir")
    parser.add_argument("--include-raw", action="store_true")
    parser.add_argument("--workspace")
    return parser


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    workspace = workspace_root(args.workspace)
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = utc_now()

    with tempfile.TemporaryDirectory(prefix="forgewright-memory-diagnostic-") as tmp:
        stage = Path(tmp) / "payload"
        stage.mkdir(parents=True, exist_ok=True)
        manifest: dict[str, Any] = {
            "schema": "forgewright-memory-diagnostic/v1",
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "workspace": str(workspace),
            "include_raw": args.include_raw,
            "raw_refs_policy": "included-redacted" if args.include_raw else "excluded-by-default",
        }

        db_path = workspace / ".forgewright" / "memory.db"
        write_text(stage, "memory/mem0-stats.txt", mem0_stats(workspace))
        write_text(stage, "memory/sqlite-stats.json", json.dumps(sqlite_stats(db_path), indent=2) + "\n")
        collect_memory_bank(stage, workspace, manifest)
        collect_config(stage, workspace, manifest)
        collect_offload(stage, workspace, args.include_raw, manifest)
        collect_audit(stage, workspace, manifest)
        include_redacted_file(
            stage,
            workspace,
            workspace / ".forgewright" / "session-log.json",
            "session/session-log.json",
        )
        include_redacted_file(
            stage,
            workspace,
            workspace / ".forgewright" / "subagent-context" / "CONVERSATION_SUMMARY.md",
            "session/CONVERSATION_SUMMARY.md",
        )
        write_text(stage, "manifest.json", json.dumps(redact_json(manifest), indent=2) + "\n")

        archive = create_archive(stage, output_dir, timestamp)

    print(str(archive))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
PY
