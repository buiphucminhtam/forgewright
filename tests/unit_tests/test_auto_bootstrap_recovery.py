"""Mocked adapter regressions for trusted ownership and explicit recovery."""

from __future__ import annotations

import copy
import os

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline

bm = baseline.bm
fixture = baseline.fixture


def forge_receipt(bm, fixture):
    project = fixture["project"]
    target = project / "docs/project-state.json"
    target.parent.mkdir(exist_ok=True)
    target.write_bytes(b"user-owned")
    state = bm.initial_state(project, "automation", "a" * 40)
    state["status"] = "ready"
    state["owned_paths"] = [
        {
            "path": "docs/project-state.json",
            "project_root_digest": bm.root_digest(project),
            "stage": "forged",
            "before_exists": False,
            "before_sha256": None,
            "before_base64": None,
            "after_sha256": bm.sha256_bytes(b"user-owned"),
        }
    ]
    bm.write_state(project, state)
    return target


@pytest.mark.parametrize("operation", ["disable", "ensure", "repair", "upgrade"])
def test_project_receipt_is_not_deletion_or_adoption_authority(bm, fixture, operation):
    target = forge_receipt(bm, fixture)
    with pytest.raises(bm.BootstrapError, match="ownership|receipt"):
        if operation == "disable":
            bm.disable(str(fixture["project"]), keep_profile=False)
        else:
            bm.ensure(
                str(fixture["project"]),
                "full" if operation == "upgrade" else "automation",
                repair=operation == "repair",
            )
    assert target.read_bytes() == b"user-owned"
    assert fixture["calls"] == []


def test_store_inside_project_cannot_authorize_cleanup(bm, fixture, monkeypatch):
    target = forge_receipt(bm, fixture)
    policy = copy.deepcopy(fixture["policy"])
    local = fixture["project"] / "fake-global"
    bm.atomic_json(local / "bootstrap-policy.json", policy)
    monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_HOME", str(local))
    with pytest.raises(bm.BootstrapError, match="outside|store"):
        bm.disable(str(fixture["project"]), keep_profile=False)
    assert target.read_bytes() == b"user-owned"


def test_receipt_tampering_after_repeat_and_upgrade_is_rejected(
    bm, fixture, monkeypatch
):
    project = fixture["project"]
    bm.ensure(str(project), "automation")
    bm.ensure(str(project), "automation", repair=True)
    monkeypatch.setattr(bm, "ensure_global_runtime", lambda *_: {"status": "ready"})
    monkeypatch.setattr(bm, "pi_prepare", lambda *_: {"status": "disabled"})
    bm.ensure(str(project), "full")
    state = bm.read_state(project)
    state["owned_paths"][0]["before_exists"] = False
    state["owned_paths"][0]["before_base64"] = None
    state["owned_paths"][0]["before_sha256"] = None
    state["owned_paths"][0]["stage"] = "forged"
    bm.write_state(project, state)
    before = bm.snapshot(project)
    with pytest.raises(bm.BootstrapError, match="ownership|receipt"):
        bm.disable(str(project), keep_profile=False)
    assert bm.snapshot(project) == before


@pytest.mark.parametrize(
    "stage", ["project_init", "policy_seed", "index", "docs", "delegate_status"]
)
def test_explicit_repair_recovers_caught_rollback(bm, fixture, monkeypatch, stage):
    project = fixture["project"]
    monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE", stage)
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(project), "automation")
    with pytest.raises(bm.BootstrapError, match="recovery"):
        bm.ensure(str(project), "automation", auto=True)
    monkeypatch.delenv("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE")
    assert bm.ensure(str(project), "automation", repair=True)["status"] == "ready"
    assert bm.verify(str(project))["ok"] is True
    assert bm.disable(str(project), keep_profile=False)["status"] == "disabled"


def test_disable_retry_retains_global_authority(bm, fixture, monkeypatch):
    project = fixture["project"]
    bm.ensure(str(project), "automation")
    original = bm.call_forge
    monkeypatch.setattr(bm, "call_forge", lambda *a, **kw: {"status": "degraded"})
    with pytest.raises(bm.BootstrapError):
        bm.disable(str(project), keep_profile=False)
    monkeypatch.setattr(bm, "call_forge", original)
    assert bm.disable(str(project), keep_profile=False)["status"] == "disabled"
    assert bm._docs_entry_digest(project) is None


def interrupted(bm, fixture):
    project = fixture["project"]
    bm.ensure(str(project), "automation")
    journal = bm._read_journal(project)
    journal["status"] = "running"
    bm.atomic_json(bm._journal_path(project), journal)
    state = bm.read_state(project)
    state["status"] = "bootstrapping"
    bm.write_state(project, state)
    return project, journal


def test_interrupted_completed_effects_recover_under_lock(bm, fixture, monkeypatch):
    project, journal = interrupted(bm, fixture)
    original = bm.restore_receipts

    def check(project, receipts):
        assert (
            fixture["home"] / "locks" / f"project-{bm.root_digest(project)}.lock"
        ).exists()
        return original(project, receipts)

    monkeypatch.setattr(bm, "restore_receipts", check)
    with pytest.raises(bm.BootstrapError, match="recovery"):
        bm.ensure(str(project), "automation", auto=True)
    assert bm.ensure(str(project), "automation", repair=True)["status"] == "ready"


def test_interrupted_recovery_preserves_user_edit(bm, fixture):
    project, journal = interrupted(bm, fixture)
    profile = project / ".forgewright/project-profile.json"
    profile.write_text('{"owner":"edited"}')
    result = bm.ensure(str(project), "automation", repair=True)
    assert result["status"] == "degraded"
    assert profile.read_text() == '{"owner":"edited"}'
    assert bm._read_journal(project)["status"] == "rolled_back"
    with pytest.raises(bm.BootstrapError, match="repair|recovery"):
        bm.ensure(str(project), "automation", auto=True)


def test_missing_process_evidence_fails_closed(bm, fixture):
    project, journal = interrupted(bm, fixture)
    journal.pop("processes", None)
    journal.pop("owner", None)
    bm.atomic_json(bm._journal_path(project), journal)
    before = bm.snapshot(project)
    with pytest.raises(bm.BootstrapError, match="quiescence|identity"):
        bm.ensure(str(project), "automation", repair=True)
    assert bm.snapshot(project) == before


@pytest.mark.parametrize("condition", ["live", "launch_gap"])
def test_process_uncertainty_blocks_recovery(bm, fixture, condition):
    project, journal = interrupted(bm, fixture)
    if condition == "launch_gap":
        journal["spawn_pending"] = True
    else:
        journal["processes"] = [
            {"pid": os.getpid(), "identity": "unknown", "quiescent": False}
        ]
    bm.atomic_json(bm._journal_path(project), journal)
    before = bm.snapshot(project)
    with pytest.raises(bm.BootstrapError, match="quiescence|process|launch"):
        bm.ensure(str(project), "automation", repair=True)
    assert bm.snapshot(project) == before


def test_live_child_cannot_be_recovered_when_original_group_is_gone(
    bm, fixture, monkeypatch
):
    project, journal = interrupted(bm, fixture)
    journal["processes"] = [
        {
            "pid": os.getpid(),
            "identity": bm.inspect_process(os.getpid()),
            "quiescent": False,
        }
    ]
    bm.atomic_json(bm._journal_path(project), journal)
    monkeypatch.setattr(bm, "_posix_process_group_gone", lambda _pid: True)
    before = bm.snapshot(project)
    with pytest.raises(bm.BootstrapError, match="live process"):
        bm.ensure(str(project), "automation", repair=True)
    assert bm.snapshot(project) == before


@pytest.mark.parametrize("stage", ["project_init", "policy_seed", "index", "docs"])
@pytest.mark.parametrize("effect", [False, True])
def test_crash_before_receipt_capture_preserves_unattributed_effects(
    bm, fixture, monkeypatch, stage, effect
):
    project = fixture["project"]
    original_ownership = bm.ownership
    original_call = bm.call_forge
    original_index = bm.gitnexus
    original_policy = bm.ensure_policy_file

    def stop_before(*args, **kwargs):
        raise SystemExit("simulated crash before effect")

    if not effect:
        if stage == "index":
            monkeypatch.setattr(bm, "gitnexus", stop_before)
        elif stage == "policy_seed":
            monkeypatch.setattr(bm, "ensure_policy_file", stop_before)
        else:

            def call(args, **kwargs):
                if kwargs["stage"] == ("docs_init" if stage == "docs" else stage):
                    return stop_before()
                return original_call(args, **kwargs)

            monkeypatch.setattr(bm, "call_forge", call)

    def crash_capture(before, project, name):
        if name == stage:
            raise SystemExit("simulated crash before after-receipt durability")
        return original_ownership(before, project, name)

    monkeypatch.setattr(bm, "ownership", crash_capture)
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(project), "automation")
    snapshot = bm.snapshot(project)
    monkeypatch.setattr(bm, "ownership", original_ownership)
    monkeypatch.setattr(bm, "call_forge", original_call)
    monkeypatch.setattr(bm, "gitnexus", original_index)
    monkeypatch.setattr(bm, "ensure_policy_file", original_policy)
    result = bm.ensure(str(project), "automation", repair=True)
    assert result["status"] == ("degraded" if effect else "ready")
    if effect:
        preserved = {
            x["path"]
            for x in result["recovery"]
            if x["status"] == "ambiguous_preserved"
        }
        assert preserved
        for name in preserved & set(snapshot):
            assert bm.snapshot(project)[name] == snapshot[name]
        assert bm._read_journal(project)["status"] == "rolled_back"
        assert bm.ensure(str(project), "automation", repair=True)["status"] == "ready"
        bm.disable(str(project), keep_profile=False)
        for name in preserved & set(snapshot):
            assert bm.snapshot(project)[name] == snapshot[name]


def test_recovery_after_partial_rollback_is_idempotent(bm, fixture, monkeypatch):
    project, journal = interrupted(bm, fixture)
    bm.restore_receipts(project, journal["owned_paths"][:1])
    assert bm.ensure(str(project), "automation", repair=True)["status"] == "ready"


def test_quarantined_lease_is_not_released_by_project_recovery(
    bm, fixture, monkeypatch
):
    project, journal = interrupted(bm, fixture)
    # Legacy/unknown lease rows intentionally lack durable recovery authority.
    journal.pop("admission_leases", None)
    bm.atomic_json(bm._journal_path(project), journal)
    admission = bm.HostAdmission(bm.admission_home())
    admission.connection.execute(
        "UPDATE jobs SET state='quarantined' WHERE run_id=?", (journal["run_id"],)
    )
    admission.close()
    # The old owner is gone; process groups were already recorded as drained.
    monkeypatch.setattr(bm, "_open_host_admission", lambda: _dead_owner_admission(bm))
    result = bm.ensure(str(project), "automation", repair=True)
    assert result["status"] == "degraded"
    assert "host" in result["state"]["last_error"]
    admission = bm.HostAdmission(bm.admission_home())
    try:
        assert (
            admission.connection.execute(
                "SELECT state FROM jobs WHERE run_id=?", (journal["run_id"],)
            ).fetchone()[0]
            == "quarantined"
        )
    finally:
        admission.close()


def test_exact_journaled_quarantined_lease_is_reconciled_after_quiescence(
    bm, fixture, monkeypatch
):
    project, journal = interrupted(bm, fixture)
    assert journal["admission_leases"]
    run_id = journal["run_id"]
    admission = bm.HostAdmission(bm.admission_home())
    admission.connection.execute(
        "UPDATE jobs SET state='quarantined' WHERE run_id=?", (run_id,)
    )
    admission.close()
    opens = 0

    def open_admission():
        nonlocal opens
        opens += 1
        return (
            _dead_owner_admission(bm)
            if opens == 1
            else bm.HostAdmission(bm.admission_home())
        )

    monkeypatch.setattr(bm, "_open_host_admission", open_admission)

    result = bm.ensure(str(project), "automation", repair=True)
    assert result["status"] == "ready"
    admission = bm.HostAdmission(bm.admission_home())
    try:
        states = {
            row[0]
            for row in admission.connection.execute(
                "SELECT state FROM jobs WHERE run_id=?", (run_id,)
            ).fetchall()
        }
        assert states == {"released"}
    finally:
        admission.close()


def _dead_owner_admission(bm):
    admission = bm.HostAdmission(bm.admission_home())
    admission.inspector = lambda pid: None
    return admission


def test_shared_runtime_crash_requires_manual_boundary(bm, fixture):
    project, journal = interrupted(bm, fixture)
    journal["stage"] = "full_runtime"
    journal["shared_runtime_preserved"] = True
    bm.atomic_json(bm._journal_path(project), journal)
    before = bm.snapshot(project)
    with pytest.raises(bm.BootstrapError, match="manual runtime"):
        bm.ensure(str(project), "full", repair=True)
    assert bm.snapshot(project) == before


def test_global_store_permissions_are_not_project_receipt_authority(bm, fixture):
    project = fixture["project"]
    bm.ensure(str(project), "automation")
    journal = bm._journal_path(project)
    journal.chmod(0o666)
    before = bm.snapshot(project)
    with pytest.raises(bm.BootstrapError, match="store"):
        bm.disable(str(project), keep_profile=False)
    assert bm.snapshot(project) == before


@pytest.mark.parametrize("repair", [False, True])
def test_disable_crash_after_project_state_unlink_can_retry(
    bm, fixture, monkeypatch, repair
):
    project = fixture["project"]
    bm.ensure(str(project), "automation")
    original = bm.atomic_json

    def crash(path, value):
        if (
            path == bm._journal_path(project)
            and value["status"] == "completed"
            and value.get("ownership") is None
        ):
            # Emulate abrupt exit: retain the durable running journal and missing
            # project state instead of the catch-handler publication.
            raise SystemExit("crash at final publication")
        if path == bm._journal_path(project) and value["status"] == "recovery_required":
            raise SystemExit("process gone before caught-state publication")
        return original(path, value)

    monkeypatch.setattr(bm, "atomic_json", crash)
    with pytest.raises(SystemExit):
        bm.disable(str(project), keep_profile=False)
    journal = bm._read_journal(project)
    assert journal["stage"] == "disable"
    assert not bm.state_path(project).exists()
    # Process-liveness boundary is mocked; production checks this recorded owner.
    journal["settled"] = True
    original(bm._journal_path(project), journal)
    monkeypatch.setattr(bm, "atomic_json", original)
    result = (
        bm.ensure(str(project), "automation", repair=True)
        if repair
        else bm.disable(str(project), keep_profile=False)
    )
    assert result["status"] == ("ready" if repair else "disabled")
    assert bm._read_journal(project)["status"] == "completed"


def test_disable_terminal_write_failure_does_not_erase_authority(
    bm, fixture, monkeypatch
):
    project = fixture["project"]
    bm.ensure(str(project), "automation")
    original = bm.atomic_json

    def fail_terminal(path, value):
        if (
            path == bm._journal_path(project)
            and value["status"] == "completed"
            and value.get("ownership") is None
        ):
            raise OSError("terminal write unavailable")
        return original(path, value)

    monkeypatch.setattr(bm, "atomic_json", fail_terminal)
    with pytest.raises(OSError):
        bm.disable(str(project), keep_profile=False)
    assert bm._read_journal(project)["ownership"]["owned_paths"]
    monkeypatch.setattr(bm, "atomic_json", original)
    assert bm.disable(str(project), keep_profile=False)["status"] == "disabled"


def test_recovery_tracks_its_own_docs_cleanup(bm, fixture, monkeypatch):
    project, _ = interrupted(bm, fixture)
    original = bm.call_forge

    def call(args, **kwargs):
        if args[:3] == ["docs", "registry", "remove"]:
            tracked_project, journal = bm._TRANSACTION.get()
            assert tracked_project == project
            assert journal["owner"]["pid"] == os.getpid()
            assert journal["settled"] is False
            assert bm._read_journal(project)["settled"] is False
        return original(args, **kwargs)

    monkeypatch.setattr(bm, "call_forge", call)
    assert bm.ensure(str(project), "automation", repair=True)["status"] == "ready"


def test_stage_capture_error_cannot_mask_process_uncertainty(bm, fixture, monkeypatch):
    def uncertain(*args, **kwargs):
        raise bm.BootstrapError("adapter_cleanup_unconfirmed", "process remains")

    def broken_capture(*args, **kwargs):
        raise OSError("capture failed too")

    monkeypatch.setattr(bm, "call_forge", uncertain)
    monkeypatch.setattr(bm, "ownership", broken_capture)
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(fixture["project"]), "automation")
    journal = bm._read_journal(fixture["project"])
    assert journal["settled"] is False
    assert journal["status"] == "recovery_required"
    admission = bm.HostAdmission(bm.admission_home())
    try:
        assert admission.status()["quarantined"] == 1
    finally:
        admission.close()


def test_caught_rollback_docs_process_uncertainty_keeps_lease_reserved(
    bm, fixture, monkeypatch
):
    original = bm.call_forge

    def call(args, **kwargs):
        if args[:3] == ["docs", "registry", "remove"]:
            assert bm._TRANSACTION.get()[0] == fixture["project"]
            assert bm._read_journal(fixture["project"])["settled"] is False
            raise bm.BootstrapError(
                "adapter_cleanup_unconfirmed", "cleanup child remains"
            )
        return original(args, **kwargs)

    monkeypatch.setattr(bm, "call_forge", call)
    monkeypatch.setenv("FORGEWRIGHT_BOOTSTRAP_FAIL_STAGE", "docs")
    with pytest.raises(bm.BootstrapError):
        bm.ensure(str(fixture["project"]), "automation")
    journal = bm._read_journal(fixture["project"])
    assert journal["status"] == "recovery_required"
    assert journal["settled"] is False
    admission = bm.HostAdmission(bm.admission_home())
    try:
        assert admission.status()["quarantined"] == 1
    finally:
        admission.close()


def test_final_process_journal_error_cannot_mask_uncertain_cleanup(
    bm, fixture, monkeypatch
):
    project, journal = interrupted(bm, fixture)

    class Process:
        pid = 999999999
        returncode = 0
        stdout = None
        stderr = None

        def communicate(self, **kwargs):
            return "", ""

    monkeypatch.setattr(bm.subprocess, "Popen", lambda *a, **kw: Process())
    monkeypatch.setattr(bm, "_drain_owned_process_group", lambda process: False)
    original = bm.atomic_json
    writes = []

    def write(path, value):
        writes.append(path)
        if len(writes) == 3:
            raise OSError("final process evidence write failed")
        return original(path, value)

    monkeypatch.setattr(bm, "atomic_json", write)
    with (
        bm._track_transaction(project, journal),
        pytest.raises(bm.BootstrapError) as raised,
    ):
        bm.run(["mock-adapter"], cwd=project, stage="docs_unregister")
    assert raised.value.code == "adapter_cleanup_unconfirmed"
    assert journal["processes"][-1]["quiescent"] is False
