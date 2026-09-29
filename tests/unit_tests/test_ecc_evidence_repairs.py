"""Regression tests for evidence integrity; all artifacts and repositories are test-owned."""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

import pytest

from scripts.runtime.research_decision import (
    ResearchDecisionError,
    _digest as research_digest,
    compile_research_decision,
    verify_research_decision,
)
from scripts.runtime.resumable_handoff import (
    HandoffError,
    compile_resumable_handoff,
    validate_resume_checkpoint,
)


def test_research_consumer_requires_provenance_even_with_matching_digest():
    core = {
        "schema": "forgewright-research-decision/v1",
        "decision": "ADOPT",
        "research_required": True,
        "searched_sources": [],
    }
    with pytest.raises(ResearchDecisionError):
        verify_research_decision({**core, "digest": research_digest(core)})


@pytest.mark.parametrize("invalid", [0, 1, "false", None])
def test_research_boolean_is_not_coerced(invalid):
    with pytest.raises(ResearchDecisionError):
        compile_research_decision(
            requirement="Local typo",
            decision="BUILD",
            chosen_rationale="Known local string",
            verification_source="test-local",
            research_required=invalid,
        )


def test_research_lists_are_bounded():
    with pytest.raises(ResearchDecisionError):
        compile_research_decision(
            requirement="Local typo",
            decision="BUILD",
            chosen_rationale="Known local string",
            verification_source="test-local",
            research_required=False,
            limitations=["local-only"] * 65,
        )


@pytest.fixture
def repository(tmp_path: Path):
    def git(*args: str) -> str:
        return subprocess.check_output(
            ["git", *args], cwd=tmp_path, text=True, stderr=subprocess.DEVNULL
        ).strip()

    git("init", "-b", "main")
    git("config", "user.email", "tests@example.invalid")
    git("config", "user.name", "Local evidence fixture")
    (tmp_path / "app.txt").write_text("fixture\n")
    git("add", "app.txt")
    git("commit", "-m", "fixture")
    head = git("rev-parse", "HEAD")
    return tmp_path, head


def checkpoint(root: Path, head: str, *, hashes, refs=()):
    return compile_resumable_handoff(
        root,
        project_id="project-fixture",
        goal_id="goal-fixture",
        plan_digest="a" * 64,
        base_sha=head,
        head_sha=head,
        source_verifier_sha256s=hashes,
        source_verifier_refs=refs,
    )


def test_hash_only_checkpoint_is_explicitly_unverified(repository):
    root, head = repository
    record = checkpoint(root, head, hashes=["b" * 64])
    resumed = validate_resume_checkpoint(root, record)
    assert resumed["evidence_status"] == "UNVERIFIED"
    assert resumed["requires_verifier_rerun"] is True
    assert resumed["tool_authority"] is False


def test_artifact_bytes_are_rechecked_not_promoted_to_acceptance(repository):
    root, head = repository
    directory = root / ".forgewright" / "verify"
    directory.mkdir(parents=True)
    artifact = directory / "local-fixture.txt"
    artifact.write_bytes(b"local fixture output, not production acceptance\n")
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    record = checkpoint(
        root,
        head,
        hashes=[digest],
        refs=[{"path": "local-fixture.txt", "sha256": digest}],
    )
    resumed = validate_resume_checkpoint(root, record)
    assert resumed["evidence_status"] == "BYTES_VERIFIED"
    assert resumed["requires_verifier_rerun"] is True
    artifact.write_bytes(b"changed local fixture output\n")
    with pytest.raises(HandoffError, match="artifact hash mismatch"):
        validate_resume_checkpoint(root, record)


def test_missing_artifact_is_rejected_on_resume(repository):
    root, head = repository
    directory = root / ".forgewright" / "verify"
    directory.mkdir(parents=True)
    artifact = directory / "owned.txt"
    artifact.write_bytes(b"fixture")
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    record = checkpoint(
        root, head, hashes=[digest], refs=[{"path": "owned.txt", "sha256": digest}]
    )
    artifact.unlink()
    with pytest.raises(HandoffError, match="missing or unsafe"):
        validate_resume_checkpoint(root, record)


def test_reference_set_must_match_bound_hashes(repository):
    root, head = repository
    directory = root / ".forgewright" / "verify"
    directory.mkdir(parents=True)
    (directory / "owned.txt").write_bytes(b"fixture")
    digest = hashlib.sha256(b"fixture").hexdigest()
    with pytest.raises(HandoffError, match="reference set"):
        checkpoint(
            root,
            head,
            hashes=["f" * 64],
            refs=[{"path": "owned.txt", "sha256": digest}],
        )
