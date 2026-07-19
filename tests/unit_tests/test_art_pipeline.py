from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from tests.unit_tests.test_style_contract import valid_contract


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / "scripts" / "art-direction" / "art-pipeline.sh"
REVIEWER = ROOT / "scripts" / "art-direction" / "vision-review.sh"


def write_contract(tmp_path: Path, *, approved: bool = True) -> Path:
    value = valid_contract()
    if not approved:
        value["approval"] = {"status": "draft"}
    path = tmp_path / "contract.json"
    path.write_text(json.dumps(value), encoding="utf-8")
    return path


def test_generate_uses_contract_compiler_and_has_no_placeholders(
    tmp_path: Path,
) -> None:
    contract = write_contract(tmp_path)
    env = os.environ.copy()
    env["PROJECT_STYLE_GUIDE"] = str(contract)
    env["PATH"] = "/usr/bin:/bin"

    result = subprocess.run(
        [str(PIPELINE), "generate", "character", "clockwork-fox"],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "clockwork-fox" in result.stdout
    assert "#123456" in result.stdout
    assert "[HEAD_BODY_RATIO]" not in result.stdout


def test_generate_rejects_draft_contract(tmp_path: Path) -> None:
    contract = write_contract(tmp_path, approved=False)
    env = os.environ.copy()
    env["PROJECT_STYLE_GUIDE"] = str(contract)

    result = subprocess.run(
        [str(PIPELINE), "generate", "icon", "coin"],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert "approval.status must be approved" in result.stderr


def test_reviewer_parses_style_guide_and_type_flags(tmp_path: Path) -> None:
    contract = write_contract(tmp_path)
    image = tmp_path / "asset.png"
    image.write_bytes(b"not-a-real-png")
    scores = tmp_path / "scores"
    argv_log = tmp_path / "claude-argv.txt"
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_claude = fake_bin / "claude"
    fake_claude.write_text(
        "#!/usr/bin/env bash\n"
        'printf \'%s\\n\' "$@" > "$FAKE_CLAUDE_ARGV_LOG"\n'
        'printf \'%s\\n\' \'{"scores":{"palette_adherence":9,"anatomy":9,"style_consistency":9,"ai_tells":9,"silhouette":9,"engine_readiness":9},"issues":[],"strengths":[],"regeneration_hints":[],"summary":"ok"}\'\n',
        encoding="utf-8",
    )
    fake_claude.chmod(0o755)
    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}:/usr/bin:/bin"
    env["FAKE_CLAUDE_ARGV_LOG"] = str(argv_log)
    env["ART_REVIEW_SCORES_DIR"] = str(scores)

    result = subprocess.run(
        [
            str(REVIEWER),
            "review",
            str(image),
            "--style-guide",
            str(contract),
            "--type",
            "game-2d",
        ],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    logged = argv_log.read_text(encoding="utf-8")
    assert "#123456" in logged
    assert "2D game asset" in logged
    report = scores / f"{image.name}.review.json"
    assert report.is_file()
    assert json.loads(report.read_text(encoding="utf-8"))["verdict"] == "APPROVE"
