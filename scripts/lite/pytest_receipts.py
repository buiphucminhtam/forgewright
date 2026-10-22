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
import sys
import tempfile
import tomllib
import uuid
from pathlib import Path

PLUGIN = "forgewright_pytest_receipt"
MAX_RECEIPT_BYTES = 8 * 1024 * 1024
_LITE_DIR = Path(__file__).resolve().parent
OBSERVER_SHA256 = hashlib.sha256(
    (_LITE_DIR / "forgewright_pytest_receipt.py").read_bytes()
).hexdigest()
_BUNDLE_MODULES = (
    "evidence_common.py",
    "forgewright_pytest_receipt.py",
    "pytest_receipts.py",
    "run_check.py",
    "verify_gate.py",
)


def runtime_bundle_descriptor() -> dict:
    modules: dict[str, str] = {}
    for filename in _BUNDLE_MODULES:
        stem = filename[:-3]
        loaded = sys.modules.get(stem) or sys.modules.get(f"scripts.lite.{stem}")
        if loaded is not None and getattr(loaded, "__file__", None):
            origin = Path(loaded.__file__).resolve()
            if origin.parent != _LITE_DIR:
                raise RuntimeError(f"mixed-lite-bundle-origin:{filename}")
            target = origin
        else:
            target = (_LITE_DIR / filename).resolve()
        modules[filename] = hashlib.sha256(target.read_bytes()).hexdigest()
    return {
        "schema": "forgewright-lite-bundle/v1",
        "capabilities": ["pytest-receipt/v1"],
        "observer_sha256": OBSERVER_SHA256,
        "modules": modules,
    }


def verify_workspace_canonical_bundle(workspace: Path) -> list[str]:
    """Verify that the active runner bundle matches the workspace canonical Stop configuration."""
    try:
        root = Path(workspace).resolve()
        local_lite = (root / "scripts" / "lite").resolve()
        stop_sh = local_lite / "stop-gate.sh"
        codex_cfg = root / ".codex" / "config.toml"
        if not stop_sh.exists() and not stop_sh.is_symlink() and not codex_cfg.exists():
            return []
        if not stop_sh.is_file() or stop_sh.is_symlink():
            return ["UNVERIFIED: workspace canonical stop-gate.sh is missing or a symlink"]
        if not codex_cfg.exists():
            return ["UNVERIFIED: workspace .codex/config.toml is required when local stop-gate.sh is present"]
        if codex_cfg.is_symlink() or not codex_cfg.is_file():
            return ["UNVERIFIED: workspace .codex/config.toml is unsafe"]
        cfg = tomllib.loads(codex_cfg.read_text(encoding="utf-8"))
        if True:
            if cfg.get("features", {}).get("hooks") is not True:
                return ["UNVERIFIED: workspace .codex/config.toml hooks are disabled"]
            legacy = "bash scripts/lite/stop-gate.sh --platform CODEX"
            canonical = 'bash -c \'root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1; cd "$root" || exit 1; exec bash scripts/lite/stop-gate.sh --platform CODEX\''
            memory = 'bash -c \'root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0; command -v python3 >/dev/null 2>&1 || exit 0; script="$root/scripts/memory/native_hook.py"; [ -f "$script" ] || exit 0; exec python3 "$script" --workspace "$root"\''
            groups = cfg.get("hooks", {}).get("Stop", [])
            if not isinstance(groups, list) or len(groups) not in (1, 2):
                return ["UNVERIFIED: workspace .codex/config.toml Stop registration does not match canonical stop-gate.sh"]
            remaining = list(groups)
            if len(remaining) == 2:
                optional = []
                for cand in remaining:
                    if not isinstance(cand, dict) or set(cand) != {"hooks"}:
                        continue
                    handlers = cand["hooks"]
                    if not isinstance(handlers, list) or len(handlers) != 1:
                        continue
                    handler = handlers[0]
                    if not isinstance(handler, dict):
                        continue
                    cmd_val = handler.get("command")
                    if not isinstance(cmd_val, str) or cmd_val.strip(" \t\n") != memory:
                        continue
                    if type(handler.get("timeout")) is not int:
                        continue
                    if {k: v for k, v in handler.items() if k != "command"} == {
                        "type": "command",
                        "timeout": 3,
                        "statusMessage": "Saving optional structured memory",
                    }:
                        optional.append(cand)
                if len(optional) != 1:
                    return ["UNVERIFIED: workspace .codex/config.toml Stop registration does not match canonical stop-gate.sh"]
                remaining = [c for c in remaining if c is not optional[0]]
            grp = remaining[0]
            if (
                not isinstance(grp, dict)
                or bool(set(grp) - {"matcher", "hooks", "enabled"})
                or grp.get("enabled", True) is not True
                or grp.get("matcher") != "*"
            ):
                return ["UNVERIFIED: workspace .codex/config.toml Stop registration does not match canonical stop-gate.sh"]
            hooks = grp.get("hooks")
            if not isinstance(hooks, list) or len(hooks) != 1 or not isinstance(hooks[0], dict):
                return ["UNVERIFIED: workspace .codex/config.toml Stop registration does not match canonical stop-gate.sh"]
            hk = hooks[0]
            if (
                bool(set(hk) - {"type", "command", "command_windows", "enabled"})
                or hk.get("enabled", True) is not True
                or hk.get("type") != "command"
                or ("command_windows" in hk and not isinstance(hk["command_windows"], str))
                or not isinstance(hk.get("command"), str)
                or hk["command"].strip(" \t\n") not in {legacy, canonical}
            ):
                return ["UNVERIFIED: workspace .codex/config.toml Stop registration does not match canonical stop-gate.sh"]
        active = runtime_bundle_descriptor()
        for filename in _BUNDLE_MODULES:
            candidate = local_lite / filename
            if not candidate.is_file() or candidate.is_symlink():
                return [
                    f"UNVERIFIED: workspace canonical verifier module {filename!r} is missing"
                ]
            expected_sha = hashlib.sha256(candidate.read_bytes()).hexdigest()
            if active["modules"].get(filename) != expected_sha:
                return [
                    f"UNVERIFIED: active runner bundle does not match workspace canonical {filename!r}"
                ]
        return []
    except (OSError, RuntimeError) as error:
        return [f"UNVERIFIED: canonical verifier bundle check failed: {error}"]


def bundle_errors(bundle) -> list[str]:
    prefix = "UNVERIFIED: canonical verifier bundle "
    if not isinstance(bundle, dict):
        return [prefix + "is missing"]
    try:
        expected = runtime_bundle_descriptor()
    except (OSError, RuntimeError) as error:
        return [prefix + f"is unreadable: {error}"]
    if (
        bundle.get("schema") != expected["schema"]
        or bundle.get("capabilities") != expected["capabilities"]
        or bundle.get("observer_sha256") != expected["observer_sha256"]
    ):
        return [prefix + "schema or observer capability mismatch"]
    modules = bundle.get("modules")
    if not isinstance(modules, dict) or set(modules) != set(expected["modules"]):
        return [prefix + "module inventory mismatch"]
    for name, expected_sha in expected["modules"].items():
        if modules.get(name) != expected_sha:
            return [prefix + f"hash mismatch for {name!r}"]
    return []


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
                    and candidate.get("observer_sha256") == OBSERVER_SHA256
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
    if receipt.get("observer_sha256") != OBSERVER_SHA256:
        return [prefix + "observer_sha256 does not match canonical observer"]
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
