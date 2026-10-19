"""Owned build artifact lifecycle; discovered legacy directories remain unowned.

No generic build-result cache or fresh acceptance reuse. Destructive operations
require terminal lease proof and an exact, bounded preview of job-created roots.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time
import uuid
import math

SCHEMA = "forgewright-job-storage/v1"
SAFE_JOB = re.compile(r"^job-[A-Za-z0-9_-]{1,100}$")


class StorageError(RuntimeError):
    def __init__(self, code, *, pending_path=None, reclaimed=False):
        super().__init__(code)
        self.pending_path = pending_path
        self.reclaimed = reclaimed


def disk_limits(workspace, host_budget=None):
    """Reuse RLG budget.yaml. Project values can only tighten host bounds."""
    from runtime_registry import rlg_home

    host_budget = Path(host_budget or rlg_home() / "budget.yaml")
    defaults = {
        "warn_project_gb": 5,
        "block_project_gb": 15,
        "min_free_gb": 2,
        "artifact_ttl_days": 7,
    }

    def read(path):
        if not path.exists():
            return {}
        try:
            if path.is_symlink() or path.stat().st_size > 32768:
                raise ValueError("unsafe-policy")
            result, section, seen = {}, None, set()
            for raw in path.read_text().splitlines():
                line = raw.split("#", 1)[0].rstrip()
                if not line.strip():
                    continue
                if "\t" in line:
                    raise ValueError("unsupported-policy-indentation")
                if not line.startswith(" "):
                    match = re.fullmatch(r"([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)", line)
                    if not match:
                        raise ValueError("invalid-policy-mapping")
                    section = match[1]
                    if section == "disk":
                        if section in seen or match[2]:
                            raise ValueError("invalid-disk-mapping")
                        seen.add(section)
                    continue
                if section != "disk":
                    continue
                match = re.fullmatch(
                    r"  ([A-Za-z_][A-Za-z0-9_-]*):\s*(\d+(?:\.\d+)?)", line
                )
                if not match or match[1] in result:
                    raise ValueError("unsupported-disk-scalar")
                key, number = match.groups()
                if key in defaults:
                    result[key] = float(number)
            if any(
                type(v) not in (int, float) or not math.isfinite(v) or v <= 0
                for v in result.values()
            ):
                raise ValueError("invalid-limit")
            return result
        except (OSError, ValueError) as error:
            raise StorageError("invalid-disk-policy") from error
        except Exception as error:
            # Never convert a failed policy read into more capacity.
            raise StorageError("invalid-disk-policy") from error

    host = {**defaults, **read(host_budget)}
    local = read(Path(workspace) / ".forgewright/budget.yaml")
    if any(
        (v < host[k] if k == "min_free_gb" else v > host[k]) for k, v in local.items()
    ):
        raise StorageError("project-policy-raises-host-limit")
    policy = {**host, **local}
    return {
        "project_bytes": int(policy["block_project_gb"] * 1024**3),
        "warn_bytes": int(
            min(policy["warn_project_gb"], policy["block_project_gb"]) * 1024**3
        ),
        "min_free_bytes": int(policy["min_free_gb"] * 1024**3),
        "ttl_seconds": int(policy["artifact_ttl_days"] * 86400),
    }


def _digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _open_directory(path):
    """Pin every ancestor; resolving a symlink then deleting is insufficient."""
    path = Path(path).absolute()
    descriptor = os.open(path.anchor, os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            child = os.open(
                part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor
            )
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def measure_tree(path, *, max_entries=100000, timeout=5, visitor=None, active=False):
    """No-follow bounded metadata census; partial data never certifies a quota.

    Logical and allocated bytes are distinct. APFS sharing, sparse files and
    hardlinks mean these numbers cannot promise physical free-space recovery.
    """
    deadline, count, pending, logical, allocated = (
        time.monotonic() + timeout,
        0,
        0,
        0,
        0,
    )
    fingerprint = hashlib.sha256()
    try:
        root = _open_directory(path)
        initial = os.fstat(root)
        device = initial.st_dev

        def visit(fd, prefix):
            nonlocal logical, allocated, count, pending
            if prefix.count("/") > 64:
                raise StorageError("storage-census-incomplete")
            with os.scandir(fd) as entries:
                names = []
                for entry in entries:
                    if (
                        time.monotonic() >= deadline
                        or count + pending + len(names) >= max_entries
                    ):
                        raise StorageError("storage-census-incomplete")
                    names.append(entry.name)
                names.sort()
                pending += len(names)
            for name in names:
                pending -= 1
                if time.monotonic() >= deadline or count >= max_entries:
                    raise StorageError("storage-census-incomplete")
                try:
                    info = os.stat(name, dir_fd=fd, follow_symlinks=False)
                except FileNotFoundError:
                    if active:
                        continue
                    raise
                if info.st_dev != device:
                    raise StorageError("storage-cross-volume")
                relative = prefix + name
                row = [
                    relative,
                    info.st_mode,
                    info.st_dev,
                    info.st_ino,
                    info.st_nlink,
                    info.st_size,
                    info.st_mtime_ns,
                    info.st_ctime_ns,
                ]
                fingerprint.update(
                    json.dumps(row, separators=(",", ":")).encode() + b"\n"
                )
                count += 1
                if visitor is not None:
                    visitor(relative, info)
                if stat.S_ISDIR(info.st_mode):
                    child = os.open(
                        name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd
                    )
                    try:
                        opened = os.fstat(child)
                        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                            raise StorageError("storage-drift")
                        visit(child, relative + "/")
                    finally:
                        os.close(child)
                elif stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode):
                    logical += info.st_size
                    allocated += getattr(info, "st_blocks", 0) * 512
                else:
                    raise StorageError("storage-special-file")

        try:
            visit(root, "")
            final = os.fstat(root)
            if not active and (initial.st_mtime_ns, initial.st_ctime_ns) != (
                final.st_mtime_ns,
                final.st_ctime_ns,
            ):
                raise StorageError("storage-drift")
            return {
                "bytes": logical,
                "allocated_bytes": allocated,
                "entries": count,
                "device": initial.st_dev,
                "inode": initial.st_ino,
                "fingerprint": fingerprint.hexdigest(),
                "complete": not active,
            }
        finally:
            os.close(root)
    except OSError as error:
        raise StorageError("storage-unavailable") from error


def _bound_root(record):
    workspace = Path(record["workspace"]).resolve(strict=True)
    job = record["job_id"]
    if not isinstance(job, str) or not SAFE_JOB.fullmatch(job):
        raise StorageError("invalid-storage-owner")
    expected = workspace / ".forgewright/runtime/build-jobs" / job
    path = Path(record["path"])
    if path != expected:
        raise StorageError("storage-scope-mismatch")
    return path


def _manifest_entry(info):
    return [
        info.st_dev,
        info.st_ino,
        info.st_mode,
        info.st_uid,
        info.st_nlink,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
    ]


def _delete_tree(parent, name, expected, *, manifest, transaction_name):
    """Delete only sealed entries moved into one private transaction namespace.

    Producers must be quiescent and sealed inodes immutable. This protects
    accidental pathname replacements, not a hostile writer with the same UID
    or an already-open writable descriptor to a selected inode.
    """
    deadline = time.monotonic() + 5
    mapping = {key: "entry-" + str(index) for index, key in enumerate(sorted(manifest))}
    children = {}
    for key in manifest:
        prefix, _, leaf = key.rpartition("/")
        children.setdefault(prefix + "/" if prefix else "", {})[leaf] = key
    raw = (
        json.dumps(
            {
                "schema": "forgewright-deletion-manifest/v1",
                "entries": manifest,
                "staging": mapping,
            },
            sort_keys=True,
        )
        + "\n"
    ).encode()
    if len(manifest) > 100000 or len(raw) > 32 * 1024**2:
        raise StorageError("storage-cleanup-incomplete")
    os.mkdir(transaction_name, mode=0o700, dir_fd=parent)
    transaction = os.open(
        transaction_name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent
    )
    try:
        info = os.fstat(transaction)
        if info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise StorageError("storage-ownership-unconfirmed")
        fd = os.open(
            "manifest.json",
            os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
            0o600,
            dir_fd=transaction,
        )
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.fsync(transaction)
        os.fsync(parent)

        def erase(source_parent, source_name, identity, prefix):
            if time.monotonic() >= deadline:
                raise StorageError("storage-cleanup-incomplete")
            descriptor = os.open(
                source_name,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                dir_fd=source_parent,
            )
            try:
                opened = os.fstat(descriptor)
                if (opened.st_dev, opened.st_ino) != identity:
                    raise StorageError("storage-drift")
                selected = children.get(prefix, {})
                with os.scandir(descriptor) as entries:
                    observed = set()
                    for entry in entries:
                        if len(observed) >= 100000 or time.monotonic() >= deadline:
                            raise StorageError("storage-cleanup-incomplete")
                        observed.add(entry.name)
                if observed != set(selected):
                    raise StorageError("storage-drift")
                for original_name, relative in selected.items():
                    expected_entry = manifest[relative]
                    observed = os.stat(
                        original_name, dir_fd=descriptor, follow_symlinks=False
                    )
                    if _manifest_entry(observed) != expected_entry:
                        raise StorageError("storage-drift")
                    if (
                        observed.st_uid != os.getuid()
                        or observed.st_dev != opened.st_dev
                    ):
                        raise StorageError("storage-ownership-unconfirmed")
                    if stat.S_ISREG(observed.st_mode) and observed.st_nlink > 1:
                        raise StorageError("storage-hardlink-unconfirmed")
                    staged_name = mapping[relative]
                    os.rename(
                        original_name,
                        staged_name,
                        src_dir_fd=descriptor,
                        dst_dir_fd=transaction,
                    )
                    moved = os.stat(
                        staged_name, dir_fd=transaction, follow_symlinks=False
                    )
                    # rename may change ctime. All other selected identity and
                    # content metadata must remain bound to the sealed entry.
                    if _manifest_entry(moved)[:-1] != expected_entry[:-1]:
                        raise StorageError("storage-drift")
                    if stat.S_ISDIR(moved.st_mode):
                        erase(
                            transaction,
                            staged_name,
                            tuple(expected_entry[:2]),
                            relative + "/",
                        )
                    elif stat.S_ISREG(moved.st_mode) or stat.S_ISLNK(moved.st_mode):
                        os.unlink(staged_name, dir_fd=transaction)
                    else:
                        raise StorageError("storage-special-file")
                current = os.stat(
                    source_name, dir_fd=source_parent, follow_symlinks=False
                )
                if (current.st_dev, current.st_ino) != identity:
                    raise StorageError("storage-drift")
                os.rmdir(source_name, dir_fd=source_parent)
            finally:
                os.close(descriptor)

        erase(parent, name, expected, "")
        os.unlink("manifest.json", dir_fd=transaction)
        os.fsync(transaction)
        os.rmdir(transaction_name, dir_fd=parent)
    finally:
        os.close(transaction)


def cleanup_absence_confirmed(record):
    """Confirm managed namespace absence, never claim physical bytes reclaimed."""
    path = _bound_root(record)
    intent = record.get("cleanup_intent", {})
    staged = Path(intent.get("staged_path", ""))
    if (
        intent.get("schema") != "forgewright-artifact-cleanup-intent/v1"
        or intent.get("nonce") != record.get("nonce")
        or intent.get("device") != record.get("device")
        or intent.get("inode") != record.get("inode")
        or intent.get("original_path") != str(path)
        or staged.parent != path.parent
        or not re.fullmatch(
            r"\.reclaim-" + re.escape(record["job_id"]) + r"-[0-9a-f]{32}", staged.name
        )
    ):
        return False
    parent = _open_directory(path.parent)
    try:
        transaction = Path(intent.get("transaction_path", ""))
        if transaction.parent != path.parent or not re.fullmatch(
            r"\.delete-[0-9a-f]{32}", transaction.name
        ):
            return False
        for name in (path.name, staged.name, transaction.name):
            try:
                os.stat(name, dir_fd=parent, follow_symlinks=False)
                return False
            except FileNotFoundError:
                pass
        return True
    finally:
        os.close(parent)


def _remove(record, expected, *, on_intent=None):
    """Stage by descriptor, then revalidate before irreversible removal."""
    path = _bound_root(record)
    if os.name != "posix":
        raise StorageError("storage-cleanup-platform-unavailable")
    parent = _open_directory(path.parent)
    tombstone = ".reclaim-" + path.name + "-" + uuid.uuid4().hex
    staged = None
    try:
        manifest = {}
        before = measure_tree(
            path,
            visitor=lambda relative, info: manifest.__setitem__(
                relative, _manifest_entry(info)
            ),
        )
        if before != expected or (before["device"], before["inode"]) != (
            record["device"],
            record["inode"],
        ):
            raise StorageError("storage-drift")
        transaction_name = ".delete-" + uuid.uuid4().hex
        record["cleanup_intent"] = {
            "schema": "forgewright-artifact-cleanup-intent/v1",
            "original_path": str(path),
            "staged_path": str(path.parent / tombstone),
            "device": record["device"],
            "inode": record["inode"],
            "nonce": record["nonce"],
            "expected_fingerprint": expected["fingerprint"],
            "expected_bytes": expected["bytes"],
            "transaction_path": str(path.parent / transaction_name),
            "manifest_entries_sha256": hashlib.sha256(
                json.dumps(manifest, sort_keys=True).encode()
            ).hexdigest(),
        }
        if on_intent is not None:
            on_intent(record)
        os.rename(path.name, tombstone, src_dir_fd=parent, dst_dir_fd=parent)
        staged = path.parent / tombstone
        after = measure_tree(staged)
        if after != expected:
            # Preserve the changed tree in staging. Never overwrite a newly
            # created original path in an attempted rollback.
            raise StorageError("storage-drift-quarantined", pending_path=str(staged))
        _delete_tree(
            parent,
            tombstone,
            (record["device"], record["inode"]),
            manifest=manifest,
            transaction_name=transaction_name,
        )
        os.fsync(parent)
    except OSError as error:
        raise StorageError(
            "storage-cleanup-pending",
            pending_path=str(staged) if staged is not None else str(path),
        ) from error
    except StorageError as error:
        if error.pending_path is None and staged is not None:
            error.pending_path = str(staged)
        raise
    finally:
        os.close(parent)


class JobStorage:
    def __init__(
        self,
        workspace,
        job_id,
        *,
        scratch_limit,
        output_limit,
        ttl_seconds=86400,
        on_cleanup_intent=None,
    ):
        workspace = Path(workspace).resolve(strict=True)
        if not SAFE_JOB.fullmatch(job_id) or any(
            type(v) is not int or v < 0
            for v in (scratch_limit, output_limit, ttl_seconds)
        ):
            raise StorageError("invalid-storage-policy")
        self.workspace, self.job_id = workspace, job_id
        self.on_cleanup_intent = on_cleanup_intent
        self.root = workspace / ".forgewright/runtime/build-jobs" / job_id
        self.scratch, self.output = self.root / "scratch", self.root / "output"
        self.scratch_limit, self.output_limit, self.ttl_seconds = (
            scratch_limit,
            output_limit,
            ttl_seconds,
        )
        # Parent components are pinned before creating anything, and an
        # existing job root is never adopted by name.
        current = workspace
        for part in (".forgewright", "runtime", "build-jobs"):
            parent = _open_directory(current)
            try:
                try:
                    os.mkdir(part, mode=0o700, dir_fd=parent)
                except FileExistsError:
                    pass
                child = os.open(
                    part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent
                )
                os.close(child)
            finally:
                os.close(parent)
            current = current / part
        parent = _open_directory(self.root.parent)
        try:
            try:
                os.mkdir(job_id, mode=0o700, dir_fd=parent)
            except FileExistsError as error:
                raise StorageError("storage-already-exists") from error
        finally:
            os.close(parent)
        descriptor = _open_directory(self.root)
        try:
            os.mkdir("scratch", mode=0o700, dir_fd=descriptor)
            os.mkdir("output", mode=0o700, dir_fd=descriptor)
            info = os.fstat(descriptor)
        finally:
            os.close(descriptor)
        self.base = {
            "schema": SCHEMA,
            "workspace": str(workspace),
            "job_id": job_id,
            "path": str(self.root),
            "device": info.st_dev,
            "inode": info.st_ino,
            "nonce": uuid.uuid4().hex,
            "created_at": time.time(),
            "pinned": False,
            "expires_at": time.time() + ttl_seconds,
            "quiescent": False,
            "state": "active",
        }

    def check(self, *, active=False):
        # Live samples can detect excess, but cannot certify a complete tree.
        # Only the final quiescent census supplies a retained manifest.
        scratch, output = (
            measure_tree(self.scratch, active=active),
            measure_tree(self.output, active=active),
        )
        if scratch["bytes"] > self.scratch_limit:
            raise StorageError("scratch-budget-exceeded")
        if output["bytes"] > self.output_limit:
            raise StorageError("output-budget-exceeded")
        return scratch, output

    def finish(self, *, quiescent, success):
        from artifact_pins import artifact_lock

        with artifact_lock(self.workspace):
            return self._finish(quiescent=quiescent, success=success)

    def _finish(self, *, quiescent, success):
        record = dict(self.base, quiescent=quiescent)
        if not quiescent:
            return dict(record, state="quarantined")
        snapshot = measure_tree(self.root)
        if (snapshot["device"], snapshot["inode"]) != (
            self.base["device"],
            self.base["inode"],
        ):
            raise StorageError("storage-drift")
        descriptor = _open_directory(self.root)
        try:
            with os.scandir(descriptor) as entries:
                valid_layout = {entry.name for entry in entries} == {
                    "scratch",
                    "output",
                }
        finally:
            os.close(descriptor)
        if not valid_layout:
            _remove(record, snapshot, on_intent=self.on_cleanup_intent)
            raise StorageError("storage-layout-violation", reclaimed=True)
        if not success:
            _remove(record, snapshot, on_intent=self.on_cleanup_intent)
            return dict(record, state="reclaimed", output_bytes=0)
        scratch_manifest = {}
        scratch_snapshot = measure_tree(
            self.scratch,
            visitor=lambda relative, info: scratch_manifest.__setitem__(
                relative, _manifest_entry(info)
            ),
        )
        if scratch_snapshot["bytes"] > self.scratch_limit:
            _remove(record, snapshot, on_intent=self.on_cleanup_intent)
            raise StorageError("scratch-budget-exceeded", reclaimed=True)
        output = measure_tree(self.output)
        if output["bytes"] > self.output_limit:
            _remove(record, snapshot, on_intent=self.on_cleanup_intent)
            raise StorageError("output-budget-exceeded", reclaimed=True)
        # This private root was created by this job. Its scratch content is
        # never selected by a broad cache/build directory-name pattern.
        scratch = self.scratch
        if scratch.exists():
            fd = _open_directory(self.root)
            try:
                observed = os.fstat(fd)
                if (observed.st_dev, observed.st_ino) != (
                    self.base["device"],
                    self.base["inode"],
                ):
                    raise StorageError("storage-drift")
                if os.name != "posix":
                    raise StorageError("storage-cleanup-platform-unavailable")
                transaction_name = ".delete-" + uuid.uuid4().hex
                record["scratch_cleanup_intent"] = {
                    "transaction_path": str(self.root / transaction_name),
                    "target_path": str(self.scratch),
                    "expected": scratch_snapshot,
                }
                if self.on_cleanup_intent:
                    self.on_cleanup_intent(record)
                _delete_tree(
                    fd,
                    "scratch",
                    (scratch_snapshot["device"], scratch_snapshot["inode"]),
                    manifest=scratch_manifest,
                    transaction_name=transaction_name,
                )
            except OSError as error:
                raise StorageError("storage-cleanup-pending") from error
            finally:
                os.close(fd)
        final = measure_tree(self.root)
        return dict(
            record, state="retained", output_bytes=final["bytes"], snapshot=final
        )


def _preview_cleanup(
    records, *, max_keep, max_bytes, now=None, released, protect_latest=True
):
    now = time.time() if now is None else now
    if (
        type(max_keep) is not int
        or max_keep < 0
        or type(max_bytes) is not int
        or max_bytes < 0
    ):
        raise StorageError("invalid-retention-policy")
    from artifact_pins import pins

    all_charged = [
        r
        for r in records
        if r.get("state") in {"retained", "cleanup_pending", "quarantined"}
    ]

    def charge(record):
        size = record.get(
            "output_bytes", record.get("cleanup_intent", {}).get("expected_bytes")
        )
        if size is None:
            size = measure_tree(Path(record.get("pending_path") or record["path"]))[
                "bytes"
            ]
        return size

    eligible = sorted(
        [
            r
            for r in records
            if r.get("state") == "retained"
            and r.get("quiescent") is True
            and not r.get("pinned")
            and not pins(r)
        ],
        key=lambda r: r["created_at"],
    )
    remaining, count = sum(charge(r) for r in all_charged), len(all_charged)
    latest = {}
    if protect_latest:
        for record in eligible:
            latest[record.get("profile", "")] = record["job_id"]
    items = []
    for record in eligible:
        if record["job_id"] in latest.values():
            continue
        if remaining <= max_bytes and count <= max_keep and record["expires_at"] > now:
            continue
        if not released(record["job_id"]):
            continue
        path = _bound_root(record)
        observed = measure_tree(path)
        if observed != record["snapshot"]:
            raise StorageError("storage-drift")
        items.append({"record": record, "expected": observed})
        remaining -= record["output_bytes"]
        count -= 1
    value = {
        "schema": "forgewright-storage-cleanup/v1",
        "items": items,
        "bytes": sum(i["expected"]["bytes"] for i in items),
        "generated_at": now,
        "remaining_bytes": remaining,
        "remaining_generations": count,
        "quota_satisfied": remaining <= max_bytes and count <= max_keep,
    }
    value["digest"] = _digest(value)
    return value


def _apply_cleanup(preview, *, released, on_intent=None):
    from artifact_pins import pins

    value = {k: v for k, v in preview.items() if k != "digest"}
    if (
        _digest(value) != preview["digest"]
        or preview.get("schema") != "forgewright-storage-cleanup/v1"
    ):
        raise StorageError("invalid-cleanup-preview")
    # Validate every selection before performing the first mutation.
    for item in preview["items"]:
        record = item["record"]
        if not released(record["job_id"]):
            raise StorageError("lease-not-released")
        if (
            record.get("pinned")
            or pins(record)
            or record.get("state") != "retained"
            or record.get("quiescent") is not True
        ):
            raise StorageError("artifact-protected")
        if measure_tree(_bound_root(record)) != item["expected"]:
            raise StorageError("storage-drift")
    removed = []
    for item in preview["items"]:
        if not released(item["record"]["job_id"]):
            raise StorageError("lease-not-released")
        if pins(item["record"]):
            raise StorageError("artifact-protected")
        _remove(item["record"], item["expected"], on_intent=on_intent)
        removed.append(item["record"]["job_id"])
    return {"state": "reclaimed", "jobs": removed, "planned_bytes": preview["bytes"]}


def _records_scope(records):
    scopes = {str(Path(record["workspace"]).resolve(strict=True)) for record in records}
    if len(scopes) > 1:
        raise StorageError("mixed-storage-scope")
    return next(iter(scopes), None)


def preview_cleanup(records, **kwargs):
    from artifact_pins import artifact_lock

    with artifact_lock(_records_scope(records)):
        return _preview_cleanup(records, **kwargs)


def apply_cleanup(preview, *, released, on_intent=None):
    from artifact_pins import artifact_lock

    with artifact_lock(_records_scope([item["record"] for item in preview["items"]])):
        return _apply_cleanup(preview, released=released, on_intent=on_intent)


def pin_artifact(record, consumer):
    from artifact_pins import pin_artifact as pin

    return pin(record, consumer)


def unpin_artifact(record, token):
    from artifact_pins import unpin_artifact as unpin

    return unpin(record, token)
