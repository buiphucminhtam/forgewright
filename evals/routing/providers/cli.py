#!/usr/bin/env python3
"""Provider-agnostic CLI capability probe with zero generation calls."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import signal
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


MAX_VERSION_BYTES = 4096
MAX_SMOKE_BYTES = 64 * 1024
SMOKE_MARKER = "FORGEWRIGHT_PROVIDER_SMOKE_OK"


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


def _limit_output_file() -> None:
    if os.name == "posix":
        import resource

        resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_SMOKE_BYTES, MAX_SMOKE_BYTES))


def _terminate_process_group(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    time.sleep(0.2)
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def smoke(
    provider: str, executable: str, invocation_args: list[str]
) -> dict[str, object]:
    if os.environ.get("FORGEWRIGHT_PROVIDER_SMOKE") != "1":
        raise ValueError(
            "set FORGEWRIGHT_PROVIDER_SMOKE=1 to authorize one provider invocation"
        )
    if sum(item.count("{prompt}") for item in invocation_args) != 1:
        raise ValueError(
            "invocation args must contain exactly one {prompt} placeholder"
        )
    if os.name != "posix":
        raise ValueError(
            "provider smoke requires POSIX process-group and output-limit controls"
        )
    resolved = _executable(executable)
    prompt = f"Return only {SMOKE_MARKER}. Do not call tools or include other text."
    argv = [resolved, *(item.replace("{prompt}", prompt) for item in invocation_args)]
    with tempfile.TemporaryFile() as output:
        process = subprocess.Popen(
            argv,
            stdout=output,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            preexec_fn=_limit_output_file,
        )
        try:
            code = process.wait(timeout=60)
        except subprocess.TimeoutExpired as error:
            _terminate_process_group(process)
            process.wait(timeout=5)
            raise ValueError("provider smoke timed out") from error
        finally:
            _terminate_process_group(process)
        size = output.tell()
        if code != 0:
            raise ValueError(f"provider smoke exited {code}; output suppressed")
        if size > MAX_SMOKE_BYTES:
            raise ValueError("provider smoke exceeded the output cap")
        output.seek(0)
        raw = output.read(MAX_SMOKE_BYTES)
    text = raw.decode("utf-8", errors="replace")
    if SMOKE_MARKER not in text:
        raise ValueError("provider smoke marker was not verified")
    return {
        "schema_version": 1,
        "provider": provider,
        "adapter_kind": "cli",
        "marker_verified": True,
        "output_sha256": hashlib.sha256(raw).hexdigest(),
        "invocation_calls": 1,
        "prompt_or_output_persisted": False,
        "native_receipt_verified": False,
        "live_evidence_eligible": False,
    }


def catalog(
    provider: str, executable: str, catalog_args: list[str], catalog_format: str
) -> dict[str, object]:
    if os.environ.get("FORGEWRIGHT_PROVIDER_CATALOG") != "1":
        raise ValueError(
            "set FORGEWRIGHT_PROVIDER_CATALOG=1 to authorize one provider catalog call"
        )
    if os.name != "posix":
        raise ValueError(
            "provider catalog requires POSIX process-group and output-limit controls"
        )
    resolved = _executable(executable)
    with tempfile.TemporaryFile() as output:
        process = subprocess.Popen(
            [resolved, *catalog_args],
            stdout=output,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            preexec_fn=_limit_output_file,
        )
        try:
            code = process.wait(timeout=30)
        except subprocess.TimeoutExpired as error:
            _terminate_process_group(process)
            process.wait(timeout=5)
            raise ValueError("provider catalog timed out") from error
        finally:
            _terminate_process_group(process)
        size = output.tell()
        if code != 0:
            raise ValueError(f"provider catalog exited {code}; output suppressed")
        if size > MAX_SMOKE_BYTES:
            raise ValueError("provider catalog exceeded the output cap")
        output.seek(0)
        raw = output.read(MAX_SMOKE_BYTES)
    try:
        text = raw.decode("utf-8")
        if catalog_format == "lines":
            models = [line.strip() for line in text.splitlines() if line.strip()]
        else:
            parsed = json.loads(text)
            if not isinstance(parsed, list) or not all(
                isinstance(item, str) and item.strip() for item in parsed
            ):
                raise ValueError("provider JSON catalog must be a string array")
            models = [item.strip() for item in parsed]
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("provider catalog output is invalid") from error
    models = list(dict.fromkeys(models))
    if not models or len(models) > 200:
        raise ValueError(
            "provider catalog must contain between 1 and 200 unique models"
        )
    return {
        "schema_version": 1,
        "provider": provider,
        "adapter_kind": "cli",
        "models": models,
        "models_source": "provider-cli-runtime",
        "catalog_fingerprint": hashlib.sha256(
            json.dumps(models, separators=(",", ":")).encode()
        ).hexdigest(),
        "catalog_calls": 1,
        "catalog_side_effects": "provider-defined",
        "generation_calls": "not-observed",
        "live_evidence_eligible": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("probe", "smoke", "catalog"))
    parser.add_argument("--provider", required=True)
    parser.add_argument("--executable", required=True)
    parser.add_argument("--version-args-json", required=True)
    parser.add_argument("--invocation-args-json", required=True)
    parser.add_argument(
        "--routing-mode", choices=("provider-managed", "explicit-tier"), required=True
    )
    parser.add_argument("--catalog-args-json", default="[]")
    parser.add_argument(
        "--catalog-format", choices=("lines", "json-array"), default="lines"
    )
    args = parser.parse_args()
    try:
        invocation_args = _string_array(args.invocation_args_json, "invocation args")
        if args.command == "probe":
            report = probe(
                args.provider,
                args.executable,
                _string_array(args.version_args_json, "version args"),
                invocation_args,
                args.routing_mode,
            )
        elif args.command == "smoke":
            report = smoke(args.provider, args.executable, invocation_args)
        else:
            report = catalog(
                args.provider,
                args.executable,
                _string_array(args.catalog_args_json, "catalog args"),
                args.catalog_format,
            )
        print(json.dumps(report, indent=2, sort_keys=True))
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
