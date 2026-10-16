"""Observed explicit-memory flow through API, fresh CLI, or CLI consumer.

Synthetic fixtures only. Consumer mode exercises the compatibility launcher and
context-manager, not a native host's automatic model-context injection.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/memory"))


def run(mode):
    from memory_flow import capture, context

    with tempfile.TemporaryDirectory(prefix="forgewright-memory-smoke-") as scratch:
        workspace = Path(scratch)
        for key in tuple(os.environ):
            if key.startswith(("MEM0_", "MEMORY_", "FORGEWRIGHT_SESSION")):
                os.environ.pop(key)
        os.environ.pop("FORGEWRIGHT_SKIP_MEM0", None)
        os.environ["FORGEWRIGHT_WORKSPACE"] = scratch
        os.environ["FORGEWRIGHT_SESSION"] = "chat-a"
        core = ROOT / "scripts/memory/mem0-v2.py"
        launcher = ROOT / "scripts/mem0-v2.py" if mode == "consumer" else core

        def process(path, *args, payload=None, session="chat-a"):
            return subprocess.run(
                [sys.executable, str(path), *args],
                cwd=workspace,
                env={**os.environ, "FORGEWRIGHT_SESSION": session},
                input=json.dumps(payload) if payload is not None else None,
                capture_output=True,
                text=True,
                timeout=15,
            )

        def write(event, payload):
            if mode == "api":
                try:
                    return capture(payload, "chat-a", event)
                except (ValueError, OSError, RuntimeError, sqlite3.Error):
                    return {"status": "degraded"}
            result = process(
                launcher,
                "capture",
                "--session",
                "chat-a",
                "--event",
                event,
                payload=payload,
            )
            data = json.loads(result.stdout)
            assert (result.returncode != 0) == (data["status"] == "degraded"), (
                result.stderr
            )
            return data

        def read(query, session="chat-a", cap=400):
            if mode == "api":
                return context(query, session, cap)["context"]
            if mode == "consumer":
                result = process(
                    ROOT / "scripts/lite/context-manager.py",
                    "load",
                    "--keywords",
                    query,
                    "--char-cap",
                    str(cap),
                    session=session,
                )
            else:
                result = process(
                    core, "context", query, "--session", session, "--char-cap", str(cap)
                )
            assert result.returncode == 0, result.stderr
            return result.stdout

        source = workspace / "engine.txt"
        source.write_text("Phaser 4", encoding="utf-8")
        payload = {
            "kind": "decision",
            "scope": "project",
            "summary": "Use Phaser 4 for the synthetic Signal Garden game",
            "source_refs": [
                {
                    "path": "engine.txt",
                    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                }
            ],
        }
        first = write("engine-choice", payload)
        assert first["status"] == "captured", first
        assert (workspace / first["checkpoint_ref"]).is_file()
        replay = write("engine-choice", payload)
        assert (
            replay["status"] == "duplicate"
            and replay["observation_id"] == first["observation_id"]
        )
        packet = read("Phaser", session="chat-b")
        assert "Phaser 4" in packet and f"mem0:{first['observation_id']}" in packet
        assert "untrusted" in packet.lower() and len(packet) <= 400
        assert read("orbitalquasar") == ""

        conflict = write("engine-choice", {**payload, "scope": "session"})
        assert conflict["status"] == "degraded", (
            "Replaying one event into a new scope must conflict"
        )
        secret = "sk-" + "X" * 24
        private = write(
            "private-choice",
            {"kind": "remember", "summary": "Nebulamarker private fact " + secret},
        )
        assert private["status"] == "captured"
        own = read("Nebulamarker")
        assert "Nebulamarker" in own and secret not in own
        assert read("Nebulamarker", session="chat-b") == ""
        source.write_text("Three.js", encoding="utf-8")
        assert read("Phaser") == ""
        os.environ["MEM0_DISABLED"] = "true"
        assert read("Nebulamarker") == ""
        assert write("disabled", payload)["status"] == "disabled"
        os.environ["FORGEWRIGHT_WORKSPACE"] = str(workspace / "empty")
        (workspace / "empty").mkdir()
        assert write("disabled-empty", payload)["status"] == "disabled"
        assert not (workspace / "empty/.forgewright").exists()
        print(
            json.dumps(
                {
                    "mode": mode,
                    "status": "passed",
                    "boundary": {
                        "api": "direct Python API",
                        "cli": "fresh canonical CLI processes",
                        "consumer": "compatibility CLI to context-manager consumer",
                    }[mode],
                    "native_automatic_injection": "unverified",
                }
            )
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("api", "cli", "consumer"))
    run(parser.parse_args().mode)
