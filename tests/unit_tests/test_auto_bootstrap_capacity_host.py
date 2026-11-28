"""Dead-owner quarantine on a real host store must not strand bootstrap retries.

Runtime tests drive ``ensure`` in-process against the real admission store,
real host memory telemetry and real process identity. E2E tests drive the
``bootstrap_manager.py`` CLI entry point in separate processes. Both saturate
host capacity with leases held by bootstrap owners that really died, which is
the field failure: free RAM, yet "host capacity did not become available".
Only the project adapters (forge CLI, GitNexus index, source commit) are
stubbed, so no test touches a real repository or the user's admission home.
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline

bm = baseline.bm
fixture = baseline.fixture

REPO = Path(__file__).resolve().parents[2]
RUNTIME = REPO / "scripts/runtime"

# A bootstrap owner that is granted a worker lease and then dies without
# releasing it, exactly like a crashed or killed bootstrap process.
CRASHED_OWNER = r"""
import json, os, sys, time, uuid
sys.path.insert(0, sys.argv[1])
from host_admission import HostAdmission
from host_resources import inspect_process

home, project = sys.argv[2], sys.argv[3]
admission = HostAdmission(home)
job = "bootstrap-worker-" + uuid.uuid4().hex
token = uuid.uuid4().hex + uuid.uuid4().hex
run = "bootstrap-" + uuid.uuid4().hex
pid = os.getpid()
row = admission.enqueue(
    job_id=job, token=token, project_root=project, run_id=run,
    owner_pid=pid, kind="worker", memory_mib=128,
)
deadline = time.monotonic() + 10
while row["state"] == "queued" and time.monotonic() < deadline:
    time.sleep(0.1)
    row = admission.poll(job, token, pid)
holder = {
    "job_id": job, "token": token, "run_id": run, "project_root": project,
    "owner_pid": pid, "owner_identity": inspect_process(pid), "state": row["state"],
}
if len(sys.argv) > 4 and sys.argv[4] == "heavy" and row["state"] == "active":
    heavy = "bootstrap-heavy-" + uuid.uuid4().hex
    heavy_token = uuid.uuid4().hex + uuid.uuid4().hex
    heavy_row = admission.enqueue(
        job_id=heavy, token=heavy_token, project_root=project, run_id=run,
        owner_pid=pid, kind="heavy", memory_mib=128, parent_lease_id=job,
    )
    while heavy_row["state"] == "queued" and time.monotonic() < deadline:
        time.sleep(0.1)
        heavy_row = admission.poll(heavy, heavy_token, pid)
    holder["heavy"] = {
        **holder, "job_id": heavy, "token": heavy_token, "state": heavy_row["state"],
    }
print(json.dumps(holder), flush=True)
os._exit(0)
"""

# Real CLI entry point, real scheduler/identity/telemetry; adapters stubbed.
CLI_DRIVER = r"""
import os, sys
repo = sys.argv[1]
sys.path.insert(0, repo)
sys.path.insert(0, os.path.join(repo, "scripts", "runtime"))
from tests.unit_tests import test_auto_bootstrap as baseline

bm = baseline.module()
bm.BOOTSTRAP_ADMISSION_WAIT_SECONDS = float(os.environ["FW_E2E_WAIT_SECONDS"])
bm.source_commit = lambda _root: "a" * 40
bm.gitnexus = baseline.index_fixture
calls = []
bm.call_forge = baseline.make_fake_call_forge(bm, calls)
if os.environ.get("FW_E2E_FAIL_WORKER_RELEASE") == "1":
    base = bm.HostAdmission

    class FailingWorkerRelease(base):
        def release(self, job_id, token, owner_pid, *, quiescent=True):
            if job_id.startswith("bootstrap-worker-"):
                raise bm.AdmissionError("injected-worker-release-failure")
            return super().release(job_id, token, owner_pid, quiescent=quiescent)

    bm.HostAdmission = FailingWorkerRelease
sys.argv = ["bootstrap_manager.py", *sys.argv[2:]]
code = bm.main()
if os.environ.get("FW_E2E_CALLS_LOG"):
    import json
    with open(os.environ["FW_E2E_CALLS_LOG"], "w", encoding="utf-8") as handle:
        json.dump(calls, handle)
raise SystemExit(code)
"""


def _admission_home() -> Path:
    return Path(os.environ["FORGEWRIGHT_ADMISSION_HOME"])


def _crash_owner(project: Path, *, heavy: bool = False) -> dict:
    project.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            CRASHED_OWNER,
            str(RUNTIME),
            str(_admission_home()),
            str(project.resolve()),
            *(["heavy"] if heavy else []),
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    )
    return json.loads(result.stdout.strip().splitlines()[-1])


def _rows() -> list[tuple[str, str, str]]:
    connection = sqlite3.connect(_admission_home() / "host.sqlite3")
    try:
        return connection.execute("SELECT id, state, reason FROM jobs").fetchall()
    finally:
        connection.close()


def _saturate_with_dead_owners(tmp_path: Path) -> list[dict]:
    """Fill every worker slot with leases whose owners have exited."""
    from host_admission import HostAdmission

    holders = []
    for index in range(2):
        holder = _crash_owner(tmp_path / f"crashed-owner-{index}")
        if holder["state"] != "active":
            break  # The host cap is already reached by earlier dead owners.
        holders.append(holder)
    assert holders, "the first dead owner must have been granted a worker slot"
    admission = HostAdmission(_admission_home())
    try:
        with admission.transaction():
            admission.refresh()
    finally:
        admission.close()
    states = {job: (state, reason) for job, state, reason in _rows()}
    for holder in holders:
        assert states[holder["job_id"]] == ("quarantined", "owner-lost")
    return holders


def _hold_heavy_slot_with_dead_owner(tmp_path: Path) -> list[dict]:
    """The reviewer's field case: one dead owner keeps a worker and the heavy
    slot quarantined, while a second worker slot stays free."""
    import host_resources
    from host_admission import HostAdmission

    sample = host_resources.memory_snapshot()
    assert sample.worker_limit >= 2, (
        "this host admits one worker only, so a free worker slot beside a "
        f"held heavy slot cannot occur: {sample}"
    )
    holder = _crash_owner(tmp_path / "crashed-heavy-owner", heavy=True)
    assert holder["state"] == "active"
    assert holder["heavy"]["state"] == "active"
    admission = HostAdmission(_admission_home())
    try:
        with admission.transaction():
            admission.refresh()
    finally:
        admission.close()
    states = {job: (state, reason) for job, state, reason in _rows()}
    assert states[holder["job_id"]] == ("quarantined", "owner-lost")
    assert states[holder["heavy"]["job_id"]][0] == "quarantined"
    return [holder]


def _fill_project_queue(project: Path) -> list[tuple[str, str]]:
    """Reach the store's per-project limit with live, owned reservations."""
    import uuid

    from host_admission import HostAdmission
    from host_admission_store import MAX_PER_PROJECT

    admission = HostAdmission(_admission_home())
    jobs = []
    try:
        for _ in range(MAX_PER_PROJECT):
            job, token = "filler-" + uuid.uuid4().hex, uuid.uuid4().hex * 2
            admission.enqueue(
                job_id=job,
                token=token,
                project_root=str(project),
                run_id="filler-" + uuid.uuid4().hex,
                owner_pid=os.getpid(),
                kind="worker",
                memory_mib=64,
            )
            jobs.append((job, token))
    finally:
        admission.close()
    return jobs


def _release_filled_queue(jobs: list[tuple[str, str]]) -> None:
    from host_admission import HostAdmission

    admission = HostAdmission(_admission_home())
    try:
        for job, token in jobs:
            assert admission.release(job, token, os.getpid())["state"] == "released"
    finally:
        admission.close()


def _reconcile(holders: list[dict]) -> None:
    from host_admission import HostAdmission

    admission = HostAdmission(_admission_home())
    try:
        for holder in holders:
            # A worker cannot be reconciled while its heavy child is reserved.
            for lease in ([holder["heavy"]] if "heavy" in holder else []) + [holder]:
                row = admission.reconcile_quarantined(
                    job_id=lease["job_id"],
                    token=lease["token"],
                    project_root=lease["project_root"],
                    run_id=lease["run_id"],
                    owner_pid=lease["owner_pid"],
                    owner_identity=lease["owner_identity"],
                )
                assert row["state"] == "released"
    finally:
        admission.close()


def _project_tree(project: Path) -> dict:
    return {
        path.relative_to(project).as_posix(): (
            path.read_bytes() if path.is_file() else None
        )
        for path in sorted(project.rglob("*"))
    }


def _snapshot(bm, project: Path) -> tuple:
    digest = bm.root_digest(project)
    entry = next(
        (x for x in bm.registry()["projects"] if x.get("root_digest") == digest),
        None,
    )
    return bm._read_journal(project), entry, _project_tree(project)


@pytest.fixture
def real_host(bm, fixture, monkeypatch):
    """Undo the unit fixture's sensor/identity models; keep adapter stubs."""
    import host_admission
    import host_resources

    monkeypatch.setattr(bm, "HostAdmission", host_admission.HostAdmission)
    monkeypatch.setattr(bm, "inspect_process", host_resources.inspect_process)
    monkeypatch.setattr(bm, "BOOTSTRAP_ADMISSION_WAIT_SECONDS", 2.0)
    sample = host_resources.memory_snapshot()
    assert sample.total_bytes > 0, sample
    return fixture


def _cli(
    *args: str, fail_worker_release: bool = False, calls_log: Path | None = None
) -> dict:
    env = {**os.environ, "FW_E2E_WAIT_SECONDS": "2.0"}
    if fail_worker_release:
        env["FW_E2E_FAIL_WORKER_RELEASE"] = "1"
    if calls_log is not None:
        env["FW_E2E_CALLS_LOG"] = str(calls_log)
    result = subprocess.run(
        [sys.executable, "-c", CLI_DRIVER, str(REPO), *args],
        capture_output=True,
        text=True,
        timeout=180,
        env=env,
        cwd=str(REPO),
    )
    lines = [line for line in result.stdout.splitlines() if line.startswith("{")]
    assert lines, result.stdout + result.stderr
    return json.loads(lines[-1])


# --- runtime tier ---------------------------------------------------------


def test_runtime_dead_owner_quarantine_timeout_is_retryable(bm, real_host, tmp_path):
    project = real_host["project"]
    holders = _saturate_with_dead_owners(tmp_path)

    for _attempt in range(2):
        with pytest.raises(bm.BootstrapError) as caught:
            bm.ensure(str(project), "automation")
        # The retry is a new admission attempt, never a recovery demand.
        assert caught.value.code == "host_capacity_timeout"
        assert "scheduler reason: capacity" in str(caught.value)
        assert bm._read_journal(project) is None
        assert bm.read_state(project) is None

    _reconcile(holders)
    assert bm.ensure(str(project), "automation")["status"] == "ready"


def test_runtime_dead_owner_quarantine_timeout_restores_prior_journal(
    bm, real_host, tmp_path
):
    project = real_host["project"]
    assert bm.ensure(str(project), "automation")["status"] == "ready"
    prior = bm._read_journal(project)
    assert prior["status"] == "completed"
    holders = _saturate_with_dead_owners(tmp_path)

    with pytest.raises(bm.BootstrapError) as caught:
        bm.ensure(str(project), "automation", repair=True)

    assert caught.value.code == "host_capacity_timeout"
    assert bm._read_journal(project) == prior
    assert bm.read_state(project)["status"] == "ready"
    _reconcile(holders)


def test_runtime_unconfirmed_release_keeps_recovery_journal(
    bm, real_host, tmp_path, monkeypatch
):
    import host_admission

    class FailingWorkerRelease(host_admission.HostAdmission):
        def release(self, job_id, token, owner_pid, *, quiescent=True):
            if job_id.startswith("bootstrap-worker-"):
                raise bm.AdmissionError("injected-worker-release-failure")
            return super().release(job_id, token, owner_pid, quiescent=quiescent)

    project = real_host["project"]
    holders = _saturate_with_dead_owners(tmp_path)
    monkeypatch.setattr(bm, "HostAdmission", FailingWorkerRelease)

    with pytest.raises(bm.BootstrapError) as caught:
        bm.ensure(str(project), "automation")

    assert caught.value.code == "host_quiescence_unconfirmed"
    assert bm._read_journal(project)["status"] == "running"
    with pytest.raises(bm.BootstrapError) as retry:
        bm.ensure(str(project), "automation")
    assert retry.value.code == "recovery_required"
    _reconcile(holders)


# --- e2e tier: CLI in separate processes ----------------------------------


def test_e2e_cli_dead_owner_quarantine_timeout_is_retryable(bm, fixture, tmp_path):
    project = str(fixture["project"])
    holders = _saturate_with_dead_owners(tmp_path)

    for _attempt in range(2):
        result = _cli("ensure", project, "--mode", "automation")
        assert result["ok"] is False
        assert result["error"]["code"] == "host_capacity_timeout"
        assert "scheduler reason: capacity" in result["error"]["message"]
        assert bm._read_journal(fixture["project"]) is None

    _reconcile(holders)
    result = _cli("ensure", project, "--mode", "automation")
    assert result["ok"] is True, result
    assert result["data"]["status"] == "ready"


def test_e2e_cli_dead_owner_quarantine_timeout_restores_prior_journal(
    bm, fixture, tmp_path
):
    project = str(fixture["project"])
    first = _cli("ensure", project, "--mode", "automation")
    assert first["ok"] is True, first
    prior = bm._read_journal(fixture["project"])
    assert prior["status"] == "completed"
    holders = _saturate_with_dead_owners(tmp_path)

    result = _cli("repair", project, "--mode", "automation")

    assert result["error"]["code"] == "host_capacity_timeout"
    assert bm._read_journal(fixture["project"]) == prior
    assert bm.read_state(fixture["project"])["status"] == "ready"
    _reconcile(holders)


def test_e2e_cli_unconfirmed_release_keeps_recovery_journal(bm, fixture, tmp_path):
    project = str(fixture["project"])
    holders = _saturate_with_dead_owners(tmp_path)

    result = _cli("ensure", project, "--mode", "automation", fail_worker_release=True)

    assert result["error"]["code"] == "host_quiescence_unconfirmed"
    assert bm._read_journal(fixture["project"])["status"] == "running"
    retry = _cli("ensure", project, "--mode", "automation")
    assert retry["error"]["code"] == "recovery_required"
    _reconcile(holders)


# --- heavy slot, queue refusal and unsettled release: runtime tier ---------


class _FailingWorkerRelease:
    """Real store whose worker release cannot be confirmed."""

    @staticmethod
    def build(bm):
        import host_admission

        class FailingWorkerRelease(host_admission.HostAdmission):
            def release(self, job_id, token, owner_pid, *, quiescent=True):
                if job_id.startswith("bootstrap-worker-"):
                    raise bm.AdmissionError("injected-worker-release-failure")
                return super().release(job_id, token, owner_pid, quiescent=quiescent)

        return FailingWorkerRelease


def test_runtime_dead_owner_heavy_slot_timeout_is_retryable(bm, real_host, tmp_path):
    project = real_host["project"]
    before = _project_tree(project)
    holders = _hold_heavy_slot_with_dead_owner(tmp_path)

    for _attempt in range(2):
        real_host["calls"].clear()
        with pytest.raises(bm.BootstrapError) as caught:
            bm.ensure(str(project), "automation")
        assert caught.value.code == "host_capacity_timeout"
        assert "scheduler reason: capacity" in str(caught.value)
        # The worker was admitted and its stages ran; the heavy wait timed out.
        assert ["init", str(project)] in real_host["calls"]
        assert _project_tree(project) == before
        assert bm.read_state(project) is None
        assert bm._read_journal(project) is None

    _reconcile(holders)
    assert bm.ensure(str(project), "automation")["status"] == "ready"


def test_runtime_dead_owner_heavy_slot_timeout_during_repair_restores_prior(
    bm, real_host, tmp_path
):
    project = real_host["project"]
    assert bm.ensure(str(project), "automation")["status"] == "ready"
    prior = (_snapshot(bm, project), bm.state_path(project).read_bytes())
    holders = _hold_heavy_slot_with_dead_owner(tmp_path)

    with pytest.raises(bm.BootstrapError) as caught:
        bm.ensure(str(project), "automation", repair=True)

    assert caught.value.code == "host_capacity_timeout"
    assert (_snapshot(bm, project), bm.state_path(project).read_bytes()) == prior
    _reconcile(holders)
    assert bm.ensure(str(project), "automation")["status"] == "ready"


def test_runtime_project_queue_full_is_retryable(bm, real_host):
    project = real_host["project"]
    jobs = _fill_project_queue(project)

    with pytest.raises(bm.BootstrapError) as caught:
        bm.ensure(str(project), "automation")

    assert caught.value.code == "host_admission_unavailable"
    assert "queue-full" in str(caught.value)
    assert bm._read_journal(project) is None
    assert bm.read_state(project) is None
    _release_filled_queue(jobs)
    assert bm.ensure(str(project), "automation")["status"] == "ready"


def test_runtime_heavy_timeout_with_unconfirmed_worker_release_keeps_recovery(
    bm, real_host, tmp_path, monkeypatch
):
    import host_admission

    project = real_host["project"]
    holders = _hold_heavy_slot_with_dead_owner(tmp_path)
    monkeypatch.setattr(bm, "HostAdmission", _FailingWorkerRelease.build(bm))

    with pytest.raises(bm.BootstrapError) as caught:
        bm.ensure(str(project), "automation")

    assert caught.value.code == "host_capacity_timeout"
    assert bm._read_journal(project) is not None
    monkeypatch.setattr(bm, "HostAdmission", host_admission.HostAdmission)
    with pytest.raises(bm.BootstrapError) as retry:
        bm.ensure(str(project), "automation")
    assert retry.value.code == "recovery_required"
    _reconcile(holders)


# --- heavy slot, queue refusal and unsettled release: e2e tier -------------


def test_e2e_cli_dead_owner_heavy_slot_timeout_is_retryable(bm, fixture, tmp_path):
    project = fixture["project"]
    before = _project_tree(project)
    holders = _hold_heavy_slot_with_dead_owner(tmp_path)

    for attempt in range(2):
        log = tmp_path / f"calls-{attempt}.json"
        result = _cli("ensure", str(project), "--mode", "automation", calls_log=log)
        assert result["error"]["code"] == "host_capacity_timeout"
        assert "scheduler reason: capacity" in result["error"]["message"]
        assert ["init", str(project)] in json.loads(log.read_text(encoding="utf-8"))
        assert _project_tree(project) == before
        assert bm.read_state(project) is None
        assert bm._read_journal(project) is None

    _reconcile(holders)
    result = _cli("ensure", str(project), "--mode", "automation")
    assert result["ok"] is True, result
    assert result["data"]["status"] == "ready"


def test_e2e_cli_dead_owner_heavy_slot_timeout_during_repair_restores_prior(
    bm, fixture, tmp_path
):
    project = fixture["project"]
    first = _cli("ensure", str(project), "--mode", "automation")
    assert first["ok"] is True, first
    prior = (_snapshot(bm, project), bm.state_path(project).read_bytes())
    holders = _hold_heavy_slot_with_dead_owner(tmp_path)

    result = _cli("repair", str(project), "--mode", "automation")

    assert result["error"]["code"] == "host_capacity_timeout"
    assert (_snapshot(bm, project), bm.state_path(project).read_bytes()) == prior
    _reconcile(holders)


def test_e2e_cli_project_queue_full_is_retryable(bm, fixture):
    project = fixture["project"]
    jobs = _fill_project_queue(project)

    result = _cli("ensure", str(project), "--mode", "automation")

    assert result["error"]["code"] == "host_admission_unavailable"
    assert "queue-full" in result["error"]["message"]
    assert bm._read_journal(project) is None
    _release_filled_queue(jobs)
    result = _cli("ensure", str(project), "--mode", "automation")
    assert result["ok"] is True, result


def test_e2e_cli_heavy_timeout_with_unconfirmed_worker_release_keeps_recovery(
    bm, fixture, tmp_path
):
    project = fixture["project"]
    holders = _hold_heavy_slot_with_dead_owner(tmp_path)

    result = _cli(
        "ensure", str(project), "--mode", "automation", fail_worker_release=True
    )

    assert result["error"]["code"] == "host_capacity_timeout"
    assert bm._read_journal(project) is not None
    retry = _cli("ensure", str(project), "--mode", "automation")
    assert retry["error"]["code"] == "recovery_required"
    _reconcile(holders)
