"""Observe pytest calls without changing the recorded command or runner semantics.

Receipts are mismatch detection within the trusted local host, not authentication
against a malicious test/plugin or another process running as the same user.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
import uuid
from pathlib import Path

PLUGIN = "forgewright_pytest_receipt"
MAX_RECEIPT_BYTES = 8 * 1024 * 1024


def is_pytest(command):
    executable = Path(command[0]).name.lower()
    return executable in {"pytest", "pytest.exe", "py.test"} or (
        re.fullmatch(r"python(?:\d+(?:\.\d+)*)?(?:\.exe)?", executable)
        and command[1:3] == ["-m", "pytest"]
    )


def command_digest(command):
    return hashlib.sha256(
        json.dumps(command, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def run_observed(command, *, cwd, env=None, timeout=300):
    environment = dict(os.environ if env is None else env)
    if not is_pytest(command):
        return subprocess.run(
            command,
            cwd=str(cwd),
            env=environment,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        ), None
    with tempfile.TemporaryDirectory(prefix="forgewright-pytest-") as temporary:
        path = Path(temporary) / "receipt.json"
        nonce = uuid.uuid4().hex
        environment["FORGEWRIGHT_PYTEST_RECEIPT"] = str(path)
        environment["FORGEWRIGHT_PYTEST_RUN_ID"] = nonce
        plugins = environment.get("PYTEST_PLUGINS", "").split(",")
        environment["PYTEST_PLUGINS"] = ",".join(
            dict.fromkeys([*(p for p in plugins if p), PLUGIN])
        )
        environment["PYTHONPATH"] = os.pathsep.join(
            filter(
                None, [str(Path(__file__).parent), environment.get("PYTHONPATH", "")]
            )
        )
        result = subprocess.run(
            command,
            cwd=str(cwd),
            env=environment,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        receipt = None
        if path.is_file() and path.stat().st_size <= MAX_RECEIPT_BYTES:
            try:
                candidate = json.loads(path.read_text(encoding="utf-8"))
                if (
                    isinstance(candidate, dict)
                    and candidate.get("run_id") == nonce
                    and candidate.get("workspace") == str(Path(cwd).resolve())
                    and candidate.get("exit_code") == result.returncode
                ):
                    receipt = {**candidate, "command_sha256": command_digest(command)}
            except (OSError, UnicodeError, ValueError):
                pass
        return result, receipt


def matches_ref(nodeid, ref):
    # File, class and parameter container references use pytest boundaries,
    # never plain prefixes (test_x must not match test_xy).
    return (
        nodeid == ref
        or nodeid.startswith(ref + "::")
        or ("::" in ref and "[" not in ref and nodeid.startswith(ref + "["))
    )


def receipt_errors(receipt, command, workspace, refs, phase, exit_code, tree_sha=None):
    if not is_pytest(command):
        return []
    prefix = "UNVERIFIED: pytest execution receipt "
    if not isinstance(receipt, dict):
        return [prefix + "is missing; argv/exit0 do not prove a test ran"]
    if (
        receipt.get("schema") != "forgewright-pytest-execution/v1"
        or receipt.get("observer") != "forgewright-pytest-receipt/v1"
        or receipt.get("complete") is not True
        or receipt.get("duplicate_reports") is not False
        or receipt.get("distributed") is not False
        or receipt.get("command_sha256") != command_digest(command)
        or receipt.get("workspace") != str(Path(workspace).resolve())
        or receipt.get("exit_code") != exit_code
        or not isinstance(receipt.get("run_id"), str)
        or not re.fullmatch(r"[0-9a-f]{32}", receipt["run_id"])
        or (tree_sha is not None and receipt.get("tree_sha") != tree_sha)
    ):
        return [prefix + "is partial or does not match command/workspace/tree/run"]
    rows = receipt.get("tests")
    deselected = receipt.get("deselected")
    if (
        not isinstance(rows, list)
        or not isinstance(deselected, list)
        or len(rows) > 100_000
    ):
        return [prefix + "has malformed outcomes"]
    if any(not isinstance(n, str) for n in deselected):
        return [prefix + "has malformed deselection"]
    if any(
        not isinstance(r, dict)
        or not isinstance(r.get("nodeid"), str)
        or not isinstance(r.get("phases"), dict)
        for r in rows
    ):
        return [prefix + "has malformed node outcomes"]
    if len({row["nodeid"] for row in rows}) != len(rows):
        return [prefix + "has duplicate nodes"]
    if any(
        set(row["phases"]) - {"setup", "call", "teardown"}
        or any(
            not isinstance(value, str) or value not in {"passed", "failed", "skipped"}
            for value in row["phases"].values()
        )
        for row in rows
    ):
        return [prefix + "has malformed phases"]
    errors = []
    failed_bound_call = False
    for ref in refs:
        selected = [row for row in rows if matches_ref(row["nodeid"], ref)]
        if not selected or any(matches_ref(node, ref) for node in deselected):
            errors.append(prefix + f"does not execute required ref {ref!r}")
            continue
        for row in selected:
            phases = row["phases"]
            valid_call = (
                {"passed", "failed"} if phase in {"red", "mutation"} else {"passed"}
            )
            if (
                row.get("wasxfail") is not False
                or phases.get("setup") != "passed"
                or phases.get("call") not in valid_call
                or phases.get("teardown") != "passed"
            ):
                errors.append(
                    prefix
                    + f"cannot prove {ref!r}: node {row['nodeid']!r} was skipped, xfailed, incomplete or failed"
                )
            elif phases.get("call") == "failed":
                failed_bound_call = True
    if phase in {"red", "mutation"} and not failed_bound_call:
        errors.append(prefix + "has no failed call among the acceptance-bound refs")
    return errors
