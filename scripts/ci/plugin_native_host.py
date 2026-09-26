"""Native Codex hook discovery; metadata inspection does not call a model."""

from __future__ import annotations

import hashlib
import json
import os
import queue
import signal
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any


def export_source_tree(root: Path, destination: Path) -> dict[str, Any]:
    """Export Git-visible candidate files, never ignored dependencies/runtime state."""
    root = root.resolve()
    destination = destination.resolve()
    if destination.is_relative_to(root):
        raise ValueError("plugin export must be outside its source checkout")
    top = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=True,
        timeout=5,
    )
    if Path(top.stdout.strip()).resolve() != root:
        raise ValueError("plugin export requires a repository root")
    listing = subprocess.run(
        [
            "git",
            "-C",
            str(root),
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
        ],
        capture_output=True,
        check=True,
        timeout=10,
    ).stdout
    destination.mkdir(parents=True, exist_ok=False)
    digest = hashlib.sha256()
    count = 0
    for raw in sorted(set(listing.split(b"\0"))):
        if not raw:
            continue
        relative = Path(os.fsdecode(raw))
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("unsafe plugin source path")
        source = root / relative
        if not source.exists() and not source.is_symlink():
            continue
        if (
            source.is_symlink()
            or not source.is_file()
            or any((root / parent).is_symlink() for parent in relative.parents)
            or not source.resolve().is_relative_to(root)
        ):
            raise ValueError(
                "plugin export requires regular source files: " + str(relative)
            )
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        digest.update(raw + b"\0" + hashlib.sha256(target.read_bytes()).digest())
        count += 1
    return {"files": count, "source_sha256": digest.hexdigest()}


def codex_hook_metadata(
    codex: str, env: dict[str, str], project: Path
) -> list[dict[str, Any]]:
    process = subprocess.Popen(
        [codex, "app-server"],
        cwd=project,
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        start_new_session=os.name != "nt",
    )
    messages: queue.Queue[Any] = queue.Queue()

    def receive() -> None:
        assert process.stdout is not None
        total = 0
        for line in process.stdout:
            total += len(line)
            if total > 8 * 1024 * 1024:
                messages.put(RuntimeError("Codex metadata output exceeded bound"))
                return
            try:
                messages.put(json.loads(line))
            except json.JSONDecodeError:
                continue
        messages.put(RuntimeError("Codex metadata process closed"))

    reader = threading.Thread(target=receive, daemon=True)
    reader.start()

    def request(identifier: int, method: str, params: dict[str, Any]) -> Any:
        assert process.stdin is not None
        process.stdin.write(
            json.dumps({"id": identifier, "method": method, "params": params}) + "\n"
        )
        process.stdin.flush()
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                response = messages.get(timeout=max(0.01, deadline - time.monotonic()))
            except queue.Empty as error:
                raise RuntimeError("Codex metadata request timed out") from error
            if isinstance(response, Exception):
                raise response
            if response.get("id") != identifier:
                continue
            if response.get("error"):
                raise RuntimeError("Codex metadata request rejected: " + method)
            return response["result"]
        raise RuntimeError("Codex metadata deadline exceeded")

    try:
        request(
            1,
            "initialize",
            {
                "clientInfo": {"name": "forgewright-native-verifier", "version": "1.0"},
                "capabilities": {"experimentalApi": True},
            },
        )
        assert process.stdin is not None
        process.stdin.write('{"method":"initialized"}\n')
        process.stdin.flush()
        result = request(2, "hooks/list", {"cwds": [str(project)]})
        entries = result.get("data", [])
        if any(entry.get("errors") for entry in entries):
            raise RuntimeError("Native hook metadata reports configuration errors")
        return [
            hook
            for entry in entries
            for hook in entry.get("hooks", [])
            if hook.get("source") == "plugin"
            and hook.get("pluginId") == "forgewright@forgewright-marketplace"
        ]
    finally:
        if process.stdin:
            process.stdin.close()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                process.terminate()
            else:
                os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                if os.name == "nt":
                    process.kill()
                else:
                    os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
        reader.join(timeout=1)


def verify_codex_hook(
    root: Path, codex: str, env: dict[str, str], project: Path
) -> dict[str, Any]:
    hooks = codex_hook_metadata(codex, env, project)
    if len(hooks) != 1:
        raise RuntimeError(
            "Native Codex must discover exactly one Forgewright hook, not just list the installed plugin"
        )
    hook = hooks[0]
    if (
        hook.get("eventName") != "preToolUse"
        or hook.get("handlerType") != "command"
        or not hook.get("enabled")
    ):
        raise RuntimeError("Native Codex hook contract mismatch")
    installed_hooks = Path(hook["sourcePath"]).parent
    for name in ("hooks.json", "auto-bootstrap.mjs", "bootstrap-process.mjs"):
        expected = hashlib.sha256((root / "hooks" / name).read_bytes()).hexdigest()
        actual = hashlib.sha256((installed_hooks / name).read_bytes()).hexdigest()
        if expected != actual:
            raise RuntimeError(
                "Installed Codex hook bytes differ from candidate: " + name
            )
    return hook
