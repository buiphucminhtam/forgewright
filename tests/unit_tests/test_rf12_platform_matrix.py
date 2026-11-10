"""RF12 portability tests: spaces/Unicode paths, CRLF/LF handling, capability separation, and honest multi-OS matrix reporting."""

from __future__ import annotations

import json
import os
import shutil
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


def test_verify_platform_matrix_summary_separates_os_rows_and_capabilities(tmp_path: Path):
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
        timeout=90,
        check=False,
    )
    assert proc.returncode == 0, (proc.stdout, proc.stderr)
    data = json.loads(report_file.read_text(encoding="utf-8"))
    rf12 = data["rf12_matrix"]
    matrix = rf12["matrix"]
    if os.name == "nt":
        assert matrix["windows_native_x64"] == "PASS"
        assert matrix["macos_native_arm64"] == "NOT_RUN"
        assert matrix["macos_native_x64"] == "NOT_RUN"
        assert rf12["capabilities"]["windows_job_object_supervisor"] == "SUPPORTED"
        assert rf12["capabilities"]["pi_darwin_sandbox_exec"] == "UNSUPPORTED"
        assert rf12["overall_multi_os_matrix_status"] == "BLOCKED_PENDING_OTHER_OS_HOST"


def test_verify_platform_matrix_summary_fails_closed_on_missing_toolchain_or_failed_capability(tmp_path: Path):
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "verify_platform_mod", ROOT / "scripts/ci/verify-platform.py"
    )
    assert spec and spec.loader
    vp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vp)

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
        timeout=90,
        check=False,
    )
    assert proc_fail.returncode == 1
    fail_data = json.loads(fail_report.read_text(encoding="utf-8"))
    assert fail_data["status"] == "FAIL"
    assert fail_data["rf12_matrix"]["capabilities"]["motion_director_skill"] == "FAIL"
    assert fail_data["rf12_matrix"]["capabilities"]["core_cli_mcp_docshub"] == "PASS"

    # 4. Multi-host receipt merge checks revision_binding match vs mismatch
    rev_binding = vp._compute_revision_binding()
    mac_matching = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": "macos_native_arm64",
            "revision_binding": rev_binding,
            "matrix": {"macos_native_arm64": "PASS"},
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
        merged_receipts=[mac_matching],
    )
    if os.name == "nt":
        assert merged_ok["matrix"]["windows_native_x64"] == "PASS"
        assert merged_ok["matrix"]["macos_native_arm64"] == "PASS"
        assert merged_ok["overall_multi_os_matrix_status"] == "LOCALLY_VERIFIED"

    mac_stale = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": "macos_native_arm64",
            "revision_binding": {"head_sha": "stale-sha", "source_digest": "stale-digest"},
            "matrix": {"macos_native_arm64": "PASS"},
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
    win_old_pass = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": "windows_native_x64",
            "revision_binding": rev_binding,
            "matrix": {"windows_native_x64": "PASS"},
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
        merged_receipts=[win_old_pass],
    )
    if os.name == "nt":
        assert same_host_attempt["matrix"]["windows_native_x64"] == "FAIL"
        assert same_host_attempt["same_host_merge_ignored"] is True

    # 6. V2-01: Malformed foreign-host receipt (missing capability_checks or schema) is rejected
    mac_malformed = {
        "schema": "forgewright-native-platform/v1",
        "status": "PASS",
        "rf12_matrix": {
            "current_host_key": "macos_native_arm64",
            "revision_binding": rev_binding,
            "matrix": {"macos_native_arm64": "PASS"},
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
        merged_receipts=[mac_malformed],
    )
    assert merged_malformed["invalid_merged_receipt"] is True
    assert merged_malformed["matrix"]["macos_native_arm64"] == "NOT_RUN"
    assert merged_malformed["overall_multi_os_matrix_status"] == "INVALID_MERGED_RECEIPT"
