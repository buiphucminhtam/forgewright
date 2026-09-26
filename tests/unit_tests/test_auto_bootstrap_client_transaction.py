"""AB3/AB6: selected client changes remain a recoverable transaction."""

import importlib
import json
import stat
from pathlib import Path

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline

bm = baseline.bm
fixture = baseline.fixture


def prepare(bm, fixture, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    for filename in [bm._mcp_entry()["command"], bm._mcp_entry()["args"][0]]:
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
    mcp_server = framework / "mcp-server"
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
                "path": str(mcp_server),
                "digest": adapter._tree_digest(mcp_server),
            },
        ],
    }
    bm.atomic_json(
        bm._shared_runtime_progress_path(),
        {"status": "completed", "receipt": receipt},
    )
    bm.atomic_json(fixture["home"] / ".forgewright/runtime/INSTALLED_FROM", {})
    monkeypatch.setattr(bm, "run", lambda *a, **kw: {"status": "ready"})
    fixture["policy"]["mcp_clients"] = ["codex", "claude-code"]


def test_cross_project_recovery_ignores_only_unrecorded_terminal_client_progress(
    bm, fixture, monkeypatch
):
    monkeypatch.setattr(Path, "home", lambda: fixture["home"])
    project_a = fixture["root"] / "project-a"
    project_b = fixture["root"] / "project-b"
    project_a.mkdir()
    project_b.mkdir()
    transaction = {
        "transaction_id": "a" * 32,
        "project_transaction_id": "project-a-transaction",
        "project_root_digest": bm.root_digest(project_a),
        "status": "completed",
        "clients": [],
    }
    bm.atomic_json(bm._client_progress_path(), transaction)
    project_b_journal = {"transaction_id": "project-b-transaction"}

    assert bm.recover_global_runtime(project_b, project_b_journal) == []

    project_b_journal["global_runtime_transaction_id"] = transaction["transaction_id"]
    with pytest.raises(bm.BootstrapError, match="unbound shared transaction"):
        bm.recover_global_runtime(project_b, project_b_journal)
    project_b_journal.pop("global_runtime_transaction_id")

    transaction["status"] = "running"
    bm.atomic_json(bm._client_progress_path(), transaction)
    with pytest.raises(bm.BootstrapError, match="unbound shared transaction"):
        bm.recover_global_runtime(project_b, project_b_journal)


def test_later_client_conflict_rolls_back_earlier_client(bm, fixture, monkeypatch):
    prepare(bm, fixture, monkeypatch)
    codex = bm._client_path("codex")
    codex.parent.mkdir()
    before = b'# keep comments\nmodel="local"\n'
    codex.write_bytes(before)
    claude = bm._client_path("claude-code")
    foreign = b'{"mcpServers":{"forgewright":{"command":"user-owned"}}}'
    claude.write_bytes(foreign)
    with pytest.raises(bm.BootstrapError, match="preserving existing"):
        bm.ensure_global_runtime(fixture["policy"], fixture["root"])
    assert codex.read_bytes() == before
    assert claude.read_bytes() == foreign
    # Retry must not adopt the earlier incomplete mutation as a new baseline.
    with pytest.raises(bm.BootstrapError):
        bm.ensure_global_runtime(fixture["policy"], fixture["root"])
    assert codex.read_bytes() == before


@pytest.mark.parametrize("client", ["codex", "claude-code"])
def test_stale_preimage_is_rejected_without_losing_user_write(
    bm, fixture, monkeypatch, client
):
    prepare(bm, fixture, monkeypatch)
    path = bm._client_path(client)
    path.parent.mkdir(parents=True, exist_ok=True)
    original = b'model="old"\n' if client == "codex" else b'{"theme":"old"}'
    updated = b'model="new"\n' if client == "codex" else b'{"theme":"new"}'
    path.write_bytes(original)
    atomic = bm._atomic_bytes

    def concurrent_write(target, payload, **kwargs):
        if target == path:
            path.write_bytes(updated)
        return atomic(target, payload, **kwargs)

    monkeypatch.setattr(bm, "_atomic_bytes", concurrent_write)
    with pytest.raises(bm.BootstrapError):
        bm._configure_client(client)
    assert path.read_bytes() == updated


@pytest.mark.parametrize("client", ["codex", "claude-code"])
def test_interrupted_write_recovers_exact_original_bytes(
    bm, fixture, monkeypatch, client
):
    prepare(bm, fixture, monkeypatch)
    fixture["policy"]["mcp_clients"] = [client]
    path = bm._client_path(client)
    path.parent.mkdir(parents=True, exist_ok=True)
    before = (
        b'# intact\nmodel="local"\n'
        if client == "codex"
        else b'{ "theme" : "dark", "mcpServers" : {"other":{"command":"safe"}} }\n'
    )
    path.write_bytes(before)
    atomic = bm.atomic_json

    class Crash(BaseException):
        pass

    def crash_after_write(target, value):
        if target.name == "runtime-progress.json" and path.read_bytes() != before:
            raise Crash()
        return atomic(target, value)

    monkeypatch.setattr(bm, "atomic_json", crash_after_write)
    with pytest.raises(Crash):
        bm.ensure_global_runtime(fixture["policy"], fixture["root"])
    monkeypatch.setattr(bm, "atomic_json", atomic)
    # Recovery is explicit; a normal prompt must not retry incomplete setup.
    with pytest.raises(bm.BootstrapError):
        bm.ensure_global_runtime(fixture["policy"], fixture["root"])
    bm.recover_global_runtime()
    assert path.read_bytes() == before
    bm.recover_global_runtime()
    assert path.read_bytes() == before
    assert (
        bm.ensure_global_runtime(fixture["policy"], fixture["root"])["status"]
        == "ready"
    )


def test_recovery_preserves_user_changes_and_refuses_modified_owned_entry(
    bm, fixture, monkeypatch
):
    prepare(bm, fixture, monkeypatch)
    fixture["policy"]["mcp_clients"] = ["claude-code"]
    path = bm._client_path("claude-code")
    path.write_text('{"theme":"dark"}')
    atomic = bm.atomic_json

    class Crash(BaseException):
        pass

    def crash_after_write(target, value):
        if target.name == "runtime-progress.json" and "forgewright" in path.read_text():
            raise Crash()
        return atomic(target, value)

    monkeypatch.setattr(bm, "atomic_json", crash_after_write)
    with pytest.raises(Crash):
        bm.ensure_global_runtime(fixture["policy"], fixture["root"])
    monkeypatch.setattr(bm, "atomic_json", atomic)
    doc = json.loads(path.read_text())
    doc["theme"] = "light"
    doc["mcpServers"]["forgewright"]["command"] = "user-updated"
    path.write_text(json.dumps(doc))
    with pytest.raises(bm.BootstrapError):
        bm.recover_global_runtime()
    assert json.loads(path.read_text()) == doc


@pytest.mark.parametrize("client", ["codex", "claude-code"])
@pytest.mark.parametrize("crash_before_write", [True, False])
def test_recovery_handles_intent_window_without_storing_user_credentials(
    bm, fixture, monkeypatch, client, crash_before_write
):
    prepare(bm, fixture, monkeypatch)
    fixture["policy"]["mcp_clients"] = [client]
    path = bm._client_path(client)
    path.parent.mkdir(parents=True, exist_ok=True)
    sentinel = "user-private-config-must-not-be-copied"
    raw = (
        f'private_value="{sentinel}"\n'.encode()
        if client == "codex"
        else json.dumps({"private_value": sentinel}).encode()
    )
    path.write_bytes(raw)
    original_write = bm._atomic_bytes

    class Crash(BaseException):
        pass

    def crash(target, payload, **kwargs):
        if target == path:
            if not crash_before_write:
                original_write(target, payload, **kwargs)
            raise Crash()
        return original_write(target, payload, **kwargs)

    monkeypatch.setattr(bm, "_atomic_bytes", crash)
    with pytest.raises(Crash):
        bm.ensure_global_runtime(fixture["policy"], fixture["root"])
    monkeypatch.setattr(bm, "_atomic_bytes", original_write)
    progress = fixture["home"] / "runtime-progress.json"
    assert sentinel not in progress.read_text()
    bm.recover_global_runtime()
    assert path.read_bytes() == raw


@pytest.mark.parametrize("client", ["codex", "claude-code"])
def test_recovery_removes_only_own_entry_after_unrelated_user_edit(
    bm, fixture, monkeypatch, client
):
    prepare(bm, fixture, monkeypatch)
    fixture["policy"]["mcp_clients"] = [client]
    path = bm._client_path(client)
    path.parent.mkdir(parents=True, exist_ok=True)
    before = (
        b'model="old"\n'
        if client == "codex"
        else b'{ "theme" : "old", "nested" : {"keep":  3} }\n'
    )
    path.write_bytes(before)
    original_write = bm._atomic_bytes

    class Crash(BaseException):
        pass

    def crash(target, payload, **kwargs):
        result = original_write(target, payload, **kwargs)
        if target == path:
            raise Crash()
        return result

    monkeypatch.setattr(bm, "_atomic_bytes", crash)
    with pytest.raises(Crash):
        bm.ensure_global_runtime(fixture["policy"], fixture["root"])
    monkeypatch.setattr(bm, "_atomic_bytes", original_write)
    path.write_bytes(path.read_bytes().replace(b'"old"', b'"new"'))
    bm.recover_global_runtime()
    assert path.read_bytes() == before.replace(b'"old"', b'"new"')


def test_recovery_preserves_reformatted_owned_insertion(bm, fixture, monkeypatch):
    prepare(bm, fixture, monkeypatch)
    fixture["policy"]["mcp_clients"] = ["claude-code"]
    path = bm._client_path("claude-code")
    path.write_bytes(b'{ "theme" : "old" }\n')
    original_write = bm._atomic_bytes

    class Crash(BaseException):
        pass

    def crash(target, payload, **kwargs):
        result = original_write(target, payload, **kwargs)
        if target == path:
            raise Crash()
        return result

    monkeypatch.setattr(bm, "_atomic_bytes", crash)
    with pytest.raises(Crash):
        bm.ensure_global_runtime(fixture["policy"], fixture["root"])
    monkeypatch.setattr(bm, "_atomic_bytes", original_write)
    # Semantically equivalent user formatting still removes proof of exact byte ownership.
    reformatted = (json.dumps(json.loads(path.read_bytes()), indent=4) + "\n").encode()
    path.write_bytes(reformatted)
    with pytest.raises(bm.BootstrapError):
        bm.recover_global_runtime()
    assert path.read_bytes() == reformatted
