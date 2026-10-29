"""Exercise managed runtime behavior and real owned processes in the normal Python lane."""

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
# Disposable test supervisor reaps orphaned descendants on Linux containers
# whose PID 1 does not; never install this into a client home or alter assertions.
REAPER = r"""
import ctypes, os, subprocess, sys, time
if sys.platform.startswith('linux'):
    if ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), 'test subreaper unavailable')
child = subprocess.Popen(sys.argv[1:])
while True:
    status = child.poll()
    if sys.platform.startswith('linux'):
        while True:
            try:
                event = os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOHANG | os.WNOWAIT)
            except ChildProcessError:
                break
            if event is None or event.si_pid == child.pid:
                break
            os.waitpid(event.si_pid, 0)
    if status is not None:
        raise SystemExit(status)
    time.sleep(0.02)
"""


def test_managed_game_resources():
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            REAPER,
            "node",
            "--test",
            "tests/runtime/game-test-session.test.mjs",
            "tests/runtime/game-test-browser.test.mjs",
            "tests/runtime/game-test-memory.test.mjs",
            "tests/runtime/game-test-process.test.mjs",
            "tests/runtime/game-test-simulator.test.mjs",
            "tests/runtime/game-test-admission.test.mjs",
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=100,
    )
    print(result.stdout)
    assert result.returncode == 0, result.stdout
