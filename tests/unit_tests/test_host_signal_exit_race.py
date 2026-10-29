"""Reconcile Darwin's exited-group EPERM without clearing real uncertainty."""

import errno
from pathlib import Path
import sys
import threading
import time
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
import host_job_runner as runner


@pytest.mark.parametrize(
    "case",
    [
        "exited",
        "leader-alive",
        "descendant-alive",
        "census-unknown",
        "pid-reused",
        "prior-escape",
        "different-errno",
        "other-platform",
    ],
)
def test_signal_permission_error_requires_reaped_leader_and_fresh_safe_census(
    monkeypatch, case
):
    root = 12345
    parent = {99: (1, 99, "parent-birth")}
    live = {**parent, root: (99, root, "root-birth")}
    initial = dict(live)
    before_signal = dict(live)
    after_signal = dict(parent)
    if case == "descendant-alive":
        initial[23456] = before_signal[23456] = (root, root, "child-birth")
        after_signal[23456] = (1, root, "child-birth")
    elif case == "census-unknown":
        after_signal = {}
    elif case == "pid-reused":
        after_signal[root] = (99, root, "different-birth")
    elif case == "prior-escape":
        initial[23456] = (root, root, "child-birth")
        before_signal[23456] = after_signal[23456] = (1, 23456, "child-birth")
    tables = iter([initial, before_signal, after_signal])
    monkeypatch.setattr(runner, "process_table", lambda: next(tables, dict(parent)))
    monkeypatch.setattr(
        runner,
        "sys",
        SimpleNamespace(platform="linux" if case == "other-platform" else "darwin"),
        raising=False,
    )
    polls = []

    def poll():
        polls.append(1)
        if len(polls) == 1 or (case == "leader-alive" and len(polls) == 2):
            return None
        return 0

    process = SimpleNamespace(pid=root, poll=poll)
    signals = []

    def denied(pgid, signum):
        signals.append((pgid, signum))
        assert pgid == root
        number = errno.EACCES if case == "different-errno" else errno.EPERM
        raise PermissionError(number, "signal denied")

    monkeypatch.setattr(runner.os, "killpg", denied)
    cancel = threading.Event()
    cancel.set()
    quiescent, stopped = runner.supervise(
        process, cancel, time.monotonic() + 3, lambda: True
    )
    assert signals
    assert stopped is True
    assert quiescent is (case == "exited")
    if case == "exited":
        assert len(signals) == 1
        assert process._forgewright_supervision_diagnostics["census_complete"] is True
    elif case == "census-unknown":
        assert process._forgewright_supervision_diagnostics["census_complete"] is False
