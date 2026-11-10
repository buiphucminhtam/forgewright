"""RF12 portability tests: spaces/Unicode paths, CRLF/LF handling, capability separation, and honest multi-OS matrix reporting."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "ci"))

from scripts.runtime.skill_routing import route_skills  # noqa: E402


def test_unicode_and_spaced_project_paths_route_skills_and_preserve_crlf_lf(tmp_path: Path):
    spaced_unicode_root = tmp_path / "Thư mục kiểm thử 2026" / "Project With Spaces"
    (spaced_unicode_root / ".forgewright").mkdir(parents=True)
    # Write config with CRLF line endings to verify CRLF/LF portability
    raw_cfg = (ROOT / ".forgewright/skills-config.json").read_text(encoding="utf-8")
    (spaced_unicode_root / ".forgewright/skills-config.json").write_bytes(
        raw_cfg.replace("\n", "\r\n").encode("utf-8")
    )

    res_motion = route_skills(
        prompt="Thiết kế chuyển động UI transition, easing và reduced motion cho modal",
        mode="design",
        project_root=spaced_unicode_root,
        skills_root=ROOT / "skills",
    )
    assert res_motion["status"] == "ok"
    loaded_names = [s["name"] for s in res_motion["skills"]]
    assert "motion-director" in loaded_names

    res_backend = route_skills(
        prompt="Implement database migration and REST endpoint",
        mode="feature",
        project_root=spaced_unicode_root,
        skills_root=ROOT / "skills",
    )
    assert res_backend["status"] == "ok"
    assert "motion-director" not in [s["name"] for s in res_backend["skills"]]


def test_docs_renderer_handles_crlf_and_unicode_paths_in_spaced_directory(tmp_path: Path):
    spaced_dir = tmp_path / "Tài liệu dự án 2026"
    (spaced_dir / ".forgewright").mkdir(parents=True)
    (spaced_dir / "docs").mkdir(parents=True)
    manifest = {
        "schema_version": 1,
        "project": {"id": "unicode-demo", "title": "Dự Án Unicode"},
        "sources": [{"path": "docs/Hướng-Dẫn.md", "type": "operations"}],
        "truth": ["docs/Hướng-Dẫn.md"],
        "adapters": {"git": False, "gitnexus": False, "evidence_summary": False},
        "privacy": {"mode": "allowlist", "allow": ["docs/Hướng-Dẫn.md"], "exclude": []},
    }
    (spaced_dir / ".forgewright/docs-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (spaced_dir / "docs/Hướng-Dẫn.md").write_bytes(
        "# Hướng Dẫn\r\n\r\nNội dung **tiếng Việt** có CRLF.\r\n".encode("utf-8")
    )
    out_dir = spaced_dir / "site-out"
    proc = subprocess.run(
        [
            "node",
            str(ROOT / "src/cli/dist/index.js"),
            "docs",
            "build",
            str(spaced_dir),
            "--output",
            str(out_dir),
            "--json",
        ],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert proc.returncode == 0, (proc.stdout, proc.stderr)
    payload = json.loads(proc.stdout)
    assert payload["ok"] is True
    assert (out_dir / "index.html").is_file()


def _load_verify_platform_module():
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "verify_platform_mod", ROOT / "scripts/ci/verify-platform.py"
    )
    assert spec and spec.loader
    vp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vp)
    return vp


def _assert_per_capability_budgets_and_timeout_fails_closed(vp, monkeypatch=None):
    assert vp.CAPABILITY_TIMEOUT_SECONDS == {
        "core_cli_mcp_docshub": 60,
        "motion_director_skill": 120,
        "process_tree_cleanup": 60,
    }
    assert vp.MATRIX_SUMMARY_SUBPROCESS_OVERHEAD_SECONDS == 15
    observed_timeouts: list[tuple[str, int]] = []
    orig_run = vp.subprocess.run

    def fake_cap_run(argv, *args, **kwargs):
        timeout_val = kwargs.get("timeout")
        joined = " ".join(str(x) for x in argv)
        if "test_rf02_kernel_docshub.py" in joined:
            observed_timeouts.append(("core_cli_mcp_docshub", timeout_val))
            return subprocess.CompletedProcess(argv, 0, stdout="ok\\n", stderr="")
        if "test_motion_director_skill.py" in joined:
            observed_timeouts.append(("motion_director_skill", timeout_val))
            raise subprocess.TimeoutExpired(cmd=argv, timeout=timeout_val)
        if "test_skill_eval_receipt.py" in joined:
            observed_timeouts.append(("process_tree_cleanup", timeout_val))
            return subprocess.CompletedProcess(argv, 0, stdout="ok\\n", stderr="")
        return orig_run(argv, *args, **kwargs)

    vp.subprocess.run = fake_cap_run
    try:
        cap_map, cap_records = vp._run_capability_checks({})
    finally:
        vp.subprocess.run = orig_run

    assert observed_timeouts == [
        ("core_cli_mcp_docshub", 60),
        ("motion_director_skill", 120),
        ("process_tree_cleanup", 60),
    ]
    assert [r["timeout_seconds"] for r in cap_records] == [60, 120, 60]
    assert cap_map == {
        "core_cli_mcp_docshub": "PASS",
        "motion_director_skill": "FAIL",
        "process_tree_cleanup": "PASS",
    }
    motion_rec = next(r for r in cap_records if r["capability"] == "motion_director_skill")
    assert motion_rec["status"] == "FAIL"
    assert motion_rec["exit_code"] != 0
    assert motion_rec["timeout_seconds"] == 120
    summary = vp.build_platform_matrix_summary(
        "PASS",
        capability_statuses=cap_map,
        capability_checks=cap_records,
    )
    assert summary["capabilities"]["motion_director_skill"] == "FAIL"
    assert summary["matrix"][summary["current_host_key"]] == "FAIL"


def test_verify_platform_matrix_summary_separates_os_rows_and_capabilities(tmp_path: Path):
    vp = _load_verify_platform_module()
    outer_timeout = (
        sum(vp.CAPABILITY_TIMEOUT_SECONDS.values())
        + vp.MATRIX_SUMMARY_SUBPROCESS_OVERHEAD_SECONDS
    )
    report_file = tmp_path / "platform-matrix.json"
    proc = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/ci/verify-platform.py"),
            "--matrix-summary",
            "--report",
            str(report_file),
        ],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        timeout=outer_timeout,
        check=False,
    )
    assert proc.returncode == 0, (proc.stdout, proc.stderr)
    data = json.loads(report_file.read_text(encoding="utf-8"))
    rf12 = data["rf12_matrix"]
    matrix = rf12["matrix"]
    assert {
        row["capability"]: row["timeout_seconds"] for row in rf12["capability_checks"]
    } == vp.CAPABILITY_TIMEOUT_SECONDS
    current_key = rf12["current_host_key"]
    assert current_key in matrix
    assert matrix[current_key] == "PASS"
    for other_key, other_val in matrix.items():
        if other_key != current_key:
            assert other_val == "NOT_RUN"
    if os.name == "nt":
        assert matrix["windows_native_x64"] == "PASS"
        assert matrix["macos_native_arm64"] == "NOT_RUN"
        assert matrix["macos_native_x64"] == "NOT_RUN"
        assert rf12["capabilities"]["windows_job_object_supervisor"] == "SUPPORTED"
        assert rf12["capabilities"]["pi_darwin_sandbox_exec"] == "UNSUPPORTED"
    elif sys.platform == "darwin":
        assert rf12["capabilities"]["windows_job_object_supervisor"] == "UNSUPPORTED"
        assert rf12["capabilities"]["pi_darwin_sandbox_exec"] == (
            "SUPPORTED" if Path("/usr/bin/sandbox-exec").is_file() else "UNSUPPORTED"
        )
    assert rf12["overall_multi_os_matrix_status"] == "BLOCKED_PENDING_OTHER_OS_HOST"


def test_verify_platform_matrix_summary_fails_closed_on_missing_toolchain_or_failed_capability(tmp_path: Path):
    vp = _load_verify_platform_module()
    _assert_per_capability_budgets_and_timeout_fails_closed(vp)
    outer_timeout = (
        sum(vp.CAPABILITY_TIMEOUT_SECONDS.values())
        + vp.MATRIX_SUMMARY_SUBPROCESS_OVERHEAD_SECONDS
    )

    # 1. Calling build_platform_matrix_summary("PASS") without capability evidence must report NOT_RUN
    unverified = vp.build_platform_matrix_summary("PASS")
    if unverified["toolchain_ready"]:
        assert unverified["capabilities"]["core_cli_mcp_docshub"] == "NOT_RUN"
        assert unverified["matrix"][unverified["current_host_key"]] == "NOT_RUN"

    # 2. Missing toolchain (PATH="") fails closed and marks capabilities BLOCKED_MISSING_TOOLCHAIN
    missing_report = tmp_path / "missing-toolchain.json"
    proc_missing = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/ci/verify-platform.py"),
            "--matrix-summary",
            "--report",
            str(missing_report),
        ],
        cwd=str(ROOT),
        env={"PATH": "", "SYSTEMROOT": os.environ.get("SYSTEMROOT", "C:\\Windows")},
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )
    assert proc_missing.returncode == 1
    missing_data = json.loads(missing_report.read_text(encoding="utf-8"))
    assert missing_data["status"] == "FAIL"
    assert missing_data["rf12_matrix"]["capabilities"]["core_cli_mcp_docshub"] == "BLOCKED_MISSING_TOOLCHAIN"

    # 3. Forced capability failure fails closed and records per-capability status
    fail_report = tmp_path / "forced-fail.json"
    env_fail = os.environ.copy()
    env_fail["FORGEWRIGHT_PLATFORM_FORCE_FAIL_CAPABILITY"] = "motion_director_skill"
    proc_fail = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/ci/verify-platform.py"),
            "--matrix-summary",
            "--report",
            str(fail_report),
        ],
        cwd=str(ROOT),
        env=env_fail,
        text=True,
        capture_output=True,
        timeout=outer_timeout,
        check=False,
    )
    assert proc_fail.returncode == 1
    fail_data = json.loads(fail_report.read_text(encoding="utf-8"))
    assert fail_data["status"] == "FAIL"
    assert fail_data["rf12_matrix"]["capabilities"]["motion_director_skill"] == "FAIL"
    assert fail_data["rf12_matrix"]["capabilities"]["core_cli_mcp_docshub"] == "PASS"

    # 4. Multi-host receipt merge checks revision_binding match vs mismatch
    rev_binding = vp._compute_revision_binding()
    current_host_key = unverified["current_host_key"]
    foreign_host_key = (
        "windows_native_x64"
        if current_host_key == "macos_native_arm64"
        else "macos_native_arm64"
    )
    foreign_matching = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": foreign_host_key,
            "revision_binding": rev_binding,
            "matrix": {foreign_host_key: "PASS"},
            "capabilities": {
                "core_cli_mcp_docshub": "PASS",
                "motion_director_skill": "PASS",
                "process_tree_cleanup": "PASS",
            },
            "capability_checks": [
                {"capability": "core_cli_mcp_docshub", "exit_code": 0, "status": "PASS"},
                {"capability": "motion_director_skill", "exit_code": 0, "status": "PASS"},
                {"capability": "process_tree_cleanup", "exit_code": 0, "status": "PASS"},
            ],
        }
    }
    merged_ok = vp.build_platform_matrix_summary(
        "PASS",
        capability_statuses={
            "core_cli_mcp_docshub": "PASS",
            "motion_director_skill": "PASS",
            "process_tree_cleanup": "PASS",
        },
        merged_receipts=[foreign_matching],
    )
    assert merged_ok["matrix"][current_host_key] == "PASS"
    assert merged_ok["matrix"][foreign_host_key] == "PASS"
    for key, val in merged_ok["matrix"].items():
        if key not in (current_host_key, foreign_host_key):
            assert val == "NOT_RUN"
    if {current_host_key, foreign_host_key} == {"windows_native_x64", "macos_native_arm64"}:
        assert merged_ok["matrix"]["windows_native_x64"] == "PASS"
        assert merged_ok["matrix"]["macos_native_arm64"] == "PASS"
        assert merged_ok["overall_multi_os_matrix_status"] == "LOCALLY_VERIFIED"
    else:
        assert merged_ok["overall_multi_os_matrix_status"] == "BLOCKED_PENDING_OTHER_OS_HOST"

    mac_stale = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": foreign_host_key,
            "revision_binding": {"head_sha": "stale-sha", "source_digest": "stale-digest"},
            "matrix": {foreign_host_key: "PASS"},
        }
    }
    merged_stale = vp.build_platform_matrix_summary(
        "PASS",
        capability_statuses={
            "core_cli_mcp_docshub": "PASS",
            "motion_director_skill": "PASS",
            "process_tree_cleanup": "PASS",
        },
        merged_receipts=[mac_stale],
    )
    assert merged_stale["overall_multi_os_matrix_status"] == "REVISION_MISMATCH"

    # 5. V2-01: Old same-host PASS receipt must NEVER overwrite current FAIL
    same_host_old_pass = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": current_host_key,
            "revision_binding": rev_binding,
            "matrix": {current_host_key: "PASS"},
            "capabilities": {
                "core_cli_mcp_docshub": "PASS",
                "motion_director_skill": "PASS",
                "process_tree_cleanup": "PASS",
            },
            "capability_checks": [
                {"capability": "core_cli_mcp_docshub", "exit_code": 0, "status": "PASS"},
                {"capability": "motion_director_skill", "exit_code": 0, "status": "PASS"},
                {"capability": "process_tree_cleanup", "exit_code": 0, "status": "PASS"},
            ],
        },
    }
    same_host_attempt = vp.build_platform_matrix_summary(
        "FAIL",
        capability_statuses={
            "core_cli_mcp_docshub": "FAIL",
            "motion_director_skill": "PASS",
            "process_tree_cleanup": "PASS",
        },
        merged_receipts=[same_host_old_pass],
    )
    assert same_host_attempt["matrix"][current_host_key] == "FAIL"
    assert same_host_attempt["same_host_merge_ignored"] is True

    # 6. V2-01: Malformed foreign-host receipt (missing capability_checks or schema) is rejected
    foreign_malformed = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": foreign_host_key,
            "revision_binding": rev_binding,
            "matrix": {foreign_host_key: "PASS"},
            "capabilities": {"core_cli_mcp_docshub": "PASS"},
            "capability_checks": [],
        },
    }
    merged_malformed = vp.build_platform_matrix_summary(
        "PASS",
        capability_statuses={
            "core_cli_mcp_docshub": "PASS",
            "motion_director_skill": "PASS",
            "process_tree_cleanup": "PASS",
        },
        merged_receipts=[foreign_malformed],
    )
    assert merged_malformed["invalid_merged_receipt"] is True
    assert merged_malformed["matrix"][foreign_host_key] == "NOT_RUN"
    assert merged_malformed["overall_multi_os_matrix_status"] == "INVALID_MERGED_RECEIPT"

    # 7. Duplicate/missing capability_checks IDs (even with 3 PASS entries) are rejected
    foreign_duplicate_checks = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": foreign_host_key,
            "revision_binding": rev_binding,
            "matrix": {foreign_host_key: "PASS"},
            "capabilities": {
                "core_cli_mcp_docshub": "PASS",
                "motion_director_skill": "PASS",
                "process_tree_cleanup": "PASS",
            },
            "capability_checks": [
                {"capability": "core_cli_mcp_docshub", "exit_code": 0, "status": "PASS"},
                {"capability": "core_cli_mcp_docshub", "exit_code": 0, "status": "PASS"},
                {"capability": "motion_director_skill", "exit_code": 0, "status": "PASS"},
            ],
        },
    }
    merged_dup = vp.build_platform_matrix_summary(
        "PASS",
        capability_statuses={
            "core_cli_mcp_docshub": "PASS",
            "motion_director_skill": "PASS",
            "process_tree_cleanup": "PASS",
        },
        merged_receipts=[foreign_duplicate_checks],
    )
    assert merged_dup["invalid_merged_receipt"] is True
    assert merged_dup["matrix"][foreign_host_key] == "NOT_RUN"
    assert merged_dup["overall_multi_os_matrix_status"] == "INVALID_MERGED_RECEIPT"


def test_verify_platform_dispatch_builds_mcp_before_runtime_checks_and_fails_closed_on_build_failure(
    tmp_path: Path, monkeypatch
):
    vp = _load_verify_platform_module()
    _assert_per_capability_budgets_and_timeout_fails_closed(vp, monkeypatch)

    required_bound_files = {
        "scripts/ci/verify-platform.py",
        "scripts/runtime/skill_eval_receipt.py",
        "scripts/runtime/skill_routing.py",
        "scripts/runtime/openspec_contract_adapter.py",
        "scripts/runtime/runtime-hooks-install.sh",
        "scripts/runtime/verify_motion_drawer_artifact.mjs",
        "scripts/bootstrap/forgewright-install.sh",
        "scripts/hooks/forgewright-hook-doctor.sh",
        "integrations/pi/provider.mjs",
        "integrations/pi/workspace.mjs",
        "integrations/pi/runtime-state.mjs",
        "mcp/package.json",
        "mcp/package-lock.json",
        "mcp/tsconfig.json",
        "mcp/src/infrastructure/adapters/ProcessPipelineTransitionGate.ts",
        "mcp/src/infrastructure/adapters/ProcessPipelineTransitionGate.test.ts",
        "package.json",
        "package-lock.json",
        "playwright.config.ts",
        "src/testing/e2e/playwright.config.ts",
        "src/testing/e2e/tests/example.spec.ts",
        "src/testing/e2e/tests/motion-director.spec.ts",
        "src/cli/package.json",
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
    }
    assert required_bound_files <= set(vp.KEY_REVISION_FILES)
    assert not any(
        rel.startswith("mcp/build/") or rel.startswith("src/cli/dist/")
        for rel in vp.KEY_REVISION_FILES
    )

    current_host_key = vp.build_platform_matrix_summary("PASS")["current_host_key"]
    foreign_host_key = (
        "windows_native_x64"
        if current_host_key == "macos_native_arm64"
        else "macos_native_arm64"
    )
    rev_binding = vp._compute_revision_binding()

    foreign_matching = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": foreign_host_key,
            "revision_binding": rev_binding,
            "matrix": {foreign_host_key: "PASS"},
            "capabilities": {
                "core_cli_mcp_docshub": "PASS",
                "motion_director_skill": "PASS",
                "process_tree_cleanup": "PASS",
            },
            "capability_checks": [
                {"capability": "core_cli_mcp_docshub", "exit_code": 0, "status": "PASS"},
                {"capability": "motion_director_skill", "exit_code": 0, "status": "PASS"},
                {"capability": "process_tree_cleanup", "exit_code": 0, "status": "PASS"},
            ],
        },
    }
    merged_ok = vp.build_platform_matrix_summary(
        "PASS",
        capability_statuses={
            "core_cli_mcp_docshub": "PASS",
            "motion_director_skill": "PASS",
            "process_tree_cleanup": "PASS",
        },
        merged_receipts=[foreign_matching],
    )
    assert merged_ok["matrix"][current_host_key] == "PASS"
    assert merged_ok["matrix"][foreign_host_key] == "PASS"
    for key, val in merged_ok["matrix"].items():
        if key not in (current_host_key, foreign_host_key):
            assert val == "NOT_RUN"
    if {current_host_key, foreign_host_key} == {"windows_native_x64", "macos_native_arm64"}:
        assert merged_ok["overall_multi_os_matrix_status"] == "LOCALLY_VERIFIED"
    else:
        assert merged_ok["overall_multi_os_matrix_status"] == "BLOCKED_PENDING_OTHER_OS_HOST"

    same_host_old_pass = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": current_host_key,
            "revision_binding": rev_binding,
            "matrix": {current_host_key: "PASS"},
            "capabilities": {
                "core_cli_mcp_docshub": "PASS",
                "motion_director_skill": "PASS",
                "process_tree_cleanup": "PASS",
            },
            "capability_checks": [
                {"capability": "core_cli_mcp_docshub", "exit_code": 0, "status": "PASS"},
                {"capability": "motion_director_skill", "exit_code": 0, "status": "PASS"},
                {"capability": "process_tree_cleanup", "exit_code": 0, "status": "PASS"},
            ],
        },
    }
    same_host_attempt = vp.build_platform_matrix_summary(
        "FAIL",
        capability_statuses={
            "core_cli_mcp_docshub": "FAIL",
            "motion_director_skill": "PASS",
            "process_tree_cleanup": "PASS",
        },
        merged_receipts=[same_host_old_pass],
    )
    assert same_host_attempt["matrix"][current_host_key] == "FAIL"
    assert same_host_attempt["same_host_merge_ignored"] is True

    foreign_malformed = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": foreign_host_key,
            "revision_binding": rev_binding,
            "matrix": {foreign_host_key: "PASS"},
            "capabilities": {"core_cli_mcp_docshub": "PASS"},
            "capability_checks": [],
        },
    }
    merged_malformed = vp.build_platform_matrix_summary(
        "PASS",
        capability_statuses={
            "core_cli_mcp_docshub": "PASS",
            "motion_director_skill": "PASS",
            "process_tree_cleanup": "PASS",
        },
        merged_receipts=[foreign_malformed],
    )
    assert merged_malformed["invalid_merged_receipt"] is True
    assert merged_malformed["matrix"][foreign_host_key] == "NOT_RUN"
    assert merged_malformed["overall_multi_os_matrix_status"] == "INVALID_MERGED_RECEIPT"

    foreign_duplicate_checks = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": foreign_host_key,
            "revision_binding": rev_binding,
            "matrix": {foreign_host_key: "PASS"},
            "capabilities": {
                "core_cli_mcp_docshub": "PASS",
                "motion_director_skill": "PASS",
                "process_tree_cleanup": "PASS",
            },
            "capability_checks": [
                {"capability": "core_cli_mcp_docshub", "exit_code": 0, "status": "PASS"},
                {"capability": "core_cli_mcp_docshub", "exit_code": 0, "status": "PASS"},
                {"capability": "motion_director_skill", "exit_code": 0, "status": "PASS"},
            ],
        },
    }
    merged_dup = vp.build_platform_matrix_summary(
        "PASS",
        capability_statuses={
            "core_cli_mcp_docshub": "PASS",
            "motion_director_skill": "PASS",
            "process_tree_cleanup": "PASS",
        },
        merged_receipts=[foreign_duplicate_checks],
    )
    assert merged_dup["invalid_merged_receipt"] is True
    assert merged_dup["matrix"][foreign_host_key] == "NOT_RUN"
    assert merged_dup["overall_multi_os_matrix_status"] == "INVALID_MERGED_RECEIPT"

    dispatched: list[tuple[list[str], dict[str, str]]] = []
    native_argv_inputs: list[list[str]] = []
    fake_env = {"PATH": "/fake/bin", "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}

    def fake_native_environment(base=None):
        return dict(fake_env)

    def fake_native_argv(argv: list[str]) -> list[str]:
        native_argv_inputs.append(list(argv))
        return ["RESOLVED::" + argv[0], *argv[1:]]

    real_popen = vp.subprocess.Popen

    class FakePopen:
        def __init__(self, executed, cwd=None, env=None, **kwargs):
            if cwd != vp.ROOT:
                self._real = real_popen(executed, cwd=cwd, env=env, **kwargs)
                return
            self._real = None
            dispatched.append((list(executed), dict(env or {})))
            self.pid = 42424
            self._executed = list(executed)

        def wait(self, timeout=None):
            if self._real is not None:
                return self._real.wait(timeout=timeout)
            if self._executed[1:] == ["--prefix", "mcp", "run", "build"]:
                return 2
            return 0

        def __getattr__(self, name):
            return getattr(self._real, name)

        def __enter__(self):
            if self._real is not None:
                self._real.__enter__()
            return self

        def __exit__(self, exc_type, exc, tb):
            if self._real is not None:
                return self._real.__exit__(exc_type, exc, tb)
            return False

    def fake_run_capability_checks(environment):
        return (
            {
                "core_cli_mcp_docshub": "PASS",
                "motion_director_skill": "PASS",
                "process_tree_cleanup": "PASS",
            },
            [
                {"capability": "core_cli_mcp_docshub", "exit_code": 0, "status": "PASS"},
                {"capability": "motion_director_skill", "exit_code": 0, "status": "PASS"},
                {"capability": "process_tree_cleanup", "exit_code": 0, "status": "PASS"},
            ],
        )

    monkeypatch.setattr(vp, "native_environment", fake_native_environment)
    monkeypatch.setattr(vp, "native_argv", fake_native_argv)
    monkeypatch.setattr(vp.subprocess, "Popen", FakePopen)
    monkeypatch.setattr(vp, "_run_capability_checks", fake_run_capability_checks)

    report_path = tmp_path / "gate-build-fail-report.json"
    monkeypatch.setattr(vp.sys, "argv", ["verify-platform.py", "--report", str(report_path)])
    exit_code = vp.main()
    assert exit_code == 1

    report = json.loads(report_path.read_text(encoding="utf-8"))
    check_names = [row["name"] for row in report["checks"]]
    assert "mcp-build" in check_names
    assert check_names.index("mcp-build") < check_names.index("product-factory")
    assert check_names.index("mcp-build") < check_names.index("mcp-tests")

    mcp_build_row = next(row for row in report["checks"] if row["name"] == "mcp-build")
    assert mcp_build_row["argv"] == ["npm", "--prefix", "mcp", "run", "build"]
    assert mcp_build_row["executed_argv"] == ["RESOLVED::npm", "--prefix", "mcp", "run", "build"]
    assert mcp_build_row["exit_code"] == 2
    assert ["npm", "--prefix", "mcp", "run", "build"] in native_argv_inputs
    assert any(env == fake_env for _, env in dispatched)
    assert report["status"] == "FAIL"
    assert report["rf12_matrix"]["capabilities"]["core_cli_mcp_docshub"] == "PASS"
    assert report["rf12_matrix"]["capabilities"]["motion_director_skill"] == "PASS"
    assert report["rf12_matrix"]["capabilities"]["process_tree_cleanup"] == "PASS"
    assert report["rf12_matrix"]["matrix"][report["rf12_matrix"]["current_host_key"]] == "FAIL"
