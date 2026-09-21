#!/usr/bin/env python3
"""Provider-neutral behavioral quality engine for Forgewright skills."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

SCENARIO_SCHEMA = "forgewright-skill-eval-scenario/v1"
RESULT_SCHEMA = "forgewright-skill-eval-result/v1"
REQUEST_SCHEMA = "forgewright-skill-eval-request/v1"
REPORT_SCHEMA = "forgewright-skill-eval-report/v1"
VARIANTS = ("baseline", "current", "candidate")
MAX_SCENARIOS = 1000
MAX_LIST_ITEMS = 64
MAX_TEXT_CHARS = 4096


class SkillQualityError(ValueError):
    """Raised when skill-evaluation input or evidence is malformed."""


def canonical_digest(value: Mapping[str, Any]) -> str:
    encoded = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _text(value: Any, field: str, maximum: int = MAX_TEXT_CHARS) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SkillQualityError(f"{field} must be a non-empty string")
    value = value.strip()
    if len(value) > maximum:
        raise SkillQualityError(f"{field} exceeds {maximum} characters")
    return value


def _items(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or len(value) > MAX_LIST_ITEMS:
        raise SkillQualityError(
            f"{field} must be an array with at most {MAX_LIST_ITEMS} items"
        )
    out: list[str] = []
    seen: set[str] = set()
    for index, item in enumerate(value):
        item = _text(item, f"{field}[{index}]", 128)
        if item in seen:
            raise SkillQualityError(f"{field} contains duplicate item {item!r}")
        seen.add(item)
        out.append(item)
    return out


def validate_scenario(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SkillQualityError("scenario must be an object")
    allowed = {
        "schema",
        "id",
        "skill",
        "prompt",
        "should_trigger",
        "required_events",
        "forbidden_events",
        "pressure_tags",
        "rationalization_traps",
        "critical",
    }
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise SkillQualityError(f"scenario contains unknown fields: {unknown}")
    if value.get("schema") != SCENARIO_SCHEMA:
        raise SkillQualityError(f"scenario.schema must be {SCENARIO_SCHEMA}")
    if not isinstance(value.get("should_trigger"), bool):
        raise SkillQualityError("scenario.should_trigger must be boolean")
    if not isinstance(value.get("critical", False), bool):
        raise SkillQualityError("scenario.critical must be boolean")
    row = {
        "schema": SCENARIO_SCHEMA,
        "id": _text(value.get("id"), "scenario.id", 96),
        "skill": _text(value.get("skill"), "scenario.skill", 96),
        "prompt": _text(value.get("prompt"), "scenario.prompt"),
        "should_trigger": value["should_trigger"],
        "required_events": _items(value.get("required_events", []), "required_events"),
        "forbidden_events": _items(
            value.get("forbidden_events", []), "forbidden_events"
        ),
        "pressure_tags": _items(value.get("pressure_tags", []), "pressure_tags"),
        "rationalization_traps": _items(
            value.get("rationalization_traps", []), "rationalization_traps"
        ),
        "critical": value.get("critical", False),
    }
    if not row["should_trigger"] and row["required_events"]:
        raise SkillQualityError("non-trigger scenario cannot require skill events")
    return row


def validate_observation(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SkillQualityError("runner observation must be an object")
    allowed = {
        "triggered",
        "events",
        "rationalizations",
        "unnecessary_actions",
        "tool_calls",
        "context_bytes",
        "wall_ms",
        "abstained",
    }
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise SkillQualityError(f"observation contains unknown fields: {unknown}")
    for field in ("triggered", "abstained"):
        if not isinstance(value.get(field), bool):
            raise SkillQualityError(f"observation.{field} must be boolean")
    integers: dict[str, int] = {}
    for field in ("tool_calls", "context_bytes"):
        raw = value.get(field)
        if isinstance(raw, bool) or not isinstance(raw, int) or raw < 0:
            raise SkillQualityError(
                f"observation.{field} must be a non-negative integer"
            )
        integers[field] = raw
    wall_ms = value.get("wall_ms")
    if (
        isinstance(wall_ms, bool)
        or not isinstance(wall_ms, (int, float))
        or wall_ms < 0
    ):
        raise SkillQualityError("observation.wall_ms must be a non-negative number")
    return {
        "triggered": value["triggered"],
        "events": _items(value.get("events", []), "observation.events"),
        "rationalizations": _items(
            value.get("rationalizations", []), "observation.rationalizations"
        ),
        "unnecessary_actions": _items(
            value.get("unnecessary_actions", []), "observation.unnecessary_actions"
        ),
        **integers,
        "wall_ms": float(wall_ms),
        "abstained": value["abstained"],
    }


def validate_result(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("schema") != RESULT_SCHEMA:
        raise SkillQualityError(f"result.schema must be {RESULT_SCHEMA}")
    variant = value.get("variant")
    if variant not in VARIANTS:
        raise SkillQualityError(f"result.variant must be one of {VARIANTS}")
    observation = validate_observation(
        {
            field: value.get(field)
            for field in (
                "triggered",
                "events",
                "rationalizations",
                "unnecessary_actions",
                "tool_calls",
                "context_bytes",
                "wall_ms",
                "abstained",
            )
        }
    )
    return {
        "schema": RESULT_SCHEMA,
        "scenario_id": _text(value.get("scenario_id"), "result.scenario_id", 96),
        "skill": _text(value.get("skill"), "result.skill", 96),
        "variant": variant,
        **observation,
    }


def read_jsonl(path: Path, validator) -> list[dict[str, Any]]:
    if not path.is_file() or path.stat().st_size > 4 * 1024 * 1024:
        raise SkillQualityError(f"bounded JSONL file required: {path}")
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), 1
    ):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise SkillQualityError(f"{path}:{line_number}: invalid JSON") from error
        rows.append(validator(value))
        if len(rows) > MAX_SCENARIOS * len(VARIANTS):
            raise SkillQualityError("JSONL row count exceeds safety bound")
    if not rows:
        raise SkillQualityError(f"{path} must not be empty")
    return rows


def _p95(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * 0.95) - 1))
    return float(ordered[index])


def scenario_passes(scenario: Mapping[str, Any], result: Mapping[str, Any]) -> bool:
    events = set(result["events"])
    rationalizations = set(result["rationalizations"])
    trigger_ok = result["triggered"] == scenario["should_trigger"]
    if not scenario["should_trigger"]:
        trigger_ok = trigger_ok and (result["abstained"] or not result["triggered"])
    return (
        trigger_ok
        and set(scenario["required_events"]).issubset(events)
        and not set(scenario["forbidden_events"]).intersection(events)
        and not set(scenario["rationalization_traps"]).intersection(rationalizations)
    )


def score_variant(
    scenarios: Sequence[Mapping[str, Any]],
    results: Sequence[Mapping[str, Any]],
    variant: str,
) -> dict[str, Any]:
    selected = [row for row in results if row["variant"] == variant]
    by_id = {row["scenario_id"]: row for row in selected}
    expected_ids = {row["id"] for row in scenarios}
    if set(by_id) != expected_ids or len(by_id) != len(selected):
        missing = sorted(expected_ids - set(by_id))
        extra = sorted(set(by_id) - expected_ids)
        raise SkillQualityError(
            f"{variant} results must map exactly once to scenarios; missing={missing}, extra={extra}"
        )
    if any(by_id[row["id"]]["skill"] != row["skill"] for row in scenarios):
        raise SkillQualityError(f"{variant} result skill does not match scenario")

    trigger_hits = 0
    required_total = required_hit = 0
    forbidden_hits = rationalization_hits = pressure_total = pressure_pass = 0
    abstain_total = abstain_hits = critical_forbidden = 0
    unnecessary = tool_calls = context_bytes = 0
    walls: list[float] = []
    passing = 0

    for scenario in scenarios:
        result = by_id[scenario["id"]]
        events = set(result["events"])
        rationalizations = set(result["rationalizations"])
        trigger_hits += int(result["triggered"] == scenario["should_trigger"])
        for event in scenario["required_events"]:
            required_total += 1
            required_hit += int(event in events)
        has_forbidden = bool(set(scenario["forbidden_events"]).intersection(events))
        forbidden_hits += int(has_forbidden)
        trapped = bool(
            set(scenario["rationalization_traps"]).intersection(rationalizations)
        )
        rationalization_hits += int(trapped)
        if scenario["pressure_tags"]:
            pressure_total += 1
            pressure_pass += int(scenario_passes(scenario, result))
        if not scenario["should_trigger"]:
            abstain_total += 1
            abstain_hits += int(result["abstained"] and not result["triggered"])
        if scenario["critical"] and has_forbidden:
            critical_forbidden += 1
        unnecessary += len(result["unnecessary_actions"])
        tool_calls += result["tool_calls"]
        context_bytes += result["context_bytes"]
        walls.append(result["wall_ms"])
        passing += int(scenario_passes(scenario, result))

    count = len(scenarios)
    return {
        "variant": variant,
        "scenario_count": count,
        "pass_rate": passing / count,
        "trigger_accuracy": trigger_hits / count,
        "required_event_compliance": 1.0
        if not required_total
        else required_hit / required_total,
        "forbidden_behavior_rate": forbidden_hits / count,
        "rationalization_rate": rationalization_hits / count,
        "pressure_success_rate": 1.0
        if not pressure_total
        else pressure_pass / pressure_total,
        "abstention_quality": 1.0
        if not abstain_total
        else abstain_hits / abstain_total,
        "critical_forbidden_count": critical_forbidden,
        "unnecessary_actions_avg": unnecessary / count,
        "tool_calls_avg": tool_calls / count,
        "context_bytes_avg": context_bytes / count,
        "wall_ms_p95": _p95(walls),
    }


def assess_promotion(report: Mapping[str, Any]) -> dict[str, Any]:
    arms = report.get("arms")
    if not isinstance(arms, dict) or "current" not in arms or "candidate" not in arms:
        raise SkillQualityError("promotion requires current and candidate arms")
    current = arms["current"]
    candidate = arms["candidate"]
    blockers: list[str] = []

    for metric in (
        "pass_rate",
        "trigger_accuracy",
        "required_event_compliance",
        "pressure_success_rate",
        "abstention_quality",
    ):
        if candidate[metric] + 1e-12 < current[metric]:
            blockers.append(f"regression:{metric}")
    for metric in ("forbidden_behavior_rate", "rationalization_rate"):
        if candidate[metric] > current[metric] + 1e-12:
            blockers.append(f"regression:{metric}")
    if candidate["critical_forbidden_count"] != 0:
        blockers.append("critical_forbidden_behavior")

    quality_improved = any(
        candidate[m] > current[m] + 1e-12
        for m in (
            "pass_rate",
            "trigger_accuracy",
            "required_event_compliance",
            "pressure_success_rate",
        )
    ) or any(
        candidate[m] + 1e-12 < current[m]
        for m in ("forbidden_behavior_rate", "rationalization_rate")
    )
    efficiency_improved = (
        candidate["context_bytes_avg"] <= current["context_bytes_avg"] * 0.90
        or candidate["tool_calls_avg"] <= current["tool_calls_avg"] * 0.90
        or candidate["unnecessary_actions_avg"] < current["unnecessary_actions_avg"]
    )
    if not quality_improved and not efficiency_improved:
        blockers.append("no_measured_improvement")

    return {
        "status": "promote" if not blockers else "hold",
        "promotion_allowed": not blockers,
        "blockers": blockers,
        "quality_improved": quality_improved,
        "efficiency_improved": efficiency_improved,
    }


def build_report(
    scenarios: Sequence[Mapping[str, Any]], results: Sequence[Mapping[str, Any]]
) -> dict[str, Any]:
    arms = {
        variant: score_variant(scenarios, results, variant)
        for variant in VARIANTS
        if any(row["variant"] == variant for row in results)
    }
    core = {
        "schema": REPORT_SCHEMA,
        "skills": sorted({row["skill"] for row in scenarios}),
        "scenario_count": len(scenarios),
        "arms": arms,
    }
    report = {**core, "digest": canonical_digest(core)}
    report["promotion"] = (
        assess_promotion(report)
        if {"current", "candidate"} <= set(arms)
        else {
            "status": "not_assessed",
            "promotion_allowed": False,
            "blockers": ["current_and_candidate_required"],
        }
    )
    return report


def _artifact_record(path: Path | None) -> dict[str, Any] | None:
    if path is None:
        return None
    path = path.resolve()
    if not path.is_file() or path.stat().st_size > 2 * 1024 * 1024:
        raise SkillQualityError(f"bounded skill candidate file required: {path}")
    data = path.read_bytes()
    return {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def bind_skill_artifacts(
    report: Mapping[str, Any],
    *,
    current_skill: Path | None,
    candidate_skill: Path | None,
) -> dict[str, Any]:
    artifacts = {
        "current": _artifact_record(current_skill),
        "candidate": _artifact_record(candidate_skill),
    }
    return {
        **dict(report),
        "artifacts": artifacts,
        "artifact_digest": canonical_digest(artifacts),
    }


def verify_report(report: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(report, Mapping) or report.get("schema") != REPORT_SCHEMA:
        raise SkillQualityError(f"report.schema must be {REPORT_SCHEMA}")
    core = {
        "schema": report.get("schema"),
        "skills": report.get("skills"),
        "scenario_count": report.get("scenario_count"),
        "arms": report.get("arms"),
    }
    if report.get("digest") != canonical_digest(core):
        raise SkillQualityError("skill quality report digest mismatch")
    expected = assess_promotion(core)
    if report.get("promotion") != expected:
        raise SkillQualityError("skill quality promotion result mismatch")
    artifacts = report.get("artifacts")
    if artifacts is not None:
        if not isinstance(artifacts, dict) or set(artifacts) != {
            "current",
            "candidate",
        }:
            raise SkillQualityError("skill quality artifact binding is malformed")
        if report.get("artifact_digest") != canonical_digest(artifacts):
            raise SkillQualityError("skill quality artifact digest mismatch")
    return dict(report)


def promote_candidate(
    *, root: Path, report: Mapping[str, Any], candidate: Path, target: Path
) -> Path:
    report = verify_report(report)
    promotion = report["promotion"]
    if promotion.get("promotion_allowed") is not True:
        raise SkillQualityError("candidate promotion is not allowed by the report")
    artifacts = report.get("artifacts")
    if not isinstance(artifacts, dict) or not isinstance(
        artifacts.get("candidate"), dict
    ):
        raise SkillQualityError("promotion report is not bound to a candidate artifact")
    candidate_record = _artifact_record(candidate)
    if candidate_record != artifacts["candidate"]:
        raise SkillQualityError("candidate bytes differ from evaluated artifact")

    root = root.resolve()
    skills_root = (root / "skills").resolve()
    target = target.resolve()
    try:
        target.relative_to(skills_root)
    except ValueError as error:
        raise SkillQualityError("promotion target must stay under skills/") from error
    if target.name not in {"SKILL.md", "LITE.md"}:
        raise SkillQualityError("promotion target must be SKILL.md or LITE.md")
    if target.parent.name not in set(report.get("skills", [])):
        raise SkillQualityError("promotion target skill is not covered by the report")
    if not target.parent.is_dir():
        raise SkillQualityError("promotion target skill directory does not exist")
    data = candidate.resolve().read_bytes()
    temporary = target.with_name(f".{target.name}.promotion-{os.getpid()}.tmp")
    temporary.write_bytes(data)
    os.replace(temporary, target)
    return target


def invoke_runner(
    runner: Sequence[str],
    scenario: Mapping[str, Any],
    *,
    variant: str,
    skill_path: Path | None,
    timeout_seconds: float,
) -> dict[str, Any]:
    request = {
        "schema": REQUEST_SCHEMA,
        "variant": variant,
        "scenario": dict(scenario),
        "skill_path": None if skill_path is None else str(skill_path.resolve()),
    }
    proc = subprocess.run(
        list(runner),
        input=json.dumps(request, ensure_ascii=False),
        text=True,
        capture_output=True,
        timeout=timeout_seconds,
        check=False,
    )
    if proc.returncode != 0:
        raise SkillQualityError(
            f"runner failed for {scenario['id']}/{variant}: exit={proc.returncode}: "
            f"{proc.stderr[-1000:]}"
        )
    try:
        observation = validate_observation(json.loads(proc.stdout))
    except (json.JSONDecodeError, SkillQualityError) as error:
        raise SkillQualityError(
            f"runner emitted invalid observation for {scenario['id']}/{variant}"
        ) from error
    return {
        "schema": RESULT_SCHEMA,
        "scenario_id": scenario["id"],
        "skill": scenario["skill"],
        "variant": variant,
        **observation,
    }


def evaluate(
    scenarios: Sequence[Mapping[str, Any]],
    runner: Sequence[str],
    *,
    current_skill: Path | None,
    candidate_skill: Path | None,
    timeout_seconds: float = 30.0,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    results: list[dict[str, Any]] = []
    arms = (
        ("baseline", None),
        ("current", current_skill),
        ("candidate", candidate_skill),
    )
    for variant, skill_path in arms:
        for scenario in scenarios:
            results.append(
                invoke_runner(
                    runner,
                    scenario,
                    variant=variant,
                    skill_path=skill_path,
                    timeout_seconds=timeout_seconds,
                )
            )
    report = build_report(scenarios, results)
    report = bind_skill_artifacts(
        report, current_skill=current_skill, candidate_skill=candidate_skill
    )
    return results, report


def _write_json(path: Path | None, value: Any) -> None:
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path is None:
        sys.stdout.write(text)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    score = sub.add_parser("score", help="Score observed JSONL results")
    score.add_argument("--scenarios", type=Path, required=True)
    score.add_argument("--results", type=Path, required=True)
    score.add_argument("--output", type=Path)

    run = sub.add_parser(
        "run", help="Run baseline/current/candidate through a JSON runner"
    )
    run.add_argument("--scenarios", type=Path, required=True)
    run.add_argument("--runner", nargs="+", required=True)
    run.add_argument("--current-skill", type=Path)
    run.add_argument("--candidate-skill", type=Path)
    run.add_argument("--results-output", type=Path)
    run.add_argument("--report-output", type=Path)
    run.add_argument("--timeout-seconds", type=float, default=30.0)

    promote = sub.add_parser(
        "promote", help="Promote an evaluated candidate atomically"
    )
    promote.add_argument("--root", type=Path, default=Path.cwd())
    promote.add_argument("--report", type=Path, required=True)
    promote.add_argument("--candidate", type=Path, required=True)
    promote.add_argument("--target", type=Path, required=True)

    args = parser.parse_args()
    if args.command == "promote":
        if not args.report.is_file() or args.report.stat().st_size > 4 * 1024 * 1024:
            raise SkillQualityError("bounded promotion report file required")
        try:
            report = json.loads(args.report.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise SkillQualityError("promotion report is invalid JSON") from error
        target = promote_candidate(
            root=args.root,
            report=report,
            candidate=args.candidate,
            target=args.target,
        )
        print(json.dumps({"status": "promoted", "target": str(target)}))
        return 0

    scenarios = read_jsonl(args.scenarios, validate_scenario)
    if len(scenarios) > MAX_SCENARIOS:
        raise SkillQualityError(f"scenario count exceeds {MAX_SCENARIOS}")

    if args.command == "score":
        results = read_jsonl(args.results, validate_result)
        _write_json(args.output, build_report(scenarios, results))
        return 0

    results, report = evaluate(
        scenarios,
        args.runner,
        current_skill=args.current_skill,
        candidate_skill=args.candidate_skill,
        timeout_seconds=args.timeout_seconds,
    )
    if args.results_output:
        args.results_output.parent.mkdir(parents=True, exist_ok=True)
        args.results_output.write_text(
            "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in results),
            encoding="utf-8",
        )
    _write_json(args.report_output, report)
    return 0 if report["promotion"].get("promotion_allowed") else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SkillQualityError as error:
        print(f"skill-quality: {error}", file=sys.stderr)
        raise SystemExit(2)
