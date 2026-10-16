"""Reject false-green memory verification and unwanted initialization."""

import contextlib
import io
import os
from pathlib import Path
import re
import runpy
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "scripts/memory/mem0-v2.py"


@pytest.mark.parametrize(
    "failure",
    ["child-exit", "zero-tests", "malformed", "failed-unittest", "all-skipped"],
)
def test_legacy_runner_rejects_failed_or_unexecuted_children(monkeypatch, failure):
    real_run = subprocess.run

    def child(argv, **_kwargs):
        if argv[0] == "git":
            return real_run(argv, **_kwargs)
        python = argv[0] == "python3"
        output = "Ran 2 tests\n\nOK\n" if python else "Results: 2/2 passed\n"
        code = 0
        if python:
            if failure == "child-exit":
                code = 7
            elif failure == "zero-tests":
                output = "Ran 0 tests\n\nOK\n"
            elif failure == "malformed":
                output = "usage only; no tests ran\n"
            elif failure == "all-skipped":
                output = "Ran 2 tests\n\nOK (skipped=2)\n"
            else:
                output = "Ran 2 tests\n\nFAILED (failures=1)\n"
        return subprocess.CompletedProcess(argv, code, output, "")

    monkeypatch.setattr(subprocess, "run", child)
    with (
        contextlib.redirect_stdout(io.StringIO()),
        pytest.raises(SystemExit) as exit_info,
    ):
        runpy.run_path(
            str(ROOT / "tests/memory-system/run_tests.py"), run_name="__main__"
        )
    assert exit_info.value.code != 0


def test_memory_suite_children_never_mutate_live_workspace(monkeypatch):
    real_run = subprocess.run
    locations = []
    monkeypatch.setenv("MEM0_DB_PATH", "/external/never-owned.db")
    monkeypatch.setenv("MEMORY_DB_DIR", "/external/never-owned-state")
    monkeypatch.setenv("FORGEWRIGHT_SESSION_LOG", "/external/never-owned-log.json")

    def child(argv, **kwargs):
        if argv[0] == "git":
            return real_run(argv, **kwargs)
        locations.append(Path(kwargs["cwd"]))
        for key in ("MEM0_DB_PATH", "MEMORY_DB_DIR", "FORGEWRIGHT_SESSION_LOG"):
            assert key not in kwargs["env"]
        return subprocess.CompletedProcess(
            argv,
            0,
            "Ran 2 tests\n\nOK\n" if argv[0] == "python3" else "Results: 2/2 passed\n",
            "",
        )

    monkeypatch.setattr(subprocess, "run", child)
    with contextlib.redirect_stdout(io.StringIO()), pytest.raises(SystemExit) as result:
        runpy.run_path(
            str(ROOT / "tests/memory-system/run_tests.py"), run_name="__main__"
        )
    assert result.value.code == 0
    assert locations and all(path != ROOT for path in locations)


def test_legacy_unittest_entry_executes_real_cases(tmp_path):
    result = subprocess.run(
        ["python3", str(ROOT / "tests/memory-system/test_mem0_v2.py")],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    match = re.search(r"Ran (\d+) tests", result.stdout + result.stderr)
    assert match and int(match[1]) > 0, "CLI shim exited before unittest executed"


@pytest.mark.parametrize("entry", ["cli", "ensure"])
def test_disabled_memory_never_initializes_database(tmp_path, entry):
    env = {
        **os.environ,
        "MEM0_DISABLED": "true",
        "FORGEWRIGHT_WORKSPACE": str(tmp_path),
    }
    argv = (
        ["python3", str(CORE), "setup"]
        if entry == "cli"
        else ["bash", str(ROOT / "scripts/memory/ensure-mem0.sh"), str(tmp_path)]
    )
    result = subprocess.run(
        argv, cwd=tmp_path, env=env, capture_output=True, text=True, timeout=15
    )
    assert result.returncode == 0, result.stderr
    assert not (tmp_path / ".forgewright/memory.db").exists()
    assert "Overriding" not in result.stderr


def test_doctor_reports_absence_without_creating_state(tmp_path):
    import json

    result = subprocess.run(
        ["python3", str(CORE), "doctor", "--json"],
        cwd=tmp_path,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(tmp_path)},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
    status = json.loads(result.stdout)
    assert status["storage"]["status"] == "not-configured"
    assert status["capture"]["status"] != "active"
    assert status["injection"]["status"] != "active"
    assert not (tmp_path / ".forgewright").exists()


@pytest.mark.parametrize(
    "args",
    [["search", "absent"], ["index", "absent"], ["get", "1"], ["list"], ["stats"]],
)
def test_read_commands_do_not_initialize_missing_store(tmp_path, args):
    result = subprocess.run(
        ["python3", str(CORE), *args],
        cwd=tmp_path,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(tmp_path)},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
    assert not (tmp_path / ".forgewright/memory.db").exists()


def test_ensure_does_not_declare_legacy_schema_ready(tmp_path):
    import sqlite3

    path = tmp_path / ".forgewright/memory.db"
    path.parent.mkdir()
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE old_data(id INTEGER)")
    before = path.read_bytes()
    result = subprocess.run(
        ["bash", str(ROOT / "scripts/memory/ensure-mem0.sh"), str(tmp_path)],
        cwd=tmp_path,
        env={**os.environ, "FORGEWRIGHT_WORKSPACE": str(tmp_path)},
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode != 0
    assert path.read_bytes() == before
