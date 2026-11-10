"""RF05 pilot tests for OpenSpec contract/projection adapter and Superpowers review packet protocol."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "runtime"))

import openspec_contract_adapter as osa  # noqa: E402


def test_bugfix_pilot_tasks_projection_and_archive_never_overrides_verifier():
    contract = osa.compile_openspec_contract(
        change_id="fix-agy-hook-cwd",
        revision=1,
        proposal="Fix native AGY PreToolUse hook relative path when invoked from .agents/",
        spec_deltas=[
            {
                "id": "req-agy-pretool",
                "operation": "MODIFIED",
                "requirement": "PreToolUse hook resolves antigravity-pre-tool-gate.sh from .agents/",
                "acceptance": ["Safe tool call returns allow", "Destructive tool call returns deny"],
            }
        ],
        tasks=[
            {
                "id": "task-1",
                "title": "Update .agents/hooks.json PreToolUse path",
                "target_paths": [".agents/hooks.json"],
            }
        ],
    )
    state = {
        "task-1": {
            "status": "verified",
            "evidence_ref": "rf03-test-receipt",
            "revision": 1,
            "requirement_digest": contract["tasks"][0]["requirement_digest"],
        }
    }
    md = osa.project_tasks_markdown(contract, state)
    assert "- [x] **task-1**:" in md
    assert "READ-ONLY PROJECTION" in md

    # Archive alone without independent verifier receipt must be rejected
    archived_only = osa.evaluate_openspec_completion(
        contract, state, openspec_archived=True, verifier_receipt=None
    )
    assert archived_only["accepted"] is False
    assert archived_only["reason"] == "archive_never_substitutes_for_verifier"

    # Accepted only when independent verifier receipt matches contract_digest
    verified = osa.evaluate_openspec_completion(
        contract,
        state,
        openspec_archived=True,
        verifier_receipt={
            "terminal_outcome": "accepted",
            "config_digest": contract["contract_digest"],
            "verifier": {"passed": True, "independent": True},
        },
    )
    assert verified["accepted"] is True


def test_multifile_pilot_revision_reconciliation_and_superpowers_review_packet():
    rev1 = osa.compile_openspec_contract(
        change_id="rf07-markdown-it",
        revision=1,
        proposal="Replace custom Markdown parser with markdown-it behind renderMarkdown",
        spec_deltas=[
            {
                "id": "req-md-safe",
                "operation": "MODIFIED",
                "requirement": "Escape raw HTML and reject unsafe URLs",
                "acceptance": ["<script> escaped", "javascript: and data: rejected"],
            }
        ],
        tasks=[
            {"id": "t1", "title": "Update markdown.ts", "target_paths": ["src/cli/src/docs/markdown.ts"]},
            {"id": "t2", "title": "Add renderer tests", "target_paths": ["src/cli/tests/docs-renderer.test.ts"]},
        ],
    )
    state_rev1 = {
        "t1": {"status": "verified", "evidence_ref": "vitest-1", "revision": 1, "requirement_digest": rev1["tasks"][0]["requirement_digest"]},
        "t2": {"status": "verified", "evidence_ref": "vitest-1", "revision": 1, "requirement_digest": rev1["tasks"][1]["requirement_digest"]},
    }

    # Requirement revision modifies t2 and adds t3
    rev2 = osa.compile_openspec_contract(
        change_id="rf07-markdown-it",
        revision=2,
        proposal="Add legacy engine fallback option",
        spec_deltas=rev1["spec_deltas"],
        tasks=[
            {"id": "t1", "title": "Update markdown.ts", "target_paths": ["src/cli/src/docs/markdown.ts"]},
            {"id": "t2", "title": "Add renderer and fallback tests", "target_paths": ["src/cli/tests/docs-renderer.test.ts"]},
            {"id": "t3", "title": "Verify E2E search", "target_paths": ["src/testing/e2e/tests/example.spec.ts"]},
        ],
        previous_contract=rev1,
    )
    reconciled = osa.reconcile_requirement_revision(rev1, rev2, state_rev1)
    assert reconciled["t1"]["status"] == "verified"  # unchanged task preserved
    assert reconciled["t2"]["status"] == "pending"   # modified task reset
    assert reconciled["t3"]["status"] == "pending"   # new task pending

    # Reviewer packet rejects implementer self-attestation
    with pytest.raises(osa.OpenSpecAdapterError, match="forbidden"):
        osa.build_superpowers_review_packet(
            contract=rev2,
            base_sha="c1200d57",
            head_sha="head1234",
            diff_text="diff --git a/src/cli/src/docs/markdown.ts b/src/cli/src/docs/markdown.ts",
            evidence_receipts=[{"run_id": "r1", "self_attested_pass": True}],
        )

    packet = osa.build_superpowers_review_packet(
        contract=rev2,
        base_sha="c1200d57",
        head_sha="head1234",
        diff_text="diff --git a/src/cli/src/docs/markdown.ts b/src/cli/src/docs/markdown.ts",
        evidence_receipts=[
            {
                "run_id": "r1",
                "commands": {"agent": ["npm", "test"], "verifier": ["vitest", "run"]},
                "terminal_outcome": "accepted",
                "verifier": {"passed": True, "independent": True},
                "evidence_paths": {"receipt": "/tmp/r1/receipt.json"},
                "artifact_digests": {"events": "abc123"},
            }
        ],
    )
    assert packet["schema"] == osa.REVIEW_PACKET_SCHEMA
    assert packet["contract_digest"] == rev2["contract_digest"]
    assert packet["evidence_receipts"][0]["evidence_paths"] == {"receipt": "/tmp/r1/receipt.json"}
    assert packet["evidence_receipts"][0]["artifact_digests"] == {"events": "abc123"}


def test_acceptance_criteria_change_with_unchanged_task_dict_invalidates_verified_state():
    rev1 = osa.compile_openspec_contract(
        change_id="s3-acceptance-change",
        revision=1,
        proposal="Initial proposal",
        spec_deltas=[
            {
                "id": "r1",
                "operation": "ADDED",
                "requirement": "Must validate x",
                "acceptance": ["x > 0"],
            }
        ],
        tasks=[{"id": "t1", "title": "Implement x", "target_paths": ["a.py"]}],
    )
    rev2 = osa.compile_openspec_contract(
        change_id="s3-acceptance-change",
        revision=2,
        proposal="Stricter acceptance",
        spec_deltas=[
            {
                "id": "r1",
                "operation": "MODIFIED",
                "requirement": "Must validate x and y",
                "acceptance": ["x > 0", "y > 0"],
            }
        ],
        tasks=[{"id": "t1", "title": "Implement x", "target_paths": ["a.py"]}],
        previous_contract=rev1,
    )
    state1 = {
        "t1": {
            "status": "verified",
            "evidence_ref": "ev-rev1",
            "revision": 1,
            "requirement_digest": rev1["tasks"][0]["requirement_digest"],
        }
    }
    reconciled = osa.reconcile_requirement_revision(rev1, rev2, state1)
    assert reconciled["t1"]["status"] == "pending"
    assert reconciled["t1"]["evidence_ref"] is None
    assert "- [x]" not in osa.project_tasks_markdown(rev2, state1)
    assert "- [ ] **t1**:" in osa.project_tasks_markdown(rev2, reconciled)

    # V2-02: Unbound state (missing revision or missing requirement_digest) must never be treated as verified
    for bad_state in (
        {"t1": {"status": "verified", "evidence_ref": "old-unbound-evidence"}},
        {"t1": {"status": "verified", "evidence_ref": "no-digest", "revision": 2}},
        {"t1": {"status": "verified", "evidence_ref": "no-rev", "requirement_digest": rev2["tasks"][0]["requirement_digest"]}},
        {"t1": {"status": "verified", "evidence_ref": "wrong-rev", "revision": 1, "requirement_digest": rev2["tasks"][0]["requirement_digest"]}},
        {"t1": {"status": "verified", "evidence_ref": "wrong-digest", "revision": 2, "requirement_digest": "deadbeef"}},
    ):
        assert "- [x]" not in osa.project_tasks_markdown(rev2, bad_state)
        comp = osa.evaluate_openspec_completion(
            rev2,
            bad_state,
            openspec_archived=True,
            verifier_receipt={
                "terminal_outcome": "accepted",
                "config_digest": rev2["contract_digest"],
                "verifier": {"passed": True, "independent": True},
            },
        )
        assert comp["all_tasks_verified"] is False
        assert comp["accepted"] is False
