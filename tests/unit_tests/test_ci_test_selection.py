"""Exercise actual precommit planning and Git admission, not a copied selector."""

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


def module():
    spec = importlib.util.spec_from_file_location(
        "ci_test_selection", ROOT / "scripts/ci/local-ci.py"
    )
    loaded = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = loaded
    spec.loader.exec_module(loaded)
    return loaded


def planner(loaded):
    runner = loaded.LocalCI(dry_run=True, keep_going=False, timeout=1, base_ref=None)
    runner._require_node_dependencies = lambda: None
    runner._require_python_dependencies = lambda *packages: None
    runner.review = lambda: None
    runner._format_staged = lambda: None
    runner._node_bin = lambda component, name: f"/{component}/{name}"
    runner._node_module_file = lambda component, relative: Path(
        f"/{component}/{relative}"
    )
    return runner


@pytest.mark.parametrize(
    ("paths", "selected", "release"),
    [
        (
            ["src/cli/src/coordinates/converter.ts"],
            {"cli-tests", "python-unit-tests"},
            False,
        ),
        (
            ["mcp/src/parsers/skill-parser.ts"],
            {"mcp-tests", "python-unit-tests"},
            False,
        ),
        (["tests/unit_tests/test_instinct_observer.py"], {"python-unit-tests"}, False),
        (["README.md"], {"mcp-tests", "cli-tests", "python-unit-tests"}, False),
        (
            ["src/cli/tests/docs-core.test.ts", "mcp/src/errors.test.ts"],
            {"mcp-tests", "cli-tests", "python-unit-tests"},
            False,
        ),
        (
            ["scripts/ci/local-ci.py"],
            {"mcp-tests", "cli-tests", "python-unit-tests"},
            True,
        ),
        (
            ["mcp/src/runtime/lifecycle-coordinator.ts"],
            {"mcp-tests", "cli-tests", "python-unit-tests"},
            True,
        ),
        (["package-lock.json"], {"mcp-tests", "cli-tests", "python-unit-tests"}, True),
        (
            ["unknown/component.bin"],
            {"mcp-tests", "cli-tests", "python-unit-tests"},
            True,
        ),
        ([], {"mcp-tests", "cli-tests", "python-unit-tests"}, True),
    ],
)
def test_real_precommit_selects_closure_and_preserves_mandatory_gates(
    paths, selected, release
):
    loaded = module()
    runner = planner(loaded)
    runner._staged_test_paths = lambda: paths
    runner.precommit()
    steps = {step.name: step.argv for step in runner.results}
    actual = {
        name
        for name in steps
        if name in {"mcp-tests", "cli-tests", "python-unit-tests"}
    }
    assert actual == selected
    assert {"wiki-drift", "cli-build", "mcp-typecheck", "docs-continuity"} <= set(steps)
    assert steps["docs-continuity"][-2:] == ["--staged", "--json"]
    python = steps["python-unit-tests"]
    assert ("--deselect" not in python) == release
    if not release:
        assert python[-2:] == [
            "--deselect",
            "tests/unit_tests/test_roadmap_completion.py::test_all_declared_roadmap_verifiers_replay_on_unchanged_tree",
        ]
    assert runner.test_selection["paths"] == paths
    assert runner.test_selection["release_replay"] == release


def test_git_selection_keeps_deleted_and_both_rename_paths(tmp_path, monkeypatch):
    loaded = module()
    monkeypatch.setattr(loaded, "ROOT", tmp_path)
    for key in loaded.TEST_GIT_ENV:
        monkeypatch.delenv(key, raising=False)

    def git(*args):
        return subprocess.check_output(["git", *args], cwd=tmp_path, text=True)

    git("init", "-q")
    git("config", "user.name", "Fixture")
    git("config", "user.email", "fixture@example.invalid")
    old = tmp_path / "scripts/ci/old selector.py"
    deleted = tmp_path / "mcp/src/deleted.ts"
    spaced = tmp_path / " README.md"
    for path in (old, deleted, spaced):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("fixture\n")
    git("add", ".")
    git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture")
    new = tmp_path / "src/cli/tests/new selector.test.ts"
    new.parent.mkdir(parents=True)
    old.rename(new)
    deleted.unlink()
    spaced.write_text("changed\n")
    git("add", "-A")
    runner = planner(loaded)
    runner.dry_run = False
    paths = runner._staged_test_paths()
    assert set(paths) == {
        " README.md",
        "scripts/ci/old selector.py",
        "src/cli/tests/new selector.test.ts",
        "mcp/src/deleted.ts",
    }
    runner.dry_run = True
    runner._staged_test_paths = lambda: paths
    runner.precommit()
    assert runner.test_selection["release_replay"] is True


def test_selected_test_failure_still_blocks_gate(tmp_path):
    loaded = module()
    runner = planner(loaded)
    runner._staged_test_paths = lambda: ["src/cli/tests/docs-core.test.ts"]
    real_run = runner.run
    observed = []

    def failing(name, argv, **kwargs):
        observed.append(name)
        if name == "cli-tests":
            runner.dry_run = False
            return real_run(
                name, [sys.executable, "-c", "raise SystemExit(23)"], cwd=tmp_path
            )
        return real_run(name, argv, **kwargs)

    runner.run = failing
    with pytest.raises(loaded.GateFailure, match="cli-tests failed with exit code 23"):
        runner.precommit()
    assert runner.failed
    assert "python-unit-tests" not in observed
    assert runner.results[-1].exit_code == 23


def test_default_pytest_still_collects_full_replay():
    # Full-command wiring is already covered by test_ci_workflow/test_local_ci.
    # This proves the scoped deselection did not change default discovery.
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "--collect-only",
            "-q",
            "tests/unit_tests/test_roadmap_completion.py",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert (
        "test_all_declared_roadmap_verifiers_replay_on_unchanged_tree" in result.stdout
    )
