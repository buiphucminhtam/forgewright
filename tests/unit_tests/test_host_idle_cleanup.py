"""One tiny owned broker, real local IPC and idle exit. No model or stress load."""

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/runtime"))
from host_resources import inspect_process  # noqa: E402


def test_owned_broker_cancellation_and_idle_exit():
    # Darwin AF_UNIX path limit is shorter than pytest's default temp path.
    temporary = tempfile.TemporaryDirectory(prefix="fw-idle-", dir="/tmp")
    tmp_path = Path(temporary.name)
    home = tmp_path / "admission"
    project = tmp_path / "project"
    project.mkdir()
    process = subprocess.Popen(
        [
            sys.executable,
            str(ROOT / "scripts/runtime/host_admission_broker.py"),
            "--home",
            str(home),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    sock = home / "broker.sock"

    def call(action, **fields):
        with socket.socket(socket.AF_UNIX) as connection:
            connection.settimeout(3)
            connection.connect(str(sock))
            connection.sendall(
                (
                    json.dumps(
                        {
                            "schema": "forgewright-host-admission/v1",
                            "action": action,
                            **fields,
                        }
                    )
                    + "\n"
                ).encode()
            )
            with connection.makefile("r") as response:
                reply = json.loads(response.readline())
        assert reply["ok"], reply
        return reply["data"]

    try:
        deadline = time.monotonic() + 5
        while (
            not sock.exists() and process.poll() is None and time.monotonic() < deadline
        ):
            time.sleep(0.05)
        assert sock.exists(), process.communicate(timeout=2)
        assert call("ping")["alive"]
        owner = {
            "job_id": "owned-smoke",
            "token": "smoke-" + "x" * 40,
            "owner_pid": os.getpid(),
        }
        lease = call(
            "enqueue", **owner, project_root=str(project), run_id="smoke", memory_mib=64
        )
        assert lease["state"] in {"active", "queued"}
        assert call("release", **owner, quiescent=True)["state"] == "released"
        status = call("status")
        assert (
            status["active_workers"] == status["active_heavy"] == status["queued"] == 0
        )
        # The broker owns no user application. Idle exit must be voluntary.
        assert process.wait(timeout=18) == 0
        assert inspect_process(process.pid) is None
        assert not sock.exists()
        assert not (home / "broker.pid").exists()
        receipt = json.loads((home / "last-exit.json").read_text())
        assert receipt["pid"] == process.pid
        assert receipt["reason"] == "idle-exit"
        assert receipt["cpuSeconds"] < 2
        print(
            json.dumps(
                {
                    "broker_pid": process.pid,
                    "process_state": "reclaimed",
                    "initial_lease": lease["state"],
                    "cpu_seconds": receipt["cpuSeconds"],
                }
            )
        )
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=3)
        temporary.cleanup()
