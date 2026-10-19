import hashlib
from pathlib import Path
import sys
import shlex
import subprocess

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
from host_job_profiles import install_profile, load_profile, ProfileError

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/hooks"))
from resource_admission import decide


def fixture(tmp_path):
    project = tmp_path / "project"
    project.mkdir()
    source = project / "build.py"
    source.write_text('print("finite")\n')
    value = dict(
        schema="forgewright-finite-profile/v2",
        id="build-v1",
        project=str(project),
        cwd=".",
        argv=[sys.executable, str(source)],
        command="python build.py",
        memory_mib=128,
        scratch_bytes=0,
        disk_floor_bytes=0,
        timeout=30,
        sources={"build.py": hashlib.sha256(source.read_bytes()).hexdigest()},
        env={},
        artifact_policy={
            "schema": "forgewright-artifact-policy/v1",
            "scratch_limit_bytes": 4096,
            "output_limit_bytes": 4096,
            "retained_limit_bytes": 8192,
            "retain_generations": 2,
            "ttl_seconds": 86400,
            "project_limit_bytes": 16 * 1024**2,
        },
        disk_paths=[{"path": str(project), "device": project.stat().st_dev}],
    )
    home = tmp_path / "authority"
    home.mkdir(mode=0o700)
    digest = install_profile(home, value)
    return home, project, value, digest


def test_exact_request_rewritten_without_eval_and_no_wrapper_exemption(tmp_path):
    home, p, _, digest = fixture(tmp_path)
    payload = dict(
        tool_name="Bash",
        cwd=str(p),
        tool_input={"command": "python build.py"},
        session_id="fixture",
    )
    decision = decide(
        payload, home, {str(p): {"mode": "enforce", "profiles": {"build-v1": digest}}}
    )
    assert decision["permissionDecision"] == "allow"
    rewritten = decision["updatedInput"]["command"]
    assert "host_jobs.py" in rewritten and "--digest" in rewritten
    # Exercise the generated Python isolated-mode entry, not just its spelling.
    parts = shlex.split(rewritten)
    result = subprocess.run(
        parts[:7] + ["--help"], capture_output=True, text=True, timeout=5
    )
    assert result.returncode == 0, result.stderr
    assert "install-profile" in result.stdout
    for command in [
        "python build.py; touch /tmp/no",
        rewritten + "; evil",
        "host_jobs.py --fake",
        "$(python build.py)",
    ]:
        payload["tool_input"]["command"] = command
        assert (
            decide(
                payload,
                home,
                {str(p): {"mode": "enforce", "profiles": {"build-v1": digest}}},
            )["permissionDecision"]
            == "deny"
        )


def test_unenrolled_is_advisory_and_probe_does_not_claim_enforcement(tmp_path):
    home, p, _, digest = fixture(tmp_path)
    payload = dict(
        tool_name="Bash", cwd=str(p), tool_input={"command": "python build.py"}
    )
    assert "permissionDecision" not in decide(payload, home, {})
    value = decide(
        payload, home, {str(p): {"mode": "probe", "profiles": {"build-v1": digest}}}
    )
    assert "permissionDecision" not in value
    assert "probe" in value["additionalContext"]


def test_source_drift_digest_mismatch_or_symlink_refuses(tmp_path):
    home, p, _, digest = fixture(tmp_path)
    assert load_profile(home, p, "build-v1", digest)["id"] == "build-v1"
    with pytest.raises(ProfileError):
        load_profile(home, p, "build-v1", "0" * 64)
    (p / "build.py").write_text("import os;os.fork()")
    with pytest.raises(ProfileError, match="source-drift"):
        load_profile(home, p, "build-v1", digest)
    (p / "build.py").unlink()
    (p / "build.py").symlink_to("/etc/hosts")
    with pytest.raises(ProfileError):
        load_profile(home, p, "build-v1", digest)


def test_cwd_worktree_and_profile_id_cannot_escape_scope(tmp_path):
    home, p, value, digest = fixture(tmp_path)
    with pytest.raises(ProfileError):
        load_profile(home, p, "../build-v1", digest)
    other = tmp_path / "other"
    other.mkdir()
    with pytest.raises(ProfileError):
        load_profile(home, other, "build-v1", digest)
    value["cwd"] = ".."
    with pytest.raises(ProfileError):
        install_profile(home, value)


def test_control_plane_status_is_rewritten_to_bounded_read_without_job_lease(tmp_path):
    home, p, _, digest = fixture(tmp_path)
    payload = dict(
        tool_name="Bash", cwd=str(p), tool_input={"command": "forge delegate resources"}
    )
    output = decide(
        payload, home, {str(p): {"mode": "enforce", "profiles": {"build-v1": digest}}}
    )
    assert output["permissionDecision"] == "allow"
    parts = shlex.split(output["updatedInput"]["command"])
    assert parts[-1] == "status" and "run" not in parts


@pytest.mark.parametrize("drift", ["profile", "config", "registry", "live-job"])
def test_native_operator_disable_survives_drift_and_preserves_live_jobs(
    tmp_path, drift
):
    import json
    import os
    import resource_enrollment as enrollment
    from host_admission import HostAdmission, MemorySnapshot

    home, project, profile, expected = fixture(tmp_path)
    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    enrollment.stage(home, project, config, {profile["id"]: expected}, "control")
    admission = HostAdmission(
        home,
        sensor=lambda: MemorySnapshot(
            16 * 1024**3, 10 * 1024**3, "normal", "synthetic"
        ),
    )
    if drift == "profile":
        (project / "build.py").write_text("raise SystemExit(9)\n")
    elif drift == "config":
        config.write_text(config.read_text() + '\n[extra]\nkeep="user"\n')
    elif drift == "registry":
        (home / "enrollments.json").write_text("{broken")
    else:
        admission.enqueue(
            job_id="live",
            token="x" * 64,
            project_root=str(project),
            run_id="live",
            owner_pid=os.getpid(),
            memory_mib=64,
        )
    before = config.read_bytes()
    hook = Path(__file__).resolve().parents[2] / "scripts/hooks/resource_admission.py"
    payload = {
        "tool_name": "Bash",
        "cwd": str(project),
        "tool_input": {"command": "forge delegate resources --disable"},
    }
    try:
        result = subprocess.run(
            [sys.executable, str(hook), "--home", str(home)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=5,
        )
        decision = json.loads(result.stdout)["hookSpecificOutput"]
        assert decision["permissionDecision"] == "allow"
        command = shlex.split(decision["updatedInput"]["command"])
        result = subprocess.run(
            command, cwd=project, capture_output=True, text=True, timeout=5
        )
        assert result.returncode == 0, result.stderr
        receipt = json.loads(result.stdout)
        assert receipt["status"] == "operator-disabled"
        assert enrollment.operator_disabled(home, str(project))
        if drift in {"registry", "live-job"}:
            assert receipt["config_removal"] == "pending-reconciliation"
            assert config.read_bytes() == before
        else:
            assert receipt["config_removal"] == "removed-preserving-edits"
            assert enrollment.BEGIN not in config.read_text()
        if drift == "config":
            assert 'keep="user"' in config.read_text()
        if drift == "live-job":
            assert admission.describe("live")["state"] == "active"
    finally:
        if drift == "live-job":
            admission.release("live", "x" * 64, os.getpid())
        admission.close()


def test_profile_without_artifact_policy_or_changed_volume_is_rejected(tmp_path):
    home, p, value, _ = fixture(tmp_path)
    value["id"] = "missing-storage-v1"
    value.pop("artifact_policy")
    with pytest.raises(ProfileError):
        install_profile(home, value)


def test_legacy_profile_contract_cannot_silently_skip_disk_lifecycle(tmp_path):
    home, p, value, _ = fixture(tmp_path)
    value["schema"] = "forgewright-finite-profile/v1"
    value["id"] = "legacy-v1"
    with pytest.raises(ProfileError):
        install_profile(home, value)


def test_source_modified_during_admission_wait_cannot_execute(tmp_path, monkeypatch):
    from host_admission import HostAdmission, MemorySnapshot
    from host_job_profiles import validate_profile
    from host_job_runner import run_job, JobError

    home, p, value, _ = fixture(tmp_path)
    a = HostAdmission(
        home,
        sensor=lambda: MemorySnapshot(
            16 * 1024**3, 10 * 1024**3, "normal", "synthetic"
        ),
    )
    original = a.enqueue
    marker = p / "unexpected"

    def enqueue(**kw):
        row = original(**kw)
        if kw.get("kind") == "heavy":
            (p / "build.py").write_text(
                f'from pathlib import Path;Path({str(marker)!r}).write_text("bad")'
            )
        return row

    monkeypatch.setattr(a, "enqueue", enqueue)
    try:
        with pytest.raises(JobError, match="profile-drift"):
            run_job(a, validate_profile(value))
        assert not marker.exists()
    finally:
        a.close()


def test_operator_disable_is_exact_control_plane_and_never_counts_as_job(tmp_path):
    home, project, _, digest = fixture(tmp_path)
    enrollment = {str(project): {"mode": "enforce", "profiles": {"build-v1": digest}}}
    payload = {
        "tool_name": "Bash",
        "cwd": str(project),
        "tool_input": {"command": "forge delegate resources --disable"},
    }
    decision = decide(payload, home, enrollment)
    assert decision["permissionDecision"] == "allow"
    argv = shlex.split(decision["updatedInput"]["command"])
    assert argv[-3:] == ["disable", "--project", str(project)]
    payload["tool_input"]["command"] += "; touch /tmp/forbidden"
    assert decide(payload, home, enrollment)["permissionDecision"] == "deny"


def test_unavailable_canary_remains_advisory_but_enforcement_fails_closed(tmp_path):
    import json
    import resource_enrollment as enrollment
    import resource_admission as hook
    from contextlib import redirect_stdout
    from io import StringIO, BytesIO, TextIOWrapper
    from unittest.mock import patch

    home, project, profile, digest = fixture(tmp_path)
    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    enrollment.stage(home, project, config, {profile["id"]: digest}, "fixture")
    config.write_text(config.read_text() + "\n# unreviewed edit\n")
    payload = {
        "tool_name": "Bash",
        "cwd": str(project),
        "tool_input": {"command": "git status --short"},
    }

    def run():
        out = StringIO()
        with (
            patch("sys.stdin", TextIOWrapper(BytesIO(json.dumps(payload).encode()))),
            redirect_stdout(out),
        ):
            hook.main(["--home", str(home)])
        return json.loads(out.getvalue())["hookSpecificOutput"]

    assert "permissionDecision" not in run()
    values = enrollment.registry(home)
    values[str(project)]["mode"] = "enforce"
    enrollment.save(home, values)
    assert run()["permissionDecision"] == "deny"


def test_owner_disable_works_when_registry_is_unreadable(tmp_path):
    import json
    import resource_admission as hook
    from contextlib import redirect_stdout
    from io import StringIO, BytesIO, TextIOWrapper
    from unittest.mock import patch

    home, project, _, _ = fixture(tmp_path)
    (home / "enrollments.json").write_text("{broken")
    (home / "enrollments.json").chmod(0o600)
    (home / "operator-disable.json").write_text(
        json.dumps(
            {
                "schema": "forgewright-resource-operator-disable/v1",
                "projects": [str(project)],
            }
        )
    )
    payload = {
        "tool_name": "Bash",
        "cwd": str(project),
        "tool_input": {"command": "git status"},
    }
    out = StringIO()
    with (
        patch("sys.stdin", TextIOWrapper(BytesIO(json.dumps(payload).encode()))),
        redirect_stdout(out),
    ):
        hook.main(["--home", str(home)])
    result = json.loads(out.getvalue())["hookSpecificOutput"]
    assert (
        "permissionDecision" not in result
        and "disabled by operator" in result["additionalContext"]
    )
