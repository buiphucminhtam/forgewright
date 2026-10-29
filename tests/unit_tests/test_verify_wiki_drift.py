import os
import json
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "ci" / "verify-wiki-drift.sh"


def make_fake_npx(tmp_path: Path) -> Path:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    npx = bin_dir / "npx"
    npx.write_text(
        "#!/usr/bin/env bash\necho 'Status: up-to-date'\nexit 0\n",
        encoding="utf-8",
    )
    npx.chmod(0o755)
    return bin_dir


def run_verifier(
    tmp_path: Path, threshold: str = "0.3"
) -> subprocess.CompletedProcess[str]:
    (tmp_path / ".gitnexus").mkdir()
    env = os.environ.copy()
    env["PATH"] = f"{make_fake_npx(tmp_path)}:{env['PATH']}"
    return subprocess.run(
        ["bash", str(SCRIPT), "--threshold", threshold],
        cwd=tmp_path,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def test_wiki_verifier_accepts_readable_markdown(tmp_path):
    (tmp_path / "README.md").write_text("Port: 3000\n", encoding="utf-8")
    result = run_verifier(tmp_path)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "SAFE" in result.stdout


def test_wiki_verifier_fails_closed_on_broken_markdown_symlink(tmp_path):
    broken = tmp_path / "broken.md"
    broken.symlink_to(broken)
    result = run_verifier(tmp_path)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "Unreadable Markdown" in result.stdout
    assert "SAFE" not in result.stdout


def test_wiki_verifier_preserves_unreadable_claims_when_ports_exist(tmp_path):
    (tmp_path / "README.md").write_text("Port: 3000\n" * 4, encoding="utf-8")
    broken = tmp_path / "broken.md"
    broken.symlink_to(broken)

    result = run_verifier(tmp_path, threshold="1.0")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Tổng số tuyên bố/cấu hình đã quét: 6" in result.stdout
    assert "Số lỗi lệch pha code (Doc-to-Code): 1" in result.stdout
    assert "WARNING" in result.stdout


def test_wiki_verifier_ignores_untracked_local_markdown(tmp_path):
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    tracked = tmp_path / "README.md"
    tracked.write_text("Port: 3000\n", encoding="utf-8")
    subprocess.run(["git", "add", "README.md"], cwd=tmp_path, check=True)
    broken = tmp_path / "local-only.md"
    broken.symlink_to(broken)

    result = run_verifier(tmp_path)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "Unreadable Markdown" not in result.stdout
    assert "SAFE" in result.stdout


@pytest.mark.parametrize("adapter", [False, True, "invalid"])
def test_missing_index_respects_explicit_adapter_state(tmp_path, adapter):
    (tmp_path / "README.md").write_text("Port: 3000\n", encoding="utf-8")
    config = tmp_path / ".forgewright"
    config.mkdir()
    (config / "docs-manifest.json").write_text(
        json.dumps({"adapters": {"gitnexus": adapter}}), encoding="utf-8"
    )
    result = subprocess.run(
        ["bash", str(SCRIPT), "--threshold", "0.3"],
        cwd=tmp_path,
        text=True,
        capture_output=True,
        check=False,
    )
    if adapter is False:
        assert result.returncode == 0, result.stdout + result.stderr
        assert "GitNexus optional/unavailable" in result.stdout
        assert "Số lỗi lệch pha code (Doc-to-Code): 0" in result.stdout
        assert not (tmp_path / ".gitnexus").exists()
    else:
        assert result.returncode == 1, result.stdout + result.stderr
        assert "GitNexus capability unavailable" in result.stdout
        assert "Drift Ratio" not in result.stdout


def test_optional_index_does_not_hide_unreadable_markdown(tmp_path):
    config = tmp_path / ".forgewright"
    config.mkdir()
    (config / "docs-manifest.json").write_text(
        '{"adapters":{"gitnexus":false}}', encoding="utf-8"
    )
    broken = tmp_path / "broken.md"
    broken.symlink_to(broken)
    result = subprocess.run(
        ["bash", str(SCRIPT), "--threshold", "0.3"],
        cwd=tmp_path,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 1, result.stdout + result.stderr
    assert "Unreadable Markdown" in result.stdout
    assert "CRITICAL ALERT" in result.stdout
