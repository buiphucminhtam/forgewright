from __future__ import annotations

import importlib.util
import json
import os
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/runtime/bootstrap_manager.py"


def module():
    spec = importlib.util.spec_from_file_location("bootstrap_manager", MODULE_PATH)
    assert spec and spec.loader
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


@pytest.fixture
def bm():
    return module()


@pytest.fixture
def fixture(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, bm):
    home = tmp_path / "home"
    home.mkdir()
    project = tmp_path / "project"
    project.mkdir()
    (project / ".git").mkdir()
    root = tmp_path / "forgewright"
    (root / ".forgewright").mkdir(parents=True)
    (root / ".forgewright/execution-policy.yaml").write_text(
        "version: 1\nmode: enforce\n", encoding="utf-8"
    )
    monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_HOME", str(home))
    monkeypatch.setenv("FORGEWRIGHT_ADMISSION_HOME", str(home / "admission"))
    policy = {
        "schema": bm.POLICY_SCHEMA,
        "enabled": True,
        "auto": True,
        "mode": "automation",
        "forgewright_root": str(root),
        "allowed_roots": [str(tmp_path)],
        "deny_roots": [],
        "auto_update": False,
        "mcp_clients": [],
        "pi_policy": "existing-subscription-only",
        "pi_model": None,
        "created_at": "2026-09-22T00:00:00Z",
        "updated_at": "2026-09-22T00:00:00Z",
    }
    bm.atomic_json(home / "bootstrap-policy.json", policy)
    monkeypatch.setattr(bm, "source_commit", lambda _root: "a" * 40)
    monkeypatch.setattr(
        bm,
        "gitnexus",
        lambda _project: {"status": "ready", "stdout": "indexed"},
    )

    calls: list[list[str]] = []

    def fake_call_forge(args, *, project, required, stage):
        calls.append(list(args))
        if args[0] == "init":
            target = Path(project) / ".forgewright/project.json"
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                target.write_text('{"schema_version":1}\n', encoding="utf-8")
        elif args[0] == "onboard":
            target = Path(project) / ".forgewright/project-profile.json"
            if not target.exists():
                target.write_text(
                    '{"schema_version":1,"facts":{"git_present":true}}\n',
                    encoding="utf-8",
                )
        elif args[:2] == ["docs", "init"]:
            manifest = Path(project) / ".forgewright/docs-manifest.json"
            manifest.parent.mkdir(parents=True, exist_ok=True)
            if not manifest.exists():
                manifest.write_text(
                    json.dumps(
                        {
                            "schema_version": 1,
                            "project": {"id": "fixture", "title": "Fixture"},
                            "sources": [{"path": "README.md", "type": "overview"}],
                            "privacy": {"mode": "allowlist"},
                        }
                    )
                    + "\n",
                    encoding="utf-8",
                )
        elif args[:3] == ["docs", "registry", "add"]:
            return {
                "status": "ready",
                "stdout": json.dumps(
                    {
                        "ok": True,
                        "data": {
                            "status": "added",
                            "project": {"id": "fixture"},
                        },
                    }
                ),
            }
        return {"status": "ready", "stdout": json.dumps({"ok": True, "data": {}})}

    monkeypatch.setattr(bm, "call_forge", fake_call_forge)
    return {
        "home": home,
        "project": project,
        "root": root,
        "policy": policy,
        "calls": calls,
    }


def test_automation_ensure_is_idempotent_and_receipt_owned(bm, fixture):
    first = bm.ensure(str(fixture["project"]), "automation")
    assert first["status"] == "ready"
    assert first["changed"] is True
    state = bm.read_state(fixture["project"])
    assert state is not None
    assert state["mode"] == "automation"
    assert state["status"] == "ready"
    assert state["source_commit"] == "a" * 40
    owned = {item["path"] for item in state["owned_paths"]}
    assert ".forgewright/project.json" in owned
    assert ".forgewright/project-profile.json" in owned
    assert ".forgewright/execution-policy.yaml" in owned
    assert ".forgewright/docs-manifest.json" in owned

    call_count = len(fixture["calls"])
    second = bm.ensure(str(fixture["project"]), "automation")
    assert second["status"] == "ready"
    assert second["changed"] is False
    assert len(fixture["calls"]) == call_count


@pytest.mark.parametrize(
    "stage",
    ["project_init", "policy_seed", "index", "docs", "delegate_status"],
)
def test_fault_injection_rolls_back_owned_bytes_without_touching_user_file(
    bm, fixture, monkeypatch: pytest.MonkeyPatch, stage: str
):
    user_file = fixture["project"] / "user.txt"
    user_file.write_text("owner-data\n", encoding="utf-8")
    monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE", stage)

    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(fixture["project"]), "automation")

    assert user_file.read_text(encoding="utf-8") == "owner-data\n"
    state = bm.read_state(fixture["project"])
    assert state is not None
    assert state["status"] == "blocked"
    assert state["components"]["rollback"] == "completed"
    for relative in (
        ".forgewright/project.json",
        ".forgewright/project-profile.json",
        ".forgewright/execution-policy.yaml",
        ".forgewright/docs-manifest.json",
    ):
        assert not (fixture["project"] / relative).exists()


def test_disable_preserves_user_modified_owned_file_and_shared_runtime(bm, fixture):
    bm.ensure(str(fixture["project"]), "automation")
    profile = fixture["project"] / ".forgewright/project-profile.json"
    profile.write_text('{"owner":"changed-after-bootstrap"}\n', encoding="utf-8")

    result = bm.disable(str(fixture["project"]), keep_profile=False)
    assert result["status"] == "disabled"
    assert result["shared_runtime_preserved"] is True
    assert (
        profile.read_text(encoding="utf-8") == '{"owner":"changed-after-bootstrap"}\n'
    )
    assert any(
        item["path"] == ".forgewright/project-profile.json"
        and item["status"] == "user_modified_skip"
        for item in result["rollback"]
    )
    assert not (fixture["project"] / ".forgewright/bootstrap.json").exists()


def test_keep_profile_retains_project_manifest_and_profile(bm, fixture):
    bm.ensure(str(fixture["project"]), "automation")
    result = bm.disable(str(fixture["project"]), keep_profile=True)
    assert result["status"] == "disabled"
    assert (fixture["project"] / ".forgewright/project.json").exists()
    assert (fixture["project"] / ".forgewright/project-profile.json").exists()
    assert not (fixture["project"] / ".forgewright/execution-policy.yaml").exists()


def test_pi_without_explicit_model_never_enables_or_discovers_paid_provider(
    bm, fixture, monkeypatch: pytest.MonkeyPatch
):
    seen: list[list[str]] = []

    def fake_call(args, *, project, required, stage):
        seen.append(list(args))
        return {"status": "ready", "stdout": '{"ok":true,"data":{}}'}

    monkeypatch.setattr(bm, "call_forge", fake_call)
    result = bm.pi_prepare(fixture["policy"], fixture["project"])
    assert result["status"] == "optional_unconfigured"
    assert seen == [["delegate", "status", "--worker", "pi"]]
    assert all("on" not in args for args in seen)
    assert all("api" not in " ".join(args).lower() for args in seen)


def test_full_mode_reuses_global_runtime_and_pi_is_optional(
    bm, fixture, monkeypatch: pytest.MonkeyPatch
):
    fixture["policy"]["mode"] = "full"
    fixture["policy"]["mcp_clients"] = ["codex"]
    bm.atomic_json(fixture["home"] / "bootstrap-policy.json", fixture["policy"])
    runtime_calls = {"count": 0}

    def fake_global(_policy, _root):
        runtime_calls["count"] += 1
        return {
            "schema": bm.GLOBAL_SCHEMA,
            "status": "ready",
            "source_commit": "a" * 40,
            "mcp_clients": ["codex"],
        }

    monkeypatch.setattr(bm, "ensure_global_runtime", fake_global)
    monkeypatch.setattr(
        bm,
        "pi_prepare",
        lambda _policy, _project: {"status": "optional_unconfigured"},
    )

    first = bm.ensure(str(fixture["project"]), "full")
    second = bm.ensure(str(fixture["project"]), "full")
    assert first["status"] == "ready"
    assert first["state"]["components"]["global_runtime"] == "ready"
    assert first["state"]["components"]["pi"] == "optional_unconfigured"
    assert second["changed"] is False
    assert runtime_calls["count"] == 1


def test_bootstrap_capacity_uses_shared_host_admission_worker_and_heavy_slots(
    bm, fixture
):
    with bm.HostCapacityLease(fixture["project"], wait_seconds=5) as lease:
        status = lease.admission.status()
        assert status["active_workers"] == 1
        assert status["active_heavy"] == 0
        with lease.heavy(wait_seconds=5):
            heavy = lease.admission.status()
            assert heavy["active_workers"] == 1
            assert heavy["active_heavy"] == 1
        after_heavy = lease.admission.status()
        assert after_heavy["active_workers"] == 1
        assert after_heavy["active_heavy"] == 0
    admission = bm.HostAdmission(bm.admission_home())
    try:
        final = admission.status()
        assert final["active_workers"] == 0
        assert final["active_heavy"] == 0
        assert final["quarantined"] == 0
    finally:
        admission.close()


def test_policy_allow_deny_is_fail_closed(bm, fixture):
    fixture["policy"]["allowed_roots"] = [str(fixture["project"] / "other")]
    bm.atomic_json(fixture["home"] / "bootstrap-policy.json", fixture["policy"])
    with pytest.raises(bm.BootstrapError, match="not under an allowed root"):
        bm.ensure(str(fixture["project"]), "automation")

    fixture["policy"]["allowed_roots"] = [str(fixture["project"])]
    fixture["policy"]["deny_roots"] = [str(fixture["project"])]
    bm.atomic_json(fixture["home"] / "bootstrap-policy.json", fixture["policy"])
    with pytest.raises(bm.BootstrapError, match="denied root"):
        bm.ensure(str(fixture["project"]), "automation")


@pytest.mark.skipif(os.name == "nt", reason="POSIX process-group ownership regression")
def test_adapter_timeout_terminates_owned_descendant_process(
    bm, fixture, tmp_path: Path
):
    pid_file = tmp_path / "child.pid"
    command = (
        "sleep 30 & child=$!; echo $child > " + repr(str(pid_file)) + "; wait $child"
    )
    result = bm.run(
        ["bash", "-c", command],
        cwd=fixture["project"],
        required=False,
        stage="timeout-tree",
        timeout=0.15,
    )
    assert result["status"] == "degraded"
    assert "timeout" in result["detail"]
    child_pid = int(pid_file.read_text().strip())
    deadline = time.time() + 2
    while time.time() < deadline:
        try:
            os.kill(child_pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.02)
    else:
        pytest.fail(f"owned descendant still alive after adapter timeout: {child_pid}")


def test_explain_never_mutates_project(bm, fixture):
    before = sorted(
        path.relative_to(fixture["project"]).as_posix()
        for path in fixture["project"].rglob("*")
    )
    result = bm.explain(str(fixture["project"]), "full")
    after = sorted(
        path.relative_to(fixture["project"]).as_posix()
        for path in fixture["project"].rglob("*")
    )
    assert before == after
    assert result["desired_mode"] == "full"
    assert result["submodule_required"] is False
    assert "credentials" in result["will_not_touch"]
    assert "shared_runtime_guard" in result["stages"]


def test_stale_lock_reclaims_dead_owner(bm, fixture):
    locks = fixture["home"] / "locks"
    locks.mkdir(parents=True, exist_ok=True)
    lock = locks / "example.lock"
    lock.write_text(
        json.dumps({"pid": 999_999_999, "started_at": "old"}), encoding="utf-8"
    )
    old = time.time() - 10
    os.utime(lock, (old, old))
    with bm.Lock("example", timeout=1):
        assert lock.exists()
    assert not lock.exists()


def test_repair_does_not_overwrite_user_modified_owned_bytes(bm, fixture):
    bm.ensure(str(fixture["project"]), "automation")
    profile = fixture["project"] / ".forgewright/project-profile.json"
    profile.write_text('{"owner":"custom"}\n', encoding="utf-8")

    repaired = bm.ensure(str(fixture["project"]), "automation", repair=True)
    assert repaired["status"] == "degraded"
    assert repaired["state"]["components"]["ownership"] == "degraded"
    assert (
        "owned_modified:.forgewright/project-profile.json"
        in repaired["state"]["components"]["ownership_issues"]
    )
    assert profile.read_text(encoding="utf-8") == '{"owner":"custom"}\n'


def test_created_gitnexus_directory_rolls_back_when_later_stage_fails(
    bm, fixture, monkeypatch: pytest.MonkeyPatch
):
    def fake_gitnexus(project: Path):
        path = project / ".gitnexus"
        path.mkdir()
        (path / "meta.json").write_text('{"ok":true}\n', encoding="utf-8")
        return {
            "status": "ready",
            "created_dirs": [
                {"path": ".gitnexus", "after_digest": bm.directory_digest(path)}
            ],
        }

    monkeypatch.setattr(bm, "gitnexus", fake_gitnexus)
    monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE", "docs")
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(fixture["project"]), "automation")
    assert not (fixture["project"] / ".gitnexus").exists()


def test_five_projects_share_one_heavy_slot_and_keep_registry_entries(
    bm, fixture, monkeypatch: pytest.MonkeyPatch
):
    from concurrent.futures import ThreadPoolExecutor
    import threading

    parent = fixture["project"].parent
    projects = []
    for index in range(5):
        project = parent / f"project-{index}"
        project.mkdir()
        (project / ".git").mkdir()
        projects.append(project)

    active = 0
    peak = 0
    mutex = threading.Lock()

    def slow_gitnexus(_project: Path):
        nonlocal active, peak
        with mutex:
            active += 1
            peak = max(peak, active)
        time.sleep(0.04)
        with mutex:
            active -= 1
        return {"status": "ready", "created_dirs": []}

    monkeypatch.setattr(bm, "gitnexus", slow_gitnexus)
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(
            pool.map(lambda path: bm.ensure(str(path), "automation"), projects)
        )

    assert all(result["status"] == "ready" for result in results)
    assert peak == 1
    registry = bm.registry()
    registered = {Path(item["root"]).name for item in registry["projects"]}
    assert {project.name for project in projects}.issubset(registered)
    for project in projects:
        state = bm.read_state(project)
        assert state is not None and state["project_root_digest"] == bm.root_digest(
            project
        )
        assert not (project / "forgewright").exists()
