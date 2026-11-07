"""Turn-local Stop scope and cross-language MCP maintenance regressions."""

import importlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tomllib

import pytest
from tests.unit_tests import test_auto_bootstrap as bootstrap_tests

bm = bootstrap_tests.bm
fixture = bootstrap_tests.fixture

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/lite"))
sys.path.insert(0, str(ROOT / "scripts/runtime"))


def git(root, *args):
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


@pytest.fixture
def project(tmp_path):
    git(tmp_path, "init", "-q")
    git(tmp_path, "config", "user.email", "test@example.invalid")
    git(tmp_path, "config", "user.name", "Scope Test")
    (tmp_path / "old.py").write_text("value = 1\n")
    git(tmp_path, "add", "old.py")
    git(tmp_path, "commit", "-qm", "baseline")
    (tmp_path / "old.py").write_text("value = 2\n")
    return tmp_path


def capture(root, turn="status-turn"):
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/lite/rule-context-hook.py"),
            "--workspace",
            str(root),
            "--platform",
            "CODEX",
            "--event",
            "UserPromptSubmit",
        ],
        input=json.dumps({"session_id": "scope-session", "turn_id": turn}),
        text=True,
        capture_output=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr


def stop(root, turn="status-turn", **extra):
    return subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/lite/stop_gate.py"),
            "--platform",
            "CODEX",
            "--typed-stop-decision",
        ],
        cwd=root,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(root)},
        input=json.dumps(
            {
                "hook_event_name": "Stop",
                "session_id": "scope-session",
                "turn_id": turn,
                "last_assistant_message": "Current status only.",
                **extra,
            }
        ),
        text=True,
        capture_output=True,
        timeout=20,
    )


def test_status_with_preexisting_dirty_code_does_not_require_evidence(project):
    capture(project)
    result = stop(project)
    assert result.returncode == 0, result.stderr
    assert "no_code_changes" in result.stderr
    assert (project / "old.py").read_text() == "value = 2\n"


def test_claude_session_scoped_baseline_ignores_preexisting_dirty_and_gates_new_edits(
    project,
):
    prompt_res = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/lite/rule-context-hook.py"),
            "--workspace",
            str(project),
            "--platform",
            "CLAUDE",
            "--event",
            "UserPromptSubmit",
        ],
        input=json.dumps({"session_id": "claude-session-1"}),
        text=True,
        capture_output=True,
        timeout=15,
    )
    assert prompt_res.returncode == 0, prompt_res.stderr

    stop_clean = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/lite/stop_gate.py"),
            "--platform",
            "CLAUDE",
            "--typed-stop-decision",
        ],
        cwd=project,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(project)},
        input=json.dumps(
            {
                "hook_event_name": "Stop",
                "session_id": "claude-session-1",
                "last_assistant_message": "Answered the question.",
            }
        ),
        text=True,
        capture_output=True,
        timeout=20,
    )
    assert stop_clean.returncode == 0, stop_clean.stderr
    assert "No code changes detected" in stop_clean.stdout

    (project / "old.py").write_text("value = 3\n")
    stop_edited = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/lite/stop_gate.py"),
            "--platform",
            "CLAUDE",
            "--typed-stop-decision",
        ],
        cwd=project,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(project)},
        input=json.dumps(
            {
                "hook_event_name": "Stop",
                "session_id": "claude-session-1",
                "last_assistant_message": "Edited old.py without evidence.",
            }
        ),
        text=True,
        capture_output=True,
        timeout=20,
    )
    assert stop_edited.returncode == 2


def test_new_turn_edits_still_require_evidence(project):
    capture(project)
    (project / "old.py").write_text("value = 3\n")
    result = stop(project)
    assert json.loads(result.stdout).get("decision") == "block", result.stderr


def test_turn_scope_excludes_old_dirty_paths_and_includes_new_edits(project):
    capture(project)
    (project / "new.py").write_text("value = 3\n")
    module = importlib.import_module("stop_gate")
    assert module._files_to_check(
        project, {"session_id": "scope-session", "turn_id": "status-turn"}
    ) == ["new.py"]


@pytest.mark.parametrize("case", ["missing", "other_turn", "claim"])
def test_unproven_scope_and_explicit_claims_remain_gated(project, case):
    if case != "missing":
        capture(project)
    result = stop(
        project,
        turn="other-turn" if case == "other_turn" else "status-turn",
        **({"last_assistant_message": "VERIFY: PASS"} if case == "claim" else {}),
    )
    assert json.loads(result.stdout).get("decision") == "block", result.stderr


def test_committed_edit_during_turn_remains_in_scope(project):
    capture(project)
    (project / "new.py").write_text("value = 3\n")
    git(project, "add", "new.py")
    git(project, "commit", "-qm", "new edit")
    module = importlib.import_module("stop_gate")
    assert module._files_to_check(
        project, {"session_id": "scope-session", "turn_id": "status-turn"}
    ) == ["new.py"]


@pytest.mark.parametrize("change", ["delete", "stage", "recapture"])
def test_baseline_cannot_hide_deletion_staging_or_reset(project, change):
    capture(project)
    if change == "delete":
        (project / "old.py").unlink()
    elif change == "stage":
        git(project, "add", "old.py")
    else:
        (project / "old.py").write_text("value = 3\n")
        capture(project)
    assert json.loads(stop(project).stdout).get("decision") == "block"


@pytest.mark.parametrize("damage", ["corrupt", "symlink", "expired", "session"])
def test_unsafe_baseline_retains_conservative_gate(project, damage):
    capture(project)
    baseline = next((project / ".forgewright/runtime/turn-scopes").glob("*.json"))
    if damage == "corrupt":
        baseline.write_text("{")
    elif damage == "symlink":
        target = baseline.with_suffix(".saved")
        baseline.rename(target)
        baseline.symlink_to(target)
    else:
        record = json.loads(baseline.read_text())
        if damage == "expired":
            record["created_at"] = 0
        else:
            record["identity"]["session"] = "other-session"
        baseline.write_text(json.dumps(record))
    assert json.loads(stop(project).stdout).get("decision") == "block"


def test_git_failure_does_not_prove_empty_turn_scope(project, monkeypatch):
    capture(project)
    module = importlib.import_module("turn_scope")

    def fail(*args):
        raise subprocess.CalledProcessError(128, ["git"])

    monkeypatch.setattr(module, "_git", fail)
    assert (
        module.files_changed_this_turn(
            project, {"session_id": "scope-session", "turn_id": "status-turn"}
        )
        is None
    )


def test_installed_prompt_uses_consumer_workspace_and_doctor_repairs_dependency(
    project, tmp_path_factory
):
    from tests.unit_tests.test_rule_hook_distribution import (
        BASH,
        custom_manifest,
        lifecycle_commands,
        run_doctor,
        run_installer,
    )

    home = tmp_path_factory.mktemp("scope-consumer-home")
    framework = home / ".forgewright"
    custom_manifest(project)
    installed = run_installer(home, framework)
    assert installed.returncode == 0, installed.stdout + installed.stderr
    config = tomllib.loads((home / ".codex/config.toml").read_text())
    prompts = lifecycle_commands(config, "UserPromptSubmit")
    assert len(prompts) == 1
    result = subprocess.run(
        [BASH, "-lc", prompts[0]["command"]],
        cwd=project,
        # Model the consumer host, not the enclosing Stop validator's workspace.
        env={
            **os.environ,
            "FORGEWRIGHT_PROJECT_ROOT": str(project),
            "FORGEWRIGHT_WORKSPACE": str(project),
        },
        input=json.dumps({"session_id": "scope-session", "turn_id": "status-turn"}),
        text=True,
        capture_output=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    assert len(list((project / ".forgewright/runtime/turn-scopes").glob("*.json"))) == 1
    assert not (framework / ".forgewright/runtime/turn-scopes").exists()
    assert "no_code_changes" in stop(project).stderr
    (framework / "scripts/lite/turn_scope.py").write_text("stale-dependency")
    repaired = run_doctor(home, framework, "--fix")
    assert repaired.returncode == 0, repaired.stdout + repaired.stderr
    assert (framework / "scripts/lite/turn_scope.py").read_bytes() == (
        ROOT / "scripts/lite/turn_scope.py"
    ).read_bytes()


def test_bootstrap_holds_maintenance_from_quiescence_through_publication(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    monkeypatch.setenv(
        "FORGEWRIGHT_RLG_HOME", str(fixture["home"] / ".forgewright/runtime")
    )
    policy = {**fixture["policy"], "mode": "full", "forgewright_root": str(ROOT)}
    journal = {"transaction_id": "scope-maintenance", "processes": []}
    with bm._track_transaction(fixture["project"], journal):
        bm.ensure_global_runtime(policy, ROOT)
    monkeypatch.setattr(bm, "source_commit", lambda _root: "b" * 40)
    lock = fixture["home"] / ".forgewright/runtime/mcp-leases/mcp-admission.lock"
    observed = []
    for name in ("assert_runtime_quiescent", "install_shared_runtime"):
        original = getattr(bm, name)

        def checked(*args, _original=original, _name=name, **kwargs):
            assert lock.is_file(), _name
            observed.append(_name)
            return _original(*args, **kwargs)

        monkeypatch.setattr(bm, name, checked)
    with bm._track_transaction(fixture["project"], journal):
        result = bm.ensure_global_runtime(policy, ROOT, allow_runtime_update=True)
    assert result["status"] == "ready"
    assert observed == ["assert_runtime_quiescent", "install_shared_runtime"]
    assert not lock.exists()


def native_acquire(lease_root, *, reconcile_only=False):
    module = (ROOT / "mcp/src/runtime/lifecycle-lease.ts").as_uri()
    code = f"""import {{ LifecycleLeaseStore }} from {json.dumps(module)};
const store = new LifecycleLeaseStore({{root: process.argv[1]}});
(async () => {{
try {{
 {'await store.reconcile(); console.log("reconciled"); return;' if reconcile_only else ""}
 const lease = await store.acquire({{workspaceId:'maintenance-test', sessionId:'reconnect',
  identity:await store.inspectCurrent(), ttlMs:1000}});
 await store.release(lease.leaseId, lease.ownerToken, lease.version);
 console.log('acquired-and-closed');
}} catch (error) {{ console.error(String(error)); process.exitCode=1; }}
}})();"""
    return subprocess.run(
        [str(ROOT / "node_modules/.bin/tsx"), "--eval", code, str(lease_root)],
        cwd=ROOT / "mcp",
        text=True,
        capture_output=True,
        timeout=15,
    )


def test_maintenance_fences_native_reconnect_and_reopens_after_exit(tmp_path):
    adapter = importlib.import_module("shared_runtime_adapter")
    lease_root = tmp_path / ".forgewright/runtime/mcp-leases"
    with adapter.runtime_maintenance(home=tmp_path):
        result = native_acquire(lease_root)
        assert result.returncode != 0, result.stdout
        assert "lease_lock_timeout" in result.stderr
        assert list(lease_root.glob("mcp-*.json")) == []
    result = native_acquire(lease_root)
    assert result.returncode == 0, result.stderr
    assert "acquired-and-closed" in result.stdout
    assert not (lease_root / "mcp-admission.lock").exists()


def test_maintenance_preserves_other_owner_and_releases_on_error(tmp_path):
    adapter = importlib.import_module("shared_runtime_adapter")
    with adapter.runtime_maintenance(home=tmp_path):
        lock = tmp_path / ".forgewright/runtime/mcp-leases/mcp-admission.lock"
        original = lock.read_bytes()
        with pytest.raises(adapter.SharedRuntimeError):
            with adapter.runtime_maintenance(home=tmp_path):
                pytest.fail("second maintenance owner entered")
        assert lock.read_bytes() == original
    with pytest.raises(RuntimeError, match="injected"):
        with adapter.runtime_maintenance(home=tmp_path):
            raise RuntimeError("injected")
    assert not lock.exists()


def test_active_mcp_leases_still_block_maintenance(tmp_path):
    adapter = importlib.import_module("shared_runtime_adapter")
    with adapter.runtime_maintenance(home=tmp_path) as maintenance_identity:
        root = tmp_path / ".forgewright/runtime/mcp-leases"
        (root / ("mcp-" + "1" * 32 + ".json")).write_text(
            json.dumps(
                {"schema": "forgewright-mcp-lifecycle-lease/v1", "status": "open"}
            )
        )
        with pytest.raises(
            adapter.SharedRuntimeError, match="active or untrusted MCP lease"
        ):
            adapter.assert_runtime_quiescent(
                root=ROOT,
                home=tmp_path,
                rlg_home=tmp_path / ".forgewright/runtime",
                runner=lambda *a, **kw: {"status": "ready", "stdout": "[]"},
                maintenance_identity=maintenance_identity,
            )


def test_unowned_admission_lock_is_not_quiescent(tmp_path):
    adapter = importlib.import_module("shared_runtime_adapter")
    with adapter.runtime_maintenance(home=tmp_path):
        with pytest.raises(
            adapter.SharedRuntimeError, match="owned by another operation"
        ):
            adapter.assert_runtime_quiescent(
                root=ROOT,
                home=tmp_path,
                rlg_home=tmp_path / ".forgewright/runtime",
                runner=lambda *a, **kw: {"status": "ready", "stdout": "[]"},
            )


@pytest.mark.parametrize("capability", [None, {}, {"maintenance_admission": "unknown"}])
def test_legacy_runtime_cannot_claim_reconnect_protection(tmp_path, capability):
    adapter = importlib.import_module("shared_runtime_adapter")
    installed = tmp_path / ".forgewright/mcp-server"
    installed.mkdir(parents=True)
    if capability is not None:
        (installed / "runtime-capabilities.json").write_text(json.dumps(capability))
    with pytest.raises(adapter.SharedRuntimeError, match="offline host upgrade"):
        with adapter.runtime_maintenance(home=tmp_path) as owner:
            adapter.assert_runtime_quiescent(
                root=ROOT,
                home=tmp_path,
                rlg_home=tmp_path / ".forgewright/runtime",
                runner=lambda *a, **kw: {"status": "ready", "stdout": "[]"},
                maintenance_identity=owner,
                require_mcp_admission=True,
            )
    assert not (
        tmp_path / ".forgewright/runtime/mcp-leases/mcp-admission.lock"
    ).exists()


def test_maintenance_blocks_native_startup_reconciliation(tmp_path):
    adapter = importlib.import_module("shared_runtime_adapter")
    lease_root = tmp_path / ".forgewright/runtime/mcp-leases"
    with adapter.runtime_maintenance(home=tmp_path):
        result = native_acquire(lease_root, reconcile_only=True)
        assert result.returncode != 0
        assert "lease_lock_timeout" in result.stderr
    assert native_acquire(lease_root, reconcile_only=True).returncode == 0


@pytest.mark.parametrize("replacement", [False, True])
@pytest.mark.parametrize("body_failure", [False, True])
def test_maintenance_cleanup_preserves_replacement_and_original_failure(
    tmp_path, replacement, body_failure
):
    adapter = importlib.import_module("shared_runtime_adapter")
    lock = tmp_path / ".forgewright/runtime/mcp-leases/mcp-admission.lock"
    expected = RuntimeError if body_failure else adapter.SharedRuntimeError
    with pytest.raises(
        expected, match="injected" if body_failure else "Cannot release"
    ):
        with adapter.runtime_maintenance(home=tmp_path):
            lock.rename(lock.with_suffix(".held"))
            if replacement:
                lock.write_text("another-owner")
            if body_failure:
                raise RuntimeError("injected")
    if replacement:
        assert lock.read_text() == "another-owner"


@pytest.mark.parametrize("body_failure", [False, True])
def test_native_lock_cleanup_preserves_replacement_owner(tmp_path, body_failure):
    lease_root = tmp_path / "leases"
    module = (ROOT / "mcp/src/runtime/lifecycle-lease.ts").as_uri()
    code = f"""import {{LifecycleLeaseStore}} from {json.dumps(module)};
import {{rename,writeFile}} from 'node:fs/promises';
import {{join}} from 'node:path';
const root=process.argv[1]; const store=new LifecycleLeaseStore({{root}});
(async()=>{{try {{
 await store.withLock('mcp-admission',async()=>{{
  const lock=join(root,'mcp-admission.lock');
  await rename(lock,lock+'.held'); await writeFile(lock,'replacement-owner');
  {'throw new Error("injected");' if body_failure else ""}
 }});
 process.exitCode=2;
}}catch(error){{console.log(String(error));}}}})();"""
    result = subprocess.run(
        [str(ROOT / "node_modules/.bin/tsx"), "--eval", code, str(lease_root)],
        cwd=ROOT / "mcp",
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    assert (
        "injected" if body_failure else "lease_lock_ownership_changed"
    ) in result.stdout
    assert (lease_root / "mcp-admission.lock").read_text() == "replacement-owner"


def test_legacy_installer_defers_mcp_without_copy_or_client_enablement(tmp_path):
    from tests.unit_tests.test_rule_hook_distribution import (
        BASH,
        INSTALLER,
        git_bash_path,
    )

    home = tmp_path / "home"
    home.mkdir()
    framework = home / ".forgewright"
    env = {
        **os.environ,
        "HOME": git_bash_path(home),
        "FORGEWRIGHT_DIR": git_bash_path(framework),
        "FORGEWRIGHT_SOURCE_DIR": git_bash_path(ROOT),
    }
    result = subprocess.run(
        [
            BASH,
            str(INSTALLER),
            "--profile",
            "minimal",
            "--yes",
            "--skip-skills",
            "--skip-config",
        ],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "Legacy MCP copy/configuration deferred" in result.stdout
    assert not (framework / "mcp-server").exists()
    for config in (home / ".claude/settings.json", home / ".cursor/mcp.json"):
        if config.exists():
            assert (
                not json.loads(config.read_text())
                .get("mcpServers", {})
                .get("forgewright")
            )
