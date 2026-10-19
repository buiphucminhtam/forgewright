from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
from project_disk import report_project
from project_storage import disk_limits, StorageError


def test_counts_nested_build_and_all_project_files_without_adopting(tmp_path):
    root = tmp_path / "project"
    root.mkdir()
    build = root / "android/app/build/intermediates"
    build.mkdir(parents=True)
    (build / "generated.bin").write_bytes(b"x" * 4096)
    (root / "source.bin").write_bytes(b"y" * 8192)
    report = report_project(root, host_budget=tmp_path / "no-config")
    assert report["complete"] is True and report["total_bytes"] >= 12288
    assert report["total_mb"] > 0
    candidate = next(
        r for r in report["directories"] if r["path"] == "android/app/build"
    )
    assert (
        candidate["bytes"] == 4096 and candidate["ownership"] == "unmanaged-candidate"
    )
    assert (build / "generated.bin").exists()


def test_partial_census_is_unverified_never_zero_or_ok(tmp_path):
    for name in ("a", "b", "c"):
        (tmp_path / name).write_bytes(b"x")
    report = report_project(tmp_path, host_budget=tmp_path / "none", max_entries=1)
    assert report["complete"] is False and report["verdict"] == "UNVERIFIED"
    assert report["total_bytes"] is None and report["total_mb"] is None


def test_project_policy_can_tighten_but_cannot_raise_host_limits(tmp_path):
    host = tmp_path / "host-budget.yaml"
    host.write_text(
        "disk:\n  block_project_gb: 4\n  warn_project_gb: 2\n  min_free_gb: 1\n  artifact_ttl_days: 7\n"
    )
    root = tmp_path / "project"
    (root / ".forgewright").mkdir(parents=True)
    local = root / ".forgewright/budget.yaml"
    local.write_text("disk:\n  block_project_gb: 3\n  min_free_gb: 2\n")
    assert disk_limits(root, host)["project_bytes"] == 3 * 1024**3
    assert disk_limits(root, host)["min_free_bytes"] == 2 * 1024**3
    local.write_text("disk:\n  block_project_gb: 9\n")
    with pytest.raises(StorageError, match="project-policy-raises-host-limit"):
        disk_limits(root, host)


def test_malformed_budget_cannot_fall_back_to_large_default(tmp_path):
    host = tmp_path / "budget.yaml"
    host.write_text("disk: [broken")
    with pytest.raises(StorageError, match="invalid-disk-policy"):
        disk_limits(tmp_path, host)


def test_rlg_home_budget_is_used_and_malformed_policy_fails_closed(tmp_path, monkeypatch):
    home = tmp_path / "policy"
    home.mkdir()
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(home))
    budget = home / "budget.yaml"
    budget.write_text("disk:\n  block_project_gb: 4\n  min_free_gb: 3\n")
    assert disk_limits(tmp_path)["project_bytes"] == 4 * 1024**3
    assert disk_limits(tmp_path)["min_free_bytes"] == 3 * 1024**3
    explicit = tmp_path / "explicit.yaml"
    explicit.write_text("disk:\n  block_project_gb: 2\n")
    assert disk_limits(tmp_path, explicit)["project_bytes"] == 2 * 1024**3
    budget.write_text("disk: [broken")
    with pytest.raises(StorageError, match="invalid-disk-policy"):
        disk_limits(tmp_path)


@pytest.mark.parametrize("override", [None, ""])
def test_empty_rlg_home_uses_existing_default(tmp_path, monkeypatch, override):
    host = tmp_path / ".forgewright/runtime"
    host.mkdir(parents=True)
    (host / "budget.yaml").write_text("disk:\n  block_project_gb: 6\n")
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    if override is None:
        monkeypatch.delenv("FORGEWRIGHT_RLG_HOME", raising=False)
    else:
        monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", override)
    assert disk_limits(tmp_path)["project_bytes"] == 6 * 1024**3


def test_disk_cli_discovers_projects_from_rlg_home(tmp_path, monkeypatch, capsys):
    import json
    from project_disk import main

    home = tmp_path / "policy"
    home.mkdir()
    project = tmp_path / "project"
    project.mkdir()
    (home / "projects.index").write_text("fixture\t" + str(project) + "\n")
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(home))
    assert main(["--json"]) == 0
    result = json.loads(capsys.readouterr().out)
    assert len(result["projects"]) == 1
    assert result["projects"][0]["project"] == str(project)
    assert result["projects"][0]["complete"] is True


def test_finite_cli_preserves_operator_policy_without_moving_admission(tmp_path, monkeypatch):
    import os
    import host_jobs as entry
    from tests.unit_tests.test_resource_admission_hook import fixture

    home, project, profile, expected = fixture(tmp_path)
    policy = tmp_path / "policy"
    policy.mkdir()
    (policy / "budget.yaml").write_text("disk:\n  min_free_gb: 3\n")
    monkeypatch.setenv("FORGEWRIGHT_RLG_HOME", str(policy))
    monkeypatch.delenv("FORGEWRIGHT_ADMISSION_HOME", raising=False)
    monkeypatch.setenv("PYTHONPATH", "untrusted-loader")
    selected = []

    class Admission:
        def __init__(self, path):
            selected.append(path)

        def close(self):
            pass

    def run(admission, request, **kwargs):
        assert os.environ.get("FORGEWRIGHT_RLG_HOME") == str(policy)
        assert "PYTHONPATH" not in os.environ
        assert disk_limits(project)["min_free_bytes"] == 3 * 1024**3
        return {"state": "quiescent", "exit_code": 0}

    monkeypatch.setattr(entry, "HostAdmission", Admission)
    monkeypatch.setattr(entry, "load_profile", lambda *args: profile)
    monkeypatch.setattr(entry, "run_job", run)
    assert entry.main(["run", "--project", str(project), "--profile", profile["id"], "--digest", expected]) == 0
    assert selected == [Path.home() / ".forgewright/runtime/admission"]


def test_profile_cannot_override_operator_rlg_policy_location(tmp_path):
    from host_job_profiles import validate_profile, ProfileError
    from tests.unit_tests.test_resource_admission_hook import fixture

    _, _, profile, _ = fixture(tmp_path)
    profile["env"]["FORGEWRIGHT_RLG_HOME"] = str(tmp_path)
    with pytest.raises(ProfileError, match="invalid-profile-env"):
        validate_profile(profile)


def test_native_binding_covers_rlg_policy_resolver(monkeypatch):
    import resource_enrollment as enrollment

    original = Path.read_bytes
    expected = enrollment.code_binding()
    target = Path(enrollment.__file__).with_name("runtime_registry.py")

    def changed(path):
        raw = original(path)
        return raw + b"\n# resolver changed\n" if path == target else raw

    monkeypatch.setattr(Path, "read_bytes", changed)
    assert enrollment.code_binding() != expected
