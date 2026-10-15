"""Real runner/Git regression boundaries from the approved flow audit."""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def git(root, *args):
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    return subprocess.check_output(["git", *args], cwd=root, env=env, text=True)


def local_ci(root):
    path = root / "scripts/ci/local-ci.py"
    path.parent.mkdir(parents=True)
    shutil.copyfile(ROOT / "scripts/ci/local-ci.py", path)
    return load(path, "flow_regression_ci")


def test_formatter_refuses_mixed_staging_before_modifying_worktree(
    tmp_path, monkeypatch
):
    for key in list(os.environ):
        if key.startswith("GIT_"):
            monkeypatch.delenv(key)
    ci = local_ci(tmp_path)
    git(tmp_path, "init", "-q")
    path = tmp_path / "sample.py"
    path.write_text("staged_value=1\n")
    git(tmp_path, "add", "sample.py")
    path.write_text("staged_value=1\nunstaged_value=2\n")
    before = path.read_bytes()
    index = git(tmp_path, "show", ":sample.py")
    runner = ci.LocalCI(dry_run=False, keep_going=False, timeout=10, base_ref=None)
    with pytest.raises(ci.GateFailure, match="unstaged|partial|mixed"):
        runner._format_staged()
    assert path.read_bytes() == before
    assert git(tmp_path, "show", ":sample.py") == index
    # Fully staged files retain the normal formatting path.
    git(tmp_path, "add", "sample.py")
    runner._format_staged()
    assert git(tmp_path, "show", ":sample.py") == path.read_text()


def test_reports_in_same_second_keep_both_immutable_receipts(tmp_path, monkeypatch):
    ci = local_ci(tmp_path)

    class FixedTime:
        @staticmethod
        def now(tz):
            return datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)

    monkeypatch.setattr(ci, "datetime", FixedTime)
    runner = ci.LocalCI(dry_run=True, keep_going=False, timeout=10, base_ref=None)
    first = runner.write_report("precommit")
    before = first.read_bytes()
    second = runner.write_report("commitmsg")
    assert first != second
    assert first.read_bytes() == before
    assert json.loads(first.read_text())["mode"] == "precommit"
    assert json.loads(second.read_text())["mode"] == "commitmsg"


def test_formatter_uses_active_index_and_leaves_default_index_untouched(
    tmp_path, monkeypatch
):
    for key in list(os.environ):
        if key.startswith("GIT_"):
            monkeypatch.delenv(key)
    ci = local_ci(tmp_path)
    git(tmp_path, "init", "-q")
    path = tmp_path / "sample.py"
    path.write_text("value = 1\n")
    git(tmp_path, "add", "sample.py")
    alternate = tmp_path / "alternate-index"
    shutil.copyfile(tmp_path / ".git/index", alternate)
    path.write_text("value = 1\nextra = 2\n")
    git(tmp_path, "add", "sample.py")
    before = alternate.read_bytes()
    monkeypatch.setenv("GIT_INDEX_FILE", str(alternate))
    runner = ci.LocalCI(dry_run=False, keep_going=False, timeout=10, base_ref=None)
    with pytest.raises(ci.GateFailure, match="unstaged"):
        runner._format_staged()
    assert alternate.read_bytes() == before
    assert git(tmp_path, "show", ":sample.py") == path.read_text()


def test_formatter_preserves_leading_space_path_boundary(tmp_path, monkeypatch):
    for key in list(os.environ):
        if key.startswith("GIT_"):
            monkeypatch.delenv(key)
    ci = local_ci(tmp_path)
    git(tmp_path, "init", "-q")
    for name in (" a.py", " b.py"):
        (tmp_path / name).write_text("value = 1\n")
    git(tmp_path, "add", "--", " a.py", " b.py")
    path = tmp_path / " b.py"
    path.write_text("value = 1\nextra = 2\n")
    runner = ci.LocalCI(dry_run=False, keep_going=False, timeout=10, base_ref=None)
    with pytest.raises(ci.GateFailure, match="unstaged"):
        runner._format_staged()
    assert git(tmp_path, "show", ": b.py") == "value = 1\n"
    assert path.read_text() == "value = 1\nextra = 2\n"


def test_concurrent_reports_never_replace_an_earlier_receipt(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    ci = local_ci(tmp_path)

    def write(_):
        return ci.LocalCI(
            dry_run=True, keep_going=False, timeout=10, base_ref=None
        ).write_report("precommit")

    with ThreadPoolExecutor(max_workers=2) as pool:
        paths = list(pool.map(write, range(4)))
    assert len(set(paths)) == 4
    assert all(json.loads(path.read_text())["mode"] == "precommit" for path in paths)


def test_unformatted_ts_path_preserves_partial_staging(tmp_path, monkeypatch):
    for key in list(os.environ):
        if key.startswith("GIT_"):
            monkeypatch.delenv(key)
    ci = local_ci(tmp_path)
    git(tmp_path, "init", "-q")
    path = tmp_path / "unformatted.ts"
    path.write_text("const one = 1;\n")
    git(tmp_path, "add", "unformatted.ts")
    path.write_text("const one = 1;\nconst two = 2;\n")
    runner = ci.LocalCI(dry_run=False, keep_going=False, timeout=10, base_ref=None)
    runner._format_staged()
    assert git(tmp_path, "show", ":unformatted.ts") == "const one = 1;\n"


def test_preflight_existing_state_returns_valid_json(tmp_path):
    for name in (
        "AGENTS.md",
        "CLAUDE.md",
        "GEMINI.md",
        "scripts/ci/pipeline-preflight.sh",
        "skills/_shared/protocols/pipeline-activation.md",
    ):
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    (tmp_path / ".antigravity").mkdir()
    (tmp_path / ".antigravity/mcp-manifest.json").write_text(
        json.dumps(
            {
                "workspace": str(tmp_path),
                "servers": [{"type": "forgewright-mcp-server", "auto_start": True}],
            }
        )
    )
    state = tmp_path / ".forgewright/pipeline-state.json"
    state.parent.mkdir()
    state.write_text('{"status":"IDLE"}')
    ci = load(ROOT / "scripts/ci/local-ci.py", "flow_preflight_ci")
    result = subprocess.run(
        [ci._discover_bash(), "scripts/ci/pipeline-preflight.sh", "--json-only"],
        cwd=tmp_path,
        text=True,
        capture_output=True,
        timeout=20,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["ok"] is True


def quality_report(m, calls=2):
    helper = load(
        ROOT / "tests/unit_tests/test_skill_quality.py", "flow_quality_helpers"
    )
    scenarios = [m.validate_scenario(helper.scenario("one"))]
    rows = []
    for arm in ("baseline", "current", "candidate"):
        row = helper.result("one", arm)
        row["tool_calls"] = calls
        rows.append(m.validate_result(row))
    return m.build_report(scenarios, rows)


def test_zero_to_zero_is_not_measured_efficiency_improvement():
    m = load(ROOT / "scripts/runtime/skill_quality.py", "flow_quality_zero")
    assert quality_report(m, calls=0)["promotion"]["promotion_allowed"] is False


def test_promotion_preserves_target_changed_since_evaluation(tmp_path):
    m = load(ROOT / "scripts/runtime/skill_quality.py", "flow_quality_stale")
    report = quality_report(m)
    report["arms"]["candidate"]["context_bytes_avg"] = 700
    core = {k: report[k] for k in ("schema", "skills", "scenario_count", "arms")}
    report["digest"] = m.canonical_digest(core)
    report["promotion"] = m.assess_promotion(report)
    target = tmp_path / "skills/debugger/LITE.md"
    target.parent.mkdir(parents=True)
    target.write_text("evaluated A\n")
    candidate = tmp_path / "candidate.md"
    candidate.write_text("candidate B\n")
    bound = m.bind_skill_artifacts(
        report, current_skill=target, candidate_skill=candidate
    )
    target.write_text("newer C\n")
    with pytest.raises(m.SkillQualityError, match="current|target"):
        m.promote_candidate(
            root=tmp_path, report=bound, candidate=candidate, target=target
        )
    assert target.read_text() == "newer C\n"
