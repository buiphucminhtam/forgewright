"""Acceptance requires actual test execution, including during final replay."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def record(tmp_path, *, mode="pass", extra=(), phase="verification"):
    tests = tmp_path / "tests"
    tests.mkdir(exist_ok=True)
    if mode == "distributed":
        (tmp_path / "conftest.py").write_text(
            "def pytest_configure(config):\n    config.option.numprocesses = 2\n"
        )
    source = "def test_required():\n    assert True\n\ndef test_control():\n    assert True\n"
    if mode == "fail":
        source = source.replace("assert True", "assert False", 1)
    if mode == "control-fail":
        source = source.replace(
            "def test_control():\n    assert True",
            "def test_control():\n    assert False",
        )
    if mode == "skip":
        source = "import pytest\n@pytest.mark.skip(reason='fixture')\n" + source
    if mode in {"xfail", "xpass", "strict-xpass"}:
        if mode == "xfail":
            source = source.replace("assert True", "assert False", 1)
        source = (
            "import pytest\n@pytest.mark.xfail(reason='fixture', strict="
            + str(mode == "strict-xpass")
            + ")\n"
            + source
        )
    if mode in {"setup", "teardown"}:
        fixture = (
            "    assert False\n    yield\n"
            if mode == "setup"
            else "    yield\n    assert False\n"
        )
        source = (
            "import pytest\n@pytest.fixture\ndef lifecycle():\n"
            + fixture
            + source.replace("test_required()", "test_required(lifecycle)")
        )
    (tests / "test_game.py").write_text(source)
    ref = "tests/test_game.py::test_required"
    command = [
        sys.executable,
        "-m",
        "pytest",
        "-q",
        "--rootdir=.",
        "--confcutdir=.",
        "-p",
        "no:cacheprovider",
        ref,
        "tests/test_game.py::test_control",
        *extra,
    ]
    args = [
        sys.executable,
        str(ROOT / "scripts/lite/run_check.py"),
        "--turn",
        "receipt",
        "--acceptance",
        "behavior=required call executed",
        "--test-ref",
        ref,
        "--tier",
        "unit",
        "--negative-path",
        "missing call cannot prove behavior",
        "--limitations",
        "fixture only",
        "--change-kind",
        "test",
        "--phase",
        phase,
        "--implementer-id",
        "receipt-tests",
        "--reviewer-status",
        "not_required",
        "--",
        *command,
    ]
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env["GIT_CEILING_DIRECTORIES"] = str(tmp_path.parent)
    result = subprocess.run(
        args, cwd=tmp_path, env=env, text=True, capture_output=True, timeout=30
    )
    path = tmp_path / ".forgewright/verify/receipt.json"
    return result, json.loads(path.read_text()) if path.exists() else None


@pytest.mark.parametrize(
    "mode,extra",
    [
        ("fail", ("--deselect", "tests/test_game.py::test_required")),
        ("fail", ("-k", "test_control")),
        ("fail", ("--collect-only",)),
        ("skip", ()),
        ("xfail", ()),
        ("xpass", ()),
        ("distributed", ()),
    ],
)
def test_omitted_or_skipped_required_call_cannot_produce_pass(tmp_path, mode, extra):
    result, evidence = record(tmp_path, mode=mode, extra=extra)
    assert "VERDICT: PASS" not in result.stdout
    assert evidence is None or evidence["exit_code"] != 0


def test_actual_passing_call_has_bound_execution_receipt(tmp_path):
    result, evidence = record(tmp_path)
    assert result.returncode == 0, result.stderr
    receipt = evidence["test_execution"]
    assert receipt["workspace"] == str(tmp_path.resolve())
    assert receipt["tree_sha"] == evidence["tree_sha"]
    assert any(
        row["nodeid"] == "tests/test_game.py::test_required"
        and row["phases"]["call"] == "passed"
        for row in receipt["tests"]
    )


def test_custom_pytest_rootdir_keeps_workspace_relative_node_identity(tmp_path):
    result, evidence = record(tmp_path, extra=("--rootdir=tests", "--confcutdir=tests"))
    assert result.returncode == 0, result.stderr
    assert any(
        row["nodeid"] == "tests/test_game.py::test_required"
        for row in evidence["test_execution"]["tests"]
    )


def test_real_failing_call_can_still_record_red(tmp_path):
    result, evidence = record(tmp_path, mode="fail", phase="red")
    assert result.returncode == 0, result.stderr
    assert evidence["exit_code"] == 1
    assert evidence["test_execution"]["complete"] is True


def test_unrelated_failure_does_not_prove_required_acceptance_red(tmp_path):
    result, evidence = record(tmp_path, mode="control-fail", phase="red")
    assert result.returncode == 2
    assert evidence is None


@pytest.mark.parametrize("mode", ["setup", "teardown"])
def test_lifecycle_failure_without_failed_assertion_cannot_prove_red(tmp_path, mode):
    result, evidence = record(tmp_path, mode=mode, phase="red")
    assert result.returncode == 2
    assert evidence is None


def test_disabled_observer_cannot_fall_back_to_exit_zero(tmp_path):
    result, evidence = record(tmp_path, extra=("-p", "no:forgewright_pytest_receipt"))
    assert result.returncode == 2
    assert evidence is None
    assert "VERDICT: PASS" not in result.stdout


def test_completion_replay_collects_fresh_outcomes_after_environment_selection(
    tmp_path, monkeypatch
):
    result, evidence = record(tmp_path)
    assert result.returncode == 0, result.stderr
    sys.path.insert(0, str(ROOT / "scripts/lite"))
    import verify_gate

    path = tmp_path / ".forgewright/verify/receipt.json"
    assert verify_gate._replay_final_commands(evidence, tmp_path, path, False) == []
    monkeypatch.setenv("PYTEST_ADDOPTS", "--deselect=tests/test_game.py::test_required")
    errors = verify_gate._replay_final_commands(evidence, tmp_path, path, False)
    assert any("required ref" in error for error in errors), errors


def test_pytest_ref_boundaries_do_not_match_neighbor_names():
    sys.path.insert(0, str(ROOT / "scripts/lite"))
    from pytest_receipts import matches_ref

    assert matches_ref("test_game.py::test_x[a-b]", "test_game.py::test_x")
    assert matches_ref("test_game.py::TestGame::test_x", "test_game.py::TestGame")
    assert not matches_ref("test_game.py::test_xy[a]", "test_game.py::test_x")
    assert not matches_ref("test_game.py::test_x[b]", "test_game.py::test_x[a]")


@pytest.mark.parametrize("phase", ["red", "mutation"])
def test_strict_xpass_is_not_a_real_acceptance_failure(tmp_path, phase):
    sys.path.insert(0, str(ROOT / "scripts/lite"))
    from pytest_receipts import receipt_errors, run_observed

    (tmp_path / "test_xpass.py").write_text(
        "import pytest\n@pytest.mark.xfail(reason='known defect', strict=True)\n"
        "def test_required():\n    assert True\n"
    )
    command = [
        sys.executable,
        "-m",
        "pytest",
        "-q",
        "--rootdir=.",
        "--confcutdir=.",
        "-p",
        "no:cacheprovider",
        "test_xpass.py",
    ]
    result, receipt = run_observed(command, cwd=tmp_path)
    assert result.returncode == 1, result.stdout + result.stderr
    assert receipt is not None
    receipt["tree_sha"] = "fixture-tree"
    errors = receipt_errors(
        receipt,
        command,
        tmp_path,
        ["test_xpass.py::test_required"],
        phase,
        1,
        "fixture-tree",
    )
    assert errors, "strict XPASS is not a failed acceptance assertion"


def test_packaged_namespace_can_validate_observed_receipt(tmp_path):
    result, evidence = record(tmp_path)
    assert result.returncode == 0, result.stderr
    support = tmp_path / "support"
    runtime = support / "scripts/lite"
    runtime.mkdir(parents=True)
    for name in (
        "evidence_common.py",
        "pytest_receipts.py",
        "forgewright_pytest_receipt.py",
        "run_check.py",
        "verify_gate.py",
    ):
        shutil.copyfile(ROOT / "scripts/lite" / name, runtime / name)
    checked = subprocess.run(
        [
            sys.executable,
            "-I",
            "-c",
            "import sys,json; sys.path.insert(0,sys.argv[1]); "
            "from scripts.lite.evidence_common import execution_errors; "
            "errors=execution_errors(json.load(open(sys.argv[2]))); "
            "assert not errors,errors",
            str(support),
            str(tmp_path / ".forgewright/verify/receipt.json"),
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert checked.returncode == 0, checked.stderr


def test_runtime_bundle_descriptor_and_child_observer_binding(tmp_path):
    sys.path.insert(0, str(ROOT / "scripts/lite"))
    from pytest_receipts import (
        OBSERVER_SHA256,
        bundle_errors,
        receipt_errors,
        run_observed,
        runtime_bundle_descriptor,
    )

    bundle = runtime_bundle_descriptor()
    assert bundle["schema"] == "forgewright-lite-bundle/v1"
    assert bundle["capabilities"] == ["pytest-receipt/v1"]
    assert bundle["observer_sha256"] == OBSERVER_SHA256
    assert set(bundle["modules"]) == {
        "evidence_common.py",
        "forgewright_pytest_receipt.py",
        "pytest_receipts.py",
        "run_check.py",
        "verify_gate.py",
    }
    assert bundle_errors(bundle) == []
    assert bundle_errors(None) == ["UNVERIFIED: canonical verifier bundle is missing"]

    tampered_bundle = {
        **bundle,
        "modules": {**bundle["modules"], "forgewright_pytest_receipt.py": "0" * 64},
    }
    assert bundle_errors(tampered_bundle) == [
        "UNVERIFIED: canonical verifier bundle hash mismatch for 'forgewright_pytest_receipt.py'"
    ]

    test_file = tmp_path / "test_sample.py"
    test_file.write_text("def test_ok():\n    assert True\n", encoding="utf-8")
    cmd = [
        sys.executable,
        "-m",
        "pytest",
        "-q",
        "--rootdir=.",
        "--confcutdir=.",
        "-p",
        "no:cacheprovider",
        "test_sample.py::test_ok",
    ]
    result, receipt = run_observed(cmd, cwd=tmp_path)
    assert result.returncode == 0
    assert receipt is not None
    assert receipt["observer_sha256"] == OBSERVER_SHA256
    tree = "TREE:" + "b" * 64
    bound_receipt = {**receipt, "tree_sha": tree}
    assert (
        receipt_errors(
            bound_receipt,
            cmd,
            tmp_path,
            ["test_sample.py::test_ok"],
            "verification",
            0,
            tree,
        )
        == []
    )

    bad_observer = {**bound_receipt, "observer_sha256": "0" * 64}
    assert receipt_errors(
        bad_observer,
        cmd,
        tmp_path,
        ["test_sample.py::test_ok"],
        "verification",
        0,
        tree,
    ) == ["UNVERIFIED: pytest execution receipt observer_sha256 does not match canonical observer"]

    from pytest_receipts import verify_workspace_canonical_bundle
    assert verify_workspace_canonical_bundle(ROOT) == []
    fake_ws = tmp_path / "fake_ws"
    (fake_ws / "scripts" / "lite").mkdir(parents=True)
    (fake_ws / ".codex").mkdir(parents=True)
    for name in ("stop-gate.sh", "evidence_common.py", "forgewright_pytest_receipt.py", "pytest_receipts.py", "run_check.py", "verify_gate.py"):
        shutil.copyfile(ROOT / "scripts/lite" / name, fake_ws / "scripts/lite" / name)
    # Invalid Stop config with unknown sibling group must be rejected
    (fake_ws / ".codex" / "config.toml").write_text(
        """[features]\nhooks = true\n[[hooks.Stop]]\nmatcher = "*"\n[[hooks.Stop.hooks]]\ntype = "command"\ncommand = "bash scripts/lite/stop-gate.sh --platform CODEX"\n[[hooks.Stop]]\nmatcher = "*"\n[[hooks.Stop.hooks]]\ntype = "command"\ncommand = "echo unknown"\n""",
        encoding="utf-8",
    )
    assert verify_workspace_canonical_bundle(fake_ws) == [
        "UNVERIFIED: workspace .codex/config.toml Stop registration does not match canonical stop-gate.sh"
    ]
    # Absent .codex/config.toml when local stop-gate.sh is present must also be rejected
    (fake_ws / ".codex" / "config.toml").unlink()
    assert verify_workspace_canonical_bundle(fake_ws) == [
        "UNVERIFIED: workspace .codex/config.toml is required when local stop-gate.sh is present"
    ]
