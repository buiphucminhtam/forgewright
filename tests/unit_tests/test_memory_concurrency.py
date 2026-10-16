"""Bounded real-process contention and crash recovery for memory receipts."""

import os
from pathlib import Path
import sqlite3
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
MEMORY = ROOT / "scripts/memory"


def test_eight_writers_acknowledge_200_unique_events_without_loss(tmp_path):
    env = {**os.environ, "FORGEWRIGHT_WORKSPACE": str(tmp_path)}
    setup = subprocess.run(
        [sys.executable, str(MEMORY / "mem0-v2.py"), "setup"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert setup.returncode == 0, setup.stderr
    program = """
import sys,time
sys.path.insert(0,sys.argv[1])
from memory_flow import capture
worker=sys.argv[2]
for number in range(25):
    for attempt in range(8):
        try:
            result=capture({'kind':'decision','summary':f'worker {worker} event {number}'}, f'chat-{worker}', f'event-{number}')
            assert result['status']=='captured', result
            break
        except __import__('sqlite3').OperationalError:
            if attempt==7: raise
            time.sleep(.02)
print('acknowledged:25')
"""
    children = [
        subprocess.Popen(
            [sys.executable, "-c", program, str(MEMORY), str(worker)],
            cwd=tmp_path,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for worker in range(8)
    ]
    try:
        for child in children:
            stdout, stderr = child.communicate(timeout=45)
            assert child.returncode == 0, stderr
            assert stdout.strip() == "acknowledged:25"
    finally:
        for child in children:
            if child.poll() is None:
                child.kill()
                child.wait()
    with sqlite3.connect(tmp_path / ".forgewright/memory.db") as conn:
        assert conn.execute("SELECT count(*) FROM capture_events").fetchone()[0] == 200
        assert (
            conn.execute(
                "SELECT count(*) FROM observations WHERE archived=0"
            ).fetchone()[0]
            == 200
        )
        assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"


def test_killed_writer_rolls_back_content_and_index(tmp_path):
    path = tmp_path / "memory.db"
    program = """
import sys
sys.path.insert(0,sys.argv[1])
from memory_flow import memory_module
db=memory_module().MemoryDB(sys.argv[2])
c=db.get_connection(); c.execute('BEGIN IMMEDIATE')
db.add('uncommitted-crash-marker',_connection=c)
print('transaction-open',flush=True)
sys.stdin.read()
"""
    child = subprocess.Popen(
        [sys.executable, "-c", program, str(MEMORY), str(path)],
        cwd=tmp_path,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(tmp_path)},
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        assert child.stdout.readline().strip() == "transaction-open"
        child.kill()
        child.wait(timeout=10)
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM observations").fetchone()[0] == 0
        assert (
            conn.execute(
                "SELECT count(*) FROM observations_fts WHERE observations_fts MATCH 'marker'"
            ).fetchone()[0]
            == 0
        )
        assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
