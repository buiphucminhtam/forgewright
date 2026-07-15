from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
UPDATER = ROOT / "scripts" / "lite" / "submodule-auto-update.sh"
HOOK_INSTALLER = ROOT / "scripts" / "lite" / "install-submodule-update-hooks.sh"
LEGACY_SHIM = ROOT / "scripts" / "forgewright-submodule-check.sh"
BATCH_UPDATER = ROOT / "scripts" / "runtime" / "forgewright-batch-update.sh"
GIT_LOCAL_ENV_VARS = subprocess.run(
    ("git", "rev-parse", "--local-env-vars"),
    cwd=ROOT,
    text=True,
    capture_output=True,
    check=True,
).stdout.splitlines()


def run(
    *args: str, cwd: Path, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    for variable in GIT_LOCAL_ENV_VARS:
        merged_env.pop(variable, None)
    merged_env.update(env or {})
    return subprocess.run(
        args,
        cwd=cwd,
        env=merged_env,
        text=True,
        capture_output=True,
        check=False,
    )


def git(cwd: Path, *args: str) -> str:
    result = run("git", *args, cwd=cwd)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def configure_repo(path: Path) -> None:
    git(path, "config", "user.email", "tests@example.com")
    git(path, "config", "user.name", "Tests")


def write_stub(path: Path, label: str, *, record_cwd: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    log_line = (
        f'printf \'{label}:%s\\n\' "$PWD" >> "$FORGEWRIGHT_TEST_LOG"\n'
        if record_cwd
        else f'printf \'{label}:%s\\n\' "$*" >> "$FORGEWRIGHT_TEST_LOG"\n'
    )
    path.write_text(
        "#!/usr/bin/env bash\nset -euo pipefail\n" + log_line,
        encoding="utf-8",
    )
    path.chmod(0o755)


def test_parent_hooks_update_submodule_and_refresh_installed_runtime(
    tmp_path: Path,
) -> None:
    assert UPDATER.is_file()
    assert HOOK_INSTALLER.is_file()
    assert LEGACY_SHIM.is_file()
    assert BATCH_UPDATER.is_file()

    remote = tmp_path / "forgewright.git"
    git(tmp_path, "init", "--bare", str(remote))

    seed = tmp_path / "seed"
    seed.mkdir()
    git(seed, "init", "-b", "main")
    configure_repo(seed)
    (seed / "scripts" / "lite").mkdir(parents=True)
    shutil.copy2(UPDATER, seed / "scripts" / "lite" / UPDATER.name)
    shutil.copy2(HOOK_INSTALLER, seed / "scripts" / "lite" / HOOK_INSTALLER.name)
    shutil.copy2(LEGACY_SHIM, seed / "scripts" / LEGACY_SHIM.name)
    write_stub(seed / "scripts" / "forgewright-install.sh", "install")
    write_stub(seed / "scripts" / "forgewright-hook-doctor.sh", "doctor")
    write_stub(seed / "scripts" / "forgewright-mcp-setup.sh", "mcp", record_cwd=True)
    (seed / "VERSION").write_text("one\n", encoding="utf-8")
    git(seed, "add", ".")
    git(seed, "commit", "-m", "initial")
    git(seed, "remote", "add", "origin", str(remote))
    git(seed, "push", "-u", "origin", "main")

    parent = tmp_path / "parent"
    parent.mkdir()
    git(parent, "init", "-b", "main")
    configure_repo(parent)
    git(
        parent,
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        str(remote),
        "vendor/fw core",
    )
    git(parent, "commit", "-am", "add forgewright")

    post_merge = Path(git(parent, "rev-parse", "--git-path", "hooks")) / "post-merge"
    if not post_merge.is_absolute():
        post_merge = parent / post_merge
    post_merge.parent.mkdir(parents=True, exist_ok=True)
    post_merge.write_text(
        "#!/usr/bin/env sh\necho keep-existing-hook >/dev/null\n", encoding="utf-8"
    )
    post_merge.chmod(0o755)

    installer = parent / "vendor" / "fw core" / "scripts" / "lite" / HOOK_INSTALLER.name
    first_install = run("bash", str(installer), str(parent), cwd=parent)
    assert first_install.returncode == 0, first_install.stderr
    second_install = run("bash", str(installer), str(parent), cwd=parent)
    assert second_install.returncode == 0, second_install.stderr

    post_checkout = post_merge.with_name("post-checkout")
    assert post_checkout.is_file()
    assert "keep-existing-hook" in post_merge.read_text(encoding="utf-8")
    assert (
        post_merge.read_text(encoding="utf-8").count(
            "# Forgewright managed submodule auto-update\n"
        )
        == 1
    )
    assert (
        post_checkout.read_text(encoding="utf-8").count(
            "# Forgewright managed submodule auto-update\n"
        )
        == 1
    )

    (seed / "VERSION").write_text("two\n", encoding="utf-8")
    git(seed, "add", "VERSION")
    git(seed, "commit", "-m", "update")
    git(seed, "push", "origin", "main")
    remote_head = git(seed, "rev-parse", "HEAD")

    log = tmp_path / "refresh.log"
    hook_result = run(
        "bash",
        str(post_merge),
        cwd=parent,
        env={"FORGEWRIGHT_TEST_LOG": str(log)},
    )
    assert hook_result.returncode == 0, hook_result.stderr

    submodule = parent / "vendor" / "fw core"
    assert git(submodule, "rev-parse", "HEAD") == remote_head
    assert (submodule / "VERSION").read_text(encoding="utf-8") == "two\n"
    assert log.read_text(encoding="utf-8").splitlines() == [
        "install:--profile minimal --yes --skip-mcp --skip-skills --skip-config",
        "doctor:--quick --fix",
        f"mcp:{parent}",
    ]
    assert "vendor/fw core" in git(parent, "status", "--short")

    # A local worktree change must win over a later remote update. The hook
    # stays non-blocking for the parent Git operation and skips all refreshes.
    previous_head = git(submodule, "rev-parse", "HEAD")
    previous_log = log.read_text(encoding="utf-8")
    (submodule / "LOCAL_CHANGE").write_text("keep me\n", encoding="utf-8")
    (seed / "VERSION").write_text("three\n", encoding="utf-8")
    git(seed, "add", "VERSION")
    git(seed, "commit", "-m", "second update")
    git(seed, "push", "origin", "main")

    dirty_result = run(
        "bash",
        str(post_checkout),
        cwd=parent,
        env={"FORGEWRIGHT_TEST_LOG": str(log)},
    )
    assert dirty_result.returncode == 0, dirty_result.stderr
    assert "thay đổi cục bộ" in dirty_result.stderr
    assert git(submodule, "rev-parse", "HEAD") == previous_head
    assert (submodule / "VERSION").read_text(encoding="utf-8") == "two\n"
    assert (submodule / "LOCAL_CHANGE").read_text(encoding="utf-8") == "keep me\n"
    assert log.read_text(encoding="utf-8") == previous_log

    # A dead process must not leave a permanent lock that disables updates.
    (submodule / "LOCAL_CHANGE").unlink()
    lock_file = Path(
        git(submodule, "rev-parse", "--git-path", "forgewright-auto-update.lock")
    )
    if not lock_file.is_absolute():
        lock_file = submodule / lock_file
    lock_file.write_text("99999999\n", encoding="utf-8")

    stale_lock_result = run(
        "bash",
        str(post_checkout),
        cwd=parent,
        env={"FORGEWRIGHT_TEST_LOG": str(log)},
    )
    assert stale_lock_result.returncode == 0, stale_lock_result.stderr
    assert "stale lock" in stale_lock_result.stderr
    assert git(submodule, "rev-parse", "HEAD") == git(seed, "rev-parse", "HEAD")
    assert (submodule / "VERSION").read_text(encoding="utf-8") == "three\n"
    assert log.read_text(encoding="utf-8").splitlines()[-3:] == [
        "install:--profile minimal --yes --skip-mcp --skip-skills --skip-config",
        "doctor:--quick --fix",
        f"mcp:{parent}",
    ]

    batch_result = run(
        "bash",
        str(BATCH_UPDATER),
        cwd=parent,
        env={"SCAN_DIRS": str(parent), "HOME": str(tmp_path)},
    )
    assert batch_result.returncode == 0, batch_result.stderr
    assert "Projects scanned: 1" in batch_result.stdout
    assert "Up to date" in batch_result.stdout
    assert "not initialized" not in batch_result.stdout
