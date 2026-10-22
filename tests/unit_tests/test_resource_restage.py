"""Shared owner-preference recovery must not adopt arbitrary drift or proof."""

import json
import runpy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
import resource_enrollment as enrollment
from host_job_profiles import digest, install_profile, validate_profile


def fixture(tmp_path):
    helper = runpy.run_path(
        str(Path(__file__).with_name("test_resource_admission_hook.py"))
    )["fixture"]
    home, project, profile, expected = helper(tmp_path)
    config = tmp_path / "config.toml"
    config.write_text(
        'model="before"\nmodel_reasoning_effort="high"\nservice_tier="priority"\n[features]\nhooks=true\n'
    )
    projects = [project, tmp_path / "second"]
    projects[1].mkdir()
    members = {}
    for index, current in enumerate(projects):
        if index:
            (current / "build.py").write_bytes((project / "build.py").read_bytes())
        old_profile = dict(
            profile,
            project=str(current),
            argv=[sys.executable, str(current / "build.py")],
        )
        old_digest = install_profile(home, old_profile)
        enrollment.stage(
            home, current, config, {old_profile["id"]: old_digest}, "old-nonce"
        )
        fresh = dict(old_profile, id="fresh-canary-v2")
        fresh_digest = validate_profile(fresh).profile_digest
        recipe = current / ".forgewright/recipes/fresh-canary.json"
        recipe.parent.mkdir(parents=True, mode=0o700)
        recipe.write_text(json.dumps(fresh))
        recipe.chmod(0o600)
        members[str(current)] = {
            "nonce": "fresh-nonce",
            "profiles": {fresh["id"]: fresh_digest},
            "canary_profile": fresh["id"],
            "retired_profiles": {old_profile["id"]: old_digest},
            "recipe": ".forgewright/recipes/fresh-canary.json",
            "recipe_sha256": digest(recipe.read_bytes()),
        }
    config.write_text(
        config.read_text()
        .replace('model="before"', 'model="after"')
        .replace('model_reasoning_effort="high"', 'model_reasoning_effort="xhigh"')
        .replace('service_tier="priority"\n', "")
    )
    raw = (home / "enrollments.json").read_bytes()
    manifest = {
        "schema": "forgewright-shared-restage/v1",
        "registry_sha256": digest(raw),
        "config_sha256": digest(config.read_bytes()),
        "prior_code_sha256": enrollment.code_binding(),
        "code_sha256": enrollment.code_binding(),
        "members": members,
    }
    path = home / "restage.json"
    write_manifest(path, manifest)
    return home, project, config, path, manifest


def write_manifest(path, value):
    path.write_text(json.dumps(value))
    path.chmod(0o600)


def restage(home, project, config, path):
    assert hasattr(enrollment, "restage_shared"), (
        "missing explicit shared restage; do not bless hashes manually"
    )
    return enrollment.restage_shared(
        home, project, config, path, digest(path.read_bytes())
    )


def test_shared_restage_preserves_config_resets_proof_and_requires_new_native_events(
    tmp_path,
):
    home, project, config, path, manifest = fixture(tmp_path)
    before = config.read_bytes()
    result = restage(home, project, config, path)
    assert set(result["members"]) == set(manifest["members"])
    assert config.read_bytes() == before
    for key, value in enrollment.registry(home).items():
        assert value["phase"] == value["mode"] == "canary"
        assert value["events"] == [] and value["enforcement_verified"] is False
        enrollment.validate_binding(value)
        with pytest.raises(enrollment.EnrollmentError, match="native-proof"):
            enrollment.activate(home, Path(key), config)
    values = enrollment.registry(home)
    values[str(project)]["events"] = [{"action": "observed-after-restage"}]
    enrollment.save(home, values)
    assert restage(home, project, config, path)["status"] == "already-restaged"
    assert enrollment.registry(home)[str(project)]["events"] == [
        {"action": "observed-after-restage"}
    ]


@pytest.mark.parametrize(
    "change",
    [
        "config",
        "code",
        "members",
        "candidate",
        "predecessor",
        "hook",
        "unrelated",
        "old_nonce",
        "old_profile",
        "registry",
        "retirement",
        "recipe",
    ],
)
def test_shared_restage_rejects_unreviewed_state_without_partial_commit(
    tmp_path, change
):
    home, project, config, path, manifest = fixture(tmp_path)
    values = enrollment.registry(home)
    current = values[str(project)]
    if change == "config":
        config.write_text(config.read_text() + "# changed after review\n")
    elif change == "code":
        manifest["code_sha256"] = "0" * 64
    elif change == "members":
        manifest["members"].pop(str(project))
    elif change == "candidate":
        Path(current["candidate_config"]).write_text("broken")
    elif change == "predecessor":
        Path(current["publication"]["preserved_path"]).write_text("broken")
    elif change in {"hook", "unrelated"}:
        text = config.read_text()
        text = (
            text.replace("timeout = 3", "timeout = 4")
            if change == "hook"
            else text + "\n[unrelated]\nallow=true\n"
        )
        config.write_text(text)
        manifest["config_sha256"] = digest(config.read_bytes())
    elif change == "old_nonce":
        manifest["members"][str(project)]["nonce"] = current["nonce"]
    elif change == "old_profile":
        manifest["members"][str(project)].update(
            profiles=current["profiles"], canary_profile=current["canary_profile"]
        )
    elif change == "retirement":
        manifest["members"][str(project)]["retired_profiles"] = {}
    elif change == "recipe":
        manifest["members"][str(project)]["recipe_sha256"] = "0" * 64
    else:
        enrollment.save(home, dict(values, unrelated={"phase": "probe"}))
    write_manifest(path, manifest)
    before = (home / "enrollments.json").read_bytes()
    config_before = config.read_bytes()
    with pytest.raises(enrollment.EnrollmentError):
        restage(home, project, config, path)
    assert (home / "enrollments.json").read_bytes() == before
    assert config.read_bytes() == config_before


@pytest.mark.parametrize(
    "boundary",
    [
        "manifest.json",
        "registry-before.json",
        "config-before.toml",
        "before-save",
        "after-save",
    ],
)
def test_shared_restage_recovers_each_durable_boundary_without_reset(
    tmp_path, monkeypatch, boundary
):
    home, project, config, path, manifest = fixture(tmp_path)
    previous = (home / "enrollments.json").read_bytes()
    original_atomic, original_save = enrollment.atomic_private, enrollment.save

    def atomic(target, raw, **kw):
        if target.parent.parent.name == "restages" and target.name == boundary:
            raise OSError("injected archive failure")
        return original_atomic(target, raw, **kw)

    def save(target, values):
        if boundary == "before-save":
            raise OSError("injected before publication")
        original_save(target, values)
        if boundary == "after-save":
            raise OSError("injected after publication")

    monkeypatch.setattr(enrollment, "atomic_private", atomic)
    monkeypatch.setattr(enrollment, "save", save)
    with pytest.raises(OSError):
        restage(home, project, config, path)
    if boundary != "after-save":
        assert (home / "enrollments.json").read_bytes() == previous
    monkeypatch.setattr(enrollment, "atomic_private", original_atomic)
    monkeypatch.setattr(enrollment, "save", original_save)
    result = restage(home, project, config, path)
    assert result["status"] == (
        "already-restaged" if boundary == "after-save" else "restaged-canary-only"
    )


def test_shared_restage_preserves_concurrent_config_editor_and_fails_binding(
    tmp_path, monkeypatch
):
    home, project, config, path, manifest = fixture(tmp_path)
    original = enrollment.save

    def save(target, values):
        config.write_text(config.read_text() + "# concurrent owner edit\n")
        original(target, values)

    monkeypatch.setattr(enrollment, "save", save)
    restage(home, project, config, path)
    assert config.read_text().endswith("# concurrent owner edit\n")
    with pytest.raises(enrollment.EnrollmentError, match="config-drift"):
        enrollment.validate_binding(enrollment.registry(home)[str(project)])


@pytest.mark.parametrize("conflict", [False, True])
def test_partial_profile_installation_replays_or_preserves_conflict(
    tmp_path, monkeypatch, conflict
):
    import host_job_profiles

    home, project, config, path, manifest = fixture(tmp_path)
    before = (home / "enrollments.json").read_bytes()
    original = host_job_profiles.install_profile
    installed = []

    def interrupted(authority, profile):
        original(authority, profile)
        installed.append(
            host_job_profiles.profile_path(
                authority, Path(profile["project"]), profile["id"]
            )
        )
        raise OSError("injected interruption after first immutable installation")

    monkeypatch.setattr(host_job_profiles, "install_profile", interrupted)
    with pytest.raises(OSError):
        restage(home, project, config, path)
    assert len(installed) == 1
    assert (home / "enrollments.json").read_bytes() == before
    monkeypatch.setattr(host_job_profiles, "install_profile", original)
    if conflict:
        installed[0].write_bytes(b"conflicting private revision\n")
        with pytest.raises(
            host_job_profiles.ProfileError, match="profile-exists-use-new-version"
        ):
            restage(home, project, config, path)
        assert installed[0].read_bytes() == b"conflicting private revision\n"
        assert (home / "enrollments.json").read_bytes() == before
    else:
        assert restage(home, project, config, path)["status"] == "restaged-canary-only"


@pytest.mark.parametrize("database", [False, True])
def test_claim_lock_and_claimed_request_fence_shared_restage(
    tmp_path, monkeypatch, database
):
    import threading
    import native_job_requests as requests
    from host_admission import HostAdmission
    from host_job_profiles import load_profile

    home, project, config, path, manifest = fixture(tmp_path)
    current = config.read_bytes()
    old = enrollment.registry(home)[str(project)]
    config.write_bytes(Path(old["candidate_config"]).read_bytes())
    name = old["canary_profile"]
    sha = old["profiles"][name]
    profile = load_profile(home, project, name, sha)
    payload = {
        "session_id": "s",
        "turn_id": "t",
        "tool_use_id": "u",
        "tool_input": {"command": profile["command"]},
    }
    context = requests.issue(home, project, payload, profile, sha, old)
    entered, released = threading.Event(), threading.Event()
    original = enrollment.validate_binding
    errors = []

    def paused(value, *args):
        original(value, *args)
        entered.set()
        assert released.wait(3), "test claim barrier timed out"

    def claim():
        try:
            requests.claim(
                home,
                context["request_id"],
                project=project,
                profile=name,
                profile_digest=sha,
                job_id="job-" + "1" * 32,
                owner_pid=123,
                owner_identity="fixture",
            )
        except BaseException as error:
            errors.append(error)

    monkeypatch.setattr(enrollment, "validate_binding", paused)
    thread = threading.Thread(target=claim)
    thread.start()
    try:
        assert entered.wait(3)
        # Binding was checked, but claim has not yet durably transitioned.
        config.write_bytes(current)
        with pytest.raises(enrollment.EnrollmentError, match="enrollment-busy"):
            restage(home, project, config, path)
    finally:
        released.set()
        thread.join(3)
    assert not thread.is_alive() and not errors
    monkeypatch.setattr(enrollment, "validate_binding", original)
    # A claimed request paused before its first runner journal must also fence.
    if database:
        admission = HostAdmission(home)
        admission.close()
    before = (home / "enrollments.json").read_bytes()
    with pytest.raises(
        enrollment.EnrollmentError, match="native-request-state-unconfirmed"
    ):
        restage(home, project, config, path)
    assert enrollment.registry(home)[str(project)]["nonce"] == "old-nonce"
    assert (home / "enrollments.json").read_bytes() == before


def test_recovery_canary_denies_uncovered_shell_and_keeps_exact_controls(tmp_path):
    home, project, config, path, manifest = fixture(tmp_path)
    restage(home, project, config, path)
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/hooks"))
    from resource_admission import decide, control_decision

    payload = {
        "tool_name": "Bash",
        "cwd": str(project),
        "tool_input": {"command": "unapproved"},
    }
    assert (
        decide(payload, home, enrollment.registry(home))["permissionDecision"] == "deny"
    )
    for command in [
        "forge delegate resources --activate",
        "forge delegate resources --restage-shared private.json --sha256 " + "1" * 64,
    ]:
        payload["tool_input"]["command"] = command
        assert control_decision(payload, home)["permissionDecision"] == "allow"
        payload["tool_input"]["command"] = command + "; unapproved"
        assert control_decision(payload, home) is None


@pytest.mark.parametrize(
    "change",
    [
        "missing_flag",
        "false_flag",
        "invalid_phase",
        "invalid_mode",
        "nonce",
        "profile",
        "canary",
        "binding_exception",
    ],
)
def test_hook_entry_fails_closed_for_corrupt_recovery_provenance(tmp_path, change):
    import subprocess

    home, project, config, path, manifest = fixture(tmp_path)
    restage(home, project, config, path)
    values = enrollment.registry(home)
    value = values[str(project)]
    if change == "missing_flag":
        value.pop("recovery_canary")
    elif change == "false_flag":
        value["recovery_canary"] = False
    elif change == "invalid_phase":
        value["phase"] = "probe"
    elif change == "invalid_mode":
        value["mode"] = "probe"
    elif change == "nonce":
        value["nonce"] = "different-nonce"
    elif change == "profile":
        value["profiles"] = {}
    elif change == "canary":
        value["canary_profile"] = "different-canary"
    else:
        config.write_text(config.read_text() + "# unrelated concurrent edit\n")
    enrollment.save(home, values)
    hook = Path(__file__).resolve().parents[2] / "scripts/hooks/resource_admission.py"
    bootstrap = 'import runpy,sys;sys.path[:0]=sys.argv[1:3];sys.argv=sys.argv[3:];runpy.run_path(sys.argv[0],run_name="__main__")'
    result = subprocess.run(
        [
            sys.executable,
            "-I",
            "-S",
            "-B",
            "-c",
            bootstrap,
            str(hook.parent),
            str(hook.parent.parent / "runtime"),
            str(hook),
            "--home",
            str(home),
        ],
        input=json.dumps(
            {
                "tool_name": "Bash",
                "cwd": str(project),
                "tool_input": {"command": "unapproved"},
            }
        ),
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == 0, result.stderr
    assert (
        json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"] == "deny"
    )


def test_legacy_rollback_cannot_revert_owner_preferences_after_restage(tmp_path):
    home, project, config, path, manifest = fixture(tmp_path)
    restage(home, project, config, path)
    before, registry = config.read_bytes(), (home / "enrollments.json").read_bytes()
    with pytest.raises(
        enrollment.EnrollmentError, match="restage-requires-preserving-recovery"
    ):
        enrollment.rollback(home, project, config)
    assert config.read_bytes() == before
    assert (home / "enrollments.json").read_bytes() == registry


def test_reconcile_quarantined_plan_and_failed_safe_closure_fence(
    tmp_path, monkeypatch
):
    from host_admission import HostAdmission, MemorySnapshot
    import resource_controls

    tmp_path = tmp_path.resolve()
    home = tmp_path / "admission"
    home.mkdir(mode=0o700)
    (home / "jobs").mkdir(parents=True, mode=0o700)
    (home / "native-requests").mkdir(parents=True, mode=0o700)
    project = (tmp_path / "project").resolve()
    (project / ".forgewright/runtime/recovery").mkdir(parents=True, mode=0o700)
    job_id = "job-" + "1" * 32
    storage_dir = project / ".forgewright/runtime/build-jobs" / job_id
    storage_dir.mkdir(parents=True, mode=0o700)
    build_src = project / "build.py"
    build_src.write_text('print("ok")\n', encoding="utf-8")
    prof_val = {
        "schema": "forgewright-finite-profile/v2",
        "id": "p1",
        "project": str(project),
        "cwd": ".",
        "argv": [sys.executable, str(build_src)],
        "command": "python build.py",
        "memory_mib": 128,
        "scratch_bytes": 0,
        "disk_floor_bytes": 0,
        "timeout": 30,
        "sources": {"build.py": enrollment.digest(build_src.read_bytes())},
        "env": {},
        "artifact_policy": {
            "schema": "forgewright-artifact-policy/v1",
            "scratch_limit_bytes": 4096,
            "output_limit_bytes": 4096,
            "retained_limit_bytes": 8192,
            "retain_generations": 2,
            "ttl_seconds": 86400,
            "project_limit_bytes": 16 * 1024**2,
        },
        "disk_paths": [{"path": str(project), "device": project.stat().st_dev}],
    }
    prof_digest = install_profile(home, prof_val)
    cfg_path = tmp_path / "config.toml"
    cfg_path.write_text('[features]\nhooks = true\n', encoding="utf-8")
    staged = enrollment.stage(home, project, cfg_path, {"p1": prof_digest}, "n1", canary_profile="p1")
    cfg_raw = cfg_path.read_bytes()

    owner_alive = True
    normal_mem = MemorySnapshot(16 * 1024**3, 6 * 1024**3, "normal", "test-fixture")
    tok_w = "tok-worker-" + "w" * 40
    tok_h = "tok-heavy-" + "h" * 40
    adm = HostAdmission(
        home,
        sensor=lambda: normal_mem,
        inspector=lambda pid: "owner-id-4444" if (pid == 4444 and owner_alive) else None,
        now=lambda: 1000.0,
    )
    adm.enqueue(
        job_id=f"{job_id}-worker",
        token=tok_w,
        project_root=project,
        run_id=job_id,
        owner_pid=4444,
        kind="worker",
        memory_mib=64,
    )
    adm.enqueue(
        job_id=f"{job_id}-heavy",
        token=tok_h,
        project_root=project,
        run_id=job_id,
        owner_pid=4444,
        kind="heavy",
        memory_mib=1536,
        parent_lease_id=f"{job_id}-worker",
    )
    adm.release(f"{job_id}-heavy", tok_h, 4444, quiescent=False)
    adm.release(f"{job_id}-worker", tok_w, 4444, quiescent=False)
    adm.close()

    req_id = "2" * 32
    context = {
        "schema": "forgewright-native-job-request/v1",
        "request_id": req_id,
        "native": {"session_id": "s1", "turn_id": "t1", "tool_use_id": "u1"},
        "physical_workspace": str(project),
        "profile": "p1",
        "profile_digest": prof_digest,
        "command_sha256": enrollment.digest(prof_val["command"].encode()),
        "nonce": "n1",
        "code_sha256": staged["code_sha256"],
        "config_sha256": staged["config_sha256"],
        "issued_at": staged["staged_at"],
        "job_id": job_id,
        "owner_pid": 4444,
        "owner_identity": "owner-id-4444",
    }
    req_path = home / "native-requests" / f"{req_id}.json"
    req_raw = (json.dumps({"state": "claimed", "context": context}, sort_keys=True) + "\n").encode()
    req_path.write_bytes(req_raw)
    req_path.chmod(0o600)

    journal = {
        "schema": "forgewright-host-job/v1",
        "job_id": job_id,
        "physical_workspace": str(project),
        "profile": "p1",
        "profile_digest": prof_digest,
        "requested_at": staged["staged_at"] + 1.0,
        "state": "quarantined",
        "exit_code": -15,
        "owner_pid": 4444,
        "owner_identity": "owner-id-4444",
        "child": {"pid": 5555, "identity": "child-id-5555"},
        "native_context": context,
        "storage": {"path": str(storage_dir), "state": "quarantined", "quiescent": False},
        "leases": [
            {"id": f"{job_id}-worker", "kind": "worker", "state": "quarantined", "token": tok_w},
            {"id": f"{job_id}-heavy", "kind": "heavy", "state": "quarantined", "token": tok_h},
        ],
    }
    journal_path = home / "jobs" / f"{job_id}.json"
    journal_raw = (json.dumps(journal, sort_keys=True) + "\n").encode()
    journal_path.write_bytes(journal_raw)
    journal_path.chmod(0o600)

    drain_obj = {
        "schema": "forgewright-operator-escape-drain-evidence/v1",
        "job_id": job_id,
        "journal_sha256": enrollment.digest(journal_raw),
        "decision": "drained_verified_by_operator_and_reviewer",
        "reviewer_sha256": "9" * 64,
    }
    drain_path = project / ".forgewright/runtime/recovery/drain.json"
    drain_raw = (json.dumps(drain_obj, sort_keys=True) + "\n").encode()
    drain_path.write_bytes(drain_raw)
    drain_path.chmod(0o600)
    drain_sha = enrollment.digest(drain_raw)
    storage_st = storage_dir.lstat()

    plan_obj = {
        "schema": "forgewright-quarantine-reconcile-plan/v3",
        "project": str(project),
        "job_id": job_id,
        "journal_path": str(journal_path),
        "journal_sha256": enrollment.digest(journal_raw),
        "native_request_id": req_id,
        "native_request_path": str(req_path),
        "native_request_sha256": enrollment.digest(req_raw),
        "live_code_sha256": enrollment.code_binding(),
        "config_path": str(cfg_path),
        "config_sha256": enrollment.digest(cfg_raw),
        "owner_pid": 4444,
        "owner_identity": "owner-id-4444",
        "child_pid": 5555,
        "child_identity": "child-id-5555",
        "leases": [
            {"id": f"{job_id}-worker", "kind": "worker", "memory_bytes": 64 * 1024 * 1024, "parent_id": None},
            {"id": f"{job_id}-heavy", "kind": "heavy", "memory_bytes": 1536 * 1024 * 1024, "parent_id": f"{job_id}-worker"},
        ],
        "keep_pids": [32600],
        "preserve_storage_path": str(storage_dir),
        "preserve_storage_device": storage_st.st_dev,
        "preserve_storage_inode": storage_st.st_ino,
        "drain_evidence_path": str(drain_path),
        "drain_evidence_sha256": drain_sha,
    }
    plan_path = project / ".forgewright/runtime/recovery/plan.json"
    plan_raw = (json.dumps(plan_obj, sort_keys=True) + "\n").encode()
    plan_path.write_bytes(plan_raw)
    plan_path.chmod(0o600)
    plan_sha = enrollment.digest(plan_raw)

    with pytest.raises(enrollment.EnrollmentError, match="enrollment-jobs-live-or-quarantined"):
        enrollment.require_quiescent_enrollment(home, project)

    monkeypatch.setattr(
        resource_controls,
        "_strict_process_census",
        lambda: {"complete": True, "rows": {32600: {"ppid": 1, "pgid": 32600, "stat": "S", "birth": "b1"}, 4444: {"ppid": 1, "pgid": 4444, "stat": "S", "birth": "b2"}}},
    )
    blocked = resource_controls.reconcile_quarantined_plan(home, project, plan_path, plan_sha, apply=True)
    assert blocked["status"] == "blocked"
    assert blocked["reason"] == "owner-pid-present-in-census"

    owner_alive = False
    monkeypatch.setattr(
        resource_controls,
        "_strict_process_census",
        lambda: {"complete": True, "rows": {32600: {"ppid": 1, "pgid": 32600, "stat": "S", "birth": "b1"}}},
    )
    monkeypatch.setattr("host_resources.inspect_process", lambda pid: None if pid == 4444 else "other")
    no_drain_plan = {k: v for k, v in plan_obj.items() if not k.startswith("drain_evidence")}
    no_drain_path = project / ".forgewright/runtime/recovery/plan-nodrain.json"
    no_drain_raw = (json.dumps(no_drain_plan, sort_keys=True) + "\n").encode()
    no_drain_path.write_bytes(no_drain_raw)
    no_drain_path.chmod(0o600)
    unknown_res = resource_controls.reconcile_quarantined_plan(
        home, project, no_drain_path, enrollment.digest(no_drain_raw), apply=False
    )
    assert unknown_res["status"] == "unknown"

    dry = resource_controls.reconcile_quarantined_plan(home, project, plan_path, plan_sha, apply=False)
    assert dry["status"] == "eligible"
    assert dry["mutated"] is False

    # Pre-existing conflicting step artifact blocks apply before any DB mutation
    reconcile_dir = home / "reconciliations"
    reconcile_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    bad_step = reconcile_dir / f"{job_id}.step-heavy.json"
    bad_step.write_text('{"schema": "bad"}\n', encoding="utf-8")
    bad_step.chmod(0o600)
    conflict_res = resource_controls.reconcile_quarantined_plan(home, project, plan_path, plan_sha, apply=True)
    assert conflict_res["status"] == "blocked"
    assert "unexpected-step-artifact" in conflict_res["reason"]
    bad_step.unlink()

    # Actual fault injection at each atomic_private boundary (intent, heavy-step, worker-step, closure):
    orig_atomic = enrollment.atomic_private
    for target_suffix in (".intent.json", ".step-heavy.json", ".step-worker.json", f"{job_id}.json"):
        with monkeypatch.context() as mp_fault:
            def fail_on_target(path, raw, *, private_parent=True, _sfx=target_suffix):
                if str(path).endswith(_sfx):
                    raise OSError(f"injected-fault:{_sfx}")
                return orig_atomic(path, raw, private_parent=private_parent)
            mp_fault.setattr(enrollment, "atomic_private", fail_on_target)
            with pytest.raises(OSError, match="injected-fault"):
                resource_controls.reconcile_quarantined_plan(home, project, plan_path, plan_sha, apply=True)
        assert journal_path.read_bytes() == journal_raw
        assert req_path.read_bytes() == req_raw

    applied = resource_controls.reconcile_quarantined_plan(home, project, plan_path, plan_sha, apply=True)
    assert applied["status"] == "reconciled"
    assert applied["mutated"] is True
    assert Path(applied["closure_receipt"]).is_file()
    assert journal_path.read_bytes() == journal_raw

    enrollment.require_quiescent_enrollment(home, project)

    # Altering step lease payload invalidates verify_failed_safe_closure
    step_h_path = reconcile_dir / f"{job_id}.step-heavy.json"
    closure_path = Path(applied["closure_receipt"])
    orig_step_h = step_h_path.read_bytes()
    orig_closure = closure_path.read_bytes()
    tampered_step = json.loads(orig_step_h)
    tampered_step["lease"]["memoryMiB"] = 9999
    tampered_closure = json.loads(orig_closure)
    tampered_closure["leases"][0]["memoryMiB"] = 9999
    step_h_path.write_text(json.dumps(tampered_step) + "\n", encoding="utf-8")
    step_h_path.chmod(0o600)
    closure_path.write_text(json.dumps(tampered_closure) + "\n", encoding="utf-8")
    closure_path.chmod(0o600)
    # Both paired step+closure tampering AND re-running apply on both-released with tampered closure
    # must be rejected before constructing HostAdmission.
    adm_calls = []
    orig_adm = HostAdmission
    monkeypatch.setattr("host_admission.HostAdmission", lambda *a, **kw: (adm_calls.append(1), orig_adm(*a, **kw))[1])
    tampered_apply = resource_controls.reconcile_quarantined_plan(home, project, plan_path, plan_sha, apply=True)
    assert tampered_apply["status"] == "blocked"
    assert adm_calls == []
    monkeypatch.setattr("host_admission.HostAdmission", orig_adm)
    with pytest.raises(enrollment.EnrollmentError, match="native-request-state-unconfirmed"):
        enrollment.require_quiescent_enrollment(home, project)
    step_h_path.write_bytes(orig_step_h)
    step_h_path.chmod(0o600)
    closure_path.write_bytes(orig_closure)
    closure_path.chmod(0o600)
    enrollment.require_quiescent_enrollment(home, project)

    # Representation-only formatting difference in closure or step must be rejected
    # in preflight before constructing HostAdmission.
    pretty_closure = (json.dumps(json.loads(orig_closure), indent=2, sort_keys=True) + "\n").encode("utf-8")
    closure_path.write_bytes(pretty_closure)
    closure_path.chmod(0o600)
    monkeypatch.setattr("host_admission.HostAdmission", lambda *a, **kw: (adm_calls.append(1), orig_adm(*a, **kw))[1])
    repr_conflict = resource_controls.reconcile_quarantined_plan(home, project, plan_path, plan_sha, apply=True)
    assert repr_conflict["status"] == "blocked"
    assert repr_conflict["reason"] == "conflicting-existing-closure-receipt"
    assert adm_calls == []
    monkeypatch.setattr("host_admission.HostAdmission", orig_adm)
    closure_path.write_bytes(orig_closure)
    closure_path.chmod(0o600)

    # Partial-heavy continuation: if closure and worker step are absent and worker row is still quarantined,
    # apply resumes cleanly with existing intent and heavy step.
    closure_path.unlink()
    (reconcile_dir / f"{job_id}.step-worker.json").unlink()
    adm2 = HostAdmission(home, sensor=lambda: normal_mem, inspector=lambda pid: None, now=lambda: 1000.0)
    with adm2.transaction():
        adm2.connection.execute("UPDATE jobs SET state='quarantined', reason='quiescence-unconfirmed' WHERE id=?", (f"{job_id}-worker",))
    adm2.close()
    resumed = resource_controls.reconcile_quarantined_plan(home, project, plan_path, plan_sha, apply=True)
    assert resumed["status"] == "reconciled"
    enrollment.require_quiescent_enrollment(home, project)

    # Verify that a failed-safe-closed job with all valid canary events/markers and matching
    # profile/code/config/command/timestamp bindings NEVER satisfies activate()
    Path(staged["approved_marker"]).write_text("n1", encoding="utf-8")
    Path(staged["approved_marker"]).chmod(0o600)
    enrollment.record_canary(home, project, {"session_id": "s1", "turn_id": "t1", "tool_use_id": "u-deny"}, "deny")
    enrollment.record_canary(home, project, {"session_id": "s1", "turn_id": "t1", "tool_use_id": "u1"}, "profile-run", context=context)
    with pytest.raises(enrollment.EnrollmentError, match="native-proof-terminal-job-missing"):
        enrollment.activate(home, project, cfg_path)

    # Wrong-owner and wrong-parent SQLite mutations must be rejected by verify_failed_safe_closure
    adm_mut = HostAdmission(home, sensor=lambda: normal_mem, inspector=lambda pid: None, now=lambda: 1000.0)
    with adm_mut.transaction():
        adm_mut.connection.execute("UPDATE jobs SET pid=9999 WHERE id=?", (f"{job_id}-worker",))
    adm_mut.close()
    with pytest.raises(enrollment.EnrollmentError, match="native-request-state-unconfirmed"):
        enrollment.require_quiescent_enrollment(home, project)
    adm_mut2 = HostAdmission(home, sensor=lambda: normal_mem, inspector=lambda pid: None, now=lambda: 1000.0)
    with adm_mut2.transaction():
        adm_mut2.connection.execute("UPDATE jobs SET pid=4444, parent_id='wrong-parent' WHERE id=?", (f"{job_id}-worker",))
    adm_mut2.close()
    with pytest.raises(enrollment.EnrollmentError, match="native-request-state-unconfirmed"):
        enrollment.require_quiescent_enrollment(home, project)

    # Missing-row rejection
    adm3 = HostAdmission(home, sensor=lambda: normal_mem, inspector=lambda pid: None, now=lambda: 1000.0)
    with adm3.transaction():
        adm3.connection.execute("DELETE FROM jobs WHERE id=?", (f"{job_id}-worker",))
    adm3.close()
    with pytest.raises(enrollment.EnrollmentError, match="native-request-state-unconfirmed"):
        enrollment.require_quiescent_enrollment(home, project)


def test_private_maintenance_caller_output_satisfies_failed_safe_closure_consumer(
    tmp_path, monkeypatch
):
    """Artifact-contract-only coverage of the maintenance caller -> closure consumer;
    does not claim -I -S -B subprocess bootstrap execution.
    """
    import importlib.util
    from host_admission import HostAdmission, MemorySnapshot

    caller_file = (
        Path(__file__).resolve().parents[2]
        / ".forgewright/runtime/host-binding-repair-20261021/verification-resilience-upgrade-20261022/reconcile-job-c46210045dc1448aa641053572936a07.py"
    )
    assert caller_file.is_file(), "private maintenance caller fixture is required"
    source_text = caller_file.read_text(encoding="utf-8")
    # Load module in an isolated namespace with sys.flags check bypassed for unit test import
    patched_source = source_text.replace(
        "if not (sys.flags.isolated and sys.flags.no_site and sys.flags.dont_write_bytecode):",
        "if False:",
    ).replace(
        "if \"site\" in sys.modules or \"sitecustomize\" in sys.modules or \"usercustomize\" in sys.modules:",
        "if False:",
    )
    mod_path = tmp_path / "caller_under_test.py"
    mod_path.write_text(patched_source, encoding="utf-8")
    spec = importlib.util.spec_from_file_location("caller_under_test", mod_path)
    caller_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(caller_mod)

    tmp_path = tmp_path.resolve()
    home = tmp_path / "admission"
    home.mkdir(mode=0o700)
    (home / "jobs").mkdir(parents=True, mode=0o700)
    (home / "native-requests").mkdir(parents=True, mode=0o700)
    project = (tmp_path / "project").resolve()
    vr_local = project / ".forgewright/runtime/recovery"
    vr_local.mkdir(parents=True, mode=0o700)
    job_id = "job-" + "c" * 32
    storage_dir = project / ".forgewright/runtime/build-jobs" / job_id
    storage_dir.mkdir(parents=True, mode=0o700)
    storage_st = storage_dir.lstat()

    normal_mem = MemorySnapshot(16 * 1024**3, 6 * 1024**3, "normal", "test-fixture")
    tok_w = "tok-worker-" + "w" * 40
    tok_h = "tok-heavy-" + "h" * 40
    owner_alive = True
    adm = HostAdmission(
        home,
        sensor=lambda: normal_mem,
        inspector=lambda pid: "owner-id-98132" if (pid == 98132 and owner_alive) else None,
        now=lambda: 2000.0,
    )
    adm.enqueue(job_id=f"{job_id}-worker", token=tok_w, project_root=project, run_id=job_id, owner_pid=98132, kind="worker", memory_mib=64)
    adm.enqueue(job_id=f"{job_id}-heavy", token=tok_h, project_root=project, run_id=job_id, owner_pid=98132, kind="heavy", memory_mib=1536, parent_lease_id=f"{job_id}-worker")
    adm.release(f"{job_id}-heavy", tok_h, 98132, quiescent=False)
    adm.release(f"{job_id}-worker", tok_w, 98132, quiescent=False)
    adm.close()
    owner_alive = False

    req_id = "d" * 32
    context = {
        "schema": "forgewright-native-job-request/v1",
        "request_id": req_id,
        "native": {"session_id": "s1", "turn_id": "t1", "tool_use_id": "u1"},
        "physical_workspace": str(project),
        "profile": "p1",
        "profile_digest": "3" * 64,
        "command_sha256": "4" * 64,
        "nonce": "n1",
        "code_sha256": enrollment.code_binding(),
        "config_sha256": "6" * 64,
        "issued_at": 100.0,
        "job_id": job_id,
        "owner_pid": 98132,
        "owner_identity": "owner-id-98132",
    }
    req_path = home / "native-requests" / f"{req_id}.json"
    req_raw = (json.dumps({"state": "claimed", "context": context}, sort_keys=True) + "\n").encode()
    req_path.write_bytes(req_raw)
    req_path.chmod(0o600)

    journal = {
        "schema": "forgewright-host-job/v1",
        "job_id": job_id,
        "physical_workspace": str(project),
        "profile": "p1",
        "profile_digest": "3" * 64,
        "requested_at": 101.0,
        "state": "quarantined",
        "exit_code": -15,
        "owner_pid": 98132,
        "owner_identity": "owner-id-98132",
        "child": {"pid": 98748, "identity": "child-id-98748"},
        "native_context": context,
        "storage": {"path": str(storage_dir), "state": "quarantined", "quiescent": False, "device": storage_st.st_dev, "inode": storage_st.st_ino},
        "leases": [
            {"id": f"{job_id}-worker", "kind": "worker", "state": "quarantined", "token": tok_w},
            {"id": f"{job_id}-heavy", "kind": "heavy", "state": "quarantined", "token": tok_h},
        ],
    }
    journal_path = home / "jobs" / f"{job_id}.json"
    journal_raw = (json.dumps(journal, sort_keys=True) + "\n").encode()
    journal_path.write_bytes(journal_raw)
    journal_path.chmod(0o600)
    fake_cfg = tmp_path / "synthetic-codex-config.toml"
    fake_cfg_raw = b'[features]\nhooks = true\n'
    fake_cfg.write_bytes(fake_cfg_raw)

    plan_path = vr_local / "plan.json"
    plan_obj = {
        "schema": "forgewright-quarantine-reconcile-plan/v3",
        "project": str(project),
        "job_id": job_id,
        "journal_path": str(journal_path),
        "journal_sha256": enrollment.digest(journal_raw),
        "native_request_id": req_id,
        "native_request_path": str(req_path),
        "native_request_sha256": enrollment.digest(req_raw),
        "owner_pid": 98132,
        "owner_identity": "owner-id-98132",
        "child_pid": 98748,
        "child_identity": "child-id-98748",
        "live_code_sha256": enrollment.code_binding(),
        "config_path": str(fake_cfg),
        "config_sha256": enrollment.digest(fake_cfg_raw),
        "python_executable": sys.executable,
        "python_sha256": enrollment.digest(Path(sys.executable).read_bytes()),
        "runtime_module_pins": {},
        "leases": [
            {"id": f"{job_id}-worker", "kind": "worker", "state": "quarantined", "memory_bytes": 64 * 1024 * 1024, "parent_id": None},
            {"id": f"{job_id}-heavy", "kind": "heavy", "state": "quarantined", "memory_bytes": 1536 * 1024 * 1024, "parent_id": f"{job_id}-worker"},
        ],
        "keep_pids": [32600],
        "preserve_storage_path": str(storage_dir),
        "preserve_storage_device": storage_st.st_dev,
        "preserve_storage_inode": storage_st.st_ino,
    }
    plan_raw = (json.dumps(plan_obj, sort_keys=True) + "\n").encode()
    plan_path.write_bytes(plan_raw)
    plan_path.chmod(0o600)
    plan_sha = enrollment.digest(plan_raw)

    drain_path = vr_local / "drain.json"
    drain_obj = {
        "schema": "forgewright-operator-escape-drain-evidence/v1",
        "job_id": job_id,
        "journal_sha256": enrollment.digest(journal_raw),
        "plan_sha256": plan_sha,
        "decision": "drained_verified_by_operator_and_reviewer",
        "reviewer_sha256": "e" * 64,
    }
    drain_raw = (json.dumps(drain_obj, sort_keys=True) + "\n").encode()
    drain_path.write_bytes(drain_raw)
    drain_path.chmod(0o600)
    drain_sha = enrollment.digest(drain_raw)

    monkeypatch.setattr(caller_mod, "ROOT", project)
    monkeypatch.setattr(caller_mod, "ADMISSION_HOME", home)
    monkeypatch.setattr(caller_mod, "VRDIR", vr_local)
    monkeypatch.setattr(caller_mod, "PLAN_PATH", plan_path)
    monkeypatch.setattr(caller_mod, "EXPECTED_PLAN_SHA256", plan_sha)
    monkeypatch.setattr(
        caller_mod,
        "verify_bootstrap_pins_and_import_runtime",
        lambda _p: (HostAdmission, lambda _pid: None, enrollment.atomic_private, enrollment.code_binding, enrollment.locked),
    )
    monkeypatch.setattr(
        caller_mod,
        "strict_process_census",
        lambda: {"complete": True, "rows": {32600: {"ppid": 1, "pgid": 32600, "stat": "S", "birth": "b1"}}},
    )
    monkeypatch.setattr("host_resources.inspect_process", lambda pid: None if pid == 98132 else "other")
    monkeypatch.setattr(
        sys,
        "argv",
        ["caller.py", "--apply", plan_sha, "--drain-evidence", str(drain_path), "--drain-evidence-sha256", drain_sha],
    )
    assert caller_mod.main() == 0
    enrollment.require_quiescent_enrollment(home, project)
