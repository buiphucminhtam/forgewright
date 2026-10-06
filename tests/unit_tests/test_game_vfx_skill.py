"""Shared VFX requirements: route boundaries and complete installable references."""

import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess

import pytest

from scripts.runtime.skill_routing import route_skills

ROOT = Path(__file__).resolve().parents[2]
SKILL = ROOT / "skills/game-asset-vfx"
EVALS = json.loads((SKILL / "evals/routing.json").read_text())


def names(result):
    assert result["status"] == "ok", result
    return [skill["name"] for skill in result["skills"]]


@pytest.mark.parametrize("case", EVALS["positive"], ids=lambda case: case["id"])
def test_game_preset_keeps_vfx_for_positive_en_vi_requests(case):
    result = route_skills(prompt=case["prompt"], mode="game-build", project_root=ROOT)
    assert "game-asset-vfx" in names(result)
    if case["auto_game_mode"]:
        automatic = route_skills(prompt=case["prompt"], project_root=ROOT)
        assert automatic["mode"] == "game-build"
        assert "game-asset-vfx" in names(automatic)


@pytest.mark.parametrize("case", EVALS["negative"], ids=lambda case: case["id"])
def test_video_ads_and_image_edits_do_not_auto_load_vfx_even_in_game_preset(
    case, tmp_path
):
    # Ensure exclusion is exercised, not accidentally masked by token deferral.
    config = tmp_path / "config.json"
    document = json.loads((ROOT / ".forgewright/skills-config.json").read_text())
    document["context_budget"]["max_skill_descriptions_tokens"] = 20000
    config.write_text(json.dumps(document))
    for mode in (None, "game-build"):
        result = route_skills(
            prompt=case["prompt"], mode=mode, project_root=ROOT, config_path=config
        )
        assert "game-asset-vfx" not in names(result)


def test_config_controls_and_other_roles_are_preserved(tmp_path):
    original = json.loads((ROOT / ".forgewright/skills-config.json").read_text())
    config = tmp_path / "config.json"
    negative = EVALS["negative"][0]["prompt"]
    # The boundary removes only this overlay, without changing the preset/mode.
    baseline = route_skills(mode="game-build", project_root=ROOT)
    filtered = route_skills(prompt=negative, mode="game-build", project_root=ROOT)
    assert names(filtered) == [
        name for name in names(baseline) if name != "game-asset-vfx"
    ]
    # Isolate enablement from token deferral with a small host-owned preset.
    original["auto_detect_rules"]["mode_skill_map"]["game-build"] = [
        "game-designer",
        "game-asset-vfx",
    ]
    for enabled, expected in [(True, True), (False, False), ("auto", False)]:
        original["skills"]["game-asset-vfx"]["enabled"] = enabled
        config.write_text(json.dumps(original))
        result = route_skills(
            prompt=negative, mode="game-build", config_path=config, project_root=ROOT
        )
        assert ("game-asset-vfx" in names(result)) is expected
    original["skills"]["game-asset-vfx"]["enabled"] = "auto"
    original["auto_detect"] = False
    config.write_text(json.dumps(original))
    result = route_skills(
        prompt=negative, mode="game-build", config_path=config, project_root=ROOT
    )
    assert "game-asset-vfx" in names(result)  # explicit host preset, no detection


def test_source_export_keeps_all_vfx_references_and_local_links(tmp_path):
    spec = importlib.util.spec_from_file_location(
        "vfx_plugin_export", ROOT / "scripts/ci/plugin_native_host.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    exported = tmp_path / "package"
    module.export_source_tree(ROOT, exported)
    for source in SKILL.rglob("*"):
        if not source.is_file():
            continue
        packaged = exported / source.relative_to(ROOT)
        assert packaged.read_bytes() == source.read_bytes()
        if source.suffix == ".md":
            for link in re.findall(r"\]\(([^)]+)\)", packaged.read_text()):
                if "://" not in link and not link.startswith("#"):
                    assert (packaged.parent / link.split("#")[0]).is_file(), link


def test_negative_intent_does_not_hide_invalid_configured_vfx(tmp_path):
    config = tmp_path / "config.json"
    config.write_text(
        json.dumps(
            {
                "auto_detect_rules": {
                    "mode_skill_map": {"game-build": ["game-asset-vfx"]}
                },
                "skills": {"game-asset-vfx": {"enabled": "auto"}},
            }
        )
    )
    catalog = tmp_path / "skills"
    catalog.mkdir()
    result = route_skills(
        prompt="Edit a game trailer",
        mode="game-build",
        config_path=config,
        project_root=tmp_path,
        skills_root=catalog,
    )
    assert result["status"] == "error"
    assert "missing skill directory" in result["errors"][0]


def test_full_installer_discovers_entire_vfx_skill_in_isolated_home(tmp_path):
    destination = tmp_path / "installed"
    env = dict(os.environ)
    env.update(
        HOME=str(tmp_path / "home"),
        FORGEWRIGHT_DIR=str(destination),
        FORGEWRIGHT_SOURCE_DIR=str(ROOT),
    )
    result = subprocess.run(
        [
            "bash",
            str(ROOT / "scripts/bootstrap/forgewright-install.sh"),
            "--profile",
            "full",
            "--yes",
            "--skip-mcp",
            "--skip-config",
        ],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    installed = destination / "skills/game-asset-vfx"
    assert installed.is_dir()
    for source in SKILL.rglob("*"):
        if source.is_file():
            assert (
                installed / source.relative_to(SKILL)
            ).read_bytes() == source.read_bytes()
