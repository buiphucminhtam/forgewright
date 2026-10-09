"""Regression tests for the Guardrail Protocol.

Validates that:
- guardrail.md exists and contains all 15 rule categories
- Decision matrix is complete
- All contradictions are fixed (no Vietnamese, fail-closed clarity)
- Kernel files reference guardrail
- Cross-references are wired correctly
"""

import os
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
import pytest


GUARDRAIL_PATH = "skills/_shared/protocols/guardrail.md"
ENTRY_PATH = "kernel/ENTRY.md"
SOLVE_PATH = "kernel/SOLVE.md"
AUDIT_PATH = "kernel/AUDIT.md"
ESCALATE_PATH = "kernel/ESCALATE.md"
SELF_CHECK_PATH = "skills/_shared/protocols/self-check.md"
SENSITIVE_PATH = "skills/_shared/protocols/sensitive-file-protection.md"
DRYRUN_PATH = "skills/_shared/protocols/dryrun-interceptor.md"


@pytest.fixture
def guardrail_content():
    with open(GUARDRAIL_PATH, "r") as f:
        return f.read()


# --- File existence ---
def test_guardrail_file_exists():
    assert os.path.exists(GUARDRAIL_PATH), "guardrail.md not found"


# --- Rule categories ---
def test_guardrail_has_destructive_file_ops(guardrail_content):
    assert "### 1. Destructive File Operations" in guardrail_content


def test_guardrail_has_sensitive_file_access(guardrail_content):
    assert "### 2. Sensitive File Access" in guardrail_content


def test_guardrail_has_remote_code_execution(guardrail_content):
    assert "### 3. Remote Code Execution" in guardrail_content


def test_guardrail_has_publishing_release(guardrail_content):
    assert "### 4. Publishing / Release" in guardrail_content


def test_guardrail_has_scope_enforcement(guardrail_content):
    assert "### 5. Scope Enforcement" in guardrail_content


def test_guardrail_has_dry_run_mode(guardrail_content):
    assert "### 6. Dry Run Mode" in guardrail_content


def test_guardrail_has_path_traversal(guardrail_content):
    assert "### 7. Path Traversal" in guardrail_content


def test_guardrail_has_symlink_safety(guardrail_content):
    assert "### 8. Symlink Safety" in guardrail_content


def test_guardrail_has_credential_content(guardrail_content):
    assert "### 9. Credential Content Detection" in guardrail_content


def test_guardrail_has_resource_exhaustion(guardrail_content):
    assert "### 10. Resource Exhaustion" in guardrail_content


def test_guardrail_has_env_persistence(guardrail_content):
    assert "### 11. Environment Persistence" in guardrail_content


def test_guardrail_has_network_exfiltration(guardrail_content):
    assert "### 12. Network Exfiltration" in guardrail_content


def test_guardrail_has_supply_chain(guardrail_content):
    assert "### 13. Supply Chain Safety" in guardrail_content


def test_guardrail_has_documentation_continuity(guardrail_content):
    content = guardrail_content.lower()
    assert "### 14. documentation continuity" in content
    assert "project-state" in content
    assert "forge docs gate" in content
    assert "generated html/css must never be hand-edited" in content


# --- Decision matrix is complete ---
def test_guardrail_decision_matrix_has_new_rows(guardrail_content):
    for rule in [
        "Path traversal",
        "Symlink targets",
        "Credential in content",
        "Resource exhaustion",
        "Env persistence",
        "Network exfiltration",
        "Supply chain",
        "Documentation continuity",
    ]:
        assert rule in guardrail_content, f"Decision matrix missing: {rule}"


# --- Contradictions fixed ---
def test_guardrail_no_vietnamese_text(guardrail_content):
    # Check for Vietnamese characters
    vietnamese_phrase = "Thực thi thành công"
    assert vietnamese_phrase not in guardrail_content, (
        "Vietnamese text should be replaced with English"
    )


def test_guardrail_fail_closed_for_security(guardrail_content):
    assert (
        "fail-closed" in guardrail_content.lower()
        or "DENY (fail-closed)" in guardrail_content
    ), "Guardrail must specify fail-closed for security rules"


def test_guardrail_read_ops_exception(guardrail_content):
    assert (
        "except" in guardrail_content.split("NOT applied")[1].split("\n")[0].lower()
    ), "Line 10 must note the exception for sensitive file reads"


# --- Kernel references ---
def test_guardrail_in_kernel_entry():
    with open(ENTRY_PATH, "r") as f:
        content = f.read()
    assert "guardrail" in content.lower(), "ENTRY.md must reference guardrail"


def test_guardrail_in_kernel_solve():
    with open(SOLVE_PATH, "r") as f:
        content = f.read()
    assert "guardrail" in content.lower(), "SOLVE.md must reference guardrail"


def test_guardrail_in_kernel_audit():
    with open(AUDIT_PATH, "r") as f:
        content = f.read()
    assert "guardrail" in content.lower(), "AUDIT.md must reference guardrail"


def test_guardrail_in_kernel_escalate():
    with open(ESCALATE_PATH, "r") as f:
        content = f.read()
    assert (
        "guardrail" in content.lower() or "Guardrail" in open(ESCALATE_PATH).read()
    ), "ESCALATE.md must reference guardrail"


# --- Cross-references ---
def test_guardrail_in_self_check():
    with open(SELF_CHECK_PATH, "r") as f:
        content = f.read()
    assert "Guardrail" in content or "guardrail" in content, (
        "self-check.md must reference guardrail"
    )


def test_sensitive_file_references_guardrail():
    with open(SENSITIVE_PATH, "r") as f:
        content = f.read()
    assert "Guardrail" in content or "guardrail" in content, (
        "sensitive-file-protection.md must reference guardrail"
    )


def test_no_forgenexus_in_dryrun():
    with open(DRYRUN_PATH, "r") as f:
        content = f.read()
    assert "ForgeNexus" not in content, (
        "dryrun-interceptor.md should use GitNexus, not ForgeNexus"
    )
    assert "GitNexus" in content, "dryrun-interceptor.md should reference GitNexus"


# --- Git credentials added to Rule 2 ---
def test_guardrail_has_git_credentials(guardrail_content):
    assert ".git/config" in guardrail_content, (
        "Rule 2 must include .git/config in sensitive file patterns"
    )
    assert ".git-credentials" in guardrail_content, (
        "Rule 2 must include .git-credentials in sensitive file patterns"
    )


def test_browser_admission_requires_ownership_capabilities_and_shared_budget(
    guardrail_content,
):
    """Browser opens cannot escape checks by being classified as read-only."""
    section = guardrail_content.split("### 15. Browser Tab Lifecycle", 1)[1]
    section = section.split("## Decision Matrix", 1)[0]
    for requirement in [
        "read-only exemption does not apply",
        "one reusable task-owned tab",
        "at most two live task-owned tabs",
        "parent owns the budget",
        "list, identify, and close",
        "pre-existing tabs",
        "unknown ownership",
        "popup",
        "HTTP/fetch",
        "bounded runner concurrency",
        "Page/Context handles",
        "headless mode alone does not permit",
    ]:
        assert requirement in section, (
            f"Missing browser admission requirement: {requirement}"
        )


def test_browser_cleanup_covers_failure_cancellation_and_host_limitations(
    guardrail_content,
):
    section = guardrail_content.split("### 15. Browser Tab Lifecycle", 1)[1]
    section = section.split("## Decision Matrix", 1)[0]
    for requirement in [
        "success, error, timeout, and cancellation",
        "finally",
        "confirm they are absent",
        "freeze further opens",
        "explicitly requested a persistent preview",
        "at most one retained tab",
        "open: 'never'",
        "headless",
        "does not install a host hook",
        "host crash",
    ]:
        assert requirement in section, (
            f"Missing browser cleanup requirement: {requirement}"
        )
    assert "browser tabs (rule 15)" in guardrail_content.lower()


def test_browser_guard_is_present_in_every_generated_agent_entry():
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    for path in ["kernel/SOLVE.md", "AGENTS.md", "CLAUDE.md", "GEMINI.md"]:
        content = (root / path).read_text(encoding="utf-8")
        for requirement in [
            "Browser: reuse 1, max 2 task-wide",
            "require tab IDs + close/list tools",
            "success/error/cancel",
            "Failure blocks opens",
            "guardrail Rule 15",
            "Headless uses bounded runners + owned teardown",
        ]:
            assert requirement in content, (
                f"{path} is missing browser guard: {requirement}"
            )


@pytest.fixture
def browser_kernel_project(tmp_path):
    """An isolated consumer of the real canonical kernel and generation CLI."""
    root = Path(__file__).resolve().parents[2]
    (tmp_path / "kernel").mkdir()
    for source in [
        "ENTRY.md",
        "SOLVE.md",
        "VERIFY.md",
        "ESCALATE.md",
        "CLARIFY.md",
        "POLICY.md",
        "rule-manifest.json",
    ]:
        shutil.copy2(root / "kernel" / source, tmp_path / "kernel" / source)
    scripts = tmp_path / "scripts/lite"
    scripts.mkdir(parents=True)
    shutil.copy2(root / "scripts/lite/sync-kernel.py", scripts / "sync-kernel.py")
    return tmp_path


def test_browser_kernel_runtime_hook_records_current_rule_digest(
    browser_kernel_project,
):
    """The real startup hook inventories the canonical rule, not stale memory."""
    root = Path(__file__).resolve().parents[2]
    project = browser_kernel_project
    result = subprocess.run(
        [
            sys.executable,
            str(root / "scripts/lite/rule-context-hook.py"),
            "--platform",
            "CODEX",
            "--event",
            "SessionStart",
        ],
        cwd=project,
        env={
            **os.environ,
            "FORGEWRIGHT_WORKSPACE": str(project),
            "FORGEWRIGHT_RULE_HOOK_MODE": "observe",
        },
        input="{}",
        text=True,
        capture_output=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    response = json.loads(result.stdout)
    assert "kernel-solve" in response["hookSpecificOutput"]["additionalContext"]
    receipts = list((project / ".forgewright/runtime/rule-context").rglob("*.json"))
    assert receipts, "Startup must retain a rule inventory receipt"
    receipt = json.loads(receipts[0].read_text())
    selected = next(row for row in receipt["selected"] if row["id"] == "kernel-solve")
    assert (
        selected["sha256"]
        == hashlib.sha256((project / "kernel/SOLVE.md").read_bytes()).hexdigest()
    )
    # The hook emits bounded excerpts; the generated entry provides the full rule.


def test_browser_kernel_e2e_generates_all_hosts_and_recovers_instruction_drift(
    browser_kernel_project,
):
    """Run real generation/check/recovery commands in a fresh consumer checkout."""
    project = browser_kernel_project
    command = [sys.executable, str(project / "scripts/lite/sync-kernel.py")]

    def invoke(*extra):
        return subprocess.run(
            [*command, *extra],
            cwd=project,
            text=True,
            capture_output=True,
            timeout=15,
        )

    assert invoke("--check").returncode == 1
    assert not (project / "AGENTS.md").exists(), (
        "Read-only check must not create entries"
    )
    generated = invoke()
    assert generated.returncode == 0, generated.stdout + generated.stderr
    for host in ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]:
        content = (project / host).read_text()
        assert "Browser: reuse 1, max 2 task-wide (interactive)" in content
        assert "Headless uses bounded runners + owned teardown" in content
        assert "guardrail Rule 15" in content
    assert invoke("--check").returncode == 0

    target = project / "AGENTS.md"
    good = target.read_bytes()
    drift = good.replace(b"max 2 task-wide", b"max 99 task-wide")
    assert drift != good
    target.write_bytes(drift)
    assert invoke("--check").returncode == 1
    assert target.read_bytes() == drift, "Check must report drift without rewriting it"
    assert invoke().returncode == 0
    assert target.read_bytes() == good
    assert invoke("--check").returncode == 0
