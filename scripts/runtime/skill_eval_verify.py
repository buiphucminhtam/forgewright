"""Independent, process-local semantic judgments for skill-quality v1.

Only the trusted host calls these APIs. Persisted JSON and reconstructed
objects never establish issuance. Hashes detect changes, not evaluator honesty
or same-user modification of Python memory/code. No generic collector, model
receipt parser, participant inference or provider framework is implemented.
"""

from __future__ import annotations

import hashlib
import inspect
import json
import marshal
from dataclasses import dataclass, fields, is_dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Any, Callable, Mapping, Sequence

import skill_eval_host as host
import skill_quality as quality


def _plain(value):
    if is_dataclass(value) and not isinstance(value, type):
        return {
            field.name: _plain(getattr(value, field.name)) for field in fields(value)
        }
    if isinstance(value, Mapping):
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_plain(item) for item in value]
    return value


def _freeze(value):
    if isinstance(value, Mapping):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, (tuple, list)):
        return tuple(_freeze(item) for item in value)
    return value


def _digest(value):
    return quality.canonical_digest(_plain(value))


def _files(paths):
    result = {}
    for path in paths:
        path = Path(path)
        if (
            path.is_symlink()
            or not path.is_file()
            or path.stat().st_size > 4 * 1024 * 1024
        ):
            raise ValueError("bounded regular dependency file required")
        result[str(path.resolve())] = hashlib.sha256(path.read_bytes()).hexdigest()
    return _freeze(result)


def _fresh(files):
    try:
        return _files(tuple(files)) == files
    except (OSError, ValueError):
        return False


@dataclass(frozen=True)
class Finding:
    observed: bool
    spans: tuple[str, ...]
    diagnosis: str


@dataclass(frozen=True)
class Decision:
    triggered: Finding
    abstained: Finding
    events: Mapping[str, Finding]
    rationalizations: Mapping[str, Finding]
    evidence: tuple[str, ...]
    disagreements: tuple[str, ...] = ()


@dataclass(frozen=True)
class FrozenComparison:
    current_skill: Path
    candidate_skill: Path
    sources: Mapping
    dependencies: Mapping
    digest: str


@dataclass(frozen=True)
class FrozenOracle:
    cases: tuple[Mapping, ...]
    source_facts: Mapping
    evaluator: Callable
    owner: str
    candidate_author: str
    dependencies: Mapping
    digest: str
    comparison: FrozenComparison | None = None


@dataclass(frozen=True)
class Judgment:
    run_id: str
    case_id: str
    oracle_digest: str
    observer: str
    decision: Decision
    raw_artifacts: Mapping


@dataclass(frozen=True)
class FrozenManifest:
    oracle: FrozenOracle
    run_manifests: Mapping
    current_skill: Path
    candidate_skill: Path
    dependencies: Mapping
    comparison: FrozenComparison
    digest: str


@dataclass(frozen=True)
class VerifiedObservation:
    ref: str
    plan_digest: str
    collector_id: str
    capabilities: tuple[str, ...]
    run_id: str
    source_digest: str
    build_digest: str
    raw_artifacts: Mapping
    measurements: Mapping


# Identity registries are intentionally not serializable registration APIs.
_ORACLES: dict[int, tuple[FrozenOracle, object]] = {}
_JUDGMENTS: dict[int, tuple[Judgment, host.HostRun, FrozenOracle]] = {}
_MANIFESTS: dict[int, FrozenManifest] = {}
_COMPARISONS: dict[int, FrozenComparison] = {}


def freeze_comparison(
    *,
    current_skill: Path,
    candidate_skill: Path,
    shared_sources: Sequence[Mapping] = (),
    dependency_deltas: Sequence[tuple[Path | None, Path | None]] = (),
) -> FrozenComparison:
    """Freeze declared arm contexts before freeze_oracle/capture, including roles.

    Baseline gets only the common bundle; current/candidate get that bundle,
    their target and explicitly paired dependency revisions. A missing side
    declares addition/removal. Any deliberate delta enters the oracle digest.
    """
    all_paths = [current_skill, candidate_skill]
    current_skill, candidate_skill = (
        Path(current_skill).resolve(),
        Path(candidate_skill).resolve(),
    )
    deltas = []
    for pair in dependency_deltas:
        if len(pair) != 2 or pair == (None, None):
            raise ValueError(
                "explicit current/candidate dependency delta pair required"
            )
        all_paths.extend(path for path in pair if path is not None)
        deltas.append(
            tuple(Path(path).resolve() if path is not None else None for path in pair)
        )
    for entry in shared_sources:
        if (
            set(entry) != {"path", "sha256", "kind", "arm"}
            or entry["kind"] not in {"instruction", "dependency"}
            or entry["arm"] != "shared"
            or not Path(entry["path"]).is_absolute()
        ):
            raise ValueError("exact shared source roles required")
        all_paths.append(Path(entry["path"]))
    files = _files(all_paths)

    def entry(path, kind, arm):
        return {"path": str(path), "sha256": files[str(path)], "kind": kind, "arm": arm}

    shared = []
    specific_hashes = {files[str(current_skill)], files[str(candidate_skill)]}
    specific_hashes.update(
        files[str(path)] for pair in deltas for path in pair if path is not None
    )
    for source in shared_sources:
        canonical = entry(Path(source["path"]).resolve(), source["kind"], "shared")
        if dict(source) != canonical or source["sha256"] in specific_hashes:
            raise ValueError("shared context aliases arm-specific source bytes")
        shared.append(canonical)
    sources = {
        "baseline": list(shared),
        "current": [*shared, entry(current_skill, "instruction", "current")],
        "candidate": [*shared, entry(candidate_skill, "instruction", "candidate")],
    }
    for before, after in deltas:
        if (
            before is not None
            and after is not None
            and files[str(before)] == files[str(after)]
        ):
            raise ValueError("unchanged dependency belongs in common context")
        if before is not None:
            if files[str(before)] == files[str(candidate_skill)]:
                raise ValueError("current context aliases candidate instruction bytes")
            sources["current"].append(entry(before, "dependency", "current"))
        if after is not None:
            if files[str(after)] == files[str(current_skill)]:
                raise ValueError("candidate context aliases current instruction bytes")
            sources["candidate"].append(entry(after, "dependency", "candidate"))
    for entries in sources.values():
        if len({item["path"] for item in entries}) != len(entries):
            raise ValueError("duplicate source in comparison context")
    core = {
        "sources": sources,
        "dependencies": files,
        "current": str(current_skill),
        "candidate": str(candidate_skill),
    }
    comparison = FrozenComparison(
        current_skill, candidate_skill, _freeze(sources), files, _digest(core)
    )
    _COMPARISONS[id(comparison)] = comparison
    return comparison


def freeze_oracle(
    cases: Sequence[Mapping],
    *,
    source_facts: Mapping,
    evaluator: Callable,
    owner: str,
    candidate_author: str,
    dependencies: Sequence[Path] = (),
    comparison: FrozenComparison | None = None,
) -> FrozenOracle:
    if not owner or not candidate_author or owner == candidate_author:
        raise ValueError("independent oracle owner must differ from candidate author")
    if not inspect.isfunction(evaluator) or not inspect.getsourcefile(evaluator):
        raise ValueError("source-file-backed independent evaluator required")
    rows = tuple(quality.validate_scenario(_plain(row)) for row in cases)
    ids = {row["id"] for row in rows}
    if not rows or len(ids) != len(rows) or set(source_facts) != ids:
        raise ValueError("unique cases and exactly case-bound source facts required")
    # JSON round trip rejects arbitrary objects and aliases before freezing.
    facts = json.loads(json.dumps(_plain(source_facts), allow_nan=False))
    if comparison is not None and (
        _COMPARISONS.get(id(comparison)) is not comparison
        or not _fresh(comparison.dependencies)
    ):
        raise ValueError("issued fresh pre-capture comparison contract required")
    files = _files(
        (
            *dependencies,
            Path(inspect.getsourcefile(evaluator)),
            *(comparison.dependencies if comparison else ()),
        )
    )
    code = marshal.dumps(evaluator.__code__)
    core = {
        "cases": rows,
        "source_facts": facts,
        "owner": owner,
        "candidate_author": candidate_author,
        "comparison": comparison.digest if comparison else "target-only",
        "dependencies": files,
        "evaluator": {
            "module": evaluator.__module__,
            "name": evaluator.__qualname__,
            "code_sha256": hashlib.sha256(code).hexdigest(),
        },
    }
    oracle = FrozenOracle(
        _freeze(rows),
        _freeze(facts),
        evaluator,
        owner,
        candidate_author,
        files,
        _digest(core),
        comparison,
    )
    _ORACLES[id(oracle)] = (oracle, evaluator.__code__)
    return oracle


def _oracle_valid(oracle):
    issued = _ORACLES.get(id(oracle))
    return (
        issued is not None
        and issued[0] is oracle
        and oracle.evaluator.__code__ is issued[1]
        and _fresh(oracle.dependencies)
    )


def _finding(value, text):
    if (
        not isinstance(value, Finding)
        or type(value.observed) is not bool
        or not isinstance(value.diagnosis, str)
        or not value.diagnosis.strip()
        or not value.spans
        or len(value.spans) > 64
        or any(
            not isinstance(span, str) or not span or span not in text
            for span in value.spans
        )
    ):
        raise ValueError(
            "each independent finding requires exact raw spans and diagnosis"
        )
    return Finding(value.observed, tuple(value.spans), value.diagnosis)


def judge_run(run: host.HostRun, *, case: Mapping, oracle: FrozenOracle) -> Judgment:
    if not isinstance(run, host.HostRun) or not host.verify_issued_run(run):
        raise ValueError("host-issued run identity required")
    if not _oracle_valid(oracle):
        raise ValueError("unissued or stale oracle/evaluator dependencies")
    case = quality.validate_scenario(_plain(case))
    frozen = next((c for c in oracle.cases if c["id"] == case["id"]), None)
    if frozen is None or _plain(frozen) != case or run.record["case_id"] != case["id"]:
        raise ValueError("exact frozen case binding required")
    manifest = json.loads((run.output_dir / "manifest.json").read_bytes())
    payload = json.loads((run.output_dir / "payload.json").read_bytes())
    if (
        manifest["oracle_digest"] != oracle.digest
        or payload["prompt"] != case["prompt"]
        or payload["source_facts"] != _plain(oracle.source_facts[case["id"]])
    ):
        raise ValueError("oracle/public payload source binding mismatch")
    text = "\n".join(run.record["output"])
    if not text:
        raise ValueError("unobserved decision cannot be judged")
    # No labels are read from model output. This source-frozen, host-selected
    # evaluator actually executes calculations/judgment over captured text.
    decision = oracle.evaluator(text, oracle.source_facts[case["id"]], frozen)
    if not isinstance(decision, Decision):
        raise ValueError("independent evaluator must return a Decision")
    expected = set(case["required_events"]) | set(case["forbidden_events"])
    if set(decision.events) != expected or set(decision.rationalizations) != set(
        case["rationalization_traps"]
    ):
        raise ValueError(
            "every required/forbidden/trap outcome must be independently judged"
        )
    if (
        not decision.evidence
        or len(decision.evidence) > 64
        or any(
            not isinstance(item, str) or not item.strip() for item in decision.evidence
        )
        or any(
            not isinstance(item, str) or not item.strip()
            for item in decision.disagreements
        )
    ):
        raise ValueError("independently executed source/calculation evidence required")
    decision = Decision(
        _finding(decision.triggered, text),
        _finding(decision.abstained, text),
        _freeze({key: _finding(value, text) for key, value in decision.events.items()}),
        _freeze(
            {
                key: _finding(value, text)
                for key, value in decision.rationalizations.items()
            }
        ),
        tuple(decision.evidence),
        tuple(decision.disagreements),
    )
    judgment = Judgment(
        run.run_id,
        case["id"],
        oracle.digest,
        oracle.owner,
        decision,
        _freeze(_plain(run.record["artifacts"])),
    )
    _JUDGMENTS[id(judgment)] = (judgment, run, oracle)
    return judgment


def freeze_manifest(
    oracle: FrozenOracle,
    *,
    run_manifests: Mapping,
    current_skill: Path,
    candidate_skill: Path,
    dependencies: Sequence[Path] = (),
) -> FrozenManifest:
    if not _oracle_valid(oracle):
        raise ValueError("issued fresh oracle required")
    expected = {(case["id"], arm) for case in oracle.cases for arm in quality.VARIANTS}
    if set(run_manifests) != expected or any(
        not isinstance(digest, str)
        or len(digest) != 64
        or any(c not in "0123456789abcdef" for c in digest)
        for digest in run_manifests.values()
    ):
        raise ValueError("exact frozen case/arm run manifest digests required")
    current_skill, candidate_skill = (
        Path(current_skill).resolve(),
        Path(candidate_skill).resolve(),
    )
    comparison = oracle.comparison or freeze_comparison(
        current_skill=current_skill, candidate_skill=candidate_skill
    )
    if (
        comparison.current_skill != current_skill
        or comparison.candidate_skill != candidate_skill
    ):
        raise ValueError("comparison target binding mismatch")
    files = _files(
        (
            *comparison.dependencies,
            *oracle.dependencies,
            *dependencies,
            current_skill,
            candidate_skill,
            Path(__file__),
            *host.runtime_source_paths(),
            Path(quality.__file__),
        )
    )
    core = {
        "oracle": oracle.digest,
        "comparison": comparison.digest,
        "runs": sorted([*key, value] for key, value in run_manifests.items()),
        "dependencies": files,
        "current": str(current_skill),
        "candidate": str(candidate_skill),
    }
    manifest = FrozenManifest(
        oracle,
        MappingProxyType(dict(run_manifests)),
        current_skill,
        candidate_skill,
        files,
        comparison,
        _digest(core),
    )
    _MANIFESTS[id(manifest)] = manifest
    return manifest


class TrustedRunRegistry:
    """Construct only in the trusted capture/judge process; not from report JSON."""

    def __init__(self, manifest: FrozenManifest):
        if _MANIFESTS.get(id(manifest)) is not manifest:
            raise ValueError("host-frozen manifest required")
        self._manifest = manifest
        self._entries = {}

    def add(self, run: host.HostRun, judgment: Judgment) -> None:
        issued = _JUDGMENTS.get(id(judgment))
        if (
            issued is None
            or issued[0] is not judgment
            or issued[1] is not run
            or issued[2] is not self._manifest.oracle
        ):
            raise ValueError("independently issued judgment/run identity required")
        key = (judgment.case_id, run.record["arm"])
        if key in self._entries or any(
            r.run_id == run.run_id for r, _ in self._entries.values()
        ):
            raise ValueError("duplicate case/arm or run reuse")
        if self._manifest.run_manifests.get(
            key
        ) != run.manifest_digest or not host.verify_issued_run(run):
            raise ValueError("frozen run manifest mismatch or changed artifacts")
        raw_manifest = json.loads((run.output_dir / "manifest.json").read_bytes())
        expected_sources = _plain(self._manifest.comparison.sources[run.record["arm"]])
        if raw_manifest["instruction_manifest"] != expected_sources:
            raise ValueError(
                "comparison context source bytes/roles differ from frozen arm contract"
            )
        config_fields = ("runtime", "model", "effort", "executable", "limits")
        config = {field: raw_manifest[field] for field in config_fields}
        for other, _ in self._entries.values():
            previous = json.loads((other.output_dir / "manifest.json").read_bytes())
            if any(previous[field] != config[field] for field in config_fields):
                raise ValueError(
                    "comparison runtime/model/effort/tools/limits configuration drift"
                )
            if other.record.get("native_control_digest") != run.record.get(
                "native_control_digest"
            ):
                raise ValueError("comparison native control/capability drift")
            if (
                previous["case_id"] == raw_manifest["case_id"]
                and previous["repetition"] != raw_manifest["repetition"]
            ):
                raise ValueError("comparison repetition mismatch")
            if (
                other.record["executable"]["sha256"]
                != run.record["executable"]["sha256"]
            ):
                raise ValueError("comparison executable bytes differ")
        self._entries[key] = (run, judgment)

    def _valid(self):
        return (
            _MANIFESTS.get(id(self._manifest)) is self._manifest
            and _oracle_valid(self._manifest.oracle)
            and _fresh(self._manifest.dependencies)
            and set(self._entries) == set(self._manifest.run_manifests)
            and all(
                host.verify_issued_run(
                    r, manifest_digest=self._manifest.run_manifests[key]
                )
                for key, (r, _) in self._entries.items()
            )
        )

    def _results(self):
        results = []
        for (case_id, arm), (run, judgment) in sorted(self._entries.items()):
            decision = judgment.decision
            record = run.record
            byte_count = record["submitted_context_bytes"]
            if (
                type(byte_count) is not int
                or byte_count != (run.output_dir / "payload.json").stat().st_size
            ):
                raise ValueError("submitted payload byte count mismatch")
            # v1 requires numeric fields. Missing tools are represented only for
            # diagnostic projection, explicitly marked unknown in observed binding;
            # _eligible rejects them before promotion/receipt resolution.
            results.append(
                quality.validate_result(
                    {
                        "schema": quality.RESULT_SCHEMA,
                        "scenario_id": case_id,
                        "skill": next(
                            c["skill"]
                            for c in self._manifest.oracle.cases
                            if c["id"] == case_id
                        ),
                        "variant": arm,
                        "triggered": decision.triggered.observed,
                        "abstained": decision.abstained.observed,
                        "events": sorted(
                            k for k, value in decision.events.items() if value.observed
                        ),
                        "rationalizations": sorted(
                            k
                            for k, value in decision.rationalizations.items()
                            if value.observed
                        ),
                        "unnecessary_actions": [],
                        "tool_calls": record["tool_calls"]
                        if record["tool_calls"] is not None
                        else 0,
                        "context_bytes": byte_count,
                        "wall_ms": record["elapsed_ms"],
                    }
                )
            )
        return results

    def build_report(self):
        scenarios = [_plain(c) for c in self._manifest.oracle.cases]
        report = quality.bind_skill_artifacts(
            quality.build_report(scenarios, self._results()),
            current_skill=self._manifest.current_skill,
            candidate_skill=self._manifest.candidate_skill,
        )
        report["observed"] = {
            "plan_digest": self._manifest.digest,
            "oracle_digest": self._manifest.oracle.digest,
            "comparison_digest": self._manifest.comparison.digest,
            "runs": [
                {
                    "run_id": r.run_id,
                    "manifest_digest": r.manifest_digest,
                    "observer": j.observer,
                    "raw_artifacts": _plain(j.raw_artifacts),
                    "submitted_context_bytes": r.record["submitted_context_bytes"],
                    "tool_calls_observed": r.record["tool_calls"] is not None,
                    "disagreements": list(j.decision.disagreements),
                    "decision": _plain(j.decision),
                    "host_failures": list(r.record["failures"]),
                    "promotion_eligible": r.promotion_eligible,
                    "output_dir": str(r.output_dir),
                }
                for _, (r, j) in sorted(self._entries.items())
            ],
            "limitations": [
                "Full provider/global context and billing cost unavailable; no efficiency-only eligibility",
                "Diagnostic v1 tool_calls=0 when unobserved; cannot establish efficiency or promotion",
                "Hashes/process identities do not authenticate same-user evaluator honesty",
            ],
        }
        return report

    def _eligible(self, run, judgment):
        record = run.record
        return (
            run.success is True
            and run.promotion_eligible is True
            and record["fixture"] is False
            and record["success"] is True
            and record["promotion_eligible"] is True
            and type(record["tool_calls"]) is int
            and record["tool_calls"] >= 0
            and not judgment.decision.disagreements
        )

    def resolve_observation(
        self, ref: str, *, plan_digest: str
    ) -> VerifiedObservation | None:
        if plan_digest != self._manifest.digest or not self._valid():
            return None
        for run, judgment in self._entries.values():
            if run.run_id == ref and self._eligible(run, judgment):
                return VerifiedObservation(
                    ref,
                    plan_digest,
                    judgment.observer,
                    ("agent-decision",),
                    run.run_id,
                    _digest(
                        {
                            "instruction_manifest": json.loads(
                                (run.output_dir / "manifest.json").read_bytes()
                            )["instruction_manifest"]
                        }
                    ),
                    run.manifest_digest,
                    judgment.raw_artifacts,
                    _freeze(
                        {
                            "submitted_context_bytes": run.record[
                                "submitted_context_bytes"
                            ],
                            "wall_ms": run.record["elapsed_ms"],
                            "tool_calls": run.record["tool_calls"],
                        }
                    ),
                )
        return None


def verify_observed_report(
    report: Mapping[str, Any], *, registry: TrustedRunRegistry, manifest: FrozenManifest
) -> bool:
    try:
        if (
            not isinstance(registry, TrustedRunRegistry)
            or registry._manifest is not manifest
            or not registry._valid()
            or report.get("evaluation_kind")
            in {"fixture", "synthetic", "contract-replay"}
            or any(not registry._eligible(r, j) for r, j in registry._entries.values())
        ):
            return False
        recomputed = registry.build_report()
        if (
            dict(report) != recomputed
            or not recomputed["promotion"]["promotion_allowed"]
        ):
            return False
        # Unknown full context/cost and unjudged unnecessary actions never prove
        # efficiency alone, even if the legacy aggregate assessment allows it.
        if not recomputed["promotion"]["quality_improved"]:
            return False
        by_key = {
            (row["scenario_id"], row["variant"]): row for row in registry._results()
        }
        for case in manifest.oracle.cases:
            current = by_key[(case["id"], "current")]
            candidate = by_key[(case["id"], "candidate")]
            if (candidate["triggered"] == case["should_trigger"]) < (
                current["triggered"] == case["should_trigger"]
            ):
                return False
            if (
                not case["should_trigger"]
                and candidate["abstained"] < current["abstained"]
            ):
                return False
            for label in case["required_events"]:
                if label in current["events"] and label not in candidate["events"]:
                    return False
            for field, labels in (
                ("events", case["forbidden_events"]),
                ("rationalizations", case["rationalization_traps"]),
            ):
                if any(
                    label in candidate[field] and label not in current[field]
                    for label in labels
                ):
                    return False
        return True
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return False
