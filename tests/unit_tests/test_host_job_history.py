"""Metadata retirement never removes artifact data or SQLite ownership rows."""

import hashlib
import json
import os
from pathlib import Path
import sys
import time

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))


def context_value(home, number):
    return {
        "schema": "forgewright-native-job-request/v1",
        "request_id": f"{number:032x}",
        "issued_at": time.time() - 600,
        "native": {"session_id": "s", "turn_id": "t", "tool_use_id": str(number)},
        "physical_workspace": str(home.parent),
        "profile": "fixture-v1",
        "profile_digest": "a" * 64,
        "command_sha256": "a" * 64,
        "nonce": "fixture",
        "code_sha256": "a" * 64,
        "config_sha256": "a" * 64,
    }


def test_optional_native_observations_preserve_strict_history_schema(tmp_path):
    from host_job_history import valid_context
    value=context_value(tmp_path,1)
    assert valid_context(value,'issued')
    value['invocation_sha256']='b'*64
    assert valid_context(value,'issued')
    value.update(lesson_context_sha256=hashlib.sha256(b'').hexdigest(),lesson_context_chars=0)
    assert valid_context(value,'issued')
    for bad in ({**value,'unknown':'no'}, {**value,'lesson_context_chars':2001},
                {**value,'lesson_context_chars':True}, {**value,'invocation_sha256':'bad'}):
        assert not valid_context(bad,'issued')
    del value['lesson_context_chars']
    assert not valid_context(value,'issued')


def expired(home, number):
    from resource_enrollment import atomic_private

    identifier = f"{number:032x}"
    value = {
        "state": "issued",
        "context": context_value(home, number),
    }
    atomic_private(
        home / "native-requests" / (identifier + ".json"), json.dumps(value).encode()
    )
    return identifier


def terminal(admission, number, storage=None):
    from host_job_runner import terminal_release_witness, write_journal
    from resource_enrollment import atomic_private

    request = f"{number:032x}"
    job = "job-" + request
    context = {
        **context_value(admission.home, number),
        "job_id": job,
        "request_id": request,
        "issued_at": time.time() - 600,
        "physical_workspace": str(admission.home.parent),
        "owner_pid": 99999999,
        "owner_identity": "b" * 64,
    }
    record = {
        "schema": "forgewright-host-job/v1",
        "job_id": job,
        "state": "cancelled",
        "owner_pid": 99999999,
        "owner_identity": "b" * 64,
        "physical_workspace": context["physical_workspace"],
        "leases": [],
        "child": None,
        "spawn_pending": False,
        "never_spawned": True,
        "native_context": context,
        "requested_at": time.time() - number,
    }
    if storage is not None:
        record["storage"] = storage
    record["terminal_release"] = terminal_release_witness(record)
    write_journal(admission.home, record)
    atomic_private(
        admission.home / "native-requests" / (request + ".json"),
        json.dumps({"state": "claimed", "context": context}).encode(),
    )
    return job, request


@pytest.fixture
def admission(tmp_path):
    from host_admission import HostAdmission
    from resource_enrollment import atomic_private

    value = HostAdmission(tmp_path / "authority")
    atomic_private(value.home / "enrollments.json", b"{}")
    yield value
    value.close()


def test_expired_history_recovers_native_issue_capacity(
    admission, tmp_path, monkeypatch
):
    import host_job_history as history
    import native_job_requests as native
    from resource_enrollment import EnrollmentError, stage
    from tests.unit_tests.test_resource_admission_hook import fixture

    (tmp_path / "profile").mkdir()
    home, project, profile, expected = fixture(tmp_path / "profile")
    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    enrollment = stage(home, project, config, {profile["id"]: expected}, "history")
    for number in range(4):
        expired(home, number)
    monkeypatch.setattr(native, "MAX_NATIVE_REQUESTS", 4)
    payload = {"session_id": "s", "turn_id": "t", "tool_use_id": "new"}
    with pytest.raises(EnrollmentError, match="history-maintenance-required"):
        native.issue(home, project, payload, profile, expected, enrollment)
    from host_admission import HostAdmission

    current = HostAdmission(home)
    try:
        result = history.collect_history(current, keep_recent=1)
        assert result["removed_requests"] == 3
        context = native.issue(home, project, payload, profile, expected, enrollment)
        assert (home / "native-requests" / (context["request_id"] + ".json")).is_file()
    finally:
        current.close()


def test_terminal_retirement_preserves_proof_artifacts_and_uncertain_owner(
    admission, monkeypatch
):
    import host_job_history as history
    from resource_enrollment import save

    gone, gone_request = terminal(admission, 1)
    protected, protected_request = terminal(admission, 2)
    pending, _ = terminal(admission, 3, {"state": "cleanup_pending", "quiescent": True})
    kept, _ = terminal(admission, 4, {"state": "retained", "quiescent": True})
    save(
        admission.home,
        {
            "workspace": {
                "events": [],
                "native_proof": {"request_id": protected_request, "job_id": protected},
            }
        },
    )
    monkeypatch.setattr(history, "process_ids", lambda: None)
    assert history.collect_history(admission, keep_recent=0)["removed_journals"] == 0
    monkeypatch.setattr(history, "process_ids", lambda: {os.getpid(), 99999999})
    assert history.collect_history(admission, keep_recent=0)["removed_journals"] == 0
    monkeypatch.setattr(history, "process_ids", lambda: {os.getpid()})
    result = history.collect_history(admission, keep_recent=0)
    assert result["removed_requests"] == result["removed_journals"] == 1
    assert not (admission.home / "jobs" / (gone + ".json")).exists()
    assert not (admission.home / "native-requests" / (gone_request + ".json")).exists()
    assert all(
        (admission.home / "jobs" / (job + ".json")).exists()
        for job in (protected, pending, kept)
    )


def test_partial_census_and_request_fsync_failure_preserve_journals(
    admission, monkeypatch
):
    import host_job_history as history

    job, _ = terminal(admission, 1)
    monkeypatch.setattr(history, "process_ids", lambda: {os.getpid()})
    monkeypatch.setattr(history, "SCAN_LIMIT", 0)
    assert history.collect_history(admission, keep_recent=0)["status"] == "incomplete"
    path = admission.home / "jobs" / (job + ".json")
    assert path.exists()
    monkeypatch.setattr(history, "SCAN_LIMIT", 16384)
    monkeypatch.setattr(
        history,
        "sync_directory",
        lambda *_: (_ for _ in ()).throw(OSError("fixture fsync")),
    )
    with pytest.raises(OSError, match="fixture fsync"):
        history.collect_history(admission, keep_recent=0)
    assert path.exists()


def test_pruned_ids_remain_non_replayable_and_orphan_locks_are_reclaimed(
    admission, monkeypatch
):
    import host_job_history as history
    from resource_enrollment import atomic_private, EnrollmentError
    from native_job_requests import claim

    identifier = expired(admission.home, 1)
    lock = admission.home / "native-requests" / (identifier + ".lock")
    atomic_private(lock, b"")
    history.collect_history(admission, keep_recent=0)
    assert not lock.exists()
    with pytest.raises(EnrollmentError):
        claim(
            admission.home,
            identifier,
            project=admission.home.parent,
            profile="x",
            profile_digest="x",
            job_id="job-" + "a" * 32,
            owner_pid=os.getpid(),
            owner_identity="x",
        )
    assert lock.exists()
    history.collect_history(admission, keep_recent=0)
    assert not lock.exists()


@pytest.mark.parametrize(
    "field,bad",
    [
        ("schema", None),
        ("schema", "forgewright-native-job-request/v999"),
        ("issued_at", "invalid"),
        ("issued_at", float("nan")),
        ("issued_at", True),
    ],
)
def test_unknown_schema_or_timestamp_preserves_all_unresolved_references(
    admission, field, bad
):
    from host_job_history import collect_history
    from resource_enrollment import atomic_private

    identifier = expired(admission.home, 1)
    path = admission.home / "native-requests" / (identifier + ".json")
    value = json.loads(path.read_bytes())
    if bad is None:
        value["context"].pop(field)
    else:
        value["context"][field] = bad
    atomic_private(path, json.dumps(value).encode())
    other = expired(admission.home, 2)
    assert collect_history(admission, keep_recent=0)["status"] == "incomplete"
    assert path.exists() and (path.parent / (other + ".json")).exists()


def test_protected_locks_before_orphans_do_not_starve_cleanup(admission):
    from host_job_history import collect_history
    from resource_enrollment import atomic_private

    folder = admission.home / "native-requests"
    for number in range(129):
        identifier = expired(admission.home, number)
        path = folder / (identifier + ".json")
        value = json.loads(path.read_bytes())
        value["context"]["issued_at"] = time.time()
        atomic_private(path, json.dumps(value).encode())
        atomic_private(folder / (identifier + ".lock"), b"")
    orphan = folder / (f"{500:032x}" + ".lock")
    atomic_private(orphan, b"")
    assert collect_history(admission, keep_recent=0)["removed_locks"] == 1
    assert not orphan.exists() and len(list(folder.glob("*.lock"))) == 129


def test_concurrent_issue_claim_and_prune_preserve_valid_native_request(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from host_admission import HostAdmission
    from host_job_history import collect_history
    from native_job_requests import issue, claim
    from resource_enrollment import stage, EnrollmentError
    from tests.unit_tests.test_resource_admission_hook import fixture

    home, project, profile, expected = fixture(tmp_path)
    config = tmp_path / "config.toml"
    config.write_text("[features]\nhooks=true\n")
    enrollment = stage(home, project, config, {profile["id"]: expected}, "race")
    admission = HostAdmission(home)
    created = []
    owner_identity = hashlib.sha256(b"fixture-owner").hexdigest()

    def operation(number):
        try:
            context = issue(
                home,
                project,
                {"session_id": "s", "turn_id": "t", "tool_use_id": str(number)},
                profile,
                expected,
                enrollment,
            )
        except EnrollmentError as error:
            assert str(error) == "enrollment-busy"
            return None
        created.append(context["request_id"])
        try:
            claim(
                home,
                context["request_id"],
                project=project,
                profile=profile["id"],
                profile_digest=expected,
                job_id="job-" + f"{number:032x}",
                owner_pid=os.getpid(),
                owner_identity=owner_identity,
            )
        except EnrollmentError as error:
            assert str(error) == "enrollment-busy"
        return context["request_id"]

    try:
        assert operation(0)
        assert collect_history(admission, keep_recent=0)["status"] == "complete"
        with ThreadPoolExecutor(max_workers=2) as workers:
            pending = [workers.submit(operation, number) for number in (1, 2)]
            assert collect_history(admission, keep_recent=0)["status"] in {
                "complete",
                "busy",
            }
            for future in pending:
                future.result(timeout=5)
        collect_history(admission, keep_recent=0)
        for identifier in created:
            value = json.loads(
                (home / "native-requests" / (identifier + ".json")).read_bytes()
            )
            if value["state"] == "issued":
                claim(
                    home,
                    identifier,
                    project=project,
                    profile=profile["id"],
                    profile_digest=expected,
                    job_id="job-" + identifier,
                    owner_pid=os.getpid(),
                    owner_identity=owner_identity,
                )
            assert (
                json.loads(
                    (home / "native-requests" / (identifier + ".json")).read_bytes()
                )["state"]
                == "claimed"
            )
    finally:
        admission.close()
