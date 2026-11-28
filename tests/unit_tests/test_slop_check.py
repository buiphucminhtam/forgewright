from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _load_slop_check():
    path = ROOT / "scripts" / "ci" / "slop-check.py"
    spec = importlib.util.spec_from_file_location("slop_check", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_slop_check_rejects_corrupted_index_and_missing_skills(tmp_path: Path) -> None:
    sc = _load_slop_check()
    (tmp_path / "kernel").mkdir(parents=True)
    (tmp_path / "skills" / "alpha").mkdir(parents=True)
    (tmp_path / "skills" / "beta").mkdir(parents=True)
    (tmp_path / "skills" / "alpha" / "LITE.md").write_text("---\nname: alpha\n---\n")
    (tmp_path / "skills" / "beta" / "LITE.md").write_text("---\nname: beta\n---\n")
    (tmp_path / "kernel" / "INDEX.md").write_text(
        "# Skill Index\n| Skill Name | Triggers | Trigger File |\n|---|---|---|\n"
        "| **alpha** | > | [skills/alpha/LITE.md](../skills/alpha/LITE.md) |\n"
    )
    errors = sc.check_skill_index(tmp_path)
    assert any("corrupted trigger for alpha" in err for err in errors)
    assert any("missing skill beta" in err for err in errors)


def test_slop_check_rejects_duplicate_code_and_personal_paths(tmp_path: Path) -> None:
    sc = _load_slop_check()
    sample_user_dir = "/Users/" + "realperson/SecretRepo"
    body = "# padding\n" * 80 + f'HOME_DIR = "{sample_user_dir}"\n'
    (tmp_path / "a.py").write_text(body)
    (tmp_path / "b.py").write_text(body)
    tracked = ["a.py", "b.py"]
    dups = sc.check_duplicate_code_files(tmp_path, tracked)
    leaks = sc.check_personal_path_leaks(tmp_path, tracked)
    assert len(dups) == 1
    assert "a.py == b.py" in dups[0]
    assert len(leaks) == 2


def test_slop_check_rejects_boilerplate_lite_overlay(tmp_path: Path) -> None:
    sc = _load_slop_check()
    lite = tmp_path / "skills" / "demo" / "LITE.md"
    lite.parent.mkdir(parents=True)
    lite.write_text(
        "| Assumption | Check | Result | Script-produced evidence |\n"
        "|---|---|---|---|\n"
        "| X | ls | ... | run the check command and paste output |\n"
        "- n. ACTION | TARGET (docs/review-comments.md) | CHECK\n"
    )
    errors = sc.check_lite_overlays(tmp_path, ["skills/demo/LITE.md"])
    assert any("boilerplate" in err for err in errors)
    assert any("transient docs/" in err for err in errors)


def test_slop_check_detects_bare_except_and_god_function(tmp_path: Path) -> None:
    sc = _load_slop_check()
    lines = ["def giant():"] + [f"    x = {i}" for i in range(130)] + [
        "    try:",
        "        return x",
        "    except:",
        "        return 0",
    ]
    (tmp_path / "bad.py").write_text("\n".join(lines) + "\n")
    hard_errors, metrics = sc.check_python_hygiene(tmp_path, ["bad.py"])
    assert any("bare except" in err for err in hard_errors)
    assert metrics["god_function_count"] == 1
