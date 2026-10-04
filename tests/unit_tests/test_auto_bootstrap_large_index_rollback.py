"""Rollback bounds distinguish owned binary indexes from JSON authority."""

from __future__ import annotations

import json
import os
import subprocess
import sys

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline

bm = baseline.bm
fixture = baseline.fixture
LARGE_DB_BYTES = 5 * 1024 * 1024
OWNED_CAP_BYTES = 64 * 1024 * 1024


def install_large_owned_index(bm, fixture, monkeypatch):
    call_forge = bm.call_forge

    def valid_registry_call(args, *, project, required, stage):
        result = call_forge(args, project=project, required=required, stage=stage)
        if args[:3] == ["docs", "registry", "add"]:
            registry = bm._docs_registry()
            for entry in registry["projects"]:
                entry.update(
                    title="Fixture",
                    manifest=str(project / ".forgewright/docs-manifest.json"),
                )
            bm.atomic_json(bm._docs_registry_path(), registry)
        return result

    monkeypatch.setattr(bm, "call_forge", valid_registry_call)

    def index(target):
        result = baseline.index_fixture(target)
        (target / ".gitnexus/lbug").write_bytes(b"d" * LARGE_DB_BYTES)
        return result

    monkeypatch.setattr(bm, "gitnexus", index)
    project = fixture["project"]
    assert bm.ensure(str(project), "automation")["status"] == "ready"
    return project


@pytest.mark.parametrize("interrupted", [False, True])
def test_large_owned_index_disable_in_real_child(bm, fixture, monkeypatch, interrupted):
    project = install_large_owned_index(bm, fixture, monkeypatch)
    user = project / "user.txt"
    user.write_bytes(b"preserve source")
    if interrupted:
        monkeypatch.setattr(
            bm,
            "_cleanup_directory_tombstone",
            lambda *_: (_ for _ in ()).throw(OSError("crash after rename")),
        )
        with pytest.raises(OSError, match="crash after rename"):
            bm.disable(str(project), keep_profile=False)
        assert not (project / ".gitnexus").exists()
        assert bm._directory_rollback_journal(project).exists()
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import json,sys,bootstrap_manager as bm; "
            "print(json.dumps(bm.disable(sys.argv[1], keep_profile=False)))",
            str(project),
        ],
        env={
            **os.environ,
            "PYTHONPATH": str(baseline.ROOT / "scripts/runtime"),
            "PYTHONDONTWRITEBYTECODE": "1",
            "FORGEWRIGHT_CLI_ENTRY": str(baseline.ROOT / "src/cli/dist/index.js"),
        },
        text=True,
        capture_output=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    data = json.loads(result.stdout)
    assert data["status"] == "disabled" and data["shared_runtime_preserved"]
    assert {"path": ".gitnexus", "status": "removed"} in data["rollback"]
    assert not (project / ".gitnexus").exists()
    assert not list(project.glob("..gitnexus.forgewright-rollback-*"))
    assert not bm._directory_rollback_journal(project).exists()
    assert bm._read_journal(project)["settled"] is True
    assert bm._read_journal(project)["status"] == "completed"
    assert user.read_bytes() == b"preserve source"


@pytest.mark.parametrize("drift", ["changed", "added"])
def test_large_tombstone_preserves_user_drift(bm, fixture, monkeypatch, drift):
    project = install_large_owned_index(bm, fixture, monkeypatch)
    cleanup = bm._cleanup_directory_tombstone
    monkeypatch.setattr(
        bm,
        "_cleanup_directory_tombstone",
        lambda *_: (_ for _ in ()).throw(OSError("crash after rename")),
    )
    with pytest.raises(OSError):
        bm.disable(str(project), keep_profile=False)
    record = bm.load_json(bm._directory_rollback_journal(project))
    tombstone = project / record["tombstone"]
    changed = tombstone / ("lbug" if drift == "changed" else "user.txt")
    changed.write_bytes(b"changed" * (LARGE_DB_BYTES // 7 + 1))
    digest = bm.sha256_bytes(changed.read_bytes())
    monkeypatch.setattr(bm, "_cleanup_directory_tombstone", cleanup)
    receipts = bm._read_journal(project)["external_config_receipts"]
    assert bm.restore_directory_receipts(project, receipts) == [
        {"path": ".gitnexus", "status": "user_modified_preserved"}
    ]
    assert bm.sha256_bytes(changed.read_bytes()) == digest
    assert bm.load_json(bm._directory_rollback_journal(project)) == record


@pytest.mark.parametrize("kind", ["oversized", "symlink", "hardlink"])
def test_large_tombstone_rejects_unsafe_member(bm, fixture, kind):
    project = fixture["project"]
    tombstone = project / "..gitnexus.forgewright-rollback-test"
    tombstone.mkdir()
    member = tombstone / "lbug"
    victim = project / "victim"
    victim.write_bytes(b"v" * LARGE_DB_BYTES)
    expected = bm.sha256_bytes(victim.read_bytes())
    if kind == "oversized":
        with member.open("wb") as handle:
            handle.truncate(OWNED_CAP_BYTES + 1)
    elif kind == "symlink":
        member.symlink_to(victim)
    else:
        os.link(victim, member)
    record = {
        "schema": "forgewright-directory-rollback/v1",
        "project_root_digest": bm.root_digest(project),
        "path": ".gitnexus",
        "tombstone": tombstone.name,
        "files": {"lbug": expected},
    }
    with pytest.raises(bm.BootstrapError):
        bm._cleanup_directory_tombstone(project, record)
    assert member.exists()
    assert bm.sha256_bytes(victim.read_bytes()) == expected


def test_owned_directory_and_json_authority_caps_remain(bm, fixture):
    project = fixture["project"]
    folder = project / ".gitnexus"
    folder.mkdir()
    with (folder / "lbug").open("wb") as handle:
        handle.truncate(OWNED_CAP_BYTES + 1)
    with pytest.raises(bm.BootstrapError, match="exceeds safety bound"):
        bm.directory_digest(folder)
    state = project / "oversized-state.json"
    state.write_bytes(b" " * (4 * 1024 * 1024 + 1))
    with pytest.raises(bm.BootstrapError, match="unsafe state path"):
        bm.load_json(state)


def test_large_unowned_index_is_preserved_without_adoption(bm, fixture, monkeypatch):
    project = fixture["project"]
    baseline.index_fixture(project)
    database = project / ".gitnexus/lbug"
    database.write_bytes(b"d" * LARGE_DB_BYTES)
    digest = bm.sha256_bytes(database.read_bytes())
    # The generic unit adapter always writes its stand-in database. Exercise
    # the production existing-index branch for the preservation requirement.
    monkeypatch.setattr(bm, "gitnexus", baseline.module().gitnexus)
    assert bm.ensure(str(project), "automation")["status"] == "ready"
    state = bm.read_state(project)
    assert not any(
        item.get("path") == ".gitnexus" for item in state["external_config_receipts"]
    )
    assert bm.disable(str(project), keep_profile=False)["status"] == "disabled"
    assert bm.sha256_bytes(database.read_bytes()) == digest
