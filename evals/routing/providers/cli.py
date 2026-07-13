#!/usr/bin/env python3
"""Provider-agnostic CLI capability probe with zero generation calls."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path


MAX_VERSION_BYTES = 4096


def _string_array(value: str, name: str) -> list[str]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError(f"{name} must be valid JSON") from error
    if not isinstance(parsed, list) or not all(
        isinstance(item, str) and item for item in parsed
    ):
        raise ValueError(f"{name} must be a JSON string array")
    return parsed


def _executable(value: str) -> str:
    candidate = shutil.which(value)
    if candidate is None and Path(value).is_file() and os.access(value, os.X_OK):
        candidate = str(Path(value).resolve())
    if candidate is None:
        raise ValueError(f"provider executable not found: {value}")
    return candidate


def probe(
    provider: str,
    executable: str,
    version_args: list[str],
    invocation_args: list[str],
    routing_mode: str,
) -> dict[str, object]:
    if not provider.strip():
        raise ValueError("provider is required")
    if sum(item.count("{prompt}") for item in invocation_args) != 1:
        raise ValueError(
            "invocation args must contain exactly one {prompt} placeholder"
        )
    resolved = _executable(executable)
    result = subprocess.run(
        [resolved, *version_args],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(
            f"provider version probe exited {result.returncode}; output suppressed"
        )
    raw_version = result.stdout.strip() or result.stderr.strip()
    encoded = raw_version.encode("utf-8")
    if not raw_version or len(encoded) > MAX_VERSION_BYTES:
        raise ValueError("provider version output is empty or exceeds the cap")
    contract = {
        "provider": provider,
        "executable": Path(resolved).name,
        "version": raw_version,
        "invocation_args": invocation_args,
        "routing_mode": routing_mode,
    }
    fingerprint = hashlib.sha256(
        json.dumps(contract, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return {
        "schema_version": 1,
        "provider": provider,
        "adapter_kind": "cli",
        "executable": resolved,
        "version": raw_version,
        "contract_fingerprint": fingerprint,
        "routing_mode": routing_mode,
        "routing_mode_status": "adapter-declared-unverified",
        "invocation_contract_status": "declared-unverified",
        "capabilities": {
            "non_interactive_invocation": "declared-unverified",
            "provider_managed_model_selection": routing_mode == "provider-managed",
            "explicit_model_catalog": False,
            "native_attested_receipts": False,
        },
        "live_evidence_eligible": False,
        "probe_process_calls": 1,
        "probe_side_effects": "provider-defined-version-command",
        "invocation_calls": 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("probe",))
    parser.add_argument("--provider", required=True)
    parser.add_argument("--executable", required=True)
    parser.add_argument("--version-args-json", required=True)
    parser.add_argument("--invocation-args-json", required=True)
    parser.add_argument(
        "--routing-mode", choices=("provider-managed", "explicit-tier"), required=True
    )
    args = parser.parse_args()
    try:
        report = probe(
            args.provider,
            args.executable,
            _string_array(args.version_args_json, "version args"),
            _string_array(args.invocation_args_json, "invocation args"),
            args.routing_mode,
        )
        print(json.dumps(report, indent=2, sort_keys=True))
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
