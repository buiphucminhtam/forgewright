"""Offline protocol probes; fixture streams never authorize live promotion."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def host():
    path = ROOT / "scripts/runtime/skill_eval_host.py"
    assert path.is_file(), "bounded capture host is not implemented"
    sys.path.insert(0, str(path.parent))
    import skill_eval_host

    return skill_eval_host


def alive(pid):
    try:
        return Path(f"/proc/{pid}/stat").read_text().split(") ")[1][0] != "Z"
    except FileNotFoundError:
        return False


def packet(tmp_path, events, *, model="chosen", script=None):
    h = host()
    source = tmp_path / "source.txt"
    source.write_text("Use supplied source facts; preserve guardrails.")
    manifest = (
        {
            "path": str(source),
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "kind": "instruction",
            "arm": "shared",
        },
    )
    metadata = {
        "type": "fixture.metadata",
        "model": model,
        "effort": "low",
        "instruction_sources": [str(source)],
        "usage_scope": "turn",
        "tool_counter_complete": True,
    }
    child = tmp_path / "fake.py"
    child.write_text(
        script
        or (
            "import sys\nsys.stdin.read()\n"
            + "\n".join(
                f"print({json.dumps(event)!r}, flush=True)"
                for event in [metadata, *events]
            )
        )
    )
    request = h.HostRequest(
        "case-r1",
        "current",
        1,
        {"prompt": "Compare the supplied facts."},
        manifest,
        "a" * 64,
        "chosen",
        "low",
        fixture_command=(sys.executable, str(child)),
    )
    return h, request


def completed():
    return [
        {"type": "thread.started", "thread_id": "test-thread"},
        {
            "type": "item.completed",
            "item": {
                "id": "answer",
                "type": "agent_message",
                "text": "Observed answer",
            },
        },
        {
            "type": "turn.completed",
            "usage": {"input_tokens": 5, "cached_input_tokens": 0, "output_tokens": 2},
        },
    ]


@pytest.mark.parametrize(
    "events,reason",
    [
        (completed()[:-1], "terminal"),
        ([*completed()[:-1], {"type": "turn.completed"}], "usage"),
    ],
)
def test_capture_requires_terminal_event_and_complete_usage_scope(
    tmp_path, events, reason
):
    h, request = packet(tmp_path, events)
    run = h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())
    assert not run.success
    assert reason in " ".join(run.record["failures"])
    assert (
        run.record["artifacts"]["stdout"]["sha256"]
        == hashlib.sha256((run.output_dir / "raw.stdout").read_bytes()).hexdigest()
    )


@pytest.mark.parametrize("leak", ["oracle", "other-arm"])
def test_capture_rejects_oracle_or_other_arm_instruction_leak(tmp_path, leak):
    from dataclasses import replace

    h, request = packet(tmp_path, completed())
    entry = dict(request.instruction_manifest[0])
    if leak == "oracle":
        request = replace(
            request,
            prompt_packet={"prompt": "hello", "required_events": ["hidden-answer"]},
        )
    else:
        entry["arm"] = "candidate"
        request = replace(request, instruction_manifest=(entry,))
    with pytest.raises(ValueError, match="oracle|arm|public"):
        h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())
    assert not (tmp_path / "run" / "raw.stdout").exists()


def test_capture_records_reroute_without_silent_model_substitution(tmp_path):
    h, request = packet(tmp_path, completed(), model="substituted")
    run = h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())
    assert not run.success
    assert run.record["model"]["requested"] == "chosen"
    assert run.record["model"]["reported"] == "substituted"
    assert "model_mismatch" in run.record["failures"]


def test_capture_timeout_reaps_only_owned_descendants(tmp_path):
    pidfile = tmp_path / "pid"
    foreign = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        script = f'import subprocess,sys,time\np=subprocess.Popen([sys.executable,"-c","import time; time.sleep(30)"])\nopen({str(pidfile)!r},"w").write(str(p.pid))\ntime.sleep(30)\n'
        h, request = packet(tmp_path, [], script=script)
        run = h.capture_run(
            request,
            output_dir=tmp_path / "run",
            limits=h.HostLimits(wall_seconds=0.3, cleanup_seconds=2),
        )
        assert not run.success
        assert "timeout" in run.record["failures"]
        assert not Path(f"/proc/{int(pidfile.read_text())}").exists()
        assert run.record["cleanup"]["zombie_pids"] == ()
        assert foreign.poll() is None
        assert run.record["cleanup"]["complete"]
    finally:
        foreign.terminate()
        foreign.wait()


def test_capture_truncation_never_returns_success(tmp_path):
    h, request = packet(
        tmp_path,
        completed(),
        script='import sys\nsys.stdin.read()\nsys.stdout.write("x"*100000)\nsys.stdout.flush()\n',
    )
    run = h.capture_run(
        request, output_dir=tmp_path / "run", limits=h.HostLimits(output_bytes=1024)
    )
    assert not run.success
    assert "output_limit" in run.record["failures"]
    assert (
        sum(
            (run.output_dir / name).stat().st_size
            for name in ("raw.stdout", "raw.stderr")
        )
        <= 1024
    )


def test_fixture_success_is_not_live_promotion_and_payload_excludes_oracle(tmp_path):
    h, request = packet(tmp_path, completed())
    run = h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())
    assert run.success
    assert not run.promotion_eligible
    payload = (run.output_dir / "payload.json").read_text()
    assert request.oracle_digest not in payload
    assert "required_events" not in payload
    assert run.record["usage"]["scope"] == "turn"
    assert run.record["price"] == "unavailable"
    with pytest.raises(FileExistsError):
        h.capture_run(request, output_dir=run.output_dir, limits=h.HostLimits())


def test_issuance_rejects_reconstructed_object_and_modified_raw_or_sources(tmp_path):
    from dataclasses import replace

    h, request = packet(tmp_path, completed())
    run = h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())
    assert h.verify_issued_run(run, manifest_digest=run.manifest_digest)
    assert not h.verify_issued_run(replace(run))
    assert not h.verify_issued_run(run, manifest_digest="b" * 64)
    stdout = run.output_dir / "raw.stdout"
    original = stdout.read_bytes()
    stdout.write_bytes(original + b"\n")
    assert not h.verify_issued_run(run)
    stdout.write_bytes(original)
    Path(request.instruction_manifest[0]["path"]).write_text("Changed dependency")
    assert not h.verify_issued_run(run)


@pytest.mark.parametrize(
    "suffix",
    [
        [
            {
                "type": "turn.completed",
                "usage": {
                    "input_tokens": 1,
                    "cached_input_tokens": 0,
                    "output_tokens": 1,
                },
            }
        ],
        [{"type": "thread.started", "thread_id": "foreign-thread"}],
    ],
)
def test_capture_rejects_extra_terminal_or_mixed_thread(tmp_path, suffix):
    h, request = packet(tmp_path, [*completed(), *suffix])
    run = h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())
    assert not run.success
    assert "event_after_terminal" in run.record["failures"]


def test_capture_rejects_nested_oracle_fields_before_launch(tmp_path):
    from dataclasses import replace

    h, request = packet(tmp_path, completed())
    request = replace(
        request,
        prompt_packet={"prompt": "hi", "source_facts": {"required_events": ["secret"]}},
    )
    with pytest.raises(ValueError, match="oracle"):
        h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())


@pytest.mark.parametrize("cancel_signal", ["SIGINT", "SIGTERM"])
def test_capture_retains_evidence_when_cancelled(tmp_path, cancel_signal):
    import signal

    pidfile = tmp_path / "pid"
    fake = tmp_path / "fake.py"
    fake.write_text(
        f'import os,time\nopen({str(pidfile)!r},"w").write(str(os.getpid()))\nprint("partial",flush=True)\ntime.sleep(30)\n'
    )
    driver = tmp_path / "driver.py"
    driver.write_text(
        f"import sys\nfrom pathlib import Path\nsys.path.insert(0,{str(ROOT / 'scripts/runtime')!r})\n"
        "from skill_eval_host import *\n"
        f'r=HostRequest("cancel","baseline",1,{{"prompt":"hi"}},(),"a"*64,"chosen","low",fixture_command=(sys.executable,{str(fake)!r}))\n'
        f"capture_run(r,output_dir=Path({str(tmp_path / 'run')!r}),limits=HostLimits(wall_seconds=10,cleanup_seconds=2))\n"
    )
    owner = subprocess.Popen(
        [sys.executable, str(driver)], stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    try:
        deadline = time.monotonic() + 3
        while not pidfile.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert pidfile.exists()
        owner.send_signal(getattr(signal, cancel_signal))
        owner.communicate(timeout=4)
        record = json.loads((tmp_path / "run" / "run.json").read_text())
        assert not record["success"]
        assert "cancelled" in record["failures"]
        assert (tmp_path / "run" / "raw.stdout").read_bytes() == b"partial\n"
        assert not alive(int(pidfile.read_text()))
    finally:
        if owner.poll() is None:
            owner.kill()
            owner.wait()
        if pidfile.exists() and alive(int(pidfile.read_text())):
            os.kill(int(pidfile.read_text()), signal.SIGKILL)


@pytest.mark.parametrize(
    "event",
    [
        {"type": "item.completed", "item": None},
        {
            "type": "item.completed",
            "item": {"id": "answer", "type": "agent_message", "text": "duplicate"},
        },
        {"type": "unknown.tool.action", "command": "unaccounted"},
        {
            "type": "item.started",
            "thread_id": "foreign",
            "item": {"id": "foreign-item", "type": "agent_message"},
        },
    ],
)
def test_capture_rejects_malformed_duplicate_unaccounted_or_foreign_events(
    tmp_path, event
):
    events = completed()
    h, request = packet(tmp_path, [*events[:-1], event, events[-1]])
    run = h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())
    assert not run.success
    assert run.record["failures"]


def test_explicit_reroute_is_retained_and_rejected_even_with_old_reported_model(
    tmp_path,
):
    events = completed()
    reroute = {"type": "model.rerouted", "from_model": "chosen", "to_model": "fallback"}
    h, request = packet(tmp_path, [*events[:-1], reroute, events[-1]])
    run = h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())
    assert not run.success
    assert run.record["model"]["reroutes"][0]["to_model"] == "fallback"


def test_unisolated_cwd_is_refused_before_child_launch(tmp_path):
    from dataclasses import replace

    marker = tmp_path / "started"
    h, request = packet(
        tmp_path, [], script=f'open({str(marker)!r},"w").write("started")'
    )
    work = tmp_path / "work"
    work.mkdir()
    (work / "candidate-secret.md").write_text("other arm")
    request = replace(request, cwd=work)
    with pytest.raises(ValueError, match="isolat"):
        h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())
    assert not marker.exists()


@pytest.mark.parametrize(
    "event",
    [
        {"type": "item.completed", "item": {"id": "other", "type": "computer_use"}},
        {
            "type": "item.started",
            "item": {
                "id": "command",
                "type": "command_execution",
                "command": "should not run",
            },
        },
    ],
)
def test_capture_rejects_unknown_or_incomplete_tool_lifecycle(tmp_path, event):
    events = completed()
    h, request = packet(tmp_path, [*events[:-1], event, events[-1]])
    run = h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())
    assert not run.success
    assert (
        "disallowed_operation" in run.record["failures"]
        or "unsupported_item" in run.record["failures"]
    )


def test_post_launch_setup_failure_reclaims_owned_processes(tmp_path, monkeypatch):
    h = host()
    pidfile = tmp_path / "pid"
    script = tmp_path / "worker.py"
    script.write_text(
        f'import os,time\nopen({str(pidfile)!r},"w").write(str(os.getpid()))\ntime.sleep(30)\n'
    )
    original = h.os.set_blocking
    count = 0

    def fail_setup(fd, flag):
        nonlocal count
        count += 1
        if count == 1:
            deadline = time.monotonic() + 2
            while not pidfile.exists() and time.monotonic() < deadline:
                time.sleep(0.01)
            raise OSError("injected descriptor setup failure")
        return original(fd, flag)

    monkeypatch.setattr(h.os, "set_blocking", fail_setup)
    try:
        with pytest.raises(OSError) as raised:
            h.run_owned_process(
                [sys.executable, str(script)], b"", wall_seconds=3, cleanup_seconds=2
            )
        assert raised.value.process_evidence["cleanup"]["complete"]
        assert not Path(f"/proc/{int(pidfile.read_text())}").exists()
    finally:
        if pidfile.exists() and alive(int(pidfile.read_text())):
            os.kill(int(pidfile.read_text()), 9)


def test_owner_hard_death_stops_and_reaps_model_descendants(tmp_path):
    import signal

    pidfile = tmp_path / "model"
    worker = tmp_path / "worker.py"
    worker.write_text(
        f'import os,time\nopen({str(pidfile)!r},"w").write(str(os.getpid()))\ntime.sleep(30)\n'
    )
    driver = tmp_path / "driver.py"
    driver.write_text(
        f"import sys\nsys.path.insert(0,{str(ROOT / 'scripts/runtime')!r})\n"
        "from skill_eval_host import run_owned_process\n"
        f'run_owned_process([sys.executable,{str(worker)!r}],b"",wall_seconds=10,cleanup_seconds=2)\n'
    )
    owner = subprocess.Popen(
        [sys.executable, str(driver)], stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    report = None
    try:
        deadline = time.monotonic() + 3
        while not pidfile.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert pidfile.exists()
        model_pid = int(pidfile.read_text())
        supervisor = int(
            Path(f"/proc/{model_pid}/stat").read_text().rsplit(") ", 1)[1].split()[1]
        )
        argv = Path(f"/proc/{supervisor}/cmdline").read_bytes().split(b"\0")
        report = Path(os.fsdecode(argv[2]))
        owner.kill()
        owner.communicate(timeout=4)
        deadline = time.monotonic() + 3
        while (
            Path(f"/proc/{model_pid}").exists() or alive(supervisor)
        ) and time.monotonic() < deadline:
            time.sleep(0.01)
        assert not Path(f"/proc/{model_pid}").exists()
        assert not alive(supervisor)
        assert json.loads(report.read_text())["complete"]
    finally:
        if owner.poll() is None:
            owner.kill()
            owner.wait()
        if pidfile.exists() and alive(int(pidfile.read_text())):
            os.kill(int(pidfile.read_text()), signal.SIGKILL)
        if report is not None:
            report.unlink(missing_ok=True)


def test_capture_setup_error_uses_real_cleanup_evidence(tmp_path, monkeypatch):
    pidfile = tmp_path / "model"
    h, request = packet(
        tmp_path,
        [],
        script=f'import os,time\nopen({str(pidfile)!r},"w").write(str(os.getpid()))\ntime.sleep(30)\n',
    )

    def fail_selector():
        deadline = time.monotonic() + 2
        while not pidfile.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        raise OSError("injected selector initialization failure")

    monkeypatch.setattr(h.selectors, "DefaultSelector", fail_selector)
    run = h.capture_run(
        request,
        output_dir=tmp_path / "run",
        limits=h.HostLimits(wall_seconds=3, cleanup_seconds=2),
    )
    assert not run.success
    assert "supervision_error" in run.record["failures"]
    assert run.record["cleanup"]["complete"]
    assert not Path(f"/proc/{int(pidfile.read_text())}").exists()


@pytest.mark.parametrize("platform_name", ["darwin", "win32"])
def test_bounded_capture_refuses_unsupported_platform_before_process_launch(
    monkeypatch, platform_name
):
    h = host()

    def reject_launch(*args, **kwargs):
        raise AssertionError("unsupported capture attempted a process launch")

    monkeypatch.setattr(h.sys, "platform", platform_name)
    monkeypatch.setattr(h.subprocess, "Popen", reject_launch)
    with pytest.raises(ValueError, match="Linux"):
        h.run_owned_process([sys.executable, "-c", 'print("no launch")'], b"")


def test_issued_run_rechecks_actual_process_helper_bytes(tmp_path, monkeypatch):
    import shutil

    h, request = packet(tmp_path, completed())
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    for name in (
        "skill_eval_host.py",
        "skill_eval_process.py",
        "skill_eval_app_server.py",
    ):
        shutil.copyfile(ROOT / "scripts/runtime" / name, runtime / name)
    monkeypatch.setattr(h, "__file__", str(runtime / "skill_eval_host.py"))
    run = h.capture_run(request, output_dir=tmp_path / "run", limits=h.HostLimits())
    assert h.verify_issued_run(run)
    helper = runtime / "skill_eval_process.py"
    helper.write_bytes(helper.read_bytes() + b"\n# changed after capture\n")
    assert not h.verify_issued_run(run)
