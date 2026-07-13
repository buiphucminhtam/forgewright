import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
ROUTING_DIR = ROOT / "evals" / "routing"
sys.path.insert(0, str(ROUTING_DIR))


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


corpus_module = _load("routing_corpus", ROUTING_DIR / "corpus.py")
evaluate_module = _load("routing_evaluate", ROUTING_DIR / "evaluate.py")


def test_corpus_has_100_unique_balanced_tasks() -> None:
    corpus = corpus_module.build_corpus()
    assert len(corpus) == 100
    assert len({task.id for task in corpus}) == 100
    counts: dict[str, int] = {}
    for task in corpus:
        counts[task.category] = counts.get(task.category, 0) + 1
        assert task.expected_tier in {"scout", "builder", "expert"}
        assert set(task.risk_signals) <= corpus_module.VALID_RISK_SIGNALS
    assert len(counts) == 10
    assert set(counts.values()) == {10}
    assert {
        "debug",
        "feature",
        "review",
        "refactor",
        "security",
        "docs",
        "operations",
    } <= set(counts)


def test_corpus_fingerprint_is_frozen() -> None:
    approved_v2_fingerprint = (
        "bcb83e2ed5f4a9ccf2a7ef6d01fca38346b14f026381826f1cb51eaafc879da4"
    )
    assert corpus_module.CORPUS_VERSION == 2
    assert corpus_module.CORPUS_SHA256 == approved_v2_fingerprint
    assert corpus_module.corpus_fingerprint() == corpus_module.CORPUS_SHA256
    assert corpus_module.canonical_payload().endswith("\n")


@pytest.mark.parametrize(
    ("successes", "total", "expected_lower", "expected_upper"),
    [
        (10, 10, 0.722467, 1.0),
        (0, 10, 0.0, 0.277533),
        (9, 10, 0.595850, 0.982124),
    ],
)
def test_wilson_interval_known_values(
    successes: int,
    total: int,
    expected_lower: float,
    expected_upper: float,
) -> None:
    interval = evaluate_module.wilson_interval(successes, total)
    assert interval["lower"] == pytest.approx(expected_lower, abs=1e-6)
    assert interval["upper"] == pytest.approx(expected_upper, abs=1e-6)


def test_perfect_router_has_no_under_routing() -> None:
    decisions = [
        {"task_id": task.id, "selected_tier": task.expected_tier}
        for task in corpus_module.build_corpus()
    ]
    report = evaluate_module.evaluate(decisions)
    assert report["accuracy"] == 1.0
    assert report["under_routed"] == 0


def test_under_routing_high_risk_task_is_detected() -> None:
    decisions = [
        {"task_id": task.id, "selected_tier": task.expected_tier}
        for task in corpus_module.build_corpus()
    ]
    decisions_by_id = {decision["task_id"]: decision for decision in decisions}
    decisions_by_id["security-01"]["selected_tier"] = "builder"
    report = evaluate_module.evaluate(list(decisions_by_id.values()))
    assert report["under_routed"] == 1
    assert report["accuracy"] == pytest.approx(0.99)


def test_missing_and_duplicate_decisions_fail_closed() -> None:
    task = corpus_module.build_corpus()[0]
    with pytest.raises(ValueError, match="missing routing decisions"):
        evaluate_module.evaluate(
            [{"task_id": task.id, "selected_tier": task.expected_tier}]
        )
    full = [
        {"task_id": item.id, "selected_tier": item.expected_tier}
        for item in corpus_module.build_corpus()
    ]
    with pytest.raises(ValueError, match="duplicate task_id"):
        evaluate_module.evaluate(full + [full[0]])


@pytest.mark.parametrize(
    ("decision", "message"),
    [
        ({"task_id": "unknown-01", "selected_tier": "scout"}, "unknown task_id"),
        (
            {"task_id": "extraction-01", "selected_tier": "invalid"},
            "invalid selected_tier",
        ),
        ({"task_id": "extraction-01"}, "invalid selected_tier"),
        ("not a decision", "must be an object"),
    ],
)
def test_invalid_decisions_fail_closed(decision: object, message: str) -> None:
    full = [
        {"task_id": item.id, "selected_tier": item.expected_tier}
        for item in corpus_module.build_corpus()
    ]
    full[0] = decision
    with pytest.raises(ValueError, match=message):
        evaluate_module.evaluate(full)


def test_report_includes_category_and_tier_shares() -> None:
    decisions = [
        {"task_id": task.id, "selected_tier": task.expected_tier}
        for task in corpus_module.build_corpus()
    ]
    report = evaluate_module.evaluate(decisions)
    assert report["expert_share"] + report["non_expert_share"] == pytest.approx(1.0)
    assert report["corpus_sha256"] == corpus_module.CORPUS_SHA256
    assert report["corpus_version"] == 2
    assert set(report["categories"]) == set(corpus_module.SCENARIOS)
    for stats in report["categories"].values():
        assert stats["total"] == 10
        assert stats["correct"] == 10
        assert stats["under_routed"] == 0
        assert stats["accuracy"] == 1.0
        assert stats["accuracy_ci95"] == pytest.approx(
            {"lower": 0.722467, "upper": 1.0}, abs=1e-6
        )


def test_cli_returns_nonzero_when_threshold_is_not_met(tmp_path: Path) -> None:
    decisions = [
        {"task_id": task.id, "selected_tier": task.expected_tier}
        for task in corpus_module.build_corpus()
    ]
    decisions[0]["selected_tier"] = "builder"
    decisions_path = tmp_path / "decisions.json"
    decisions_path.write_text(json.dumps(decisions), encoding="utf-8")

    completed = subprocess.run(
        [
            sys.executable,
            str(ROUTING_DIR / "evaluate.py"),
            str(decisions_path),
            "--min-accuracy",
            "1.0",
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 1
    assert '"accuracy": 0.99' in completed.stdout

    decisions_by_id = {decision["task_id"]: decision for decision in decisions}
    decisions_by_id["security-01"]["selected_tier"] = "builder"
    decisions_path.write_text(
        json.dumps(list(decisions_by_id.values())), encoding="utf-8"
    )
    completed = subprocess.run(
        [
            sys.executable,
            str(ROUTING_DIR / "evaluate.py"),
            str(decisions_path),
            "--min-accuracy",
            "0.0",
            "--max-under-routed",
            "0",
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 1
    assert '"under_routed": 1' in completed.stdout
