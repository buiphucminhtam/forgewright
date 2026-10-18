"""Bounded Codex exec capture, separate from semantic judging and promotion.

Persisted JSON is evidence, never authority. Unknown provider context, model
snapshot and price are not zero. Only Linux process lifetime/group inspection
is supported; no credential file is opened by this module.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import math
import os
import selectors
import shutil
import signal
import subprocess
import tempfile
import sys
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class HostRequest:
    case_id: str
    arm: str
    repetition: int
    prompt_packet: Mapping
    instruction_manifest: tuple[Mapping, ...]
    oracle_digest: str
    model: str
    effort: str
    runtime: str = "codex-exec-json"
    executable: str = "codex"
    fixture_command: tuple[str, ...] | None = None
    cwd: Path | None = None


@dataclass(frozen=True)
class HostLimits:
    wall_seconds: float = 180.0
    output_bytes: int = 4 * 1024 * 1024
    request_limit: int = 1
    cleanup_seconds: float = 15.0
    allowed_operations: tuple[str, ...] = ()


@dataclass(frozen=True)
class HostRun:
    run_id: str
    manifest_digest: str
    record: Mapping
    output_dir: Path
    success: bool
    promotion_eligible: bool


_ISSUED: dict[str, tuple[HostRun, str]] = {}


def _json(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ).encode()


def _hash(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _plain(value):
    if isinstance(value, Mapping):
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_plain(item) for item in value]
    return value


def _freeze(value):
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(item) for item in value)
    return value


def _identity(pid: int):
    """Linux PID/start ticks; mutable PPID and process group are separate."""
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(") ", 1)[1].split()
        return (pid, int(fields[19])), int(fields[1]), int(fields[2]), fields[0]
    except (FileNotFoundError, ProcessLookupError):
        return None


def _scan_owned(group: int, born: int, owned: dict):
    leader = _identity(group)
    group_matches = leader is None or leader[0][1] == born
    for path in Path("/proc").iterdir():
        if not path.name.isdigit():
            continue
        try:
            entry = _identity(int(path.name))
        except (PermissionError, ValueError):
            continue
        if entry:
            ident, parent, pgid, state = entry
            parent_entry = _identity(parent) if parent in owned else None
            parent_matches = (
                parent_entry is not None and parent_entry[0] == owned[parent]
            )
            if (group_matches and pgid == group and ident[1] >= born) or parent_matches:
                owned.setdefault(ident[0], ident)
    return {
        pid: ident
        for pid, ident in owned.items()
        if (entry := _identity(pid)) and entry[0] == ident and entry[3] != "Z"
    }


def run_owned_process(
    argv: Sequence[str],
    payload: bytes,
    *,
    cwd: Path | None = None,
    wall_seconds: float = 30,
    output_bytes: int = 4 * 1024 * 1024,
    cleanup_seconds: float = 15,
) -> dict:
    """Supervise one new session; bound pipes and terminate only born identities.

    Every path (including BaseException) reclaims the leader and descendants.
    A private supervisor adopts/reaps grandchildren without changing the shared
    host's process-global subreaper policy. Missing reap evidence fails closed.
    """
    if sys.platform != "linux" or not Path("/proc/self/stat").exists():
        raise ValueError("Linux process birth identity inspection required")
    for value in (wall_seconds, cleanup_seconds):
        if (
            not isinstance(value, (int, float))
            or isinstance(value, bool)
            or not math.isfinite(value)
            or value <= 0
        ):
            raise ValueError("positive finite process deadlines required")
    if type(output_bytes) is not int or output_bytes <= 0:
        raise ValueError("positive output bound required")
    started = time.monotonic()
    report_fd, report_name = tempfile.mkstemp(prefix="skill-process-", suffix=".json")
    os.close(report_fd)
    owner_identity = _identity(os.getpid())[0]
    supervisor_argv = [
        sys.executable,
        str(Path(__file__).with_name("skill_eval_process.py")),
        report_name,
        str(cleanup_seconds),
        str(owner_identity[0]),
        str(owner_identity[1]),
        *argv,
    ]
    proc = None
    birth = None
    owned = {}
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    selector = None
    failure = None
    interrupted = None
    cleanup = {"complete": False}
    old_term = None
    if threading.current_thread() is threading.main_thread():
        old_term = signal.getsignal(signal.SIGTERM)

        def on_termination(number, frame):
            raise SystemExit(128 + number)

        signal.signal(signal.SIGTERM, on_termination)
    try:
        proc = subprocess.Popen(
            supervisor_argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
            cwd=cwd,
        )
        # Every post-launch operation is inside this cleanup scope.
        birth = _identity(proc.pid)
        if birth is None:
            raise RuntimeError("cannot identify owned process")
        owned[proc.pid] = birth[0]
        selector = selectors.DefaultSelector()
        for name, stream in [
            ("stdout", proc.stdout),
            ("stderr", proc.stderr),
            ("stdin", proc.stdin),
        ]:
            os.set_blocking(stream.fileno(), False)
            selector.register(
                stream,
                selectors.EVENT_WRITE if name == "stdin" else selectors.EVENT_READ,
                name,
            )
        offset = 0
        while selector.get_map():
            _scan_owned(proc.pid, birth[0][1], owned)
            if time.monotonic() - started >= wall_seconds:
                failure = "timeout"
                break
            for key, _ in selector.select(
                min(0.025, max(0, wall_seconds - (time.monotonic() - started)))
            ):
                if key.data == "stdin":
                    try:
                        offset += (
                            os.write(key.fd, payload[offset : offset + 65536])
                            if offset < len(payload)
                            else 0
                        )
                    except BrokenPipeError:
                        offset = len(payload)
                    if offset == len(payload):
                        selector.unregister(key.fileobj)
                        key.fileobj.close()
                    continue
                try:
                    data = os.read(key.fd, 65536)
                except BlockingIOError:
                    continue
                if not data:
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                    continue
                remaining = output_bytes - sum(len(item) for item in buffers.values())
                buffers[key.data].extend(data[:remaining])
                if len(data) > remaining:
                    failure = "output_limit"
                    break
            if failure or proc.poll() is not None:
                break
        if failure is None and proc.poll() is None:
            try:
                proc.wait(
                    timeout=max(0.001, wall_seconds - (time.monotonic() - started))
                )
            except subprocess.TimeoutExpired:
                failure = "timeout"
    except BaseException as error:
        interrupted = error
        failure = (
            "cancelled"
            if isinstance(error, (SystemExit, KeyboardInterrupt))
            else "supervision_error"
        )
    finally:
        # Repeated TERM during owned teardown must not interrupt reclamation.
        if old_term is not None:
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
        deadline = time.monotonic() + cleanup_seconds
        signaled = []
        live = {}
        if proc is not None:
            if birth is not None:
                live = _scan_owned(proc.pid, birth[0][1], owned)
            elif proc.poll() is None:
                # An unreaped direct child's PID cannot be reused; its private
                # supervisor performs birth-checked descendant teardown itself.
                proc.terminate()
            for sig in (signal.SIGTERM, signal.SIGKILL):
                for pid, ident in live.items():
                    entry = _identity(pid)
                    if entry and entry[0] == ident:
                        try:
                            os.kill(pid, sig)
                            signaled.append(
                                {
                                    "pid": pid,
                                    "start_ticks": ident[1],
                                    "signal": sig.name,
                                }
                            )
                        except ProcessLookupError:
                            pass
                grace = min(deadline, time.monotonic() + 0.5)
                while time.monotonic() < grace:
                    proc.poll()
                    live = (
                        _scan_owned(proc.pid, birth[0][1], owned)
                        if birth is not None
                        else {}
                    )
                    if not live and proc.returncode is not None:
                        break
                    time.sleep(0.01)
            try:
                proc.wait(timeout=max(0.001, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                pass
        try:
            supervisor_report = json.loads(Path(report_name).read_text())
        except (OSError, ValueError):
            supervisor_report = {
                "complete": False,
                "error": "missing_supervisor_report",
            }
        Path(report_name).unlink(missing_ok=True)
        zombies = [
            pid
            for pid, ident in owned.items()
            if (entry := _identity(pid)) and entry[0] == ident and entry[3] == "Z"
        ]
        cleanup = {
            "complete": proc is not None
            and not live
            and not zombies
            and proc.returncode is not None
            and supervisor_report.get("complete") is True,
            "supervisor": supervisor_report,
            "leader_reaped": proc is not None and proc.returncode is not None,
            "remaining_live_pids": list(live),
            "signals": signaled,
            "zombie_pids": zombies,
        }
        if selector is not None:
            for key in list(selector.get_map().values()):
                if key.data != "stdin":
                    while True:
                        try:
                            data = os.read(key.fd, 65536)
                        except (BlockingIOError, OSError):
                            break
                        if not data:
                            break
                        remaining = output_bytes - sum(
                            len(item) for item in buffers.values()
                        )
                        buffers[key.data].extend(data[:remaining])
                        if len(data) > remaining:
                            failure = "output_limit"
                            break
            selector.close()
        if proc is not None:
            for stream in (proc.stdin, proc.stdout, proc.stderr):
                if stream is not None:
                    stream.close()
        if old_term is not None:
            signal.signal(signal.SIGTERM, old_term)
    result = {
        "stdout": bytes(buffers["stdout"]),
        "stderr": bytes(buffers["stderr"]),
        "returncode": None if proc is None else proc.returncode,
        "failure": failure,
        "cleanup": cleanup,
        "pid": None if proc is None else proc.pid,
        "start_ticks": None if birth is None else birth[0][1],
        "elapsed_ms": (time.monotonic() - started) * 1000,
    }
    if interrupted is not None:
        interrupted.process_evidence = result
        raise interrupted
    return result


def _validate(request: HostRequest, limits: HostLimits):
    if request.fixture_command is not None and (
        not isinstance(request.fixture_command, tuple)
        or not request.fixture_command
        or not all(
            isinstance(arg, str) and "\0" not in arg for arg in request.fixture_command
        )
        or not request.fixture_command[0]
    ):
        raise ValueError("nonempty fixture argv tuple required")
    if (
        request.arm not in ("baseline", "current", "candidate")
        or type(request.repetition) is not int
        or request.repetition < 1
    ):
        raise ValueError("invalid arm/repetition")
    if not all(
        isinstance(text, str) and text.strip()
        for text in (request.case_id, request.model, request.effort)
    ):
        raise ValueError("case/model/effort required")
    if request.runtime not in ("codex-exec-json", "codex-app-server"):
        raise ValueError("unsupported runtime")
    if len(request.oracle_digest) != 64 or any(
        c not in "0123456789abcdef" for c in request.oracle_digest
    ):
        raise ValueError("oracle digest must be sha256")
    if set(request.prompt_packet) - {"prompt", "source_facts"} or not isinstance(
        request.prompt_packet.get("prompt"), str
    ):
        raise ValueError("public prompt packet only; oracle/scenario labels forbidden")
    if limits.request_limit != 1 or limits.allowed_operations:
        raise ValueError("one request and text-only operation contract supported")

    def reject_oracle(value):
        if isinstance(value, Mapping):
            if set(value) & {
                "scenario",
                "should_trigger",
                "required_events",
                "forbidden_events",
                "rationalization_traps",
                "oracle",
                "oracle_digest",
                "expected_events",
                "expected_answer",
            }:
                raise ValueError("oracle fields forbidden in public source facts")
            for item in value.values():
                reject_oracle(item)
        elif isinstance(value, (tuple, list)):
            for item in value:
                reject_oracle(item)

    reject_oracle(request.prompt_packet)
    # Validate limits before creating evidence or launching anything.
    for value in (limits.wall_seconds, limits.cleanup_seconds):
        if type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
            raise ValueError("positive finite deadlines required")
    if type(limits.output_bytes) is not int or limits.output_bytes <= 0:
        raise ValueError("positive output bound required")
    sources = []
    seen = set()
    for source in request.instruction_manifest:
        if set(source) != {"path", "sha256", "kind", "arm"} or source["kind"] not in (
            "instruction",
            "dependency",
        ):
            raise ValueError(
                "exact instruction/dependency manifest required; oracle forbidden"
            )
        if source["arm"] not in ("shared", request.arm):
            raise ValueError("other arm instruction leak")
        path = Path(source["path"])
        if (
            not path.is_absolute()
            or path.is_symlink()
            or not path.is_file()
            or str(path.resolve()) in seen
        ):
            raise ValueError("unique absolute regular source files required")
        seen.add(str(path.resolve()))
        raw = path.read_bytes()
        if _hash(raw) != source["sha256"]:
            raise ValueError("manifest source hash mismatch")
        sources.append({**dict(source), "text": raw.decode("utf-8")})
    if request.runtime == "codex-app-server":
        import skill_eval_app_server as native

        native.validate_request(
            _json(dict(request.prompt_packet)),
            model=request.model,
            effort=request.effort,
            limits=limits,
        )
    return sources


def runtime_source_paths():
    """All capture implementation dependencies, also frozen by the verifier."""
    return tuple(
        Path(__file__).with_name(name).resolve()
        for name in (
            "skill_eval_host.py",
            "skill_eval_process.py",
            "skill_eval_app_server.py",
        )
    )


def _parse(raw: bytes, request: HostRequest, sources: list[dict]):
    failures = []
    usage = None
    thread = None
    terminal = False
    metadata = {}
    tools = 0
    reroutes = []
    outputs = []
    completed_items = set()
    pending_items = set()
    attempted_tools = set()
    try:
        events = [
            json.loads(line)
            for line in raw.decode("utf-8").splitlines()
            if line.strip()
        ]
    except (UnicodeError, json.JSONDecodeError):
        return {
            "failures": ["invalid_event_stream"],
            "usage": None,
            "model": {"requested": request.model, "reported": None, "reroutes": []},
            "instruction_sources": None,
            "tool_calls": None,
            "thread_id": None,
            "output": [],
            "terminal": False,
        }
    for event in events:
        if not isinstance(event, dict) or not isinstance(event.get("type"), str):
            failures.append("invalid_event")
            continue
        kind = event["type"]
        if kind not in {
            "fixture.metadata",
            "thread.started",
            "turn.started",
            "item.started",
            "item.updated",
            "item.completed",
            "turn.completed",
            "turn.failed",
            "error",
            "model.rerouted",
            "model.reroute",
        }:
            failures.append("unsupported_event")
        if thread and event.get("thread_id", thread) != thread:
            failures.append("mixed_thread")
        if terminal:
            failures.append("event_after_terminal")
        if kind == "fixture.metadata" and request.fixture_command:
            if metadata:
                failures.append("duplicate_metadata")
            metadata = event
        elif kind == "thread.started":
            if thread or not isinstance(event.get("thread_id"), str):
                failures.append("duplicate_or_missing_thread")
            thread = event.get("thread_id")
        elif kind in ("model.rerouted", "model.reroute"):
            reroutes.append(event)
            failures.append("model_rerouted")
        elif kind in ("item.started", "item.updated", "item.completed"):
            item = event.get("item")
            if (
                not isinstance(item, dict)
                or not isinstance(item.get("id"), str)
                or not isinstance(item.get("type"), str)
            ):
                failures.append("invalid_item")
                continue
            item_id, item_type = item["id"], item["type"]
            if item_type not in {
                "agent_message",
                "reasoning",
                "command_execution",
                "file_change",
                "mcp_tool_call",
                "web_search",
                "todo_list",
                "error",
            }:
                failures.append("unsupported_item")
            if item_type not in {"agent_message", "reasoning"}:
                attempted_tools.add(item_id)
                failures.append("disallowed_operation")
            if kind == "item.started":
                if item_id in pending_items or item_id in completed_items:
                    failures.append("duplicate_item")
                pending_items.add(item_id)
            elif kind == "item.updated":
                if item_id not in pending_items:
                    failures.append("orphan_item_update")
            else:
                if item_id in completed_items:
                    failures.append("duplicate_item")
                completed_items.add(item_id)
                pending_items.discard(item_id)
                if item_type == "agent_message":
                    outputs.append(item.get("text"))
                elif item_type == "error":
                    failures.append("provider_failure")
        elif kind == "turn.completed":
            terminal = True
            usage = event.get("usage")
        elif kind in ("turn.failed", "error"):
            failures.append("provider_failure")
    tools = len(attempted_tools)
    if pending_items:
        failures.append("incomplete_item_lifecycle")
    if not terminal:
        failures.append("missing_terminal")
    if not thread:
        failures.append("missing_thread")
    if not isinstance(usage, dict) or any(
        type(usage.get(k)) is not int or usage[k] < 0
        for k in ("input_tokens", "cached_input_tokens", "output_tokens")
    ):
        failures.append("incomplete_usage")
        usage = None
    elif usage["cached_input_tokens"] > usage["input_tokens"]:
        failures.append("invalid_usage")
    if metadata.get("usage_scope") != "turn":
        failures.append("unknown_usage_scope")
    reported = metadata.get("model")
    if not reported:
        failures.append("missing_reported_model")
    elif reported != request.model:
        failures.append("model_mismatch")
    if metadata.get("effort") != request.effort:
        failures.append("effort_unverified")
    actual = metadata.get("instruction_sources")
    if actual != [item["path"] for item in sources]:
        failures.append("instruction_sources_unverified")
    if not metadata.get("tool_counter_complete"):
        failures.append("incomplete_action_counters")
    if tools:
        failures.append("disallowed_operation")
    if not outputs or any(not isinstance(item, str) for item in outputs):
        failures.append("missing_output")
    return {
        "failures": failures,
        "usage": None
        if usage is None
        else {**usage, "scope": metadata.get("usage_scope")},
        "model": {
            "requested": request.model,
            "reported": reported,
            "requested_effort": request.effort,
            "reported_effort": metadata.get("effort"),
            "reroutes": reroutes,
            "backend_snapshot": "unavailable",
        },
        "instruction_sources": actual,
        "tool_calls": tools if metadata.get("tool_counter_complete") else None,
        "thread_id": thread,
        "terminal": terminal,
        "output": outputs,
    }


def capture_run(
    request: HostRequest, *, output_dir: Path, limits: HostLimits
) -> HostRun:
    sources = _validate(request, limits)
    output_dir = Path(output_dir).resolve()
    if output_dir.exists():
        raise FileExistsError(output_dir)
    work = (
        Path(tempfile.mkdtemp(prefix="skill-eval-", dir="/tmp"))
        if request.cwd is None
        else request.cwd.resolve()
    )
    if (
        not work.is_dir()
        or output_dir.is_relative_to(work)
        or any((parent / "AGENTS.md").exists() for parent in (work, *work.parents))
        or any(work.iterdir())
    ):
        if request.cwd is None:
            shutil.rmtree(work)
        raise ValueError("isolated empty cwd without upward instructions required")
    output_dir.mkdir(parents=True, exist_ok=False)
    run_id = str(uuid.uuid4())
    manifest = {
        key: value
        for key, value in dataclasses.asdict(request).items()
        if key not in ("fixture_command", "cwd")
    }
    manifest["cwd"] = None if request.cwd is None else str(request.cwd.resolve())
    manifest["limits"] = dataclasses.asdict(limits)
    manifest_digest = _hash(_json(manifest))
    payload = {
        "prompt": request.prompt_packet["prompt"],
        "source_facts": request.prompt_packet.get("source_facts"),
        "sources": sources,
    }
    encoded = _json(payload)
    (output_dir / "payload.json").write_bytes(encoded)
    (output_dir / "manifest.json").write_bytes(_json(manifest))
    runtime_paths = runtime_source_paths()
    if request.runtime != "codex-app-server":
        runtime_paths = tuple(
            p for p in runtime_paths if p.name != "skill_eval_app_server.py"
        )
    runtime_sources = {str(p): _hash(p.read_bytes()) for p in runtime_paths}
    (output_dir / "runtime-sources.json").write_bytes(_json(runtime_sources))
    runtime_artifacts = []
    for path in runtime_paths:
        name = "runtime-" + path.name
        (output_dir / name).write_bytes(path.read_bytes())
        runtime_artifacts.append(("source:" + path.name, name))
    failures = []
    executable = shutil.which(request.executable)
    version = None
    if request.runtime == "codex-app-server":
        import skill_eval_app_server as native

        argv = [sys.executable, native.__file__]
    elif request.fixture_command is not None:
        argv = list(request.fixture_command)
        executable = shutil.which(argv[0])
    else:
        if executable is None:
            argv = [request.executable]
        else:
            version_result = run_owned_process(
                [executable, "--version"],
                b"",
                wall_seconds=5,
                output_bytes=4096,
                cleanup_seconds=2,
            )
            if version_result["returncode"] == 0 and not version_result["failure"]:
                version = (
                    version_result["stdout"].decode("utf-8", errors="replace").strip()
                )
            argv = [
                executable,
                "exec",
                "--json",
                "--skip-git-repo-check",
                "--sandbox",
                "read-only",
                "--model",
                request.model,
                "-c",
                f"model_reasoning_effort={json.dumps(request.effort)}",
                "-",
            ]
        # CLI system/global sources are not a proven isolated context.
        failures.append("live_isolation_unverified")
    interrupted = None
    parsed = None
    executable_hash = _hash(Path(executable).read_bytes()) if executable else None
    try:
        if request.runtime == "codex-app-server":
            result = native.capture_transport(
                request.executable,
                encoded,
                model=request.model,
                effort=request.effort,
                cwd=work,
                limits=limits,
                fixture_command=request.fixture_command,
            )
            process, parsed = result["process"], result["evidence"]
            version = parsed.get("native_controls", {}).get("version")
        else:
            process = run_owned_process(
                argv,
                encoded,
                cwd=work,
                wall_seconds=limits.wall_seconds,
                output_bytes=limits.output_bytes,
                cleanup_seconds=limits.cleanup_seconds,
            )
    except OSError as error:
        if hasattr(error, "process_evidence"):
            process = error.process_evidence
        else:
            process = {
                "stdout": b"",
                "stderr": str(error).encode(),
                "returncode": None,
                "failure": "launch_failed",
                "cleanup": {"complete": False, "leader_reaped": False},
                "elapsed_ms": 0,
            }
    except BaseException as error:
        if not hasattr(error, "process_evidence"):
            raise
        interrupted = error
        process = error.process_evidence
    finally:
        if request.cwd is None:
            shutil.rmtree(work)
    for name in ("stdout", "stderr"):
        (output_dir / f"raw.{name}").write_bytes(process[name])
    if parsed is None:
        if request.runtime == "codex-app-server":
            parsed = {
                "failures": ["missing_native_summary"],
                "usage": None,
                "model": {"requested": request.model, "reported": None},
                "output": [],
                "terminal": False,
                "tool_calls": None,
                "instruction_sources": None,
                "thread_id": None,
            }
        else:
            parsed = _parse(process["stdout"], request, sources)
    failures.extend(parsed.pop("failures"))
    if process["failure"]:
        failures.append(process["failure"])
    if process["returncode"] != 0:
        failures.append("nonzero_exit")
    if not process["cleanup"]["complete"]:
        failures.append("cleanup_incomplete")
    for source in sources:
        try:
            unchanged = _hash(Path(source["path"]).read_bytes()) == source["sha256"]
        except OSError:
            unchanged = False
        if not unchanged:
            failures.append("source_changed")
    for path, digest in runtime_sources.items():
        try:
            unchanged = (
                not Path(path).is_symlink() and _hash(Path(path).read_bytes()) == digest
            )
        except OSError:
            unchanged = False
        if not unchanged:
            failures.append("runtime_source_changed")
    try:
        final_executable_hash = (
            _hash(Path(executable).read_bytes()) if executable else None
        )
    except OSError:
        final_executable_hash = None
    if final_executable_hash != executable_hash:
        failures.append("executable_changed")
    artifacts = {}
    for key, name in [
        ("stdout", "raw.stdout"),
        ("stderr", "raw.stderr"),
        ("payload", "payload.json"),
        ("manifest", "manifest.json"),
        ("runtime_sources", "runtime-sources.json"),
        *runtime_artifacts,
    ]:
        raw = (output_dir / name).read_bytes()
        artifacts[key] = {"path": name, "sha256": _hash(raw), "bytes": len(raw)}
    record = {
        "schema": "forgewright-skill-host-run/v1",
        "run_id": run_id,
        "manifest_digest": manifest_digest,
        "case_id": request.case_id,
        "arm": request.arm,
        "repetition": request.repetition,
        "fixture": request.fixture_command is not None,
        "runtime": request.runtime,
        "executable": {
            "path": executable,
            "sha256": final_executable_hash,
            "version": version,
            "argv": argv,
            "cwd": str(work),
        },
        "artifacts": artifacts,
        "runtime_sources": runtime_sources,
        "failures": list(dict.fromkeys(failures)),
        **parsed,
        "cleanup": process["cleanup"],
        "process_exit": process["returncode"],
        "elapsed_ms": process["elapsed_ms"],
        "submitted_context_bytes": len(encoded),
        "context_byte_definition": (
            "UTF-8 canonical experiment packet bytes; excludes fixed native scaffold and provider/system/global context"
            if request.runtime == "codex-app-server"
            else "UTF-8 canonical JSON bytes sent to child stdin; excludes provider/system/global context"
        ),
        "full_provider_context_bytes": None,
        "price": "unavailable",
        "billing_scope": "unavailable",
        "requests": parsed.get("generation_requests", 1),
        "request_scope": "host-submitted model turns; upstream network retries unobserved",
        "allowed_operations": list(limits.allowed_operations),
    }
    success = not record["failures"]
    eligible = success and request.fixture_command is None
    record.update(success=success, promotion_eligible=bool(eligible))
    serialized = _json(record)
    (output_dir / "run.json").write_bytes(serialized)
    result = HostRun(
        run_id, manifest_digest, _freeze(record), output_dir, success, bool(eligible)
    )
    _ISSUED[run_id] = (result, _hash(serialized))
    if interrupted is not None:
        interrupted.host_run = result
        raise interrupted
    return result


def verify_issued_run(run: HostRun, *, manifest_digest: str | None = None) -> bool:
    """Out-of-band identity plus immutable source/evidence checks; no JSON trust."""
    issued = _ISSUED.get(run.run_id)
    if (
        issued is None
        or issued[0] is not run
        or (manifest_digest and manifest_digest != run.manifest_digest)
    ):
        return False
    try:
        raw = (run.output_dir / "run.json").read_bytes()
        if _hash(raw) != issued[1] or _json(_plain(run.record)) != raw:
            return False
        for artifact in run.record["artifacts"].values():
            path = run.output_dir / artifact["path"]
            if (
                path.is_symlink()
                or path.parent.resolve() != run.output_dir
                or _hash(path.read_bytes()) != artifact["sha256"]
            ):
                return False
        for path, digest in run.record["runtime_sources"].items():
            if Path(path).is_symlink() or _hash(Path(path).read_bytes()) != digest:
                return False
        manifest = json.loads((run.output_dir / "manifest.json").read_bytes())
        for source in manifest["instruction_manifest"]:
            if _hash(Path(source["path"]).read_bytes()) != source["sha256"]:
                return False
        return True
    except (OSError, ValueError, KeyError, TypeError):
        return False
