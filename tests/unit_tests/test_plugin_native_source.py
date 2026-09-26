"""Native plugin source packaging excludes caches without losing candidate changes."""

from __future__ import annotations

import importlib.util
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]


def module():
    spec = importlib.util.spec_from_file_location(
        "plugin_native_host", ROOT / "scripts/ci/plugin_native_host.py"
    )
    assert spec and spec.loader
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def test_export_includes_candidate_changes_and_excludes_ignored_dependencies(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    (root / ".gitignore").write_text("node_modules/\n")
    (root / "tracked.py").write_text("old\n")
    (root / "deleted.py").write_text("gone\n")
    subprocess.run(["git", "-C", str(root), "add", "."], check=True)
    (root / "tracked.py").write_text("candidate\n")
    (root / "deleted.py").unlink()
    (root / "hook.mjs").write_text("new\n")
    (root / "node_modules").mkdir()
    (root / "node_modules/cache").write_text("not-source\n")
    destination = tmp_path / "export"
    report = module().export_source_tree(root, destination)
    assert (destination / "tracked.py").read_text() == "candidate\n"
    assert (destination / "hook.mjs").read_text() == "new\n"
    assert not (destination / "deleted.py").exists()
    assert not (destination / "node_modules").exists()
    assert report["files"] == 3
    assert len(report["source_sha256"]) == 64
    assert (root / "tracked.py").read_text() == "candidate\n"
    with pytest.raises(ValueError, match="outside"):
        module().export_source_tree(root, root / "nested-export")


def test_export_refuses_to_dereference_source_symlinks(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    outside = tmp_path / "private"
    outside.write_text("untouched\n")
    try:
        (root / "link").symlink_to(outside)
    except OSError as error:
        if getattr(error, "winerror", None) == 1314:
            pytest.skip("Native Windows user cannot create symlinks")
        raise
    with pytest.raises(ValueError, match="regular source"):
        module().export_source_tree(root, tmp_path / "export")
    assert outside.read_text() == "untouched\n"


def test_export_refuses_tracked_files_under_replaced_symlink_parent(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    subprocess.run(["git", "init", "-q", str(root)], check=True)
    directory = root / "tracked"
    directory.mkdir()
    (directory / "source.txt").write_text("original\n")
    subprocess.run(["git", "-C", str(root), "add", "."], check=True)
    (directory / "source.txt").unlink()
    directory.rmdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "source.txt").write_text("private\n")
    try:
        directory.symlink_to(outside, target_is_directory=True)
    except OSError as error:
        if getattr(error, "winerror", None) == 1314:
            pytest.skip("Native Windows user cannot create symlinks")
        raise
    with pytest.raises(ValueError, match="regular source"):
        module().export_source_tree(root, tmp_path / "export")
    assert (outside / "source.txt").read_text() == "private\n"


def test_entry_skills_do_not_replace_native_hook_trust_with_direct_setup():
    for relative in ("skills/forgewright/SKILL.md", "skills/forgewright/LITE.md"):
        text = (ROOT / relative).read_text(encoding="utf-8")
        assert "trusted native hook owns automatic mutation" in text
        assert "do not invoke setup yourself" in text
        assert "run `forge bootstrap ensure" not in text
        assert (
            "Explicit user-requested setup" in text
            or "explicit user-requested setup" in text
        )


def test_all_published_skill_entrypoints_have_native_required_metadata():
    entries = list((ROOT / "skills").glob("*/SKILL.md"))
    assert entries
    for path in entries:
        text = path.read_text(encoding="utf-8")
        assert text.startswith("---\n"), str(path)
        metadata = yaml.safe_load(text.split("---", 2)[1])
        assert isinstance(metadata, dict), str(path)
        assert isinstance(metadata.get("name"), str) and metadata["name"].strip(), str(
            path
        )
        assert (
            isinstance(metadata.get("description"), str)
            and metadata["description"].strip()
        ), str(path)
    assert not (ROOT / "skills/_test/SKILL.md").exists()
    assert (ROOT / "skills/_test/ORCHESTRATOR.md").is_file()
