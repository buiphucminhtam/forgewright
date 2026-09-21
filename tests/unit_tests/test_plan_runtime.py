from __future__ import annotations

from pathlib import Path

import pytest

from scripts.runtime.plan_runtime import (
    PlanRuntimeError,
    assert_binding,
    classify_failure,
    cleanup,
    initialize,
    state_dir,
    write_artifact,
)


BINDING = {
    "goal_id": "goal-1",
    "plan_digest": "a" * 64,
    "base_sha": "b" * 40,
    "owner": "web-1",
}


def test_plan_runtime_is_goal_and_digest_scoped(tmp_path: Path):
    first = initialize(tmp_path, **BINDING)
    second = initialize(
        tmp_path,
        goal_id="goal-1",
        plan_digest="c" * 64,
        base_sha="b" * 40,
        owner="web-1",
    )
    assert first != second
    assert first == state_dir(tmp_path, "goal-1", "a" * 64)
    assert_binding(tmp_path, **BINDING)
    assert second.is_dir()


def test_goal_runtime_ids_are_portable_path_segments(tmp_path: Path):
    with pytest.raises(PlanRuntimeError, match="safe identifier"):
        initialize(
            tmp_path,
            goal_id="ephemeral:task",
            plan_digest="a" * 64,
            base_sha="b" * 40,
            owner="web-1",
        )


def test_stale_binding_is_rejected(tmp_path: Path):
    initialize(tmp_path, **BINDING)
    with pytest.raises(PlanRuntimeError, match="stale|does not match"):
        assert_binding(tmp_path, **{**BINDING, "base_sha": "c" * 40})


def test_artifact_write_and_cleanup_only_remove_owned_plan(tmp_path: Path):
    target = initialize(tmp_path, **BINDING)
    other = initialize(
        tmp_path,
        goal_id="goal-1",
        plan_digest="c" * 64,
        base_sha="b" * 40,
        owner="web-1",
    )
    artifact = write_artifact(
        tmp_path, **BINDING, name="worker-1.json", value={"ok": True}
    )
    assert artifact.is_file()
    cleanup(tmp_path, **BINDING)
    assert not target.exists()
    assert other.exists()


def test_artifact_name_and_symlink_escape_fail_closed(tmp_path: Path):
    initialize(tmp_path, **BINDING)
    with pytest.raises(PlanRuntimeError, match="artifact name"):
        write_artifact(tmp_path, **BINDING, name="../escape.json", value={})


@pytest.mark.parametrize(
    ("kind", "trigger"),
    [
        ("hypothesis_wrong", "material_assumption_invalidated"),
        ("implementation_wrong", None),
        ("environment_wrong", "material_assumption_invalidated"),
        ("architecture_wrong", "material_risk_discovered"),
    ],
)
def test_failure_classes_have_explicit_replan_semantics(kind: str, trigger: str | None):
    record = classify_failure(
        kind,
        evidence="The focused verifier disproved the prior assumption.",
        next_action="Test the corrected assumption.",
        attempts=2,
    )
    assert record["class"] == kind
    assert record["replan_trigger"] == trigger
    assert record["same_approach_forbidden"] is True


def test_failure_classification_rejects_unknown_kind():
    with pytest.raises(PlanRuntimeError, match="failure kind"):
        classify_failure(
            "try_again",
            evidence="no",
            next_action="again",
            attempts=2,
        )


def test_debugger_surfaces_share_failure_classification_contract():
    root = Path(__file__).resolve().parents[2]
    for relative in ("skills/debugger/LITE.md", "skills/debugger/SKILL.md"):
        text = (root / relative).read_text(encoding="utf-8")
        for kind in (
            "hypothesis_wrong",
            "implementation_wrong",
            "environment_wrong",
            "architecture_wrong",
        ):
            assert kind in text
        assert "same approach" in text.lower()
    assert (
        "3+ failed fix attempts" not in (root / "skills/debugger/SKILL.md").read_text()
    )
