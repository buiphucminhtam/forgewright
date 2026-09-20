"""Behavioral contracts for cross-project resource admission; no model service."""

from __future__ import annotations

from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/runtime"))
from host_admission import AdmissionError, HostAdmission, MemorySnapshot  # noqa: E402

NORMAL = MemorySnapshot(8 * 1024**3, 6 * 1024**3, "normal", "test-fixture")


def fixture(tmp_path):
    identities = {i: f"owner-{i}-start-1" for i in range(100, 120)}
    sensor = {"sample": NORMAL}
    clock = {"now": 1000.0}
    admission = HostAdmission(
        tmp_path / "coordination",
        sensor=lambda: sensor["sample"],
        inspector=lambda pid: identities.get(pid),
        now=lambda: clock["now"],
    )
    return admission, identities, sensor, clock


def request(admission, project, pid, job, kind="worker", **extra):
    project.mkdir(exist_ok=True)
    return admission.enqueue(
        job_id=job,
        token=f"{job}-" + "x" * 40,
        project_root=str(project),
        run_id=f"run-{pid}",
        owner_pid=pid,
        kind=kind,
        memory_mib=128,
        **extra,
    )


def poll(admission, job, pid):
    return admission.poll(job, f"{job}-" + "x" * 40, pid)


def release(admission, job, pid, quiescent=True):
    return admission.release(job, f"{job}-" + "x" * 40, pid, quiescent=quiescent)


def test_shared_global_worker_and_heavy_caps(tmp_path):
    a, _, _, _ = fixture(tmp_path)
    assert request(a, tmp_path / "p0", 100, "w0")["state"] == "active"
    assert request(a, tmp_path / "p1", 101, "w1")["state"] == "active"
    assert request(a, tmp_path / "p2", 102, "w2")["state"] == "queued"
    assert (
        request(a, tmp_path / "p0", 100, "h0", "heavy", parent_lease_id="w0")["state"]
        == "active"
    )
    assert (
        request(a, tmp_path / "p1", 101, "h1", "heavy", parent_lease_id="w1")["state"]
        == "queued"
    )
    state = a.status()
    assert state["active_workers"] == 2
    assert state["active_heavy"] == 1
    with pytest.raises(AdmissionError, match="children-active"):
        release(a, "w0", 100)
    release(a, "h0", 100)
    assert poll(a, "h1", 101)["state"] == "active"
    release(a, "w0", 100)
    assert poll(a, "w2", 102)["state"] == "active"


def test_new_connection_shares_same_authority(tmp_path):
    a, identities, _, _ = fixture(tmp_path)
    request(a, tmp_path / "p0", 100, "w0")
    request(a, tmp_path / "p1", 101, "w1")
    b = HostAdmission(
        tmp_path / "coordination",
        sensor=lambda: NORMAL,
        inspector=lambda pid: identities.get(pid),
        now=lambda: 1000.0,
    )
    assert request(b, tmp_path / "p2", 102, "w2")["state"] == "queued"
    assert b.status()["active_workers"] == 2
    a.close()
    b.close()


def test_five_projects_progress_without_flood_monopoly(tmp_path):
    a, _, _, _ = fixture(tmp_path)
    request(a, tmp_path / "p0", 100, "a0")
    request(a, tmp_path / "p1", 101, "b0")
    for n in range(5):
        assert request(a, tmp_path / "p0", 100, f"aflood{n}")["state"] == "queued"
    for n in range(2, 5):
        request(a, tmp_path / f"p{n}", 100 + n, f"w{n}")
    release(a, "a0", 100)
    assert poll(a, "w2", 102)["state"] == "active"
    release(a, "b0", 101)
    assert poll(a, "w3", 103)["state"] == "active"
    release(a, "w2", 102)
    assert poll(a, "w4", 104)["state"] == "active"
    release(a, "w3", 103)
    assert poll(a, "aflood0", 100)["state"] == "active"


def test_pressure_blocks_and_recovers_with_hysteresis(tmp_path):
    a, _, sensor, clock = fixture(tmp_path)
    sensor["sample"] = MemorySnapshot(
        8 * 1024**3, 5 * 1024**3, "critical", "test-fixture"
    )
    assert request(a, tmp_path / "p0", 100, "w0")["state"] == "queued"
    sensor["sample"] = NORMAL
    clock["now"] += 1
    assert poll(a, "w0", 100)["state"] == "queued"
    clock["now"] += 16
    assert poll(a, "w0", 100)["state"] == "active"


def test_warning_degrades_to_one_worker_and_low_headroom_blocks(tmp_path):
    a, _, sensor, _ = fixture(tmp_path)
    sensor["sample"] = MemorySnapshot(
        8 * 1024**3, 4 * 1024**3, "warning", "test-fixture"
    )
    assert request(a, tmp_path / "p0", 100, "w0")["state"] == "active"
    assert request(a, tmp_path / "p1", 101, "w1")["state"] == "queued"
    release(a, "w0", 100)
    sensor["sample"] = MemorySnapshot(
        8 * 1024**3, 200 * 1024**2, "normal", "test-fixture"
    )
    assert poll(a, "w1", 101)["state"] == "queued"


def test_expired_live_owner_is_not_released(tmp_path):
    a, _, _, clock = fixture(tmp_path)
    request(a, tmp_path / "p0", 100, "w0")
    clock["now"] += 3600
    assert a.status()["active_workers"] == 1
    assert poll(a, "w0", 100)["state"] == "active"


def test_dead_owner_quarantines_instead_of_replaying_effects(tmp_path):
    a, identities, _, _ = fixture(tmp_path)
    request(a, tmp_path / "p0", 100, "w0")
    identities.pop(100)
    assert a.status()["quarantined"] == 1
    assert request(a, tmp_path / "p1", 101, "w1")["state"] == "active"
    assert request(a, tmp_path / "p2", 102, "w2")["state"] == "queued"
    with pytest.raises(AdmissionError, match="owner-mismatch"):
        release(a, "w0", 101)


def test_wrong_token_pid_and_duplicate_identity_are_rejected(tmp_path):
    a, identities, _, _ = fixture(tmp_path)
    request(a, tmp_path / "p0", 100, "w0")
    with pytest.raises(AdmissionError, match="owner-mismatch"):
        a.poll("w0", "wrong-" + "x" * 40, 100)
    with pytest.raises(AdmissionError, match="duplicate-job"):
        request(a, tmp_path / "p0", 100, "w0")
    identities[100] = "reused-pid-new-process"
    with pytest.raises(AdmissionError, match="owner-mismatch"):
        poll(a, "w0", 100)


def test_heavy_parent_must_match_exact_project_run_and_owner(tmp_path):
    a, _, _, _ = fixture(tmp_path)
    request(a, tmp_path / "p0", 100, "w0")
    with pytest.raises(AdmissionError, match="invalid-parent"):
        request(a, tmp_path / "p1", 101, "h0", "heavy", parent_lease_id="w0")
    with pytest.raises(AdmissionError, match="invalid-parent"):
        request(a, tmp_path / "p0", 100, "h0", "heavy")


def test_cancelled_queue_has_no_late_admission_and_release_is_idempotent(tmp_path):
    a, _, _, _ = fixture(tmp_path)
    request(a, tmp_path / "p0", 100, "w0")
    request(a, tmp_path / "p1", 101, "w1")
    request(a, tmp_path / "p2", 102, "w2")
    assert release(a, "w2", 102)["state"] == "released"
    release(a, "w0", 100)
    assert poll(a, "w2", 102)["state"] == "released"
    assert release(a, "w2", 102)["state"] == "released"


def test_uncertain_release_reserves_slot_and_children(tmp_path):
    a, _, _, _ = fixture(tmp_path)
    request(a, tmp_path / "p0", 100, "w0")
    request(a, tmp_path / "p0", 100, "h0", "heavy", parent_lease_id="w0")
    assert release(a, "w0", 100, False)["state"] == "quarantined"
    state = a.status()
    assert state["quarantined"] == 2
    with pytest.raises(AdmissionError, match="reconciliation-required"):
        release(a, "w0", 100, True)


def test_state_symlink_and_incompatible_schema_fail_closed(tmp_path):
    target = tmp_path / "target"
    target.mkdir(mode=0o700)
    link = tmp_path / "link"
    link.symlink_to(target, target_is_directory=True)
    with pytest.raises(AdmissionError, match="unsafe-state"):
        HostAdmission(link)
    a, _, _, _ = fixture(tmp_path)
    a.connection.execute("PRAGMA user_version=99")
    a.close()
    with pytest.raises(AdmissionError, match="schema-incompatible"):
        HostAdmission(tmp_path / "coordination")


def test_heavy_grants_rotate_without_worker_rank_starvation(tmp_path):
    a, _, _, _ = fixture(tmp_path)
    request(a, tmp_path / "p0", 100, "worker-a")
    request(a, tmp_path / "p1", 101, "worker-b")
    assert (
        request(
            a, tmp_path / "p0", 100, "heavy-a", "heavy", parent_lease_id="worker-a"
        )["state"]
        == "active"
    )
    assert (
        request(
            a, tmp_path / "p1", 101, "heavy-b", "heavy", parent_lease_id="worker-b"
        )["state"]
        == "queued"
    )
    release(a, "heavy-a", 100)
    assert (
        request(
            a, tmp_path / "p0", 100, "heavy-a-next", "heavy", parent_lease_id="worker-a"
        )["state"]
        == "queued"
    )
    assert poll(a, "heavy-b", 101)["state"] == "active"
    release(a, "heavy-b", 101)
    assert poll(a, "heavy-a-next", 100)["state"] == "active"


def test_bounded_queue_and_no_secret_state_output(tmp_path):
    a, _, _, _ = fixture(tmp_path)
    for index in range(32):
        request(a, tmp_path / "p0", 100, f"j{index}")
    with pytest.raises(AdmissionError, match="queue-full"):
        request(a, tmp_path / "p0", 100, "overflow")
    assert "x" * 40 not in str(a.status())
    assert a.status()["queued"] == 31
