"""RF02 tests for kernel consolidation, host profile append preservation, and DocsHub HTML gate decoupling."""

from __future__ import annotations

import importlib.util
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SYNC = ROOT / "scripts" / "lite" / "sync-kernel.py"


def _load_sync_module():
    spec = importlib.util.spec_from_file_location("sync_kernel_rf02", SYNC)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def test_sync_kernel_preserves_custom_and_gitnexus_appends_without_assuming_all_profiles_share_them(tmp_path: Path):
    mod = _load_sync_module()
    fixture = tmp_path / "repo"
    (fixture / "kernel").mkdir(parents=True)
    for name in mod.LITE_FILES:
        shutil.copy2(ROOT / "kernel" / name, fixture / "kernel" / name)

    # AGENTS.md has gitnexus + user-local append; GEMINI.md is a fresh profile without appends.
    (fixture / "AGENTS.md").write_text(
        "old header\n<!-- gitnexus:start -->\n# GitNexus custom\n<!-- gitnexus:end -->\n"
        "<!-- user-local:start -->\nCustom repo-local instruction\n<!-- user-local:end -->\n",
        encoding="utf-8",
    )
    mod.PROJECT_ROOT = str(fixture)
    mod.KERNEL_DIR = str(fixture / "kernel")
    assert mod.sync(check=False) == 0
    assert mod.sync(check=True) == 0

    agents_text = (fixture / "AGENTS.md").read_text(encoding="utf-8")
    gemini_text = (fixture / "GEMINI.md").read_text(encoding="utf-8")
    claude_text = (fixture / "CLAUDE.md").read_text(encoding="utf-8")

    assert "<!-- gitnexus:start -->" in agents_text
    assert "Custom repo-local instruction" in agents_text
    assert "<!-- gitnexus:start -->" not in gemini_text
    assert "Custom repo-local instruction" not in gemini_text
    assert "Host profile: Codex / Antigravity / Cursor" in agents_text
    assert "Host profile: Gemini CLI" in gemini_text
    assert "Host profile: Claude Code" in claude_text


def test_Generated_profiles_and_kernel_fit_within_7k_token_budget():
    mod = _load_sync_module()
    assert mod.sync(check=True) == 0
    for name in ("CLAUDE.md", "AGENTS.md", "GEMINI.md"):
        text = (ROOT / name).read_text(encoding="utf-8")
        assert mod.estimate_tokens(text) < 7000


def test_pipeline_operating_contract_decouples_html_render_from_starting_code_edits():
    contract = (ROOT / "skills/_shared/protocols/pipeline-operating-contract.md").read_text(encoding="utf-8")
    assert "non-deliverable HTML renderer issue does not block starting code edits" in contract
    assert "when HTML/renderer is the requested deliverable and the baseline build fails" in contract
