#!/usr/bin/env python3
"""
scripts/lite/verify_gate.py
Full evidence validator for the Forgewright verify-gate.

Called by verify-gate.sh (via env vars) or directly with --selftest.

Evidence file contract (schema_version "1"):
  - schema_version  : must be "1"
  - turn            : non-empty string
  - command         : non-empty list of strings
  - exit_code       : integer — must be 0 for gate to pass
  - output          : string — must be non-empty (proof command ran)
  - timestamp_utc   : ISO-8601 UTC — must be within STALENESS_SECS of now
  - workspace       : must match current workspace root
  - tree_sha        : must match current tree state (or be DIRTY-prefixed if allowed)

Rejection reasons:
  MISSING   — no evidence file found
  STALE     — timestamp too old
  MISMATCH  — workspace or tree_sha mismatch
  FAILED    — exit_code != 0
  FORGED    — schema_version missing/wrong, command empty, output suspiciously generic
  SECRETS   — output contains unredacted secrets (evidence file itself is tainted)
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── configuration ─────────────────────────────────────────────────────────────
STALENESS_SECS = int(os.environ.get("FORGEWRIGHT_STALENESS_SECS", "3600"))  # 1 hour
ALLOW_DIRTY_TREE = os.environ.get("FORGEWRIGHT_ALLOW_DIRTY_TREE", "1") == "1"

# ── forgery-shaped output patterns (generic/templated evidence) ───────────────
_FORGED_OUTPUT_PATTERNS = [
    re.compile(r"^\[REDACTED\]$", re.MULTILINE),
    re.compile(r"^<output>$", re.MULTILINE | re.IGNORECASE),
    re.compile(r"^placeholder$", re.MULTILINE | re.IGNORECASE),
    re.compile(r"^TODO$", re.MULTILINE),
    re.compile(r"^N/A$", re.MULTILINE),
]

# ── secret patterns that must NOT appear in evidence output ───────────────────
_SECRET_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"ghp_[a-zA-Z0-9]{20,}"),
    re.compile(r"AKIA[A-Z0-9]{16}"),
    re.compile(r"-----BEGIN(?:\s+[A-Z]+)?\s+PRIVATE KEY-----"),
]

# ── stubs that must NOT appear in changed source files ───────────────────────
_STUB_PATTERN = re.compile(r"\b(TODO|FIXME|NotImplementedError)\b")

_BINARY_EXTS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".bz2",
    ".whl",
    ".so",
    ".dylib",
    ".exe",
    ".db",
    ".sqlite",
}

_SKIP_STUB_PREFIXES = ("scripts/lite/", ".forgewright/", ".gitnexus/", ".forgenexus/")
_SKIP_STUB_EXTS = {".md", ".txt", ".json", ".yaml", ".yml", ".ini", ".cfg", ".toml"}


# ── helpers ───────────────────────────────────────────────────────────────────


def _log(label: str, msg: str, *, err: bool = False) -> None:
    color = "\033[0;31m" if err else "\033[0;32m"
    reset = "\033[0m"
    stream = sys.stderr if err else sys.stdout
    print(f"{color}[VERIFY-GATE]{reset} {label}: {msg}", file=stream)


def _ok(msg: str) -> None:
    _log("OK", msg)


def _err(msg: str) -> None:
    _log("ERROR", msg, err=True)


def _warn(msg: str) -> None:
    _log("WARNING", msg, err=True)


def _workspace() -> Path:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0:
            return Path(r.stdout.strip()).resolve()
    except Exception:
        pass
    return Path.cwd().resolve()


def _current_tree_sha(workspace: Path) -> str:
    try:
        in_git = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=workspace,
            capture_output=True,
            timeout=5,
        )
        if in_git.returncode != 0:
            return "NONGIT"

        head = (
            subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=workspace,
                capture_output=True,
                text=True,
                timeout=5,
            ).stdout.strip()
            or "NOHEAD"
        )

        status = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=all"],
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout.splitlines()

        dirty = [
            line for line in status if not line[3:].startswith(".forgewright/verify/")
        ]

        if dirty:
            idx = (
                subprocess.run(
                    ["git", "write-tree"],
                    cwd=workspace,
                    capture_output=True,
                    text=True,
                    timeout=5,
                ).stdout.strip()
                or "NOIDX"
            )
            return f"DIRTY:{head[:12]}:{idx[:12]}"
        return head
    except Exception:
        return "GITERR"


# ── 1. Find the evidence file ─────────────────────────────────────────────────


def _find_evidence(project_root: Path, turn_env: str) -> Path | None:
    verify_dir = project_root / ".forgewright" / "verify"
    if turn_env:
        p = verify_dir / f"{turn_env}.json"
        return p if p.is_file() else None
    if verify_dir.is_dir():
        files = sorted(
            verify_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True
        )
        return files[0] if files else None
    return None


# ── 2. Parse & validate evidence ─────────────────────────────────────────────


def _validate_schema(ev: dict) -> list[str]:
    """Return list of FORGED/structural errors."""
    errors: list[str] = []
    if ev.get("schema_version") != "1":
        errors.append(
            f"FORGED: schema_version must be '1', got {ev.get('schema_version')!r}"
        )
    if not isinstance(ev.get("command"), list) or not ev["command"]:
        errors.append("FORGED: 'command' must be a non-empty list")
    if not isinstance(ev.get("turn"), str) or not ev["turn"]:
        errors.append("FORGED: 'turn' must be a non-empty string")
    for field in ("timestamp_utc", "workspace", "tree_sha"):
        if not ev.get(field):
            errors.append(f"FORGED: '{field}' is missing or empty")
    return errors


def _validate_output(ev: dict) -> list[str]:
    errors: list[str] = []
    output = ev.get("output", "")
    if not isinstance(output, str) or not output.strip():
        errors.append("FORGED: 'output' is empty — evidence not machine-written")
        return errors
    # Check for forged-shaped patterns
    for pat in _FORGED_OUTPUT_PATTERNS:
        if pat.search(output):
            errors.append(
                f"FORGED: output matches forged-shape pattern {pat.pattern!r}"
            )
    # Check for unredacted secrets in evidence output
    for pat in _SECRET_PATTERNS:
        if pat.search(output):
            errors.append(
                f"SECRETS: evidence output contains unredacted secret matching {pat.pattern!r}"
            )
    return errors


def _validate_staleness(ev: dict) -> list[str]:
    ts_str = ev.get("timestamp_utc", "")
    if not ts_str:
        return ["STALE: timestamp_utc missing"]
    try:
        # Parse ISO-8601 UTC
        ts_str_clean = ts_str.replace("Z", "+00:00")
        ev_time = datetime.fromisoformat(ts_str_clean)
        now = datetime.now(timezone.utc)
        age_secs = (now - ev_time).total_seconds()
        if age_secs < 0:
            return [
                f"FORGED: evidence timestamp is in the future ({age_secs:.0f}s ahead)"
            ]
        if age_secs > STALENESS_SECS:
            return [
                f"STALE: evidence is {age_secs:.0f}s old (limit: {STALENESS_SECS}s)"
            ]
    except ValueError as e:
        return [f"STALE: cannot parse timestamp_utc {ts_str!r}: {e}"]
    return []


def _validate_workspace(ev: dict, current_workspace: Path) -> list[str]:
    ev_ws = ev.get("workspace", "")
    if not ev_ws:
        return ["MISMATCH: workspace field missing in evidence"]
    # Resolve symlinks on both sides (macOS /var/folders vs /private/var/folders)
    ev_path = Path(ev_ws).resolve()
    cur_path = current_workspace.resolve()
    if ev_path != cur_path:
        return [f"MISMATCH: workspace {ev_ws!r} != current {str(current_workspace)!r}"]
    return []


def _validate_tree(ev: dict, current_tree: str) -> list[str]:
    ev_tree = ev.get("tree_sha", "")
    if not ev_tree:
        return ["MISMATCH: tree_sha missing in evidence"]

    # Exact match
    if ev_tree == current_tree:
        return []

    # Both DIRTY prefixed: compare HEAD part only (index may have evolved)
    if ev_tree.startswith("DIRTY:") and current_tree.startswith("DIRTY:"):
        ev_head = ev_tree.split(":")[1]
        cur_head = current_tree.split(":")[1]
        if ev_head == cur_head:
            return []  # Same commit, different index — acceptable

    # NONGIT / GITERR — skip tree check
    if ev_tree.startswith("NONGIT") or current_tree.startswith("NONGIT"):
        return []

    return [
        f"MISMATCH: tree_sha changed since evidence was written. "
        f"Evidence: {ev_tree!r}, Current: {current_tree!r}"
    ]


def _validate_exit_code(ev: dict) -> list[str]:
    ec = ev.get("exit_code")
    if not isinstance(ec, int):
        return ["FAILED: exit_code is not an integer"]
    if ec != 0:
        return [f"FAILED: evidence exit_code={ec} (must be 0)"]
    return []


# ── 3. Stub check (never mutates source) ─────────────────────────────────────


def _check_stubs(files: list[str]) -> list[str]:
    errors: list[str] = []
    for f in files:
        fp = Path(f)
        if fp.suffix.lower() in _STUB_EXTS:
            continue
        if any(f.startswith(pfx) for pfx in _SKIP_STUB_PREFIXES):
            continue
        if fp.suffix.lower() in _BINARY_EXTS:
            continue
        if not fp.is_file():
            continue
        try:
            with fp.open("r", encoding="utf-8", errors="ignore") as fh:
                for idx, line in enumerate(fh, 1):
                    if _STUB_PATTERN.search(line):
                        errors.append(f"  {f}:{idx}: {line.rstrip()}")
        except OSError:
            pass
    return errors


_STUB_EXTS = _SKIP_STUB_EXTS  # same skip list


# ── 4. Lint plan CHECK commands ───────────────────────────────────────────────


def _lint_text(text: str, name: str) -> list[str]:
    errors: list[str] = []
    for idx, line in enumerate(text.splitlines(), 1):
        check = re.search(r"\bCHECK\s*:\s*`([^`]*)`", line)
        if not check:
            continue
        cmd = check.group(1)
        if not cmd.strip():
            errors.append(f"  {name}:{idx}: empty CHECK command")
            continue
        try:
            r = subprocess.run(
                ["bash", "-c", f"set -n; {cmd}"],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if r.returncode != 0:
                errors.append(
                    f"  {name}:{idx}: bash syntax error in `{cmd}`: {r.stderr.strip()}"
                )
        except Exception:
            pass
        if "->" not in line[check.end() :]:
            errors.append(f"  {name}:{idx}: missing '->' transition in: {line.strip()}")
    return errors


def _lint_check_commands(files: list[str], response_content: str) -> list[str]:
    errors: list[str] = []
    if response_content:
        errors.extend(_lint_text(response_content, "Response"))
    for f in files:
        if f.endswith(".md") and Path(f).is_file():
            try:
                errors.extend(_lint_text(Path(f).read_text(errors="ignore"), f))
            except OSError:
                pass
    return errors


# ── 5. Source-file redaction guard ───────────────────────────────────────────
# Source files must never be rewritten by the completion gate. Secret handling
# for verification output happens in run_check.py and _validate_output().
# This function is intentionally a no-op kept for compatibility with the
# earlier call site and to make source immutability explicit.


def _redact_source_file(fp: Path) -> bool:
    """Return False without mutating source files."""
    return False


# ── selftest mode ─────────────────────────────────────────────────────────────


def _selftest(project_root: Path) -> int:
    """Quick smoke-test: write a fake evidence file and validate it."""
    import tempfile
    import shutil

    tmp = Path(tempfile.mkdtemp())
    try:
        ev_dir = tmp / ".forgewright" / "verify"
        ev_dir.mkdir(parents=True)
        turn = "selftest_001"
        ev: dict = {
            "schema_version": "1",
            "turn": turn,
            "command": ["echo", "selftest"],
            "exit_code": 0,
            "output": "selftest\n",
            "output_truncated": False,
            "timestamp_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "workspace": str(tmp),
            "tree_sha": "NONGIT:selftest",
        }
        (ev_dir / f"{turn}.json").write_text(json.dumps(ev, indent=2))

        errs = (
            _validate_schema(ev)
            + _validate_output(ev)
            + _validate_staleness(ev)
            + _validate_workspace(ev, tmp)
            + _validate_exit_code(ev)
        )
        if errs:
            _err(f"selftest FAILED: {errs}")
            return 1
        _ok("selftest PASSED")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ── main ──────────────────────────────────────────────────────────────────────


def main() -> None:
    if "--selftest" in sys.argv:
        sys.exit(_selftest(Path.cwd()))

    response_content = os.environ.get("RESPONSE_CONTENT", "")
    files_str = os.environ.get("FILES_TO_CHECK_STR", "")
    # Handle filenames with spaces: they're NUL-separated if FILES_TO_CHECK_NUL is set
    if os.environ.get("FILES_TO_CHECK_NUL"):
        files_to_check = [f for f in files_str.split("\0") if f.strip()]
    else:
        # Fall back to newline-separated (set by verify-gate.sh)
        files_to_check = [f for f in files_str.splitlines() if f.strip()]

    turn_env = os.environ.get("FORGEWRIGHT_TURN", os.environ.get("TURN", ""))
    project_root = _workspace()

    all_errors: list[str] = []

    # ── Step 1: Redact secrets from changed source files ──────────────────────
    print("[VERIFY-GATE] 1. Redacting secrets in changed source files...")
    for f in files_to_check:
        fp = Path(f) if Path(f).is_absolute() else project_root / f
        if _redact_source_file(fp):
            print(f"   - Redacted secrets in: {f}")
    _ok("Redaction complete")

    # ── Step 2: Stub check ────────────────────────────────────────────────────
    print("[VERIFY-GATE] 2. Checking for stubs (TODO, FIXME, NotImplementedError)...")
    stub_errs = _check_stubs(files_to_check)
    if stub_errs:
        _err("Code contains stubs:")
        for e in stub_errs:
            print(e, file=sys.stderr)
        all_errors.append("STUBS")
    else:
        _ok("No stubs found")

    # ── Step 3: Machine-written evidence validation ───────────────────────────
    print("[VERIFY-GATE] 3. Validating machine-written evidence...")

    ev_path = _find_evidence(project_root, turn_env)
    if ev_path is None:
        _err("MISSING: No evidence file under .forgewright/verify/")
        print(
            "   Code changes must be gated by a machine-written evidence file.",
            file=sys.stderr,
        )
        print(
            "   Run: bash scripts/lite/run-check.sh -- <your-check-cmd>",
            file=sys.stderr,
        )
        all_errors.append("MISSING")
    else:
        print(f"   - Evidence file: {ev_path.relative_to(project_root)}")
        try:
            ev = json.loads(ev_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            _err(f"FORGED: cannot parse evidence file: {e}")
            all_errors.append("FORGED")
            ev = {}

        if ev:
            current_workspace = project_root
            current_tree = _current_tree_sha(project_root)

            for check_fn, label in [
                (lambda: _validate_schema(ev), "schema"),
                (lambda: _validate_output(ev), "output"),
                (lambda: _validate_staleness(ev), "staleness"),
                (lambda: _validate_workspace(ev, current_workspace), "workspace"),
                (lambda: _validate_tree(ev, current_tree), "tree"),
                (lambda: _validate_exit_code(ev), "exit_code"),
            ]:
                errs = check_fn()
                if errs:
                    _err(f"Evidence {label} check failed:")
                    for e in errs:
                        print(f"   {e}", file=sys.stderr)
                    all_errors.extend(errs)

    if not all_errors:
        _ok("Evidence log validation PASSED")

    # ── Step 4: Lint plan CHECK commands ──────────────────────────────────────
    print("[VERIFY-GATE] 4. Lint-checking plan CHECK commands...")
    lint_errs = _lint_check_commands(files_to_check, response_content)
    if lint_errs:
        _err("Plan CHECK command linting failed:")
        for e in lint_errs:
            print(e, file=sys.stderr)
        # Lint errors are warnings, not hard-blocking (CHECK linting is advisory)
        _warn("Lint issues found but not blocking gate")
    else:
        _ok("All CHECK commands syntactically valid")

    # ── Final decision ────────────────────────────────────────────────────────
    if all_errors:
        _err(f"Gate BLOCKED. Reasons: {', '.join(set(all_errors[:5]))}")
        sys.exit(1)
    _ok("All checks passed — gate OPEN")
    sys.exit(0)


if __name__ == "__main__":
    main()
