"""Lease identity is bound to a process lifetime, never mutable PPID/PGID.

Regression scenarios reported by independent integration review. These probes
exercise the actual inspector and transactional release, without signaling any
user process or substituting a passing ownership predicate.
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/runtime"))
import host_resources as resources  # noqa: E402
from host_admission import HostAdmission  # noqa: E402


def test_darwin_reparenting_and_process_group_changes_preserve_owner(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(resources.sys, "platform", "darwin")
    sample = {"raw": "Sun Sep 20 12:00:00 2026 500 300 S /usr/bin/python3"}
    monkeypatch.setattr(resources, "command", lambda argv: sample["raw"])
    before = resources.inspect_process(500)
    assert before
    project = tmp_path / "consumer"
    project.mkdir()
    admission = HostAdmission(
        tmp_path / "state",
        inspector=resources.inspect_process,
        sensor=lambda: resources.MemorySnapshot(
            8 * resources.GIB, 6 * resources.GIB, "normal", "controlled"
        ),
    )
    try:
        lease = admission.enqueue(
            job_id="stable-owner",
            token="owner-token-" + "x" * 40,
            project_root=str(project),
            run_id="stable-run",
            owner_pid=500,
        )
        assert lease["state"] == "active"
        sample["raw"] = "Sun Sep 20 12:00:00 2026 700 1 R /usr/bin/python3"
        assert resources.inspect_process(500) == before
        assert (
            admission.poll("stable-owner", "owner-token-" + "x" * 40, 500)["state"]
            == "active"
        )
        assert (
            admission.release("stable-owner", "owner-token-" + "x" * 40, 500)["state"]
            == "released"
        )
        sample["raw"] = "Sun Sep 20 12:00:01 2026 700 1 S /usr/bin/python3"
        assert resources.inspect_process(500) != before
    finally:
        admission.close()


def test_darwin_pid_is_part_of_identity_and_zombie_is_unavailable(monkeypatch):
    monkeypatch.setattr(resources.sys, "platform", "darwin")
    sample = {"raw": "Sun Sep 20 12:00:00 2026 700 1 S /usr/bin/python3"}
    monkeypatch.setattr(resources, "command", lambda argv: sample["raw"])
    assert resources.inspect_process(500) != resources.inspect_process(501)
    sample["raw"] = "Sun Sep 20 12:00:00 2026 700 1 Z /usr/bin/python3"
    assert resources.inspect_process(500) is None


def test_linux_identity_uses_boot_pid_and_start_ticks_not_parent_or_group(monkeypatch):
    monkeypatch.setattr(resources.sys, "platform", "linux")
    fields = ["S", "300", "500"] + ["0"] * 16 + ["123456"] + ["0"] * 8
    boot = {"id": "boot-one"}

    def read(path, *args, **kwargs):
        if str(path).endswith("boot_id"):
            return boot["id"]
        return "500 (python worker) " + " ".join(fields)

    monkeypatch.setattr(Path, "read_text", read)
    before = resources.inspect_process(500)
    fields[1:3] = ["1", "700"]
    assert resources.inspect_process(500) == before
    assert resources.inspect_process(501) != before
    fields[19] = "123457"
    assert resources.inspect_process(500) != before
    fields[19] = "123456"
    boot["id"] = "boot-two"
    assert resources.inspect_process(500) != before
