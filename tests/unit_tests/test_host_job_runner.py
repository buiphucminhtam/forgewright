"""Finite, explicitly enrolled commands use the shared authority, no model calls."""

import json
import os
from pathlib import Path
import sys
import threading
import subprocess

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
from host_admission import HostAdmission, MemorySnapshot
from host_job_runner import JobRequest, JobError, run_job, reject_nested, check_disk


@pytest.fixture
def env(tmp_path):
    project = tmp_path / "project"
    project.mkdir()
    admission = HostAdmission(
        tmp_path / "admission",
        sensor=lambda: MemorySnapshot(
            16 * 1024**3, 10 * 1024**3, "normal", "synthetic"
        ),
    )
    yield admission, project
    admission.close()


def request(project, argv, **kw):
    return JobRequest(
        project=project,
        cwd=project,
        argv=argv,
        profile="fixture-v1",
        memory_mib=128,
        scratch_bytes=0,
        disk_floor_bytes=0,
        timeout=5,
        **kw,
    )


def test_exit_argv_stdio_and_receipt_no_secrets(env, capfd):
    a, p = env
    secret = "quote';$(false) and spaces"
    receipt = run_job(
        a,
        request(
            p,
            [
                sys.executable,
                "-c",
                'import sys;print(sys.argv[1]);print("err",file=sys.stderr);sys.exit(7)',
                secret,
            ],
        ),
    )
    out = capfd.readouterr()
    assert out.out.strip() == secret and out.err.strip() == "err"
    assert receipt["exit_code"] == 7 and receipt["state"] == "quiescent"
    assert secret not in json.dumps(receipt)
    assert a.status()["active_heavy"] == a.status()["active_workers"] == 0


def test_artifact_lock_timeout_keeps_owned_bytes_charged_and_blocks_next_job(
    env, monkeypatch
):
    import host_job_runner as runner
    from artifact_pins import artifact_lock
    from contextlib import contextmanager
    from project_storage import StorageError

    admission, project = env
    original = runner.supervise
    completed = False

    def supervise(*args, **kwargs):
        nonlocal completed
        result = original(*args, **kwargs)
        completed = True
        return result

    @contextmanager
    def busy(workspace):
        if completed:
            raise StorageError("artifact-lock-busy")
        with artifact_lock(workspace):
            yield

    monkeypatch.setattr(runner, "supervise", supervise)
    monkeypatch.setattr("artifact_pins.artifact_lock", busy)
    job = request(project, [sys.executable, "-c", "pass"], artifact_policy=POLICY)
    result = run_job(admission, job)
    assert result["state"] == "quiescent" and result["exit_code"] == 125
    assert result["storage_error"] == "artifact-lock-busy"
    assert result["storage"]["state"] == "cleanup_pending"
    assert Path(result["storage"]["path"]).is_dir()
    assert (
        admission.status()["active_workers"] == admission.status()["active_heavy"] == 0
    )
    completed = False
    with pytest.raises(JobError, match="retention-cleanup-unconfirmed"):
        run_job(admission, job)


def test_cancel_before_grant_never_spawns(env):
    a, p = env
    cancelled = threading.Event()
    cancelled.set()
    marker = p / "spawned"
    r = run_job(
        a,
        request(p, [sys.executable, "-c", f'open({str(marker)!r},"w").write("bad")']),
        cancel=cancelled,
    )
    assert r["state"] == "cancelled" and not marker.exists()
    assert a.status()["queued"] == 0


def test_nested_identity_rejected_but_independent_same_project_allowed(env):
    a, p = env
    owner = os.getpid()
    a.enqueue(
        job_id="parent",
        token="x" * 64,
        project_root=str(p),
        run_id="parent",
        owner_pid=owner,
        memory_mib=64,
    )
    with pytest.raises(JobError, match="nested-worker"):
        reject_nested(a, {owner: a.inspector(owner)})
    reject_nested(a, {99999999: "independent"})
    assert a.status()["queued"] == 0


def test_disk_missing_or_insufficient_fails_before_spawn(env, monkeypatch):
    a, p = env
    marker = p / "spawned"
    monkeypatch.setattr(
        "host_job_runner.shutil.disk_usage",
        lambda _: (_ for _ in ()).throw(OSError("unknown")),
    )
    with pytest.raises(JobError, match="disk-unavailable"):
        run_job(
            a, request(p, [sys.executable, "-c", f'open({str(marker)!r},"w").close()'])
        )
    assert not marker.exists() and a.status()["active_heavy"] == 0


def test_disk_aliases_account_same_volume_growth(tmp_path):
    check_disk([tmp_path, tmp_path / "."], 100, 100, probe=lambda p: 200)
    with pytest.raises(JobError, match="insufficient-disk"):
        check_disk([tmp_path], 101, 100, probe=lambda p: 200)


def test_child_outlives_leader_keeps_reservation_until_cleanup(env):
    a, p = env
    r = run_job(
        a,
        request(
            p,
            [
                sys.executable,
                "-c",
                'import subprocess,sys;subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"])',
            ],
        ),
    )
    assert r["state"] in {"quiescent", "quarantined"}
    if r["state"] == "quarantined":
        assert a.status()["quarantined"] == 2
    else:
        assert a.status()["active_heavy"] == 0


def test_spawn_failure_releases_and_journal_has_no_argv(env):
    a, p = env
    with pytest.raises(JobError, match="spawn-failed"):
        run_job(a, request(p, ["/does-not-exist", "secret"]))
    assert a.status()["active_workers"] == a.status()["active_heavy"] == 0
    records = list((a.home / "jobs").glob("*.json"))
    assert len(records) == 1 and "secret" not in records[0].read_text()


def test_three_real_supervisors_serialize_heavy_effects(tmp_path):
    """Real SQLite, real PIDs/groups; ONLY the resource sensor is synthetic."""
    runtime = str(Path(__file__).resolve().parents[2] / "scripts/runtime")
    state = tmp_path / "authority"
    # Initialize schema before concurrent opens (schema migration is not the test).
    HostAdmission(state).close()
    active = tmp_path / "exclusive-marker"
    child = "import os,sys,time;fd=os.open(sys.argv[1],os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd);time.sleep(.15);os.unlink(sys.argv[1])"
    script = """
import sys,json
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from host_admission import HostAdmission,MemorySnapshot
from host_job_runner import JobRequest,run_job
a=HostAdmission(Path(sys.argv[2]),sensor=lambda:MemorySnapshot(16*1024**3,10*1024**3,'normal','synthetic'))
p=Path(sys.argv[3]);p.mkdir()
try:
 r=run_job(a,JobRequest(p,p,[sys.executable,'-c',sys.argv[4],sys.argv[5]],'fixture',128,0,0,timeout=5,wait_seconds=10))
 print(json.dumps(r));sys.exit(0 if r['state']=='quiescent' and r['exit_code']==0 else 1)
finally:a.close()
"""
    processes = [
        subprocess.Popen(
            [
                sys.executable,
                "-c",
                script,
                runtime,
                str(state),
                str(tmp_path / f"project-{i}"),
                child,
                str(active),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for i in range(3)
    ]
    try:
        for process in processes:
            out, err = process.communicate(timeout=15)
            assert process.returncode == 0, (out, err)
        assert not active.exists()
        a = HostAdmission(state)
        try:
            assert a.status()["active_heavy"] == a.status()["active_workers"] == 0
            assert a.status()["quarantined"] == a.status()["queued"] == 0
        finally:
            a.close()
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=5)


def test_cancel_while_queued_does_not_get_late_grant(env):
    a, p = env
    # Independent project owns both worker capacity slots.
    for i in range(2):
        other = p.parent / str(i)
        other.mkdir()
        a.enqueue(
            job_id=f"hold-{i}",
            token=str(i) * 64,
            project_root=str(other),
            run_id=f"hold-{i}",
            owner_pid=os.getpid(),
            memory_mib=64,
        )
    cancel = threading.Event()
    timer = threading.Timer(0.2, cancel.set)
    timer.start()
    # Exclude the test's deliberately installed parent ownership from ancestry
    # in this fixture only; production always probes the real birth identities.
    import host_job_runner

    original = host_job_runner.ancestry
    host_job_runner.ancestry = lambda: {99999999: "independent"}
    marker = p / "late-spawn"
    try:
        r = run_job(
            a,
            request(p, [sys.executable, "-c", f'open({str(marker)!r},"w").close()']),
            cancel=cancel,
        )
    finally:
        host_job_runner.ancestry = original
        timer.join()
    assert r["state"] == "cancelled" and not marker.exists()
    assert a.status()["queued"] == 0


def test_unknown_cleanup_quarantines_both_leases(env, monkeypatch):
    a, p = env

    # Execute and reap the owned child, but withhold quiescence evidence.
    def uncertain(process, *_):
        process.wait(timeout=5)
        return False, False

    monkeypatch.setattr("host_job_runner.supervise", uncertain)
    r = run_job(a, request(p, [sys.executable, "-c", "pass"]))
    assert r["state"] == "quarantined" and a.status()["quarantined"] == 2


def test_journal_failure_after_spawn_never_releases_capacity(env, monkeypatch):
    a, p = env
    import host_job_runner

    original = host_job_runner.write_journal

    def fail(home, record):
        if record["child"]:
            raise OSError("journal-full")
        return original(home, record)

    monkeypatch.setattr(host_job_runner, "write_journal", fail)
    with pytest.raises(OSError, match="journal-full"):
        run_job(a, request(p, [sys.executable, "-c", "import time;time.sleep(.1)"]))
    assert a.status()["quarantined"] == 2


def test_cancellation_during_spawn_intent_cannot_launch(env, monkeypatch):
    a, p = env
    import host_job_runner

    cancel = threading.Event()
    original = host_job_runner.write_journal

    def checkpoint(home, record):
        original(home, record)
        if record["spawn_pending"]:
            cancel.set()

    monkeypatch.setattr(host_job_runner, "write_journal", checkpoint)
    original_popen = subprocess.Popen

    def no_spawn(argv, *args, **kwargs):
        if argv[0] == sys.executable:
            pytest.fail("cancelled spawn intent reached Popen")
        return original_popen(argv, *args, **kwargs)

    monkeypatch.setattr(host_job_runner.subprocess, "Popen", no_spawn)
    # Avoid patching the census subprocess used by real ancestry checks.
    monkeypatch.setattr(host_job_runner, "ancestry", lambda: {})
    r = run_job(a, request(p, [sys.executable, "-c", "pass"]), cancel=cancel)
    assert r["state"] == "cancelled" and a.status()["quarantined"] == 0


def test_ordinary_child_exec_is_same_birth_not_pid_reuse(env):
    a, p = env
    # Delay makes both sides of exec observable by the monitor.
    command = 'import os,time;time.sleep(.3);os.execv("/bin/sleep",["sleep",".3"])'
    r = run_job(a, request(p, [sys.executable, "-c", command]))
    assert r["state"] == "quiescent" and r["exit_code"] == 0


POLICY = {
    "schema": "forgewright-artifact-policy/v1",
    "scratch_limit_bytes": 4096,
    "output_limit_bytes": 4096,
    "retained_limit_bytes": 8192,
    "retain_generations": 2,
    "ttl_seconds": 86400,
    "project_limit_bytes": 16 * 1024**2,
}


def test_runner_redirects_temp_cleans_it_and_seals_bounded_outputs(env):
    a, p = env
    code = 'import os;from pathlib import Path;Path(os.environ["TMPDIR"],"temp").write_text("scratch");Path(os.environ["FORGEWRIGHT_OUTPUT_DIR"],"build").write_text("result")'
    r = run_job(a, request(p, [sys.executable, "-c", code], artifact_policy=POLICY))
    assert r["state"] == "quiescent" and r["exit_code"] == 0
    assert r["storage"]["state"] == "retained"
    root = Path(r["storage"]["path"])
    assert not (root / "scratch").exists()
    assert (root / "output/build").read_text() == "result"


def test_compliant_active_writer_is_not_cancelled_for_directory_census_drift(
    env, monkeypatch
):
    import project_storage

    a, p = env
    done = p / "writer-done"
    original = project_storage.measure_tree

    def racing_census(path, **kw):
        if Path(path).name == "scratch" and not done.exists():
            fired = [False]

            def create_during_scan(relative, info):
                if not fired[0]:
                    fired[0] = True
                    (Path(path) / "during-census").write_text("owned-temp")

            (Path(path) / "before-census").write_text("owned-temp")
            kw["visitor"] = create_during_scan
        return original(path, **kw)

    monkeypatch.setattr(project_storage, "measure_tree", racing_census)
    code = (
        "import time;from pathlib import Path;time.sleep(.3);Path("
        + repr(str(done))
        + ').write_text("done")'
    )
    r = run_job(a, request(p, [sys.executable, "-c", code], artifact_policy=POLICY))
    assert done.exists() and r["state"] == "quiescent" and r["exit_code"] == 0


def test_output_limit_failure_cleans_owned_bytes_but_releases_cpu_slots(env):
    a, p = env
    code = 'import os;from pathlib import Path;Path(os.environ["FORGEWRIGHT_OUTPUT_DIR"],"huge").write_bytes(b"x"*10000)'
    r = run_job(a, request(p, [sys.executable, "-c", code], artifact_policy=POLICY))
    assert r["exit_code"] == 125 and r["storage"]["state"] == "reclaimed"
    assert not Path(r["storage"]["path"]).exists()
    assert a.status()["active_workers"] == a.status()["active_heavy"] == 0


def test_three_builds_keep_only_two_owned_generations(env):
    a, p = env
    receipts = []
    for _ in range(3):
        code = 'import os;from pathlib import Path;Path(os.environ["FORGEWRIGHT_OUTPUT_DIR"],"build").write_text("result")'
        receipts.append(
            run_job(a, request(p, [sys.executable, "-c", code], artifact_policy=POLICY))
        )
    assert not Path(receipts[0]["storage"]["path"]).exists()
    assert all(Path(r["storage"]["path"]).exists() for r in receipts[1:])


def test_cleanup_failure_keeps_disk_charged_without_holding_cpu(env, monkeypatch):
    a, p = env

    def failure(self, **kw):
        raise __import__("project_storage").StorageError("storage-cleanup-pending")

    monkeypatch.setattr("host_job_runner.JobStorage.finish", failure)
    r = run_job(a, request(p, [sys.executable, "-c", "pass"], artifact_policy=POLICY))
    assert (
        r["storage"]["state"] == "cleanup_pending" and r["storage"]["quiescent"] is True
    )
    assert Path(r["storage"]["path"]).exists() and r["exit_code"] == 125
    assert a.status()["active_workers"] == a.status()["active_heavy"] == 0


def test_volume_changes_while_waiting_cannot_launch(env, monkeypatch):
    a, p = env
    changed = {"value": False}
    original_stat, original_enqueue = Path.stat, a.enqueue

    def stat_changed(path, *args, **kwargs):
        value = original_stat(path, *args, **kwargs)
        if path == p and changed["value"]:
            fields = list(value)
            fields[2] += 123
            return os.stat_result(fields)
        return value

    def enqueue(**kw):
        row = original_enqueue(**kw)
        if kw.get("kind") == "heavy":
            changed["value"] = True
        return row

    monkeypatch.setattr(Path, "stat", stat_changed)
    monkeypatch.setattr(a, "enqueue", enqueue)
    marker = p / "unexpected"
    with pytest.raises(JobError, match="disk-volume-drift"):
        run_job(
            a, request(p, [sys.executable, "-c", f'open({str(marker)!r},"w").close()'])
        )
    assert not marker.exists() and a.status()["active_heavy"] == 0


def test_failed_tombstone_removal_remains_charged_cleanup_pending(env, monkeypatch):
    a, p = env

    def cannot_remove(*_, **__):
        raise OSError("disk-readonly")

    # Inject failure at the pinned-descriptor deletion boundary. Real namespace
    # replacement is exercised separately by test_project_storage.
    monkeypatch.setattr("project_storage._delete_tree", cannot_remove)
    code = 'import os;from pathlib import Path;Path(os.environ["FORGEWRIGHT_OUTPUT_DIR"],"huge").write_bytes(b"x"*10000)'
    r = run_job(a, request(p, [sys.executable, "-c", code], artifact_policy=POLICY))
    assert r["storage"]["state"] == "cleanup_pending"
    assert Path(r["storage"]["pending_path"]).is_dir()
    assert r["exit_code"] == 125 and a.status()["active_heavy"] == 0


def test_retention_still_reclaims_after_broker_terminal_history_gc(env):
    a, p = env
    receipts = []
    code = 'import os;from pathlib import Path;Path(os.environ["FORGEWRIGHT_OUTPUT_DIR"],"build").write_text("result")'
    for _ in range(3):
        receipts.append(
            run_job(a, request(p, [sys.executable, "-c", code], artifact_policy=POLICY))
        )
        # Model the broker's bounded terminal history collection.
        a.connection.execute("DELETE FROM jobs WHERE state='released'")
    assert not Path(receipts[0]["storage"]["path"]).exists()
    assert all(Path(r["storage"]["path"]).exists() for r in receipts[1:])


def test_protected_retention_overage_is_reported_as_failure(env, monkeypatch):
    a, p = env
    code = 'import os;from pathlib import Path;Path(os.environ["FORGEWRIGHT_OUTPUT_DIR"],"build").write_bytes(b"x"*100)'
    low = dict(POLICY, retained_limit_bytes=10)
    r = run_job(a, request(p, [sys.executable, "-c", code], artifact_policy=low))
    assert r["exit_code"] == 125 and "retention" in r.get("storage_error", "")
    assert r["storage"]["state"] == "retained"


def test_recovery_after_delete_succeeds_but_terminal_journal_write_is_full(
    env, monkeypatch
):
    import host_job_runner

    a, p = env
    code = 'import os;from pathlib import Path;Path(os.environ["FORGEWRIGHT_OUTPUT_DIR"],"build").write_text("result")'
    first = run_job(a, request(p, [sys.executable, "-c", code], artifact_policy=POLICY))
    run_job(a, request(p, [sys.executable, "-c", code], artifact_policy=POLICY))
    original = host_job_runner.write_journal
    failed = [False]

    def full(home, record):
        if (
            record["job_id"] == first["job_id"]
            and record.get("storage", {}).get("state") == "reclaimed"
            and not failed[0]
        ):
            failed[0] = True
            raise OSError(28, "fixture ENOSPC")
        return original(home, record)

    monkeypatch.setattr(host_job_runner, "write_journal", full)
    with pytest.raises(OSError):
        run_job(a, request(p, [sys.executable, "-c", code], artifact_policy=POLICY))
    assert failed[0] and not Path(first["storage"]["path"]).exists()
    recovered = run_job(
        a, request(p, [sys.executable, "-c", code], artifact_policy=POLICY)
    )
    assert recovered["exit_code"] == 0
    stored = json.loads((a.home / "jobs" / f"{first['job_id']}.json").read_text())
    assert stored["storage"]["state"] == "reclaimed"
    assert stored["storage"].get("cleanup_recovery") == "confirmed-paths-absent"


def test_pinned_full_generation_quota_blocks_next_build_before_effect(env):
    from project_storage import pin_artifact, unpin_artifact

    a, p = env
    code = 'import os;from pathlib import Path;Path(os.environ["FORGEWRIGHT_OUTPUT_DIR"],"build").write_text("result")'
    records = [
        run_job(a, request(p, [sys.executable, "-c", code], artifact_policy=POLICY))
        for _ in range(2)
    ]
    tokens = [pin_artifact(r["storage"], "consumer") for r in records]
    marker = p / "unexpected-build"
    try:
        with pytest.raises(JobError, match="retention-capacity-protected"):
            run_job(
                a,
                request(
                    p,
                    [sys.executable, "-c", f'open({str(marker)!r},"w").close()'],
                    artifact_policy=POLICY,
                ),
            )
        assert not marker.exists()
        assert len(list((p / ".forgewright/runtime/build-jobs").iterdir())) == 2
    finally:
        for receipt, token in zip(records, tokens):
            unpin_artifact(receipt["storage"], token)


def test_current_job_cleanup_intent_survives_post_delete_fsync_failure(
    env, monkeypatch
):
    import project_storage
    import host_job_runner

    a, p = env
    actual_delete = project_storage._delete_tree
    actual_fsync = project_storage.os.fsync
    after_delete = [False]
    failed = [False]

    def deleted(*args, **kwargs):
        result = actual_delete(*args, **kwargs)
        after_delete[0] = True
        return result

    def fail_once(fd):
        if after_delete[0] and not failed[0]:
            failed[0] = True
            raise OSError(5, "fixture directory sync error")
        return actual_fsync(fd)

    monkeypatch.setattr(project_storage, "_delete_tree", deleted)
    monkeypatch.setattr(project_storage.os, "fsync", fail_once)
    r = run_job(
        a,
        request(
            p, [sys.executable, "-c", "raise SystemExit(7)"], artifact_policy=POLICY
        ),
    )
    assert failed[0] and r["exit_code"] == 125
    assert r["storage"]["state"] == "cleanup_pending"
    assert r["storage"].get("cleanup_intent")
    recovered = host_job_runner.storage_journals(
        a,
        dict(
            json.loads((a.home / "jobs" / f"{r['job_id']}.json").read_text()),
            job_id="next-job",
        ),
    )
    assert recovered == {}
    stored = json.loads((a.home / "jobs" / f"{r['job_id']}.json").read_text())
    assert stored["storage"]["state"] == "reclaimed"


def test_process_table_rejects_malformed_rows_and_supervise_runs_once(env, monkeypatch):
    import host_job_runner

    a, p = env
    with monkeypatch.context() as mp:
        mp.setattr(host_job_runner, "command", lambda argv: "100 1 100 S Mon\n")
        with pytest.raises(ValueError, match="malformed-ps-row"):
            host_job_runner.process_table()

    calls = []
    orig_supervise = host_job_runner.supervise
    orig_popen = host_job_runner.subprocess.Popen
    monkeypatch.setattr(
        host_job_runner.subprocess,
        "Popen",
        lambda *args, **kwargs: orig_popen(
            *args, **{**kwargs, "start_new_session": False}
        ),
    )

    # Reparented grandchild in the same process group (ppid=1, pgid=process.pid)
    # whose intermediate parent exited between polls stays quiescent once it exits.
    reparent_step = [0]

    def reparented_same_pgid_supervise(process, cancel, deadline, heartbeat):
        with monkeypatch.context() as mp3:
            def fake_table_reparented():
                reparent_step[0] += 1
                if reparent_step[0] == 1:
                    return {
                        process.pid: (os.getpid(), process.pid, "birth-root"),
                        8888: (1, process.pid, "c" * 64),
                    }
                return {os.getpid(): (1, os.getpid(), "birth-self")}
            mp3.setattr(host_job_runner, "process_table", fake_table_reparented)
            mp3.setattr(host_job_runner.os, "killpg", lambda pgid, sig: None)
            process.wait(timeout=5)
            return orig_supervise(process, cancel, deadline, heartbeat)

    monkeypatch.setattr(host_job_runner, "supervise", reparented_same_pgid_supervise)
    r_ok = run_job(a, request(p, [sys.executable, "-c", "pass"]))
    assert r_ok["state"] == "quiescent"

    def fault_after_escape_supervise(process, cancel, deadline, heartbeat):
        calls.append(1)
        if len(calls) > 1:
            return True, False
        table_calls = [0]
        with monkeypatch.context() as mp2:
            def fake_table():
                table_calls[0] += 1
                if table_calls[0] == 1:
                    return {
                        process.pid: (os.getpid(), process.pid, "birth-root"),
                        9999: (process.pid, process.pid, "b" * 64),
                    }
                if table_calls[0] == 2:
                    return {
                        process.pid: (os.getpid(), process.pid, "birth-root"),
                        9999: (1, 9999, "b" * 64),
                    }
                raise ValueError("malformed-ps-row")
            mp2.setattr(host_job_runner, "process_table", fake_table)
            mp2.setattr(host_job_runner.os, "killpg", lambda pgid, sig: None)
            res = orig_supervise(process, cancel, deadline, heartbeat)
        process.wait(timeout=5)
        return res

    monkeypatch.setattr(host_job_runner, "supervise", fault_after_escape_supervise)
    r = run_job(a, request(p, [sys.executable, "-c", "pass"]))
    assert len(calls) == 1
    assert r["state"] == "quarantined"
    assert r["supervision_diagnostics"]["escaped_children"][0]["pid"] == 9999
    assert r["supervision_diagnostics"]["census_complete"] is False
