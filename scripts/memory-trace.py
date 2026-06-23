#!/usr/bin/env python3
"""
Trace Forgewright context offload events.

Commands:
  trace-node <node_id> --session <session_id>
  trace-session <session_id>
  trace-canvas <session_id>
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any


STATUS_CLASSES = {"queued", "running", "done", "error", "skipped"}


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
        if result.returncode == 0:
            return Path(result.stdout.strip()).resolve()
    except Exception:
        pass
    return Path.cwd().resolve()


def safe_segment(value: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", value)[:120]
    return safe or "unknown"


def data_root(args: argparse.Namespace) -> Path:
    raw = Path(args.data_dir)
    if not raw.is_absolute():
        raw = workspace_root() / raw
    return raw.resolve()


def session_dir(args: argparse.Namespace, session_id: str) -> Path:
    return data_root(args) / safe_segment(session_id)


def ensure_within(base: Path, target: Path) -> None:
    base_resolved = base.resolve()
    target_resolved = target.resolve()
    if target_resolved != base_resolved and base_resolved not in target_resolved.parents:
        raise ValueError(f"Unsafe path outside base: {target_resolved}")


def load_events(base: Path) -> list[dict[str, Any]]:
    events_path = base / "events.jsonl"
    if not events_path.exists():
        return []

    events: list[dict[str, Any]] = []
    for line in events_path.read_text().splitlines():
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            events.append(event)
    return events


def mermaid_id(node_id: str) -> str:
    return "m_" + re.sub(r"[^a-zA-Z0-9_]", "_", safe_segment(node_id))


def mermaid_label(event: dict[str, Any]) -> str:
    node_id = str(event.get("node_id", "unknown"))
    turn = str(event.get("turn_number", "?"))
    tool = str(event.get("tool", "unknown"))
    summary = re.sub(r"\s+", " ", str(event.get("summary", ""))).replace('"', "")[:96]
    result_ref = event.get("result_ref")
    ref = f"\\nref: {result_ref}" if result_ref else ""
    return f"{turn}. {tool}\\nid: {node_id}\\n{summary}{ref}"


def generate_canvas(events: list[dict[str, Any]], max_events: int = 50) -> str:
    selected = events[-max_events:]
    lines = [
        "flowchart TD",
        "  classDef queued fill:#eef2ff,stroke:#4f46e5,color:#111827",
        "  classDef running fill:#fff7ed,stroke:#f97316,color:#111827",
        "  classDef done fill:#ecfdf5,stroke:#16a34a,color:#111827",
        "  classDef error fill:#fef2f2,stroke:#dc2626,color:#111827",
        "  classDef skipped fill:#f3f4f6,stroke:#6b7280,color:#111827",
    ]
    if not selected:
        lines.append('  empty["No offloaded tool events"]:::skipped')
        return "\n".join(lines) + "\n"

    for event in selected:
        node_id = str(event.get("node_id", "unknown"))
        status = str(event.get("status", "skipped"))
        if status not in STATUS_CLASSES:
            status = "skipped"
        lines.append(f'  {mermaid_id(node_id)}["{mermaid_label(event)}"]:::{status}')

    for previous, current in zip(selected, selected[1:]):
        lines.append(
            f"  {mermaid_id(str(previous.get('node_id', 'unknown')))} --> "
            f"{mermaid_id(str(current.get('node_id', 'unknown')))}"
        )
    return "\n".join(lines) + "\n"


def cmd_trace_node(args: argparse.Namespace) -> int:
    base = session_dir(args, args.session)
    events = load_events(base)
    event = next((item for item in events if item.get("node_id") == args.node_id), None)
    if not event:
        print(f"Node not found: {args.node_id}")
        return 1

    if args.json:
        print(json.dumps(event, indent=2))
        return 0

    print(f"Node: {event.get('node_id')}")
    print(f"Session: {event.get('session_id')}")
    print(f"Status: {event.get('status')}")
    print(f"Tool: {event.get('tool')}")
    print(f"Turn: {event.get('turn_number')}")
    print(f"Summary: {event.get('summary')}")
    result_ref = event.get("result_ref")
    if result_ref:
        ref_path = base / "refs" / Path(str(result_ref)).name
        ensure_within(base, ref_path)
        print(f"Ref: {ref_path}")
        if ref_path.exists():
            preview = "\n".join(ref_path.read_text().splitlines()[:20])
            if preview:
                print("\n--- Ref Preview ---")
                print(preview)
    return 0


def cmd_trace_session(args: argparse.Namespace) -> int:
    base = session_dir(args, args.session)
    events = load_events(base)
    if args.json:
        print(json.dumps(events, indent=2))
        return 0

    print(f"Session: {safe_segment(args.session)}")
    print(f"Events: {len(events)}")
    for event in events:
        print(
            f"- {event.get('node_id')} [{event.get('status')}] "
            f"turn={event.get('turn_number')} tool={event.get('tool')} "
            f"ref={event.get('result_ref', '-')}"
        )
    return 0


def cmd_trace_canvas(args: argparse.Namespace) -> int:
    base = session_dir(args, args.session)
    canvas_path = base / "canvas.mmd"
    if canvas_path.exists():
        print(canvas_path.read_text(), end="")
        return 0

    events = load_events(base)
    print(generate_canvas(events, args.max_events), end="")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Trace Forgewright context offload events")
    parser.add_argument("--data-dir", default=".forgewright/offload")
    subparsers = parser.add_subparsers(dest="command", required=True)

    node = subparsers.add_parser("trace-node", help="Show one offload event and ref preview")
    node.add_argument("node_id")
    node.add_argument("--session", required=True)
    node.add_argument("--json", action="store_true")
    node.set_defaults(func=cmd_trace_node)

    session = subparsers.add_parser("trace-session", help="List offload events for a session")
    session.add_argument("session")
    session.add_argument("--json", action="store_true")
    session.set_defaults(func=cmd_trace_session)

    canvas = subparsers.add_parser("trace-canvas", help="Print Mermaid canvas for a session")
    canvas.add_argument("session")
    canvas.add_argument("--max-events", type=int, default=50)
    canvas.set_defaults(func=cmd_trace_canvas)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
