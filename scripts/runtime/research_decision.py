"""Adopt/Extend/Build research decisions and resumable handoff protocol."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any, Mapping, Sequence

RESEARCH_DECISION_SCHEMA = "forgewright-research-decision/v1"
DECISION_TYPES = frozenset({"ADOPT", "EXTEND", "BUILD"})
ACCESS_STATUSES = frozenset({"accessible", "inaccessible", "not_found"})

_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


class ResearchDecisionError(ValueError):
    """Raised when a research decision is invalid or missing required provenance."""


def _canonical(value: Mapping[str, Any]) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def _digest(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _id(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _SAFE_ID_RE.fullmatch(value):
        raise ResearchDecisionError(f"{field} must be a safe non-empty identifier")
    return value


def _text(value: Any, field: str, *, maximum: int = 4096) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ResearchDecisionError(f"{field} must be a non-empty string")
    value = value.strip()
    if len(value) > maximum:
        raise ResearchDecisionError(f"{field} exceeds {maximum} characters")
    return value


def compile_research_decision(
    *,
    requirement: str,
    decision: str,
    chosen_rationale: str,
    verification_source: str,
    searched_sources: Sequence[Mapping[str, Any]] = (),
    alternatives_evaluated: Sequence[Mapping[str, Any]] = (),
    tradeoffs_and_risks: Sequence[str] = (),
    limitations: Sequence[str] = (),
    research_required: bool = True,
) -> dict[str, Any]:
    if type(research_required) is not bool:
        raise ResearchDecisionError("research_required must be a boolean")
    for name, values in (
        ("searched_sources", searched_sources),
        ("alternatives_evaluated", alternatives_evaluated),
        ("tradeoffs_and_risks", tradeoffs_and_risks),
        ("limitations", limitations),
    ):
        if not isinstance(values, (list, tuple)) or len(values) > 64:
            raise ResearchDecisionError(f"{name} must contain at most 64 items")
    requirement = _text(requirement, "requirement", maximum=1024)
    if not isinstance(decision, str) or decision not in DECISION_TYPES:
        raise ResearchDecisionError(f"decision must be one of {sorted(DECISION_TYPES)}")
    chosen_rationale = _text(chosen_rationale, "chosen_rationale", maximum=2048)
    verification_source = _text(
        verification_source, "verification_source", maximum=1024
    )

    validated_sources = []
    if research_required:
        if not searched_sources:
            raise ResearchDecisionError(
                "searched_sources must not be empty when research is required"
            )
        for index, item in enumerate(searched_sources):
            if not isinstance(item, Mapping):
                raise ResearchDecisionError(
                    f"searched_sources[{index}] must be a mapping"
                )
            source = _text(
                item.get("source"), f"searched_sources[{index}].source", maximum=256
            )
            if set(item) - {"source", "version", "access_status", "query"}:
                raise ResearchDecisionError("searched source has unknown fields")
            version = _text(
                item.get("version", "unknown"), "source.version", maximum=64
            )
            status = item.get("access_status")
            if not isinstance(status, str) or status not in ACCESS_STATUSES:
                raise ResearchDecisionError(
                    f"searched_sources[{index}].access_status must be one of {sorted(ACCESS_STATUSES)}"
                )
            query = _text(
                item.get("query", "general"),
                f"searched_sources[{index}].query",
                maximum=256,
            )
            validated_sources.append(
                {
                    "source": source,
                    "version": version,
                    "access_status": status,
                    "query": query,
                }
            )
    else:
        # Trivial / bounded no-research path
        validated_sources = [
            {
                "source": "local_project_context",
                "version": "local",
                "access_status": "accessible",
                "query": "local_fix",
            }
        ]

    validated_alternatives = []
    if research_required and decision != "BUILD":
        if not alternatives_evaluated:
            raise ResearchDecisionError(
                "alternatives_evaluated must not be empty for ADOPT/EXTEND decisions"
            )
    for index, alt in enumerate(alternatives_evaluated):
        if not isinstance(alt, Mapping):
            raise ResearchDecisionError(
                f"alternatives_evaluated[{index}] must be a mapping"
            )
        if set(alt) - {"name", "rationale", "rejection_reason"}:
            raise ResearchDecisionError("alternative has unknown fields")
        name = _text(
            alt.get("name"), f"alternatives_evaluated[{index}].name", maximum=128
        )
        rationale = _text(
            alt.get("rationale"),
            f"alternatives_evaluated[{index}].rationale",
            maximum=512,
        )
        rejection_reason = _text(
            alt.get("rejection_reason", "none"),
            f"alternatives_evaluated[{index}].rejection_reason",
            maximum=512,
        )
        validated_alternatives.append(
            {
                "name": name,
                "rationale": rationale,
                "rejection_reason": rejection_reason,
            }
        )

    core = {
        "schema": RESEARCH_DECISION_SCHEMA,
        "requirement": requirement,
        "decision": decision,
        "research_required": bool(research_required),
        "searched_sources": validated_sources,
        "alternatives_evaluated": validated_alternatives,
        "chosen_rationale": chosen_rationale,
        "tradeoffs_and_risks": [
            _text(t, "tradeoff", maximum=512) for t in tradeoffs_and_risks
        ],
        "verification_source": verification_source,
        "limitations": [_text(item, "limitation", maximum=512) for item in limitations],
    }
    return {**core, "digest": _digest(core)}


def verify_research_decision(record: Mapping[str, Any]) -> dict[str, Any]:
    if (
        not isinstance(record, Mapping)
        or record.get("schema") != RESEARCH_DECISION_SCHEMA
    ):
        raise ResearchDecisionError("schema mismatch")
    digest = record.get("digest")
    if not isinstance(digest, str) or not _DIGEST_RE.fullmatch(digest):
        raise ResearchDecisionError("malformed digest")
    core = {k: deepcopy(v) for k, v in record.items() if k != "digest"}
    if _digest(core) != digest:
        raise ResearchDecisionError("digest mismatch")
    try:
        normalized = compile_research_decision(
            **{k: v for k, v in core.items() if k != "schema"}
        )
    except (TypeError, KeyError) as error:
        raise ResearchDecisionError("record has unknown or missing fields") from error
    if normalized != record:
        raise ResearchDecisionError("record fields are not canonical")
    return deepcopy(normalized)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Compile or verify Adopt/Extend/Build research decisions."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    compile_p = subparsers.add_parser("compile", help="Compile a research decision.")
    compile_p.add_argument("--requirement", required=True)
    compile_p.add_argument("--decision", required=True, choices=list(DECISION_TYPES))
    compile_p.add_argument("--chosen-rationale", required=True)
    compile_p.add_argument("--verification-source", required=True)
    compile_p.add_argument(
        "--searched-sources-file", help="Path to JSON file with searched sources"
    )
    compile_p.add_argument(
        "--alternatives-file", help="Path to JSON file with alternatives evaluated"
    )
    compile_p.add_argument("--no-research-required", action="store_true")
    compile_p.add_argument("--tradeoffs", nargs="*", default=[])
    compile_p.add_argument("--limitations", nargs="*", default=[])
    compile_p.add_argument(
        "--output", type=Path, help="Output file path (defaults to stdout)"
    )

    verify_p = subparsers.add_parser("verify", help="Verify a research decision.")
    verify_p.add_argument("--file", type=Path, required=True)

    args = parser.parse_args(argv)

    if args.command == "compile":
        sources = ()
        if args.searched_sources_file:
            sources = json.loads(
                Path(args.searched_sources_file).read_text(encoding="utf-8")
            )

        alts = ()
        if args.alternatives_file:
            alts = json.loads(Path(args.alternatives_file).read_text(encoding="utf-8"))

        try:
            record = compile_research_decision(
                requirement=args.requirement,
                decision=args.decision,
                chosen_rationale=args.chosen_rationale,
                verification_source=args.verification_source,
                searched_sources=sources,
                alternatives_evaluated=alts,
                tradeoffs_and_risks=args.tradeoffs,
                limitations=args.limitations,
                research_required=not args.no_research_required,
            )
        except (ResearchDecisionError, ValueError) as err:
            print(f"Compile failed: {err}", file=sys.stderr)
            return 1

        rendered = json.dumps(record, indent=2, ensure_ascii=False)
        if args.output:
            args.output.write_text(rendered + chr(10), encoding="utf-8")
        else:
            print(rendered)
        return 0

    elif args.command == "verify":
        try:
            data = json.loads(args.file.read_text(encoding="utf-8"))
            verified = verify_research_decision(data)
        except (ResearchDecisionError, ValueError, OSError) as err:
            print(f"Verification failed: {err}", file=sys.stderr)
            return 1

        print(json.dumps(verified, indent=2, ensure_ascii=False))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
