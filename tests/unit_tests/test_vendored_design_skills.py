"""Vendored third-party design skills: packaging, registration and the offline lookup."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SKILLS = ROOT / "skills"

VENDORED = {
    "ui-ux-pro-max": {
        "license_file": "LICENSE",
        "license": "MIT",
        "upstream": "nextlevelbuilder/ui-ux-pro-max-skill",
    },
    "frontend-design": {
        "license_file": "LICENSE.txt",
        "license": "Apache-2.0",
        "upstream": "anthropics/skills",
    },
    "emil-design-eng": {
        "license_file": "LICENSE",
        "license": "MIT",
        "upstream": "emilkowalski/skills",
    },
}

GAME_GENRES = [
    pytest.param("casual puzzle game", "Casual Puzzle Game", id="puzzle"),
    pytest.param("idle clicker game", "Idle & Clicker Game", id="idle"),
    pytest.param("trivia quiz game", "Trivia & Quiz Game", id="trivia"),
    pytest.param("card board game", "Card & Board Game", id="card"),
    pytest.param("word crossword game", "Word & Crossword Game", id="word"),
]

SEARCH = SKILLS / "ui-ux-pro-max" / "scripts" / "search.py"


def _frontmatter_name(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"---\n(.*?)\n---\n", text, re.S)
    assert match, f"{path} has no frontmatter"
    name = re.search(r"^name:\s*(\S+)\s*$", match.group(1), re.M)
    assert name, f"{path} frontmatter has no name"
    return name.group(1)


def _contrast(a: str, b: str) -> float:
    def luminance(hex_color: str) -> float:
        h = hex_color.lstrip("#")
        channels = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
        linear = [
            c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
            for c in channels
        ]
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]

    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def _search(args: list[str], cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-I", "-B", str(SEARCH), *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=120,
    )


@pytest.mark.parametrize("name", sorted(VENDORED))
def test_vendored_skill_is_packaged_with_credit_and_license(name: str) -> None:
    meta = VENDORED[name]
    skill_dir = SKILLS / name
    assert _frontmatter_name(skill_dir / "SKILL.md") == name
    assert _frontmatter_name(skill_dir / "LITE.md") == name
    license_text = (skill_dir / meta["license_file"]).read_text(encoding="utf-8")
    assert (
        "MIT License" if meta["license"] == "MIT" else "Apache License"
    ) in license_text
    lite = (skill_dir / "LITE.md").read_text(encoding="utf-8")
    assert meta["upstream"] in lite
    assert meta["license"] in lite
    assert "`unslop`" in lite, "LITE must defer to the mandatory unslop gate"


@pytest.mark.parametrize("name", sorted(VENDORED))
def test_vendored_skill_is_registered_everywhere(name: str) -> None:
    registry = (SKILLS / "skills-registry.yaml").read_text(encoding="utf-8")
    assert f"  - name: {name}\n    type: canonical\n" in registry
    inventory = json.loads(
        (ROOT / "product-factory" / "instruction-inventory.v1.json").read_text(
            encoding="utf-8"
        )
    )
    paths = {entry["path"]: entry["authority"] for entry in inventory["sources"]}
    assert paths.get(f"skills/{name}/SKILL.md") == "routed_skill"
    assert paths.get(f"skills/{name}/LITE.md") == "routed_lite"
    index = (ROOT / "kernel" / "INDEX.md").read_text(encoding="utf-8")
    assert f"| **{name}** |" in index
    assert f"(../skills/{name}/LITE.md)" in index
    installer = (ROOT / "scripts" / "bootstrap" / "forgewright-install.sh").read_text(
        encoding="utf-8"
    )
    full = installer.split("FULL_SKILLS=(", 1)[1].split(")", 1)[0]
    assert f'"{name}"' in full
    catalog = (ROOT / "docs" / "skill-catalog.md").read_text(encoding="utf-8")
    assert (
        f"[{name}](https://github.com/buiphucminhtam/forgewright/blob/main/skills/{name}/SKILL.md)<br>VENDORED"
        in catalog
    )


def test_ui_ux_pro_max_lite_keeps_discovery_only_status() -> None:
    registry = json.loads(
        (SKILLS / "ui-designer" / "data" / "reference-registry.json").read_text(
            encoding="utf-8"
        )
    )
    entry = next(e for e in registry["entries"] if e.get("id") == "ui-ux-pro-max")
    assert entry["source_class"] == "discovery_only"
    assert entry["can_ground_without_card"] is False
    lite = (SKILLS / "ui-ux-pro-max" / "LITE.md").read_text(encoding="utf-8")
    assert "`discovery_only`" in lite
    assert "never accept" in lite
    assert "grounded" not in lite


def test_ui_ux_pro_max_script_paths_resolve_inside_the_skill() -> None:
    skill = (SKILLS / "ui-ux-pro-max" / "SKILL.md").read_text(encoding="utf-8")
    assert "CLAUDE_PLUGIN_ROOT" not in skill, (
        "plugin-only path would break non-plugin installs"
    )
    referenced = set(re.findall(r"<skill folder>/scripts/([A-Za-z0-9_]+\.py)", skill))
    assert "search.py" in referenced
    for script in referenced:
        assert (SKILLS / "ui-ux-pro-max" / "scripts" / script).is_file(), script


@pytest.mark.parametrize("query,category", GAME_GENRES)
def test_game_genre_lookup_returns_accessible_design_system(
    query: str, category: str, tmp_path: Path
) -> None:
    result = _search([query, "--design-system", "--json", "-p", "Game"], tmp_path)
    assert result.returncode == 0, result.stderr
    design = json.loads(result.stdout)["design_system"]
    assert design["category"] == category
    colors = design["colors"]
    assert _contrast(colors["foreground"], colors["background"]) >= 4.5
    assert _contrast(colors["on_primary"], colors["primary"]) >= 4.5
    assert design["typography"]
    assert list(tmp_path.iterdir()) == [], (
        "a lookup without --persist must not write files"
    )


def test_persist_writes_only_under_output_dir(tmp_path: Path) -> None:
    cwd = tmp_path / "cwd"
    out = tmp_path / "out"
    cwd.mkdir()
    out.mkdir()
    result = _search(
        [
            "idle clicker game",
            "--design-system",
            "--persist",
            "-p",
            "Idle Test",
            "--output-dir",
            str(out),
        ],
        cwd,
    )
    assert result.returncode == 0, result.stderr
    assert (out / "design-system" / "idle-test" / "MASTER.md").is_file()
    assert list(cwd.iterdir()) == []


def test_unknown_domain_is_rejected(tmp_path: Path) -> None:
    result = _search(["menu", "--domain", "not-a-domain"], tmp_path)
    assert result.returncode != 0
    assert "invalid choice" in result.stderr


def test_whitespace_check_skips_only_the_vendored_scripts() -> None:
    def whitespace_attr(path: str) -> str:
        result = subprocess.run(
            ["git", "check-attr", "whitespace", "--", path],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 0, result.stderr
        return result.stdout.rsplit(": ", 1)[1].strip()

    assert whitespace_attr("skills/ui-ux-pro-max/scripts/design_system.py") == "unset"
    for path in (
        "skills/ui-ux-pro-max/SKILL.md",
        "skills/ui-ux-pro-max/LITE.md",
        "skills/ui-ux-pro-max/data/products.csv",
        "scripts/lite/verify_gate.py",
        "tests/unit_tests/test_vendored_design_skills.py",
    ):
        assert whitespace_attr(path) == "unspecified", path


def test_ruff_skips_only_the_vendored_scripts() -> None:
    config = (ROOT / "ruff.toml").read_text(encoding="utf-8")
    assert "force-exclude = true" in config
    excludes = re.search(r"extend-exclude = \[(.*?)\]", config).group(1)
    assert [e.strip().strip('"') for e in excludes.split(",")] == [
        "skills/ui-ux-pro-max/scripts"
    ]


def test_repository_product_truth_agrees_with_vendored_skills() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "ci" / "verify-product-truth.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "manifest, inventory, and public claims agree" in result.stdout


def test_repository_skill_count_and_lite_coverage_match_registry() -> None:
    result = subprocess.run(
        ["bash", str(ROOT / "scripts" / "ci" / "verify-skill-count.sh")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "LITE.md coverage: 93 / 93" in result.stdout
    assert "Skill count matches (93 skills)" in result.stdout
