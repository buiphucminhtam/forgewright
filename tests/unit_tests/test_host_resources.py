"""Low-memory admission requirements, using tiny synthetic OS samples."""

from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
import host_resources as resources
from tests.unit_tests.test_host_admission import fixture, request, poll, release


def test_eight_gib_host_serializes_workers_without_killing_active_owner(tmp_path):
    admission, _, sensor, _ = fixture(tmp_path)
    sensor["sample"] = resources.MemorySnapshot(
        8 * resources.GIB, 6 * resources.GIB, "normal", "fixture"
    )
    try:
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "active"
        assert request(admission, tmp_path / "b", 101, "b")["state"] == "queued"
        assert admission.status()["worker_limit"] == 1
        assert poll(admission, "a", 100)["state"] == "active"
        release(admission, "a", 100)
        assert poll(admission, "b", 101)["state"] == "active"
    finally:
        admission.close()


def test_high_load_backpressure_hysteresis_and_cancel(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)
    try:
        sensor["sample"] = resources.MemorySnapshot(
            8 * resources.GIB, 4 * resources.GIB, "normal", "fixture", load_ratio=1.5
        )
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
        assert admission.status()["paused"] is True
        assert poll(admission, "a", 100)["reason"] == "host-load"
        release(admission, "a", 100)
        sensor["sample"] = resources.MemorySnapshot(
            8 * resources.GIB, 4 * resources.GIB, "normal", "fixture", load_ratio=0.1
        )
        assert request(admission, tmp_path / "b", 101, "b")["state"] == "queued"
        clock["now"] += 16
        assert poll(admission, "b", 101)["state"] == "active"
        assert poll(admission, "a", 100)["state"] == "released"
    finally:
        admission.close()


def test_unknown_pressure_blocks_new_work(tmp_path):
    admission, _, sensor, _ = fixture(tmp_path)
    sensor["sample"] = resources.MemorySnapshot(
        8 * resources.GIB, 6 * resources.GIB, "unknown", "fixture"
    )
    try:
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
    finally:
        admission.close()


def test_darwin_does_not_count_dirty_inactive_pages_as_available(monkeypatch):
    monkeypatch.setattr(resources.sys, "platform", "darwin")
    monkeypatch.setattr(resources.os, "getloadavg", lambda: (2, 1, 1))
    monkeypatch.setattr(resources.os, "cpu_count", lambda: 8)
    monkeypatch.setattr(
        resources,
        "command",
        lambda argv: (
            "8589934592\n1"
            if "sysctl" in argv[0]
            else (
                "Mach Virtual Memory Statistics: (page size of 16384 bytes)\n"
                "Pages free: 100.\nPages inactive: 200000.\nPages speculative: 50.\n"
                "Pages purgeable: 25.\nFile-backed pages: 500.\nSwapins: 3.\nSwapouts: 4.\n"
            )
        ),
    )
    sample = resources.memory_snapshot()
    assert sample.available_bytes == 175 * 16384
    assert sample.load_ratio == 0.25
    assert sample.reclaimable_estimate_bytes == (500 - 50 - 25) * 16384 // 2
    assert sample.swap_total_bytes == 7 * 16384


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), -1.0])
def test_invalid_load_telemetry_rejected(tmp_path, bad):
    admission, _, sensor, _ = fixture(tmp_path)
    sensor["sample"] = resources.MemorySnapshot(
        8 * resources.GIB, 6 * resources.GIB, "normal", "fixture", load_ratio=bad
    )
    try:
        with pytest.raises(Exception, match="telemetry-invalid"):
            admission.status()
    finally:
        admission.close()


def test_active_owner_survives_load_while_heavy_waits_then_resumes(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)
    try:
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "active"
        sensor["sample"] = resources.MemorySnapshot(
            8 * resources.GIB, 4 * resources.GIB, "normal", "fixture", load_ratio=1.25
        )
        assert (
            request(
                admission, tmp_path / "a", 100, "heavy", "heavy", parent_lease_id="a"
            )["state"]
            == "queued"
        )
        assert poll(admission, "a", 100)["state"] == "active"
        assert admission.status()["load_ratio"] == 1.25
        sensor["sample"] = resources.MemorySnapshot(
            8 * resources.GIB, 4 * resources.GIB, "normal", "fixture", load_ratio=0.2
        )
        clock["now"] += 14
        assert poll(admission, "heavy", 100)["state"] == "queued"
        clock["now"] += 2
        assert poll(admission, "heavy", 100)["state"] == "active"
        release(admission, "heavy", 100)
        release(admission, "a", 100)
        assert admission.status()["active_workers"] == 0
        assert admission.status()["active_heavy"] == 0
    finally:
        admission.close()


def test_reclaimable_memory_progress_and_reservations(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)
    sensor["sample"] = resources.MemorySnapshot(
        8 * resources.GIB,
        44 * resources.MIB,
        "normal",
        "darwin-vm-stat+memorystatus",
        load_ratio=0.2,
        reclaimable_estimate_bytes=700 * resources.MIB,
        swap_total_bytes=123456,
    )
    try:
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
        clock["now"] += 16
        assert poll(admission, "a", 100)["state"] == "active"
        assert (
            request(
                admission, tmp_path / "a", 100, "heavy", "heavy", parent_lease_id="a"
            )["state"]
            == "queued"
        )
        assert admission.status()["reservedMiB"] == 128
        release(admission, "heavy", 100)
        release(admission, "a", 100)
        assert request(admission, tmp_path / "b", 101, "b")["state"] == "active"
    finally:
        admission.close()


@pytest.mark.parametrize(
    "signal",
    ["critical", "unknown", "swap", "load", "missing-load", "missing-swap"],
)
def test_reclaimable_estimate_never_overrides_pressure_or_uncertainty(tmp_path, signal):
    admission, _, sensor, clock = fixture(tmp_path)

    def sample(counter=100):
        return resources.MemorySnapshot(
            8 * resources.GIB,
            44 * resources.MIB,
            signal if signal in {"warning", "critical", "unknown"} else "normal",
            "darwin-vm-stat+memorystatus",
            load_ratio=None
            if signal == "missing-load"
            else 1.1
            if signal == "load"
            else 0.1,
            reclaimable_estimate_bytes=2 * resources.GIB,
            swap_total_bytes=None if signal == "missing-swap" else counter,
        )

    try:
        sensor["sample"] = sample()
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
        for i in range(4):
            clock["now"] += 16
            sensor["sample"] = sample(
                100 + (i + 1) * 2 * resources.GIB if signal == "swap" else 100
            )
            assert poll(admission, "a", 100)["state"] == "queued"
    finally:
        admission.close()


@pytest.mark.parametrize("bad", ["critical", "load", "missing"])
def test_reclaimable_recovery_requires_fresh_normal_window(tmp_path, bad):
    admission, _, sensor, clock = fixture(tmp_path)
    try:
        sensor["sample"] = resources.MemorySnapshot(
            8 * resources.GIB,
            44 * resources.MIB,
            "critical" if bad == "critical" else "normal",
            "darwin-vm-stat+memorystatus",
            load_ratio=None if bad == "missing" else 1.5 if bad == "load" else 0.1,
            reclaimable_estimate_bytes=resources.GIB,
            swap_total_bytes=100,
        )
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
        clock["now"] += 16
        sensor["sample"] = resources.MemorySnapshot(
            8 * resources.GIB,
            44 * resources.MIB,
            "normal",
            "darwin-vm-stat+memorystatus",
            load_ratio=0.1,
            reclaimable_estimate_bytes=resources.GIB,
            swap_total_bytes=100,
        )
        assert poll(admission, "a", 100)["state"] == "queued"
        clock["now"] += 16
        assert poll(admission, "a", 100)["state"] == "active"
    finally:
        admission.close()


def test_sensor_failure_resets_mac_observation_window(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)
    normal = resources.MemorySnapshot(
        8 * resources.GIB,
        44 * resources.MIB,
        "normal",
        "darwin-vm-stat+memorystatus",
        load_ratio=0.1,
        reclaimable_estimate_bytes=resources.GIB,
        swap_total_bytes=100,
    )
    try:
        sensor["sample"] = normal
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
        clock["now"] += 1
        sensor["sample"] = resources.MemorySnapshot(
            0, 0, "unknown", "telemetry-unavailable"
        )
        assert poll(admission, "a", 100)["state"] == "queued"
        clock["now"] += 16
        sensor["sample"] = normal
        assert poll(admission, "a", 100)["state"] == "queued"
        clock["now"] += 16
        assert poll(admission, "a", 100)["state"] == "active"
    finally:
        admission.close()


def test_ordinary_swap_progresses_without_lowering_headroom(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)

    def sample(counter):
        return resources.MemorySnapshot(
            8 * resources.GIB,
            196 * resources.MIB,
            "normal",
            "darwin-vm-stat+memorystatus",
            load_ratio=0.36,
            reclaimable_estimate_bytes=591 * resources.MIB,
            swap_total_bytes=counter,
        )

    try:
        sensor["sample"] = sample(100)
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
        clock["now"] += 16
        sensor["sample"] = sample(100 + 16 * 64 * 1024)
        assert poll(admission, "a", 100)["state"] == "active"
        assert admission.status()["headroomMiB"] == 512
        assert admission.status()["worker_limit"] == 1
    finally:
        admission.close()


def test_sustained_swap_debits_cache_but_not_immediate_memory(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)

    def sample(counter, immediate=44):
        return resources.MemorySnapshot(
            8 * resources.GIB,
            immediate * resources.MIB,
            "normal",
            "darwin-vm-stat+memorystatus",
            load_ratio=0.1,
            reclaimable_estimate_bytes=700 * resources.MIB,
            swap_total_bytes=counter,
        )

    try:
        sensor["sample"] = sample(0)
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
        clock["now"] += 16
        sensor["sample"] = sample(16 * 64 * resources.MIB)
        assert poll(admission, "a", 100)["state"] == "queued"
        assert admission.status()["availableMiB"] == 44
        sensor["sample"] = sample(16 * 64 * resources.MIB, immediate=2048)
        clock["now"] += 16  # Preserve the existing low-budget recovery hold.
        assert poll(admission, "a", 100)["state"] == "active"
    finally:
        admission.close()


def test_swap_spike_uneven_poll_and_counter_reset(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)

    def sample(counter):
        return resources.MemorySnapshot(
            8 * resources.GIB,
            44 * resources.MIB,
            "normal",
            "darwin-vm-stat+memorystatus",
            load_ratio=0.1,
            reclaimable_estimate_bytes=700 * resources.MIB,
            swap_total_bytes=counter,
        )

    try:
        sensor["sample"] = sample(0)
        admission.status()
        clock["now"] += 15
        sensor["sample"] = sample(15 * resources.MIB)
        admission.status()
        clock["now"] += 1
        sensor["sample"] = sample(79 * resources.MIB)
        status = admission.status()
        assert status["availableMiB"] == 44  # Recent 64 MiB/s spike dominates mean.
        clock["now"] += 10
        status = admission.status()
        assert status["swapReserveMiB"] == int(79 / 26 * 15)
        sensor["sample"] = sample(0)
        assert admission.status()["paused"] is True
        clock["now"] += 16
        assert admission.status()["paused"] is False
    finally:
        admission.close()


@pytest.mark.parametrize("immediate,cache", [(2048, 0), (144, 1600)])
def test_stable_warning_admits_one_worker_and_parent_verifier(
    tmp_path, immediate, cache
):
    """Warning restricts capacity; it must not reset a healthy window forever."""
    admission, _, sensor, clock = fixture(tmp_path)
    sensor["sample"] = resources.MemorySnapshot(
        16 * resources.GIB,
        immediate * resources.MIB,
        "warning",
        "darwin-vm-stat+memorystatus",
        load_ratio=0.2,
        reclaimable_estimate_bytes=cache * resources.MIB,
        swap_total_bytes=100,
    )
    try:
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
        clock["now"] += 14
        assert poll(admission, "a", 100)["state"] == "queued"
        clock["now"] += 2
        assert poll(admission, "a", 100)["state"] == "active"
        status = admission.status()
        assert status["pressure"] == "warning"
        assert status["headroomMiB"] == 1024
        assert status["worker_limit"] == 1
        assert request(admission, tmp_path / "b", 101, "b")["state"] == "queued"
        assert (
            request(
                admission, tmp_path / "a", 100, "heavy", "heavy", parent_lease_id="a"
            )["state"]
            == "active"
        )
        release(admission, "heavy", 100)
        release(admission, "a", 100)
        assert poll(admission, "b", 101)["state"] == "active"
    finally:
        admission.close()


def test_warning_retains_headroom_and_accounts_for_swap_debit(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)

    def sample(cache, swap):
        return resources.MemorySnapshot(
            16 * resources.GIB,
            144 * resources.MIB,
            "warning",
            "darwin-vm-stat+memorystatus",
            load_ratio=0.2,
            reclaimable_estimate_bytes=cache * resources.MIB,
            swap_total_bytes=swap,
        )

    try:
        sensor["sample"] = sample(1000, 0)
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
        clock["now"] += 16
        assert poll(admission, "a", 100)["state"] == "queued"
        assert admission.status()["headroomMiB"] == 1024
        sensor["sample"] = sample(1600, 16 * 64 * resources.MIB)
        clock["now"] += 16
        assert poll(admission, "a", 100)["state"] == "queued"
        assert admission.status()["swapReserveMiB"] >= 960
        assert admission.status()["availableMiB"] < 1152
        release(admission, "a", 100)
    finally:
        admission.close()


@pytest.mark.parametrize("bad", ["critical", "unknown", "load", "missing-swap"])
def test_warning_recovery_starts_fresh_after_unsafe_telemetry(tmp_path, bad):
    admission, _, sensor, clock = fixture(tmp_path)

    def sample(unsafe=False):
        return resources.MemorySnapshot(
            16 * resources.GIB,
            144 * resources.MIB,
            bad if unsafe and bad in {"critical", "unknown"} else "warning",
            "darwin-vm-stat+memorystatus",
            load_ratio=1.1 if unsafe and bad == "load" else 0.2,
            reclaimable_estimate_bytes=1600 * resources.MIB,
            swap_total_bytes=None if unsafe and bad == "missing-swap" else 100,
        )

    try:
        sensor["sample"] = sample()
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
        clock["now"] += 14
        sensor["sample"] = sample(True)
        assert poll(admission, "a", 100)["state"] == "queued"
        clock["now"] += 2
        sensor["sample"] = sample()
        assert poll(admission, "a", 100)["state"] == "queued"
        clock["now"] += 16
        assert poll(admission, "a", 100)["state"] == "active"
    finally:
        admission.close()


@pytest.mark.parametrize("reset", ["enter-warning", "counter", "gap", "clock"])
def test_warning_observation_resets_on_transition_or_stale_sample(tmp_path, reset):
    from dataclasses import replace

    admission, _, sensor, clock = fixture(tmp_path)
    sensor["sample"] = resources.MemorySnapshot(
        16 * resources.GIB,
        2048 * resources.MIB,
        "normal" if reset == "enter-warning" else "warning",
        "darwin-vm-stat+memorystatus",
        load_ratio=0.2,
        swap_total_bytes=100,
    )
    try:
        assert admission.status()["paused"] is True
        clock["now"] += 16
        assert admission.status()["paused"] is False
        if reset == "enter-warning":
            sensor["sample"] = replace(sensor["sample"], pressure="warning")
        elif reset == "counter":
            sensor["sample"] = replace(sensor["sample"], swap_total_bytes=0)
        else:
            clock["now"] += 31 if reset == "gap" else -1
        assert request(admission, tmp_path / "a", 100, "a")["state"] == "queued"
        clock["now"] += 14
        assert poll(admission, "a", 100)["state"] == "queued"
        clock["now"] += 2
        assert poll(admission, "a", 100)["state"] == "active"
        release(admission, "a", 100)
    finally:
        admission.close()


def test_stable_warning_low_budget_reports_insufficient_memory(tmp_path):
    admission, _, sensor, clock = fixture(tmp_path)
    sensor["sample"] = resources.MemorySnapshot(
        16 * resources.GIB,
        144 * resources.MIB,
        "warning",
        "darwin-vm-stat+memorystatus",
        load_ratio=0.2,
        reclaimable_estimate_bytes=700 * resources.MIB,
        swap_total_bytes=100,
    )
    try:
        request(admission, tmp_path / "a", 100, "a")
        clock["now"] += 16
        result = poll(admission, "a", 100)
        assert result["state"] == "queued"
        assert result["reason"] == "insufficient-memory"
        assert admission.status()["availableMiB"] == 844
        release(admission, "a", 100)
    finally:
        admission.close()
