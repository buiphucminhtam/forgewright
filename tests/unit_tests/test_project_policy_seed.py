from __future__ import annotations

import json
import os
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / ".forgewright" / "execution-policy.yaml"
SEEDER = ROOT / "scripts" / "lite" / "ensure-project-policy.sh"
SETUP_PROJECT = ROOT / "scripts" / "bootstrap" / "setup-project.sh"
SETUP_CLI = ROOT / "scripts" / "bootstrap" / "forgewright-setup.sh"
DOCTOR = ROOT / "scripts" / "hooks" / "forgewright-hook-doctor.sh"
GATE = ROOT / "scripts" / "lite" / "antigravity-pre-tool-gate.sh"
GIT_LOCAL_ENV_VARS = subprocess.run(
    ("git", "rev-parse", "--local-env-vars"),
    cwd=ROOT,
    text=True,
    capture_output=True,
    check=True,
).stdout.splitlines()


def run(
    *args: str,
    cwd: Path,
    env: dict[str, str] | None = None,
    stdin: str | None = None,
) -> subprocess.CompletedProcess[str]:
    clean_env = os.environ.copy()
    for variable in GIT_LOCAL_ENV_VARS:
        clean_env.pop(variable, None)
    clean_env.update(env or {})
    return subprocess.run(
        args,
        cwd=cwd,
        env=clean_env,
        input=stdin,
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


def test_policy_seeder_creates_parent_policy_and_preserves_customization(
    tmp_path: Path,
) -> None:
    assert SEEDER.is_file()
    source = tmp_path / "source"
    target = tmp_path / "target"
    (source / ".forgewright").mkdir(parents=True)
    target.mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)
    unrelated_tmp = tmp_path / "unrelated-tmp"
    unrelated_tmp.mkdir()

    created = run(
        "bash",
        str(SEEDER),
        str(source),
        str(target),
        cwd=target,
        env={"TMPDIR": str(unrelated_tmp)},
    )
    assert created.returncode == 0, created.stderr
    parent_policy = target / ".forgewright" / POLICY.name
    assert parent_policy.read_text(encoding="utf-8") == POLICY.read_text(
        encoding="utf-8"
    )
    assert "created" in created.stdout

    parent_policy.write_text("customized: true\n", encoding="utf-8")
    preserved = run("bash", str(SEEDER), str(source), str(target), cwd=target)
    assert preserved.returncode == 0, preserved.stderr
    assert parent_policy.read_text(encoding="utf-8") == "customized: true\n"
    assert "preserved" in preserved.stdout


def test_policy_seeder_is_atomic_under_concurrent_installers(tmp_path: Path) -> None:
    source = tmp_path / "source"
    target = tmp_path / "target"
    (source / ".forgewright").mkdir(parents=True)
    target.mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)

    def seed() -> subprocess.CompletedProcess[str]:
        return run("bash", str(SEEDER), str(source), str(target), cwd=target)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: seed(), range(8)))

    assert all(result.returncode == 0 for result in results), [
        result.stderr for result in results
    ]
    assert sum("created" in result.stdout for result in results) == 1
    assert sum("preserved" in result.stdout for result in results) == 7
    assert (target / ".forgewright" / POLICY.name).read_bytes() == POLICY.read_bytes()
    assert not list((target / ".forgewright").glob(".execution-policy.yaml.*"))


def test_policy_seeder_installs_cleanup_trap_and_preserves_symlinks(
    tmp_path: Path,
) -> None:
    source_text = SEEDER.read_text(encoding="utf-8")
    assert "trap cleanup EXIT HUP INT TERM" in source_text

    source = tmp_path / "source"
    target = tmp_path / "target"
    (source / ".forgewright").mkdir(parents=True)
    target.mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)
    target_policy_dir = target / ".forgewright"
    target_policy_dir.mkdir()
    parent_policy = target_policy_dir / POLICY.name
    parent_policy.symlink_to(target / "custom-policy.yaml")

    preserved = run("bash", str(SEEDER), str(source), str(target), cwd=target)
    assert preserved.returncode == 0, preserved.stderr
    assert parent_policy.is_symlink()
    assert "preserved" in preserved.stdout


def test_policy_seeder_fails_for_missing_source_or_non_file_destination(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source"
    target = tmp_path / "target"
    source.mkdir()
    target.mkdir()

    missing_source = run("bash", str(SEEDER), str(source), str(target), cwd=target)
    assert missing_source.returncode != 0
    assert not (target / ".forgewright" / POLICY.name).exists()

    (source / ".forgewright").mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)
    destination = target / ".forgewright" / POLICY.name
    destination.mkdir(parents=True)
    conflict = run("bash", str(SEEDER), str(source), str(target), cwd=target)
    assert conflict.returncode != 0
    assert "not a file or symlink" in conflict.stderr


def test_policy_seeder_fails_when_atomic_publication_fails_without_race(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source"
    target = tmp_path / "target"
    fake_bin = tmp_path / "bin"
    (source / ".forgewright").mkdir(parents=True)
    target.mkdir()
    fake_bin.mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)
    fake_ln = fake_bin / "ln"
    fake_ln.write_text("#!/usr/bin/env sh\nexit 1\n", encoding="utf-8")
    fake_ln.chmod(0o755)

    failed = run(
        "bash",
        str(SEEDER),
        str(source),
        str(target),
        cwd=target,
        env={"PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}"},
    )

    assert failed.returncode != 0
    assert "could not publish execution policy" in failed.stderr
    assert not (target / ".forgewright" / POLICY.name).exists()
    assert not list((target / ".forgewright").glob(".execution-policy.yaml.*"))


def test_setup_entrypoints_use_shared_policy_seeder() -> None:
    for script in (SETUP_PROJECT, SETUP_CLI):
        source = script.read_text(encoding="utf-8")
        assert "ensure-project-policy.sh" in source
        assert '"$policy_seeder"' in source


def test_seeded_parent_policy_allows_safe_antigravity_tool(tmp_path: Path) -> None:
    source = tmp_path / "source"
    parent = tmp_path / "parent"
    (source / ".forgewright").mkdir(parents=True)
    parent.mkdir()
    shutil.copy2(POLICY, source / ".forgewright" / POLICY.name)
    seeded = run("bash", str(SEEDER), str(source), str(parent), cwd=parent)
    assert seeded.returncode == 0, seeded.stderr

    payload = json.dumps(
        {
            "workspacePaths": [str(parent)],
            "cwd": str(parent),
            "toolCall": {"name": "list_dir", "args": {"path": str(parent)}},
        }
    )
    gate = run("bash", str(GATE), cwd=parent, stdin=payload)
    assert gate.returncode == 0, gate.stderr
    assert json.loads(gate.stdout)["decision"] == "allow"


def test_hook_doctor_repairs_policy_into_superproject(tmp_path: Path) -> None:
    remote = tmp_path / "forgewright.git"
    git(tmp_path, "init", "--bare", str(remote))

    seed = tmp_path / "seed"
    seed.mkdir()
    git(seed, "init", "-b", "main")
    configure_repo(seed)
    (seed / ".forgewright").mkdir()
    shutil.copy2(POLICY, seed / ".forgewright" / POLICY.name)
    (seed / "scripts" / "hooks").mkdir(parents=True)
    (seed / "scripts" / "lite").mkdir(parents=True)
    shutil.copy2(DOCTOR, seed / "scripts" / "hooks" / DOCTOR.name)
    shutil.copy2(SEEDER, seed / "scripts" / "lite" / SEEDER.name)
    for name in ("forgewright-memory-hook.sh", "memory-session.sh"):
        stub = seed / "scripts" / "hooks" / name
        stub.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
        stub.chmod(0o755)
    git(seed, "add", ".")
    git(seed, "commit", "-m", "fixture")
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
        "vendor/fw",
    )
    git(parent, "commit", "-am", "add submodule")

    home = tmp_path / "home"
    home.mkdir()
    doctor = parent / "vendor" / "fw" / "scripts" / "hooks" / DOCTOR.name
    result = run(
        "bash",
        str(doctor),
        "--quick",
        "--fix",
        cwd=parent,
        env={"HOME": str(home)},
    )

    parent_policy = parent / ".forgewright" / POLICY.name
    assert parent_policy.read_text(encoding="utf-8") == POLICY.read_text(
        encoding="utf-8"
    )
    assert "Fixed: Seeded execution policy into parent workspace" in result.stdout

    parent_policy.write_text("customized: true\n", encoding="utf-8")
    preserved = run(
        "bash",
        str(doctor),
        "--quick",
        "--fix",
        cwd=parent,
        env={"HOME": str(home)},
    )
    assert parent_policy.read_text(encoding="utf-8") == "customized: true\n"
    assert "Parent workspace execution policy exists" in preserved.stdout

    parent_policy.unlink()
    (parent / "vendor" / "fw" / ".forgewright" / POLICY.name).unlink()
    failed = run(
        "bash",
        str(doctor),
        "--quick",
        "--fix",
        cwd=parent,
        env={"HOME": str(home)},
    )
    assert failed.returncode != 0
    assert "Could not seed execution policy into parent workspace" in failed.stdout
