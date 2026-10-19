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
import stat
import subprocess
import sys
import time

from project_storage import _open_directory
from resource_controls import _open, _parts
from host_job_profiles import private_read
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
