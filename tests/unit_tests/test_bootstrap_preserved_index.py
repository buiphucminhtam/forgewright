"""Preserved user indexes are validated without adopting or hashing their data."""
import os
from pathlib import Path

import pytest
from tests.unit_tests.test_auto_bootstrap import bm, fixture, index_fixture, module


def test_large_preserved_index_is_not_hashed_or_adopted(bm, fixture, monkeypatch):
    project = fixture["project"]
    index_fixture(project)
    database = project / ".gitnexus/lbug"
    with database.open("r+b") as stream:
        stream.truncate(65 * 1024 * 1024)
    before = database.stat()
    read_bytes = Path.read_bytes

    def guarded_read(path):
        assert path != database, "preflight must not load preserved database into RAM"
        return read_bytes(path)

    monkeypatch.setattr(Path, "read_bytes", guarded_read)
    bm._preflight_project(project)
    # The shared fixture replaces bm.gitnexus with a fake index creator.
    # Exercise the real preserved-index adapter, not that stage stub.
    result = module().gitnexus(project)
    assert result["status"] == "ready"
    assert result["created_dirs"] == []
    after = database.stat()
    assert (after.st_ino, after.st_size, after.st_mtime_ns) == (before.st_ino, before.st_size, before.st_mtime_ns)
    assert not (project / ".forgewright/bootstrap.json").exists()
    with pytest.raises(bm.BootstrapError, match="safety bound"):
        bm.directory_digest(project / ".gitnexus")


@pytest.mark.parametrize("kind", ["symlink", "dangling", "hardlink", "fifo"])
def test_preserved_index_still_rejects_unsafe_entries(bm, fixture, kind):
    project = fixture["project"]
    path = project / ".gitnexus"
    path.mkdir()
    victim = project.parent / "victim"
    victim.write_text("preserve")
    leaf = path / "entry"
    if kind == "hardlink":
        os.link(victim, leaf)
    elif kind == "fifo":
        os.mkfifo(leaf)
    else:
        leaf.symlink_to(victim if kind == "symlink" else project.parent / "missing")
    with pytest.raises(bm.BootstrapError):
        bm._preflight_project(project)
    assert victim.read_text() == "preserve"


def test_preserved_index_inspection_stops_at_entry_bound(bm, fixture, monkeypatch):
    from contextlib import contextmanager
    path = fixture["project"] / ".gitnexus"
    path.mkdir()
    (path / "leaf").touch()
    with os.scandir(path) as entries:
        entry = next(entries)
    observed = []

    @contextmanager
    def bounded_fixture(_path):
        def records():
            for number in range(6000):
                observed.append(number)
                yield entry
        yield records()

    monkeypatch.setattr(os, "scandir", bounded_fixture)
    with pytest.raises(bm.BootstrapError, match="entry inspection bound"):
        bm._validate_preserved_directory(path)
    assert len(observed) == 5001


@pytest.mark.parametrize("rollback_after_docs", [False, True])
def test_large_preserved_index_survives_transaction_lifecycle(
    bm, fixture, monkeypatch, rollback_after_docs
):
    project = fixture["project"]
    index_fixture(project)
    database = project / ".gitnexus/lbug"
    with database.open("r+b") as stream:
        stream.truncate(65 * 1024 * 1024)
    before = database.stat()
    read_bytes = Path.read_bytes

    def guarded_read(path):
        assert path != database, "transaction must not load preserved database"
        return read_bytes(path)

    monkeypatch.setattr(Path, "read_bytes", guarded_read)
    monkeypatch.setattr(bm, "gitnexus", module().gitnexus)
    if rollback_after_docs:
        monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE", "docs")
        with pytest.raises(bm.BootstrapError):
            bm.ensure(str(project), "automation")
        state = bm.read_state(project)
        assert state["status"] == "blocked"
        assert state["components"]["rollback"] == "completed"
    else:
        result = bm.ensure(str(project), "automation")
        assert result["status"] == "ready"
        state = bm.read_state(project)
        assert bm.verify(str(project))["ok"] is True
        disabled = bm.disable(str(project), keep_profile=False)
        assert disabled["status"] == "disabled"
        assert not bm.state_path(project).exists()

    assert ["docs", "init", str(project)] in fixture["calls"]
    for receipt in state["external_config_receipts"]:
        assert receipt.get("kind") != "project_directory"
    journal = bm._read_journal(project)
    for receipt in journal["external_config_receipts"]:
        assert receipt.get("kind") != "project_directory"
    assert not any(x["root"] == str(project) for x in bm._docs_registry()["projects"])
    after = database.stat()
    assert (after.st_ino, after.st_size, after.st_mtime_ns) == (
        before.st_ino, before.st_size, before.st_mtime_ns
    )
