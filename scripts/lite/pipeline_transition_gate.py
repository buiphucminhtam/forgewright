#!/usr/bin/env python3
"""Fail-closed pipeline phase-transition gate (structural + executable checks).

Port: --workspace PATH --run-id UUID --phase 1|2|3|4
      --kind new-project|existing|mechanical [--turn T --started-at ISO]
Prints {"allow", "reasons", "limitations"} JSON; exit 0 only when allowed.
Never builds, installs, uses a shell or the network, or honors caller trust flags.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import stat
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # required under python -I

# Caller environment must not relax checks; drop overrides before importing.
for _name in (
    "FORGEWRIGHT_DOCS_BUILD_RECEIPT",
    "FORGEWRIGHT_DOCS_CLI",
    "FORGEWRIGHT_DOCS_CONTINUITY_STATE_DIR",
    "FORGEWRIGHT_RULE_HOOK_MODE",
    "FORGEWRIGHT_STALENESS_SECS",
    "FORGEWRIGHT_REPLAY_TIMEOUT_SECS",
):
    os.environ.pop(_name, None)
# "observe" never writes the checker's retry token; only "verified" is accepted.
os.environ["FORGEWRIGHT_DOCS_CONTINUITY_MODE"] = "observe"

import continuity_check as cc  # noqa: E402
from evidence_common import changed_files, parse_timestamp, read_evidence_json  # noqa: E402
from verify_gate import completion_checks  # noqa: E402

MAX_RESEARCH_BYTES = 64 * 1024
MAX_ITEMS = 200
SAFE_TURN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
DECISIONS = {"reuse", "customize", "build", "not_applicable"}
LIMITATIONS = [
    "Research record is validated structurally; its authenticity and quality are not verified.",
    "Turn and run start are caller-supplied same-user values, not authentication.",
    "Docs check reads the current build receipt; this gate never runs a docs build.",
    "Tree validation is point-in-time; the subsequent CAS protects pipeline state, not external filesystem writers.",
    "Same-user edits to framework code are not an authenticated trust boundary.",
]


class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:  # type: ignore[override]
        raise ValueError(f"args: {message}")


def _parse(argv: list[str]) -> argparse.Namespace:
    parser = _Parser(add_help=False, allow_abbrev=False)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--phase", required=True, choices=["1", "2", "3", "4"])
    parser.add_argument(
        "--kind", required=True, choices=["new-project", "existing", "mechanical"]
    )
    parser.add_argument("--turn")
    parser.add_argument("--started-at")
    args = parser.parse_args(argv)
    try:
        if str(uuid.UUID(args.run_id)) != args.run_id:
            raise ValueError
    except ValueError:
        raise ValueError("args: --run-id must be a canonical lowercase UUID") from None
    if args.phase in {"3", "4"}:
        if not args.turn or not SAFE_TURN.fullmatch(args.turn):
            raise ValueError("args: phases 3/4 require a safe --turn selector")
        if not args.started_at:
            raise ValueError("args: phases 3/4 require --started-at")
        if (
            datetime.fromisoformat(args.started_at.replace("Z", "+00:00")).tzinfo
            is None
        ):
            raise ValueError("args: --started-at must include a timezone")
        args.started = parse_timestamp(args.started_at)
    return args


def _workspace(raw: str) -> Path:
    root = Path(raw).resolve()
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if result.returncode != 0 or Path(result.stdout.strip()).resolve() != root:
        raise ValueError("workspace: must be an existing git repository root")
    return root


def _read_research(root: Path, run_id: str) -> dict[str, Any]:
    current = root
    for part in (".forgewright", "research", f"{run_id}.json"):
        current = current / part
        info = current.lstat()  # FileNotFoundError -> denied by caller
        if stat.S_ISLNK(info.st_mode):
            raise ValueError("research: symlinked path component")
    if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_RESEARCH_BYTES:
        raise ValueError("research: record must be a bounded regular file")
    fd = os.open(current, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd, "rb") as handle:
        value = json.loads(handle.read(MAX_RESEARCH_BYTES + 1).decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("research: record must be a JSON object")
    return value


def _objects(value: Any, keys: tuple[str, ...]) -> bool:
    return (
        isinstance(value, list)
        and len(value) <= MAX_ITEMS
        and all(
            isinstance(item, dict)
            and all(isinstance(item.get(k), str) and item[k].strip() for k in keys)
            for item in value
        )
    )


def research_errors(record: dict[str, Any], run_id: str, kind: str) -> list[str]:
    errors: list[str] = []
    if record.get("schema_version") != 1 or isinstance(
        record.get("schema_version"), bool
    ):
        errors.append("research: schema_version must be 1")
    if record.get("run_id") != run_id:
        errors.append("research: run_id does not match this run")
    if record.get("status") != "supported":
        errors.append("research: status must be 'supported' (provisional is denied)")
    reason = record.get("reason")
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 4000:
        errors.append("research: reason must be a non-empty bounded string")
    queries = record.get("queries")
    if not (
        isinstance(queries, list)
        and len(queries) <= MAX_ITEMS
        and all(isinstance(q, str) and q.strip() for q in queries)
    ):
        errors.append("research: queries must be a list of strings")
    if not _objects(record.get("sources"), ("url", "revision")) or not record.get(
        "sources"
    ):
        errors.append("research: sources must be non-empty [{url, revision}]")
    if not _objects(record.get("candidates"), ("url", "reason")):
        errors.append("research: candidates must be [{url, reason}]")
    decision = record.get("decision")
    if decision not in DECISIONS:
        errors.append("research: decision must be reuse|customize|build|not_applicable")
    if errors:
        return errors
    if kind == "new-project":
        if decision == "not_applicable":
            errors.append("research: new-project decision cannot be not_applicable")
        if not queries:
            errors.append("research: new-project requires discovery queries")
        if decision in {"reuse", "customize"} and not record["candidates"]:
            errors.append("research: adoption requires reuse candidates")
        if not any(
            str(s["url"]).startswith(("https://", "http://")) for s in record["sources"]
        ):
            errors.append(
                "research: new-project requires at least one external source URL"
            )
    elif decision in {"reuse", "customize"} and not record["candidates"]:
        errors.append("research: reuse/customize decision requires candidates")
    return errors


def docs_errors(root: Path, changed: list[str] | None = None) -> list[str]:
    manifest, _ = cc._manifest(root)
    raw_files = changed_files(root) if changed is None else changed
    files = [path for path in raw_files if os.path.lexists(root / path)]
    material_paths, path_error = (
        cc._manifest_paths(root, manifest)
        if isinstance(manifest, dict)
        else (set(), "")
    )
    # A deleted docs path must trigger a fresh catalog check, but cannot itself
    # be required to exist after a valid rebuild. Keep dangling symlinks in scope.
    deleted_docs = any(
        not os.path.lexists(root / path)
        and cc._is_material(path, material_paths, legacy_prefixes=manifest is None)
        for path in raw_files
    )
    force_current = changed is None or deleted_docs or bool(path_error)
    docs = manifest.get("project_docs") if isinstance(manifest, dict) else None
    state = docs.get("state") if isinstance(docs, dict) else "docs/project-state.json"
    if force_current:
        files.append(".forgewright/docs-manifest.json")
        if isinstance(state, str) and state.strip():
            files.append(state)
    result = cc.check_continuity(root, {"files": files}, files=files)
    if not force_current and result.status == "irrelevant":
        return []
    if result.status != "verified":
        return [
            f"docs: current Docs Hub receipt not verified ({result.status}: {result.reason or 'none'})"
        ]
    return []


def evidence_errors(root: Path, turn: str, started: datetime) -> list[str]:
    path = root / ".forgewright" / "verify" / f"{turn}.json"
    try:
        evidence = read_evidence_json(root, path)
    except (OSError, ValueError) as error:
        return [f"evidence: exact turn record unreadable: {error}"[:500]]
    if evidence.get("turn") != turn:
        return ["evidence: turn does not equal --turn"]
    try:
        if parse_timestamp(str(evidence.get("timestamp_utc"))) < started:
            return ["evidence: timestamp_utc predates the run started-at"]
    except ValueError:
        return ["evidence: timestamp_utc is not ISO-8601"]
    _, checks = completion_checks(evidence, root, path, changed_files(root))
    return [f"evidence: {label}: {err}"[:500] for label, errs in checks for err in errs]


def evaluate(argv: list[str]) -> list[str]:
    args = _parse(argv)
    root = _workspace(args.workspace)
    if args.phase == "2":
        return []
    material = args.kind != "mechanical"
    try:
        reasons = research_errors(
            _read_research(root, args.run_id), args.run_id, args.kind
        )
    except (OSError, ValueError, UnicodeDecodeError) as error:
        reasons = [f"research: record missing or malformed ({type(error).__name__})"]
    if material:
        reasons += docs_errors(root)
    elif args.phase in {"3", "4"}:
        reasons += docs_errors(root, changed_files(root))
    if args.phase in {"3", "4"} and not reasons:
        reasons += evidence_errors(root, args.turn, args.started)
    return reasons


def main(argv: list[str] | None = None) -> int:
    try:
        # Library diagnostics go to stderr; stdout carries only the JSON verdict.
        with contextlib.redirect_stdout(sys.stderr):
            reasons = evaluate(sys.argv[1:] if argv is None else argv)
    except ValueError as error:
        reasons = [str(error)[:500]]
    except Exception as error:  # fail closed on any unexpected fault
        reasons = [f"internal: {type(error).__name__}"]
    allow = not reasons
    print(json.dumps({"allow": allow, "reasons": reasons, "limitations": LIMITATIONS}))
    return 0 if allow else 1


if __name__ == "__main__":
    raise SystemExit(main())
