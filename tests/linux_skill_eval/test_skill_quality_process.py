"""Real owned-process cleanup requires the explicit Linux integration lane."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "forgewright_portable_quality_test_helpers",
    ROOT / "tests/unit_tests/test_skill_quality.py",
)
assert _spec is not None and _spec.loader is not None
_portable = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_portable)
module = _portable.module
scenario = _portable.scenario


def _process_alive(pid):
    try:
        return Path(f"/proc/{pid}/stat").read_text().split(") ")[1][0] != "Z"
    except FileNotFoundError:
        return False


@pytest.mark.parametrize("exit_mode", ["timeout", "invalid", "abrupt"])
def test_runner_outer_timeout_reaps_adapter_and_owned_descendants(tmp_path, exit_mode):
    import os
    import signal

    child_pid = tmp_path / "owned-child"
    adapter = tmp_path / "adapter.py"
    suffix = {
        "timeout": "time.sleep(30)",
        "invalid": 'print("bad json", flush=True)',
        "abrupt": "os._exit(9)",
    }[exit_mode]
    adapter.write_text(
        "import subprocess,sys,time,os\nsys.stdin.read()\n"
        'p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"])\n'
        f'open({str(child_pid)!r},"w").write(str(p.pid))\n{suffix}\n'
    )
    try:
        m = module()
        with pytest.raises((m.SkillQualityError, subprocess.TimeoutExpired)) as raised:
            m.invoke_runner(
                [sys.executable, str(adapter)],
                scenario("owned"),
                variant="current",
                skill_path=None,
                timeout_seconds=0.4,
            )
        assert raised.value.process_evidence["cleanup"]["complete"]
        assert not Path(f"/proc/{int(child_pid.read_text())}").exists()
    finally:
        if child_pid.exists() and _process_alive(int(child_pid.read_text())):
            os.kill(int(child_pid.read_text()), signal.SIGKILL)


def test_runner_cancellation_preserves_foreign_process(tmp_path):
    import os
    import signal
    import time

    child_pid = tmp_path / "child"
    adapter_pid = tmp_path / "adapter"
    adapter = tmp_path / "adapter.py"
    adapter.write_text(
        "import subprocess,sys,time,os\nsys.stdin.read()\n"
        'p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"])\n'
        f'open({str(child_pid)!r},"w").write(str(p.pid))\n'
        f'open({str(adapter_pid)!r},"w").write(str(os.getpid()))\ntime.sleep(30)\n'
    )
    driver = tmp_path / "driver.py"
    driver.write_text(
        f"import sys\nsys.path.insert(0,{str(ROOT / 'scripts/runtime')!r})\n"
        "import skill_quality as q\n"
        f'q.invoke_runner([sys.executable,{str(adapter)!r}],{scenario("cancel")!r},variant="current",skill_path=None,timeout_seconds=5)\n'
    )
    foreign = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(30)"])
    owner = subprocess.Popen(
        [sys.executable, str(driver)], stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    try:
        deadline = time.monotonic() + 3
        while not adapter_pid.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert adapter_pid.exists()
        owner.send_signal(signal.SIGINT)
        owner.communicate(timeout=4)
        assert not Path(f"/proc/{int(adapter_pid.read_text())}").exists()
        assert not Path(f"/proc/{int(child_pid.read_text())}").exists()
        assert foreign.poll() is None
    finally:
        for file in (child_pid, adapter_pid):
            if file.exists() and _process_alive(int(file.read_text())):
                os.kill(int(file.read_text()), signal.SIGKILL)
        if owner.poll() is None:
            owner.kill()
            owner.wait()
        foreign.terminate()
        foreign.wait()
