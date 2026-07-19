#!/usr/bin/env python3
"""Fail-closed static and runtime validation for the rule-compliance loop."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


EXECUTABLE_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ERROR: str | None = None
workspace_value = os.environ.get("FORGEWRIGHT_WORKSPACE")
if workspace_value:
    try:
        candidate_workspace = Path(workspace_value).expanduser().resolve(strict=True)
        if not candidate_workspace.is_dir() or not os.access(
            candidate_workspace, os.R_OK
        ):
            raise OSError("not a readable directory")
        PROJECT_ROOT = candidate_workspace
    except OSError as error:
        PROJECT_ROOT = EXECUTABLE_ROOT
        WORKSPACE_ERROR = f"FORGEWRIGHT_WORKSPACE is invalid: {error}"
else:
    PROJECT_ROOT = EXECUTABLE_ROOT
KERNEL_FILES = (
    "ENTRY.md",
    "SOLVE.md",
    "VERIFY.md",
    "ESCALATE.md",
    "CLARIFY.md",
    "POLICY.md",
)
REQUIRED_VERIFY_FIELDS = ("CLAIM", "COMMAND", "OUTPUT", "EXIT CODE", "VERDICT")


def static_validation() -> int:
    kernel_dir = PROJECT_ROOT / "kernel"
    missing = [name for name in KERNEL_FILES if not (kernel_dir / name).is_file()]
    unreadable = [
        name
        for name in KERNEL_FILES
        if (kernel_dir / name).is_file() and not os.access(kernel_dir / name, os.R_OK)
    ]
    if missing or unreadable:
        if missing:
            print(
                f"Static validation failed: missing kernel files: {missing}",
                file=sys.stderr,
            )
        if unreadable:
            print(
                f"Static validation failed: unreadable kernel files: {unreadable}",
                file=sys.stderr,
            )
        return 1
    print("Static validation passed.")
    return 0


def _response_from_json(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    for key in (
        "response_content",
        "content",
        "assistant_response",
        "output",
        "response",
    ):
        candidate = value.get(key)
        if isinstance(candidate, str):
            return candidate
        if isinstance(candidate, list):
            texts = [item.get("text") for item in candidate if isinstance(item, dict)]
            if texts and all(isinstance(item, str) for item in texts):
                return "\n".join(texts)
    return None


def decode_response(raw: str) -> str:
    if not raw.strip():
        raise ValueError("response is empty")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return raw
    response = _response_from_json(parsed)
    if response is None:
        raise ValueError("JSON payload has no supported response field")
    if not response.strip():
        raise ValueError("response is empty")
    return response


def _field(line: str) -> tuple[str, str] | None:
    match = re.match(
        r"^\s*(CLAIM|COMMAND|OUTPUT|EXIT CODE|VERDICT):\s*(.*)\s*$", line, re.IGNORECASE
    )
    if not match:
        return None
    return match.group(1).upper(), match.group(2).strip()


def validate_verify_blocks(response: str) -> list[str]:
    lines = response.splitlines()
    starts = [
        index
        for index, line in enumerate(lines)
        if (_field(line) or (None, ""))[0] == "CLAIM"
    ]
    if not starts:
        return ["no VERIFY block found"]

    errors: list[str] = []
    for number, start in enumerate(starts, start=1):
        end = starts[number] if number < len(starts) else len(lines)
        fields: dict[str, tuple[int, str]] = {}
        for index in range(start, end):
            parsed = _field(lines[index])
            if parsed and parsed[0] not in fields:
                fields[parsed[0]] = (index, parsed[1])

        missing = [name for name in REQUIRED_VERIFY_FIELDS if name not in fields]
        if missing:
            errors.append(f"VERIFY block {number} missing fields: {', '.join(missing)}")
            continue
        claim_pos, command_pos, output_pos, exit_pos, verdict_pos = (
            fields[name][0] for name in REQUIRED_VERIFY_FIELDS
        )
        prefix_adjacent = command_pos == claim_pos + 1 and output_pos == command_pos + 1
        suffix_adjacent = verdict_pos == exit_pos + 1
        output_continuation = all(
            lines[index].strip() and _field(lines[index]) is None
            for index in range(output_pos + 1, exit_pos)
        )
        if not (
            prefix_adjacent
            and suffix_adjacent
            and exit_pos > output_pos
            and output_continuation
        ):
            errors.append(f"VERIFY block {number} fields are not consecutive")
            continue
        for name in ("CLAIM", "COMMAND"):
            if not fields[name][1]:
                errors.append(f"VERIFY block {number} has empty {name}")
        output_lines = lines[output_pos + 1 : exit_pos]
        if not fields["OUTPUT"][1] and not any(line.strip() for line in output_lines):
            errors.append(f"VERIFY block {number} has empty OUTPUT")
        if fields["EXIT CODE"][1] != "0":
            errors.append(f"VERIFY block {number} EXIT CODE is not 0")
        if fields["VERDICT"][1].upper() != "PASS":
            errors.append(f"VERIFY block {number} VERDICT is not PASS")
    return errors


def record_violation(note: str) -> int:
    ledger = EXECUTABLE_ROOT / "scripts" / "lite" / "rule-ledger.sh"
    result = subprocess.run(
        [
            "bash",
            str(ledger),
            "add",
            "HR1-verify",
            "violation",
            f"source: validator - {note}",
        ],
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        print(
            "Runtime validation failed and the violation ledger write also failed.",
            file=sys.stderr,
        )
        if result.stderr:
            print(result.stderr.strip(), file=sys.stderr)
        return result.returncode or 1
    return 0


def runtime_validation(raw: str) -> int:
    try:
        response = decode_response(raw)
        errors = validate_verify_blocks(response)
    except (OSError, UnicodeError, ValueError) as error:
        errors = [str(error)]

    if not errors:
        print("Runtime validation passed.")
        return 0

    note = "; ".join(errors)
    print(f"Runtime validation failed: {note}", file=sys.stderr)
    ledger_rc = record_violation(note)
    return ledger_rc if ledger_rc != 0 else 1


def read_runtime_input(path: str | None) -> str:
    if path and path != "-":
        transcript = Path(path)
        if not transcript.is_absolute():
            transcript = PROJECT_ROOT / transcript
        if not transcript.is_file() or not os.access(transcript, os.R_OK):
            raise OSError(f"transcript is missing or unreadable: {transcript}")
        return transcript.read_text(encoding="utf-8")
    return sys.stdin.read()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--static", action="store_true", help="Validate required kernel files"
    )
    mode.add_argument(
        "--runtime", action="store_true", help="Validate a response transcript"
    )
    parser.add_argument(
        "--transcript",
        help="Transcript path, or '-' for stdin. Runtime mode reads stdin when omitted.",
    )
    args = parser.parse_args()

    if WORKSPACE_ERROR:
        print(WORKSPACE_ERROR, file=sys.stderr)
        return 1

    if args.static:
        return static_validation()
    try:
        raw = read_runtime_input(args.transcript)
    except (OSError, UnicodeError) as error:
        return _runtime_input_failure(str(error))
    return runtime_validation(raw)


def _runtime_input_failure(note: str) -> int:
    print(f"Runtime validation failed: {note}", file=sys.stderr)
    ledger_rc = record_violation(note)
    return ledger_rc if ledger_rc != 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
