"""
tests/unit_tests/test_eval_comparable.py

Regression tests for the cheap-model eval harness (run-evals.py):
1. --compare with a mock results-lite.json vs live results-legacy.json must exit
   non-zero (these files exist in the repo and are the old bad combination).
2. Strict-schema unit tests for mock/model/provider/snapshot/task/attempt/verifier mismatch.
3. Syntax and import sanity check for run-evals.py.
"""

import sys
import os
import json
import subprocess
import importlib.util

import pytest

# ---------------------------------------------------------------------------
# Resolve paths relative to this test file.
# ---------------------------------------------------------------------------
_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_TESTS_DIR, "..", ".."))
_EVAL_DIR = os.path.join(_REPO_ROOT, "evals", "cheap-model")
_RUN_EVALS = os.path.join(_EVAL_DIR, "run-evals.py")
_LEGACY_JSON = os.path.join(_EVAL_DIR, "results-legacy.json")
_LITE_JSON = os.path.join(_EVAL_DIR, "results-lite.json")


def _import_run_evals():
    """Import run-evals.py as a module (syntax + import check)."""
    spec = importlib.util.spec_from_file_location("run_evals", _RUN_EVALS)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# 1. Syntax / import sanity.
# ---------------------------------------------------------------------------
class TestRunEvalsSyntax:
    def test_can_import_without_error(self):
        """run-evals.py must be importable (Python syntax is valid)."""
        mod = _import_run_evals()
        assert callable(mod.print_comparison)
        assert callable(mod.parse_args)
        assert callable(mod.main)


# ---------------------------------------------------------------------------
# 2. Unit tests for print_comparison() comparability gate.
# ---------------------------------------------------------------------------
class TestPrintComparisonComparabilityGate:
    """print_comparison() must return False for non-comparable pairs."""

    def _write_report(self, path: str, **kwargs):
        data = {
            "schemaVersion": 2,
            "timestamp": "2026-07-04T00:00:00Z",
            "mode": "live",
            "model": "gemini-2.5-flash",
            "provider": "gemini",
            "defaultAttempts": 3,
            "verifierVersion": "1",
            "comparisonMetadata": {
                "mode": "live",
                "provider": "gemini",
                "modelId": "gemini-2.5-flash",
                "modelSnapshot": "gemini-2.5-flash-2026-07-01",
                "taskIds": [
                    "debug-1",
                    "feature-1",
                    "safety-1",
                    "refactor-1",
                    "verification-1",
                ],
                "attempts": 3,
                "verifierVersion": "1",
                "verifierFingerprint": "fixture-verifiers-v1",
            },
            "summary": {
                "totalTasks": 5,
                "passedTasks": 3,
                "passRate": 60.0,
                "categories": {},
            },
            "results": [],
        }
        data.update(kwargs)
        with open(path, "w") as f:
            json.dump(data, f)

    def test_mock_vs_live_returns_false(self, tmp_path):
        mod = _import_run_evals()
        legacy = str(tmp_path / "legacy.json")
        lite = str(tmp_path / "lite.json")
        self._write_report(legacy, mode="live")
        self._write_report(lite, comparisonMetadata={"mode": "mock"})
        result = mod.print_comparison(legacy, lite)
        assert result is False

    def test_model_mismatch_returns_false(self, tmp_path):
        mod = _import_run_evals()
        legacy = str(tmp_path / "legacy.json")
        lite = str(tmp_path / "lite.json")
        self._write_report(legacy)
        self._write_report(
            lite, comparisonMetadata={**self._metadata(), "modelId": "gemini-2.0-flash"}
        )
        result = mod.print_comparison(legacy, lite)
        assert result is False

    def test_provider_mismatch_returns_false(self, tmp_path):
        mod = _import_run_evals()
        legacy = str(tmp_path / "legacy.json")
        lite = str(tmp_path / "lite.json")
        self._write_report(legacy)
        self._write_report(
            lite, comparisonMetadata={**self._metadata(), "provider": "codex"}
        )
        result = mod.print_comparison(legacy, lite)
        assert result is False

    def test_task_count_mismatch_returns_false(self, tmp_path):
        mod = _import_run_evals()
        legacy = str(tmp_path / "legacy.json")
        lite = str(tmp_path / "lite.json")
        self._write_report(legacy)
        self._write_report(
            lite,
            comparisonMetadata={
                **self._metadata(),
                "taskIds": ["debug-1", "feature-1", "other"],
            },
        )
        result = mod.print_comparison(legacy, lite)
        assert result is False

    def test_attempt_mismatch_returns_false(self, tmp_path):
        mod = _import_run_evals()
        legacy = str(tmp_path / "legacy.json")
        lite = str(tmp_path / "lite.json")
        self._write_report(legacy)
        self._write_report(lite, comparisonMetadata={**self._metadata(), "attempts": 1})
        result = mod.print_comparison(legacy, lite)
        assert result is False

    def test_verifier_version_mismatch_returns_false(self, tmp_path):
        mod = _import_run_evals()
        legacy = str(tmp_path / "legacy.json")
        lite = str(tmp_path / "lite.json")
        self._write_report(legacy)
        self._write_report(
            lite, comparisonMetadata={**self._metadata(), "verifierVersion": "2"}
        )
        result = mod.print_comparison(legacy, lite)
        assert result is False

    def test_identical_live_reports_returns_true(self, tmp_path):
        mod = _import_run_evals()
        legacy = str(tmp_path / "legacy.json")
        lite = str(tmp_path / "lite.json")
        self._write_report(legacy)
        self._write_report(lite)
        result = mod.print_comparison(legacy, lite)
        assert result is True

    @staticmethod
    def _metadata():
        return {
            "mode": "live",
            "provider": "gemini",
            "modelId": "gemini-2.5-flash",
            "modelSnapshot": "gemini-2.5-flash-2026-07-01",
            "taskIds": [
                "debug-1",
                "feature-1",
                "safety-1",
                "refactor-1",
                "verification-1",
            ],
            "attempts": 3,
            "verifierVersion": "1",
            "verifierFingerprint": "fixture-verifiers-v1",
        }

    def test_missing_model_snapshot_returns_false(self, tmp_path):
        mod = _import_run_evals()
        legacy = str(tmp_path / "legacy.json")
        lite = str(tmp_path / "lite.json")
        self._write_report(legacy)
        metadata = self._metadata()
        del metadata["modelSnapshot"]
        self._write_report(lite, comparisonMetadata=metadata)
        assert mod.print_comparison(legacy, lite) is False

    def test_snapshot_mismatch_returns_false(self, tmp_path):
        mod = _import_run_evals()
        legacy = str(tmp_path / "legacy.json")
        lite = str(tmp_path / "lite.json")
        self._write_report(legacy)
        self._write_report(
            lite,
            comparisonMetadata={**self._metadata(), "modelSnapshot": "other-snapshot"},
        )
        assert mod.print_comparison(legacy, lite) is False


# ---------------------------------------------------------------------------
# 3. Regression: --compare on the REPO'S existing results files must exit
#    non-zero because results-lite.json was produced in mock mode while
#    results-legacy.json was produced in live mode.
# ---------------------------------------------------------------------------
class TestRegressionOldComparisonExitsNonZero:
    """The old results-lite.json (mode=mock) vs results-legacy.json (mode=live)
    is an invalid comparison and must cause the script to exit with a non-zero
    code."""

    @pytest.mark.skipif(
        not (os.path.exists(_LEGACY_JSON) and os.path.exists(_LITE_JSON)),
        reason="Existing results JSON files not present in repo",
    )
    def test_old_compare_exits_nonzero(self):
        result = subprocess.run(
            [sys.executable, _RUN_EVALS, "--compare"],
            capture_output=True,
            text=True,
            cwd=_REPO_ROOT,
        )
        assert result.returncode != 0, (
            f"Expected non-zero exit for mock-vs-live comparison, got 0.\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )
        # The error message must mention 'mock' or 'comparable'.
        combined = result.stdout + result.stderr
        assert "mock" in combined.lower() or "comparable" in combined.lower(), (
            f"Expected 'mock' or 'comparable' in output.\nOutput: {combined}"
        )
