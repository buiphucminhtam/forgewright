"""Compiled source MCP stdio with private stores and synthetic held locks."""

import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]


def test_compiled_mcp_starts_with_contended_private_leases_and_closes_own_lease(
    tmp_path,
):
    workspace = tmp_path / "workspace"
    (workspace / ".forgewright").mkdir(parents=True)
    shutil.copyfile(
        ROOT / ".forgewright/execution-policy.yaml",
        workspace / ".forgewright/execution-policy.yaml",
    )
    leases = tmp_path / "leases"
    leases.mkdir(mode=0o700)
    temporary = tmp_path / "tmp"
    temporary.mkdir(mode=0o700)
    before = {}
    locks = []
    for index in range(25):
        identifier = f"mcp-{index:032x}"
        identity = {
            "pid": os.getpid(),
            "pidStartedAt": "IMPOSSIBLE-FIXTURE-BIRTH",
            "pgid": os.getpgrp(),
            "parentPid": os.getppid(),
            "parentStartedAt": "IMPOSSIBLE-FIXTURE-PARENT",
            "commandDigest": "0" * 64,
        }
        record = {
            "schema": "forgewright-mcp-lifecycle-lease/v1",
            "leaseId": identifier,
            "ownerToken": "0" * 64,
            "version": 1,
            "workspaceId": "private-fixture",
            "sessionId": "synthetic",
            "identity": identity,
            "commandDigest": identity["commandDigest"],
            "issuedAtMs": 0,
            "expiresAtMs": 1,
            "inFlight": 0,
            "status": "open",
        }
        path = leases / (identifier + ".json")
        path.write_text(json.dumps(record))
        locks.append(
            os.open(
                leases / (identifier + ".lock"),
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                0o600,
            )
        )
    for path in leases.iterdir():
        before[path.name] = (path.stat().st_ino, path.read_bytes())
    environment = {
        **os.environ,
        "FORGEWRIGHT_WORKSPACE": str(workspace),
        "FORGEWRIGHT_MCP_LEASE_ROOT": str(leases),
        "FORGEWRIGHT_TRAJECTORY_ROOT": str(tmp_path / "trajectories"),
        "FORGEWRIGHT_TRAJECTORY_ID": "stdio-contention",
        "FORGEWRIGHT_SESSION_ID": "stdio-contention",
        "TMPDIR": str(temporary),
    }
    child = None
    selector = selectors.DefaultSelector()
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    messages = []
    total_bytes = 0
    started = time.monotonic()
    deadline = started + 30
    try:
        child = subprocess.Popen(
            ["node", str(ROOT / "mcp/build/index.js")],
            cwd=workspace,
            env=environment,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        for stream, name in ((child.stdout, "stdout"), (child.stderr, "stderr")):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, name)

        def send(value):
            child.stdin.write((json.dumps(value) + "\n").encode())
            child.stdin.flush()

        def pump():
            nonlocal total_bytes
            assert time.monotonic() < deadline, (
                "MCP protocol/EOF exceeded the unchanged30s bound"
            )
            for key, _ in selector.select(0.1):
                block = os.read(key.fd, 65536)
                if not block:
                    selector.unregister(key.fileobj)
                    continue
                total_bytes += len(block)
                assert total_bytes < 1024 * 1024, "MCP cumulative output bound"
                buffers[key.data].extend(block)
                if key.data == "stdout":
                    while b"\n" in buffers["stdout"]:
                        line, _, rest = buffers["stdout"].partition(b"\n")
                        buffers["stdout"][:] = rest
                        messages.append(json.loads(line))
                        assert len(messages) <= 128, "MCP message bound"

        def response(identifier):
            while True:
                assert time.monotonic() < deadline, (
                    "MCP did not initialize/list within the unchanged30s bound"
                )
                matched = [value for value in messages if value.get("id") == identifier]
                if matched:
                    assert len(matched) == 1 and "error" not in matched[0], matched
                    return matched[0]["result"]
                assert child.poll() is None, buffers["stderr"].decode(errors="replace")
                pump()

        send(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "source-contention-test", "version": "1"},
                },
            }
        )
        initialized = response(1)
        assert initialized["protocolVersion"] == "2024-11-05"
        send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
        send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        catalog = response(2)
        assert len(catalog["tools"]) == 17
        assert len({tool["name"] for tool in catalog["tools"]}) == 17
        child.stdin.close()
        while selector.get_map():
            pump()
        assert child.wait(timeout=10) == 0
        assert (
            buffers["stderr"]
            .decode()
            .count("Lease reconciliation refused: reconcile_error")
            == 25
        )
        assert all(
            (leases / name).stat().st_ino == inode
            and (leases / name).read_bytes() == data
            for name, (inode, data) in before.items()
        )
        own = [
            json.loads(path.read_text())
            for path in leases.glob("*.json")
            if path.name not in before
        ]
        assert (
            len(own) == 1 and own[0]["status"] == "closed" and own[0]["inFlight"] == 0
        )
        assert {path.name for path in leases.glob("*.lock")} == {
            name for name in before if name.endswith(".lock")
        }
    finally:
        cleanup_errors = []
        try:
            if child is not None:
                try:
                    if child.stdin and not child.stdin.closed:
                        child.stdin.close()
                except OSError as error:
                    cleanup_errors.append(type(error).__name__)
                try:
                    if child.poll() is None:
                        child.terminate()
                        try:
                            child.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            child.kill()
                            child.wait(timeout=5)
                except (OSError, subprocess.SubprocessError) as error:
                    cleanup_errors.append(type(error).__name__)
                for stream in (child.stdout, child.stderr):
                    try:
                        stream.close()
                    except OSError as error:
                        cleanup_errors.append(type(error).__name__)
        finally:
            try:
                selector.close()
            finally:
                for descriptor in locks:
                    try:
                        os.close(descriptor)
                    except OSError as error:
                        cleanup_errors.append(type(error).__name__)
        assert not cleanup_errors, cleanup_errors
