import json
import os
import stat
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "evals" / "routing" / "providers" / "cli.py"


def test_probe_is_provider_agnostic_and_performs_no_generation(tmp_path: Path) -> None:
    binary = tmp_path / "provider-x"
    marker = tmp_path / "generated"
    binary.write_text(
        "#!/bin/sh\nif [ \"$1\" = '--version' ]; then echo 'provider-x 1.2.3'; exit 0; fi\ntouch \"$MARKER\"\n",
        encoding="utf-8",
    )
    binary.chmod(binary.stat().st_mode | stat.S_IXUSR)
    result = subprocess.run(
        [
            sys.executable,
            str(PROBE),
            "probe",
            "--provider",
            "provider-x",
            "--executable",
            str(binary),
            "--version-args-json",
            '["--version"]',
            "--invocation-args-json",
            '["--print", "{prompt}"]',
            "--routing-mode",
            "provider-managed",
        ],
        cwd=ROOT,
        env={**os.environ, "MARKER": str(marker)},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["provider"] == "provider-x"
    assert report["version"] == "provider-x 1.2.3"
    assert report["routing_mode"] == "provider-managed"
    assert report["probe_process_calls"] == 1
    assert report["probe_side_effects"] == "provider-defined-version-command"
    assert report["invocation_calls"] == 0
    assert report["routing_mode_status"] == "adapter-declared-unverified"
    assert not marker.exists()


def test_probe_rejects_unsafe_or_missing_invocation_contract() -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(PROBE),
            "probe",
            "--provider",
            "x",
            "--executable",
            "missing-x",
            "--version-args-json",
            "[]",
            "--invocation-args-json",
            '["--prompt", "literal"]',
            "--routing-mode",
            "provider-managed",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "{prompt}" in result.stderr or "not found" in result.stderr


def test_opt_in_smoke_invokes_generic_cli_without_persisting_output(
    tmp_path: Path,
) -> None:
    binary = tmp_path / "provider-y"
    binary.write_text(
        "#!/bin/sh\nif [ \"$1\" = '--version' ]; then echo 'provider-y 1'; else echo 'FORGEWRIGHT_PROVIDER_SMOKE_OK'; fi\n",
        encoding="utf-8",
    )
    binary.chmod(binary.stat().st_mode | stat.S_IXUSR)
    result = subprocess.run(
        [
            sys.executable,
            str(PROBE),
            "smoke",
            "--provider",
            "provider-y",
            "--executable",
            str(binary),
            "--version-args-json",
            '["--version"]',
            "--invocation-args-json",
            '["--print", "{prompt}"]',
            "--routing-mode",
            "provider-managed",
        ],
        cwd=ROOT,
        env={**os.environ, "FORGEWRIGHT_PROVIDER_SMOKE": "1"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    receipt = json.loads(result.stdout)
    assert receipt["marker_verified"] is True
    assert receipt["invocation_calls"] == 1
    assert receipt["live_evidence_eligible"] is False
    assert "FORGEWRIGHT_PROVIDER_SMOKE_OK" not in json.dumps(receipt)


def test_smoke_requires_explicit_opt_in(tmp_path: Path) -> None:
    binary = tmp_path / "provider-z"
    binary.write_text("#!/bin/sh\necho 'provider-z 1'\n", encoding="utf-8")
    binary.chmod(binary.stat().st_mode | stat.S_IXUSR)
    result = subprocess.run(
        [
            sys.executable,
            str(PROBE),
            "smoke",
            "--provider",
            "provider-z",
            "--executable",
            str(binary),
            "--version-args-json",
            '["--version"]',
            "--invocation-args-json",
            '["{prompt}"]',
            "--routing-mode",
            "provider-managed",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "FORGEWRIGHT_PROVIDER_SMOKE=1" in result.stderr


def test_catalog_discovers_models_from_generic_cli_lines(tmp_path: Path) -> None:
    binary = tmp_path / "provider-catalog"
    binary.write_text(
        "#!/bin/sh\nprintf 'Model Alpha\\nModel Beta\\n'\n",
        encoding="utf-8",
    )
    binary.chmod(binary.stat().st_mode | stat.S_IXUSR)
    result = subprocess.run(
        [
            sys.executable,
            str(PROBE),
            "catalog",
            "--provider",
            "catalog-x",
            "--executable",
            str(binary),
            "--version-args-json",
            "[]",
            "--invocation-args-json",
            '["{prompt}"]',
            "--routing-mode",
            "explicit-tier",
            "--catalog-args-json",
            '["models"]',
            "--catalog-format",
            "lines",
        ],
        cwd=ROOT,
        env={**os.environ, "FORGEWRIGHT_PROVIDER_CATALOG": "1"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    receipt = json.loads(result.stdout)
    assert receipt["models"] == ["Model Alpha", "Model Beta"]
    assert receipt["catalog_calls"] == 1
    assert receipt["generation_calls"] == "not-observed"
    assert receipt["catalog_side_effects"] == "provider-defined"
    assert receipt["models_source"] == "provider-cli-runtime"
