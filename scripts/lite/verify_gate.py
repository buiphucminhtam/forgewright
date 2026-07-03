#!/usr/bin/env python3
# scripts/lite/verify_gate.py
# Helper for verify-gate.sh to perform robust Python-based checks.

import os
import sys
import json
import re
import subprocess
from pathlib import Path


def log_info(msg):
    print(f"\033[0;32m[VERIFY-GATE]\033[0m {msg}")


def log_error(msg):
    print(f"\033[0;31m[VERIFY-GATE] ERROR:\033[0m {msg}", file=sys.stderr)


# 1. Redact secrets in files
def redact_secrets(filepath):
    if not os.path.isfile(filepath):
        return
    if filepath.endswith(
        (".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".tar", ".gz")
    ):
        return
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        original = content

        # Redact OpenAI key
        content = re.sub(r"sk-[a-zA-Z0-9]{20,}", "sk-[REDACTED]", content)
        # Redact GitHub token
        content = re.sub(r"ghp_[a-zA-Z0-9]{20,}", "ghp_[REDACTED]", content)
        # Redact Private key block
        priv_key_pattern = r"-----BEGIN ((RSA|EC|DSA|OPENSSH)? )?PRIVATE KEY-----\n[\s\S]+?-----END ((RSA|EC|DSA|OPENSSH)? )?PRIVATE KEY-----"
        content = re.sub(
            priv_key_pattern,
            "-----BEGIN PRIVATE KEY-----\n[REDACTED]\n-----END PRIVATE KEY-----",
            content,
        )

        if content != original:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"   - Redacted secrets in: {filepath}")
    except Exception as e:
        print(
            f"   - Warning: Could not check secrets for {filepath}: {e}",
            file=sys.stderr,
        )


# 2. Check for stubs
def check_stubs(files_to_check):
    stub_errors = []
    for f in files_to_check:
        if f.endswith((".md", ".txt", ".json", ".yaml", ".yml", ".ini", ".cfg")):
            continue
        if f.startswith(("scripts/lite/", ".forgewright/")):
            continue
        if not os.path.isfile(f):
            continue

        try:
            with open(f, "r", encoding="utf-8", errors="ignore") as file_obj:
                for idx, line in enumerate(file_obj, 1):
                    if re.search(r"\b(TODO|FIXME|NotImplementedError)\b", line):
                        stub_errors.append(
                            f"   - {f}:{idx}: found stub comment/code: {line.strip()}"
                        )
        except Exception:
            pass
    return stub_errors


# 3. Check machine-written evidence log
def check_evidence(project_root, turn_env):
    evidence_file = None
    if turn_env:
        possible_path = project_root / ".forgewright" / "verify" / f"{turn_env}.json"
        if possible_path.is_file():
            evidence_file = possible_path
    else:
        verify_dir = project_root / ".forgewright" / "verify"
        if verify_dir.is_dir():
            json_files = list(verify_dir.glob("*.json"))
            if json_files:
                json_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
                evidence_file = json_files[0]

    if not evidence_file or not evidence_file.is_file():
        log_error("No machine-written evidence file found under .forgewright/verify/.")
        print(
            "   - Code changes must be gated by a verification evidence file.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"   - Validating evidence file: {evidence_file.relative_to(project_root)}")
    try:
        with open(evidence_file, "r", encoding="utf-8") as f:
            ev_data = json.load(f)

        exit_code = ev_data.get("exit_code", ev_data.get("exitCode", -1))
        output = ev_data.get("output", ev_data.get("stdout", ""))

        if exit_code != 0:
            log_error(f"Evidence file indicates failure. Exit code: {exit_code}")
            sys.exit(1)
        if not output or not output.strip():
            log_error("Evidence file has empty output.")
            sys.exit(1)
        print("   - Evidence log validation passed.")
    except Exception as e:
        log_error(f"Failed to parse/validate evidence file: {e}")
        sys.exit(1)


# 4. Lint-check plan CHECK commands
def lint_text(text, name):
    errors = []
    lines = text.splitlines()
    for idx, line in enumerate(lines, 1):
        if re.search(r"\bCHECK\b", line):
            backticks = re.findall(r"`([^`]+)`", line)
            if backticks:
                cmd = backticks[0]
                # Check bash syntax
                try:
                    res = subprocess.run(
                        ["bash", "-c", f"set -n; {cmd}"],
                        capture_output=True,
                        text=True,
                        timeout=2,
                    )
                    if res.returncode != 0:
                        errors.append(
                            f"Syntax error in command `{cmd}`: {res.stderr.strip()}"
                        )
                except Exception:
                    pass
                # Check -> and status
                if "->" not in line:
                    errors.append(f"Missing transition '->' in: {line.strip()}")
                else:
                    parts = line.split("->", 1)
                    if not parts[1].strip():
                        errors.append(f"Missing status after '->' in: {line.strip()}")
            else:
                if re.match(r"^\s*[-*]?\s*CHECK:", line, re.IGNORECASE) and any(
                    w in line.lower()
                    for w in ["npm", "pytest", "jest", "make", "bash", "sh", "python"]
                ):
                    errors.append(
                        f"CHECK command must be wrapped in backticks: {line.strip()}"
                    )
    return [f"   - {name}:{idx}: {err}" for err in errors]


def lint_check_commands(files_to_check, response_content):
    lint_errors = []
    if response_content:
        lint_errors.extend(lint_text(response_content, "Response Content"))

    for f in files_to_check:
        if f.endswith(".md") and os.path.isfile(f):
            try:
                with open(f, "r", encoding="utf-8", errors="ignore") as file_obj:
                    f_content = file_obj.read()
                lint_errors.extend(lint_text(f_content, f))
            except Exception:
                pass
    return lint_errors


def main():
    response_content = os.environ.get("RESPONSE_CONTENT", "")
    files_str = os.environ.get("FILES_TO_CHECK_STR", "")
    files_to_check = [f for f in files_str.split(" ") if f.strip()]
    turn_env = os.environ.get("FORGEWRIGHT_TURN", os.environ.get("TURN", ""))
    project_root = Path(os.getcwd())

    print("[VERIFY-GATE] 1. Redacting secrets...")
    for f in files_to_check:
        redact_secrets(f)

    print("[VERIFY-GATE] 2. Checking for stubs (TODO, FIXME, NotImplementedError)...")
    stub_errors = check_stubs(files_to_check)
    if stub_errors:
        log_error("Code contains stubs. Completion rejected:")
        for err in stub_errors:
            print(err, file=sys.stderr)
        sys.exit(1)
    else:
        print("   - No stubs found. Clean.")

    print("[VERIFY-GATE] 3. Checking machine-written evidence log...")
    check_evidence(project_root, turn_env)

    print("[VERIFY-GATE] 4. Lint-checking plan CHECK commands...")
    lint_errors = lint_check_commands(files_to_check, response_content)
    if lint_errors:
        log_error("Plan CHECK command linting failed:")
        for err in lint_errors:
            print(err, file=sys.stderr)
        sys.exit(1)
    else:
        print("   - All CHECK commands syntactically valid and properly formatted.")


if __name__ == "__main__":
    main()
