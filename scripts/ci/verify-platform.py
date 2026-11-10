#!/usr/bin/env python3
"""Native Mac/Windows integration gate; does not grant production authority."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import platform
import subprocess
import sys
import time

from native_commands import native_argv, native_environment

ROOT = Path(__file__).resolve().parents[2]
KEY_REVISION_FILES = (
    "scripts/ci/verify-platform.py",
    "scripts/runtime/skill_eval_receipt.py",
    "scripts/runtime/skill_routing.py",
    "scripts/runtime/openspec_contract_adapter.py",
    "scripts/runtime/runtime-hooks-install.sh",
    "scripts/bootstrap/forgewright-install.sh",
    "scripts/hooks/forgewright-hook-doctor.sh",
    "integrations/pi/provider.mjs",
    "integrations/pi/workspace.mjs",
    "integrations/pi/runtime-state.mjs",
    "src/cli/src/docs/markdown.ts",
    "src/cli/src/docs/normalize.ts",
    "src/cli/src/docs/render.ts",
    "src/cli/tsup.config.ts",
    "skills/motion-director/SKILL.md",
    "skills/motion-director/LITE.md",
    "tests/unit_tests/test_skill_eval_receipt.py",
    "tests/unit_tests/test_rf03_native_agy_hooks.py",
    "tests/unit_tests/test_rf04_pi_capabilities.py",
    "tests/unit_tests/test_rf05_openspec_superpowers.py",
    "tests/unit_tests/test_motion_director_skill.py",
    "tests/unit_tests/test_rf12_platform_matrix.py",
)


def _compute_revision_binding() -> dict[str, str]:
    head_sha = "unavailable"
    try:
        head_sha = (
            subprocess.check_output(
                ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
                text=True,
                stderr=subprocess.DEVNULL,
                timeout=5,
            ).strip()
            or "unavailable"
        )
    except Exception:
        head_sha = "unavailable"
    h = hashlib.sha256()
    for rel in KEY_REVISION_FILES:
        p = ROOT / rel
        h.update(rel.encode("utf-8") + b"\0")
        if p.is_file():
            h.update(hashlib.sha256(p.read_bytes()).digest())
    return {"head_sha": head_sha, "source_digest": h.hexdigest()}


def _detect_arch() -> str:
    machine = platform.machine().lower()
    if machine in ("amd64", "x86_64", "x64"):
        return "x64"
    if machine in ("arm64", "aarch64"):
        return "arm64"
    return machine or "unknown"


def _detect_toolchain() -> dict[str, str]:
    info: dict[str, str] = {"python": platform.python_version()}
    for key, argv in (
        ("node", ["node", "-v"]),
        ("git", ["git", "--version"]),
    ):
        try:
            out = subprocess.check_output(argv, text=True, stderr=subprocess.STDOUT, timeout=5).strip()
            info[key] = out
        except Exception:
            info[key] = "unavailable"
    return info


def _run_capability_checks(environment: dict[str, str]) -> tuple[dict[str, str], list[dict[str, object]]]:
    forced_fail = environment.get("FORGEWRIGHT_PLATFORM_FORCE_FAIL_CAPABILITY", "").strip()
    checks_spec = (
        ("core_cli_mcp_docshub", [sys.executable, "-X", "utf8", "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests/unit_tests/test_rf02_kernel_docshub.py", "tests/unit_tests/test_rf03_native_agy_hooks.py", "tests/unit_tests/test_rf04_pi_capabilities.py", "tests/unit_tests/test_rf05_openspec_superpowers.py"]),
        ("motion_director_skill", [sys.executable, "-X", "utf8", "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests/unit_tests/test_motion_director_skill.py"]),
        ("process_tree_cleanup", [sys.executable, "-X", "utf8", "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests/unit_tests/test_skill_eval_receipt.py"]),
    )
    cap_status: dict[str, str] = {}
    records: list[dict[str, object]] = []
    for cap_id, argv in checks_spec:
        if forced_fail == cap_id:
            argv = [sys.executable, "-c", "import sys; sys.stderr.write('forced capability failure\\n'); raise SystemExit(1)"]
        t0 = time.monotonic()
        try:
            proc = subprocess.run(
                argv,
                cwd=ROOT,
                env=environment,
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
            code = proc.returncode
            out_bytes = (proc.stdout + proc.stderr).encode("utf-8", errors="replace")
        except Exception as exc:
            code = 127
            out_bytes = str(exc).encode("utf-8", errors="replace")
        status = "PASS" if code == 0 else "FAIL"
        cap_status[cap_id] = status
        records.append(
            {
                "capability": cap_id,
                "argv": argv,
                "exit_code": code,
                "status": status,
                "output_sha256": hashlib.sha256(out_bytes).hexdigest(),
                "seconds": round(time.monotonic() - t0, 3),
            }
        )
    return cap_status, records


def build_platform_matrix_summary(
    host_status: str,
    *,
    capability_statuses: dict[str, str] | None = None,
    capability_checks: list[dict[str, object]] | None = None,
    merged_receipts: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    sys_name = platform.system().lower()
    arch = _detect_arch()
    toolchain = _detect_toolchain()
    toolchain_ok = all(v != "unavailable" for v in toolchain.values())
    rev_binding = _compute_revision_binding()
    if not toolchain_ok:
        host_status = "FAIL"
    current_key = None
    if sys_name == "windows" and arch == "x64":
        current_key = "windows_native_x64"
    elif sys_name == "darwin" and arch == "arm64":
        current_key = "macos_native_arm64"
    elif sys_name == "darwin" and arch == "x64":
        current_key = "macos_native_x64"
    elif sys_name == "linux":
        current_key = f"linux_{arch}"

    matrix = {
        "windows_native_x64": "NOT_RUN",
        "macos_native_arm64": "NOT_RUN",
        "macos_native_x64": "NOT_RUN",
        "linux_x64": "NOT_RUN",
    }
    if not toolchain_ok:
        cap_core = "BLOCKED_MISSING_TOOLCHAIN"
        cap_motion = "BLOCKED_MISSING_TOOLCHAIN"
        cap_cleanup = "BLOCKED_MISSING_TOOLCHAIN"
    elif capability_statuses is not None:
        cap_core = capability_statuses.get("core_cli_mcp_docshub", "NOT_RUN")
        cap_motion = capability_statuses.get("motion_director_skill", "NOT_RUN")
        cap_cleanup = capability_statuses.get("process_tree_cleanup", "NOT_RUN")
        if any(s != "PASS" for s in (cap_core, cap_motion, cap_cleanup)):
            host_status = "FAIL"
    else:
        cap_core = "NOT_RUN"
        cap_motion = "NOT_RUN"
        cap_cleanup = "NOT_RUN"
        if host_status == "PASS":
            host_status = "NOT_RUN"

    if current_key is not None:
        matrix[current_key] = host_status

    revision_mismatch = False
    invalid_merged_receipt = False
    same_host_merge_ignored = False
    required_caps = ("core_cli_mcp_docshub", "motion_director_skill", "process_tree_cleanup")
    for other in merged_receipts or []:
        if not isinstance(other, dict) or other.get("schema") != "forgewright-native-platform/v1":
            invalid_merged_receipt = True
            continue
        other_rf12 = other.get("rf12_matrix")
        if not isinstance(other_rf12, dict):
            invalid_merged_receipt = True
            continue
        other_rev = other_rf12.get("revision_binding")
        if not isinstance(other_rev, dict) or (
            other_rev.get("head_sha") != rev_binding["head_sha"]
            or other_rev.get("source_digest") != rev_binding["source_digest"]
        ):
            revision_mismatch = True
            continue
        other_key = other_rf12.get("current_host_key")
        other_matrix = other_rf12.get("matrix")
        if not isinstance(other_key, str) or other_key not in matrix or not isinstance(other_matrix, dict):
            invalid_merged_receipt = True
            continue
        # Never allow a merged receipt from the same host key to overwrite the current run result.
        if other_key == current_key:
            same_host_merge_ignored = True
            continue
        other_val = other_matrix.get(other_key)
        if other_val == "PASS":
            other_caps = other_rf12.get("capabilities")
            other_checks = other_rf12.get("capability_checks")
            caps_ok = isinstance(other_caps, dict) and all(
                other_caps.get(c) == "PASS" for c in required_caps
            )
            passed_check_ids = {
                r.get("capability")
                for r in (other_checks if isinstance(other_checks, list) else [])
                if isinstance(r, dict) and r.get("status") == "PASS" and r.get("exit_code") == 0
            }
            checks_ok = (
                isinstance(other_checks, list)
                and len(other_checks) >= len(required_caps)
                and set(required_caps).issubset(passed_check_ids)
                and all(
                    isinstance(r, dict) and r.get("status") == "PASS" and r.get("exit_code") == 0
                    for r in other_checks
                )
            )
            if other.get("status") != "PASS" or not caps_ok or not checks_ok:
                invalid_merged_receipt = True
                continue
        if isinstance(other_val, str) and other_val in ("PASS", "FAIL", "NOT_RUN"):
            matrix[other_key] = other_val
        else:
            invalid_merged_receipt = True

    both_win_and_mac_verified = (
        not revision_mismatch
        and not invalid_merged_receipt
        and host_status == "PASS"
        and
        matrix["windows_native_x64"] == "PASS"
        and matrix["macos_native_arm64"] == "PASS"
    )
    capabilities = {
        "core_cli_mcp_docshub": cap_core,
        "motion_director_skill": cap_motion,
        "process_tree_cleanup": cap_cleanup,
        "windows_job_object_supervisor": "SUPPORTED" if os.name == "nt" else "UNSUPPORTED",
        "pi_darwin_sandbox_exec": (
            "SUPPORTED"
            if sys_name == "darwin" and Path("/usr/bin/sandbox-exec").is_file()
            else "UNSUPPORTED"
        ),
    }
    return {
        "current_host_key": current_key or f"{sys_name}_{arch}",
        "os": platform.system(),
        "os_release": platform.release(),
        "os_version": platform.version(),
        "architecture": arch,
        "revision_binding": rev_binding,
        "toolchain": toolchain,
        "toolchain_ready": toolchain_ok,
        "matrix": matrix,
        "capabilities": capabilities,
        "capability_checks": capability_checks or [],
        "same_host_merge_ignored": same_host_merge_ignored,
        "invalid_merged_receipt": invalid_merged_receipt,
        "overall_multi_os_matrix_status": (
            "REVISION_MISMATCH"
            if revision_mismatch
            else (
                "INVALID_MERGED_RECEIPT"
                if invalid_merged_receipt
                else (
                "LOCALLY_VERIFIED"
                if both_win_and_mac_verified
                else "BLOCKED_PENDING_OTHER_OS_HOST"
                )
            )
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", action="store_true")
    parser.add_argument("--matrix-summary", action="store_true", help="Run fast portability & capability matrix summary")
    parser.add_argument("--merge-receipt", type=Path, action="append", default=[], help="Merge verified receipt(s) from another OS host")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    loaded_merges: list[dict[str, object]] = []
    merge_load_failed = False
    for mp in args.merge_receipt:
        try:
            loaded_merges.append(json.loads(mp.read_text(encoding="utf-8")))
        except Exception:
            merge_load_failed = True
            loaded_merges.append({"schema": "invalid"})
    if args.matrix_summary:
        toolchain = _detect_toolchain()
        if all(v != "unavailable" for v in toolchain.values()):
            cap_map, cap_records = _run_capability_checks(os.environ.copy())
            overall = "PASS" if (all(v == "PASS" for v in cap_map.values()) and not merge_load_failed) else "FAIL"
            summary = build_platform_matrix_summary(
                overall,
                capability_statuses=cap_map,
                capability_checks=cap_records,
                merged_receipts=loaded_merges,
            )
            if summary.get("invalid_merged_receipt") or summary.get("overall_multi_os_matrix_status") == "REVISION_MISMATCH":
                overall = "FAIL"
        else:
            overall = "FAIL"
            summary = build_platform_matrix_summary("FAIL", merged_receipts=loaded_merges)
        report = {
            "schema": "forgewright-native-platform/v1",
            "host": platform.system(),
            "python": platform.python_version(),
            "status": overall,
            "production_eligible": False,
            "rf12_matrix": summary,
        }
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report), flush=True)
        return 0 if overall == "PASS" else 1
    tests = [
        "tests/unit_tests/test_codex_hook_portability.py",
        "tests/unit_tests/test_git_hook_portability.py",
        "tests/unit_tests/test_hook_unicode_transport.py",
        "tests/unit_tests/test_native_ci_commands.py",
        "tests/unit_tests/test_native_node_commands.py",
        "tests/unit_tests/test_local_ci.py",
        "tests/unit_tests/test_ci_workflow.py",
        "tests/unit_tests/test_hook_schema.py",
        "tests/lite/test_gate.py",
        "tests/unit_tests/test_continuity_gate.py",
        "tests/unit_tests/test_continuity_checkpoint.py",
        "tests/unit_tests/test_rule_hook_distribution.py::test_installer_distributes_rule_runtime_and_preserves_user_hooks",
        "tests/unit_tests/test_rule_hook_distribution.py::test_codex_lifecycle_migration_removes_legacy_python3_duplicates",
    ]
    commands = [
        (
            "native-hooks-and-evidence",
            [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", *tests],
        ),
        ("product-factory", [sys.executable, "scripts/ci/verify-product-factory.py"]),
        (
            "mcp-tests",
            ["npm", "--prefix", "mcp", "test", "--", "--reporter=basic", "--no-cache"],
        ),
        ("mcp-lint", ["npm", "--prefix", "mcp", "run", "lint"]),
        ("mcp-format", ["npm", "--prefix", "mcp", "run", "format:check"]),
        ("cli-tests", ["npm", "--prefix", "src/cli", "test"]),
    ]
    if args.browser:
        commands.append(
            ("real-browser-reference", ["npm", "run", "verify:web-reference"])
        )
    rows = []
    environment = native_environment()
    for name, command in commands:
        started = time.monotonic()
        print(f"\n==> native-platform: {name}", flush=True)
        executed = command
        try:
            executed = native_argv(command)
            process = subprocess.Popen(
                executed,
                cwd=ROOT,
                env=environment,
                start_new_session=os.name != "nt",
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
                if os.name == "nt"
                else 0,
            )
            try:
                code = process.wait(timeout=600)
            except subprocess.TimeoutExpired:
                # Reclaim only the process tree started for this check.
                if os.name == "nt":
                    subprocess.run(
                        ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        capture_output=True,
                        check=False,
                        timeout=15,
                    )
                else:
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                        process.wait(timeout=3)
                    except ProcessLookupError:
                        pass
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=10)
                code = 124
        except subprocess.TimeoutExpired:
            code = 124
        except OSError as error:
            print(f"{name}: {error}", file=sys.stderr)
            code = 127
        rows.append(
            {
                "name": name,
                "argv": command,
                "executed_argv": executed,
                "exit_code": code,
                "seconds": round(time.monotonic() - started, 3),
            }
        )
    cap_map, cap_records = _run_capability_checks(environment)
    all_rows_pass = (
        all(row["exit_code"] == 0 for row in rows)
        and all(v == "PASS" for v in cap_map.values())
        and not merge_load_failed
    )
    summary = build_platform_matrix_summary(
        "PASS" if all_rows_pass else "FAIL",
        capability_statuses=cap_map,
        capability_checks=cap_records,
        merged_receipts=loaded_merges,
    )
    final_ok = (
        all_rows_pass
        and summary["matrix"].get(summary["current_host_key"]) == "PASS"
        and not summary.get("invalid_merged_receipt")
        and summary.get("overall_multi_os_matrix_status") != "REVISION_MISMATCH"
    )
    report = {
        "schema": "forgewright-native-platform/v1",
        "host": platform.system(),
        "python": platform.python_version(),
        "status": "PASS" if final_ok else "FAIL",
        "production_eligible": False,
        "browser_requested": args.browser,
        "checks": rows,
        "rf12_matrix": summary,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report), flush=True)
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
