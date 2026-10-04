"""Public JS client through real IPC, with bounded synthetic host telemetry."""

from pathlib import Path
import subprocess


def test_public_client_admission_recovery_and_cleanup():
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        ["node", "--test", "integrations/pi/governor-wait.test.mjs"],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=100,  # Two sequential pressure profiles, each with real recovery/idle waits.
        check=False,
    )
    print(result.stdout)
    assert result.returncode == 0, result.stdout + result.stderr
    assert '"state":"reclaimed"' in result.stdout
    assert "fail 0" in result.stdout
