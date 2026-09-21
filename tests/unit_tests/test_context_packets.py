from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from scripts.runtime.context_packets import (
    ContextPacketError,
    compile_review_package,
    compile_worker_packet,
    resolve_review_scope,
    verify_worker_packet,
    worker_dispatch_view,
)
from scripts.runtime.execution_contract import lock_execution_contract

ROOT = Path(__file__).resolve().parents[2]


def contract() -> dict:
    return lock_execution_contract(
        {
            "requirements": "Implement the bounded task.",
            "acceptance_criteria": ["The behavior is verified."],
            "out_of_scope": ["No unrelated refactor."],
            "task_class": "standard",
        },
        [{"scope_id": "backend"}],
    )


def test_worker_packet_is_minimal_bound_and_measured():
    locked = contract()
    packet = compile_worker_packet(
        goal_id="goal-1",
        task_id="task-1",
        scope_id="backend",
        base_sha="a" * 40,
        execution_contract=locked,
        paths=["src/backend"],
        skill={"name": "software-engineer", "path": "skills/software-engineer/LITE.md"},
        interfaces=["POST /items"],
        decisions=["Keep the existing DB schema."],
        verifier_refs=["tests/items.test.ts"],
        constraints=["Do not modify tests."],
    )
    assert set(packet) == {
        "schema",
        "binding",
        "objective",
        "acceptance",
        "out_of_scope",
        "scope",
        "skill",
        "interfaces",
        "decisions",
        "verifier_refs",
        "constraints",
        "specialist_checks",
        "stats",
        "digest",
    }
    assert packet["binding"]["plan_digest"] == locked["digest"]
    assert packet["stats"]["context_bytes"] > 0
    assert packet["stats"]["estimated_tokens"] > 0
    assert "reasoning" not in str(packet).lower()
    verify_worker_packet(
        packet,
        goal_id="goal-1",
        plan_digest=locked["digest"],
        task_id="task-1",
        base_sha="a" * 40,
    )
    dispatch = worker_dispatch_view(packet)
    assert "stats" not in dispatch
    assert "token" not in str(dispatch).lower()
    assert dispatch["digest"] != packet["digest"]


def test_worker_packet_rejects_stale_binding_and_scope_drift():
    locked = contract()
    with pytest.raises(ContextPacketError, match="not bound"):
        compile_worker_packet(
            goal_id="goal-1",
            task_id="task-1",
            scope_id="frontend",
            base_sha="a" * 40,
            execution_contract=locked,
            paths=["src/frontend"],
        )
    packet = compile_worker_packet(
        goal_id="goal-1",
        task_id="task-1",
        scope_id="backend",
        base_sha="a" * 40,
        execution_contract=locked,
        paths=["src/backend"],
    )
    with pytest.raises(ContextPacketError, match="stale worker packet binding"):
        verify_worker_packet(
            packet,
            goal_id="goal-1",
            plan_digest=locked["digest"],
            task_id="task-2",
            base_sha="a" * 40,
        )


def test_review_scope_widening_requires_risk_or_planned_final():
    assert (
        resolve_review_scope("task", planned_final=False, cross_cutting_risks=[])[
            "reason"
        ]
        == "bounded_task"
    )
    with pytest.raises(ContextPacketError, match="requires planned_final"):
        resolve_review_scope("branch", planned_final=False, cross_cutting_risks=[])
    assert resolve_review_scope(
        "branch", planned_final=False, cross_cutting_risks=["public_contract"]
    )["reason"].startswith("cross_cutting_risk:")
    assert (
        resolve_review_scope("release", planned_final=True, cross_cutting_risks=[])[
            "reason"
        ]
        == "planned_final_review"
    )


def _git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


def test_review_package_uses_base_head_and_task_scope(tmp_path: Path):
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.email", "tests@example.com")
    _git(tmp_path, "config", "user.name", "Tests")
    (tmp_path / "a.txt").write_text("one\n")
    (tmp_path / "b.txt").write_text("one\n")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "base")
    base = _git(tmp_path, "rev-parse", "HEAD")
    (tmp_path / "a.txt").write_text("two\n")
    (tmp_path / "b.txt").write_text("two\n")
    _git(tmp_path, "commit", "-am", "change both")
    head = _git(tmp_path, "rev-parse", "HEAD")

    packet = compile_review_package(
        tmp_path,
        base_sha=base,
        head_sha=head,
        review_scope="task",
        task_paths=["a.txt"],
        goal_id="goal-1",
        plan_digest="b" * 64,
        acceptance=["a changes"],
        verification_refs=["tests/a.test"],
    )
    assert packet["changed_paths"] == ["a.txt"]
    assert "a.txt" in packet["diff"]
    assert "b.txt" not in packet["diff"]
    assert packet["scope"]["scope"] == "task"
    assert packet["binding"]["base_sha"] == base
    assert packet["binding"]["head_sha"] == head
    assert "private_reasoning" not in packet


def test_review_package_rejects_unrelated_base(tmp_path: Path):
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.email", "tests@example.com")
    _git(tmp_path, "config", "user.name", "Tests")
    (tmp_path / "a").write_text("1")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "one")
    first = _git(tmp_path, "rev-parse", "HEAD")
    _git(tmp_path, "checkout", "--orphan", "other")
    (tmp_path / "a").write_text("2")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "other")
    other = _git(tmp_path, "rev-parse", "HEAD")
    with pytest.raises(ContextPacketError, match="ancestor"):
        compile_review_package(
            tmp_path,
            base_sha=first,
            head_sha=other,
            review_scope="release",
            planned_final=True,
        )


def test_parallel_runner_attaches_rehashed_minimal_worker_packet():
    import importlib.util

    runner_path = ROOT / "scripts/parallel-dispatch-runner.py"
    spec = importlib.util.spec_from_file_location("context_packet_runner", runner_path)
    assert spec and spec.loader
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    request = {
        "task_id": "packet-task",
        "goal_id": "goal-packet",
        "task_size": "large",
        "task_class": "standard",
        "requirements": "Inspect the bounded scopes.",
        "acceptance_criteria": ["Return exact evidence."],
        "out_of_scope": ["No unrelated files."],
        "scopes": [
            {
                "id": "one",
                "paths": ["scripts/runtime"],
                "independent": True,
                "risk_signals": [],
            },
            {
                "id": "two",
                "paths": ["tests/unit_tests"],
                "independent": True,
                "risk_signals": [],
            },
        ],
        "limits": {"concurrency": 2, "deadline_ms": 30000},
        "interfaces": ["context-packet/v1"],
        "decisions": ["Keep worker context minimal."],
        "verifier_refs": ["tests/unit_tests/test_context_packets.py"],
    }
    plan = runner.build_plan(
        {
            "version": 1,
            "request": {**request, "workspace": str(ROOT)},
            "provider": {"cli": "agy"},
        },
        ROOT,
    )
    head = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()
    for worker in plan["workers"]:
        packet = worker["context_packet"]
        assert packet["schema"] == "forgewright-worker-packet/v1"
        assert packet["binding"]["goal_id"] == "goal-packet"
        assert packet["binding"]["base_sha"] == head
        assert packet["binding"]["plan_digest"] == plan["execution_contract"]["digest"]
        assert "stats" not in packet
        assert "token" not in json.dumps(packet).lower()
        assert worker["context_stats"]["context_bytes"] > 0
        assert worker["context_stats"]["estimated_tokens"] > 0
        assert worker["native_dispatch_packet"]["context_packet"] == packet
        assert "context_stats" not in worker["native_dispatch_packet"]
        prompt = worker["argv"][-1]
        assert "Compiled worker packet:" in prompt
        assert "Locked acceptance:" not in prompt


def test_orchestration_review_scope_is_task_bounded_by_default_and_fail_closed_on_widening():
    from scripts.runtime.orchestration_policy import PolicyError, decide_orchestration

    base = {
        "task_id": "review-scope",
        "task_size": "medium",
        "requirements": "Review bounded work.",
        "diff": "diff --git a/a b/a",
        "raw_evidence": ["pytest pass"],
        "independent_review": True,
        "scopes": [
            {"id": "a", "paths": ["a"], "independent": True, "risk_signals": []},
            {"id": "b", "paths": ["b"], "independent": True, "risk_signals": []},
        ],
        "limits": {"concurrency": 2, "deadline_ms": 30000},
    }
    default = decide_orchestration(dict(base))
    assert default["reviewer"]["review_scope"] == {
        "scope": "task",
        "reason": "bounded_task",
        "cross_cutting_risks": [],
    }
    with pytest.raises(PolicyError, match="widening review scope"):
        decide_orchestration({**base, "review_scope": "branch"})
    widened = decide_orchestration(
        {
            **base,
            "review_scope": "branch",
            "review_cross_cutting_risks": ["public_contract"],
        }
    )
    assert widened["reviewer"]["review_scope"]["scope"] == "branch"
    assert (
        widened["reviewer"]["review_scope"]["reason"]
        == "cross_cutting_risk:public_contract"
    )
    final = decide_orchestration(
        {**base, "review_scope": "release", "review_planned_final": True}
    )
    assert final["reviewer"]["review_scope"]["reason"] == "planned_final_review"


def test_parallel_runner_compiles_exact_git_review_package(tmp_path: Path):
    import importlib.util

    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.email", "tests@example.com")
    _git(tmp_path, "config", "user.name", "Tests")
    (tmp_path / "a.txt").write_text("one\n")
    (tmp_path / "b.txt").write_text("one\n")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "base")
    base = _git(tmp_path, "rev-parse", "HEAD")
    (tmp_path / "a.txt").write_text("two\n")
    (tmp_path / "b.txt").write_text("two\n")
    _git(tmp_path, "commit", "-am", "change")
    head = _git(tmp_path, "rev-parse", "HEAD")

    runner_path = ROOT / "scripts/parallel-dispatch-runner.py"
    spec = importlib.util.spec_from_file_location("review_packet_runner", runner_path)
    assert spec and spec.loader
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    request = {
        "task_id": "review-packet-task",
        "goal_id": "goal-review",
        "task_size": "medium",
        "requirements": "Review the bounded diff.",
        "acceptance_criteria": ["Only a.txt is in task review."],
        "out_of_scope": ["b.txt"],
        "diff": "caller prose diff must not become package truth",
        "raw_evidence": ["caller prose evidence"],
        "independent_review": True,
        "review_scope": "task",
        "review_base_sha": base,
        "review_head_sha": head,
        "review_paths": ["a.txt"],
        "review_verification_refs": ["tests/a.test"],
        "scopes": [
            {"id": "a", "paths": ["a.txt"], "independent": True, "risk_signals": []},
            {"id": "b", "paths": ["b.txt"], "independent": True, "risk_signals": []},
        ],
        "limits": {"concurrency": 2, "deadline_ms": 30000},
        "workspace": str(tmp_path),
    }
    plan = runner.build_plan(
        {"version": 1, "request": request, "provider": {"cli": "agy"}}, tmp_path
    )
    review = plan["reviewer"]["review_package"]
    assert review["binding"]["base_sha"] == base
    assert review["binding"]["head_sha"] == head
    assert review["changed_paths"] == ["a.txt"]
    assert "a.txt" in review["diff"] and "b.txt" not in review["diff"]
    prompt = plan["reviewer"]["argv"][-1]
    assert "Review package:" in prompt
    assert "caller prose diff must not become package truth" not in prompt
    assert "caller prose evidence" not in prompt
