#!/usr/bin/env python3
"""Opt-in AB3/AB6 real-adapter verifier for an isolated disposable profile.

This verifier is intentionally refused by default because it creates a local
shared runtime, runs the real GitNexus/docs/delegate adapters, and performs a
real stdio MCP handshake. It never uses an owner profile, credentials, or a
model. Run only against frozen source:
  FORGEWRIGHT_RUN_AUTO_BOOTSTRAP_RUNTIME=1 python3 scripts/ci/verify-auto-bootstrap-runtime.py --run
"""

from __future__ import annotations
import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NODE = Path(
    os.environ.get("FORGEWRIGHT_NODE24", shutil.which("node") or "node")
).resolve()
PYTHON = Path(os.environ.get("FORGEWRIGHT_BOOTSTRAP_PYTHON", sys.executable)).absolute()


def tool_path(name: str, fallback: str) -> Path:
    candidate = (
        os.environ.get(f"FORGEWRIGHT_TOOL_{name.upper()}", "")
        or shutil.which(name)
        or fallback
    )
    path = Path(candidate).expanduser().absolute()
    if not path.is_file() or not os.access(path, os.X_OK):
        raise RuntimeError(f"required executable unavailable: {name} ({path})")
    return path


TOOLS = {
    "bash": tool_path("bash", "/bin/bash"),
    "git": tool_path("git", "/usr/bin/git"),
    "gitnexus": tool_path("gitnexus", "/opt/homebrew/bin/gitnexus"),
    "jq": tool_path("jq", "/opt/homebrew/bin/jq"),
    "ps": tool_path("ps", "/bin/ps"),
    "true": tool_path("true", "/usr/bin/true"),
    "node": NODE,
    "npm": tool_path("npm", str(NODE.parent / "npm")),
    "python3": PYTHON,
}
RUNTIME_OUTPUT = ROOT / ".forgewright/runtime/auto-bootstrap-completion"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_sentinel() -> dict[str, str]:
    paths = [
        "src/cli/dist/index.js",
        "src/cli/src/commands/bootstrap.ts",
        "src/cli/package.json",
        "scripts/runtime/bootstrap_manager.py",
        "scripts/runtime/shared_runtime_adapter.py",
        "package.json",
    ]
    return {path: sha(ROOT / path) for path in paths if (ROOT / path).is_file()}


def emit(path: Path, item: dict) -> None:
    path.write_text(json.dumps(item, indent=2, sort_keys=True) + "\n")


def command(
    argv: list[str], env: dict[str, str], evidence: Path, name: str, timeout: float = 90
) -> dict:
    started = time.time()
    try:
        cp = subprocess.run(
            argv, text=True, capture_output=True, env=env, timeout=timeout
        )
    except subprocess.TimeoutExpired as error:

        def timeout_text(value: str | bytes | None) -> str:
            return (
                value.decode(errors="replace")
                if isinstance(value, bytes)
                else (value or "")
            )

        item = {
            "argv": argv,
            "exit": 124,
            "started_at": started,
            "ended_at": time.time(),
            "timeout_seconds": timeout,
            "stdout": timeout_text(error.stdout),
            "stderr": timeout_text(error.stderr),
            "error": "timeout",
        }
        emit(evidence / f"{name}.json", item)
        return item
    item = {
        "argv": argv,
        "exit": cp.returncode,
        "started_at": started,
        "ended_at": time.time(),
        "stdout": cp.stdout,
        "stderr": cp.stderr,
        "stdout_sha256": hashlib.sha256(cp.stdout.encode()).hexdigest(),
        "stderr_sha256": hashlib.sha256(cp.stderr.encode()).hexdigest(),
    }
    emit(evidence / f"{name}.json", item)
    return item


def probe_local_mcp(
    profile: Path, project: Path, env: dict[str, str], evidence: Path
) -> dict:
    """Use the real stdio SDK against the installed disposable MCP entry."""
    config = profile / "home/.codex/config.toml"
    result: dict[str, object] = {
        "scope": "local stdio SDK and canonical overlay; no model or authenticated host",
        "config_sha256": sha(config),
    }
    try:
        import asyncio
        from datetime import timedelta
        import tomllib
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client

        entry = tomllib.loads(config.read_text())["mcp_servers"]["forgewright"]
        session_env = {**env, **entry.get("env", {})}
        session_env.update(
            {
                "FORGEWRIGHT_WORKSPACE": str(project),
                "FORGEWRIGHT_DEFERRED_SKILLS_JSON": '["software-engineer"]',
                "FORGEWRIGHT_SESSION_ID": "local-bootstrap-mcp-acceptance",
            }
        )

        async def check() -> None:
            params = StdioServerParameters(
                command=entry["command"],
                args=entry.get("args", []),
                env=session_env,
                cwd=project,
            )
            stderr_path = evidence / "local-mcp-probe.stderr.log"
            with stderr_path.open("w") as stderr:
                async with asyncio.timeout(45):
                    async with stdio_client(params, errlog=stderr) as (read, write):
                        async with ClientSession(
                            read, write, read_timeout_seconds=timedelta(seconds=20)
                        ) as session:
                            initialized = await session.initialize()
                            tools = await session.list_tools()
                            assert any(
                                t.name == "fw_load_skill_overlay" for t in tools.tools
                            )
                            overlay = await session.call_tool(
                                "fw_load_skill_overlay", {"name": "software-engineer"}
                            )
                            assert not overlay.isError, str(overlay)
                            content = "".join(
                                c.text for c in overlay.content if c.type == "text"
                            )
                            expected = (
                                ROOT / "skills/software-engineer/LITE.md"
                            ).read_text()
                            assert content == expected
                            result.update(
                                server=initialized.serverInfo.model_dump(),
                                tool_count=len(tools.tools),
                                overlay_sha256=hashlib.sha256(
                                    content.encode()
                                ).hexdigest(),
                                overlay_bytes=len(content.encode()),
                                canonical_overlay_matches=True,
                            )

        asyncio.run(check())
        lease_root = profile / "home/.forgewright/runtime/mcp-leases"
        leases = [json.loads(item.read_text()) for item in lease_root.glob("*.json")]
        selected = [
            item
            for item in leases
            if item.get("sessionId") == "local-bootstrap-mcp-acceptance"
        ]
        assert selected and all(item.get("status") == "closed" for item in selected)
        result.update(
            status="PASS",
            owned_leases=[
                {"leaseId": item["leaseId"], "status": item["status"]}
                for item in selected
            ],
        )
    except Exception as error:
        result.update(status="FAIL", error=repr(error))
    emit(evidence / "local-mcp-probe.json", result)
    return {"exit": 0 if result.get("status") == "PASS" else 1, **result}


def payload(result: dict) -> dict:
    try:
        return json.loads(result["stdout"])
    except json.JSONDecodeError:
        return {}


def ready(result: dict) -> bool:
    data = payload(result).get("data", {})
    state = data.get("state", data)
    return (
        result["exit"] == 0
        and data.get("status", state.get("status")) == "ready"
        and state.get("mode") == "full"
        and all(
            state.get("components", {}).get(k) == "ready"
            for k in ("gitnexus", "docs", "delegation", "global_runtime")
        )
    )


def idempotent_ensure_ready(result: dict) -> bool:
    """Accept only the canonical no-change result from a second full ensure."""
    data = payload(result).get("data", {})
    preflight = data.get("preflight", {})
    return (
        result["exit"] == 0
        and data.get("status") == "ready"
        and data.get("changed") is False
        and preflight.get("current_mode") == "full"
        and preflight.get("state") == "ready"
        and preflight.get("action") == "none"
        and preflight.get("reason") == "ready"
    )


def process_snapshot_ok(result: dict, tracked_pids: list[int]) -> bool:
    """Record ps, but use kernel PID liveness across BSD/GNU ps exit semantics."""
    if result.get("exit") not in (0, 1) or "error" in result:
        return False
    for pid in tracked_pids:
        if not isinstance(pid, int) or pid <= 0:
            return False
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            continue
        except PermissionError:
            return False
        else:
            return False
    return True


def snapshot(root: Path) -> dict[str, str]:
    return {
        str(p.relative_to(root)): sha(p)
        for p in sorted(root.rglob("*"))
        if p.is_file() and not p.is_symlink()
    }


def receipt_isolation(projects: list[Path]) -> dict:
    seen = set()
    failures = []
    for project in projects:
        receipt = project / ".forgewright/bootstrap.json"
        try:
            state = json.loads(receipt.read_text())
        except Exception as error:
            failures.append(f"{project}: unreadable receipt: {error}")
            continue
        digest = state.get("project_root_digest")
        if not isinstance(digest, str) or digest in seen:
            failures.append(f"{project}: missing or duplicate root digest")
        seen.add(digest)
        for owned in state.get("owned_paths", []):
            if owned.get("project_root_digest") != digest:
                failures.append(f"{project}: foreign owned-path digest")
            rel = owned.get("path", "")
            if (
                not isinstance(rel, str)
                or Path(rel).is_absolute()
                or ".." in Path(rel).parts
            ):
                failures.append(f"{project}: unsafe owned path")
    return {"ok": not failures, "failures": failures, "unique_digests": len(seen)}


def shared_asset_manifest(home: Path) -> dict[str, str]:
    roots = [
        home / ".config/forgewright/global-runtime.json",
        home / ".forgewright/mcp-server",
        home / ".forgewright/runtime",
        home / ".forgewright/skills",
        home / ".forgewright/scripts/runtime",
        home / ".forgewright/scripts/lite/policy-check.sh",
        home / ".forgewright/scripts/lite/telemetry.sh",
    ]
    ignored = {
        "admission",
        "locks",
        "transactions",
        "directory-rollbacks",
        "runtime-progress.json",
    }
    result = {}
    for root in roots:
        if root.is_file():
            result[str(root.relative_to(home))] = sha(root)
            continue
        if not root.is_dir():
            continue
        for child in root.rglob("*"):
            relative = child.relative_to(home)
            if (
                ignored.intersection(relative.parts)
                or not child.is_file()
                or child.is_symlink()
            ):
                continue
            result[str(relative)] = sha(child)
    return result


def git_init(project: Path, env: dict[str, str], *, empty: bool) -> None:
    project.mkdir()
    subprocess.run(
        [str(TOOLS["git"]), "init", str(project)],
        check=True,
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )
    if not empty:
        n = project.name
        (project / "app.py").write_text(f"print({n!r})\n")
        (project / "user-sentinel.txt").write_text(f"user-owned-{n}\n")
        subprocess.run(
            [
                str(TOOLS["git"]),
                "-C",
                str(project),
                "-c",
                "user.name=AB3 Harness",
                "-c",
                "user.email=ab3@example.invalid",
                "add",
                ".",
            ],
            check=True,
            env=env,
            timeout=30,
        )
        subprocess.run(
            [
                str(TOOLS["git"]),
                "-C",
                str(project),
                "-c",
                "user.name=AB3 Harness",
                "-c",
                "user.email=ab3@example.invalid",
                "commit",
                "-m",
                "fixture",
            ],
            check=True,
            capture_output=True,
            text=True,
            env=env,
            timeout=30,
        )


def admission_sample(db: Path) -> dict:
    if not db.is_file():
        return {"valid": False, "error": "admission database missing"}
    try:
        with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as con:
            rows = con.execute("SELECT kind,state,pid FROM jobs").fetchall()
        active = [r for r in rows if r[1] == "active"]
        queued = [r for r in rows if r[1] == "queued"]
        unreleased = [r for r in rows if r[1] != "released"]
        return {
            "valid": True,
            "active_workers": sum(r[0] == "worker" for r in active),
            "active_heavy": sum(r[0] == "heavy" for r in active),
            "queued_workers": sum(r[0] == "worker" for r in queued),
            "queued_heavy": sum(r[0] == "heavy" for r in queued),
            "unreleased_rows": unreleased,
            "tracked_pids": sorted({r[2] for r in rows if isinstance(r[2], int)}),
        }
    except sqlite3.Error as error:
        return {"valid": False, "error": str(error)}


def monitor_admission(db: Path, stop: threading.Event, samples: list[dict]) -> None:
    while not stop.is_set():
        sample = admission_sample(db)
        sample["at"] = time.time()
        samples.append(sample)
        time.sleep(0.02)


def retryable(result: dict) -> bool:
    text = json.dumps(payload(result)) + result["stderr"]
    return any(
        x in text
        for x in (
            "host_capacity_timeout",
            "host_admission_closed",
            "host_admission_unavailable",
        )
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--output-dir", type=Path)
    ap.add_argument("--scope", choices=("runtime", "e2e"), default="e2e")
    args = ap.parse_args()
    if not args.run or os.environ.get("FORGEWRIGHT_RUN_AUTO_BOOTSTRAP_RUNTIME") != "1":
        print(
            "refusing: require FORGEWRIGHT_RUN_AUTO_BOOTSTRAP_RUNTIME=1 and --run",
            file=sys.stderr,
        )
        return 2
    if not (
        NODE.is_file()
        and PYTHON.is_file()
        and (ROOT / "src/cli/dist/index.js").is_file()
        and all(path.is_file() for path in TOOLS.values())
    ):
        print("required Node24/Python/built CLI/jq unavailable", file=sys.stderr)
        return 2
    profile = Path(
        tempfile.mkdtemp(
            prefix="fw-ab3-real.", dir=os.environ.get("TMPDIR", "/private/tmp")
        )
    ).resolve(strict=True)
    run_id = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    evidence = (
        args.output_dir or RUNTIME_OUTPUT / f"auto-bootstrap-runtime-{run_id}"
    ).resolve()
    home = profile / "home"
    projects = profile / "projects"
    template = profile / "git-template"
    for p in (home, evidence, projects, template):
        p.mkdir(parents=True, exist_ok=True)
    env = {
        key: os.environ[key]
        for key in ("LANG", "LC_ALL", "LC_CTYPE", "TZ")
        if key in os.environ
    }
    env.update(
        {
            "PATH": os.pathsep.join(
                dict.fromkeys(
                    [str(NODE.parent), str(PYTHON.parent)]
                    + [str(path.parent) for path in TOOLS.values()]
                )
            )
            + os.pathsep
            + os.defpath,
            "HOME": str(home),
            "CODEX_HOME": str(home / ".codex"),
            "CLAUDE_CONFIG_DIR": str(home / ".claude"),
            "XDG_CONFIG_HOME": str(home / ".config"),
            "FORGEWRIGHT_HOME": str(home / ".forgewright"),
            "FORGEWRIGHT_BOOTSTRAP_HOME": str(home / ".config/forgewright"),
            "FORGEWRIGHT_RLG_HOME": str(home / ".forgewright/runtime"),
            "FORGEWRIGHT_ADMISSION_HOME": str(home / ".forgewright/runtime/admission"),
            "FORGEWRIGHT_BOOTSTRAP_PYTHON": str(PYTHON),
            "PYTHONDONTWRITEBYTECODE": "1",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_TEMPLATE_DIR": str(template),
            "TMPDIR": str(profile),
        }
    )
    version = subprocess.run(
        [str(NODE), "--version"], text=True, capture_output=True, env=env, timeout=15
    ).stdout.strip()
    if not version.startswith("v24."):
        print(f"refusing: expected Node 24, got {version}", file=sys.stderr)
        return 2
    tool_resolution = {name: shutil.which(name, path=env["PATH"]) for name in TOOLS}
    pinned_resolution = (
        tool_resolution.get("node") is not None
        and Path(tool_resolution["node"]).resolve() == NODE.resolve()
        and tool_resolution.get("python3") is not None
        and Path(tool_resolution["python3"]).resolve() == PYTHON.resolve()
    )
    if any(path is None for path in tool_resolution.values()) or not pinned_resolution:
        emit(
            evidence / "summary.json",
            {
                "profile": str(profile),
                "retained_profile": True,
                "scope": args.scope,
                "verdict": "FAIL",
                "reason": "required executable alias missing from sanitized PATH",
                "tool_resolution": tool_resolution,
                "environment_keys": sorted(env),
            },
        )
        print(
            json.dumps(
                {
                    "profile": str(profile),
                    "scope": args.scope,
                    "verdict": "FAIL",
                    "reason": "tool alias missing",
                }
            )
        )
        return 1
    emit(
        evidence / "tool-resolution.json",
        {
            "path": env["PATH"],
            "tools": tool_resolution,
            "pinned_resolution": pinned_resolution,
        },
    )
    source_before = source_sentinel()
    cli = [str(NODE), str(ROOT / "src/cli/dist/index.js"), "--json"]
    policy = command(
        cli
        + [
            "bootstrap",
            "policy",
            "set",
            "--mode",
            "full",
            "--auto",
            "on",
            "--mcp-clients",
            "codex,claude-code",
            "--pi-policy",
            "existing-subscription-only",
            "--forgewright-root",
            str(ROOT),
        ],
        env,
        evidence,
        "policy",
    )
    policy_data = payload(policy).get("data", {})
    launcher = Path(policy_data.get("launcher", ""))
    clean_profile = snapshot(home)
    if policy["exit"] or not launcher.is_file():
        emit(
            evidence / "summary.json",
            {
                "profile": str(profile),
                "verdict": "FAIL",
                "reason": "policy/launcher unavailable",
            },
        )
        return 1
    one = projects / "one"
    git_init(one, env, empty=True)
    first = command(
        [str(launcher), "--json", "bootstrap", "ensure", str(one), "--auto"],
        env,
        evidence,
        "one-first-ensure",
    )
    if not ready(first):
        admission_db = home / ".forgewright/runtime/admission/host.sqlite3"
        final_admission = admission_sample(admission_db)
        tracked_pids = final_admission.get("tracked_pids", [])
        ps_argv = (
            [
                str(TOOLS["ps"]),
                "-p",
                ",".join(map(str, tracked_pids)),
                "-o",
                "pid=,ppid=,pgid=,stat=",
            ]
            if tracked_pids
            else [str(TOOLS["true"])]
        )
        processes = command(ps_argv, env, evidence, "tracked-processes-after-failure")
        processes_ok = process_snapshot_ok(processes, tracked_pids)
        emit(
            evidence / "summary.json",
            {
                "profile": str(profile),
                "retained_profile": True,
                "scope": args.scope,
                "verdict": "FAIL",
                "reason": "first empty-project ensure did not become ready",
                "first_ensure": first,
                "verifier": str(Path(__file__).resolve()),
                "verifier_sha256": sha(Path(__file__).resolve()),
                "node_version": version,
                "jq": str(TOOLS["jq"]),
                "command": sys.argv,
                "environment_keys": sorted(env),
                "source_sentinel_before": source_before,
                "source_sentinel_after": source_sentinel(),
                "admission": final_admission,
                "tracked_processes_ok": processes_ok,
            },
        )
        print(
            json.dumps(
                {
                    "profile": str(profile),
                    "scope": args.scope,
                    "verdict": "FAIL",
                    "reason": "first ensure not ready",
                }
            )
        )
        return 1
    if ready(first):
        probe_result = probe_local_mcp(profile, one, env, evidence)
    else:
        probe_result = {
            "exit": 1,
            "status": "SKIPPED",
            "reason": "first ensure was not ready",
        }
        emit(evidence / "local-mcp-probe.json", probe_result)
    first_assets = shared_asset_manifest(home)
    first_receipt = (
        (one / ".forgewright/bootstrap.json").read_bytes()
        if (one / ".forgewright/bootstrap.json").is_file()
        else b""
    )
    second = command(
        [str(launcher), "--json", "bootstrap", "ensure", str(one), "--auto"],
        env,
        evidence,
        "one-idempotence-ensure",
    )
    second_assets = shared_asset_manifest(home)
    second_receipt = (
        (one / ".forgewright/bootstrap.json").read_bytes()
        if (one / ".forgewright/bootstrap.json").is_file()
        else b""
    )
    idempotent = (
        first_receipt == second_receipt
        and first_assets == second_assets
        and bool(first_assets)
    )
    probe_ok = probe_result["exit"] == 0
    if args.scope == "runtime":
        one_verify = command(
            [str(launcher), "--json", "bootstrap", "verify", str(one)],
            env,
            evidence,
            "one-verify",
        )
        admission_db = home / ".forgewright/runtime/admission/host.sqlite3"
        final_admission = admission_sample(admission_db)
        tracked_pids = final_admission.get("tracked_pids", [])
        ps_argv = (
            [
                str(TOOLS["ps"]),
                "-p",
                ",".join(map(str, tracked_pids)),
                "-o",
                "pid=,ppid=,pgid=,stat=",
            ]
            if tracked_pids
            else [str(TOOLS["true"])]
        )
        processes = command(ps_argv, env, evidence, "tracked-processes-after")
        processes_ok = process_snapshot_ok(processes, tracked_pids)
        source_after = source_sentinel()
        admission_ok = final_admission.get("valid") is True and not final_admission.get(
            "unreleased_rows"
        )
        verdict = (
            "PASS"
            if all(
                (
                    ready(first),
                    probe_ok,
                    idempotent_ensure_ready(second),
                    ready(one_verify),
                    idempotent,
                    source_before == source_after,
                    admission_ok,
                    processes_ok,
                )
            )
            else "FAIL"
        )
        emit(
            evidence / "summary.json",
            {
                "profile": str(profile),
                "retained_profile": True,
                "scope": args.scope,
                "verdict": verdict,
                "verifier": str(Path(__file__).resolve()),
                "verifier_sha256": sha(Path(__file__).resolve()),
                "node_version": version,
                "jq": str(TOOLS["jq"]),
                "command": sys.argv,
                "environment_keys": sorted(env),
                "tool_resolution": tool_resolution,
                "pinned_resolution": pinned_resolution,
                "probe_ok": probe_ok,
                "source_sentinel_before": source_before,
                "source_sentinel_after": source_after,
                "first_assets": first_assets,
                "second_assets": second_assets,
                "idempotence_ok": idempotent,
                "admission": final_admission,
                "tracked_processes_ok": processes_ok,
            },
        )
        print(
            json.dumps(
                {"profile": str(profile), "scope": args.scope, "verdict": verdict}
            )
        )
        return 0 if verdict == "PASS" else 1
    five = [projects / f"p{i}" for i in range(1, 6)]
    for p in five:
        git_init(p, env, empty=False)
    user_sentinels = {
        str(p): {
            "app.py": (p / "app.py").read_bytes(),
            "user-sentinel.txt": (p / "user-sentinel.txt").read_bytes(),
        }
        for p in five
    }

    def attempt(p: Path, label: str) -> tuple[Path, dict]:
        return p, command(
            [str(launcher), "--json", "bootstrap", "ensure", str(p), "--auto"],
            env,
            evidence,
            f"{p.name}-{label}",
        )

    admission_db = home / ".forgewright/runtime/admission/host.sqlite3"
    samples = []
    stop = threading.Event()
    watcher = threading.Thread(
        target=monitor_admission, args=(admission_db, stop, samples), daemon=True
    )
    watcher.start()
    try:
        with ThreadPoolExecutor(max_workers=5) as pool:
            initial = list(pool.map(lambda p: attempt(p, "initial"), five))
    finally:
        stop.set()
        watcher.join(timeout=1)
    emit(
        evidence / "admission-samples.json",
        {"database": str(admission_db), "samples": samples},
    )
    attempts = {str(p): [r] for p, r in initial}
    initial_successes = [str(p) for p, r in initial if ready(r)]
    initial_busy_or_rejected = [str(p) for p, r in initial if not ready(r)]
    retry_results = {}
    for p, r in initial:
        if r["exit"] and retryable(r):
            retry = attempt(p, "retry_1")[1]
            attempts[str(p)].append(retry)
            retry_results[str(p)] = {"exit": retry["exit"], "ready": ready(retry)}
    statuses = {
        str(p): command(
            [str(launcher), "--json", "bootstrap", "verify", str(p)],
            env,
            evidence,
            f"{p.name}-verify",
        )
        for p in [one, *five]
    }
    final_admission = admission_sample(admission_db)
    tracked_pids = final_admission.get("tracked_pids", [])
    ps_argv = (
        [
            str(TOOLS["ps"]),
            "-p",
            ",".join(map(str, tracked_pids)),
            "-o",
            "pid=,ppid=,pgid=,stat=",
        ]
        if tracked_pids
        else [str(TOOLS["true"])]
    )
    processes = command(ps_argv, env, evidence, "tracked-processes-after")
    processes_ok = process_snapshot_ok(processes, tracked_pids)
    peak_workers = max((x.get("active_workers", -1) for x in samples), default=-1)
    peak_heavy = max((x.get("active_heavy", -1) for x in samples), default=-1)
    isolation = receipt_isolation([one, *five])
    source_after = source_sentinel()
    samples_valid = bool(samples) and all(x.get("valid") is True for x in samples)
    caps_ok = (
        samples_valid
        and peak_workers <= 2
        and peak_heavy <= 1
        and final_admission.get("valid") is True
        and not final_admission.get("unreleased_rows")
    )
    sentinels_ok = all(
        (p / "app.py").read_bytes() == saved["app.py"]
        and (p / "user-sentinel.txt").read_bytes() == saved["user-sentinel.txt"]
        for p, saved in ((Path(key), value) for key, value in user_sentinels.items())
    )
    initial_concurrency_ok = len(initial_successes) == len(five)
    verdict = (
        "PASS"
        if ready(first)
        and probe_ok
        and idempotent_ensure_ready(second)
        and initial_concurrency_ok
        and all(ready(v) for v in statuses.values())
        and source_before == source_after
        and caps_ok
        and isolation["ok"]
        and idempotent
        and sentinels_ok
        and processes_ok
        else "FAIL"
    )
    emit(
        evidence / "summary.json",
        {
            "profile": str(profile),
            "retained_profile": True,
            "scope": args.scope,
            "verdict": verdict,
            "verifier": str(Path(__file__).resolve()),
            "verifier_sha256": sha(Path(__file__).resolve()),
            "node_version": version,
            "jq": str(TOOLS["jq"]),
            "command": sys.argv,
            "environment_keys": sorted(env),
            "tool_resolution": tool_resolution,
            "pinned_resolution": pinned_resolution,
            "probe_ok": probe_ok,
            "source_sentinel_before": source_before,
            "source_sentinel_after": source_after,
            "clean_profile_manifest": clean_profile,
            "first_assets": first_assets,
            "second_assets": second_assets,
            "idempotence_project_receipt_unchanged": first_receipt == second_receipt,
            "shared_asset_manifest_unchanged": first_assets == second_assets,
            "idempotence_ok": idempotent,
            "user_sentinels_unchanged": sentinels_ok,
            "initial_concurrency": {
                "successes": initial_successes,
                "busy_or_rejected": initial_busy_or_rejected,
                "all_ready": initial_concurrency_ok,
            },
            "retries": retry_results,
            "attempts": {
                k: [{"exit": x["exit"], "retryable": retryable(x)} for x in v]
                for k, v in attempts.items()
            },
            "receipt_isolation": isolation,
            "admission": {
                "database": str(admission_db),
                "peak_workers": peak_workers,
                "peak_heavy": peak_heavy,
                "final": final_admission,
                "cap_ok": caps_ok,
            },
            "tracked_process_snapshot_file": "tracked-processes-after.json",
            "tracked_processes_ok": processes_ok,
            "note": "Cap values come from sampled real admission SQLite rows, retained verbatim in admission-samples.json; exits alone never prove caps.",
        },
    )
    print(json.dumps({"profile": str(profile), "verdict": verdict}))
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
