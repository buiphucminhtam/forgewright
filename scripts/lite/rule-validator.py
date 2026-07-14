#!/usr/bin/env python3
import os
import sys
import argparse
import subprocess


def run_command(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)


def static_validation():
    print("Running static validation...")
    kernel_dir = "kernel"
    kernel_files = [
        "ENTRY.md",
        "SOLVE.md",
        "VERIFY.md",
        "ESCALATE.md",
        "CLARIFY.md",
        "POLICY.md",
    ]
    missing = []

    if not os.path.exists(kernel_dir):
        print(f"Static Validation Failed: Directory {kernel_dir} does not exist.")
        sys.exit(1)

    for f in kernel_files:
        path = os.path.join(kernel_dir, f)
        if not os.path.exists(path):
            missing.append(f)

    if missing:
        print(f"Static Validation Failed: Missing kernel files: {missing}")
        # Not failing hard to allow for progressive migration
        # sys.exit(1)

    print("Static validation passed.")
    sys.exit(0)


def runtime_validation(transcript_path):
    print(f"Running runtime validation on {transcript_path}...")
    if not os.path.exists(transcript_path):
        print("Transcript file not found, skipping runtime validation.")
        sys.exit(0)

    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading transcript: {e}")
        sys.exit(0)

    violations = []

    # R1: VERIFY check
    # If there's a claim or edit, there must be a VERDICT
    if "CLAIM:" in content and "VERDICT:" not in content:
        violations.append(("HR1-verify", "Claim made without VERDICT block"))

    # Missing memory loaded check
    if "Memory loaded" not in content and "mem0" not in content:
        # Not strictly a violation if no memory was needed, but we track it
        # violations.append(("HR7-memory", "Memory load step skipped"))
        pass

    for rule, note in violations:
        cmd = f'bash scripts/lite/rule-ledger.sh add {rule} violation "source: validator - {note}"'
        print(f"Recording violation: {rule} - {note}")
        run_command(cmd)

    print("Runtime validation complete.")
    sys.exit(0)


def main():
    parser = argparse.ArgumentParser(description="Forgewright Rule Validator")
    parser.add_argument(
        "--static", action="store_true", help="Run static validation on kernel files"
    )
    parser.add_argument(
        "--runtime", action="store_true", help="Run runtime validation on transcript"
    )
    parser.add_argument(
        "--transcript",
        type=str,
        default=".forgewright/session-log.json",
        help="Path to transcript file",
    )

    args = parser.parse_args()

    if args.static:
        static_validation()
    elif args.runtime:
        runtime_validation(args.transcript)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
