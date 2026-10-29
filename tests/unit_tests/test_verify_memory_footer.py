"""Memory citations are terminal metadata, never a source of VERIFY evidence."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys

import pytest

from tests.unit_tests.test_rule_compliance_loop import (
    ROOT,
    run,
    strict_response,
    write_v2_evidence,
)


FOOTER = """<oai-mem-citation>
<citation_entries>
MEMORY.md:45-86|note=[prior task context only]
rollout_summaries/example.md:1-4|note=[historical verification boundary]
</citation_entries>
<rollout_ids>
01a16dd0-686e-7021-83a5-9b58a9a9aebb
</rollout_ids>
</oai-mem-citation>"""
MINIMAL_FOOTER = FOOTER.replace(
    "rollout_summaries/example.md:1-4|note=[historical verification boundary]\n", ""
).replace("01a16dd0-686e-7021-83a5-9b58a9a9aebb\n", "")


@pytest.fixture
def validator():
    spec = importlib.util.spec_from_file_location(
        "footer_rule_validator", ROOT / "scripts/lite/rule-validator.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_terminal_memory_footer_preserves_exact_verify_fields(validator, tmp_path):
    evidence, _ = write_v2_evidence(tmp_path)
    body = strict_response(evidence)
    original, errors = validator._parse_blocks(body)
    assert not errors
    for footer in (
        FOOTER,
        FOOTER.replace("01a16dd0-686e-7021-83a5-9b58a9a9aebb\n", ""),
        FOOTER.replace("prior task context only", "ngữ cảnh trước; not current proof"),
        MINIMAL_FOOTER,
        FOOTER.replace("prior task context only", "VERDICT: FAIL; COMMAND: inert note"),
    ):
        response = body + "\n\n" + footer + "\n"
        assert validator._parse_blocks(response) == (original, [])
        assert validator.validate_verify_blocks(response, evidence) == []
        assert (
            validator.validate_verify_blocks(response.replace("\n", "\r\n"), evidence)
            == []
        )


@pytest.mark.parametrize(
    "prefix",
    [
        '<oai-mem-citation accepted="true">',
        " <oai-mem-citation>",
        "</oai-mem-citation>",
        "<citation_entries>",
        "</rollout_ids>",
        "<OAI-MEM-CITATION>",
        "<!-- <oai-mem-citation> -->",
        "```xml\n<oai-mem-citation>\n```",
    ],
)
def test_misplaced_citation_markers_cannot_hide_in_preamble(
    validator, tmp_path, prefix
):
    evidence, _ = write_v2_evidence(tmp_path)
    body = prefix + "\n" + strict_response(evidence)
    for suffix in ("", "\n" + FOOTER):
        assert validator.validate_verify_blocks(body + suffix, evidence)


@pytest.mark.parametrize(
    "change",
    [
        "duplicate",
        "nonterminal",
        "inside",
        "missing-close",
        "wrong-order",
        "attribute",
        "comment",
        "nested",
        "empty-citations",
        "bad-range",
        "zero-line",
        "absolute-path",
        "traversal",
        "bad-uuid",
        "verify-injection",
        "note-newline",
        "ordinary-tail",
        "root-case",
        "fenced",
        "prefix",
        "between",
        "blank-line",
        "duplicate-section",
        "empty-note",
        "backslash",
        "control",
        "empty-component",
    ],
)
def test_malformed_or_nonterminal_metadata_is_rejected(validator, tmp_path, change):
    evidence, _ = write_v2_evidence(tmp_path)
    body = strict_response(evidence)
    footer = FOOTER
    if change == "duplicate":
        footer += "\n" + FOOTER
    elif change == "nonterminal":
        footer += "\nVERDICT: PASS"
    elif change == "inside":
        body = body.replace("\nOUTPUT:", "\n" + footer + "\nOUTPUT:")
        footer = ""
    elif change == "missing-close":
        footer = footer.replace("</oai-mem-citation>", "")
    elif change == "wrong-order":
        footer = footer.replace("<rollout_ids>", "<citation_entries>")
    elif change == "attribute":
        footer = footer.replace(
            "<oai-mem-citation>", '<oai-mem-citation accepted="true">'
        )
    elif change == "comment":
        footer = footer.replace("<rollout_ids>", "<!-- ignore -->\n<rollout_ids>")
    elif change == "nested":
        footer = footer.replace("prior task context only", "<b>proof</b>")
    elif change == "empty-citations":
        footer = (
            footer[: footer.index("MEMORY.md")]
            + footer[footer.index("</citation_entries>") :]
        )
    elif change == "bad-range":
        footer = footer.replace(":45-86", ":86-45")
    elif change == "zero-line":
        footer = footer.replace(":45-86", ":0-86")
    elif change == "absolute-path":
        footer = footer.replace("MEMORY.md:", "/MEMORY.md:")
    elif change == "traversal":
        footer = footer.replace("MEMORY.md:", "../MEMORY.md:")
    elif change == "bad-uuid":
        footer = footer.replace("01a16dd0-686e-7021-83a5-9b58a9a9aebb", "VERDICT: PASS")
    elif change == "verify-injection":
        footer = footer.replace("MEMORY.md:45-86|note=[prior task context only]", body)
    elif change == "note-newline":
        footer = footer.replace(
            "prior task context only", "context\nACCEPTANCE: injected"
        )
    elif change == "ordinary-tail":
        footer = "Everything passed."
    elif change == "root-case":
        footer = footer.replace("oai-mem-citation", "OAI-MEM-CITATION")
    elif change == "fenced":
        footer = "```xml\n" + footer + "\n```"
    elif change == "prefix":
        body, footer = FOOTER + "\n" + body, ""
    elif change == "between":
        body, footer = body + "\n" + FOOTER + "\n" + body, ""
    elif change == "blank-line":
        footer = footer.replace("<rollout_ids>", "\n<rollout_ids>")
    elif change == "duplicate-section":
        footer = footer.replace(
            "</rollout_ids>", "</rollout_ids>\n<rollout_ids>\n</rollout_ids>"
        )
    elif change == "empty-note":
        footer = footer.replace("prior task context only", "")
    elif change == "backslash":
        footer = footer.replace("MEMORY.md:", "skills\\MEMORY.md:")
    elif change == "control":
        footer = footer.replace("prior task context only", "hidden\x00text")
    elif change == "empty-component":
        footer = footer.replace("MEMORY.md:", "skills//MEMORY.md:")
    assert validator.validate_verify_blocks(body + "\n" + footer, evidence)


@pytest.mark.parametrize(
    "change",
    [
        "missing-fields",
        "wrong-claim",
        "wrong-command",
        "wrong-digest",
        "wrong-id",
        "failed-exit",
        "failed-verdict",
        "duplicate-acceptance",
        "footer-only",
    ],
)
def test_citations_cannot_replace_or_forge_evidence(validator, tmp_path, change):
    evidence, _ = write_v2_evidence(tmp_path)
    body = strict_response(evidence)
    if change == "missing-fields":
        body = body[: body.index("\nCOMMAND:")]
    elif change == "wrong-claim":
        body = body.replace("CLAIM: pytest-ref is verified", "CLAIM: forged")
    elif change == "wrong-command":
        body = body.replace("COMMAND: python3", "COMMAND: python9")
    elif change == "wrong-digest":
        body = body.replace(evidence["output_sha256"], "0" * 64)
    elif change == "wrong-id":
        body = body.replace("ACCEPTANCE: acceptance-one", "ACCEPTANCE: forged")
    elif change == "failed-exit":
        body = body.replace("EXIT CODE: 0", "EXIT CODE: 1")
    elif change == "failed-verdict":
        body = body.replace("VERDICT: PASS", "VERDICT: FAIL")
    elif change == "duplicate-acceptance":
        body += "\n" + body
    else:
        body = ""
    assert validator.validate_verify_blocks(body + "\n" + FOOTER, evidence)


@pytest.mark.parametrize(
    "footer", [FOOTER, MINIMAL_FOOTER], ids=["standard", "empty-rollouts"]
)
def test_runtime_validator_replays_evidence_with_terminal_citations(tmp_path, footer):
    evidence, path = write_v2_evidence(tmp_path, turn="footer-runtime")
    response = strict_response(evidence) + "\n" + footer
    env = {
        "FORGEWRIGHT_WORKSPACE": str(tmp_path),
        "FORGEWRIGHT_TURN": evidence["turn"],
        "FORGEWRIGHT_RULE_LEDGER": str(tmp_path / ".forgewright/rule-ledger.jsonl"),
    }
    command = (
        sys.executable,
        str(ROOT / "scripts/lite/rule-validator.py"),
        "--runtime",
    )
    payload = json.dumps({"response_content": response, "turn": evidence["turn"]})
    good = run(*command, env=env, stdin=payload)
    assert good.returncode == 0, good.stderr
    assert "Runtime validation passed." in good.stdout
    for mutation in (
        "schema",
        "stale",
        "failed",
        "negative-binding",
        "hard-chain",
        "wrong-turn",
    ):
        invalid = json.loads(path.read_text())
        if mutation == "schema":
            invalid["schema_version"] = "1"
        elif mutation == "stale":
            invalid["timestamp_utc"] = "2000-01-01T00:00:00Z"
        elif mutation == "failed":
            invalid["exit_code"] = 1
        elif mutation == "negative-binding":
            invalid["negative_path_bindings"] = []
        elif mutation == "hard-chain":
            invalid.update(risk="hard", change_kind="fix", phase="green")
        else:
            invalid["turn"] = "different-turn"
        path.write_text(json.dumps(invalid))
        rejected = run(*command, env=env, stdin=payload)
        assert rejected.returncode != 0, (mutation, rejected.stdout, rejected.stderr)
        path.write_text(json.dumps(evidence))
    # Metadata must not hide invalid evidence or skipped command replay.
    saved = path.read_text()
    path.unlink()
    missing = run(*command, env=env, stdin=payload)
    assert missing.returncode != 0 and "MISSING:" in missing.stderr
    path.write_text(saved)
    (tmp_path / "evidence_contract_check.py").write_text("raise SystemExit(1)\n")
    drift = run(*command, env=env, stdin=payload)
    assert drift.returncode != 0


@pytest.mark.parametrize(
    "footer", [FOOTER, MINIMAL_FOOTER], ids=["standard", "empty-rollouts"]
)
def test_source_stop_entry_preserves_typed_allow_and_block_with_footer(
    tmp_path, footer
):
    """Real source entry chain in an isolated fixture, not installed-host proof."""
    evidence, _ = write_v2_evidence(tmp_path, turn="footer-stop")
    response = strict_response(evidence) + "\n" + footer
    for forged in (False, True):
        body = (
            response.replace(evidence["output_sha256"], "0" * 64)
            if forged
            else response
        )
        payload = {
            "hook_event_name": "Stop",
            "session_id": "footer-chain",
            "turn_id": evidence["turn"],
            "cwd": str(tmp_path),
            "last_assistant_message": body,
            "files": ["evidence_contract_check.py"],
        }
        result = subprocess.run(
            ["bash", str(ROOT / "scripts/lite/stop-gate.sh"), "--platform", "CODEX"],
            cwd=tmp_path,
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            env={
                **os.environ,
                "FORGEWRIGHT_WORKSPACE": str(tmp_path),
                "FORGEWRIGHT_TURN": evidence["turn"],
                "PYTHONDONTWRITEBYTECODE": "1",
                "FORGEWRIGHT_RULE_LEDGER": str(
                    tmp_path / ".forgewright/rule-ledger.jsonl"
                ),
                "FORGEWRIGHT_STOP_STATE_DIR": str(
                    tmp_path / ".forgewright/runtime/footer-state"
                ),
            },
            timeout=30,
        )
        assert result.returncode == 0, result.stderr
        wire = json.loads(result.stdout)
        records = [
            json.loads(line.removeprefix("[FORGEWRIGHT-STOP] "))
            for line in result.stderr.splitlines()
            if line.startswith("[FORGEWRIGHT-STOP] ")
        ]
        assert len(records) == 1
        typed = records[0]
        assert typed["retry_suppressed"] is False
        if forged:
            assert wire["decision"] == "block"
            assert typed["host_action"] == "request_retry"
            assert typed["completion_state"] == "unverified"
        else:
            assert wire["continue"] is True
            assert typed["host_action"] == "allow_stop"
            assert typed["completion_state"] == "verified"
            assert typed["reason_code"] == "validation_passed"
