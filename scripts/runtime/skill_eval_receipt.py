#!/usr/bin/env python3
"""Standardized run receipt, event stream, and isolated runner for RF01.

Enforces:
- Exactly one terminal outcome per run:
  accepted | failed | blocked | timeout | cancelled | malformed_output
  | provider_error | environment_error
- Distinct error classification (provider_error, environment_error, acceptance_failure)
- Unobserved token/cost values remain 'unknown', never 0
- Independent verifier evaluation: agent printing 'PASS' never certifies acceptance
- Complete descendant process cleanup on timeout/cancel via Windows Job Object
  (WindowsJobClient) on Windows or process-group teardown on POSIX
- Local JSONL receipt and event logging without requiring an external dashboard
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

RECEIPT_SCHEMA = "forgewright-eval-run-receipt/v1"
EVENT_SCHEMA = "forgewright-eval-event/v1"

TERMINAL_OUTCOMES = (
    "accepted",
    "failed",
    "blocked",
    "timeout",
    "cancelled",
    "malformed_output",
    "provider_error",
    "environment_error",
)

ERROR_CATEGORIES = (
    "none",
    "acceptance_failure",
    "provider_error",
    "environment_error",
    "policy_blocked",
    "timeout",
    "cancelled",
    "malformed_output",
)

EVENT_KINDS = (
    "admitted",
    "started",
    "tool_result",
    "cancelled",
    "verification_result",
    "terminal",
)


class RunReceiptError(ValueError):
    """Raised when a run receipt, event stream, or runner specification is invalid."""


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def sha256_hex(value: bytes | str) -> str:
    raw = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(raw).hexdigest()


def normalize_usage(raw_usage: Mapping[str, Any] | None) -> dict[str, Any]:
    """Normalize usage while keeping unobserved token/cost fields as 'unknown'."""
    if not isinstance(raw_usage, Mapping):
        return {
            "input_tokens": "unknown",
            "output_tokens": "unknown",
            "cached_input_tokens": "unknown",
            "thinking_tokens": "unknown",
            "total_tokens": "unknown",
            "cost_usd": "unknown",
            "scope": "unavailable",
        }

    def _tok(key: str) -> int | str:
        val = raw_usage.get(key)
        if type(val) is int and val >= 0:
            return val
        return "unknown"

    inp = _tok("input_tokens")
    out = _tok("output_tokens")
    cached = _tok("cached_input_tokens")
    if cached == "unknown":
        cached = _tok("cache_read_tokens")
    thinking = _tok("thinking_tokens")
    total = _tok("total_tokens")
    if total == "unknown" and isinstance(inp, int) and isinstance(out, int):
        total = inp + out
    cost = raw_usage.get("cost_usd")
    if (
        type(cost) not in (int, float)
        or isinstance(cost, bool)
        or not math.isfinite(cost)
        or cost < 0
    ):
        cost_val: float | str = "unknown"
    else:
        cost_val = float(cost)
    scope = raw_usage.get("scope")
    if not isinstance(scope, str) or not scope.strip():
        scope = "turn" if isinstance(inp, int) and isinstance(out, int) else "unavailable"
    return {
        "input_tokens": inp,
        "output_tokens": out,
        "cached_input_tokens": cached,
        "thinking_tokens": thinking,
        "total_tokens": total,
        "cost_usd": cost_val,
        "scope": scope,
    }


@dataclass(frozen=True)
class EvalTaskSpec:
    task_id: str
    arm: str
    prompt: str
    command: tuple[str, ...]
    verifier_command: tuple[str, ...] | None = None
    verifier_independent: bool = True
    expected_json_fields: tuple[str, ...] = ()
    model_requested: str = "unknown"
    effort_requested: str = "unknown"
    host_kind: str = "local-isolated-runner"
    host_version: str = "unknown"
    repo_sha: str = "unknown"
    config_digest: str = "unknown"
    instruction_sources: tuple[str, ...] = ()
    tool_sources: tuple[str, ...] = ()
    timeout_seconds: float = 30.0
    verifier_timeout_seconds: float | None = None
    output_limit_bytes: int = 1024 * 1024
    blocked_reason: str | None = None
    cancel_after_seconds: float | None = None
    cwd: Path | None = None


def _execute_bounded_process(
    argv: Sequence[str],
    stdin_bytes: bytes,
    *,
    cwd: Path,
    timeout_seconds: float,
    output_limit_bytes: int,
    cancel_after_seconds: float | None = None,
) -> dict[str, Any]:
    """Run argv in an isolated process group or Windows Job Object and reap all descendants."""
    started = time.monotonic()
    if not argv or not all(isinstance(x, str) and x for x in argv):
        return {
            "exit_code": None,
            "stdout": b"",
            "stderr": b"invalid command argv",
            "elapsed_ms": 0.0,
            "failure": "environment_error",
            "cleanup_complete": True,
        }

    if os.name == "nt":
        runtime_dir = Path(__file__).resolve().parent
        if str(runtime_dir) not in sys.path:
            sys.path.insert(0, str(runtime_dir))
        from bootstrap_manager import bootstrap_home
        from windows_job_client import CompletionError, WindowsJobClient

        client = WindowsJobClient(parent=bootstrap_home())
        proc = None
        stdin_file: Path | None = None
        chunks = [bytearray(), bytearray()]
        lock = threading.Lock()
        overflow = threading.Event()
        read_failed = threading.Event()
        readers: list[threading.Thread] = []
        failure: str | None = None
        cleanup_complete = False
        try:
            client.prepare()
            # windows_job_supervisor.py uses its own stdin pipe as the owner
            # cancellation signal (any byte or EOF cancels the job). Deliver
            # workload stdin via a dedicated private temp file opened by a
            # thin wrapper inside the supervised job.
            fd, stdin_path = tempfile.mkstemp(prefix="fw-eval-stdin-", suffix=".bin")
            stdin_file = Path(stdin_path)
            try:
                with os.fdopen(fd, "wb") as fh:
                    if stdin_bytes:
                        fh.write(stdin_bytes)
                    fh.flush()
            except BaseException:
                stdin_file.unlink(missing_ok=True)
                raise
            feeder_code = (
                "import subprocess, sys\n"
                "with open(sys.argv[1], 'rb') as fh:\n"
                "    raise SystemExit(subprocess.run(sys.argv[2:], stdin=fh, check=False).returncode)\n"
            )
            wrapped_argv = [sys.executable, "-I", "-B", "-X", "utf8", "-c", feeder_code, str(stdin_file), *argv]
            proc = subprocess.Popen(
                client.supervisor_argv(wrapped_argv),
                cwd=str(cwd),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )

            def _collect(stream, idx: int) -> None:
                try:
                    while True:
                        data = stream.read(4096)
                        if not data:
                            return
                        with lock:
                            if len(chunks[0]) + len(chunks[1]) + len(data) > output_limit_bytes:
                                overflow.set()
                                return
                            chunks[idx].extend(data)
                except OSError:
                    read_failed.set()

            for idx, stream in enumerate((proc.stdout, proc.stderr)):
                t = threading.Thread(target=_collect, args=(stream, idx), daemon=True)
                readers.append(t)
                t.start()

            deadline = started + timeout_seconds
            cancel_at = (
                started + cancel_after_seconds
                if cancel_after_seconds is not None
                else None
            )
            while proc.poll() is None:
                now = time.monotonic()
                if cancel_at is not None and now >= cancel_at:
                    failure = "cancelled"
                    proc.stdin.close()
                    break
                if now >= deadline:
                    failure = "timeout"
                    proc.stdin.close()
                    break
                if overflow.is_set():
                    failure = "output_limit"
                    proc.stdin.close()
                    break
                if read_failed.is_set():
                    failure = "environment_error"
                    proc.stdin.close()
                    break
                time.sleep(0.01)

            try:
                code = proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=2)
                failure = failure or "timeout"
                code = proc.returncode
            try:
                client.validate(code)
                cleanup_complete = True
            except CompletionError:
                # Never infer cleanup proof from an exit code when the signed
                # completion receipt is missing, invalid, or mismatched.
                cleanup_complete = False
            for t in readers:
                t.join(timeout=1)
        except OSError as exc:
            return {
                "exit_code": None,
                "stdout": b"",
                "stderr": str(exc).encode("utf-8", errors="replace"),
                "elapsed_ms": round((time.monotonic() - started) * 1000, 3),
                "failure": "environment_error",
                "cleanup_complete": True,
            }
        finally:
            if proc is not None:
                try:
                    proc.stdin.close()
                except OSError:
                    pass
                if proc.poll() is None:
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=2)
                for t in readers:
                    t.join(timeout=1)
                for s in (proc.stdout, proc.stderr):
                    if s is not None:
                        try:
                            s.close()
                        except OSError:
                            pass
            try:
                client.cleanup()
            except Exception:
                cleanup_complete = False
            if stdin_file is not None:
                stdin_file.unlink(missing_ok=True)
        return {
            "exit_code": code,
            "stdout": bytes(chunks[0]),
            "stderr": bytes(chunks[1]),
            "elapsed_ms": round((time.monotonic() - started) * 1000, 3),
            "failure": failure,
            "cleanup_complete": cleanup_complete,
        }

    # POSIX process-group execution
    proc = None
    chunks = [bytearray(), bytearray()]
    lock = threading.Lock()
    overflow = threading.Event()
    readers = []
    failure = None
    cleanup_complete = False
    try:
        proc = subprocess.Popen(
            list(argv),
            cwd=str(cwd),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        if stdin_bytes and proc.stdin is not None:
            try:
                proc.stdin.write(stdin_bytes)
            except BrokenPipeError:
                pass
        if proc.stdin is not None:
            proc.stdin.close()

        def _collect_posix(stream, idx: int) -> None:
            while True:
                data = stream.read(4096)
                if not data:
                    return
                with lock:
                    if len(chunks[0]) + len(chunks[1]) + len(data) > output_limit_bytes:
                        overflow.set()
                        return
                    chunks[idx].extend(data)

        for idx, stream in enumerate((proc.stdout, proc.stderr)):
            t = threading.Thread(target=_collect_posix, args=(stream, idx), daemon=True)
            readers.append(t)
            t.start()

        deadline = started + timeout_seconds
        cancel_at = (
            started + cancel_after_seconds
            if cancel_after_seconds is not None
            else None
        )
        while proc.poll() is None:
            now = time.monotonic()
            if cancel_at is not None and now >= cancel_at:
                failure = "cancelled"
                break
            if now >= deadline:
                failure = "timeout"
                break
            if overflow.is_set():
                failure = "output_limit"
                break
            time.sleep(0.01)

        if failure is not None and proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                proc.wait(timeout=1.0)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                proc.wait(timeout=2.0)
        else:
            proc.wait(timeout=2.0)
        for t in readers:
            t.join(timeout=1.0)
        cleanup_complete = proc.returncode is not None
        return {
            "exit_code": proc.returncode,
            "stdout": bytes(chunks[0]),
            "stderr": bytes(chunks[1]),
            "elapsed_ms": round((time.monotonic() - started) * 1000, 3),
            "failure": failure,
            "cleanup_complete": cleanup_complete,
        }
    except OSError as exc:
        return {
            "exit_code": None,
            "stdout": b"",
            "stderr": str(exc).encode("utf-8", errors="replace"),
            "elapsed_ms": round((time.monotonic() - started) * 1000, 3),
            "failure": "environment_error",
            "cleanup_complete": True,
        }
    finally:
        if proc is not None:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except Exception:
                pass
            for s in (proc.stdout, proc.stderr):
                if s is not None:
                    try:
                        s.close()
                    except OSError:
                        pass


def _observe_git_provenance(cwd: Path) -> dict[str, Any]:
    head_sha = "unknown"
    dirty: bool | str = "unknown"
    try:
        head_sha = subprocess.check_output(
            ["git", "-C", str(cwd), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=5,
        ).strip() or "unknown"
        status_out = subprocess.check_output(
            ["git", "-C", str(cwd), "status", "--porcelain"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
        dirty = bool(status_out.strip())
    except Exception:
        pass
    return {"observed_head_sha": head_sha, "worktree_dirty": dirty}


def validate_receipt(receipt: Mapping[str, Any]) -> None:
    """Validate standardized RF01 run receipt structure and invariants."""
    if not isinstance(receipt, Mapping):
        raise RunReceiptError("receipt must be a mapping")
    if receipt.get("schema") != RECEIPT_SCHEMA:
        raise RunReceiptError(f"receipt.schema must be {RECEIPT_SCHEMA}")
    required = {
        "schema",
        "run_id",
        "task_id",
        "arm",
        "repo_sha",
        "config_digest",
        "host",
        "model",
        "instruction_sources",
        "tool_sources",
        "commands",
        "wall_time_ms",
        "terminal_outcome",
        "error_category",
        "verifier",
        "usage",
        "cleanup",
        "events",
        "evidence_paths",
        "artifact_digests",
    }
    missing = sorted(required - set(receipt))
    if missing:
        raise RunReceiptError(f"receipt missing required fields: {missing}")
    if receipt["terminal_outcome"] not in TERMINAL_OUTCOMES:
        raise RunReceiptError(f"invalid terminal_outcome: {receipt['terminal_outcome']!r}")
    if receipt["error_category"] not in ERROR_CATEGORIES:
        raise RunReceiptError(f"invalid error_category: {receipt['error_category']!r}")
    events = receipt["events"]
    if not isinstance(events, list) or not events:
        raise RunReceiptError("receipt.events must be a non-empty list")
    terminal_events = [e for e in events if isinstance(e, Mapping) and e.get("kind") == "terminal"]
    if len(terminal_events) != 1 or events[-1].get("kind") != "terminal":
        raise RunReceiptError("receipt must contain exactly one terminal event at the end of events")
    if terminal_events[0].get("outcome") != receipt["terminal_outcome"]:
        raise RunReceiptError("terminal event outcome must match receipt.terminal_outcome")
    usage = receipt["usage"]
    if not isinstance(usage, Mapping):
        raise RunReceiptError("receipt.usage must be a mapping")
    for key in ("input_tokens", "output_tokens", "total_tokens", "cost_usd"):
        val = usage.get(key)
        if val != "unknown" and (isinstance(val, bool) or not isinstance(val, (int, float)) or val < 0):
            raise RunReceiptError(f"usage.{key} must be non-negative number or 'unknown'")
    if receipt["terminal_outcome"] == "accepted":
        verifier = receipt["verifier"]
        if not isinstance(verifier, Mapping) or verifier.get("passed") is not True:
            raise RunReceiptError("accepted outcome requires independent verifier.passed == True")
        if verifier.get("independent") is not True:
            raise RunReceiptError("accepted outcome requires independent verifier")
        if not isinstance(receipt["cleanup"], Mapping) or receipt["cleanup"].get("complete") is not True:
            raise RunReceiptError("accepted outcome requires confirmed process cleanup")


def execute_eval_run(
    spec: EvalTaskSpec,
    *,
    output_dir: Path,
    jsonl_log_path: Path | None = None,
) -> dict[str, Any]:
    """Execute one isolated task attempt + independent verifier and emit an RF01 receipt."""
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    run_id = f"run-{uuid.uuid4()}"
    events: list[dict[str, Any]] = []
    t0 = time.monotonic()

    def _record_event(kind: str, **payload: Any) -> None:
        if kind not in EVENT_KINDS:
            raise RunReceiptError(f"unsupported event kind: {kind}")
        if any(e["kind"] == "terminal" for e in events):
            raise RunReceiptError("cannot emit event after terminal event")
        events.append(
            {
                "schema": EVENT_SCHEMA,
                "run_id": run_id,
                "task_id": spec.task_id,
                "seq": len(events) + 1,
                "kind": kind,
                "elapsed_ms": round((time.monotonic() - t0) * 1000, 3),
                **payload,
            }
        )

    work_dir = (
        Path(tempfile.mkdtemp(prefix="fw-eval-work-"))
        if spec.cwd is None
        else Path(spec.cwd).resolve()
    )
    owns_work_dir = spec.cwd is None

    stdout_path = output_dir / "agent.stdout"
    stderr_path = output_dir / "agent.stderr"
    verifier_stdout_path = output_dir / "verifier.stdout"
    verifier_stderr_path = output_dir / "verifier.stderr"
    receipt_path = output_dir / "receipt.json"
    events_path = output_dir / "events.jsonl"

    model_resolved = "unknown"
    effort_resolved = "unknown"
    usage = normalize_usage(None)
    verifier_info: dict[str, Any] = {
        "executed": False,
        "independent": True,
        "command": list(spec.verifier_command) if spec.verifier_command else None,
        "exit_code": None,
        "passed": False,
        "reason": "not_run",
    }
    cleanup_info: dict[str, Any] = {"complete": True}
    terminal_outcome = "failed"
    error_category = "acceptance_failure"

    try:
        if spec.blocked_reason:
            _record_event("admitted", admitted=False, reason=spec.blocked_reason)
            terminal_outcome = "blocked"
            error_category = "policy_blocked"
            stdout_path.write_bytes(b"")
            stderr_path.write_bytes(spec.blocked_reason.encode("utf-8"))
            _record_event(
                "terminal",
                outcome=terminal_outcome,
                error_category=error_category,
            )
        else:
            _record_event("admitted", admitted=True)
            _record_event("started", command=list(spec.command))
            proc_res = _execute_bounded_process(
                spec.command,
                spec.prompt.encode("utf-8"),
                cwd=work_dir,
                timeout_seconds=spec.timeout_seconds,
                output_limit_bytes=spec.output_limit_bytes,
                cancel_after_seconds=spec.cancel_after_seconds,
            )
            stdout_path.write_bytes(proc_res["stdout"])
            stderr_path.write_bytes(proc_res["stderr"])
            cleanup_info = {"complete": bool(proc_res["cleanup_complete"])}
            _record_event(
                "tool_result",
                stage="agent_runner",
                exit_code=proc_res["exit_code"],
                failure=proc_res["failure"],
                stdout_bytes=len(proc_res["stdout"]),
                stderr_bytes=len(proc_res["stderr"]),
            )

            stdout_text = proc_res["stdout"].decode("utf-8", errors="replace").strip()
            stderr_text = proc_res["stderr"].decode("utf-8", errors="replace").strip()

            parsed_json: Mapping[str, Any] | None = None
            if stdout_text.startswith("{") and stdout_text.endswith("}"):
                try:
                    candidate_json = json.loads(stdout_text)
                    if isinstance(candidate_json, Mapping):
                        parsed_json = candidate_json
                except json.JSONDecodeError:
                    parsed_json = None

            if parsed_json is not None:
                if isinstance(parsed_json.get("model"), str) and parsed_json["model"].strip():
                    model_resolved = parsed_json["model"].strip()
                if isinstance(parsed_json.get("effort"), str) and parsed_json["effort"].strip():
                    effort_resolved = parsed_json["effort"].strip()
                if isinstance(parsed_json.get("usage"), Mapping):
                    usage = normalize_usage(parsed_json["usage"])

            if proc_res["failure"] == "cancelled":
                _record_event("cancelled", reason="cancel_requested")
                terminal_outcome = "cancelled"
                error_category = "cancelled"
            elif proc_res["failure"] == "timeout":
                terminal_outcome = "timeout"
                error_category = "timeout"
            elif proc_res["failure"] == "output_limit":
                terminal_outcome = "malformed_output"
                error_category = "malformed_output"
            elif proc_res["failure"] == "environment_error" or proc_res["exit_code"] is None:
                terminal_outcome = "environment_error"
                error_category = "environment_error"
            elif not cleanup_info["complete"]:
                terminal_outcome = "environment_error"
                error_category = "environment_error"
            elif (
                parsed_json is not None
                and parsed_json.get("error_type") in ("provider_error", "rate_limit", "auth_error")
            ) or "PROVIDER_ERROR:" in stderr_text:
                terminal_outcome = "provider_error"
                error_category = "provider_error"
            elif (
                parsed_json is not None
                and parsed_json.get("error_type") == "environment_error"
            ) or "ENVIRONMENT_ERROR:" in stderr_text:
                terminal_outcome = "environment_error"
                error_category = "environment_error"
            elif spec.expected_json_fields and (
                parsed_json is None
                or any(field not in parsed_json for field in spec.expected_json_fields)
            ):
                terminal_outcome = "malformed_output"
                error_category = "malformed_output"
            elif proc_res["exit_code"] != 0:
                terminal_outcome = "failed"
                error_category = "acceptance_failure"
            else:
                if spec.verifier_command is None:
                    verifier_info = {
                        "executed": False,
                        "independent": False,
                        "command": None,
                        "exit_code": None,
                        "passed": False,
                        "reason": "missing_independent_verifier",
                    }
                    _record_event(
                        "verification_result",
                        passed=False,
                        reason="missing_independent_verifier",
                    )
                    terminal_outcome = "failed"
                    error_category = "acceptance_failure"
                else:
                    ver_timeout = (
                        spec.verifier_timeout_seconds
                        if spec.verifier_timeout_seconds is not None
                        else spec.timeout_seconds
                    )
                    ver_res = _execute_bounded_process(
                        spec.verifier_command,
                        b"",
                        cwd=work_dir,
                        timeout_seconds=ver_timeout,
                        output_limit_bytes=spec.output_limit_bytes,
                    )
                    verifier_stdout_path.write_bytes(ver_res["stdout"])
                    verifier_stderr_path.write_bytes(ver_res["stderr"])
                    combined_cleanup = bool(proc_res["cleanup_complete"]) and bool(ver_res["cleanup_complete"])
                    cleanup_info = {
                        "complete": combined_cleanup,
                        "agent_complete": bool(proc_res["cleanup_complete"]),
                        "verifier_complete": bool(ver_res["cleanup_complete"]),
                    }
                    ver_passed = (
                        ver_res["failure"] is None
                        and ver_res["exit_code"] == 0
                        and combined_cleanup
                        and bool(spec.verifier_independent)
                    )
                    verifier_info = {
                        "executed": True,
                        "independent": bool(spec.verifier_independent),
                        "command": list(spec.verifier_command),
                        "exit_code": ver_res["exit_code"],
                        "passed": ver_passed,
                        "reason": (
                            "verified"
                            if ver_passed
                            else (
                                "cleanup_incomplete"
                                if not combined_cleanup
                                else (
                                    "verifier_not_independent"
                                    if not spec.verifier_independent
                                    else (ver_res["failure"] or "verifier_failed")
                                )
                            )
                        ),
                    }
                    _record_event(
                        "verification_result",
                        passed=ver_passed,
                        exit_code=ver_res["exit_code"],
                        reason=verifier_info["reason"],
                    )
                    if not combined_cleanup:
                        terminal_outcome = "environment_error"
                        error_category = "environment_error"
                    elif ver_res["failure"] == "timeout":
                        terminal_outcome = "timeout"
                        error_category = "timeout"
                    elif ver_passed:
                        terminal_outcome = "accepted"
                        error_category = "none"
                    else:
                        terminal_outcome = "failed"
                        error_category = "acceptance_failure"

            _record_event(
                "terminal",
                outcome=terminal_outcome,
                error_category=error_category,
            )
    finally:
        if owns_work_dir and work_dir.exists():
            import shutil

            shutil.rmtree(work_dir, ignore_errors=True)

    wall_time_ms = round((time.monotonic() - t0) * 1000, 3)
    evidence_paths = {
        "receipt": str(receipt_path),
        "events": str(events_path),
        "agent_stdout": str(stdout_path),
        "agent_stderr": str(stderr_path),
    }
    if verifier_stdout_path.exists():
        evidence_paths["verifier_stdout"] = str(verifier_stdout_path)
        evidence_paths["verifier_stderr"] = str(verifier_stderr_path)
    events_path.write_text(
        "\n".join(canonical_json_bytes(e).decode("utf-8") for e in events) + "\n",
        encoding="utf-8",
    )
    artifact_digests = {
        k: sha256_hex(Path(p).read_bytes())
        for k, p in evidence_paths.items()
        if k != "receipt" and Path(p).is_file()
    }
    if not owns_work_dir and work_dir.is_dir():
        for wf in sorted(work_dir.iterdir()):
            if wf.is_file() and wf.stat().st_size <= 1024 * 1024:
                artifact_digests[f"workspace:{wf.name}"] = sha256_hex(wf.read_bytes())
    if spec.verifier_command:
        for arg in spec.verifier_command:
            cand = Path(arg)
            if cand.is_file() and cand.suffix in {".py", ".mjs", ".js", ".ts", ".sh"}:
                artifact_digests["verifier_script"] = sha256_hex(cand.read_bytes())
                break
    git_prov = _observe_git_provenance(Path(__file__).resolve().parents[2])

    receipt: dict[str, Any] = {
        "schema": RECEIPT_SCHEMA,
        "run_id": run_id,
        "task_id": spec.task_id,
        "arm": spec.arm,
        "repo_sha": spec.repo_sha,
        "config_digest": spec.config_digest,
        "provenance": {
            "caller_repo_sha": spec.repo_sha,
            "caller_config_digest": spec.config_digest,
            **git_prov,
            "usage_source": (
                "agent_stdout_json_unattested"
                if usage.get("input_tokens") != "unknown"
                else "unobserved"
            ),
            "verifier_oracle_source": (
                "caller_supplied_command" if spec.verifier_command else "none"
            ),
        },
        "host": {
            "kind": spec.host_kind,
            "version": spec.host_version,
            "os": platform.system(),
            "arch": platform.machine(),
            "python": platform.python_version(),
        },
        "model": {
            "requested": spec.model_requested,
            "resolved": model_resolved,
            "effort_requested": spec.effort_requested,
            "effort_resolved": effort_resolved,
            "resolution_source": "agent_stdout_json_unattested" if model_resolved != "unknown" else "unobserved",
        },
        "instruction_sources": list(spec.instruction_sources),
        "tool_sources": list(spec.tool_sources),
        "commands": {
            "agent": list(spec.command),
            "verifier": list(spec.verifier_command) if spec.verifier_command else None,
        },
        "wall_time_ms": wall_time_ms,
        "terminal_outcome": terminal_outcome,
        "error_category": error_category,
        "verifier": verifier_info,
        "usage": usage,
        "cleanup": cleanup_info,
        "events": events,
        "evidence_paths": evidence_paths,
        "artifact_digests": artifact_digests,
    }
    validate_receipt(receipt)
    receipt_path.write_bytes(canonical_json_bytes(receipt) + b"\n")
    if jsonl_log_path is not None:
        jsonl_log_path = Path(jsonl_log_path)
        jsonl_log_path.parent.mkdir(parents=True, exist_ok=True)
        with jsonl_log_path.open("a", encoding="utf-8") as fh:
            fh.write(canonical_json_bytes(receipt).decode("utf-8") + "\n")
    return receipt


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec-json", required=True, help="JSON string or @file path for EvalTaskSpec")
    parser.add_argument("--output-dir", required=True, help="Directory for run evidence")
    parser.add_argument("--jsonl-log", help="Optional JSONL file to append receipt")
    args = parser.parse_args(argv)

    raw_spec = args.spec_json
    if raw_spec.startswith("@"):
        raw_spec = Path(raw_spec[1:]).read_text(encoding="utf-8")
    data = json.loads(raw_spec)
    spec = EvalTaskSpec(
        task_id=str(data["task_id"]),
        arm=str(data.get("arm", "current")),
        prompt=str(data.get("prompt", "")),
        command=tuple(str(x) for x in data["command"]),
        verifier_command=tuple(str(x) for x in data["verifier_command"])
        if data.get("verifier_command") is not None
        else None,
        verifier_independent=bool(data.get("verifier_independent", True)),
        expected_json_fields=tuple(str(x) for x in data.get("expected_json_fields", ())),
        model_requested=str(data.get("model_requested", "unknown")),
        effort_requested=str(data.get("effort_requested", "unknown")),
        host_kind=str(data.get("host_kind", "local-isolated-runner")),
        host_version=str(data.get("host_version", "unknown")),
        repo_sha=str(data.get("repo_sha", "unknown")),
        config_digest=str(data.get("config_digest", "unknown")),
        instruction_sources=tuple(str(x) for x in data.get("instruction_sources", ())),
        tool_sources=tuple(str(x) for x in data.get("tool_sources", ())),
        timeout_seconds=float(data.get("timeout_seconds", 30.0)),
        verifier_timeout_seconds=float(data["verifier_timeout_seconds"])
        if data.get("verifier_timeout_seconds") is not None
        else None,
        output_limit_bytes=int(data.get("output_limit_bytes", 1024 * 1024)),
        blocked_reason=data.get("blocked_reason"),
        cancel_after_seconds=float(data["cancel_after_seconds"])
        if data.get("cancel_after_seconds") is not None
        else None,
        cwd=Path(data["cwd"]) if data.get("cwd") else None,
    )
    receipt = execute_eval_run(
        spec,
        output_dir=Path(args.output_dir),
        jsonl_log_path=Path(args.jsonl_log) if args.jsonl_log else None,
    )
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if receipt["terminal_outcome"] == "accepted" else 1


if __name__ == "__main__":
    raise SystemExit(main())
