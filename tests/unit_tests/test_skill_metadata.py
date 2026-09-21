from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/runtime/skill_metadata.py"


def module():
    spec = importlib.util.spec_from_file_location("skill_metadata", MODULE_PATH)
    assert spec and spec.loader
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def test_boot_skill_descriptions_are_trigger_only():
    m = module()
    report = m.scan(ROOT)
    assert report["status"] == "pass", report["errors"]
    rows = {(row["skill"], row["surface"]): row for row in report["rows"]}
    for skill in m.BOOT_SKILLS:
        for surface in ("LITE.md", "SKILL.md"):
            assert rows[(skill, surface)]["strict"] is True
            assert rows[(skill, surface)]["diagnostics"] == []


def test_linter_rejects_workflow_description():
    m = module()
    diagnostics = m.lint_description(
        "Systematic debugger. Use when a bug occurs. First reproduce, then apply a fix."
    )
    codes = {row["code"] for row in diagnostics}
    assert "DESCRIPTION_NOT_TRIGGER_ONLY" in codes
    assert "DESCRIPTION_WORKFLOW_LEAK" in codes


def test_linter_accepts_trigger_only_description():
    m = module()
    assert (
        m.lint_description(
            "Use when the user reports a bug, crash, failing test, regression, or unexpected behavior."
        )
        == []
    )


def test_frontmatter_parser_supports_folded_description(tmp_path: Path):
    m = module()
    path = tmp_path / "LITE.md"
    path.write_text(
        "---\nname: demo\ndescription: >\n  Use when a demo task\n  needs routing.\nversion: 1\n---\n# Demo\n"
    )
    assert m.parse_skill(path)["description"] == "Use when a demo task needs routing."
