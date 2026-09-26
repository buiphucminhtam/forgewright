"""Admission failure and uncertain descendant cleanup never release false capacity."""

from __future__ import annotations

import subprocess
import sys

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline

bm = baseline.bm
fixture = baseline.fixture
module = baseline.module


def test_failed_admission_closes_connection_without_mutating_project(
    tmp_path, monkeypatch
):
    bm = module()
    calls = []

    class Admission:
        def enqueue(self, **kwargs):
            return {"state": "queued"}

        def close(self):
            calls.append("closed")

    def deny(*args, **kwargs):
        raise bm.BootstrapError("host_capacity_timeout", "no capacity")

    monkeypatch.setattr(bm, "_open_host_admission", lambda: Admission())
    monkeypatch.setattr(bm, "_wait_admission_active", deny)
    with pytest.raises(bm.BootstrapError, match="no capacity"):
        with bm.HostCapacityLease(tmp_path):
            pytest.fail("must not enter blocked lease")
    assert calls == ["closed"]
    assert not list(tmp_path.iterdir())


def test_uncertain_heavy_adapter_quarantines_before_releasing_parent(
    tmp_path, monkeypatch
):
    bm = module()
    releases = []

    class Admission:
        def enqueue(self, **kwargs):
            return {"state": "active"}

        def release(self, job, token, owner, *, quiescent):
            releases.append((job, quiescent))
            return {"state": "released" if quiescent else "quarantined"}

        def close(self):
            pass

    monkeypatch.setattr(bm, "_open_host_admission", lambda: Admission())
    with pytest.raises(bm.BootstrapError, match="unconfirmed"):
        with bm.HostCapacityLease(tmp_path) as lease:
            with lease.heavy():
                raise bm.BootstrapError("adapter_cleanup_unconfirmed", "unconfirmed")
    assert len(releases) == 2
    assert releases[0][0].startswith("bootstrap-heavy-")
    assert releases[0][1] is False
    assert releases[1][0].startswith("bootstrap-worker-")
    assert releases[1][1] is False


def test_real_scheduler_refuses_critical_memory_without_entering_bootstrap(tmp_path):
    bm = module()
    from host_admission import HostAdmission
    from host_resources import MemorySnapshot
    import os

    root = tmp_path / "project"
    root.mkdir()
    admission = HostAdmission(
        tmp_path / "admission",
        sensor=lambda: MemorySnapshot(
            8 * 1024**3, 64 * 1024**2, "critical", "pressure-fixture"
        ),
    )
    try:
        token = "t" * 64
        row = admission.enqueue(
            job_id="blocked",
            token=token,
            project_root=str(root),
            run_id="pressure",
            owner_pid=os.getpid(),
            kind="worker",
            memory_mib=128,
        )
        assert row["state"] == "queued"
        with pytest.raises(bm.BootstrapError, match="capacity"):
            bm._wait_admission_active(
                admission,
                row,
                job_id="blocked",
                token=token,
                owner_pid=os.getpid(),
                timeout=0,
            )
        assert admission.status()["active_workers"] == 0
        assert not list(root.iterdir())
    finally:
        admission.close()


def _fake_queued_admission(clock, *, active_at=None):
    class Admission:
        def __init__(self):
            self.releases = []

        def poll(self, job_id, token, owner_pid):
            if active_at is not None and clock[0] >= active_at:
                return {"state": "active"}
            return {"state": "queued"}

        def release(self, job_id, token, owner_pid, *, quiescent):
            self.releases.append((job_id, token, owner_pid, quiescent))
            return {"state": "released"}

    return Admission()


def _install_fake_clock(bm, monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(bm.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(
        bm.time,
        "sleep",
        lambda _seconds: clock.__setitem__(0, clock[0] + 1.0),
    )
    return clock


def test_bootstrap_admission_wait_allows_serial_grant_after_five_seconds(
    bm, monkeypatch
):
    clock = _install_fake_clock(bm, monkeypatch)
    admission = _fake_queued_admission(clock, active_at=6.0)

    row = bm._wait_admission_active(
        admission,
        {"state": "queued"},
        job_id="worker",
        token="token",
        owner_pid=123,
        timeout=60.0,
    )

    assert row == {"state": "active"}
    assert clock[0] == 6.0
    assert admission.releases == []


def test_bootstrap_admission_wait_times_out_and_releases_at_sixty_seconds(
    bm, monkeypatch
):
    clock = _install_fake_clock(bm, monkeypatch)
    admission = _fake_queued_admission(clock)

    with pytest.raises(bm.BootstrapError, match="within 60.0s"):
        bm._wait_admission_active(
            admission,
            {"state": "queued"},
            job_id="worker",
            token="token",
            owner_pid=123,
            timeout=60.0,
        )

    assert clock[0] == 60.0
    assert admission.releases == [("worker", "token", 123, True)]


def test_bootstrap_admission_wait_is_clamped_by_overall_operation_budget(
    bm, monkeypatch
):
    clock = _install_fake_clock(bm, monkeypatch)
    admission = _fake_queued_admission(clock)

    with bm._operation_budget(seconds=9.0):
        with pytest.raises(bm.BootstrapError, match="within 60.0s"):
            bm._wait_admission_active(
                admission,
                {"state": "queued"},
                job_id="worker",
                token="token",
                owner_pid=123,
                timeout=60.0,
            )

    assert clock[0] == 9.0
    assert admission.releases == [("worker", "token", 123, True)]


def test_ensure_uses_serial_admission_wait_for_worker_and_heavy(
    bm, fixture, monkeypatch
):
    observed = []
    original = bm._wait_admission_active

    def inspect_wait(*args, timeout, **kwargs):
        observed.append(timeout)
        return original(*args, timeout=timeout, **kwargs)

    monkeypatch.setattr(bm, "_wait_admission_active", inspect_wait)
    result = bm.ensure(str(fixture["project"]), "automation")

    assert result["status"] == "ready"
    assert observed == [60.0, 60.0]


def test_worker_release_failure_cannot_publish_ready_state(bm, fixture, monkeypatch):
    factory = bm.HostAdmission

    class FailWorkerRelease:
        def __init__(self, directory):
            self.inner = factory(directory)

        def __getattr__(self, name):
            return getattr(self.inner, name)

        def release(self, job_id, token, owner_pid, *, quiescent=True):
            if job_id.startswith("bootstrap-worker-"):
                raise bm.AdmissionError("injected-worker-release-failure")
            return self.inner.release(job_id, token, owner_pid, quiescent=quiescent)

    monkeypatch.setattr(bm, "HostAdmission", FailWorkerRelease)

    with pytest.raises(bm.BootstrapError, match="capacity|quiescence"):
        bm.ensure(str(fixture["project"]), "automation")

    state = bm.read_state(fixture["project"])
    journal = bm._read_journal(fixture["project"])
    assert state is not None and state["status"] != "ready"
    assert journal is not None and journal["status"] != "completed"


def test_ready_state_is_published_after_durable_transaction(bm, fixture, monkeypatch):
    project = fixture["project"]
    original = bm.atomic_json
    observed = {}

    def inspect_publication(path, value):
        if (
            path == bm._journal_path(project)
            and value.get("status") == "completed"
            and value.get("ownership") is not None
        ):
            current = bm.read_state(project)
            observed["state_status"] = current["status"] if current else None
            observed["worker_state"] = next(
                item["state"]
                for item in value["admission_leases"]
                if item["kind"] == "worker"
            )
        return original(path, value)

    monkeypatch.setattr(bm, "atomic_json", inspect_publication)
    result = bm.ensure(str(project), "automation")

    assert result["status"] == "ready"
    assert observed == {"state_status": "bootstrapping", "worker_state": "released"}
    assert bm._read_journal(project)["status"] == "completed"


def test_worker_recovery_authority_is_durable_before_admission(
    bm, fixture, monkeypatch
):
    project = fixture["project"]
    observed = {}

    class CrashBeforeAdmission:
        def enqueue(self, **kwargs):
            journal = bm._read_journal(project)
            observed["journal"] = journal
            observed["enqueue"] = kwargs
            raise SystemExit("simulated crash before scheduler write")

        def close(self):
            pass

    monkeypatch.setattr(bm, "_open_host_admission", lambda: CrashBeforeAdmission())
    with pytest.raises(SystemExit, match="scheduler write"):
        bm.ensure(str(project), "automation")

    journal = observed["journal"]
    lease = journal["admission_leases"][0]
    assert journal["status"] == "running"
    assert journal["run_id"] == observed["enqueue"]["run_id"]
    assert lease == {
        "id": observed["enqueue"]["job_id"],
        "token": observed["enqueue"]["token"],
        "kind": "worker",
        "owner_pid": observed["enqueue"]["owner_pid"],
        "owner_identity": journal["owner"]["identity"],
        "parent_id": None,
        "state": "intent",
    }


def test_crashed_worker_is_exactly_reconciled_from_durable_intent(bm, fixture):
    project = fixture["project"]
    script = r"""
import importlib.util
import os
import sys
import uuid
from pathlib import Path

root = Path(sys.argv[1])
project = Path(sys.argv[2])
sys.path.insert(0, str(root / "scripts/runtime"))
spec = importlib.util.spec_from_file_location(
    "bootstrap_manager_crash_fixture", root / "scripts/runtime/bootstrap_manager.py"
)
bm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bm)
from host_admission import HostAdmission
from host_resources import MemorySnapshot

bm._open_host_admission = lambda: HostAdmission(
    bm.admission_home(),
    sensor=lambda: MemorySnapshot(
        8 * 1024**3, 6 * 1024**3, "normal", "crash-fixture"
    ),
    inspector=bm.inspect_process,
)
capacity = bm.HostCapacityLease(project, wait_seconds=2)
journal = {
    "schema": "forgewright-bootstrap-transaction/v1",
    "project_root_digest": bm.root_digest(project),
    "status": "running",
    "stage": None,
    "owned_paths": [],
    "external_config_receipts": [],
    "prior_state": None,
    "ownership": None,
    "transaction_id": uuid.uuid4().hex,
    "mode": "automation",
    "source_commit": "a" * 40,
    "owner": {"pid": os.getpid(), "identity": capacity.owner_identity},
    "run_id": capacity.run_id,
    "admission_leases": [capacity.worker_record()],
    "processes": [],
    "spawn_pending": False,
    "settled": False,
    "started_at": bm.now(),
}
bm.atomic_json(bm._journal_path(project), journal)
capacity.bind_transaction(project, journal)
with capacity:
    os._exit(47)
"""
    child = subprocess.run(
        [sys.executable, "-c", script, str(bm._RUNTIME_DIR.parents[1]), str(project)],
        check=False,
    )
    assert child.returncode == 47

    journal = bm._read_journal(project)
    assert journal is not None
    assert journal["admission_leases"][0]["state"] == "active"
    assert bm._recovery_quiescence(project, journal) is True
    admission = bm.HostAdmission(bm.admission_home())
    try:
        row = admission.connection.execute(
            "SELECT state, reason FROM jobs WHERE run_id=?", (journal["run_id"],)
        ).fetchone()
        assert tuple(row) == ("released", "reconciled")
    finally:
        admission.close()
