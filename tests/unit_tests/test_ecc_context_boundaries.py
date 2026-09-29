"""Independent AC04/AC06/AC07 probes. Synthetic files only; never read real private data."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

from scripts.runtime.context_packets import (
    ContextPacketError,
    compile_worker_packet,
    create_supplemental_request,
    retrieve_supplemental_context,
    attach_supplemental_context,
)
from scripts.runtime.execution_contract import lock_execution_contract

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


def redigest(value):
    core = {k: v for k, v in value.items() if k != "digest"}
    return {
        **core,
        "digest": hashlib.sha256(
            json.dumps(
                core, sort_keys=True, ensure_ascii=False, separators=(",", ":")
            ).encode()
        ).hexdigest(),
    }


def setup(root, data=b"LOCAL_FIXTURE\n"):
    (root / "src").mkdir()
    (root / "src" / "item.txt").write_bytes(data)
    locked = lock_execution_contract(
        {
            "requirements": "Inspect bounded local fixture.",
            "acceptance_criteria": ["No unauthorized context becomes executable."],
            "out_of_scope": ["No external access."],
            "task_class": "standard",
        },
        [{"scope_id": "backend"}],
    )
    packet = compile_worker_packet(
        goal_id="goal-probe",
        task_id="task-probe",
        scope_id="backend",
        base_sha="a" * 40,
        execution_contract=locked,
        paths=["src"],
    )
    request = create_supplemental_request(
        goal_id="goal-probe",
        task_id="task-probe",
        scope_id="backend",
        base_sha="a" * 40,
        plan_digest=locked["digest"],
        round_index=1,
        missing_facts=[
            {
                "fact_id": "fact-item",
                "kind": "code",
                "target_path": "src/item.txt",
                "reason": "Read required fixture.",
                "mandatory": True,
            }
        ],
    )
    return packet, request


@pytest.mark.parametrize("bad", [True, -1, 1.5, float("inf"), "0"])
def test_cumulative_budget_is_a_strict_nonnegative_integer(tmp_path, bad):
    _, request = setup(tmp_path)
    with pytest.raises(ContextPacketError):
        retrieve_supplemental_context(
            tmp_path, request, allowed_scope_paths=["src"], cumulative_bytes=bad
        )


def test_invalid_utf8_cannot_expand_accounted_output(tmp_path):
    _, request = setup(tmp_path, b"\xff" * 100)
    response = retrieve_supplemental_context(
        tmp_path, request, allowed_scope_paths=["src"], byte_budget=100
    )
    delivered = sum(
        len(item.get("content", "").encode("utf8")) for item in response["excerpts"]
    )
    assert delivered <= 100, (
        "Decoded replacement text exceeded the actual UTF-8 budget."
    )
    assert response["status"] == "BLOCKED_CONTEXT", (
        "Malformed textual source cannot be declared complete."
    )


def test_rehashed_request_cannot_turn_mandatory_flag_into_string(tmp_path):
    _, request = setup(tmp_path)
    request["missing_facts"][0]["mandatory"] = "false"
    with pytest.raises(ContextPacketError):
        retrieve_supplemental_context(
            tmp_path, redigest(request), allowed_scope_paths=["src"]
        )


def test_unknown_response_status_is_never_upgraded_to_ready(tmp_path):
    packet, request = setup(tmp_path)
    response = retrieve_supplemental_context(
        tmp_path, request, allowed_scope_paths=["src"]
    )
    response["status"] = "UNVERIFIED"
    try:
        attached = attach_supplemental_context(packet, redigest(response))
    except ContextPacketError:
        return
    assert attached.get("status") != "READY" and attached.get("blocked") is True


def test_rehashed_response_content_must_match_provenance(tmp_path):
    packet, request = setup(tmp_path)
    response = retrieve_supplemental_context(
        tmp_path, request, allowed_scope_paths=["src"]
    )
    response["excerpts"][0]["content"] = "CHANGED_SYNTHETIC_FIXTURE"
    with pytest.raises(ContextPacketError):
        attach_supplemental_context(packet, redigest(response))


def test_empty_tampered_content_does_not_skip_provenance_validation(tmp_path):
    packet, req = setup(tmp_path)
    response = retrieve_supplemental_context(tmp_path, req, allowed_scope_paths=["src"])
    response["excerpts"][0]["content"] = ""
    with pytest.raises(ContextPacketError):
        attach_supplemental_context(packet, redigest(response))


def test_negative_response_accounting_is_rejected(tmp_path):
    packet, req = setup(tmp_path)
    response = retrieve_supplemental_context(tmp_path, req, allowed_scope_paths=["src"])
    response["stats"]["cumulative_bytes"] = -1000
    with pytest.raises(ContextPacketError):
        attach_supplemental_context(packet, redigest(response))


def test_path_swapped_between_validation_and_open_never_leaks_other_scope(
    tmp_path, monkeypatch
):
    _, request = setup(tmp_path)
    outside_scope = tmp_path / "private"
    outside_scope.mkdir()
    private_fixture = outside_scope / "fixture.txt"
    marker = "SYNTHETIC_OTHER_SCOPE_ONLY"
    private_fixture.write_text(marker)
    target = tmp_path / "src" / "item.txt"
    original_open = Path.open
    swapped = False

    def swap_on_open(path, *args, **kwargs):
        nonlocal swapped
        if path == target and not swapped:
            swapped = True
            target.unlink()
            target.symlink_to(private_fixture)
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", swap_on_open)
    try:
        response = retrieve_supplemental_context(
            tmp_path, request, allowed_scope_paths=["src"]
        )
    except (ContextPacketError, OSError):
        return
    assert marker not in json.dumps(response), (
        "A validation/open race delivered another scope."
    )
    # Descriptor-based implementations do not call Path.open, so may read the original fixture safely.
    if swapped:
        assert response["status"] == "BLOCKED_CONTEXT"
