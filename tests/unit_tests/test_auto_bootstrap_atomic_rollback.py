"""Focused rollback durability regressions."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline

bm = baseline.bm
fixture = baseline.fixture


def test_atomic_restore_replacement_preserves_current_bytes_when_replace_fails(
    bm, fixture, monkeypatch
):
    path = fixture["project"] / ".production-grade.yaml"
    path.write_bytes(b"managed-after")
    original_replace = os.replace

    def fail_replace(source, target):
        if Path(target) == path:
            raise OSError("simulated power-loss boundary")
        return original_replace(source, target)

    monkeypatch.setattr(os, "replace", fail_replace)
    with pytest.raises(OSError, match="power-loss"):
        bm._atomic_bytes(
            path,
            b"before-bytes",
            expected_before_sha256=bm.sha256_bytes(b"managed-after"),
        )
    assert path.read_bytes() == b"managed-after"


def test_directory_rollback_renames_to_durable_tombstone_before_cleanup(
    bm, fixture, monkeypatch
):
    project = fixture["project"]

    def fake_gitnexus(target):
        path = target / ".gitnexus"
        path.mkdir()
        (path / "meta.json").write_text('{"ok":true}\n', encoding="utf-8")
        return {
            "status": "ready",
            "created_dirs": [
                {"path": ".gitnexus", "after_digest": bm.directory_digest(path)}
            ],
        }

    monkeypatch.setattr(bm, "gitnexus", fake_gitnexus)
    original_cleanup = bm._cleanup_directory_tombstone
    monkeypatch.setattr(
        bm,
        "_cleanup_directory_tombstone",
        lambda *_: (_ for _ in ()).throw(OSError("simulated crash after rename")),
    )
    monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE", "docs")
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(project), "automation")

    assert not (project / ".gitnexus").exists()
    record = bm.load_json(bm._directory_rollback_journal(project))
    assert record and record["path"] == ".gitnexus"
    tombstone = project / record["tombstone"]
    assert tombstone.is_dir()
    assert record["files"]["meta.json"] == bm.sha256_bytes(b'{"ok":true}\n')
    monkeypatch.setattr(bm, "_cleanup_directory_tombstone", original_cleanup)
    receipts = bm._read_journal(project)["external_config_receipts"]
    user_added = tombstone / "user-added.txt"
    user_added.write_text("preserve me\n", encoding="utf-8")
    assert bm.restore_directory_receipts(project, receipts) == [
        {"path": ".gitnexus", "status": "user_modified_preserved"}
    ]
    assert user_added.read_text(encoding="utf-8") == "preserve me\n"
    assert bm.load_json(bm._directory_rollback_journal(project)) == record
    user_added.unlink()
    assert bm.restore_directory_receipts(project, receipts) == [
        {"path": ".gitnexus", "status": "removed"}
    ]
    assert not tombstone.exists()


def test_directory_rollback_rejects_traversal_manifest_member(bm, fixture):
    project = fixture["project"]
    tombstone = project / "..gitnexus.forgewright-rollback-test"
    tombstone.mkdir()
    victim = project / "victim.txt"
    victim.write_text("must survive\n", encoding="utf-8")
    record = {
        "schema": "forgewright-directory-rollback/v1",
        "project_root_digest": bm.root_digest(project),
        "path": ".gitnexus",
        "tombstone": tombstone.name,
        "files": {"../victim.txt": bm.sha256_bytes(victim.read_bytes())},
    }

    with pytest.raises(bm.BootstrapError, match="unsafe directory rollback member"):
        bm._cleanup_directory_tombstone(project, record)

    assert victim.read_text(encoding="utf-8") == "must survive\n"


def test_directory_rollback_rejects_permissive_journal_authority(bm, fixture):
    project = fixture["project"]
    journal_parent = bm._directory_rollback_journal(project).parent
    journal_parent.mkdir()
    journal_parent.chmod(0o777)

    with pytest.raises(bm.BootstrapError, match="not user-owned"):
        bm._directory_rollback_journal(project)
