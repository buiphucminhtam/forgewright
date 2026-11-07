from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[2]

LEGACY_PATHS = (
    ROOT / "scripts" / "telegram-listener.py",
    ROOT / "scripts" / "utilities" / "telegram-listener.py",
    ROOT / "scripts" / "task-runner.sh",
    ROOT / "scripts" / "runtime" / "task-runner.sh",
    ROOT / "_local_tmp_edits",
)

FORBIDDEN_RUNTIME_MARKERS = (
    "api.telegram.org",
    "FORGEWRIGHT_TELEGRAM_BOT_TOKEN",
    "/root/scripts/task-runner.sh",
    "send_telegram(",
    "Tiểu Mơ",
)

SECRET_SCANNING_PATTERNS = (
    ("google_api_key", re.compile(r"AIzaSy[0-9A-Za-z_-]{33}")),
    ("telegram_bot_token", re.compile(r"\b[0-9]{8,10}:AA[0-9A-Za-z_-]{33}\b")),
)

HISTORICAL_LEAK_FRAGMENTS = (
    ("alert_1_vault", "s.DebertaV2", "PreTrainedModel"),
    ("alert_2_flickr", "3c34c3ac904b6d6f", "26182807fbb95c5e"),
    ("alert_3_flickr", "d3b2b610171589db", "68809c3ec3bf2bcb"),
    ("alert_4_vault", "s.DINOv3ViT", "PreTrainedModel"),
    ("alert_5_flickr", "66c8e8a00ad0a906", "f632ff99cf490163"),
    ("alert_6_telegram", "8367193476:AAGHAetVy_", "ypiqi56lVqAGrZKzuHbzpENLw"),
    ("alert_7_google", "AIzaSy1234567890-", "abcdefghij123456789012"),
)


def test_legacy_telegram_runtime_paths_are_absent() -> None:
    for path in LEGACY_PATHS:
        assert not path.exists(), (
            f"legacy Telegram/VPS runtime path must stay removed: {path}"
        )


def test_active_scripts_do_not_reintroduce_legacy_telegram_runtime() -> None:
    scripts = ROOT / "scripts"
    active_text = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in scripts.rglob("*")
        if path.is_file() and path.suffix in {".py", ".sh", ".js", ".ts"}
    )
    for marker in FORBIDDEN_RUNTIME_MARKERS:
        assert marker not in active_text, (
            f"legacy Telegram/VPS marker reintroduced: {marker}"
        )


def test_tracked_files_do_not_contain_secret_scanning_literals() -> None:
    tracked = subprocess.check_output(
        ["git", "ls-files"], cwd=ROOT, text=True
    ).splitlines()
    historical_literals = {
        name: prefix + suffix for name, prefix, suffix in HISTORICAL_LEAK_FRAGMENTS
    }
    findings: list[str] = []
    for rel_path in tracked:
        path = ROOT / rel_path
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for label, pattern in SECRET_SCANNING_PATTERNS:
            match = pattern.search(text)
            if match:
                findings.append(f"{rel_path}: matched {label}")
        for label, literal in historical_literals.items():
            if literal in text:
                findings.append(f"{rel_path}: matched {label}")
    assert not findings, (
        "tracked files contain secret-scanning literals: " + ", ".join(findings)
    )


def test_validate_commit_blocks_staged_secret_scanning_literals(
    tmp_path: Path,
) -> None:
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    sample = tmp_path / "sample.ts"
    google_literal = "AIzaSy" + "1234567890-abcdefghij123456789012"
    sample.write_text(f'const k = "{google_literal}";\n', encoding="utf-8")
    subprocess.run(["git", "add", "sample.ts"], cwd=tmp_path, check=True)

    validator = ROOT / "scripts" / "ci" / "validate-commit.sh"
    res = subprocess.run(
        ["bash", str(validator), "--staged"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )
    assert res.returncode != 0, "validate-commit.sh must block staged secret literals"
    assert "SECURITY:" in res.stderr
