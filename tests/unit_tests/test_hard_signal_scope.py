"""Real Git regressions for runtime-state exclusions at the evidence boundary."""

from pathlib import Path
import os
import subprocess
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/lite"))
from evidence_common import changed_files, hard_signal  # noqa: E402


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


@pytest.fixture
def repository(tmp_path: Path) -> Path:
    git(tmp_path, "init", "-b", "main")
    git(tmp_path, "config", "user.email", "fixture@example.invalid")
    git(tmp_path, "config", "user.name", "Fixture")
    git(tmp_path, "config", "commit.gpgsign", "false")
    git(tmp_path, "config", "core.hooksPath", str(tmp_path / "no-hooks"))
    return tmp_path


def commit_file(root: Path, name: str, content: str) -> Path:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    git(root, "add", "--", name)
    git(root, "commit", "-qm", "fixture baseline")
    return path


@pytest.mark.parametrize("staged", [False, True])
@pytest.mark.parametrize("explicit", [False, True])
@pytest.mark.parametrize(
    "name",
    [
        ".forgewright/rule-ledger.jsonl",
        ".forgewright/telemetry/receipt-errors.jsonl",
        ".forgewright/runtime/purchase/check.log",
    ],
)
def test_runtime_only_diff_does_not_escalate(repository, staged, explicit, name):
    path = commit_file(repository, name, "neutral\n")
    path.write_text("UNVERIFIED: bundle hash mismatch for pytest_receipts.py\n")
    if staged:
        git(repository, "add", "--", name)
    assert changed_files(repository) == []
    assert not hard_signal(repository, [name] if explicit else [])


@pytest.mark.parametrize("mode", ["staged", "unstaged", "deleted", "renamed"])
def test_real_payment_diff_remains_hard(repository, mode):
    path = commit_file(repository, "src/logic.py", "validate_payment = True\n")
    if mode == "renamed":
        git(repository, "mv", "src/logic.py", "src/moved.py")
    elif mode == "deleted":
        path.unlink()
    else:
        path.write_text("validation = False\n")
        if mode == "staged":
            git(repository, "add", "--", "src/logic.py")
    # Even an incomplete caller-supplied list must not hide a real Git change.
    assert hard_signal(repository, [])


@pytest.mark.parametrize("name", ["src/new.py", ".forgewright/settings.env"])
def test_untracked_source_and_project_config_remain_covered(repository, name):
    commit_file(repository, "README.md", "baseline\n")
    path = repository / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("subscription_enabled = True\n")
    assert hard_signal(repository, changed_files(repository))


@pytest.mark.parametrize(
    "name",
    [
        "src/space name.py",
        "src/[literal].py",
        "src/new\nline.py" if os.name != "nt" else "src/unicode-λ.py",
    ],
)
def test_deleted_source_paths_are_literal_and_nul_safe(repository, name):
    path = commit_file(repository, name, "purchase = True\n")
    path.unlink()
    assert hard_signal(repository, [])


def test_runtime_error_does_not_contaminate_neutral_source(repository):
    log = commit_file(repository, ".forgewright/rule-ledger.jsonl", "neutral\n")
    code = commit_file(repository, "src/logic.py", "value = 1\n")
    log.write_text("pytest_receipts.py mismatch\n")
    code.write_text("value = 2\n")
    assert changed_files(repository) == ["src/logic.py"]
    assert not hard_signal(repository, changed_files(repository))


def test_non_git_source_still_triggers_hard(tmp_path):
    (tmp_path / "source.py").write_text("billing = True\n")
    assert hard_signal(tmp_path, ["source.py"])
