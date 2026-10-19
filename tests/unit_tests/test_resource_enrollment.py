from pathlib import Path
import sys
import tomllib
import json
import time

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
from resource_enrollment import stage, rollback, activate, EnrollmentError


def test_stage_preserves_existing_hooks_and_rollback_is_exact(tmp_path):
    config = tmp_path / "config.toml"
    original = b'[features]\nhooks = true\n[[hooks.Stop]]\nmatcher="*"\n[[hooks.Stop.hooks]]\ntype="command"\ncommand="echo user-hook"\n'
    config.write_bytes(original)
    project = tmp_path / "project"
    project.mkdir()
    home = tmp_path / "authority"
    home.mkdir(mode=0o700)
    first = stage(home, project, config, {}, "nonce-fixture")
    second = stage(home, project, config, {}, "nonce-fixture")
    assert first["config_sha256"] == second["config_sha256"]
    parsed = tomllib.loads(config.read_text())
    assert parsed["hooks"]["Stop"][0]["hooks"][0]["command"] == "echo user-hook"
    assert len(parsed["hooks"]["PreToolUse"]) == 1
    assert first["mode"] == "canary" and first["enforcement_verified"] is False
    rollback(home, project, config)
    assert config.read_bytes() == original


def test_malformed_config_or_missing_native_proof_cannot_activate(tmp_path):
    config = tmp_path / "config.toml"
    config.write_text("invalid [")
    project = tmp_path / "project"
    project.mkdir()
    home = tmp_path / "authority"
    home.mkdir(mode=0o700)
    with pytest.raises(EnrollmentError):
        stage(home, project, config, {}, "fixture")
    assert config.read_text() == "invalid ["
    config.write_text("[features]\nhooks=true\n")
    stage(home, project, config, {}, "fixture")
    with pytest.raises(EnrollmentError, match="native-proof"):
        activate(home, project, config)


def test_config_drift_blocks_rollback_instead_of_overwriting_user_edit(tmp_path):
    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    project = tmp_path / "project"
    project.mkdir()
    home = tmp_path / "authority"
    home.mkdir(mode=0o700)
    stage(home, project, config, {}, "fixture")
    config.write_text(config.read_text() + "\n# user changed this\n")
    with pytest.raises(EnrollmentError, match="config-drift"):
        rollback(home, project, config)


def test_identical_other_config_cannot_take_enrollment_rollback(tmp_path):
    from resource_enrollment import registry
    config=tmp_path/'config.toml';config.write_text('[features]\nhooks=true\n')
    project=tmp_path/'project';project.mkdir()
    home=tmp_path/'authority';home.mkdir(mode=0o700)
    stage(home,project,config,{},'fixture')
    copied=tmp_path/'copy.toml';copied.write_bytes(config.read_bytes())
    before=config.read_bytes()
    with pytest.raises(EnrollmentError,match='config-path'):rollback(home,project,copied)
    assert config.read_bytes()==copied.read_bytes()==before
    assert str(project) in registry(home)


def test_shared_hook_last_rollback_restores_original_in_either_order(tmp_path):
    for order in [(0, 1), (1, 0)]:
        root = tmp_path / str(order[0])
        root.mkdir()
        config = root / "config.toml"
        original = b"[features]\nhooks=true\n"
        config.write_bytes(original)
        home = root / "authority"
        home.mkdir(mode=0o700)
        projects = [root / str(i) for i in range(2)]
        for project in projects:
            project.mkdir()
            stage(home, project, config, {}, "fixture")
        for i in order:
            rollback(home, projects[i], config)
        assert config.read_bytes() == original


def test_status_rewrite_plus_manual_job_cannot_fake_native_canary(tmp_path):
    import runpy

    fixture = runpy.run_path(
        str(Path(__file__).with_name("test_resource_admission_hook.py"))
    )["fixture"]
    from resource_enrollment import registry, save

    home, project, profile, digest = fixture(tmp_path)
    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    value = stage(home, project, config, {profile["id"]: digest}, "fixture-nonce")
    values = registry(home)
    values[str(project)]["events"] = [
        {"action": "deny", "session_id": "s", "turn_id": "t", "tool_use_id": "deny"},
        {
            "action": "rewrite",
            "session_id": "s",
            "turn_id": "t",
            "tool_use_id": "status-only",
        },
    ]
    save(home, values)
    marker = Path(value["approved_marker"])
    marker.write_text("fixture-nonce")
    marker.chmod(0o600)
    folder = home / "jobs"
    folder.mkdir(mode=0o700)
    receipt = folder / "manual-job.json"
    receipt.write_text(
        json.dumps(
            {
                "physical_workspace": str(project),
                "profile": profile["id"],
                "state": "quiescent",
                "exit_code": 0,
                "requested_at": time.time(),
            }
        )
    )
    receipt.chmod(0o600)
    with pytest.raises(EnrollmentError, match="native-proof"):
        activate(home, project, config)


def test_native_request_binds_exact_job_and_cannot_replay(tmp_path):
    """Synthetic native wire fields; this is not native-host delivery proof."""
    import runpy
    import hashlib
    from dataclasses import replace
    from host_job_profiles import install_profile, validate_profile
    from host_job_runner import run_job, JobError
    from host_admission import HostAdmission, MemorySnapshot
    from native_job_requests import issue
    from resource_enrollment import canary_paths, record_canary

    fixture = runpy.run_path(
        str(Path(__file__).with_name("test_resource_admission_hook.py"))
    )["fixture"]
    home, project, profile, _ = fixture(tmp_path)
    _, approved = canary_paths(home, project, "one-shot")
    source = project / "build.py"
    source.write_text(
        "import os\np="
        + repr(str(approved))
        + '\nf=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)\nos.write(f,b"one-shot")\nos.close(f)\n'
    )
    profile["id"] = "one-shot-v1"
    profile["sources"]["build.py"] = hashlib.sha256(source.read_bytes()).hexdigest()
    digest = install_profile(home, profile)
    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    enrollment = stage(home, project, config, {profile["id"]: digest}, "one-shot")
    native = {
        "session_id": "session",
        "turn_id": "turn",
        "tool_use_id": "approved",
        "tool_input": {"command": profile["command"]},
    }
    context = issue(home, project, native, profile, digest, enrollment)
    record_canary(home, project, {**native, "tool_use_id": "denied"}, "deny")
    record_canary(home, project, native, "profile-run", context=context)
    admission = HostAdmission(
        home,
        sensor=lambda: MemorySnapshot(
            16 * 1024**3, 10 * 1024**3, "normal", "synthetic"
        ),
    )
    try:
        request = replace(
            validate_profile(profile), native_request=context["request_id"]
        )
        receipt = run_job(admission, request)
        assert (
            receipt["exit_code"] == 0
            and receipt["native_context"]["request_id"] == context["request_id"]
        )
        active = activate(home, project, config)
        assert active["native_proof"]["job_id"] == receipt["job_id"]
        with pytest.raises(JobError, match="native-request"):
            run_job(admission, request)
        assert (
            admission.status()["active_workers"]
            == admission.status()["active_heavy"]
            == 0
        )
    finally:
        admission.close()


@pytest.mark.parametrize("available_mib", [0, 576])
def test_native_cancel_before_grant_releases_rollback_and_keeps_witness(
    tmp_path, available_mib
):
    """Both worker-wait and heavy-wait cancellation leave durable release proof."""
    from copy import deepcopy
    from dataclasses import replace
    from host_admission import HostAdmission, MemorySnapshot
    from host_job_profiles import validate_profile
    from host_job_runner import run_job, journal_released, terminal_release_witness
    from native_job_requests import issue
    from tests.unit_tests.test_resource_admission_hook import fixture

    home, project, profile, expected = fixture(tmp_path)
    config = tmp_path / "config.toml"
    original = b"[features]\nhooks=true\n"
    config.write_bytes(original)
    value = stage(home, project, config, {profile["id"]: expected}, "cancel-wait")
    context = issue(
        home,
        project,
        {"session_id": "s", "turn_id": "t", "tool_use_id": "cancel"},
        profile,
        expected,
        value,
    )
    admission = HostAdmission(
        home,
        sensor=lambda: MemorySnapshot(
            16 * 1024**3, available_mib * 1024**2, "normal", "synthetic"
        ),
    )
    try:
        result = run_job(
            admission,
            replace(
                validate_profile(profile),
                native_request=context["request_id"],
                wait_seconds=0.001,
            ),
        )
        receipt = json.loads(
            (home / "jobs" / (result["job_id"] + ".json")).read_bytes()
        )
        assert result["state"] == "cancelled" and receipt["child"] is None
        assert receipt["spawn_pending"] is False
        assert len(receipt["leases"]) == (1 if available_mib == 0 else 2)
        assert journal_released(admission, receipt)
        for change in (
            {"spawn_pending": True},
            {"child": {"pid": 123, "identity": "unknown"}},
        ):
            altered = deepcopy(receipt)
            altered.update(change)
            assert not journal_released(admission, altered)
            if len(receipt["leases"]) == 1:
                assert terminal_release_witness(altered) is None
        altered = deepcopy(receipt)
        altered["leases"][0]["state"] = "quarantined"
        assert terminal_release_witness(altered) is None
        admission.connection.execute("DELETE FROM jobs WHERE state='released'")
        assert journal_released(admission, receipt)
        rollback(home, project, config)
        assert config.read_bytes() == original
    finally:
        admission.close()


@pytest.mark.parametrize(
    "failure",
    [
        "cancel-before-claim",
        "cancel-during-claim",
        "cancel-before-enqueue",
        "nested",
        "source",
        "disk",
    ],
)
def test_native_pre_spawn_failure_keeps_terminal_rollback_proof(
    tmp_path, monkeypatch, failure
):
    import threading
    from dataclasses import replace
    import host_job_runner as runner
    from host_admission import HostAdmission, MemorySnapshot
    from host_job_profiles import validate_profile
    from native_job_requests import issue
    from tests.unit_tests.test_resource_admission_hook import fixture

    home, project, profile, expected = fixture(tmp_path)
    config = tmp_path / "config.toml"
    original = b"[features]\nhooks=true\n"
    config.write_bytes(original)
    value = stage(home, project, config, {profile["id"]: expected}, "pre-spawn")
    context = issue(
        home,
        project,
        {"session_id": "s", "turn_id": "t", "tool_use_id": "x"},
        profile,
        expected,
        value,
    )
    cancel = threading.Event()
    if failure == "cancel-before-claim":
        cancel.set()
    elif failure == "cancel-during-claim":
        import native_job_requests

        original_claim = native_job_requests.claim

        def claim_then_cancel(*args, **kwargs):
            result = original_claim(*args, **kwargs)
            cancel.set()
            return result

        monkeypatch.setattr(native_job_requests, "claim", claim_then_cancel)
    elif failure == "cancel-before-enqueue":
        monkeypatch.setattr(runner, "reject_nested", lambda *_: cancel.set())
    else:

        def reject(*args, **kwargs):
            raise runner.JobError("fixture-" + failure)

        monkeypatch.setattr(
            runner,
            "reject_nested"
            if failure == "nested"
            else "revalidate_profile"
            if failure == "source"
            else "check_disk",
            reject,
        )
    admission = HostAdmission(
        home,
        sensor=lambda: MemorySnapshot(
            16 * 1024**3, 10 * 1024**3, "normal", "synthetic"
        ),
    )
    try:
        request = replace(
            validate_profile(profile), native_request=context["request_id"]
        )
        if failure in {
            "cancel-before-claim",
            "cancel-during-claim",
            "cancel-before-enqueue",
        }:
            assert (
                runner.run_job(admission, request, cancel=cancel)["state"]
                == "cancelled"
            )
        else:
            with pytest.raises(runner.JobError, match="fixture-" + failure):
                runner.run_job(admission, request)
        claimed = json.loads(
            (home / "native-requests" / (context["request_id"] + ".json")).read_bytes()
        )["context"]
        receipt = json.loads(
            (home / "jobs" / (claimed["job_id"] + ".json")).read_bytes()
        )
        assert receipt["never_spawned"] is True and receipt["child"] is None
        assert receipt["state"] in {"cancelled", "rejected"}
        assert runner.journal_released(admission, receipt)
        rollback(home, project, config)
        assert config.read_bytes() == original
        # Model collection by a later process after the supervisor has exited.
        import host_job_history as history

        monkeypatch.setattr(history, "process_ids", lambda: {99999998})
        retired = history.collect_history(admission, keep_recent=0)
        assert retired["removed_requests"] == retired["removed_journals"] == 1
    finally:
        admission.close()


def test_user_config_edit_during_rollback_backup_read_is_not_overwritten(
    tmp_path, monkeypatch
):
    import resource_enrollment as module

    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    project = tmp_path / "project"
    project.mkdir()
    home = tmp_path / "authority"
    home.mkdir(mode=0o700)
    value = stage(home, project, config, {}, "fixture")
    original = module.private_read
    changed = config.read_bytes() + b"\n# concurrent user edit\n"

    def edit_during_read(path, *args, **kw):
        raw = original(path, *args, **kw)
        if Path(path) == Path(value["backup"]):
            config.write_bytes(changed)
        return raw

    monkeypatch.setattr(module, "private_read", edit_during_read)
    with pytest.raises(EnrollmentError, match="config-drift"):
        rollback(home, project, config)
    assert config.read_bytes() == changed


def test_stage_recovers_if_config_published_before_registry_commit(
    tmp_path, monkeypatch
):
    import resource_enrollment as module

    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    project = tmp_path / "project"
    project.mkdir()
    home = tmp_path / "authority"
    home.mkdir(mode=0o700)
    original = module.save
    failed = [False]

    def interrupted(home, value):
        if any(v.get("phase") == "canary" for v in value.values()) and not failed[0]:
            failed[0] = True
            raise OSError("fixture interrupted registry publication")
        return original(home, value)

    monkeypatch.setattr(module, "save", interrupted)
    with pytest.raises(OSError):
        stage(home, project, config, {}, "fixture")
    after = config.read_bytes()
    recovered = stage(home, project, config, {}, "fixture")
    assert recovered["phase"] == "canary" and config.read_bytes() == after


def test_rollback_recovers_if_config_restored_before_registry_commit(
    tmp_path, monkeypatch
):
    import resource_enrollment as module

    config = tmp_path / "config.toml"
    initial = b"[features]\nhooks=true\n"
    config.write_bytes(initial)
    project = tmp_path / "project"
    project.mkdir()
    home = tmp_path / "authority"
    home.mkdir(mode=0o700)
    stage(home, project, config, {}, "fixture")
    original = module.save
    failed = [False]

    def interrupted(home, value):
        if not value and not failed[0]:
            failed[0] = True
            raise OSError("fixture interrupted rollback commit")
        return original(home, value)

    monkeypatch.setattr(module, "save", interrupted)
    with pytest.raises(OSError):
        rollback(home, project, config)
    assert config.read_bytes() == initial
    rollback(home, project, config)
    assert config.read_bytes() == initial and module.registry(home) == {}


def test_atomic_exchange_preserves_user_edit_at_exchange_boundary(
    tmp_path, monkeypatch
):
    import resource_enrollment as module

    config = tmp_path / "config.toml"
    initial = b"[features]\nhooks=true\n"
    changed = initial + b"# user edit during exchange\n"
    config.write_bytes(initial)
    actual = module._exchange
    calls = []

    def interleaved(parent, first, second):
        calls.append((first, second))
        if len(calls) == 1:
            config.write_bytes(changed)
        return actual(parent, first, second)

    monkeypatch.setattr(module, "_exchange", interleaved)
    with pytest.raises(EnrollmentError, match="config-drift-preserved"):
        module.publish_config(
            config, initial + b"# managed addition\n", module.digest(initial)
        )
    assert config.read_bytes() == initial + b"# managed addition\n"
    assert len(calls) == 1
    assert any(
        p.read_bytes() == changed
        for p in tmp_path.glob(".fw-resource-preserved-*.toml")
    )


def test_conflict_does_not_publish_a_second_swap_over_third_editor_revision(
    tmp_path, monkeypatch
):
    import resource_enrollment as module

    config = tmp_path / "config.toml"
    initial = b"[features]\nhooks=true\n"
    changed = initial + b"# first editor revision\n"
    third = initial + b"# third editor revision\n"
    config.write_bytes(initial)
    actual = module._exchange
    calls = []

    def interleaved(parent, first, second):
        calls.append((first, second))
        config.write_bytes(changed if len(calls) == 1 else third)
        return actual(parent, first, second)

    monkeypatch.setattr(module, "_exchange", interleaved)
    with pytest.raises(EnrollmentError, match="config-drift-preserved"):
        module.publish_config(
            config, initial + b"# managed addition\n", module.digest(initial)
        )
    # A compensating exchange has no CAS semantics. Leave both revisions intact
    # and report the conflict instead of performing an unsafe second mutation.
    assert len(calls) == 1
    assert any(
        p.read_bytes() == changed
        for p in tmp_path.glob(".fw-resource-preserved-*.toml")
    )


def test_unreconciled_publication_conflict_cannot_be_retried(tmp_path, monkeypatch):
    import resource_enrollment as module

    config = tmp_path / "config.toml"
    initial = b"[features]\nhooks=true\n"
    config.write_bytes(initial)
    project = tmp_path / "project"
    project.mkdir()
    home = tmp_path / "authority"
    home.mkdir(mode=0o700)
    actual = module._exchange
    calls = []

    def conflict(parent, first, second):
        calls.append(True)
        config.write_bytes(initial + b"# concurrent revision\n")
        return actual(parent, first, second)

    monkeypatch.setattr(module, "_exchange", conflict)
    with pytest.raises(EnrollmentError, match="config-drift-preserved"):
        stage(home, project, config, {}, "fixture")
    value = module.registry(home)[str(project)]
    assert value["phase"] == "conflict" and value["enforcement_verified"] is False
    config.write_bytes(
        initial
    )  # An editor restores a revision; no implicit reconciliation.
    with pytest.raises(
        EnrollmentError, match="publication-conflict-requires-reconciliation"
    ):
        stage(home, project, config, {}, "fixture")
    assert len(calls) == 1 and config.read_bytes() == initial


def test_multiple_profiles_require_explicit_harmless_canary_selection(tmp_path):
    from tests.unit_tests.test_resource_admission_hook import fixture
    from host_job_profiles import install_profile

    home, project, profile, expected = fixture(tmp_path)
    second = dict(profile, id="canary-v1", command="harmless-canary")
    second_digest = install_profile(home, second)
    config = tmp_path / "config.toml"
    original = "[features]\nhooks=true\n"
    config.write_text(original)
    profiles = {profile["id"]: expected, second["id"]: second_digest}
    with pytest.raises(EnrollmentError, match="explicit-canary-profile-required"):
        stage(home, project, config, profiles, "fixture")
    assert config.read_text() == original
    result = stage(
        home, project, config, profiles, "fixture", canary_profile=second["id"]
    )
    assert result["canary_profile"] == second["id"]


def test_trust_reconciliation_accepts_only_owned_hook_bookkeeping(tmp_path):
    import resource_enrollment as module

    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    project = tmp_path / "project"
    project.mkdir()
    home = tmp_path / "authority"
    home.mkdir(mode=0o700)
    stage(home, project, config, {}, "fixture")
    key = str(config.absolute()) + ":pre_tool_use:0:0"
    trusted = (
        config.read_text()
        + "\n[hooks.state."
        + json.dumps(key)
        + ']\ntrusted_hash = "sha256:'
        + "a" * 64
        + '"\n'
    )
    config.write_text(trusted)
    reconciled = module.reconcile_trust(home, project, config)
    assert reconciled["enforcement_verified"] is False and reconciled["events"] == []
    assert reconciled["config_sha256"] == module.digest(trusted.encode())
    module.validate_binding(reconciled)
    assert reconciled["trust_reconciliation"]["changed_field"] == key
    config.write_text(
        trusted + "\n# preserve an unrelated edit\n[extra]\nsetting=true\n"
    )
    with pytest.raises(EnrollmentError, match="trust-reconciliation-unrelated-drift"):
        module.reconcile_trust(home, project, config)


def test_owner_deactivate_preserves_trust_and_unrelated_user_edits(tmp_path):
    import resource_enrollment as module

    config = tmp_path / "config.toml"
    original = "[features]\nhooks=true\n"
    config.write_text(original)
    project = tmp_path / "project"
    project.mkdir()
    home = tmp_path / "authority"
    home.mkdir(mode=0o700)
    stage(home, project, config, {}, "fixture")
    extra = '\n[extra]\nsetting="keep"\n'
    config.write_text(
        config.read_text().replace('matcher = "Bash"', 'matcher = "^$"') + extra
    )
    module.deactivate_preserving_edits(home, project, config)
    assert module.BEGIN not in config.read_text()
    assert tomllib.loads(config.read_text())["extra"]["setting"] == "keep"
    assert module.registry(home) == {}


def test_owner_disable_prevents_activation_and_new_native_claim(tmp_path):
    from native_job_requests import issue, claim
    from tests.unit_tests.test_resource_admission_hook import fixture

    home, project, profile, expected = fixture(tmp_path)
    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    value = stage(home, project, config, {profile["id"]: expected}, "fixture")
    context = issue(
        home,
        project,
        {"session_id": "s", "turn_id": "t", "tool_use_id": "call"},
        profile,
        expected,
        value,
    )
    (home / "operator-disable.json").write_text(
        json.dumps(
            {
                "schema": "forgewright-resource-operator-disable/v1",
                "projects": [str(project)],
            }
        )
    )
    with pytest.raises(EnrollmentError, match="operator-disabled"):
        activate(home, project, config)
    with pytest.raises(EnrollmentError, match="operator-disabled"):
        claim(
            home,
            context["request_id"],
            project=project,
            profile=profile["id"],
            profile_digest=expected,
            job_id="job-" + "a" * 32,
            owner_pid=1,
            owner_identity="fixture",
        )
    assert (
        json.loads(
            (home / "native-requests" / (context["request_id"] + ".json")).read_text()
        )["state"]
        == "issued"
    )


def test_deactivation_rejects_following_user_hook_and_tampered_candidate(tmp_path):
    import resource_enrollment as module

    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    project = tmp_path / "project"
    project.mkdir()
    home = tmp_path / "authority"
    home.mkdir(mode=0o700)
    value = stage(home, project, config, {}, "fixture")
    config.write_text(
        config.read_text()
        + '\n[[hooks.PreToolUse]]\nmatcher="Read"\n[[hooks.PreToolUse.hooks]]\ntype="command"\ncommand="user-hook"\n'
    )
    current = config.read_bytes()
    with pytest.raises(EnrollmentError, match="following-hook-requires-reconciliation"):
        module.deactivate_preserving_edits(home, project, config)
    assert config.read_bytes() == current
    Path(value["candidate_config"]).write_text("[features]\nhooks=true\n")
    with pytest.raises(EnrollmentError, match="candidate-config-drift"):
        module.deactivate_preserving_edits(home, project, config)
