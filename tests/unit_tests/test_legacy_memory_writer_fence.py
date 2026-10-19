"""A selected legacy DB is fenced; unrelated legacy CLI behavior is preserved."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import pytest

ROOT = Path(__file__).resolve().parents[2]
ENTRY = ROOT / "scripts/memory/legacy_writer_fence.py"


def fixture(tmp_path):
    legacy = tmp_path / "legacy.py"
    legacy.write_text(
        'import sys;from pathlib import Path;Path("effect").write_text(repr(sys.argv[1:]));print("legacy")\n'
    )
    legacy.chmod(0o600)
    project = tmp_path / "project"
    project.mkdir()
    policy = tmp_path / "fences.json"
    policy.write_text(
        json.dumps(
            {
                "schema": "forgewright-legacy-writer-fences/v1",
                "databases": [str(project / ".forgewright/memory.db")],
            }
        )
    )
    policy.chmod(0o600)
    return legacy, project, policy


def invoke(legacy, project, policy, *args):
    return subprocess.run(
        [
            sys.executable,
            str(ENTRY),
            "--policy",
            str(policy),
            "--legacy",
            str(legacy),
            "--legacy-sha256",
            hashlib.sha256(legacy.read_bytes()).hexdigest(),
            "--",
            *args,
        ],
        cwd=project,
        capture_output=True,
        text=True,
        timeout=3,
    )


def test_fenced_physical_database_cannot_execute_legacy_writer(tmp_path):
    legacy, project, policy = fixture(tmp_path)
    result = invoke(legacy, project, policy, "add", "not persisted")
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["status"] == "legacy-writer-fenced"
    assert not (project / "effect").exists()


def test_unrelated_project_preserves_exact_legacy_arguments(tmp_path):
    legacy, project, policy = fixture(tmp_path)
    other = tmp_path / "other"
    other.mkdir()
    result = invoke(legacy, other, policy, "add", "quoted ';$(false) text")
    assert result.returncode == 0 and result.stdout.strip() == "legacy"
    assert (other / "effect").read_text() == repr(["add", "quoted ';$(false) text"])
    assert not (project / "effect").exists()


def test_bad_policy_or_changed_legacy_never_runs(tmp_path):
    legacy, project, policy = fixture(tmp_path)
    policy.write_text("{broken")
    result = invoke(legacy, project, policy, "add", "bad")
    assert result.returncode != 0 and not (project / "effect").exists()
    policy.unlink()
    policy.symlink_to(legacy)
    result = invoke(legacy, project, policy, "add", "bad")
    assert result.returncode != 0 and not (project / "effect").exists()


def test_unrelated_legacy_write_then_error_keeps_original_failure_semantics(tmp_path):
    legacy, project, policy = fixture(tmp_path)
    other = tmp_path / "other"
    other.mkdir()
    legacy.write_text(
        'from pathlib import Path;Path("effect").write_text("committed");raise RuntimeError("fixture-after-write")\n'
    )
    result = invoke(legacy, other, policy, "add", "value")
    assert (other / "effect").read_text() == "committed"
    assert result.returncode == 1 and "fixture-after-write" in result.stderr
    assert "mutated" not in result.stdout


def test_legacy_shell_preserves_helper_directory_exit_and_environment(tmp_path):
    import os

    legacy, project, policy = fixture(tmp_path)
    other = tmp_path / "other"
    other.mkdir()
    legacy.write_text(
        'test "$FENCE_TEST_ENV" = fixture || exit 9\nprintf "%s" "$1" > effect\nexit 7\n'
    )
    command = [
        sys.executable,
        str(ENTRY),
        "--policy",
        str(policy),
        "--legacy",
        str(legacy),
        "--legacy-sha256",
        hashlib.sha256(legacy.read_bytes()).hexdigest(),
        "--legacy-kind",
        "bash",
        "--",
        "quoted ;$(false) text",
    ]
    result = subprocess.run(
        command,
        cwd=other,
        env={**os.environ, "FENCE_TEST_ENV": "fixture"},
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert (
        result.returncode == 7
        and (other / "effect").read_text() == "quoted ;$(false) text"
    )


def test_legacy_shell_holds_writer_fence_lock_through_exec(tmp_path):
    import fcntl
    import os
    import time

    legacy, project, policy = fixture(tmp_path)
    other = tmp_path / "other"
    other.mkdir()
    legacy.write_text("printf started > started\nsleep 0.4\n")
    command = [
        sys.executable,
        str(ENTRY),
        "--policy",
        str(policy),
        "--legacy",
        str(legacy),
        "--legacy-sha256",
        hashlib.sha256(legacy.read_bytes()).hexdigest(),
        "--legacy-kind",
        "bash",
        "--",
    ]
    child = subprocess.Popen(
        command, cwd=other, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    try:
        deadline = time.monotonic() + 2
        while not (other / "started").exists():
            assert child.poll() is None
            assert time.monotonic() < deadline
            time.sleep(0.01)
        fd = os.open(str(policy) + ".lock", os.O_RDWR)
        try:
            with pytest.raises(BlockingIOError):
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            assert child.wait(timeout=2) == 0
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        finally:
            os.close(fd)
    finally:
        if child.poll() is None:
            child.terminate()
        child.communicate(timeout=2)


def test_shell_keeps_original_adjacent_helper_resolution(tmp_path):
    legacy, project, policy = fixture(tmp_path)
    other = tmp_path / "other"
    other.mkdir()
    (legacy.parent / "adjacent-helper").write_text("expected helper")
    legacy.write_text('cat "$(dirname "${BASH_SOURCE[0]}")/adjacent-helper" > effect\n')
    result = subprocess.run(
        [
            sys.executable,
            str(ENTRY),
            "--policy",
            str(policy),
            "--legacy",
            str(legacy),
            "--legacy-sha256",
            hashlib.sha256(legacy.read_bytes()).hexdigest(),
            "--legacy-kind",
            "bash",
            "--",
        ],
        cwd=other,
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert (
        result.returncode == 0 and (other / "effect").read_text() == "expected helper"
    )


@pytest.mark.parametrize("selected", [True, False])
def test_generated_shell_wrapper_can_be_sourced_without_replacing_caller(
    tmp_path, selected
):
    import importlib.util

    spec = importlib.util.spec_from_file_location("fence_builder", ENTRY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    legacy, project, policy = fixture(tmp_path)
    legacy.write_text(
        'LEGACY_VALUE=kept\nlegacy_function() { printf legacy; }\nprintf "%s" "$1" > sourced-effect\n'
    )
    other = tmp_path / "other"
    other.mkdir()
    wrapper = tmp_path / "wrapper.sh"
    wrapper.write_text(
        module.build_shell_wrapper(
            ENTRY,
            hashlib.sha256(ENTRY.read_bytes()).hexdigest(),
            policy,
            legacy,
            hashlib.sha256(legacy.read_bytes()).hexdigest(),
            sys.executable,
        )
    )
    script = 'source "$1" argument; printf caller-alive; '
    if not selected:
        script += 'test "$LEGACY_VALUE" = kept && legacy_function'
    result = subprocess.run(
        ["/bin/bash", "-c", script, "fixture", str(wrapper)],
        cwd=project if selected else other,
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout == ("caller-alive" if selected else "caller-alivelegacy")
    assert not (project / "sourced-effect").exists()
    if not selected:
        assert (other / "sourced-effect").read_text() == "argument"


def test_generated_shell_hook_is_silent_and_effect_free_when_fenced(tmp_path):
    import importlib.util

    spec = importlib.util.spec_from_file_location("fence_builder_quiet", ENTRY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    legacy, project, policy = fixture(tmp_path)
    legacy.write_text("printf bad > automatic-effect\n")
    wrapper = tmp_path / "wrapper.sh"
    wrapper.write_text(
        module.build_shell_wrapper(
            ENTRY,
            hashlib.sha256(ENTRY.read_bytes()).hexdigest(),
            policy,
            legacy,
            hashlib.sha256(legacy.read_bytes()).hexdigest(),
            sys.executable,
        )
    )
    result = subprocess.run(
        ["/bin/bash", str(wrapper), "checkpoint"],
        cwd=project,
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert result.returncode == 0 and result.stdout == "" and result.stderr == ""
    assert not (project / "automatic-effect").exists()
