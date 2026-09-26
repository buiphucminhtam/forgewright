"""AB3/AB6: full opt-in owns a bounded, recoverable shared runtime install."""

from __future__ import annotations

import importlib
import json
import shutil
from pathlib import Path

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline

bm = baseline.bm
fixture = baseline.fixture
ROOT = Path(__file__).resolve().parents[2]


def _full_policy(fixture):
    fixture["policy"]["mode"] = "full"
    fixture["policy"]["forgewright_root"] = str(ROOT)
    return fixture["policy"]


def _journal(fixture):
    return {"transaction_id": "project-transaction", "processes": []}


def test_full_opt_in_installs_rlg_once_and_preserves_admission(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    rlg_home = fixture["home"] / ".forgewright/runtime"
    admission = rlg_home / "admission"
    admission.mkdir(parents=True)
    sentinel = admission / "keep.json"
    sentinel.write_text('{"owner":"admission"}\n')
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(rlg_home))
    policy = _full_policy(fixture)
    journal = _journal(fixture)

    with bm._track_transaction(fixture["project"], journal):
        first = bm.ensure_global_runtime(policy, ROOT)
    with bm._track_transaction(fixture["project"], journal):
        second = bm.ensure_global_runtime(policy, ROOT)

    assert first["status"] == "ready"
    assert second == first
    assert sentinel.read_text() == '{"owner":"admission"}\n'
    assert (rlg_home / "INSTALLED_FROM").is_file()
    assert (fixture["home"] / ".forgewright/scripts/runtime").is_dir()
    assert (
        journal["global_runtime_asset_transaction_id"]
        == first["asset_receipt"]["transaction_id"]
    )


def test_full_mcp_stage_copies_canonical_skills_and_binds_source(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    policy = _full_policy(fixture)
    policy["mcp_clients"] = ["codex"]
    rlg_home = fixture["home"] / ".forgewright/runtime"
    rlg_home.mkdir(parents=True)
    bm.atomic_json(rlg_home / "INSTALLED_FROM", {"manual": True})
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(rlg_home))

    def fake_run(argv, *, cwd, **_kwargs):
        if argv[:2] == ["npm", "ci"]:
            executable = cwd / "node_modules/.bin/tsx"
            executable.parent.mkdir(parents=True)
            executable.write_text("fixture executable")
        elif argv[:3] == ["npm", "run", "build"]:
            output = cwd / "build/runtime/tool-execution-gateway.js"
            output.parent.mkdir(parents=True)
            output.write_text("fixture build")
        return {"status": "ready"}

    monkeypatch.setattr(bm, "run", fake_run)
    journal = _journal(fixture)
    with bm._track_transaction(fixture["project"], journal):
        result = bm.ensure_global_runtime(policy, ROOT)

    assert result["status"] == "ready"
    installed = fixture["home"] / ".forgewright"
    assert not (installed / "skills").is_symlink()
    assert (installed / "scripts/lite/policy-check.sh").read_bytes() == (
        ROOT / "scripts/lite/policy-check.sh"
    ).read_bytes()
    assert (installed / "skills/software-engineer/LITE.md").read_bytes() == (
        ROOT / "skills/software-engineer/LITE.md"
    ).read_bytes()
    owner = json.loads(
        (installed / "mcp-server/.forgewright-auto-bootstrap-owner.json").read_text()
    )
    assert owner["source_root"] == str(ROOT)
    assert owner["source_commit"] == "a" * 40
    config = bm._client_path("codex")
    assert str(installed / "mcp-server/src/index.ts") in config.read_text()


def test_runtime_asset_crash_recovers_exact_publication(bm, fixture, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    adapter = importlib.import_module("shared_runtime_adapter")
    progress = fixture["home"] / "asset-progress.json"
    rlg_home = fixture["home"] / ".forgewright/runtime"
    admission = rlg_home / "admission"
    admission.mkdir(parents=True)
    (admission / "keep").write_text("admission")
    transaction = adapter.begin_shared_runtime(
        root=ROOT,
        home=fixture["home"],
        rlg_home=rlg_home,
        progress_path=progress,
        source_commit="a" * 40,
        need_rlg=True,
        need_mcp=False,
        project_transaction_id="project-transaction",
        project_root_digest=bm.root_digest(fixture["project"]),
        write_json=bm.atomic_json,
    )
    real_write = bm.atomic_json

    class Crash(BaseException):
        pass

    def crash_after_first_publish(path, value):
        real_write(path, value)
        if any(asset.get("published") for asset in value.get("assets", [])):
            raise Crash()

    with pytest.raises(Crash):
        adapter.install_shared_runtime(
            transaction,
            progress_path=progress,
            runner=bm.run,
            write_json=crash_after_first_publish,
        )
    public_scripts = fixture["home"] / ".forgewright/scripts/runtime"
    assert public_scripts.is_dir()

    actions = adapter.recover_shared_runtime(
        progress_path=progress,
        expected_project_transaction_id="project-transaction",
        expected_project_root_digest=bm.root_digest(fixture["project"]),
        expected_home=fixture["home"],
        expected_rlg_home=rlg_home,
        expected_source_root=ROOT,
        expected_prior_receipt_sha256=None,
        load_json=bm.load_json,
        write_json=bm.atomic_json,
    )

    assert actions and any(action["status"] == "removed" for action in actions)
    assert not public_scripts.exists()
    assert (admission / "keep").read_text() == "admission"


def test_runtime_asset_recovery_preserves_modified_publication(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    adapter = importlib.import_module("shared_runtime_adapter")
    progress = fixture["home"] / "asset-progress.json"
    rlg_home = fixture["home"] / ".forgewright/runtime"
    transaction = adapter.begin_shared_runtime(
        root=ROOT,
        home=fixture["home"],
        rlg_home=rlg_home,
        progress_path=progress,
        source_commit="a" * 40,
        need_rlg=True,
        need_mcp=False,
        project_transaction_id="project-transaction",
        project_root_digest=bm.root_digest(fixture["project"]),
        write_json=bm.atomic_json,
    )

    class Crash(BaseException):
        pass

    def crash_after_first_publish(path, value):
        bm.atomic_json(path, value)
        if any(asset.get("published") for asset in value.get("assets", [])):
            raise Crash()

    with pytest.raises(Crash):
        adapter.install_shared_runtime(
            transaction,
            progress_path=progress,
            runner=bm.run,
            write_json=crash_after_first_publish,
        )
    public_scripts = fixture["home"] / ".forgewright/scripts/runtime"
    modified = public_scripts / "user-added"
    modified.write_text("preserve")

    with pytest.raises(adapter.SharedRuntimeError, match="modified.*preserved"):
        adapter.recover_shared_runtime(
            progress_path=progress,
            expected_project_transaction_id="project-transaction",
            expected_project_root_digest=bm.root_digest(fixture["project"]),
            expected_home=fixture["home"],
            expected_rlg_home=rlg_home,
            expected_source_root=ROOT,
            expected_prior_receipt_sha256=None,
            load_json=bm.load_json,
            write_json=bm.atomic_json,
        )
    assert modified.read_text() == "preserve"


def test_runtime_asset_recovery_preserves_permission_modified_file(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    adapter = importlib.import_module("shared_runtime_adapter")
    progress = fixture["home"] / "asset-progress.json"
    rlg_home = fixture["home"] / ".forgewright/runtime"
    transaction = adapter.begin_shared_runtime(
        root=ROOT,
        home=fixture["home"],
        rlg_home=rlg_home,
        progress_path=progress,
        source_commit="a" * 40,
        need_rlg=True,
        need_mcp=False,
        project_transaction_id="project-transaction",
        project_root_digest=bm.root_digest(fixture["project"]),
        write_json=bm.atomic_json,
    )

    class Crash(BaseException):
        pass

    def crash_after_receipt_publish(path, value):
        bm.atomic_json(path, value)
        if any(
            asset.get("name") == "rlg:INSTALLED_FROM" and asset.get("published")
            for asset in value.get("assets", [])
        ):
            raise Crash()

    with pytest.raises(Crash):
        adapter.install_shared_runtime(
            transaction,
            progress_path=progress,
            runner=bm.run,
            write_json=crash_after_receipt_publish,
        )
    installed_from = rlg_home / "INSTALLED_FROM"
    installed_from.chmod(0o600)

    with pytest.raises(adapter.SharedRuntimeError, match="modified.*preserved"):
        adapter.recover_shared_runtime(
            progress_path=progress,
            expected_project_transaction_id="project-transaction",
            expected_project_root_digest=bm.root_digest(fixture["project"]),
            expected_home=fixture["home"],
            expected_rlg_home=rlg_home,
            expected_source_root=ROOT,
            expected_prior_receipt_sha256=None,
            load_json=bm.load_json,
            write_json=bm.atomic_json,
        )
    assert installed_from.stat().st_mode & 0o777 == 0o600


def test_incomplete_source_fails_before_runtime_mutation(bm, fixture, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    policy = _full_policy(fixture)
    incomplete = fixture["root"] / "incomplete"
    incomplete.mkdir()
    policy["forgewright_root"] = str(incomplete)
    journal = _journal(fixture)

    with (
        bm._track_transaction(fixture["project"], journal),
        pytest.raises(bm.BootstrapError, match="missing source asset"),
    ):
        bm.ensure_global_runtime(policy, incomplete)

    assert not (fixture["home"] / ".forgewright/scripts/runtime").exists()
    assert not (fixture["home"] / ".forgewright/mcp-server").exists()


def test_owned_runtime_migrates_only_when_allowed_and_preserves_mutable_rlg_state(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    commit = ["a" * 40]
    monkeypatch.setattr(bm, "source_commit", lambda _root: commit[0])
    rlg_home = fixture["home"] / ".forgewright/runtime"
    admission = rlg_home / "admission"
    admission.mkdir(parents=True)
    sentinel = admission / "keep"
    sentinel.write_text("admission")
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(rlg_home))
    policy = _full_policy(fixture)
    journal = _journal(fixture)

    with bm._track_transaction(fixture["project"], journal):
        bm.ensure_global_runtime(policy, ROOT)
    (rlg_home / "MODE").write_text("enforce\n")
    commit[0] = "b" * 40

    with bm._track_transaction(fixture["project"], journal):
        deferred = bm.ensure_global_runtime(policy, ROOT, allow_runtime_update=False)
    assert deferred["status"] == "degraded"
    assert deferred["asset_receipt"]["source_commit"] == "a" * 40

    with bm._track_transaction(fixture["project"], journal):
        migrated = bm.ensure_global_runtime(policy, ROOT, allow_runtime_update=True)

    assert migrated["status"] == "ready"
    assert migrated["asset_receipt"]["source_commit"] == "b" * 40
    assert (rlg_home / "MODE").read_text() == "enforce\n"
    assert sentinel.read_text() == "admission"
    progress = bm.load_json(bm._shared_runtime_progress_path())
    assert progress["operation"] == "migrate"
    assert progress["status"] == "completed"
    assert not list(fixture["home"].rglob("*.forgewright-prior-*"))


def test_owned_mcp_receipt_can_add_missing_rlg_component(bm, fixture, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    rlg_home = fixture["home"] / ".forgewright/runtime"
    target = fixture["home"] / ".forgewright/scripts/runtime"
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(rlg_home))
    bm.run(
        [
            "bash",
            str(ROOT / "scripts/runtime/runtime-install.sh"),
            "--link",
            "--from",
            str(ROOT),
            "--target",
            str(target),
        ],
        cwd=ROOT,
        env={
            "FORGEWRIGHT_RLG_HOME": str(rlg_home),
            "FORGEWRIGHT_RLG_TARGET": str(target),
        },
        stage="test_manual_rlg",
    )
    policy = _full_policy(fixture)
    policy["mcp_clients"] = ["codex"]
    journal = _journal(fixture)
    real_run = bm.run

    def npm_fixture(argv, *, cwd, **kwargs):
        if argv[:2] == ["npm", "ci"]:
            executable = cwd / "node_modules/.bin/tsx"
            executable.parent.mkdir(parents=True)
            executable.write_text("fixture executable")
            return {"status": "ready"}
        if argv[:3] == ["npm", "run", "build"]:
            output = cwd / "build/runtime/tool-execution-gateway.js"
            output.parent.mkdir(parents=True)
            output.write_text("fixture build")
            return {"status": "ready"}
        return real_run(argv, cwd=cwd, **kwargs)

    monkeypatch.setattr(bm, "run", npm_fixture)
    with bm._track_transaction(fixture["project"], journal):
        first = bm.ensure_global_runtime(policy, ROOT)
    assert first["asset_receipt"]["mcp"] is True
    assert first["asset_receipt"]["rlg"] is False
    shutil.rmtree(target)
    (rlg_home / "INSTALLED_FROM").unlink()

    with bm._track_transaction(fixture["project"], journal):
        deferred = bm.ensure_global_runtime(policy, ROOT, allow_runtime_update=False)
    assert deferred["status"] == "degraded"
    assert deferred["asset_receipt"]["rlg"] is False
    assert not target.exists()

    with bm._track_transaction(fixture["project"], journal):
        updated = bm.ensure_global_runtime(policy, ROOT, allow_runtime_update=True)

    assert updated["status"] == "ready"
    assert updated["asset_receipt"]["mcp"] is True
    assert updated["asset_receipt"]["rlg"] is True


def test_owned_rlg_receipt_can_add_newly_required_mcp_component(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    rlg_home = fixture["home"] / ".forgewright/runtime"
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(rlg_home))
    policy = _full_policy(fixture)
    journal = _journal(fixture)
    with bm._track_transaction(fixture["project"], journal):
        first = bm.ensure_global_runtime(policy, ROOT)
    assert first["asset_receipt"]["rlg"] is True
    assert first["asset_receipt"]["mcp"] is False
    policy["mcp_clients"] = ["codex"]
    real_run = bm.run

    def npm_fixture(argv, *, cwd, **kwargs):
        if argv[:2] == ["npm", "ci"]:
            executable = cwd / "node_modules/.bin/tsx"
            executable.parent.mkdir(parents=True)
            executable.write_text("fixture executable")
            return {"status": "ready"}
        if argv[:3] == ["npm", "run", "build"]:
            output = cwd / "build/runtime/tool-execution-gateway.js"
            output.parent.mkdir(parents=True)
            output.write_text("fixture build")
            return {"status": "ready"}
        return real_run(argv, cwd=cwd, **kwargs)

    monkeypatch.setattr(bm, "run", npm_fixture)
    with bm._track_transaction(fixture["project"], journal):
        updated = bm.ensure_global_runtime(policy, ROOT, allow_runtime_update=True)

    assert updated["status"] == "ready"
    assert updated["asset_receipt"]["rlg"] is True
    assert updated["asset_receipt"]["mcp"] is True


def test_missing_whole_owned_mcp_asset_is_repaired(bm, fixture, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    commit = ["a" * 40]
    monkeypatch.setattr(bm, "source_commit", lambda _root: commit[0])
    rlg_home = fixture["home"] / ".forgewright/runtime"
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(rlg_home))
    policy = _full_policy(fixture)
    policy["mcp_clients"] = ["codex"]
    journal = _journal(fixture)
    real_run = bm.run

    def npm_fixture(argv, *, cwd, **kwargs):
        if argv[:2] == ["npm", "ci"]:
            executable = cwd / "node_modules/.bin/tsx"
            executable.parent.mkdir(parents=True)
            executable.write_text("fixture executable")
            return {"status": "ready"}
        if argv[:3] == ["npm", "run", "build"]:
            output = cwd / "build/runtime/tool-execution-gateway.js"
            output.parent.mkdir(parents=True)
            output.write_text("fixture build")
            return {"status": "ready"}
        return real_run(argv, cwd=cwd, **kwargs)

    monkeypatch.setattr(bm, "run", npm_fixture)
    with bm._track_transaction(fixture["project"], journal):
        first = bm.ensure_global_runtime(policy, ROOT)
    mcp_server = fixture["home"] / ".forgewright/mcp-server"
    shutil.rmtree(mcp_server)
    commit[0] = "b" * 40

    with bm._track_transaction(fixture["project"], journal):
        repaired = bm.ensure_global_runtime(policy, ROOT, allow_runtime_update=True)

    assert repaired["status"] == "ready"
    assert mcp_server.is_dir()
    assert repaired["asset_receipt"]["source_commit"] == "b" * 40
    assert (
        repaired["asset_receipt"]["transaction_id"]
        != first["asset_receipt"]["transaction_id"]
    )
    assert bm.load_json(bm._shared_runtime_progress_path())["operation"] == "repair"


def test_interrupted_missing_asset_repair_restores_missing_preimage(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    adapter = importlib.import_module("shared_runtime_adapter")
    rlg_home = fixture["home"] / ".forgewright/runtime"
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(rlg_home))
    policy = _full_policy(fixture)
    policy["mcp_clients"] = ["codex"]
    journal = _journal(fixture)
    real_run = bm.run

    def npm_fixture(argv, *, cwd, **kwargs):
        if argv[:2] == ["npm", "ci"]:
            executable = cwd / "node_modules/.bin/tsx"
            executable.parent.mkdir(parents=True)
            executable.write_text("fixture executable")
            return {"status": "ready"}
        if argv[:3] == ["npm", "run", "build"]:
            output = cwd / "build/runtime/tool-execution-gateway.js"
            output.parent.mkdir(parents=True)
            output.write_text("fixture build")
            return {"status": "ready"}
        return real_run(argv, cwd=cwd, **kwargs)

    monkeypatch.setattr(bm, "run", npm_fixture)
    with bm._track_transaction(fixture["project"], journal):
        first = bm.ensure_global_runtime(policy, ROOT)
    prior = first["asset_receipt"]
    mcp_server = fixture["home"] / ".forgewright/mcp-server"
    shutil.rmtree(mcp_server)
    progress_path = bm._shared_runtime_progress_path()
    transaction = adapter.begin_shared_runtime(
        root=ROOT,
        home=fixture["home"],
        rlg_home=rlg_home,
        progress_path=progress_path,
        source_commit="a" * 40,
        need_rlg=True,
        need_mcp=True,
        project_transaction_id="project-transaction",
        project_root_digest=bm.root_digest(fixture["project"]),
        write_json=bm.atomic_json,
        operation="repair",
        prior_receipt=prior,
    )

    class Crash(BaseException):
        pass

    def crash_after_missing_publish(path, value):
        bm.atomic_json(path, value)
        if any(
            asset.get("name") == "mcp_server" and asset.get("published")
            for asset in value.get("assets", [])
        ):
            raise Crash()

    with pytest.raises(Crash):
        adapter.install_shared_runtime(
            transaction,
            progress_path=progress_path,
            runner=npm_fixture,
            write_json=crash_after_missing_publish,
        )
    assert mcp_server.is_dir()

    actions = adapter.recover_shared_runtime(
        progress_path=progress_path,
        expected_project_transaction_id="project-transaction",
        expected_project_root_digest=bm.root_digest(fixture["project"]),
        expected_home=fixture["home"],
        expected_rlg_home=rlg_home,
        expected_source_root=ROOT,
        expected_prior_receipt_sha256=adapter.shared_runtime_receipt_digest(prior),
        load_json=bm.load_json,
        write_json=bm.atomic_json,
    )

    assert any(
        action["path"] == str(mcp_server) and action["status"] == "removed"
        for action in actions
    )
    assert not mcp_server.exists()
    assert bm.load_json(progress_path)["status"] == "rolled_back"


def test_unowned_partial_mcp_tree_is_preserved_and_not_reported_ready(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    rlg_home = fixture["home"] / ".forgewright/runtime"
    rlg_home.mkdir(parents=True)
    bm.atomic_json(rlg_home / "INSTALLED_FROM", {"manual": True})
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(rlg_home))
    policy = _full_policy(fixture)
    policy["mcp_clients"] = ["codex"]
    entry = bm._mcp_entry()
    for name in (entry["command"], entry["args"][0]):
        path = Path(name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("unowned incomplete fixture")
    monkeypatch.setattr(bm, "run", lambda *_args, **_kwargs: {"status": "ready"})

    result = bm.ensure_global_runtime(policy, ROOT)

    assert result["status"] == "degraded"
    assert "shared_mcp_assets_unverified" in result["issues"]
    assert not bm._client_path("codex").exists()
    assert Path(entry["command"]).read_text() == "unowned incomplete fixture"


def test_owned_runtime_migration_refuses_unproven_mcp_quiescence(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    commit = ["a" * 40]
    monkeypatch.setattr(bm, "source_commit", lambda _root: commit[0])
    rlg_home = fixture["home"] / ".forgewright/runtime"
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(rlg_home))
    policy = _full_policy(fixture)
    journal = _journal(fixture)
    with bm._track_transaction(fixture["project"], journal):
        first = bm.ensure_global_runtime(policy, ROOT)
    commit[0] = "b" * 40
    leases = fixture["home"] / ".forgewright/runtime/mcp-leases"
    leases.mkdir()
    (leases / ("mcp-" + "1" * 32 + ".json")).write_text(
        json.dumps(
            {
                "schema": "forgewright-mcp-lifecycle-lease/v1",
                "status": "open",
            }
        )
    )

    with (
        bm._track_transaction(fixture["project"], journal),
        pytest.raises(bm.BootstrapError, match="active or untrusted MCP lease"),
    ):
        bm.ensure_global_runtime(policy, ROOT, allow_runtime_update=True)

    progress = bm.load_json(bm._shared_runtime_progress_path())
    assert progress["status"] == "completed"
    assert progress["receipt"] == first["asset_receipt"]


def test_interrupted_owned_migration_restores_exact_prior_runtime(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    adapter = importlib.import_module("shared_runtime_adapter")
    rlg_home = fixture["home"] / ".forgewright/runtime"
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(rlg_home))
    policy = _full_policy(fixture)
    journal = _journal(fixture)
    with bm._track_transaction(fixture["project"], journal):
        first = bm.ensure_global_runtime(policy, ROOT)
    prior = first["asset_receipt"]
    progress_path = bm._shared_runtime_progress_path()
    transaction = adapter.begin_shared_runtime(
        root=ROOT,
        home=fixture["home"],
        rlg_home=rlg_home,
        progress_path=progress_path,
        source_commit="b" * 40,
        need_rlg=True,
        need_mcp=False,
        project_transaction_id="project-transaction",
        project_root_digest=bm.root_digest(fixture["project"]),
        write_json=bm.atomic_json,
        operation="migrate",
        prior_receipt=prior,
    )
    real_write = bm.atomic_json

    class Crash(BaseException):
        pass

    def crash_after_prior_move(path, value):
        real_write(path, value)
        if any(asset.get("prior_moved") for asset in value.get("assets", [])):
            raise Crash()

    with pytest.raises(Crash):
        adapter.install_shared_runtime(
            transaction,
            progress_path=progress_path,
            runner=bm.run,
            write_json=crash_after_prior_move,
        )

    actions = adapter.recover_shared_runtime(
        progress_path=progress_path,
        expected_project_transaction_id="project-transaction",
        expected_project_root_digest=bm.root_digest(fixture["project"]),
        expected_home=fixture["home"],
        expected_rlg_home=rlg_home,
        expected_source_root=ROOT,
        expected_prior_receipt_sha256=adapter.shared_runtime_receipt_digest(prior),
        load_json=bm.load_json,
        write_json=bm.atomic_json,
    )

    assert any(action["status"] == "restored" for action in actions)
    assert adapter.verify_shared_runtime(prior) == []
    assert bm.load_json(progress_path)["status"] == "rolled_back"


def test_committed_owned_migration_keeps_new_runtime_and_cleans_backups(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    adapter = importlib.import_module("shared_runtime_adapter")
    rlg_home = fixture["home"] / ".forgewright/runtime"
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(rlg_home))
    policy = _full_policy(fixture)
    journal = _journal(fixture)
    with bm._track_transaction(fixture["project"], journal):
        first = bm.ensure_global_runtime(policy, ROOT)
    prior = first["asset_receipt"]
    progress_path = bm._shared_runtime_progress_path()
    transaction = adapter.begin_shared_runtime(
        root=ROOT,
        home=fixture["home"],
        rlg_home=rlg_home,
        progress_path=progress_path,
        source_commit="b" * 40,
        need_rlg=True,
        need_mcp=False,
        project_transaction_id="project-transaction",
        project_root_digest=bm.root_digest(fixture["project"]),
        write_json=bm.atomic_json,
        operation="migrate",
        prior_receipt=prior,
    )

    class Crash(BaseException):
        pass

    def crash_after_commit(path, value):
        bm.atomic_json(path, value)
        if value.get("status") == "committed":
            raise Crash()

    with pytest.raises(Crash):
        adapter.install_shared_runtime(
            transaction,
            progress_path=progress_path,
            runner=bm.run,
            write_json=crash_after_commit,
        )
    committed = bm.load_json(progress_path)
    receipt = committed["receipt"]
    assert committed["status"] == "committed"
    assert adapter.verify_shared_runtime(receipt) == []

    actions = adapter.recover_shared_runtime(
        progress_path=progress_path,
        expected_project_transaction_id="project-transaction",
        expected_project_root_digest=bm.root_digest(fixture["project"]),
        expected_home=fixture["home"],
        expected_rlg_home=rlg_home,
        expected_source_root=ROOT,
        expected_prior_receipt_sha256=adapter.shared_runtime_receipt_digest(prior),
        load_json=bm.load_json,
        write_json=bm.atomic_json,
    )

    assert actions and all(action["status"] == "removed" for action in actions)
    assert adapter.verify_shared_runtime(receipt) == []
    assert bm.load_json(progress_path)["status"] == "completed"
    assert not list(fixture["home"].rglob("*.forgewright-prior-*"))


def test_running_recovery_requires_independently_bound_runtime_roots(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    adapter = importlib.import_module("shared_runtime_adapter")
    progress = fixture["home"] / "asset-progress.json"
    rlg_home = fixture["home"] / ".forgewright/runtime"
    transaction = adapter.begin_shared_runtime(
        root=ROOT,
        home=fixture["home"],
        rlg_home=rlg_home,
        progress_path=progress,
        source_commit="a" * 40,
        need_rlg=True,
        need_mcp=False,
        project_transaction_id="project-transaction",
        project_root_digest=bm.root_digest(fixture["project"]),
        write_json=bm.atomic_json,
    )

    with pytest.raises(
        adapter.SharedRuntimeError, match="independent recovery authority"
    ):
        adapter.recover_shared_runtime(
            progress_path=progress,
            expected_project_transaction_id="project-transaction",
            expected_project_root_digest=bm.root_digest(fixture["project"]),
            expected_home=fixture["root"],
            expected_rlg_home=rlg_home,
            expected_source_root=ROOT,
            expected_prior_receipt_sha256=None,
            load_json=bm.load_json,
            write_json=bm.atomic_json,
        )

    assert bm.load_json(progress)["transaction_id"] == transaction["transaction_id"]
