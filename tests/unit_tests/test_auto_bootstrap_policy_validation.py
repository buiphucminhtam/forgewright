"""Execution-policy validation stays aligned with the canonical guard."""

from __future__ import annotations

import pytest

from tests.unit_tests import test_auto_bootstrap as baseline


bm = baseline.bm
fixture = baseline.fixture


VALID_POLICY = """\
mode: strict
require_verify: true
max_escalations: 3
refresh_interval_ticks: 10
deny_patterns:
  - "rm"
"""


@pytest.mark.parametrize(
    "content",
    [
        'require_verify: true\nmax_escalations: 3\nrefresh_interval_ticks: 10\ndeny_patterns:\n  - "rm"\n',
        VALID_POLICY.replace("mode: strict\n", "mode: strict\nmode: audit\n"),
        VALID_POLICY.replace("mode: strict", "mode: [unterminated"),
        VALID_POLICY.replace("require_verify: true", "require_verify: maybe"),
        VALID_POLICY.replace("mode: strict", "mode: enforce"),
        VALID_POLICY.replace('  - "rm"\n', ""),
        VALID_POLICY.replace('  - "rm"', '  - "["'),
    ],
    ids=[
        "missing_scalar",
        "duplicate_scalar",
        "malformed_line",
        "bad_boolean",
        "bad_mode",
        "no_deny_patterns",
        "bad_ere",
    ],
)
def test_existing_invalid_policy_blocks_bootstrap_without_rewriting(
    bm, fixture, content
):
    policy_path = fixture["project"] / ".forgewright/execution-policy.yaml"
    policy_path.parent.mkdir(exist_ok=True)
    raw = content.encode("utf-8")
    policy_path.write_bytes(raw)

    with pytest.raises(bm.BootstrapError, match="execution policy") as error:
        bm.ensure_policy_file(fixture["root"], fixture["project"])

    assert error.value.code == "execution_policy_invalid"
    assert policy_path.read_bytes() == raw


def test_verify_rejects_policy_corrupted_after_bootstrap(bm, fixture):
    bm.ensure(str(fixture["project"]), "automation")
    policy_path = fixture["project"] / ".forgewright/execution-policy.yaml"
    before = policy_path.read_bytes()
    policy_path.write_text("mode: [unterminated\n", encoding="utf-8")

    result = bm.verify(str(fixture["project"]))

    assert result["ok"] is False
    assert "execution_policy_invalid" in result["issues"]
    assert policy_path.read_bytes() != before


@pytest.mark.parametrize(
    "relative, content",
    [
        (".forgewright/project.json", b'{"schema_version":2}\n'),
        (
            ".forgewright/project-profile.json",
            b'{"schema_version":1,"facts":{"git_present":true}}\n',
        ),
    ],
)
def test_preserved_invalid_project_artifacts_degrade_without_rewriting(
    bm, fixture, relative, content
):
    path = fixture["project"] / relative
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(content)

    result = bm.ensure(str(fixture["project"]), "automation")

    assert result["status"] == "degraded"
    assert path.read_bytes() == content


def test_docs_semantic_validation_failure_is_a_readiness_issue(
    bm, fixture, monkeypatch
):
    bm.ensure(str(fixture["project"]), "automation")
    calls = []

    def fake_call(args, *, project, required, stage):
        calls.append((args, project, required, stage))
        return {"status": "degraded", "detail": "invalid docs state"}

    monkeypatch.setattr(bm, "call_forge", fake_call)

    issues = bm._readiness_issues(fixture["project"], validate_preserved_docs=True)

    assert "docs_assets_invalid" in issues
    assert calls == [
        (
            ["docs", "doctor", str(fixture["project"])],
            fixture["project"],
            False,
            "docs_validate",
        )
    ]
