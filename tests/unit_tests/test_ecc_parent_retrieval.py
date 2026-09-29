"""Independent parent-session and physical read boundaries. Synthetic local files only."""

from __future__ import annotations
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
import pytest

from scripts.runtime.context_packets import (
    ContextPacketError,
    ParentRetrievalSession,
    create_supplemental_request,
    retrieve_supplemental_context,
)


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


def signed(value):
    core = {k: v for k, v in value.items() if k != "digest"}
    return {
        **core,
        "digest": hashlib.sha256(
            json.dumps(
                core, sort_keys=True, ensure_ascii=False, separators=(",", ":")
            ).encode()
        ).hexdigest(),
    }


def state(root, **extra):
    (root / "src").mkdir(exist_ok=True)
    (root / "src" / "available.txt").write_text("AVAILABLE_SYNTHETIC_ONLY")
    return ParentRetrievalSession(
        root,
        goal_id="g",
        task_id="t",
        scope_id="s",
        plan_digest="a" * 64,
        base_sha="b" * 40,
        allowed_scope_paths=["src"],
        **extra,
    )


def request(round_index=1, target="src/available.txt", fact_id="required"):
    return create_supplemental_request(
        goal_id="g",
        task_id="t",
        scope_id="s",
        plan_digest="a" * 64,
        base_sha="b" * 40,
        round_index=round_index,
        missing_facts=[
            {
                "fact_id": fact_id,
                "kind": "code",
                "target_path": target,
                "reason": "Inspect local required fact.",
                "mandatory": True,
            }
        ],
    )


@pytest.mark.parametrize(
    "field,value", [("round_index", True), ("unknown_authority", True)]
)
def test_parent_revalidates_request_semantics(tmp_path, field, value):
    session = state(tmp_path)
    req = request()
    req[field] = value
    with pytest.raises(ContextPacketError):
        session.handle_request(signed(req))


def test_parent_must_not_rebind_unresolved_fact_to_another_file(tmp_path):
    session = state(tmp_path)
    assert (
        session.handle_request(request(target="src/missing.txt"))["status"]
        == "BLOCKED_CONTEXT"
    )
    try:
        reply = session.handle_request(
            request(round_index=2, target="src/available.txt")
        )
    except ContextPacketError:
        return
    assert reply["status"] == "BLOCKED_CONTEXT", (
        "Reusing the fact ID must not silently clear a different missing requirement."
    )


def test_parent_current_revision_and_request_revision_must_both_match(tmp_path):
    def git(*args):
        return subprocess.check_output(
            ["git", *args], cwd=tmp_path, text=True, stderr=subprocess.DEVNULL
        ).strip()

    git("init", "-b", "main")
    git("config", "user.email", "fixture@example.invalid")
    git("config", "user.name", "Local fixture")
    (tmp_path / "file.txt").write_text("fixture")
    git("add", "file.txt")
    git("commit", "-m", "fixture")
    head = git("rev-parse", "HEAD")
    session = state(tmp_path, current_revision=head)
    req = request()
    req["binding"]["current_revision"] = "c" * 40
    with pytest.raises(ContextPacketError):
        session.handle_request(signed(req))


def test_final_context_keeps_earlier_delivered_content(tmp_path):
    session = state(tmp_path)
    first = session.handle_request(request())
    (tmp_path / "src" / "second.txt").write_text("SECOND_SYNTHETIC_FIXTURE")
    second = session.handle_request(
        request(round_index=2, target="src/second.txt", fact_id="second")
    )
    delivered = "\n".join(item.get("content", "") for item in second["excerpts"])
    assert (
        "AVAILABLE_SYNTHETIC_ONLY" in delivered
        and "SECOND_SYNTHETIC_FIXTURE" in delivered
    ), "A new worker must receive the actual prior context, not only the newest round."
    assert second["stats"]["cumulative_bytes"] >= first["stats"]["cumulative_bytes"]


def test_low_level_open_race_never_delivers_a_different_scope(tmp_path, monkeypatch):
    state(tmp_path)
    target = tmp_path / "src" / "available.txt"
    private = tmp_path / "private"
    private.mkdir()
    private_file = private / "fixture.txt"
    marker = "OTHER_SCOPE_SYNTHETIC_MARKER"
    private_file.write_text(marker)
    original = os.open
    swapped = False

    def guarded_open(path, flags, mode=0o777, *, dir_fd=None):
        nonlocal swapped
        # A descriptor-pinned reader operates on relative path components and is unaffected.
        if str(path) == str(target) and not swapped:
            swapped = True
            target.unlink()
            target.symlink_to(private_file)
        return original(path, flags, mode, dir_fd=dir_fd)

    monkeypatch.setattr(os, "open", guarded_open)
    try:
        result = retrieve_supplemental_context(
            tmp_path, request(), allowed_scope_paths=["src"]
        )
    except (ContextPacketError, OSError):
        return
    assert marker not in json.dumps(result), (
        "No-follow protection must hold at the actual open operation."
    )
