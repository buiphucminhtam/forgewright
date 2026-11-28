"""Internal adapter for gate-checked framework escalation; not an execute CLI.

Only escalate.sh calls this after its provider/confirmation/cost gates. The
descriptor fixes provider flags and treats the prompt solely as argv data.
HostAdmission supplies real worker/heavy authority; run_job owns the Windows
Job Object and validates its completion via WindowsJobClient. No legacy RLG
lease is synthesized. This synchronous adapter streams inherited stdout/stderr
and temporarily installs the validated invocation environment on the main thread.
It does not authenticate hostile same-user code or enroll public profiles.
"""

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import threading

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS / "runtime"))
sys.path.insert(0, str(SCRIPTS))
# These are framework siblings, resolved only after the anchored script root.
from host_admission import HostAdmission  # noqa: E402
from host_job_runner import JobRequest, run_job, journal_released  # noqa: E402
from host_job_profiles import private_read  # noqa: E402
from windows_security import create_private_directory, is_private_path  # noqa: E402
from lite import windows_secure_io  # noqa: E402

PROFILE = "framework-escalation-v1"
FLAGS = {
    "agy": ("--sandbox", "--mode", "plan", "--print"),
    "claude": ("-p",),
    "codex": ("exec",),
    "gemini": ("-p",),
}


@dataclass(frozen=True)
class ValidatedProvider:
    provider: str
    executable: Path
    arguments: tuple[str, ...]
    project: Path
    timeout: int
    identity: tuple[int, int, int, int]
    launch_prefix: tuple[str, ...] = ()
    support_identities: tuple[tuple[str, tuple[int, int, int, int]], ...] = ()


def _identity(path):
    value = path.stat()
    if not stat.S_ISREG(value.st_mode):
        raise ValueError("native-executable-required")
    return value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns


def _npm_provider(shim, provider, env):
    """Recognize the standard npm launcher, never interpret arbitrary batch code.

    Customized wrappers may establish auth/routing or run other commands. They
    remain rejected rather than silently bypassing their behavior.
    """
    packages = {"codex": "@openai/codex", "gemini": "@google/gemini-cli"}
    if provider not in packages:
        raise ValueError("native-executable-required")
    package = shim.parent / "node_modules" / packages[provider]
    manifest = package / "package.json"
    try:
        identities = [
            (str(shim), _identity(shim)),
            (str(manifest), _identity(manifest)),
        ]
        with manifest.open("rb") as stream:
            raw = stream.read(65537)
        if len(raw) > 65536:
            raise ValueError("invalid npm manifest")
        metadata = json.loads(raw)
        entry = metadata["bin"][provider]
        if (
            metadata["name"] != packages[provider]
            or not isinstance(entry, str)
            or not entry
            or "\\" in entry
            or "%" in entry
            or "\0" in entry
            or any(part in {"", ".", ".."} for part in entry.split("/"))
            or Path(entry).is_absolute()
        ):
            raise ValueError("invalid npm bin")
        source = (package / entry).resolve(strict=True)
        if not source.is_relative_to(package.resolve(strict=True)):
            raise ValueError("npm bin escapes package")
        identities.append((str(source), _identity(source)))
        relative = "node_modules/" + packages[provider] + "/" + entry
        relative = relative.replace("/", "\\")
        expected = (
            "@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT /b\n:start\n"
            'SETLOCAL\nCALL :find_dp0\n\nIF EXIST "%dp0%\\node.exe" (\n'
            '  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n'
            "  SET PATHEXT=%PATHEXT:;.JS;=;%\n)\n\n"
            'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  '
            f'"%dp0%\\{relative}" %*\n'
        )
        with shim.open("r", encoding="utf-8") as stream:
            if stream.read(8193) != expected:
                raise ValueError("custom npm launcher")
        local_node = shim.parent / "node.exe"
        node = (
            local_node
            if local_node.exists()
            else shutil.which("node", path=env.get("PATH", ""))
        )
        if not node:
            raise ValueError("node unavailable")
        executable = Path(node).resolve(strict=True)
        if any(_identity(Path(path)) != identity for path, identity in identities):
            raise ValueError("npm launcher drift")
        return executable, (str(source),), tuple(identities)
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise ValueError("native-executable-required") from error


def validate_provider(argv, env, timeout):
    if os.name != "nt":
        raise ValueError("native-Windows-required")
    if (
        not isinstance(argv, list)
        or not argv
        or any(not isinstance(v, str) or not v or "\0" in v for v in argv)
        or argv[0] not in FLAGS
        or tuple(argv[1:-1]) != FLAGS[argv[0]]
        or type(timeout) is not int
        or not 1 <= timeout <= 3600
    ):
        raise ValueError("invalid-provider-descriptor")
    resolved = shutil.which(argv[0], path=env.get("PATH", ""))
    if not resolved:
        raise ValueError("provider-executable-unavailable")
    executable = Path(resolved).resolve(strict=True)
    # Batch files can trigger cmd.exe parsing even with shell=False. Never put
    # an untrusted prompt through that path or guess a launcher rewrite.
    prefix, supports = (), ()
    if executable.suffix.lower() == ".cmd":
        executable, prefix, supports = _npm_provider(executable, argv[0], env)
    if executable.suffix.lower() != ".exe":
        raise ValueError("native-executable-required")
    identity = _identity(executable)
    with executable.open("rb") as stream:
        if stream.read(2) != b"MZ":
            raise ValueError("native-executable-required")
    project = Path(env["PROJECT_ROOT"]).resolve(strict=True)
    if not project.is_dir():
        raise ValueError("invalid-project")
    return ValidatedProvider(
        argv[0],
        executable,
        tuple(argv[1:]),
        project,
        timeout,
        identity,
        prefix,
        supports,
    )


def _exists(path):
    try:
        path.lstat()
        return True
    except FileNotFoundError:
        return False


def _enabled(descriptor, env):
    root = Path(
        env.get("FORGEWRIGHT_RLG_HOME")
        or Path(env.get("HOME") or Path.home()) / ".forgewright/runtime"
    )
    if (
        env.get("FORGEWRIGHT_RLG") in {"off", "OFF", "0", "false", "disabled"}
        or _exists(root / "DISABLED")
        or _exists(descriptor.project / ".forgewright/rlg-optout")
    ):
        raise ValueError("RLG-disabled")


def _private_database(home):
    for name in (
        "host.sqlite3",
        "host.sqlite3-wal",
        "host.sqlite3-shm",
        "host.sqlite3-journal",
    ):
        path = home / name
        if not _exists(path):
            continue
        info = path.lstat()
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_nlink != 1
            or windows_secure_io._is_reparse(info)
            or not is_private_path(path, confidential=True)
        ):
            raise ValueError("unsafe-admission-database")


def run_internal(descriptor, env):
    """Run one already gate-checked invocation. No arbitrary argv or CLI entry."""
    argv = []
    try:
        if not isinstance(descriptor, ValidatedProvider):
            raise ValueError("validated-provider-required")
        # Recheck descriptor shape against current resolution before admission.
        fresh = validate_provider(
            [descriptor.provider, *descriptor.arguments], env, descriptor.timeout
        )
        if (
            fresh != descriptor
            or threading.current_thread() is not threading.main_thread()
        ):
            raise ValueError("provider-descriptor-drift")
        argv = [
            str(descriptor.executable),
            *descriptor.launch_prefix,
            *descriptor.arguments,
        ]
        _enabled(descriptor, env)
        home = Path(
            env.get("FORGEWRIGHT_ADMISSION_HOME")
            or Path.home() / ".forgewright/runtime/admission"
        )
        home = create_private_directory(home)
        with windows_secure_io.locked_directory_chain(Path(home.anchor), home):
            _private_database(home)
            from resource_enrollment import operator_disabled

            if operator_disabled(home, str(descriptor.project)):
                raise ValueError("operator-disabled")
            admission = HostAdmission(home)
            cancel = threading.Event()
            saved_env = dict(os.environ)
            handlers = {}
            try:
                for sig in (signal.SIGINT, signal.SIGTERM):
                    handlers[sig] = signal.signal(sig, lambda *_: cancel.set())
                os.environ.clear()
                os.environ.update(env)
                request = JobRequest(
                    project=descriptor.project,
                    cwd=Path.cwd(),
                    argv=argv,
                    profile=PROFILE,
                    profile_digest=None,
                    memory_mib=256,
                    scratch_bytes=0,
                    disk_floor_bytes=0,
                    timeout=descriptor.timeout,
                    wait_seconds=5,
                )
                sys.stdout.flush()
                sys.stderr.flush()
                receipt = run_job(admission, request, cancel=cancel)
                # Read the authoritative private journal, never workload output.
                if not isinstance(receipt, dict):
                    raise ValueError("invalid-job-receipt")
                identifier = receipt.get("job_id", "")
                if (
                    not isinstance(identifier, str)
                    or not identifier.startswith("job-")
                    or any(c not in "0123456789abcdef" for c in identifier[4:])
                    or len(identifier) != 36
                ):
                    raise ValueError("invalid-job-receipt")
                record = json.loads(
                    private_read(home / "jobs" / (identifier + ".json"), 65536)
                )
                if not isinstance(record, dict):
                    raise ValueError("invalid-job-journal")
                if (
                    record.get("job_id") != identifier
                    or record.get("owner_pid") != os.getpid()
                    or record.get("physical_workspace") != str(descriptor.project)
                    or record.get("argv_sha256")
                    != hashlib.sha256(json.dumps(argv).encode()).hexdigest()
                    or record.get("profile") != PROFILE
                    or record.get("profile_digest") is not None
                    or record.get("state") != receipt.get("state")
                    or record.get("exit_code") != receipt.get("exit_code")
                    or not journal_released(admission, record)
                ):
                    raise ValueError("quiescence-unconfirmed")
                if receipt["state"] == "quiescent" and not receipt.get("storage_error"):
                    code = receipt["exit_code"]
                    # The shared worker normalizes 125/126/out-of-range exits
                    # to 124. Do not turn a provider's no-fallback 125 into a
                    # retry; only owner cancellation below proves a timeout.
                    if (
                        type(code) is int
                        and 0 <= code <= 255
                        and code not in {124, 125, 126}
                    ):
                        return subprocess.CompletedProcess(argv, code, "", "")
                if (
                    receipt["state"] == "cancelled"
                    and record.get("child")
                    and receipt["exit_code"] == 126
                    and not cancel.is_set()
                    and not receipt.get("storage_error")
                ):
                    return subprocess.CompletedProcess(
                        argv,
                        124,
                        "",
                        f"[ESCALATE] ERROR: provider timed out after {descriptor.timeout}s.\n",
                    )
                raise ValueError("admission-or-execution-unconfirmed")
            finally:
                os.environ.clear()
                os.environ.update(saved_env)
                for sig, handler in handlers.items():
                    signal.signal(sig, handler)
                admission.close()
    except (
        OSError,
        ValueError,
        RuntimeError,
        KeyError,
        TypeError,
        sqlite3.Error,
    ) as error:
        # Exceptions may contain argv/paths. Only fixed diagnostic categories
        # leave this boundary; no speculative release or fallback on uncertainty.
        reason = (
            "disabled"
            if isinstance(error, ValueError)
            and str(error) in {"RLG-disabled", "operator-disabled"}
            else "admission or completion unavailable"
        )
        return subprocess.CompletedProcess(
            argv,
            125,
            "",
            "[ESCALATE] ERROR: Runtime Lifecycle Guard lease acquisition failed "
            f"or native ownership unconfirmed ({reason}); provider continuation refused.\n",
        )


if __name__ == "__main__":
    raise SystemExit("Internal escalation adapter; no public execute CLI")
