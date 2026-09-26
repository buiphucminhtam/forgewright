"""Disposable, provider-free safety regressions; original oracles stay unchanged."""

from __future__ import annotations

import base64
import copy
import importlib
import json
import os
import stat
import subprocess
from pathlib import Path

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline

base_bm = baseline.bm
fixture = baseline.fixture


@pytest.fixture
def bm(base_bm, monkeypatch, tmp_path):
    # Model admission's OS sensor at this unit-test boundary. Production and the
    # original admission integration tests retain their real process inspector.
    real = base_bm.HostAdmission
    from host_resources import MemorySnapshot

    monkeypatch.setattr(
        base_bm,
        "HostAdmission",
        lambda home: real(
            home,
            inspector=lambda pid: "fixture-process" if pid == os.getpid() else None,
            sensor=lambda: MemorySnapshot(
                8 * 1024**3, 6 * 1024**3, "normal", "fixture"
            ),
        ),
    )
    monkeypatch.setenv("FORGEWRIGHT_HOME", str(tmp_path / "docs-home"))
    base_bm._test_project = tmp_path / "project"
    return base_bm


def receipt(bm, path, before=None, after=b"managed"):
    return {
        "path": path,
        "stage": "test",
        "project_root_digest": bm.root_digest(bm._test_project),
        "before_exists": before is not None,
        "before_sha256": bm.sha256_bytes(before) if before is not None else None,
        "before_base64": base64.b64encode(before).decode()
        if before is not None
        else None,
        "after_sha256": bm.sha256_bytes(after) if after is not None else None,
    }


@pytest.mark.parametrize(
    "relative",
    ["../victim", "/tmp/victim", "docs/../victim", "user.txt", ".git/config"],
)
def test_receipt_path_rejected_before_any_mutation(bm, fixture, relative):
    project = fixture["project"]
    victim = project.parent / "victim"
    victim.write_bytes(b"managed")
    if relative.startswith("/"):
        relative = str(victim)  # Absolute-path exploit stays disposable too.
    safe = project / ".production-grade.yaml"
    safe.write_bytes(b"managed")
    with pytest.raises(bm.BootstrapError):
        bm.restore_receipts(project, [receipt(bm, relative), receipt(bm, safe.name)])
    assert safe.read_bytes() == b"managed"
    assert victim.read_bytes() == b"managed"


@pytest.mark.parametrize(
    "kind", ["symlink", "dangling", "hardlink", "fifo", "ancestor"]
)
def test_state_paths_reject_links_and_special_files(bm, fixture, kind):
    project = fixture["project"]
    outside = project.parent / "outside"
    outside.mkdir()
    folder = project / ".forgewright"
    if kind == "ancestor":
        folder.symlink_to(outside, target_is_directory=True)
    else:
        folder.mkdir()
        leaf = folder / "bootstrap.json"
        victim = outside / "victim"
        if kind != "dangling":
            victim.write_text("preserve")
        if kind in {"symlink", "dangling"}:
            leaf.symlink_to(victim)
        elif kind == "hardlink":
            os.link(victim, leaf)
        else:
            os.mkfifo(leaf)
    with pytest.raises(bm.BootstrapError):
        bm.write_state(project, bm.initial_state(project, "automation", "a" * 40))
    assert not (outside / "bootstrap.json").exists()
    if (outside / "victim").exists():
        assert (outside / "victim").read_text() == "preserve"


@pytest.mark.parametrize(
    "key,value",
    [
        ("allowed_roots", "/tmp"),
        ("deny_roots", {}),
        ("mcp_clients", "codex"),
        ("auto_update", 1),
        ("pi_model", []),
        ("forgewright_root", "relative"),
        ("allowed_roots", ["relative"]),
        ("created_at", 42),
    ],
)
def test_policy_types_are_not_coerced(bm, fixture, key, value):
    policy = copy.deepcopy(fixture["policy"])
    policy[key] = value
    with pytest.raises(bm.BootstrapError):
        bm.validate_policy(policy)


@pytest.mark.parametrize(
    "change",
    [
        {"before_exists": "false"},
        {"before_sha256": "0" * 64},
        {"before_base64": "broken"},
        {"after_sha256": "oops"},
    ],
)
def test_inconsistent_receipt_rejected(bm, fixture, change):
    item = receipt(bm, ".production-grade.yaml")
    item.update(change)
    path = fixture["project"] / item["path"]
    path.write_bytes(b"managed")
    with pytest.raises(bm.BootstrapError):
        bm.restore_receipts(fixture["project"], [item])
    assert path.read_bytes() == b"managed"


def test_subdirectory_uses_git_root_and_fake_fixture_root(bm, fixture):
    child = fixture["project"] / "nested"
    child.mkdir()
    assert bm.canonical_project(str(child)) == fixture["project"]
    subprocess.run(["git", "init", "-q", str(fixture["project"])], check=True)
    assert bm.canonical_project(str(child)) == fixture["project"]


def test_degraded_cannot_verify_ready(bm, fixture):
    bm.ensure(str(fixture["project"]), "automation")
    state = bm.read_state(fixture["project"])
    state["status"] = "degraded"
    state["components"]["gitnexus"] = "degraded"
    bm.write_state(fixture["project"], state)
    result = bm.verify(str(fixture["project"]))
    assert result["ok"] is False
    assert result["status"] != "ready"


@pytest.mark.parametrize("repair", [False, True])
def test_drift_detected_before_any_adapter(bm, fixture, monkeypatch, repair):
    bm.ensure(str(fixture["project"]), "automation")
    path = fixture["project"] / ".forgewright/project-profile.json"
    path.write_bytes(b"user-edit")

    def forbidden(*args, **kwargs):
        pytest.fail("adapter invoked after ownership drift")

    monkeypatch.setattr(bm, "call_forge", forbidden)
    result = bm.ensure(str(fixture["project"]), "automation", repair=repair)
    assert result["status"] == "degraded"
    assert path.read_bytes() == b"user-edit"


def test_partial_adapter_failure_is_captured(bm, fixture, monkeypatch):
    original = bm.call_forge

    def failing(args, **kwargs):
        result = original(args, **kwargs)
        if args[0] == "init":
            raise bm.BootstrapError("partial", "failed after writing")
        return result

    monkeypatch.setattr(bm, "call_forge", failing)
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(fixture["project"]), "automation")
    assert not (fixture["project"] / ".forgewright/project.json").exists()


def test_failed_upgrade_retains_ready_snapshot(bm, fixture, monkeypatch):
    bm.ensure(str(fixture["project"]), "automation")
    before = bm.snapshot(fixture["project"])
    monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE", "docs")
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(fixture["project"]), "full")
    assert bm.snapshot(fixture["project"]) == before


def test_disable_tombstone_and_auto_opt_out(bm, fixture):
    bm.ensure(str(fixture["project"]), "automation")
    bm.disable(str(fixture["project"]), keep_profile=False)
    path = fixture["home"] / "disabled" / (bm.root_digest(fixture["project"]) + ".json")
    value = json.loads(path.read_text())
    assert value["schema"] == "forgewright-bootstrap-disabled/v1"
    assert value["project_root_digest"] == bm.root_digest(fixture["project"])
    with pytest.raises(bm.BootstrapError, match="disabled"):
        bm.ensure(str(fixture["project"]), "automation", auto=True)
    assert path.exists()
    bm.ensure(str(fixture["project"]), "automation")
    assert not path.exists()


def test_disable_uses_canonical_root_not_receipt_id(bm, fixture):
    bm.ensure(str(fixture["project"]), "automation")
    state = bm.read_state(fixture["project"])
    for item in state["external_config_receipts"]:
        if item["kind"] == "docs_registry":
            item["id"] = "other-project"
    bm.write_state(fixture["project"], state)
    bm.disable(str(fixture["project"]), keep_profile=False)
    removals = [
        args for args in fixture["calls"] if args[:3] == ["docs", "registry", "remove"]
    ]
    assert removals == [["docs", "registry", "remove", str(fixture["project"])]]


def test_lock_release_preserves_replacement(bm, fixture):
    with bm.Lock("replace") as lock:
        lock.path.unlink()
        lock.path.write_text('{"pid":42,"token":"other"}')
    assert lock.path.exists()


def test_blocked_state_does_not_retry(bm, fixture, monkeypatch):
    state = bm.initial_state(fixture["project"], "automation", "a" * 40)
    state["status"] = "bootstrapping"
    bm.write_state(fixture["project"], state)
    with pytest.raises(bm.BootstrapError, match="recovery"):
        bm.ensure(str(fixture["project"]), "automation")
    assert fixture["calls"] == []


@pytest.mark.parametrize("relative", ["../victim", "docs", ".forgewright", ".git"])
def test_directory_receipts_are_bounded(bm, fixture, relative):
    with pytest.raises(bm.BootstrapError):
        bm.restore_directory_receipts(
            fixture["project"],
            [
                {
                    "kind": "project_directory",
                    "project_root_digest": bm.root_digest(fixture["project"]),
                    "path": relative,
                    "after_digest": "0" * 64,
                }
            ],
        )


@pytest.mark.parametrize("kind", ["link", "dangling", "hardlink", "fifo"])
def test_index_tree_rejects_special_entries(bm, fixture, kind):
    path = fixture["project"] / ".gitnexus"
    path.mkdir()
    victim = fixture["project"].parent / "victim"
    victim.write_text("preserve")
    leaf = path / "entry"
    if kind == "hardlink":
        os.link(victim, leaf)
    elif kind == "fifo":
        os.mkfifo(leaf)
    else:
        leaf.symlink_to(victim if kind == "link" else victim.parent / "missing")
    with pytest.raises(bm.BootstrapError):
        bm.directory_digest(path)
    assert victim.read_text() == "preserve"


@pytest.mark.parametrize(
    "field,value",
    [
        ("owned_paths", {}),
        ("status", []),
        ("components", {"docs": True}),
        ("source_commit", "unknown"),
        ("project_root_digest", "0" * 64),
    ],
)
def test_invalid_state_fails_closed(bm, fixture, field, value):
    state = bm.initial_state(fixture["project"], "automation", "a" * 40)
    state[field] = value
    bm.atomic_json(bm.state_path(fixture["project"]), state)
    with pytest.raises(bm.BootstrapError):
        bm.read_state(fixture["project"])


def test_direct_receipt_helper_enforces_policy_boundary(bm, fixture):
    other = fixture["project"].parent / "disallowed"
    other.mkdir()
    target = other / ".production-grade.yaml"
    target.write_bytes(b"managed")
    fixture["policy"]["allowed_roots"] = [str(fixture["project"])]
    bm.atomic_json(fixture["home"] / "bootstrap-policy.json", fixture["policy"])
    with pytest.raises(bm.BootstrapError):
        bm.restore_receipts(other, [receipt(bm, target.name)])
    assert target.read_bytes() == b"managed"


def test_stage_journal_exists_before_adapter_and_after_partial_failure(
    bm, fixture, monkeypatch
):
    original = bm.call_forge

    def failing(args, **kwargs):
        progress = json.loads(bm._journal_path(fixture["project"]).read_text())
        if args[0] == "onboard":
            assert progress["stage"] == "project_onboard"
            assert any(
                x["path"] == ".forgewright/project.json"
                for x in progress["owned_paths"]
            )
            original(args, **kwargs)
            raise bm.BootstrapError("partial", "partial onboard")
        return original(args, **kwargs)

    monkeypatch.setattr(bm, "call_forge", failing)
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(fixture["project"]), "automation")
    assert not (fixture["project"] / ".forgewright/project-profile.json").exists()
    assert (
        json.loads(bm._journal_path(fixture["project"]).read_text())["status"]
        == "rolled_back"
    )


def test_failed_index_partial_directory_is_rolled_back(bm, fixture, monkeypatch):
    def failing(project):
        (project / ".gitnexus").mkdir()
        (project / ".gitnexus/partial").write_text("partial")
        raise bm.BootstrapError("partial", "partial index")

    monkeypatch.setattr(bm, "gitnexus", failing)
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(fixture["project"]), "automation")
    assert not (fixture["project"] / ".gitnexus").exists()


def test_uncertain_adapter_never_reports_completed_rollback(bm, fixture, monkeypatch):
    original = bm.call_forge

    def failing(args, **kwargs):
        original(args, **kwargs)
        raise bm.BootstrapError("adapter_cleanup_unconfirmed", "group remains")

    monkeypatch.setattr(bm, "call_forge", failing)
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(fixture["project"]), "automation")
    state = bm.read_state(fixture["project"])
    assert state["components"]["rollback"] == "recovery_required"
    assert (fixture["project"] / ".forgewright/project.json").exists()


def test_repair_retains_full_mode(bm, fixture, monkeypatch):
    monkeypatch.setattr(bm, "ensure_global_runtime", lambda *_: {"status": "ready"})
    monkeypatch.setattr(bm, "pi_prepare", lambda *_: {"status": "disabled"})
    bm.ensure(str(fixture["project"]), "full")
    result = bm.ensure(str(fixture["project"]), None, repair=True)
    assert result["state"]["mode"] == "full"


def test_disable_takes_project_lock(bm, fixture, monkeypatch):
    bm.ensure(str(fixture["project"]), "automation")
    original = bm.restore_receipts

    def checking(project, receipts):
        assert (
            fixture["home"] / "locks" / f"project-{bm.root_digest(project)}.lock"
        ).exists()
        return original(project, receipts)

    monkeypatch.setattr(bm, "restore_receipts", checking)
    bm.disable(str(fixture["project"]), keep_profile=False)


def test_unmanaged_disable_preserves_unrelated_file(bm, fixture):
    target = fixture["project"] / ".production-grade.yaml"
    target.write_bytes(b"user")
    result = bm.disable(str(fixture["project"]), keep_profile=False)
    assert result["status"] == "disabled"
    assert target.read_bytes() == b"user"
    assert bm.tombstone_path(fixture["project"]).exists()


def test_failed_docs_cleanup_retains_recovery_receipt(bm, fixture, monkeypatch):
    bm.ensure(str(fixture["project"]), "automation")
    monkeypatch.setattr(bm, "call_forge", lambda *a, **kw: {"status": "degraded"})
    with pytest.raises(bm.BootstrapError):
        bm.disable(str(fixture["project"]), keep_profile=False)
    assert (
        bm.read_state(fixture["project"])["components"]["rollback"]
        == "recovery_required"
    )


def test_docs_root_collision_cannot_remove_other_project(bm, fixture):
    bm.ensure(str(fixture["project"]), "automation")
    bm.atomic_json(
        bm._docs_registry_path(),
        {
            "schema_version": 1,
            "projects": [
                {
                    "id": str(fixture["project"]),
                    "root": str(fixture["project"].parent / "other"),
                    "title": "other",
                    "manifest": None,
                }
            ],
        },
    )
    with pytest.raises(bm.BootstrapError):
        bm.disable(str(fixture["project"]), keep_profile=False)
    assert len(bm._docs_registry()["projects"]) == 1


@pytest.mark.parametrize("client", ["codex", "claude-code"])
def test_selected_mcp_preserves_unrelated_config_and_records_hash(
    bm, fixture, monkeypatch, client
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    path = bm._client_path(client)
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (
        b'# retain comment\nmodel="local"\n[mcp_servers.other]\ncommand="other"\n'
        if client == "codex"
        else b'{"preferences":{"theme":"dark"},"mcpServers":{"other":{"command":"other"}}}'
    )
    path.write_bytes(raw)
    result = bm._configure_client(client)
    assert result["before_sha256"] == bm.sha256_bytes(raw)
    assert result["after_sha256"] == bm.sha256_bytes(path.read_bytes())
    _, _, document = bm._client_document(client)
    key = "mcp_servers" if client == "codex" else "mcpServers"
    assert document[key]["other"] == {"command": "other"}
    if client == "codex":
        assert path.read_bytes().startswith(raw)
    else:
        assert document["preferences"] == {"theme": "dark"}
    other = bm._client_path("claude-code" if client == "codex" else "codex")
    assert not other.exists()


def test_mcp_conflict_is_preserved(bm, fixture, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    path = bm._client_path("codex")
    path.parent.mkdir()
    raw = b'[mcp_servers.forgewright]\ncommand="user-custom"\n'
    path.write_bytes(raw)
    with pytest.raises(bm.BootstrapError):
        bm._configure_client("codex")
    assert path.read_bytes() == raw


def test_verify_detects_missing_global_config_and_policy_client_drift(bm, fixture):
    bm.ensure(str(fixture["project"]), "automation")
    state = bm.read_state(fixture["project"])
    state["mode"] = "full"
    bm.write_state(fixture["project"], state)
    fixture["policy"]["mcp_clients"] = ["codex"]
    bm.atomic_json(fixture["home"] / "bootstrap-policy.json", fixture["policy"])
    bm.atomic_json(
        bm.global_runtime_receipt(),
        {
            "schema": bm.GLOBAL_SCHEMA,
            "status": "ready",
            "mcp_clients": [],
            "source_commit": "a" * 40,
        },
    )
    result = bm.verify(str(fixture["project"]))
    assert result["ok"] is False
    assert "shared_runtime_policy_drift" in result["issues"]


def test_runtime_never_invokes_broad_install_scripts(bm, fixture, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])

    def forbidden(*args, **kwargs):
        pytest.fail("runtime installation invoked from project hook")

    monkeypatch.setattr(bm, "run", forbidden)
    result = bm.ensure_global_runtime(fixture["policy"], fixture["root"])
    assert result["status"] == "degraded"
    assert not (fixture["home"] / ".codex").exists()


def test_exited_leader_still_drains_descendants(bm, monkeypatch):
    calls = []

    class Process:
        pid = 12345
        returncode = 0

        def poll(self):
            return 0

        def wait(self, **kwargs):
            return 0

    def killpg(pid, sig):
        calls.append(sig)
        if sig == 0 and bm.signal.SIGTERM in calls:
            raise ProcessLookupError

    monkeypatch.setattr(bm.os, "killpg", killpg)
    assert bm._terminate_owned_process_tree(Process())
    assert bm.signal.SIGTERM in calls


def test_operation_deadline_prevents_adapter_launch(bm, fixture, monkeypatch):
    monkeypatch.setattr(
        bm.subprocess, "Popen", lambda *a, **kw: pytest.fail("launch after deadline")
    )
    with (
        bm._operation_budget(seconds=-1),
        pytest.raises(bm.BootstrapError, match="deadline"),
    ):
        bm.run(["unused"], cwd=fixture["project"], stage="deadline")


def test_unknown_adapter_status_is_not_ready(bm, fixture, monkeypatch):
    monkeypatch.setattr(bm, "gitnexus", lambda _: {"status": "failed"})
    result = bm.ensure(str(fixture["project"]), "automation")
    assert result["status"] == "degraded"
    assert result["ok"] is False


def test_full_runtime_real_selected_config_and_live_verification(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    entry = bm._mcp_entry()
    for filename in [entry["command"], entry["args"][0]]:
        path = Path(filename)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("fixture asset, never executed")
    adapter = importlib.import_module("shared_runtime_adapter")
    framework = fixture["home"] / ".forgewright"
    skills = framework / "skills"
    skills.mkdir()
    policy_assets = []
    for name in ("policy-check.sh", "telemetry.sh"):
        path = framework / "scripts/lite" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"fixture {name}\n")
        policy_assets.append(
            {
                "kind": "file",
                "name": f"policy_guard:{name}",
                "path": str(path),
                "digest": bm.sha256_bytes(path.read_bytes()),
                "mode": stat.S_IMODE(path.stat().st_mode),
            }
        )
    receipt = {
        "schema": adapter.ASSET_SCHEMA,
        "transaction_id": "1" * 32,
        "source_root": str(fixture["root"]),
        "source_commit": "a" * 40,
        "rlg": False,
        "mcp": True,
        "assets": [
            *policy_assets,
            {
                "kind": "directory",
                "name": "source_skills",
                "path": str(skills),
                "digest": adapter._tree_digest(skills),
            },
            {
                "kind": "directory",
                "name": "mcp_server",
                "path": str(framework / "mcp-server"),
                "digest": adapter._tree_digest(framework / "mcp-server"),
            },
        ],
    }
    bm.atomic_json(
        bm._shared_runtime_progress_path(),
        {"status": "completed", "receipt": receipt},
    )
    guard = fixture["home"] / ".forgewright/runtime/INSTALLED_FROM"
    bm.atomic_json(guard, {"fixture": True})
    calls = []

    def check(argv, **kwargs):
        calls.append(argv)
        assert argv[-2:] == ["--verify", "--quiet"]
        return {"status": "ready"}

    monkeypatch.setattr(bm, "run", check)
    fixture["policy"]["mcp_clients"] = ["codex"]
    result = bm.ensure_global_runtime(fixture["policy"], fixture["root"])
    assert result["status"] == "ready"
    assert len(result["config_receipts"]) == 1
    assert calls
    config = bm._client_path("codex")
    config.unlink()
    assert "mcp_config_missing_or_drift:codex" in bm._runtime_issues(
        fixture["policy"], result
    )


def test_failed_json_envelope_is_not_adapter_success(bm, fixture, monkeypatch):
    monkeypatch.setenv("FORGEWRIGHT_CLI_ENTRY", "fixture-cli")
    monkeypatch.setattr(
        bm, "run", lambda *a, **kw: {"status": "ready", "stdout": '{"ok":false}'}
    )
    # Use the real wrapper; fixture intentionally replaces it for transaction tests.
    real = baseline.module()
    monkeypatch.setattr(real, "run", bm.run)
    with pytest.raises(real.BootstrapError):
        real.call_forge(
            ["init"], project=fixture["project"], required=True, stage="init"
        )


def test_signal_during_adapter_drains_before_return(bm, fixture, monkeypatch):
    class Process:
        pid = 123
        returncode = None
        stdout = None
        stderr = None

        def communicate(self, **kwargs):
            handler = bm.signal.getsignal(bm.signal.SIGTERM)
            handler(bm.signal.SIGTERM, None)

    monkeypatch.setattr(bm.subprocess, "Popen", lambda *a, **kw: Process())
    drained = []
    monkeypatch.setattr(
        bm, "_terminate_owned_process_tree", lambda p: drained.append(p.pid) or True
    )
    with pytest.raises(bm.BootstrapError, match="interrupted"):
        bm.run(["fixture"], cwd=fixture["project"], stage="signal")
    assert drained == [123]


def test_receipts_cannot_be_replayed_in_another_project(bm, fixture):
    other = fixture["project"].parent / "another"
    other.mkdir()
    (other / ".production-grade.yaml").write_bytes(b"managed")
    with pytest.raises(bm.BootstrapError, match="root binding"):
        bm.restore_receipts(other, [receipt(bm, ".production-grade.yaml")])
    assert (other / ".production-grade.yaml").read_bytes() == b"managed"


@pytest.mark.parametrize("partial", [False, True])
def test_docs_transaction_removes_only_its_addition(bm, fixture, monkeypatch, partial):
    other = {
        "id": "unrelated",
        "root": str(fixture["project"].parent / "other"),
        "title": "Other",
        "manifest": None,
    }
    bm.atomic_json(bm._docs_registry_path(), {"schema_version": 1, "projects": [other]})
    original = bm.call_forge

    def registry_adapter(args, **kwargs):
        if args[:3] == ["docs", "registry", "add"]:
            registry = bm._docs_registry()
            registry["projects"].append(
                {
                    "id": "fixture",
                    "root": str(fixture["project"]),
                    "title": "Fixture",
                    "manifest": None,
                }
            )
            bm.atomic_json(bm._docs_registry_path(), registry)
            if partial:
                raise bm.BootstrapError("partial", "registry wrote then failed")
        if args[:3] == ["docs", "registry", "remove"]:
            assert args[3] == str(fixture["project"])
            registry = bm._docs_registry()
            registry["projects"] = [
                x for x in registry["projects"] if x["root"] != args[3]
            ]
            bm.atomic_json(bm._docs_registry_path(), registry)
        return original(args, **kwargs)

    monkeypatch.setattr(bm, "call_forge", registry_adapter)
    monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE", "docs")
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(fixture["project"]), "automation")
    assert bm._docs_registry()["projects"] == [other]


def test_foreign_journal_and_malformed_tombstone_fail_closed(bm, fixture):
    bm.atomic_json(bm.tombstone_path(fixture["project"]), {})
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(fixture["project"]), "automation", auto=True)
    bm.tombstone_path(fixture["project"]).unlink()
    bm.atomic_json(
        bm._journal_path(fixture["project"]),
        {
            "schema": "forgewright-bootstrap-transaction/v1",
            "status": "completed",
            "project_root_digest": "0" * 64,
        },
    )
    with pytest.raises(bm.BootstrapError, match="recovery"):
        bm.ensure(str(fixture["project"]), "automation")
    assert fixture["calls"] == []


def test_verify_rejects_ready_state_with_unfinished_journal(bm, fixture):
    bm.ensure(str(fixture["project"]), "automation")
    path = bm._journal_path(fixture["project"])
    journal = json.loads(path.read_text())
    journal["status"] = "running"
    bm.atomic_json(path, journal)
    result = bm.verify(str(fixture["project"]))
    assert result["ok"] is False
    assert "recovery_required" in result["issues"]


def test_pi_model_requires_existing_setup_without_configuring_worker(bm, fixture):
    fixture["policy"]["pi_model"] = "explicit-model"
    result = bm.pi_prepare(fixture["policy"], fixture["project"])
    assert result["status"] == "degraded"
    assert fixture["calls"] == [["delegate", "status", "--worker", "pi"]]


def test_pretty_pi_status_json_is_read_without_enabling_worker(
    bm, fixture, monkeypatch
):
    real = baseline.module()
    monkeypatch.setenv("FORGEWRIGHT_CLI_ENTRY", "fixture-cli")
    monkeypatch.setattr(
        real,
        "run",
        lambda *a, **kw: {
            "status": "ready",
            "stdout": json.dumps(
                {"worker": "pi", "ready": False, "enabled": False}, indent=2
            ),
        },
    )
    assert (
        real.call_forge(
            ["delegate", "status", "--worker", "pi"],
            project=fixture["project"],
            required=False,
            stage="pi_status",
        )["status"]
        == "ready"
    )


def test_docs_cleanup_preserves_post_registration_user_edit(bm, fixture):
    row = {
        "id": "fixture",
        "root": str(fixture["project"]),
        "title": "Fixture",
        "manifest": None,
    }
    bm.atomic_json(bm._docs_registry_path(), {"schema_version": 1, "projects": [row]})
    expected = bm._docs_entry_digest(fixture["project"])
    row["title"] = "User edit"
    bm.atomic_json(bm._docs_registry_path(), {"schema_version": 1, "projects": [row]})
    with pytest.raises(bm.BootstrapError, match="preserving modified"):
        bm._remove_docs(fixture["project"], expected)
    assert bm._docs_registry()["projects"] == [row]
    assert fixture["calls"] == []


def test_admission_directory_does_not_follow_linked_ancestor(bm, fixture, monkeypatch):
    outside = fixture["project"].parent / "outside-admission"
    outside.mkdir()
    linked = fixture["home"] / "linked"
    linked.symlink_to(outside, target_is_directory=True)
    monkeypatch.setenv("FORGEWRIGHT_ADMISSION_HOME", str(linked / "admission"))
    with pytest.raises(bm.BootstrapError):
        with bm.HostCapacityLease(fixture["project"], wait_seconds=1):
            pytest.fail("admission followed a linked ancestor")
    assert list(outside.iterdir()) == []
