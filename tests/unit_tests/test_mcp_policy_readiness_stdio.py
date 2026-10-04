"""Real stdio first-use policy readiness; no bootstrap/client bypass."""

import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import time
import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("scenario", ["activation", "pending-eof"])
def test_same_mcp_process_waits_for_policy_and_rejects_replacement(tmp_path, scenario):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    leases = tmp_path / "leases"
    trajectories = tmp_path / "trajectories"
    leases.mkdir(mode=0o700)
    trajectories.mkdir(mode=0o700)
    env = {
        **os.environ,
        "FORGEWRIGHT_WORKSPACE": str(workspace),
        "FORGEWRIGHT_MCP_LEASE_ROOT": str(leases),
        "FORGEWRIGHT_TRAJECTORY_ROOT": str(trajectories),
        "FORGEWRIGHT_SESSION_ID": "policy-readiness-stdio",
    }
    child = subprocess.Popen(
        ["node", str(ROOT / "mcp/build/index.js")],
        cwd=workspace,
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    selector = selectors.DefaultSelector()
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    messages = []
    deadline = time.monotonic() + 30
    total = 0
    for stream, name in ((child.stdout, "stdout"), (child.stderr, "stderr")):
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ, name)

    def send(message):
        child.stdin.write((json.dumps(message) + "\n").encode())
        child.stdin.flush()

    def pump():
        nonlocal total
        assert time.monotonic() < deadline, "Unchanged 30s stdio deadline"
        for key, _ in selector.select(0.1):
            block = os.read(key.fd, 65536)
            if not block:
                selector.unregister(key.fileobj)
                continue
            total += len(block)
            assert total < 1024 * 1024
            buffers[key.data].extend(block)
            if key.data == "stdout":
                while b"\n" in buffers["stdout"]:
                    line, _, rest = buffers["stdout"].partition(b"\n")
                    buffers["stdout"][:] = rest
                    messages.append(json.loads(line))
                    assert len(messages) <= 128

    def response(identifier):
        while True:
            found = [r for r in messages if r.get("id") == identifier]
            if found:
                assert len(found) == 1 and "error" not in found[0], found
                return found[0]["result"]
            assert child.poll() is None, buffers["stderr"].decode(errors="replace")
            pump()

    def call(identifier, name="fw_get_current_phase", arguments=None):
        send(
            {
                "jsonrpc": "2.0",
                "id": identifier,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments or {}},
            }
        )
        return response(identifier)

    try:
        send(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "policy-readiness-test", "version": "1"},
                },
            }
        )
        assert response(1)["protocolVersion"] == "2024-11-05"
        send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
        send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        assert len(response(2)["tools"]) == 17
        rejected = call(3, "fw_start_pipeline", {"mode": "Feature"})
        assert rejected.get("isError") is True
        assert "EXECUTION_POLICY_NOT_READY" in json.dumps(rejected)
        assert list(workspace.iterdir()) == [], (
            "Pending calls must not write project state"
        )
        if scenario == "pending-eof":
            child.stdin.close()
            while selector.get_map():
                pump()
            assert child.wait(timeout=5) == 0
            owned = [json.loads(p.read_text()) for p in leases.glob("*.json")]
            assert (
                len(owned) == 1
                and owned[0]["status"] == "closed"
                and owned[0]["inFlight"] == 0
            )
            assert list(workspace.iterdir()) == []
            assert not list(leases.glob("*.lock"))
            return

        # A trusted external bootstrap creates the canonical policy; MCP does not.
        policy_dir = workspace / ".forgewright"
        policy_dir.mkdir()
        policy = policy_dir / "execution-policy.yaml"
        shutil.copyfile(ROOT / ".forgewright/execution-policy.yaml", policy)
        if os.name != "nt":
            policy.chmod(0o666)
            invalid = call(7, "fw_start_pipeline", {"mode": "Feature"})
            assert invalid.get("isError") is True
            assert "EXECUTION_POLICY_INVALID" in json.dumps(invalid)
            assert list(policy_dir.iterdir()) == [policy]
        policy.chmod(0o600)
        ready = call(4)
        assert not ready.get("isError"), ready
        assert "Phase:" in json.dumps(ready)
        succeeded = call(5, "fw_start_pipeline", {"mode": "Feature"})
        assert not succeeded.get("isError"), succeeded
        before = {
            str(p.relative_to(workspace)): p.read_bytes()
            for p in workspace.rglob("*")
            if p.is_file()
        }
        replacement = policy_dir / "replacement.yaml"
        replacement.write_bytes(policy.read_bytes())
        os.replace(replacement, policy)
        denied = call(6, "fw_start_pipeline", {"mode": "Other"})
        assert denied.get("isError") is True
        assert "CONTAINMENT_POLICY_CHANGED" in json.dumps(denied)
        assert before == {
            str(p.relative_to(workspace)): p.read_bytes()
            for p in workspace.rglob("*")
            if p.is_file()
        }
        child.stdin.close()
        while selector.get_map():
            pump()
        assert child.wait(timeout=5) == 0
        owned = [json.loads(p.read_text()) for p in leases.glob("*.json")]
        assert (
            len(owned) == 1
            and owned[0]["status"] == "closed"
            and owned[0]["inFlight"] == 0
        )
        assert not list(leases.glob("*.lock"))
    finally:
        if child.stdin and not child.stdin.closed:
            child.stdin.close()
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
        selector.close()
        for stream in (child.stdout, child.stderr):
            stream.close()
