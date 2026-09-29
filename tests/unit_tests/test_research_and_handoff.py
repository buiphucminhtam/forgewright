"""Tests for Adopt/Extend/Build research decisions and resumable handoff."""

from __future__ import annotations

import subprocess
from pathlib import Path
import pytest

from scripts.runtime.research_decision import (
    ResearchDecisionError,
    compile_research_decision,
    verify_research_decision,
)
from scripts.runtime.resumable_handoff import (
    HandoffError,
    compile_resumable_handoff,
    validate_resume_checkpoint,
)

ROOT = Path(__file__).resolve().parents[2]


# ─── Research Decision Tests ────────────────────────────────────────


def test_valid_research_decision():
    record = compile_research_decision(
        requirement="Optimize vector search index serialization",
        decision="EXTEND",
        chosen_rationale="Extend existing binary format rather than introducing new dependency",
        verification_source="bench/vector-serialization.test.ts",
        searched_sources=[
            {
                "source": "https://github.com/example/vector-format",
                "version": "2.1.0",
                "access_status": "accessible",
                "query": "zero-copy vector serialization",
            }
        ],
        alternatives_evaluated=[
            {
                "name": "sqlite-vec",
                "rationale": "High overhead for our low-memory Macmini target",
                "rejection_reason": "resource_budget_exceeded",
            }
        ],
        tradeoffs_and_risks=["Custom binary parser needs fuzz testing"],
        limitations=["In-memory only; persistence deferred"],
    )
    assert record["schema"] == "forgewright-research-decision/v1"
    assert record["decision"] == "EXTEND"
    assert record["digest"]
    verified = verify_research_decision(record)
    assert verified["digest"] == record["digest"]


def test_missing_provenance_rejected():
    with pytest.raises(
        ResearchDecisionError, match="searched_sources must not be empty"
    ):
        compile_research_decision(
            requirement="Add complex caching",
            decision="ADOPT",
            chosen_rationale="Adopt library",
            verification_source="test.py",
            searched_sources=[],
            research_required=True,
        )


def test_inaccessible_source_recorded_honestly():
    record = compile_research_decision(
        requirement="Check internal telemetry schema",
        decision="BUILD",
        chosen_rationale="Build minimal schema locally since upstream repo is inaccessible",
        verification_source="test_schema.py",
        searched_sources=[
            {
                "source": "internal://telemetry-spec",
                "version": "1.0",
                "access_status": "inaccessible",
                "query": "telemetry v2 schema",
            }
        ],
        tradeoffs_and_risks=["May diverge from upstream specification"],
        limitations=["Upstream source inaccessible during turn"],
    )
    assert record["searched_sources"][0]["access_status"] == "inaccessible"
    assert "inaccessible during turn" in record["limitations"][0]


def test_bounded_no_research_path_for_trivial_fixes():
    record = compile_research_decision(
        requirement="Fix typo in error message",
        decision="BUILD",
        chosen_rationale="Trivial string fix in local error handler",
        verification_source="test_error.py",
        research_required=False,
    )
    assert record["research_required"] is False
    assert record["searched_sources"][0]["query"] == "local_fix"


# ─── Resumable Handoff Tests ────────────────────────────────────────


def _git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


def test_valid_handoff_and_resume(tmp_path: Path):
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.email", "tests@example.com")
    _git(tmp_path, "config", "user.name", "Tests")
    (tmp_path / "app.py").write_text("print(1)\n")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "initial")
    head = _git(tmp_path, "rev-parse", "HEAD")

    checkpoint = compile_resumable_handoff(
        tmp_path,
        project_id="proj-1",
        goal_id="goal-1",
        plan_digest="a" * 64,
        base_sha=head,
        head_sha=head,
        source_verifier_sha256s=["b" * 64],
        changed_scope=["app.py"],
        unresolved_risks=["Low disk space"],
        next_action="run_independent_audit",
    )
    assert checkpoint["tool_authority"] is False
    assert checkpoint["requires_workspace_regrounding"] is True

    # Validate against same workspace
    resumed = validate_resume_checkpoint(
        tmp_path,
        checkpoint,
        expected_project_id="proj-1",
        expected_goal_id="goal-1",
        expected_plan_digest="a" * 64,
    )
    assert resumed["binding"]["head_sha"] == head


def test_wrong_project_or_plan_rejected(tmp_path: Path):
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.email", "tests@example.com")
    _git(tmp_path, "config", "user.name", "Tests")
    (tmp_path / "a").write_text("1")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "1")
    head = _git(tmp_path, "rev-parse", "HEAD")

    checkpoint = compile_resumable_handoff(
        tmp_path,
        project_id="proj-correct",
        goal_id="goal-1",
        plan_digest="a" * 64,
        base_sha=head,
        head_sha=head,
        source_verifier_sha256s=["b" * 64],
    )
    with pytest.raises(HandoffError, match="wrong project"):
        validate_resume_checkpoint(
            tmp_path, checkpoint, expected_project_id="proj-other"
        )

    with pytest.raises(HandoffError, match="stale plan"):
        validate_resume_checkpoint(tmp_path, checkpoint, expected_plan_digest="c" * 64)


def test_dirty_tree_drift_at_same_head_rejected(tmp_path: Path):
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.email", "tests@example.com")
    _git(tmp_path, "config", "user.name", "Tests")
    (tmp_path / "code.py").write_text("initial code\n")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "commit 1")
    head = _git(tmp_path, "rev-parse", "HEAD")

    checkpoint = compile_resumable_handoff(
        tmp_path,
        project_id="proj-drift",
        goal_id="goal-drift",
        plan_digest="d" * 64,
        base_sha=head,
        head_sha=head,
        source_verifier_sha256s=["e" * 64],
    )

    # HEAD stays unchanged, but worktree file is edited (dirty drift!)
    (tmp_path / "code.py").write_text("tampered code\n")

    with pytest.raises(HandoffError, match="dirty-tree drift detected at same HEAD"):
        validate_resume_checkpoint(tmp_path, checkpoint)


def test_checkpoint_cannot_grant_tool_authority(tmp_path: Path):
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.email", "tests@example.com")
    _git(tmp_path, "config", "user.name", "Tests")
    (tmp_path / "a").write_text("1")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "1")
    head = _git(tmp_path, "rev-parse", "HEAD")

    checkpoint = compile_resumable_handoff(
        tmp_path,
        project_id="proj-auth",
        goal_id="goal-auth",
        plan_digest="a" * 64,
        base_sha=head,
        head_sha=head,
        source_verifier_sha256s=["b" * 64],
    )
    checkpoint["tool_authority"] = True
    from scripts.runtime.resumable_handoff import _digest

    checkpoint["digest"] = _digest(
        {k: v for k, v in checkpoint.items() if k != "digest"}
    )

    with pytest.raises(HandoffError, match="checkpoint cannot grant tool authority"):
        validate_resume_checkpoint(tmp_path, checkpoint)


def test_research_decision_cli_compile_and_verify(tmp_path: Path):
    out_file = tmp_path / "decision.json"
    res = subprocess.run(
        [
            "python3",
            "scripts/runtime/research_decision.py",
            "compile",
            "--requirement",
            "Local string cleanup",
            "--decision",
            "BUILD",
            "--chosen-rationale",
            "Local string fix",
            "--verification-source",
            "tests/unit_tests/test_research_and_handoff.py",
            "--no-research-required",
            "--output",
            str(out_file),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, res.stderr
    assert out_file.exists()

    # Now verify via CLI
    res_verify = subprocess.run(
        [
            "python3",
            "scripts/runtime/research_decision.py",
            "verify",
            "--file",
            str(out_file),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert res_verify.returncode == 0, res_verify.stderr


def test_resumable_handoff_cli_compile_and_validate_with_dirty_drift(tmp_path: Path):
    def git(*args: str) -> str:
        return subprocess.check_output(["git", *args], cwd=tmp_path, text=True).strip()

    git("init", "-b", "main")
    git("config", "user.email", "tests@example.com")
    git("config", "user.name", "Tests")
    (tmp_path / "app.py").write_text("print(1)" + chr(10))
    git("add", ".")
    git("commit", "-m", "init")
    head = git("rev-parse", "HEAD")

    cp_file = tmp_path.parent / "checkpoint.json"
    res = subprocess.run(
        [
            "python3",
            str(ROOT / "scripts/runtime/resumable_handoff.py"),
            "compile",
            "--workspace",
            str(tmp_path),
            "--project-id",
            "test-proj",
            "--goal-id",
            "test-goal",
            "--plan-digest",
            "a" * 64,
            "--base-sha",
            head,
            "--head-sha",
            head,
            "--source-verifiers",
            "b" * 64,
            "--output",
            str(cp_file),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, res.stderr

    # Validate via CLI
    res_val = subprocess.run(
        [
            "python3",
            str(ROOT / "scripts/runtime/resumable_handoff.py"),
            "validate",
            "--workspace",
            str(tmp_path),
            "--checkpoint",
            str(cp_file),
            "--expected-project-id",
            "test-proj",
            "--expected-goal-id",
            "test-goal",
            "--expected-plan-digest",
            "a" * 64,
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert res_val.returncode == 0, res_val.stderr
    assert "UNVERIFIED" in res_val.stdout

    # Introduce dirty-tree drift at same HEAD
    (tmp_path / "app.py").write_text("print(2)" + chr(10))
    res_drift = subprocess.run(
        [
            "python3",
            str(ROOT / "scripts/runtime/resumable_handoff.py"),
            "validate",
            "--workspace",
            str(tmp_path),
            "--checkpoint",
            str(cp_file),
            "--expected-project-id",
            "test-proj",
            "--expected-goal-id",
            "test-goal",
            "--expected-plan-digest",
            "a" * 64,
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert res_drift.returncode == 1
    assert "dirty-tree drift" in res_drift.stderr
