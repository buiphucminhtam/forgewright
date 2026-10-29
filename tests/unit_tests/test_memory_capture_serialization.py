"""Real capture peers preserve receipt ordering without extending SQLite waits."""

import json
import os
from pathlib import Path
import selectors
import sqlite3
import subprocess
import sys
import threading

import pytest

MEMORY = Path(__file__).resolve().parents[2] / "scripts/memory"
PROGRAM = """
import json,sys
sys.path.insert(0,sys.argv[1])
import memory_flow as flow
if sys.argv[4]=='barrier':
    print('capture-ready',flush=True)
    sys.stdin.readline()
if sys.argv[4]=='paused':
    original=flow.continuity.write_checkpoint
    def paused(*args,**kwargs):
        print('checkpoint-entered',flush=True)
        sys.stdin.readline()
        return original(*args,**kwargs)
    flow.continuity.write_checkpoint=paused
print(json.dumps(flow.capture({'kind':'decision','summary':sys.argv[3]},'shared-chat',sys.argv[2])),flush=True)
"""


def start(workspace, event, summary="shared decision", paused=False, barrier=False):
    return subprocess.Popen(
        [
            sys.executable,
            "-c",
            PROGRAM,
            str(MEMORY),
            event,
            summary,
            "paused" if paused else "barrier" if barrier else "normal",
        ],
        cwd=workspace,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(workspace)},
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def entered(child):
    with selectors.DefaultSelector() as selector:
        selector.register(child.stdout, selectors.EVENT_READ)
        assert selector.select(10), "capture did not reach its checkpoint"
    assert child.stdout.readline().strip() == "checkpoint-entered"


def stop(children):
    for child in children:
        if child.poll() is None:
            child.kill()
        child.wait(timeout=10)


@pytest.mark.parametrize(
    "same_event,conflict", [(False, False), (True, False), (True, True)]
)
def test_capture_peer_waits_for_checkpoint_without_losing_dedupe(
    tmp_path, same_event, conflict
):
    first = start(tmp_path, "first", paused=True)
    children = [first]
    timer = None
    try:
        entered(first)
        second = start(
            tmp_path,
            "first" if same_event else "second",
            summary="different decision"
            if conflict or not same_event
            else "shared decision",
        )
        children.append(second)
        # Deliberately exceed SQLite's unchanged 0.5s wait. A peer must queue
        # before the transaction instead of failing during checkpoint I/O.
        timer = threading.Timer(
            0.9, lambda: (first.stdin.write("continue\n"), first.stdin.flush())
        )
        timer.start()
        output, error = second.communicate(timeout=10)
        timer.join()
        first_output, first_error = first.communicate(timeout=10)
        assert first.returncode == 0, first_error
        assert json.loads(first_output)["status"] == "captured"
        if conflict:
            assert second.returncode != 0 and "event_payload_conflict" in error, error
        else:
            assert second.returncode == 0, error
            assert json.loads(output)["status"] == (
                "duplicate" if same_event else "captured"
            )
        with sqlite3.connect(tmp_path / ".forgewright/memory.db") as conn:
            expected = 1 if same_event else 2
            assert (
                conn.execute("SELECT count(*) FROM capture_events").fetchone()[0]
                == expected
            )
            assert (
                conn.execute("SELECT count(*) FROM observations").fetchone()[0]
                == expected
            )
            assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
    finally:
        if timer:
            timer.cancel()
            timer.join()
        stop(children)


def test_killed_capture_releases_peer_lock_and_rolls_back_database(tmp_path):
    first = start(tmp_path, "killed", paused=True)
    children = [first]
    try:
        entered(first)
        first.kill()
        first.wait(timeout=10)
        with sqlite3.connect(tmp_path / ".forgewright/memory.db") as conn:
            assert (
                conn.execute("SELECT count(*) FROM capture_events").fetchone()[0] == 0
            )
            assert conn.execute("SELECT count(*) FROM observations").fetchone()[0] == 0
        second = start(tmp_path, "survivor")
        children.append(second)
        output, error = second.communicate(timeout=10)
        assert second.returncode == 0, error
        receipt = json.loads(output)
        checkpoint = json.loads((tmp_path / receipt["checkpoint_ref"]).read_text())
        assert checkpoint["sequence"] == 1
        assert checkpoint["ledger"]["previous_checkpoint_hash"] == ""
    finally:
        stop(children)


def test_manual_sqlite_writer_keeps_transaction_authority(tmp_path):
    first = start(tmp_path, "setup")
    children = [first]
    manual = None
    try:
        _, error = first.communicate(timeout=10)
        assert first.returncode == 0, error
        manual = sqlite3.connect(tmp_path / ".forgewright/memory.db")
        manual.execute("BEGIN IMMEDIATE")
        second = start(tmp_path, "blocked")
        children.append(second)
        _, error = second.communicate(timeout=10)
        assert second.returncode != 0 and "database is locked" in error, error
        manual.rollback()
        third = start(tmp_path, "blocked")
        children.append(third)
        output, error = third.communicate(timeout=10)
        assert third.returncode == 0, error
        assert json.loads(output)["status"] == "captured"
        assert manual.execute("SELECT count(*) FROM capture_events").fetchone()[0] == 2
        assert manual.execute("PRAGMA quick_check").fetchone()[0] == "ok"
    finally:
        if manual:
            manual.close()
        stop(children)


def test_native_hook_timeout_allows_work_while_capture_peer_holds_lock(tmp_path):
    first = start(tmp_path, "paused", paused=True)
    try:
        entered(first)
        payload = {
            "cwd": str(tmp_path),
            "hook_event_name": "Stop",
            "session_id": "native-peer",
            "turn_id": "native-peer-turn",
            "last_assistant_message": '```forgewright-memory\n{"kind":"decision","summary":"queued native memory"}\n```',
        }
        result = subprocess.run(
            [
                sys.executable,
                str(MEMORY / "native_hook.py"),
                "--workspace",
                str(tmp_path),
            ],
            env={**os.environ, "FORGEWRIGHT_MEMORY_CAPTURE": "1"},
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            timeout=5,
        )
        assert result.returncode == 0, result.stderr
        assert json.loads(result.stdout) == {"continue": True}
        assert first.poll() is None
        with sqlite3.connect(tmp_path / ".forgewright/memory.db") as conn:
            assert (
                conn.execute("SELECT count(*) FROM capture_events").fetchone()[0] == 0
            )
    finally:
        stop([first])


def test_capture_refuses_symlink_writer_lock(tmp_path):
    first = start(tmp_path, "setup")
    children = [first]
    try:
        _, error = first.communicate(timeout=10)
        assert first.returncode == 0, error
        target = tmp_path / "foreign"
        target.write_text("preserve")
        lock = tmp_path / ".forgewright/runtime/memory-capture/.writer.lock"
        lock.parent.mkdir(parents=True, exist_ok=True)
        lock.unlink(missing_ok=True)
        lock.symlink_to(target)
        second = start(tmp_path, "unsafe")
        children.append(second)
        _, error = second.communicate(timeout=10)
        assert second.returncode != 0 and "checkpoint_lock_unsafe" in error, error
        assert target.read_text() == "preserve"
        with sqlite3.connect(tmp_path / ".forgewright/memory.db") as conn:
            assert (
                conn.execute("SELECT count(*) FROM capture_events").fetchone()[0] == 1
            )
    finally:
        stop(children)


def test_fresh_capture_peers_initialize_one_database(tmp_path):
    children = [start(tmp_path, f"fresh-{i}", barrier=True) for i in range(8)]
    try:
        for child in children:
            with selectors.DefaultSelector() as selector:
                selector.register(child.stdout, selectors.EVENT_READ)
                assert selector.select(10), "capture peer did not start"
            assert child.stdout.readline().strip() == "capture-ready"
        assert not (tmp_path / ".forgewright/memory.db").exists()
        for child in children:
            child.stdin.write("start\n")
            child.stdin.flush()
        for child in children:
            output, error = child.communicate(timeout=15)
            assert child.returncode == 0, error
            assert json.loads(output)["status"] == "captured"
        with sqlite3.connect(tmp_path / ".forgewright/memory.db") as conn:
            assert (
                conn.execute("SELECT count(*) FROM capture_events").fetchone()[0] == 8
            )
            assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
    finally:
        stop(children)
