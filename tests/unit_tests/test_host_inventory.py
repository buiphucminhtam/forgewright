"""Inventory is observation, never process ownership or an admission grant."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
from host_inventory import correlate_processes, authority_identity


def test_only_exact_lifetime_is_managed_and_reservation_is_not_rss():
    jobs = [
        dict(
            id="a",
            pid=10,
            identity="birth-a",
            project="/work/a",
            state="active",
            kind="worker",
            memory_bytes=128 * 1024**2,
        ),
        dict(
            id="b",
            pid=11,
            identity="old-birth",
            project="/work/b",
            state="quarantined",
            kind="heavy",
            memory_bytes=256 * 1024**2,
        ),
    ]
    procs = [
        dict(pid=10, identity="birth-a", rss_bytes=999),
        dict(pid=11, identity="new-birth", rss_bytes=200),
        dict(pid=12, identity=None, rss_bytes=None),
    ]
    result = correlate_processes(jobs, procs)
    assert [p["coverage"] for p in result] == ["managed-owner", "unmanaged", "unknown"]
    assert result[0]["rss_bytes"] == 999
    assert result[0]["reservation_bytes"] == 128 * 1024**2
    assert result[1]["leases"] == []


def test_physical_worktrees_remain_separate_and_no_token_or_argv_leaks():
    jobs = [
        dict(
            id=str(p),
            pid=p,
            identity=str(p),
            project=f"/work/tree-{p}",
            state="active",
            kind="worker",
            memory_bytes=64,
        )
        for p in (10, 20)
    ]
    rows = correlate_processes(
        jobs,
        [dict(pid=p, identity=str(p), argv="secret", token="secret") for p in (10, 20)],
    )
    assert rows[0]["projects"] != rows[1]["projects"]
    assert "secret" not in str(rows)


def test_authority_override_is_explicit(tmp_path):
    canonical = tmp_path / "default"
    assert authority_identity(canonical, canonical)["override"] is False
    assert authority_identity(tmp_path / "other", canonical)["override"] is True
    assert (
        authority_identity(canonical, canonical)["id"]
        != authority_identity(tmp_path / "other", canonical)["id"]
    )
