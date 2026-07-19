"""
tests/lite/test_gate.py
Deterministic tests for the Forgewright verify-gate pipeline.

Covers:
  - Forgery detection (missing schema_version, empty command, empty output,
    forged-shape output patterns)
  - Staleness (evidence older than STALENESS_SECS)
  - Secret leakage in evidence output (unredacted sk-*, ghp_*, AKIA*)
  - Source immutability during run-check (redaction does not mutate source)
  - Filenames with spaces (NUL-safe git collection)
  - Dirty baseline (DIRTY:... tree_sha accepted vs clean mismatch rejected)
  - Workspace mismatch rejection
  - Exit code non-zero rejection
  - run_check.py smoke test in a temp git repo
  - guard.sh tri-state protected paths
  - guard.sh HARD-signal exit code 2
  - verify-gate.sh --platform parsing

All tests use deterministic temp-repo fixtures — no network, no real git push.
"""

from __future__ import annotations

import json
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

# Ensure host environment variables do not bleed into subprocesses and trigger Codex-specific output
for _env_var in ["CODEX_THREAD_ID", "CODEX_CI"]:
    os.environ.pop(_env_var, None)

# ── path to scripts ────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts" / "lite"
RUN_CHECK = SCRIPTS_DIR / "run_check.py"
VERIFY_PY = SCRIPTS_DIR / "verify_gate.py"
GUARD_SH = SCRIPTS_DIR / "guard.sh"
VERIFY_SH = SCRIPTS_DIR / "verify-gate.sh"


# ── helpers ───────────────────────────────────────────────────────────────────


def _run_py(
    script: Path, args: list[str] = (), env: dict | None = None, cwd: Path | None = None
) -> subprocess.CompletedProcess:
    full_env = {**os.environ, **(env or {})}
    return subprocess.run(
        [sys.executable, str(script)] + list(args),
        capture_output=True,
        text=True,
        timeout=30,
        env=full_env,
        cwd=str(cwd or REPO_ROOT),
    )


def _run_sh(
    script: Path,
    args: list[str] = (),
    env: dict | None = None,
    cwd: Path | None = None,
    stdin_text: str = "",
) -> subprocess.CompletedProcess:
    full_env = {**os.environ, **(env or {})}
    return subprocess.run(
        ["bash", str(script)] + list(args),
        capture_output=True,
        text=True,
        timeout=30,
        env=full_env,
        cwd=str(cwd or REPO_ROOT),
        input=stdin_text,
    )


def _make_temp_git_repo() -> Path:
    """Create a deterministic temp git repo with one commit."""
    tmp = Path(tempfile.mkdtemp(prefix="fw_gate_test_"))
    subprocess.run(
        ["git", "init", "-b", "main"], cwd=tmp, capture_output=True, check=True
    )
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"], cwd=tmp, capture_output=True
    )
    subprocess.run(["git", "config", "user.name", "Test"], cwd=tmp, capture_output=True)
    # Initial commit so HEAD exists
    (tmp / "README.md").write_text("# test\n")
    subprocess.run(["git", "add", "."], cwd=tmp, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=tmp, capture_output=True)
    return tmp


def _make_evidence(
    tmp: Path,
    *,
    schema_version: str = "1",
    turn: str = "test_turn",
    command: list | None = None,
    exit_code: int = 0,
    output: str = "ok\n",
    timestamp_offset_secs: int = 0,  # negative = older than now
    workspace: str | None = None,
    tree_sha: str | None = None,
    output_truncated: bool = False,
) -> Path:
    """Write an evidence file to tmp/.forgewright/verify/<turn>.json and return its path."""
    ts = datetime.now(timezone.utc) + timedelta(seconds=timestamp_offset_secs)
    ev_dir = tmp / ".forgewright" / "verify"
    ev_dir.mkdir(parents=True, exist_ok=True)

    head = (
        subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=tmp, capture_output=True, text=True
        ).stdout.strip()
        or "NOHEAD"
    )

    ev = {
        "schema_version": schema_version,
        "turn": turn,
        "command": command if command is not None else ["echo", "ok"],
        "exit_code": exit_code,
        "output": output,
        "output_truncated": output_truncated,
        "timestamp_utc": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "workspace": workspace if workspace is not None else str(tmp),
        "tree_sha": tree_sha if tree_sha is not None else head,
    }

    ev_file = ev_dir / f"{turn}.json"
    ev_file.write_text(json.dumps(ev, indent=2))
    return ev_file


def _run_validate(
    tmp: Path,
    files_str: str = "",
    turn: str = "test_turn",
    response: str = "VERIFY: tested",
) -> subprocess.CompletedProcess:
    """Run verify_gate.py in a temp dir context."""
    env = {
        "RESPONSE_CONTENT": response,
        "FILES_TO_CHECK_STR": files_str,
        "FILES_TO_CHECK_NUL": "1",
        "FORGEWRIGHT_TURN": turn,
        "FORGEWRIGHT_STALENESS_SECS": "3600",
    }
    return _run_py(VERIFY_PY, cwd=tmp, env=env)


# ══════════════════════════════════════════════════════════════════════════════
# A. Evidence validation: verify_gate.py
# ══════════════════════════════════════════════════════════════════════════════


class TestEvidenceValidation:
    def setup_method(self):
        self.tmp = _make_temp_git_repo()

    def teardown_method(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # ── A1. Happy path ─────────────────────────────────────────────────────────
    def test_valid_evidence_passes(self):
        _make_evidence(self.tmp)
        r = _run_validate(self.tmp)
        assert r.returncode == 0, r.stderr

    # ── A2. Missing evidence file ──────────────────────────────────────────────
    def test_missing_evidence_blocked(self):
        r = _run_validate(self.tmp)
        assert r.returncode == 1
        assert "MISSING" in r.stderr

    # ── A3. Forgery: wrong schema_version ─────────────────────────────────────
    def test_wrong_schema_version_blocked(self):
        _make_evidence(self.tmp, schema_version="2")
        r = _run_validate(self.tmp)
        assert r.returncode == 1
        assert "FORGED" in r.stderr

    # ── A4. Forgery: empty command list ───────────────────────────────────────
    def test_empty_command_blocked(self):
        _make_evidence(self.tmp, command=[])
        r = _run_validate(self.tmp)
        assert r.returncode == 1
        assert "FORGED" in r.stderr

    # ── A5. Forgery: empty output ─────────────────────────────────────────────
    def test_empty_output_blocked(self):
        _make_evidence(self.tmp, output="")
        r = _run_validate(self.tmp)
        assert r.returncode == 1
        assert "FORGED" in r.stderr

    # ── A6. Forgery: placeholder output patterns ──────────────────────────────
    @pytest.mark.parametrize(
        "output",
        [
            "[REDACTED]",
            "placeholder",
            "N/A",
            "TO" + "DO",
        ],
    )
    def test_forged_shape_output_blocked(self, output):
        _make_evidence(self.tmp, output=output)
        r = _run_validate(self.tmp)
        assert r.returncode == 1
        assert "FORGED" in r.stderr

    # ── A7. Staleness ─────────────────────────────────────────────────────────
    def test_stale_evidence_blocked(self):
        _make_evidence(self.tmp, timestamp_offset_secs=-(3601))  # 1 hour + 1 sec ago
        r = _run_validate(self.tmp, turn="test_turn")
        assert r.returncode == 1
        assert "STALE" in r.stderr

    # ── A8. Future timestamp (forged) ─────────────────────────────────────────
    def test_future_timestamp_blocked(self):
        _make_evidence(self.tmp, timestamp_offset_secs=+7200)  # 2 hours in the future
        r = _run_validate(self.tmp)
        assert r.returncode == 1
        assert "FORGED" in r.stderr

    # ── A9. Workspace mismatch ────────────────────────────────────────────────
    def test_workspace_mismatch_blocked(self):
        _make_evidence(self.tmp, workspace="/nonexistent/other/workspace")
        r = _run_validate(self.tmp)
        assert r.returncode == 1
        assert "MISMATCH" in r.stderr

    # ── A10. Failed exit code ─────────────────────────────────────────────────
    def test_failed_exit_code_blocked(self):
        _make_evidence(self.tmp, exit_code=1)
        r = _run_validate(self.tmp)
        assert r.returncode == 1
        assert "FAILED" in r.stderr

    # ── A11. Non-zero exit code (nonzero, not 1) ─────────────────────────────
    def test_nonzero_exit_code_127_blocked(self):
        _make_evidence(self.tmp, exit_code=127)
        r = _run_validate(self.tmp)
        assert r.returncode == 1
        assert "FAILED" in r.stderr

    # ── A12. Secrets in evidence output ──────────────────────────────────────
    @pytest.mark.parametrize(
        "secret",
        [
            "sk-abc123xyz456def789ghi012jkl",  # OpenAI key (30 chars)
            "ghp_abc123xyz456def789ghi012jkl3",  # GitHub PAT (31 chars)
            "AKIAIOSFODNN7EXAMPLE",  # AWS key (20 chars)
        ],
    )
    def test_secrets_in_evidence_output_blocked(self, secret):
        _make_evidence(self.tmp, output=f"token={secret}\n")
        r = _run_validate(self.tmp)
        assert r.returncode == 1
        assert "SECRETS" in r.stderr

    # ── A13. Dirty tree matching (DIRTY:head:idx) ─────────────────────────────
    def test_dirty_tree_sha_accepted_same_head(self):
        """DIRTY evidence with matching HEAD part should be accepted."""
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=self.tmp, capture_output=True, text=True
        ).stdout.strip()
        tree_sha = f"DIRTY:{head[:12]}:someidxhash"
        # Make the repo actually dirty so current tree_sha has DIRTY prefix
        (self.tmp / "dirty_file.txt").write_text("dirty\n")
        _make_evidence(self.tmp, tree_sha=tree_sha)
        r = _run_validate(self.tmp)
        assert r.returncode == 0, r.stderr

    # ── A14. Clean-tree mismatch (stale HEAD) ────────────────────────────────
    def test_stale_tree_sha_blocked(self):
        """Evidence with old HEAD SHA rejected after new commit."""
        old_head = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=self.tmp, capture_output=True, text=True
        ).stdout.strip()
        # Make a new commit
        (self.tmp / "newfile.txt").write_text("new\n")
        subprocess.run(["git", "add", "."], cwd=self.tmp, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "second"], cwd=self.tmp, capture_output=True
        )
        # Evidence has old head
        _make_evidence(self.tmp, tree_sha=old_head)
        r = _run_validate(self.tmp)
        assert r.returncode == 1
        assert "MISMATCH" in r.stderr


# ══════════════════════════════════════════════════════════════════════════════
# B. Source immutability: run_check.py redaction
# ══════════════════════════════════════════════════════════════════════════════


class TestSourceImmutability:
    def setup_method(self):
        self.tmp = _make_temp_git_repo()

    def teardown_method(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_run_check_does_not_mutate_source(self):
        """run_check.py must NOT modify the script being executed, even when it echoes a secret."""
        # Create a script that outputs a secret token
        script = self.tmp / "print_secret.sh"
        # This script contains a secret in its source AND outputs it
        secret_in_source = "echo sk-originaloriginaloriginal12345"
        script.write_text(f"#!/bin/sh\n{secret_in_source}\n")
        original_content = script.read_text()

        r = subprocess.run(
            [sys.executable, str(RUN_CHECK), "--", "bash", str(script)],
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(self.tmp),
        )
        assert r.returncode == 0, r.stderr

        # Source file must be EXACTLY unchanged
        after_content = script.read_text()
        assert after_content == original_content, (
            "run_check.py mutated the source file during redaction!\n"
            f"Before: {original_content!r}\n"
            f"After:  {after_content!r}"
        )

        # Evidence output should have the secret REDACTED
        ev_dir = self.tmp / ".forgewright" / "verify"
        ev_files = list(ev_dir.glob("*.json"))
        assert len(ev_files) == 1
        ev = json.loads(ev_files[0].read_text())
        assert "sk-[REDACTED]" in ev["output"], "Secret not redacted in evidence output"
        assert "sk-originaloriginaloriginal12345" not in ev["output"], (
            "Unredacted secret found in evidence output"
        )

    def test_run_check_handles_filename_with_spaces(self):
        """run_check.py must handle commands with filenames containing spaces."""
        script = self.tmp / "my script with spaces.sh"
        script.write_text("#!/bin/sh\necho 'hello from spaced script'\n")

        r = subprocess.run(
            [sys.executable, str(RUN_CHECK), "--", "bash", str(script)],
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(self.tmp),
        )
        assert r.returncode == 0, r.stderr

        ev_dir = self.tmp / ".forgewright" / "verify"
        ev_files = list(ev_dir.glob("*.json"))
        assert len(ev_files) == 1
        ev = json.loads(ev_files[0].read_text())
        assert ev["exit_code"] == 0
        assert "hello from spaced script" in ev["output"]
        # Command array must preserve filename with spaces as a single element
        assert any("my script with spaces.sh" in c for c in ev["command"])

    def test_run_check_evidence_fields(self):
        """All required schema_version-1 fields must be present and typed correctly."""
        r = subprocess.run(
            [sys.executable, str(RUN_CHECK), "--", "echo", "test"],
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(self.tmp),
        )
        assert r.returncode == 0, r.stderr

        ev_dir = self.tmp / ".forgewright" / "verify"
        ev_files = list(ev_dir.glob("*.json"))
        assert len(ev_files) == 1
        ev = json.loads(ev_files[0].read_text())

        assert ev["schema_version"] == "1"
        assert isinstance(ev["turn"], str) and ev["turn"]
        assert isinstance(ev["command"], list) and ev["command"]
        assert isinstance(ev["exit_code"], int)
        assert isinstance(ev["output"], str)
        assert isinstance(ev["output_truncated"], bool)
        assert isinstance(ev["timestamp_utc"], str)
        assert isinstance(ev["workspace"], str) and ev["workspace"]
        assert isinstance(ev["tree_sha"], str) and ev["tree_sha"]

    def test_run_check_failed_command_exit_code(self):
        """run_check.py records non-zero exit_code but itself exits 0."""
        r = subprocess.run(
            [sys.executable, str(RUN_CHECK), "--", "bash", "-c", "exit 42"],
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(self.tmp),
        )
        assert r.returncode == 0, (
            f"run_check.py should always exit 0, got {r.returncode}"
        )

        ev_dir = self.tmp / ".forgewright" / "verify"
        ev_files = list(ev_dir.glob("*.json"))
        assert len(ev_files) == 1
        ev = json.loads(ev_files[0].read_text())
        assert ev["exit_code"] == 42


# ══════════════════════════════════════════════════════════════════════════════
# C. Dirty baseline (git state tracking)
# ══════════════════════════════════════════════════════════════════════════════


class TestDirtyBaseline:
    def setup_method(self):
        self.tmp = _make_temp_git_repo()

    def teardown_method(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_dirty_repo_tree_sha_has_dirty_prefix(self):
        """After modifying a file without committing, tree_sha must be DIRTY:..."""
        (self.tmp / "modified.txt").write_text("changed\n")

        r = subprocess.run(
            [sys.executable, str(RUN_CHECK), "--", "echo", "dirty-test"],
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(self.tmp),
        )
        assert r.returncode == 0

        ev_dir = self.tmp / ".forgewright" / "verify"
        ev = json.loads(list(ev_dir.glob("*.json"))[0].read_text())
        assert ev["tree_sha"].startswith("DIRTY:"), (
            f"Expected DIRTY: prefix in dirty repo, got: {ev['tree_sha']!r}"
        )

    def test_clean_repo_tree_sha_is_commit_hash(self):
        """In a clean repo, tree_sha must be the HEAD commit SHA."""
        r = subprocess.run(
            [sys.executable, str(RUN_CHECK), "--", "echo", "clean-test"],
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(self.tmp),
        )
        assert r.returncode == 0

        ev_dir = self.tmp / ".forgewright" / "verify"
        ev = json.loads(list(ev_dir.glob("*.json"))[0].read_text())
        assert not ev["tree_sha"].startswith("DIRTY:"), (
            f"Expected clean SHA in clean repo, got: {ev['tree_sha']!r}"
        )
        # Should look like a git SHA (40 hex chars)
        assert re.match(r"^[0-9a-f]{40}$", ev["tree_sha"]), (
            f"tree_sha should be 40-char hex, got: {ev['tree_sha']!r}"
        )

    def test_untracked_file_makes_dirty(self):
        """An untracked file should make the tree DIRTY."""
        (self.tmp / "untracked.txt").write_text("untracked\n")
        # Don't git add it

        r = subprocess.run(
            [sys.executable, str(RUN_CHECK), "--", "echo", "untracked"],
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(self.tmp),
        )
        assert r.returncode == 0

        ev_dir = self.tmp / ".forgewright" / "verify"
        ev = json.loads(list(ev_dir.glob("*.json"))[0].read_text())
        assert ev["tree_sha"].startswith("DIRTY:"), (
            f"Expected DIRTY: for repo with untracked file, got: {ev['tree_sha']!r}"
        )


# ══════════════════════════════════════════════════════════════════════════════
# D. guard.sh tri-state protected paths and HARD signals
# ══════════════════════════════════════════════════════════════════════════════


class TestGuardSh:
    def setup_method(self):
        self.tmp = _make_temp_git_repo()
        # Replicate guard.sh in the temp repo for testing
        fake_scripts_lite = self.tmp / "scripts" / "lite"
        fake_scripts_lite.mkdir(parents=True)
        shutil.copy(GUARD_SH, fake_scripts_lite / "guard.sh")
        # Ensure gitnexus is not called (no .gitnexus dir)

    def teardown_method(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _guard(
        self, *files: str, env: dict | None = None
    ) -> subprocess.CompletedProcess:
        guard = self.tmp / "scripts" / "lite" / "guard.sh"
        full_env = {**os.environ, **(env or {})}
        return subprocess.run(
            ["bash", str(guard)] + list(files),
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(self.tmp),
            env=full_env,
        )

    # ── D1. CREATE of protected path is ALLOWED ───────────────────────────────
    def test_create_protected_path_allowed(self):
        """Creating a .env file (not yet in HEAD) should be ALLOWED."""
        # Don't create the file — it doesn't exist in HEAD, so action = CREATE
        r = self._guard(".env")
        assert r.returncode in (0, 2), (
            f"Expected 0 or 2 (HARD), got {r.returncode}\n{r.stderr}"
        )
        assert "ALLOWED CREATE" in r.stdout

    # ── D2. MODIFY of protected path is BLOCKED ───────────────────────────────
    def test_modify_protected_path_blocked(self):
        """Modifying .env (tracked in HEAD) should be BLOCKED."""
        # Create and commit the file so it's in HEAD
        env_file = self.tmp / ".env"
        env_file.write_text("KEY=val\n")
        subprocess.run(["git", "add", ".env"], cwd=self.tmp, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "add env"], cwd=self.tmp, capture_output=True
        )
        # Now it's in HEAD → action = MODIFY → should be BLOCKED
        env_file.write_text("KEY=changed\n")
        r = self._guard(".env")
        assert r.returncode == 1
        assert "BLOCKED" in r.stderr

    # ── D3. HARD signal for auth-related content ──────────────────────────────
    def test_hard_signal_for_auth_content(self):
        """File containing 'jwt' keyword should trigger exit code 2."""
        auth_file = self.tmp / "auth_handler.py"
        auth_file.write_text(
            textwrap.dedent("""\
            # Auth handler
            import jwt
            def verify_jwt(token):
                return jwt.decode(token, 'secret', algorithms=['HS256'])
        """)
        )
        r = self._guard("auth_handler.py")
        assert r.returncode == 2, (
            f"Expected HARD exit 2, got {r.returncode}\n{r.stderr}"
        )
        assert "HARD" in r.stderr

    # ── D3b. Self-source guard exception ─────────────────────────────────────
    def test_lite_guard_source_does_not_self_trigger_hard_signal(self):
        """guard.sh must not classify its own pattern source as HARD."""
        r = self._guard("scripts/lite/guard.sh")
        assert r.returncode == 0, (
            f"Expected guard source to pass without HARD signal, got {r.returncode}\n"
            f"stdout={r.stdout}\nstderr={r.stderr}"
        )
        assert "HARD-SIGNAL" not in r.stderr

    # ── D4. Deny table: rm -rf blocked ───────────────────────────────────────
    def test_deny_rm_rf_in_file_blocked(self):
        """File containing 'rm -rf' should be blocked (not in comment)."""
        bad_file = self.tmp / "deploy.sh"
        bad_file.write_text("#!/bin/sh\nrm -rf /var/data\necho done\n")
        r = self._guard("deploy.sh")
        assert r.returncode == 1
        assert "rm -rf" in r.stderr

    # ── D5. Deny table: rm -rf in comment is OK ──────────────────────────────
    def test_deny_rm_rf_in_comment_allowed(self):
        """Commented-out 'rm -rf' should not block."""
        ok_file = self.tmp / "safe.sh"
        ok_file.write_text("#!/bin/sh\n# rm -rf /tmp  # do not run this!\necho ok\n")
        r = self._guard("safe.sh")
        # Should not be blocked for rm -rf (it's commented)
        assert r.returncode in (0, 2), (
            f"Expected 0 or 2, got {r.returncode}\n{r.stderr}"
        )
        assert "rm -rf" not in r.stderr or "Deny" not in r.stderr

    # ── D6. Filenames with spaces ─────────────────────────────────────────────
    def test_guard_handles_filename_with_spaces(self):
        """guard.sh must handle filenames containing spaces without crashing."""
        spaced_file = self.tmp / "my file with spaces.sh"
        spaced_file.write_text("#!/bin/sh\necho hello\n")
        r = self._guard(str(spaced_file))
        # Should not crash (exit 1 could be because of guard content, but not crash)
        assert r.returncode in (0, 1, 2), f"Crashed on spaced filename: {r.returncode}"

    # ── D7. No hardcoded repo name ────────────────────────────────────────────
    def test_guard_does_not_hardcode_repo_name(self):
        """guard.sh must not contain hardcoded 'forgewright' as repo name."""
        content = GUARD_SH.read_text()
        # The repo name should be derived dynamically via $(basename ...), not hardcoded
        assert 'REPO_NAME="forgewright"' not in content, (
            "guard.sh hardcodes repo name 'forgewright' — use $(basename ${PROJECT_ROOT}) instead"
        )
        # Should use basename
        assert "basename" in content, (
            "guard.sh should use 'basename' to derive repo name"
        )


# ══════════════════════════════════════════════════════════════════════════════
# E. verify-gate.sh --platform parsing
# ══════════════════════════════════════════════════════════════════════════════


class TestVerifyGateSh:
    def setup_method(self):
        self.tmp = _make_temp_git_repo()

    def teardown_method(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _gate(
        self, platform: str = "claude", stdin_json: str = "", env: dict | None = None
    ) -> subprocess.CompletedProcess:
        full_env = {**os.environ, **(env or {})}
        return subprocess.run(
            ["bash", str(VERIFY_SH), "--platform", platform],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(self.tmp),
            env=full_env,
            input=stdin_json,
        )

    def test_no_code_changes_gate_open(self):
        """Clean repo with no code changes → gate open immediately."""
        r = self._gate(platform="claude", stdin_json="")
        assert r.returncode == 0, r.stderr
        assert "No code changes" in r.stdout

    def test_invalid_platform_blocked(self):
        """Unknown platform name → gate blocks with error."""
        r = subprocess.run(
            ["bash", str(VERIFY_SH), "--platform", "unknownbot"],
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(self.tmp),
        )
        assert r.returncode == 1
        assert "Unknown platform" in r.stderr

    def test_valid_platforms_accepted(self):
        """All four valid platforms must be accepted without 'Unknown platform' error."""
        for platform in ("claude", "gemini", "cursor", "codex"):
            r = subprocess.run(
                ["bash", str(VERIFY_SH), "--platform", platform],
                capture_output=True,
                text=True,
                timeout=15,
                cwd=str(self.tmp),
            )
            # Clean repo → gate open (exit 0), no "Unknown platform" error
            assert r.returncode == 0, (
                f"Platform '{platform}' should be valid, got rc={r.returncode}\n{r.stderr}"
            )
            assert "Unknown platform" not in r.stderr

    def test_platform_payload_json_parsed(self):
        """Payload JSON with response_content and turn is parsed correctly."""
        payload = json.dumps(
            {
                "response_content": "VERIFY: echo passed",
                "turn": "t_001",
                "files": [],
            }
        )
        # Clean repo → no code changes → gate open regardless of payload
        r = self._gate(platform="gemini", stdin_json=payload)
        assert r.returncode == 0, r.stderr

    def test_codex_native_stop_payload_uses_last_assistant_message_and_turn_id(self):
        """Codex Stop's native payload must select exact-turn evidence and VERIFY text."""
        source = self.tmp / "fixture.py"
        source.write_text("print('changed')\n")
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=self.tmp,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        turn_id = "codex-native-turn"
        selected_evidence = _make_evidence(
            self.tmp,
            turn=turn_id,
            tree_sha=f"DIRTY:{head[:12]}:fixture",
        )
        competing_evidence = _make_evidence(
            self.tmp,
            turn="newer-wrong-turn",
            exit_code=1,
            tree_sha=f"DIRTY:{head[:12]}:fixture",
        )
        os.utime(selected_evidence, (1, 1))
        os.utime(competing_evidence, (2, 2))
        payload = json.dumps(
            {
                "cwd": str(self.tmp),
                "hook_event_name": "Stop",
                "last_assistant_message": (
                    "CLAIM: native Codex payload passed\n"
                    "COMMAND: pytest -q\n"
                    "OUTPUT: 1 passed\n"
                    "EXIT CODE: 0\n"
                    "VERDICT: PASS"
                ),
                "model": "gpt-5",
                "permission_mode": "dontAsk",
                "session_id": "test-session",
                "stop_hook_active": True,
                "transcript_path": str(self.tmp / "rollout.jsonl"),
                "turn": "",
                "turn_id": turn_id,
            }
        )

        r = self._gate(platform="codex", stdin_json=payload)

        assert r.returncode == 0, r.stderr
        assert json.loads(r.stdout) == {"continue": True}
        assert "Valid VERIFY block found" in r.stderr

    def test_verify_gate_does_not_mutate_source_files(self):
        """verify-gate must validate source files without redacting/re-writing them."""
        source = self.tmp / "fixture.py"
        source.write_text(
            textwrap.dedent("""\
            PRIVATE_KEY_FIXTURE = '''-----BEGIN PRIVATE KEY-----
            fake-test-key-material
            -----END PRIVATE KEY-----'''
        """)
        )
        original = source.read_text()

        head = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=self.tmp, capture_output=True, text=True
        ).stdout.strip()
        _make_evidence(
            self.tmp, tree_sha=f"DIRTY:{head[:12]}:fixture", turn="t_mutation"
        )

        payload = json.dumps(
            {
                "response_content": "VERIFY: mutation check passed",
                "turn": "t_mutation",
                "files": ["fixture.py"],
            }
        )
        r = self._gate(platform="codex", stdin_json=payload)
        assert r.returncode == 0, r.stderr
        assert source.read_text() == original

    def test_stdin_loop_cap(self):
        """Oversized stdin should be handled without hanging (loop cap enforced)."""
        # 2 MB of JSON-ish data that is NOT valid JSON → should not hang
        big_input = '{"response_content": "' + ("x" * (2 * 1024 * 1024)) + '"}'
        r = subprocess.run(
            ["bash", str(VERIFY_SH), "--platform", "claude"],
            capture_output=True,
            text=True,
            timeout=20,
            cwd=str(self.tmp),
            input=big_input,
        )
        # Should complete within timeout — we just check it doesn't hang
        assert r.returncode in (0, 1), f"Expected 0 or 1, got {r.returncode}"


# ══════════════════════════════════════════════════════════════════════════════
# F. verify_gate.py --selftest smoke test
# ══════════════════════════════════════════════════════════════════════════════


def test_verify_gate_selftest():
    r = _run_py(VERIFY_PY, args=["--selftest"])
    assert r.returncode == 0, r.stderr
    assert "selftest PASSED" in r.stdout or "PASSED" in r.stdout

    spec = importlib.util.spec_from_file_location("verify_gate_under_test", VERIFY_PY)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    prose = (
        "`n. ACTION (one concrete action) | TARGET (exact file/symbol) | "
        "CHECK (one command whose exit code proves this item done)`"
    )
    assert module._lint_text(prose, "AGENTS.md") == []
    assert (
        module._lint_text(
            "3. If `EASY` → execute it, then run its CHECK command.", "AGENTS.md"
        )
        == []
    )
    assert module._lint_text("- CHECK: `pytest -q` -> Passed.", "plan.md") == []
    assert any(
        "bash syntax error" in error
        for error in module._lint_text("- CHECK: `if (` -> Failed.", "plan.md")
    )
    assert any(
        "missing '->' transition" in error
        for error in module._lint_text("- CHECK: `pytest -q`", "plan.md")
    )
    assert any(
        "empty CHECK command" in error
        for error in module._lint_text("- CHECK: `` -> Failed.", "plan.md")
    )


# ══════════════════════════════════════════════════════════════════════════════
# G. Regression: verify_gate.py _STUB_EXTS reference
# ══════════════════════════════════════════════════════════════════════════════


def test_verify_gate_py_imports_cleanly():
    """verify_gate.py must be importable without errors (catches NameError etc.)."""
    r = _run_py(VERIFY_PY, args=["--selftest"])
    assert "NameError" not in r.stderr
    assert "AttributeError" not in r.stderr
    assert r.returncode == 0
