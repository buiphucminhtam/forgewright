"""Independent normal-manifest to dispatcher integration; no external provider calls."""

from __future__ import annotations
import importlib.util
import subprocess
import sys
from pathlib import Path
import pytest

from scripts.runtime.context_packets import create_supplemental_request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


def runner():
    spec = importlib.util.spec_from_file_location(
        "reviewer_manifest_runner", ROOT / "scripts/parallel-dispatch-runner.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def workspace(tmp_path):
    def git(*args):
        return subprocess.check_output(
            ["git", *args], cwd=tmp_path, text=True, stderr=subprocess.DEVNULL
        ).strip()

    git("init", "-b", "main")
    git("config", "user.email", "fixture@example.invalid")
    git("config", "user.name", "Reviewer fixture")
    for scope in ("backend", "frontend"):
        (tmp_path / "src" / scope).mkdir(parents=True)
        (tmp_path / "src" / scope / "fixture.txt").write_text("VERIFIED_LOCAL_" + scope)
    git("add", "src")
    git("commit", "-m", "local fixture")
    return tmp_path


def manifest(workspace):
    return {
        "request": {
            "workspace": str(workspace),
            "goal_id": "g-manifest",
            "task_id": "t-manifest",
            "task_size": "large",
            "requirements": "Inspect only the bounded local read scopes.",
            "acceptance_criteria": [
                "Required local context must reach the worker before dispatch."
            ],
            "scopes": [
                {
                    "id": s,
                    "paths": ["src/" + s],
                    "independent": True,
                    "risk_signals": [],
                }
                for s in ("backend", "frontend")
            ],
            "limits": {"concurrency": 2, "deadline_ms": 1000},
        }
    }


def with_request(module, ws, target):
    m = manifest(ws)
    base = module.build_plan(m, ws)
    b = next(w for w in base["workers"] if w["scope_id"] == "backend")[
        "context_packet"
    ]["binding"]
    req = create_supplemental_request(
        goal_id=b["goal_id"],
        task_id=b["task_id"],
        scope_id=b["scope_id"],
        plan_digest=b["plan_digest"],
        base_sha=b["base_sha"],
        round_index=1,
        missing_facts=[
            {
                "fact_id": "required-local",
                "kind": "code",
                "target_path": target,
                "reason": "Read necessary local contract.",
                "mandatory": True,
            }
        ],
    )
    m["request"]["supplemental_context_requests"] = {"backend": req}
    return module.build_plan(m, ws)


def test_normal_manifest_missing_context_blocks_before_provider(workspace, monkeypatch):
    module = runner()
    calls = []
    monkeypatch.setattr(
        module,
        "_execute_call",
        lambda *args, **kwargs: calls.append("UNEXPECTED_PROVIDER"),
    )
    plan = with_request(module, workspace, "src/backend/missing.txt")
    p = next(w for w in plan["workers"] if w["scope_id"] == "backend")["context_packet"]
    assert p.get("blocked") is True and p.get("status") == "BLOCKED_CONTEXT", (
        "Manifest request was lost before the worker context boundary."
    )
    assert module.execute_plan(plan) == 2
    assert calls == []


def test_normal_manifest_delivers_actual_required_excerpt(workspace):
    module = runner()
    plan = with_request(module, workspace, "src/backend/fixture.txt")
    p = next(w for w in plan["workers"] if w["scope_id"] == "backend")["context_packet"]
    assert p.get("status") == "READY"
    excerpts = p.get("supplemental_context", {}).get("excerpts", [])
    assert any(e.get("content") == "VERIFIED_LOCAL_backend" for e in excerpts), (
        "Actual required file content must reach the normal worker packet."
    )


def test_source_change_after_compile_blocks_before_next_execution_boundary(
    workspace, monkeypatch
):
    module = runner()
    plan = with_request(module, workspace, "src/backend/fixture.txt")
    (workspace / "src/backend/fixture.txt").write_text("CHANGED_AFTER_CONTEXT_CAPTURE")
    reached = []

    def unexpected_boundary():
        reached.append("execution-boundary")
        raise AssertionError(
            "Stale context reached execution validation instead of being blocked."
        )

    # The sentinel fails, never bypasses or replaces the security check with success.
    monkeypatch.setattr(module, "validate_global_antigravity_hook", unexpected_boundary)
    assert module.execute_plan(plan) == 2
    assert plan["execution"]["status"] == "BLOCKED_CONTEXT"
    assert reached == []


def test_unchanged_context_reaches_the_existing_security_boundary(
    workspace, monkeypatch
):
    module = runner()
    plan = with_request(module, workspace, "src/backend/fixture.txt")

    class BoundaryReached(RuntimeError):
        pass

    def existing_boundary():
        raise BoundaryReached("Original security boundary remains required.")

    monkeypatch.setattr(module, "validate_global_antigravity_hook", existing_boundary)
    with pytest.raises(BoundaryReached):
        module.execute_plan(plan)


def test_trusted_parent_continues_rounds_and_preserves_prior_content(workspace):
    from copy import deepcopy

    module = runner()
    (workspace / "src/backend/second.txt").write_text("SECOND_LOCAL_BACKEND")
    m = manifest(workspace)
    first_plan = module.build_plan(m, workspace)
    binding = next(w for w in first_plan["workers"] if w["scope_id"] == "backend")[
        "context_packet"
    ]["binding"]

    def req(round_index, path):
        return create_supplemental_request(
            **binding,
            round_index=round_index,
            missing_facts=[
                {
                    "fact_id": "f" + str(round_index),
                    "kind": "code",
                    "target_path": path,
                    "reason": "Required native-parent continuation context.",
                    "mandatory": True,
                }
            ],
        )

    parent = {}
    m["request"]["supplemental_context_requests"] = {
        "backend": req(1, "src/backend/fixture.txt")
    }
    module.build_plan(deepcopy(m), workspace, parent_retrieval_sessions=parent)
    m["request"]["supplemental_context_requests"]["backend"] = req(
        2, "src/backend/second.txt"
    )
    continued = module.build_plan(
        deepcopy(m), workspace, parent_retrieval_sessions=parent
    )
    packet = next(w for w in continued["workers"] if w["scope_id"] == "backend")[
        "context_packet"
    ]
    content = "\n".join(
        item["content"] for item in packet["supplemental_context"]["excerpts"]
    )
    assert "VERIFIED_LOCAL_backend" in content and "SECOND_LOCAL_BACKEND" in content
    assert packet["supplemental_context"]["round_index"] == 2
    with pytest.raises(module.ManifestError, match="replay"):
        module.build_plan(deepcopy(m), workspace, parent_retrieval_sessions=parent)
    with pytest.raises(module.ManifestError, match="sequential"):
        module.build_plan(deepcopy(m), workspace)
