"""Reviewed finite typecheck recipe. Verify inputs before launching a compiler.

Native compiler caches remain native. This runner does not cache acceptance,
install dependencies, download a browser, or reuse a previous test verdict.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import subprocess
import sys
import time

from project_storage import _open_directory
from resource_controls import _open, _parts
from host_job_profiles import private_read
from host_job_runner import process_table
from host_resources import inspect_process

EXTENSIONS = {".ts", ".tsx", ".mts", ".cts", ".json"}


class RecipeError(ValueError):
    pass


def require_managed(project):
    """Reject accidental raw launches; bind the live canonical supervisor."""
    output = Path(os.environ.get("FORGEWRIGHT_OUTPUT_DIR", ""))
    base = output.parent
    expected = project / ".forgewright/runtime/build-jobs" / base.name
    if (not output.is_absolute() or output != expected / "output"
            or not re.fullmatch(r"job-[0-9a-f]{32}", base.name)
            or os.environ.get("TMPDIR") != str(base / "scratch")):
        raise RecipeError("managed-supervisor-required")
    for path in (output, base / "scratch"):
        descriptor = _open_directory(path)
        try:
            info = os.fstat(descriptor)
            if info.st_uid != os.getuid() or info.st_mode & 0o077:
                raise RecipeError("owned-job-storage-required")
        finally:
            os.close(descriptor)
    authority = Path(os.environ.get("FORGEWRIGHT_JOB_ADMISSION_HOME", ""))
    if not authority.is_absolute() or str(authority.resolve(strict=True)) != str(authority):
        raise RecipeError("managed-authority-required")
    journal = authority / "jobs" / (base.name + ".json")
    deadline = time.monotonic() + 1
    while True:
        value = json.loads(private_read(journal, 128 * 1024))
        child = value.get("child") or {}
        if (value.get("physical_workspace") == str(project)
                and value.get("state") == "running"
                and value.get("owner_pid") == os.getppid()
                and value.get("owner_identity") == inspect_process(os.getppid())
                and child.get("pid") == os.getpid()
                and child.get("identity") == inspect_process(os.getpid())
                and value.get("storage", {}).get("path") == str(base)
                and len(value.get("leases", [])) == 2
                and {x.get("kind") for x in value["leases"]} == {"worker", "heavy"}
                and all(x.get("state") == "active" for x in value["leases"])):
            return
        if time.monotonic() >= deadline:
            raise RecipeError("managed-supervisor-required")
        time.sleep(0.02)  # Popen precedes the supervisor's child journal write.


def _verify_active_authority_leases(
    authority: Path, project: Path, job_id: str, owner_pid: int, owner_identity: str
) -> bool:
    db_path = authority / "host.sqlite3"
    if not db_path.is_file():
        return False
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                "SELECT id, project, run_id, kind, state, pid, identity, parent_id FROM jobs WHERE run_id=?",
                (job_id,),
            ).fetchall()
        finally:
            conn.close()
    except sqlite3.Error:
        return False
    if len(rows) != 2:
        return False
    by_kind = {row["kind"]: dict(row) for row in rows}
    if set(by_kind) != {"worker", "heavy"}:
        return False
    worker = by_kind["worker"]
    heavy = by_kind["heavy"]
    return (
        worker["id"] == f"{job_id}-worker"
        and heavy["id"] == f"{job_id}-heavy"
        and worker["state"] == "active"
        and heavy["state"] == "active"
        and worker["project"] == str(project)
        and heavy["project"] == str(project)
        and worker["pid"] == owner_pid
        and heavy["pid"] == owner_pid
        and worker["identity"] == owner_identity
        and heavy["identity"] == owner_identity
        and worker["parent_id"] is None
        and heavy["parent_id"] == worker["id"]
    )


def verify_nested_managed_context(project, env=None):
    """Verify whether the current process is inside a live managed job tree.

    Returns None when no managed locator is present in env. Raises
    RecipeError("invalid-managed-ci-context") when any managed locator is
    present but journal, active SQLite leases, live birth identities, or
    same-pgid ancestry fail to verify.
    """
    environment = os.environ if env is None else env
    project = Path(project).resolve(strict=True)
    output_raw = (environment.get("FORGEWRIGHT_OUTPUT_DIR") or "").strip()
    authority_raw = (environment.get("FORGEWRIGHT_JOB_ADMISSION_HOME") or "").strip()
    scratch_candidates = [
        (environment.get(key) or "").strip() for key in ("TMPDIR", "TMP", "TEMP")
    ]
    build_jobs_root = project / ".forgewright/runtime/build-jobs"

    matched_scratch = None
    for candidate in scratch_candidates:
        if not candidate:
            continue
        try:
            resolved_cand = Path(candidate).resolve(strict=False)
            rel = resolved_cand.relative_to(build_jobs_root)
            if len(rel.parts) >= 2 and re.fullmatch(r"job-[0-9a-f]{32}", rel.parts[0]):
                matched_scratch = resolved_cand
                break
        except (OSError, ValueError):
            continue

    has_managed_locator = bool(output_raw or authority_raw or matched_scratch is not None)
    if not has_managed_locator:
        return None

    try:
        if matched_scratch is not None:
            base = matched_scratch.parent
        elif output_raw:
            base = Path(output_raw).resolve(strict=True).parent
        else:
            raise RecipeError("invalid-managed-ci-context")

        job_id = base.name
        expected_base = build_jobs_root / job_id
        if (
            not re.fullmatch(r"job-[0-9a-f]{32}", job_id)
            or base != expected_base
            or (output_raw and Path(output_raw).resolve(strict=True) != base / "output")
        ):
            raise RecipeError("invalid-managed-ci-context")

        for path in (base / "output", base / "scratch"):
            descriptor = _open_directory(path)
            try:
                info = os.fstat(descriptor)
                if info.st_uid != os.getuid() or (info.st_mode & 0o077):
                    raise RecipeError("invalid-managed-ci-context")
            finally:
                os.close(descriptor)

        if not authority_raw:
            raise RecipeError("invalid-managed-ci-context")
        authority = Path(authority_raw)
        if not authority.is_absolute() or str(authority.resolve(strict=True)) != str(authority):
            raise RecipeError("invalid-managed-ci-context")

        journal_path = authority / "jobs" / f"{job_id}.json"
        value = json.loads(private_read(journal_path, 128 * 1024))
        child = value.get("child") or {}
        owner_pid = value.get("owner_pid")
        owner_identity = value.get("owner_identity")
        child_pid = child.get("pid")
        child_identity = child.get("identity")
        if (
            value.get("physical_workspace") != str(project)
            or value.get("state") != "running"
            or type(owner_pid) is not int
            or type(child_pid) is not int
            or not isinstance(owner_identity, str)
            or not isinstance(child_identity, str)
            or value.get("storage", {}).get("path") != str(base)
            or len(value.get("leases", [])) != 2
            or {x.get("kind") for x in value["leases"]} != {"worker", "heavy"}
            or not all(x.get("state") == "active" for x in value["leases"])
            or inspect_process(owner_pid) != owner_identity
            or inspect_process(child_pid) != child_identity
            or not _verify_active_authority_leases(
                authority, project, job_id, owner_pid, owner_identity
            )
        ):
            raise RecipeError("invalid-managed-ci-context")

        if os.name != "nt" and os.getpgrp() != child_pid:
            raise RecipeError("invalid-managed-ci-context")

        table = process_table()
        cursor = os.getpid()
        visited = set()
        for _ in range(64):
            if cursor in visited or cursor not in table:
                raise RecipeError("invalid-managed-ci-context")
            visited.add(cursor)
            ppid, pgid, _ = table[cursor]
            if os.name != "nt" and pgid != child_pid:
                raise RecipeError("invalid-managed-ci-context")
            if cursor == child_pid:
                if ppid != owner_pid:
                    raise RecipeError("invalid-managed-ci-context")
                return {
                    "job_id": job_id,
                    "root_child_pid": child_pid,
                    "pgid": child_pid,
                }
            cursor = ppid
        raise RecipeError("invalid-managed-ci-context")
    except RecipeError:
        raise
    except Exception as error:
        raise RecipeError("invalid-managed-ci-context") from error


def _hash(path, limit=64 * 1024**2):
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise RecipeError("recipe-symlink")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise RecipeError("recipe-input-budget")
        result = hashlib.sha256(); total = 0
        while chunk := stream.read(65536):
            total += len(chunk)
            if total > limit:
                raise RecipeError("recipe-input-budget")
            result.update(chunk)
        return result.hexdigest()


def verify_recipe(project, value):
    """Pin dirty/untracked inputs, config, compiler and interpreter content."""
    try:
        project = Path(project).resolve(strict=True)
        if (not isinstance(value, dict) or set(value) != {"schema", "workspace", "cwd", "config", "roots", "files", "node", "compiler"}
                or value["schema"] != "forgewright-typecheck-recipe/v1"
                or value["workspace"] != str(project)
                or not isinstance(value["roots"], list) or len(value["roots"]) != 1
                or not isinstance(value["files"], dict) or not 1 <= len(value["files"]) <= 1000):
            raise RecipeError("invalid-typecheck-recipe")
        cwd = project / value["cwd"]
        _parts(value["cwd"])
        if not cwd.resolve(strict=True).is_relative_to(project) or any(p.is_symlink() for p in (cwd, *cwd.parents)):
            raise RecipeError("recipe-cwd-scope")
        actual = set()
        visited = 0
        deadline = time.monotonic() + 2
        root_fd = _open_directory(project)
        try:
            pending = [tuple(_parts(name)) for name in value["roots"]]
            while pending:
                if time.monotonic() > deadline:
                    raise RecipeError("recipe-input-budget")
                parts = pending.pop()
                if len(parts) > 64:
                    raise RecipeError("recipe-input-budget")
                descriptor = _open(root_fd, parts)
                try:
                    with os.scandir(descriptor) as scan:
                        for entry in scan:
                            visited += 1
                            if visited > 10000 or time.monotonic() > deadline:
                                raise RecipeError("recipe-input-budget")
                            if entry.is_symlink():
                                raise RecipeError("recipe-symlink")
                            child = (*parts, entry.name)
                            if entry.is_dir(follow_symlinks=False):
                                if entry.name not in {"node_modules", ".git", ".forgewright"}:
                                    pending.append(child)
                            elif Path(entry.name).suffix in EXTENSIONS:
                                actual.add(str(Path(*child)))
                finally:
                    os.close(descriptor)
        finally:
            os.close(root_fd)
        declared = set(value["files"])
        if not actual <= declared:
            raise RecipeError("recipe-untracked-input")
        _parts(value["config"])
        if value["config"] not in declared:
            raise RecipeError("recipe-config-not-pinned")
        total_bytes = 0
        for name, expected in value["files"].items():
            _parts(name)
            total_bytes += (project / name).stat().st_size
            if total_bytes > 128 * 1024**2:
                raise RecipeError("recipe-input-budget")
            if _hash(project / name, 64 * 1024**2) != expected:
                raise RecipeError("recipe-source-drift")
        config_path = project / value["config"]
        if config_path.stat().st_size > 65536:
            raise RecipeError("recipe-config-budget")
        config = json.loads(config_path.read_bytes())
        if not isinstance(config, dict):
            raise RecipeError("unsupported-typecheck-config")
        options = config.get("compilerOptions", {})
        if (set(config) - {"compilerOptions", "include", "exclude", "compileOnSave"}
                or not isinstance(options, dict)
                or set(options) & {"plugins", "paths", "baseUrl", "rootDirs", "typeRoots"}
                or options.get("allowJs") is True
                or not isinstance(config.get("include"), list)
                or len(config["include"]) != 1
                or (config_path.parent / config["include"][0]).resolve(strict=True)
                    != (project / value["roots"][0]).resolve(strict=True)):
            raise RecipeError("unsupported-typecheck-config")
        for key in ("node", "compiler"):
            tool = value[key]
            if (not isinstance(tool, dict) or set(tool) != {"path", "sha256"}
                    or not Path(tool["path"]).is_absolute()
                    or _hash(Path(tool["path"])) != tool["sha256"]):
                raise RecipeError("recipe-toolchain-drift")
        return {"workspace": str(project), "cwd": str(cwd), "inputs": len(declared),
                "config": str(config_path), "root": str(project / value["roots"][0])}
    except (OSError, KeyError, TypeError, ValueError) as error:
        if isinstance(error, RecipeError):
            raise
        raise RecipeError("recipe-unavailable") from error


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--recipe", required=True)
    args = parser.parse_args(argv)
    try:
        project = args.project.resolve(strict=True)
        require_managed(project)
        # The profile binds this bounded recipe file and this runner's hash.
        parts = _parts(args.recipe)
        root = _open_directory(project)
        try:
            descriptor = _open(root, parts)
            with os.fdopen(descriptor, "rb") as stream:
                if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                    raise RecipeError("invalid-typecheck-recipe")
                raw = stream.read(256 * 1024 + 1)
            if len(raw) > 256 * 1024:
                raise RecipeError("recipe-input-budget")
        finally:
            os.close(root)
        value = json.loads(raw)
        result = verify_recipe(project, value)
        print(json.dumps({**result, "cache_verdict": "fresh-compiler-required", "dependency_install": False}), flush=True)
        child = subprocess.run([value["node"]["path"], "--max-old-space-size=384",
            value["compiler"]["path"], "--project", result["config"], "--rootDir", result["workspace"],
            "--noEmit", "--incremental", "false"],
            cwd=result["cwd"], env=os.environ.copy(), timeout=180, check=False)
        return child.returncode if child.returncode >= 0 else 128 - child.returncode
    except (OSError, ValueError, subprocess.SubprocessError):
        print(json.dumps({"error": "typecheck-recipe-unavailable", "compiler_result": "UNVERIFIED"}), file=sys.stderr)
        return 125


if __name__ == "__main__":
    raise SystemExit(main())
