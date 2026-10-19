"""Storage lifecycle never infers ownership from a cache/build directory name."""

from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
from project_storage import (
    JobStorage,
    StorageError,
    measure_tree,
    preview_cleanup,
    apply_cleanup,
)


def make(tmp_path, job="job-a", **kw):
    workspace = tmp_path / "project"
    workspace.mkdir(exist_ok=True)
    return JobStorage(workspace, job, scratch_limit=1024, output_limit=1024, **kw)


def test_owned_scratch_removed_and_outputs_bounded_after_quiescence(tmp_path):
    storage = make(tmp_path)
    (storage.scratch / "abandoned.tmp").write_bytes(b"x" * 100)
    (storage.output / "build.bin").write_bytes(b"y" * 200)
    receipt = storage.finish(quiescent=True, success=True)
    assert not storage.scratch.exists()
    assert (storage.output / "build.bin").exists()
    assert receipt["output_bytes"] >= 200 and receipt["quiescent"] is True
    assert receipt["state"] == "retained"


def test_no_cleanup_when_descendants_uncertain(tmp_path):
    storage = make(tmp_path)
    marker = storage.scratch / "live-child.tmp"
    marker.write_text("keep")
    receipt = storage.finish(quiescent=False, success=False)
    assert receipt["state"] == "quarantined" and marker.exists()


def test_oversized_or_failed_outputs_do_not_accumulate(tmp_path):
    storage = make(tmp_path)
    (storage.output / "too-large.bin").write_bytes(b"x" * 2048)
    with pytest.raises(StorageError, match="output-budget"):
        storage.finish(quiescent=True, success=True)
    assert not storage.root.exists()
    failed = make(tmp_path, "job-b")
    (failed.output / "failed.log").write_text("failed")
    assert failed.finish(quiescent=True, success=False)["state"] == "reclaimed"
    assert not failed.root.exists()


def test_preexisting_or_symlinked_job_root_cannot_be_adopted(tmp_path):
    storage = make(tmp_path)
    with pytest.raises(StorageError, match="already-exists"):
        make(tmp_path)
    foreign = tmp_path / "foreign"
    foreign.mkdir()
    (foreign / "keep").write_text("source")
    parent = storage.root.parent
    (parent / "job-foreign").symlink_to(foreign, target_is_directory=True)
    with pytest.raises(StorageError):
        make(tmp_path, "job-foreign")
    assert (foreign / "keep").exists()


def test_preview_apply_requires_exact_tree_and_terminal_lease_proof(tmp_path):
    storage = make(tmp_path)
    (storage.output / "build.bin").write_bytes(b"x" * 100)
    record = storage.finish(quiescent=True, success=True)
    preview = preview_cleanup(
        [record],
        max_keep=0,
        max_bytes=0,
        now=100,
        released=lambda _: True,
        protect_latest=False,
    )
    assert preview["bytes"] >= 100 and len(preview["items"]) == 1
    assert storage.root.exists()  # Preview cannot delete.
    with pytest.raises(StorageError, match="lease-not-released"):
        apply_cleanup(preview, released=lambda _: False)
    (storage.output / "build.bin").write_bytes(b"changed")
    with pytest.raises(StorageError, match="storage-drift"):
        apply_cleanup(preview, released=lambda _: True)
    assert storage.root.exists()


def test_cleanup_owned_tree_never_follows_foreign_symlink(tmp_path):
    storage = make(tmp_path)
    foreign = tmp_path / "source"
    foreign.mkdir()
    (foreign / "keep.txt").write_text("keep")
    (storage.output / "link").symlink_to(foreign, target_is_directory=True)
    record = storage.finish(quiescent=True, success=True)
    preview = preview_cleanup(
        [record],
        max_keep=0,
        max_bytes=0,
        now=100,
        released=lambda _: True,
        protect_latest=False,
    )
    apply_cleanup(preview, released=lambda _: True)
    assert not storage.root.exists() and (foreign / "keep.txt").read_text() == "keep"


def test_quarantined_or_pinned_artifact_never_evicted_by_quota(tmp_path):
    storage = make(tmp_path)
    (storage.output / "build").write_text("keep")
    record = storage.finish(quiescent=True, success=True)
    record["pinned"] = True
    assert (
        preview_cleanup(
            [record], max_keep=0, max_bytes=0, now=100, released=lambda _: True
        )["items"]
        == []
    )
    record["pinned"] = False
    record["state"] = "quarantined"
    assert (
        preview_cleanup(
            [record], max_keep=0, max_bytes=0, now=100, released=lambda _: True
        )["items"]
        == []
    )


def test_sparse_files_and_missing_sensor_cannot_hide_disk_growth(tmp_path):
    storage = make(tmp_path)
    with (storage.scratch / "sparse").open("wb") as stream:
        stream.truncate(2048)
    with pytest.raises(StorageError, match="scratch-budget"):
        storage.check()
    with pytest.raises(StorageError):
        measure_tree(tmp_path / "missing")


def test_root_replacement_cannot_remove_foreign_scratch(tmp_path):
    storage = make(tmp_path)
    storage.root.rename(storage.root.with_name("original-owned"))
    storage.root.mkdir()
    (storage.root / "scratch").mkdir()
    (storage.root / "scratch/keep").write_text("foreign")
    (storage.root / "output").mkdir()
    with pytest.raises(StorageError, match="storage-drift"):
        storage.finish(quiescent=True, success=True)
    assert (storage.root / "scratch/keep").read_text() == "foreign"


def test_tombstone_replaced_after_validation_never_deletes_replacement(
    tmp_path, monkeypatch
):
    import project_storage

    storage = make(tmp_path)
    (storage.output / "owned").write_text("old")
    record = storage.finish(quiescent=True, success=True)
    preview = preview_cleanup(
        [record], max_keep=0, max_bytes=0, released=lambda _: True, protect_latest=False
    )
    original = project_storage.measure_tree
    replaced = []

    def change_after_snapshot(path, **kw):
        result = original(path, **kw)
        path = Path(path)
        if path.name.startswith(".reclaim-") and not replaced:
            path.rename(path.with_name(path.name + "-original"))
            path.mkdir()
            marker = path / "foreign-source"
            marker.write_text("keep")
            replaced.append(marker)
        return result

    monkeypatch.setattr(project_storage, "measure_tree", change_after_snapshot)
    with pytest.raises(StorageError):
        apply_cleanup(preview, released=lambda _: True)
    assert replaced[0].read_text() == "keep"


def test_pin_acquired_after_preview_prevents_gc(tmp_path):
    from project_storage import pin_artifact, unpin_artifact

    storage = make(tmp_path)
    (storage.output / "build").write_text("consumer data")
    record = storage.finish(quiescent=True, success=True)
    preview = preview_cleanup(
        [record], max_keep=0, max_bytes=0, released=lambda _: True, protect_latest=False
    )
    token = pin_artifact(record, "preview-consumer")
    with pytest.raises(StorageError, match="artifact-protected"):
        apply_cleanup(preview, released=lambda _: True)
    assert (storage.output / "build").exists()
    with pytest.raises(StorageError):
        unpin_artifact(record, "wrong-token")
    unpin_artifact(record, token)
    apply_cleanup(preview, released=lambda _: True)
    assert not storage.root.exists()


def test_protected_latest_does_not_hide_unsatisfied_byte_quota(tmp_path):
    storage = make(tmp_path)
    (storage.output / "build").write_bytes(b"x" * 100)
    record = storage.finish(quiescent=True, success=True)
    preview = preview_cleanup(
        [record], max_keep=1, max_bytes=10, released=lambda _: True
    )
    assert preview["items"] == [] and preview["quota_satisfied"] is False
    assert preview["remaining_bytes"] >= 100


def test_unexpected_file_beside_output_cannot_escape_generation_accounting(tmp_path):
    storage = make(tmp_path)
    (storage.root / "forgotten.bin").write_bytes(b"x" * 2048)
    with pytest.raises(StorageError, match="storage-layout"):
        storage.finish(quiescent=True, success=True)
    assert not storage.root.exists()


def test_cleanup_backlog_remains_charged_to_retention_quota(tmp_path):
    first = make(tmp_path, "job-first")
    (first.output / "build").write_bytes(b"x" * 100)
    pending = first.finish(quiescent=True, success=True)
    pending["state"] = "cleanup_pending"
    second = make(tmp_path, "job-second")
    (second.output / "build").write_bytes(b"x" * 100)
    ready = second.finish(quiescent=True, success=True)
    preview = preview_cleanup(
        [pending, ready], max_keep=1, max_bytes=100, released=lambda _: True
    )
    assert preview["remaining_bytes"] == 200
    assert preview["quota_satisfied"] is False and preview["items"] == []


def test_artifact_lock_is_not_reentrant_across_threads(tmp_path):
    import contextvars
    import threading
    from artifact_pins import artifact_lock

    workspace = tmp_path / "project"
    workspace.mkdir()
    entered = threading.Event()
    attempted = threading.Event()

    def competing():
        attempted.set()
        with artifact_lock(workspace):
            entered.set()

    with artifact_lock(workspace):
        inherited = contextvars.copy_context()
        thread = threading.Thread(target=lambda: inherited.run(competing))
        thread.start()
        assert attempted.wait(1)
        assert not entered.wait(0.1)
    thread.join(2)
    assert entered.is_set() and not thread.is_alive()


@pytest.mark.parametrize("replace_kind", ["directory", "file"])
def test_child_replacement_after_snapshot_is_preserved(
    tmp_path, monkeypatch, replace_kind
):
    import project_storage as module

    storage = make(tmp_path)
    (storage.output / "build").write_text("owned")
    record = storage.finish(quiescent=True, success=True)
    preview = preview_cleanup(
        [record], max_keep=0, max_bytes=0, released=lambda _: True, protect_latest=False
    )
    actual = module.measure_tree
    replacements = []

    def replace_after_census(path, **kwargs):
        snapshot = actual(path, **kwargs)
        path = Path(path)
        if path.name.startswith(".reclaim-") and not replacements:
            if replace_kind == "directory":
                target = path / "output"
                target.rename(path / "old-owned-output")
                target.mkdir()
                marker = target / "foreign"
            else:
                target = path / "output/build"
                target.rename(path / "output/old-owned-build")
                marker = target
            marker.write_text("preserve foreign data")
            replacements.append(marker)
        return snapshot

    monkeypatch.setattr(module, "measure_tree", replace_after_census)
    with pytest.raises(StorageError):
        apply_cleanup(preview, released=lambda _: True)
    assert replacements[0].read_text() == "preserve foreign data"


def test_file_replacement_at_staging_is_preserved_in_private_transaction(
    tmp_path, monkeypatch
):
    import os

    storage = make(tmp_path)
    (storage.output / "build").write_text("owned")
    record = storage.finish(quiescent=True, success=True)
    preview = preview_cleanup(
        [record], max_keep=0, max_bytes=0, released=lambda _: True, protect_latest=False
    )
    actual = os.rename
    replaced = []

    def replace_at_move(source, target, **kwargs):
        if source == "build" and not replaced:
            source_fd = kwargs["src_dir_fd"]
            actual(
                "build", "old-owned-build", src_dir_fd=source_fd, dst_dir_fd=source_fd
            )
            descriptor = os.open(
                "build", os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600, dir_fd=source_fd
            )
            os.write(descriptor, b"preserve replacement at staging")
            os.close(descriptor)
            replaced.append(True)
        return actual(source, target, **kwargs)

    monkeypatch.setattr(os, "rename", replace_at_move)
    with pytest.raises(StorageError, match="storage-drift"):
        apply_cleanup(preview, released=lambda _: True)
    transactions = list(storage.root.parent.glob(".delete-*"))
    assert len(transactions) == 1 and (transactions[0] / "manifest.json").is_file()
    assert any(
        p.is_file()
        and p.name != "manifest.json"
        and p.read_bytes() == b"preserve replacement at staging"
        for p in transactions[0].iterdir()
    )


def test_interrupted_staging_keeps_durable_mapping_and_all_unremoved_data(
    tmp_path, monkeypatch
):
    import os
    import json

    storage = make(tmp_path)
    (storage.output / "build").write_text("owned")
    record = storage.finish(quiescent=True, success=True)
    preview = preview_cleanup(
        [record], max_keep=0, max_bytes=0, released=lambda _: True, protect_latest=False
    )
    actual = os.rename
    interrupted = []

    def interrupted_after_move(source, target, **kwargs):
        result = actual(source, target, **kwargs)
        if source == "build":
            interrupted.append(True)
            raise OSError("fixture lost process after rename")
        return result

    monkeypatch.setattr(os, "rename", interrupted_after_move)
    with pytest.raises(StorageError):
        apply_cleanup(preview, released=lambda _: True)
    transactions = list(storage.root.parent.glob(".delete-*"))
    manifest = json.loads((transactions[0] / "manifest.json").read_text())
    assert interrupted and any(
        p.read_text() == "owned"
        for p in transactions[0].iterdir()
        if p.name != "manifest.json" and p.is_file()
    )
    assert "output/build" in manifest["entries"]
    assert manifest["staging"]["output/build"].startswith("entry-")
