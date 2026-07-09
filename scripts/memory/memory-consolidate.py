#!/usr/bin/env python3
"""
Consolidate Forgewright atom/offload memory into scenario and persona layers.

Outputs:
  .forgewright/memory-bank/persona.md
  .forgewright/memory-bank/scenarios/<scenario_id>.md
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_MEMORY_DB = ".forgewright/memory.db"
DEFAULT_MEMORY_BANK = ".forgewright/memory-bank"
DEFAULT_OFFLOAD_DIR = ".forgewright/offload"
DEFAULT_SESSION_LOG = ".forgewright/session-log.json"

PREFERENCE_PATTERNS = re.compile(
    r"\b(always|avoid|decision|decided|default|forgewright|gate|gitnexus|memory|must|never|prefer|rule|use)\b",
    re.IGNORECASE,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def workspace_root() -> Path:
    env_root = os.environ.get("FORGEWRIGHT_WORKSPACE")
    if env_root:
        return Path(env_root).resolve()
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if result.returncode == 0 and result.stdout.strip():
            return Path(result.stdout.strip()).resolve()
    except Exception:
        pass
    return Path.cwd().resolve()


def resolve_path(workspace: Path, raw: str) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        path = workspace / path
    return path.resolve()


def safe_slug(value: str, fallback: str = "scenario") -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip().lower()).strip("-._")
    return (slug or fallback)[:96]


def one_line(value: Any, limit: int = 180) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[: limit - 3] + "..." if len(text) > limit else text


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def load_observations(db_path: Path, limit: int) -> list[dict[str, Any]]:
    if not db_path.exists():
        return []
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, type, title, content, source, created_at
            FROM observations
            WHERE archived = 0
            ORDER BY created_at_epoch DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    except sqlite3.Error:
        return []
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return [dict(row) for row in rows]


def load_completed_sessions(path: Path, limit: int) -> list[dict[str, Any]]:
    data = read_json(path)
    sessions = data.get("sessions", [])
    if not isinstance(sessions, list):
        return []
    completed = [
        s for s in sessions if isinstance(s, dict) and s.get("status") == "completed"
    ]
    return completed[-limit:]


def load_offload_events(offload_dir: Path, max_events: int) -> list[dict[str, Any]]:
    if not offload_dir.exists():
        return []
    events: list[dict[str, Any]] = []
    for events_path in sorted(offload_dir.glob("*/events.jsonl")):
        session_id = events_path.parent.name
        for line in events_path.read_text().splitlines():
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(event, dict):
                event.setdefault("session_id", session_id)
                events.append(event)
    return events[-max_events:]


def source_refs(
    observations: list[dict[str, Any]],
    events: list[dict[str, Any]],
    session_id: str | None = None,
    max_refs: int = 12,
) -> list[str]:
    refs: list[str] = []
    for obs in observations:
        refs.append(f"mem0:{obs.get('id')}")
    filtered_events = [
        event
        for event in events
        if not session_id or str(event.get("session_id")) == session_id
    ]
    if not filtered_events and session_id:
        filtered_events = events[-3:]
    for event in filtered_events:
        refs.append(f"offload:{event.get('session_id')}/{event.get('node_id')}")
    deduped: list[str] = []
    for ref in refs:
        if ref not in deduped and not ref.endswith("/None") and ref != "mem0:None":
            deduped.append(ref)
    return deduped[:max_refs]


def yaml_list(items: list[str]) -> str:
    if not items:
        return "[]"
    return "\n" + "\n".join(f"  - {item}" for item in items)


def preference_bullets(
    observations: list[dict[str, Any]], max_items: int = 8
) -> list[str]:
    bullets: list[str] = []
    for obs in observations:
        text = f"{obs.get('title', '')} {obs.get('content', '')}"
        if not PREFERENCE_PATTERNS.search(text):
            continue
        bullets.append(
            f"- {one_line(obs.get('content') or obs.get('title'), 220)} [mem0:{obs.get('id')}]"
        )
        if len(bullets) >= max_items:
            break
    return bullets


def render_persona(
    observations: list[dict[str, Any]], events: list[dict[str, Any]]
) -> str:
    refs = source_refs(observations, events, max_refs=14)
    bullets = preference_bullets(observations)
    if not bullets:
        bullets = ["- No stable persona signals consolidated yet."]

    project_defaults = [
        "- Use Forgewright pipeline gates for staged implementation when an active pipeline exists.",
        "- Prefer local-first memory artifacts with source references over untraceable summaries.",
        "- Treat GitNexus as the active code intelligence system when code impact must be verified.",
    ]

    return "\n".join(
        [
            "---",
            "schema: forgewright-memory-persona/v1",
            f"generated_at: {now_iso()}",
            f"sources:{yaml_list(refs)}",
            "---",
            "",
            "# Persona Memory",
            "",
            "## Stable Preferences",
            "",
            *bullets,
            "",
            "## Project Defaults",
            "",
            *project_defaults,
            "",
            "## Source References",
            "",
            *(f"- {ref}" for ref in refs),
            "",
        ]
    )


def session_summary(session: dict[str, Any]) -> str:
    return one_line(
        session.get("summary")
        or session.get("request_summary")
        or session.get("notes")
        or session.get("session_id")
        or "Completed session",
        220,
    )


def session_completed_tasks(session: dict[str, Any]) -> list[str]:
    tasks = session.get("completed_tasks") or session.get("tasks_completed") or []
    if isinstance(tasks, str):
        return [tasks]
    if isinstance(tasks, list):
        return [one_line(item, 180) for item in tasks if str(item).strip()]
    return []


def render_scenario(
    scenario_id: str,
    session: dict[str, Any] | None,
    observations: list[dict[str, Any]],
    events: list[dict[str, Any]],
) -> str:
    session_id = str(session.get("session_id")) if session else None
    refs = source_refs(observations[:6], events, session_id=session_id, max_refs=12)
    title = session_summary(session or {"summary": "Recent memory pattern"})
    tasks = session_completed_tasks(session or {})
    if not tasks:
        tasks = [
            one_line(obs.get("title") or obs.get("content"), 180)
            for obs in observations[:5]
        ]
    if not tasks:
        tasks = ["No completed tasks were available for consolidation."]

    related_events = [
        event
        for event in events
        if not session_id or str(event.get("session_id")) == session_id
    ][:8]

    lines = [
        "---",
        "schema: forgewright-memory-scenario/v1",
        f"scenario_id: {scenario_id}",
        f"generated_at: {now_iso()}",
        f"sources:{yaml_list(refs)}",
        "---",
        "",
        f"# Scenario: {title}",
        "",
        "## Trigger",
        "",
        one_line((session or {}).get("request_summary") or title, 240),
        "",
        "## Context",
        "",
        f"- Session: {session_id or 'derived-from-recent-memory'}",
        f"- Mode: {one_line((session or {}).get('mode') or 'unknown', 80)}",
        "",
        "## Successful Pattern",
        "",
        *(f"- {task}" for task in tasks),
        "",
        "## Evidence",
        "",
        *(f"- {ref}" for ref in refs),
    ]

    if related_events:
        lines.extend(["", "## Offload Trace", ""])
        for event in related_events:
            lines.append(
                f"- {event.get('node_id')} [{event.get('status', 'unknown')}] "
                f"{one_line(event.get('tool'), 80)}: {one_line(event.get('summary'), 180)}"
            )

    lines.append("")
    return "\n".join(lines)


def write_outputs(
    memory_bank: Path,
    observations: list[dict[str, Any]],
    sessions: list[dict[str, Any]],
    events: list[dict[str, Any]],
    max_scenarios: int,
) -> dict[str, Any]:
    scenarios_dir = memory_bank / "scenarios"
    scenarios_dir.mkdir(parents=True, exist_ok=True)

    persona_path = memory_bank / "persona.md"
    persona_path.write_text(render_persona(observations, events))

    scenario_paths: list[Path] = []
    target_sessions = sessions[-max_scenarios:] if sessions else []
    if target_sessions:
        for session in target_sessions:
            base = session.get("session_id") or session_summary(session)
            scenario_id = safe_slug(str(base), "completed-session")
            path = scenarios_dir / f"{scenario_id}.md"
            path.write_text(render_scenario(scenario_id, session, observations, events))
            scenario_paths.append(path)
    else:
        scenario_id = "recent-memory-pattern"
        path = scenarios_dir / f"{scenario_id}.md"
        path.write_text(render_scenario(scenario_id, None, observations, events))
        scenario_paths.append(path)

    return {
        "persona": str(persona_path),
        "scenarios": [str(path) for path in scenario_paths],
        "observations": len(observations),
        "sessions": len(sessions),
        "offload_events": len(events),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Consolidate memory into persona/scenario layers"
    )
    parser.add_argument("--workspace", default=str(workspace_root()))
    parser.add_argument("--memory-db", default=DEFAULT_MEMORY_DB)
    parser.add_argument("--memory-bank", default=DEFAULT_MEMORY_BANK)
    parser.add_argument("--offload-dir", default=DEFAULT_OFFLOAD_DIR)
    parser.add_argument("--session-log", default=DEFAULT_SESSION_LOG)
    parser.add_argument("--max-observations", type=int, default=30)
    parser.add_argument("--max-events", type=int, default=40)
    parser.add_argument("--max-scenarios", type=int, default=3)
    parser.add_argument("--json", action="store_true")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    workspace = Path(args.workspace).resolve()
    memory_db = resolve_path(workspace, args.memory_db)
    memory_bank = resolve_path(workspace, args.memory_bank)
    offload_dir = resolve_path(workspace, args.offload_dir)
    session_log = resolve_path(workspace, args.session_log)

    observations = load_observations(memory_db, args.max_observations)
    sessions = load_completed_sessions(session_log, args.max_scenarios)
    events = load_offload_events(offload_dir, args.max_events)
    result = write_outputs(
        memory_bank, observations, sessions, events, args.max_scenarios
    )

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Persona: {result['persona']}")
        for scenario in result["scenarios"]:
            print(f"Scenario: {scenario}")
        print(
            "Consolidated "
            f"{result['observations']} observations, "
            f"{result['sessions']} completed sessions, "
            f"{result['offload_events']} offload events."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
