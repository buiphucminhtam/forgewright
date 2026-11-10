"""RF01 tests for standardized run receipts, event streams, process cleanup, and Promptfoo TS adapter."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "runtime"))

import skill_eval_receipt as receipt_mod  # noqa: E402


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return False
        try:
            code = ctypes.c_ulong()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
                return False
            return code.value == 259  # STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def test_accepted_run_requires_independent_verifier_and_records_single_terminal_event(tmp_path: Path):
    jsonl_log = tmp_path / "telemetry" / "runs.jsonl"
    spec = receipt_mod.EvalTaskSpec(
        task_id="rf01-accepted",
        arm="current",
        prompt="Fix the bug",
        command=(
            sys.executable,
            "-c",
            'import json; print(json.dumps({"status":"ok","model":"gemini-4-argon","effort":"medium","usage":{"input_tokens":120,"output_tokens":30}}))',
        ),
        verifier_command=(sys.executable, "-c", "raise SystemExit(0)"),
        expected_json_fields=("status",),
        model_requested="gemini-4-argon",
        effort_requested="medium",
        repo_sha="c1200d57",
        config_digest="cfg-123",
    )
    receipt = receipt_mod.execute_eval_run(
        spec, output_dir=tmp_path / "out", jsonl_log_path=jsonl_log
    )
    assert receipt["terminal_outcome"] == "accepted"
    assert receipt["error_category"] == "none"
    assert receipt["verifier"]["passed"] is True
    assert receipt["verifier"]["independent"] is True
    assert receipt["cleanup"]["complete"] is True
    assert receipt["usage"]["input_tokens"] == 120
    assert receipt["usage"]["output_tokens"] == 30
    assert receipt["usage"]["total_tokens"] == 150
    assert receipt["usage"]["cost_usd"] == "unknown"
    terminal_events = [e for e in receipt["events"] if e["kind"] == "terminal"]
    assert len(terminal_events) == 1
    assert jsonl_log.is_file()
    logged = json.loads(jsonl_log.read_text(encoding="utf-8").strip())
    assert logged["run_id"] == receipt["run_id"]


def test_agent_printing_pass_without_verifier_or_with_failing_verifier_is_rejected(tmp_path: Path):
    # 1. Agent prints PASS, no verifier supplied -> rejected
    spec_no_ver = receipt_mod.EvalTaskSpec(
        task_id="rf01-fake-pass-no-verifier",
        arm="current",
        prompt="Print PASS",
        command=(sys.executable, "-c", 'print("PASS")'),
        verifier_command=None,
    )
    rec1 = receipt_mod.execute_eval_run(spec_no_ver, output_dir=tmp_path / "out1")
    assert rec1["terminal_outcome"] == "failed"
    assert rec1["error_category"] == "acceptance_failure"
    assert rec1["verifier"]["passed"] is False
    assert rec1["usage"]["input_tokens"] == "unknown"
    assert rec1["usage"]["cost_usd"] == "unknown"

    # 2. Agent prints PASS, independent verifier fails -> rejected
    spec_fail_ver = receipt_mod.EvalTaskSpec(
        task_id="rf01-fake-pass-failing-verifier",
        arm="current",
        prompt="Print PASS",
        command=(sys.executable, "-c", 'print("PASS")'),
        verifier_command=(sys.executable, "-c", "raise SystemExit(1)"),
    )
    rec2 = receipt_mod.execute_eval_run(spec_fail_ver, output_dir=tmp_path / "out2")
    assert rec2["terminal_outcome"] == "failed"
    assert rec2["error_category"] == "acceptance_failure"
    assert rec2["verifier"]["passed"] is False


@pytest.mark.parametrize(
    "mode,expected_outcome,expected_category",
    [
        ("blocked", "blocked", "policy_blocked"),
        ("malformed", "malformed_output", "malformed_output"),
        ("provider_error", "provider_error", "provider_error"),
        ("environment_error", "environment_error", "environment_error"),
    ],
)
def test_distinct_failure_modes_and_unknown_usage(tmp_path: Path, mode: str, expected_outcome: str, expected_category: str):
    if mode == "blocked":
        spec = receipt_mod.EvalTaskSpec(
            task_id="rf01-blocked",
            arm="current",
            prompt="Blocked task",
            command=(sys.executable, "-c", 'print("should not run")'),
            blocked_reason="policy_denied_route",
        )
    elif mode == "malformed":
        spec = receipt_mod.EvalTaskSpec(
            task_id="rf01-malformed",
            arm="current",
            prompt="Return structured JSON",
            command=(sys.executable, "-c", 'print("not valid json")'),
            expected_json_fields=("required_field",),
            verifier_command=(sys.executable, "-c", "raise SystemExit(0)"),
        )
    elif mode == "provider_error":
        spec = receipt_mod.EvalTaskSpec(
            task_id="rf01-provider-error",
            arm="current",
            prompt="Trigger rate limit",
            command=(sys.executable, "-c", 'import sys; sys.stderr.write("PROVIDER_ERROR: HTTP 429\n"); raise SystemExit(1)'),
        )
    else:
        spec = receipt_mod.EvalTaskSpec(
            task_id="rf01-env-error",
            arm="current",
            prompt="Trigger environment error",
            command=(sys.executable, "-c", 'import sys; sys.stderr.write("ENVIRONMENT_ERROR: missing runtime\n"); raise SystemExit(1)'),
        )

    rec = receipt_mod.execute_eval_run(spec, output_dir=tmp_path / f"out-{mode}")
    assert rec["terminal_outcome"] == expected_outcome
    assert rec["error_category"] == expected_category
    assert rec["usage"]["input_tokens"] == "unknown"
    assert rec["usage"]["output_tokens"] == "unknown"
    assert rec["usage"]["cost_usd"] == "unknown"


@pytest.mark.parametrize("mode", ["timeout", "cancelled"])
def test_timeout_and_cancel_reap_spawned_descendant_processes(tmp_path: Path, mode: str):
    pid_file = tmp_path / f"child-{mode}.pid"
    worker_script = tmp_path / f"worker-{mode}.py"
    worker_script.write_text(
        f'import subprocess, sys, time\n'
        f'child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])\n'
        f'open({str(pid_file)!r}, "w", encoding="utf-8").write(str(child.pid))\n'
        f'time.sleep(30)\n',
        encoding="utf-8",
    )
    spec = receipt_mod.EvalTaskSpec(
        task_id=f"rf01-{mode}",
        arm="current",
        prompt="Spawn child and hang",
        command=(sys.executable, str(worker_script)),
        verifier_command=(sys.executable, "-c", "raise SystemExit(0)"),
        timeout_seconds=0.5 if mode == "timeout" else 10.0,
        cancel_after_seconds=0.5 if mode == "cancelled" else None,
    )
    rec = receipt_mod.execute_eval_run(spec, output_dir=tmp_path / f"out-{mode}")
    assert rec["terminal_outcome"] == mode
    assert rec["error_category"] == mode
    assert rec["cleanup"]["complete"] is True
    assert pid_file.is_file()
    child_pid = int(pid_file.read_text(encoding="utf-8").strip())
    deadline = time.monotonic() + 2.0
    while _pid_alive(child_pid) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert not _pid_alive(child_pid)


def test_promptfoo_custom_typescript_provider_executes_real_runner_and_verifier(tmp_path: Path):
    runner_test = tmp_path / "run_provider_check.mjs"
    provider_url = (ROOT / "evals/promptfoo/forgewright-runner-provider.ts").as_uri()
    evidence_root = tmp_path / "durable-evidence"
    jsonl_log = tmp_path / "runs.jsonl"
    runner_test.write_text(
        f"import assert from 'node:assert/strict';\n"
        f"import {{ existsSync, readFileSync }} from 'node:fs';\n"
        f"import {{ createHash }} from 'node:crypto';\n"
        f"import Provider from {json.dumps(provider_url)};\n"
        f"const provider = new Provider({{ id: 'fw-test', config: {{ arm: 'candidate', modelRequested: 'gemini-4-argon', effortRequested: 'high', evidenceRootDir: {json.dumps(str(evidence_root))}, jsonlLogPath: {json.dumps(str(jsonl_log))}, timeoutSeconds: 1.0, verifierTimeoutSeconds: 1.0 }} }});\n"
        f"const passRes = await provider.callApi('fix task', {{ vars: {{ task_id: 'pf-pass', command: [{json.dumps(sys.executable)}, '-c', 'import time; time.sleep(0.4); print(\"done\")'], verifier_command: [{json.dumps(sys.executable)}, '-c', 'import time; time.sleep(0.4); raise SystemExit(0)'] }} }});\n"
        f"assert.equal(passRes.metadata.terminalOutcome, 'accepted');\n"
        f"assert.equal(passRes.metadata.verifierPassed, true);\n"
        f"assert.equal(passRes.tokenUsage, undefined);\n"
        f"assert.equal(passRes.cost, undefined);\n"
        f"for (const [k, p] of Object.entries(passRes.metadata.evidencePaths)) {{\n"
        f"  assert.equal(existsSync(p), true, `missing evidence path ${{k}}: ${{p}}`);\n"
        f"  if (k !== 'receipt') {{\n"
        f"    const actualSha = createHash('sha256').update(readFileSync(p)).digest('hex');\n"
        f"    assert.equal(passRes.metadata.artifactDigests[k], actualSha, `digest mismatch for ${{k}}`);\n"
        f"  }}\n"
        f"}}\n"
        f"const fakePassRes = await provider.callApi('fake pass', {{ vars: {{ task_id: 'pf-fake', command: [{json.dumps(sys.executable)}, '-c', 'print(\"PASS\")'], verifier_command: [{json.dumps(sys.executable)}, '-c', 'raise SystemExit(1)'] }} }});\n"
        f"assert.equal(fakePassRes.metadata.terminalOutcome, 'failed');\n"
        f"assert.equal(fakePassRes.metadata.errorCategory, 'acceptance_failure');\n"
        f"assert.match(fakePassRes.error, /failed:acceptance_failure/);\n"
        f"assert.notEqual(passRes.metadata.evidencePaths.receipt, fakePassRes.metadata.evidencePaths.receipt);\n"
        f"assert.equal(existsSync(passRes.metadata.evidencePaths.receipt), true);\n"
        f"assert.equal(existsSync(fakePassRes.metadata.evidencePaths.receipt), true);\n"
        f"const missingReceiptProvider = new Provider({{ config: {{ arm: 'candidate', pythonExecutable: 'nonexistent-python-binary-xyz', evidenceRootDir: {json.dumps(str(evidence_root))}, jsonlLogPath: {json.dumps(str(jsonl_log))} }} }});\n"
        f"const missingRes = await missingReceiptProvider.callApi('crash child', {{ vars: {{ task_id: 'pf-missing', command: ['echo'] }} }});\n"
        f"assert.equal(missingRes.metadata.terminalOutcome, 'environment_error');\n"
        f"assert.equal(missingRes.metadata.wallTimeMs >= 0, true);\n"
        f"for (const [k, p] of Object.entries(missingRes.metadata.evidencePaths)) {{\n"
        f"  assert.equal(existsSync(p), true, `missing fallback evidence path ${{k}}: ${{p}}`);\n"
        f"}}\n"
        f"console.log('PROMPTFOO_PROVIDER_OK');\n",
        encoding="utf-8",
    )
    proc = subprocess.run(
        ["node", str(runner_test)],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        timeout=60,
        check=False,
    )
    assert proc.returncode == 0, (proc.stdout, proc.stderr)
    assert "PROMPTFOO_PROVIDER_OK" in proc.stdout
    logged_lines = [json.loads(line) for line in jsonl_log.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert [r["task_id"] for r in logged_lines] == ["pf-pass", "pf-fake", "pf-missing"]


@pytest.mark.parametrize("case_id", ["utf8_vietnamese", "empty", "large_64k"])
def test_stdin_delivery_preserves_bytes_on_windows_and_posix(tmp_path: Path, case_id: str):
    unit = "A_UTF8_Đ_\n"
    raw_64k = (unit.encode("utf-8") * 6600)[:65536].decode("utf-8", errors="ignore")
    raw_64k = raw_64k + ("X" * (65536 - len(raw_64k.encode("utf-8"))))
    assert len(raw_64k.encode("utf-8")) == 65536
    payloads = {
        "utf8_vietnamese": "RF01_STDIN_PROBE: Xin chào Việt Nam\nDòng 2\r\nDòng 3",
        "empty": "",
        "large_64k": raw_64k,
    }
    payload = payloads[case_id]
    captured_file = tmp_path / f"stdin-{case_id}.bin"
    reader_script = tmp_path / f"reader-{case_id}.py"
    reader_script.write_text(
        f"import pathlib, sys\n"
        f"data = sys.stdin.buffer.read()\n"
        f"pathlib.Path({str(captured_file)!r}).write_bytes(data)\n"
        f"print(len(data))\n",
        encoding="utf-8",
    )
    spec = receipt_mod.EvalTaskSpec(
        task_id=f"rf01-stdin-{case_id}",
        arm="current",
        prompt=payload,
        command=(sys.executable, str(reader_script)),
        verifier_command=(sys.executable, "-c", "raise SystemExit(0)"),
    )
    rec = receipt_mod.execute_eval_run(spec, output_dir=tmp_path / f"out-{case_id}")
    assert rec["terminal_outcome"] == "accepted"
    assert rec["cleanup"]["complete"] is True
    assert captured_file.read_bytes() == payload.encode("utf-8")


@pytest.mark.skipif(os.name != "nt", reason="WindowsJobClient completion receipt validation is Windows-specific")
def test_windows_corrupt_completion_receipt_never_infers_cleanup_from_exit_code(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from windows_job_client import CompletionError, WindowsJobClient

    def _broken_validate(self, exit_code: int) -> None:
        raise CompletionError("corrupt or missing completion receipt")

    monkeypatch.setattr(WindowsJobClient, "validate", _broken_validate)
    spec = receipt_mod.EvalTaskSpec(
        task_id="rf01-corrupt-completion",
        arm="current",
        prompt="test",
        command=(sys.executable, "-c", "import time; time.sleep(5)"),
        verifier_command=(sys.executable, "-c", "raise SystemExit(0)"),
        cancel_after_seconds=0.2,
    )
    rec = receipt_mod.execute_eval_run(spec, output_dir=tmp_path / "out-corrupt")
    assert rec["cleanup"]["complete"] is False
