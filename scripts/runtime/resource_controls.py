"""Finite owner controls. No shell, process launch, or execution authority.

Registration is a local owner review boundary; hashes do not authenticate a
hostile same-user writer. Source/profile validation remains mandatory at launch.
"""
import json
import os
from pathlib import Path
import re
import stat
import time

from host_job_profiles import digest, install_profile, validate_profile
from project_storage import _open_directory


class ControlError(ValueError):
    pass


def _parts(name):
    if not isinstance(name, str) or not 1 <= len(name) <= 4096 or "\0" in name:
        raise ControlError("invalid-inspection-path")
    path = Path(name)
    if path.is_absolute() or ".." in path.parts:
        raise ControlError("unsafe-inspection-path")
    parts = path.parts
    for i, part in enumerate(parts):
        folded = part.casefold()
        if (folded in {".git", ".ssh", ".codex", ".aws", ".gnupg"}
                or folded == ".env" or folded.startswith(".env.")
                or folded.endswith((".pem", ".key", ".p12"))
                or folded in {"credentials", "id_rsa", "id_ed25519"}
                or (i and parts[i - 1].casefold() == ".forgewright"
                    and folded in {"memory", "memory.db", "memory.db-wal", "memory.db-shm", "runtime", "verify"})):
            raise ControlError("private-inspection-path")
    return parts


def _open(root_fd, parts):
    """Walk from an anchored directory, rejecting symlinks at every hop."""
    descriptor = os.dup(root_fd)
    try:
        for i, part in enumerate(parts):
            flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
            if i < len(parts) - 1:
                flags |= os.O_DIRECTORY
            child = os.open(part, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _bounded_file(root_fd, parts, limit, *, private=False):
    descriptor = _open(root_fd, parts)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise ControlError("inspection-file-budget")
        if private and (info.st_uid != os.getuid() or info.st_mode & 0o077):
            raise ControlError("unsafe-profile-file")
        raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise ControlError("inspection-file-budget")
        return raw


def _integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ControlError("invalid-inspection-budget")
    return value


def inspect_workspace(project, request):
    """Read at most 1 MiB, scan 10,000 entries/2 seconds, emit <=64 KiB."""
    if not isinstance(request, dict) or len(json.dumps(request)) > 8192:
        raise ControlError("invalid-inspection")
    operation = request.get("op")
    allowed = {"read": {"op", "path", "start", "lines"},
               "list": {"op", "path"}, "search": {"op", "path", "query"}}
    if operation not in allowed or set(request) - allowed[operation]:
        raise ControlError("invalid-inspection")
    parts = _parts(request.get("path", "."))
    root = _open_directory(Path(project).resolve(strict=True))
    result = {"authority": "read-only", "op": operation, "truncated": False}
    try:
        if operation == "read":
            start = _integer(request.get("start", 1), 1, 100000)
            count = _integer(request.get("lines", 200), 1, 1000)
            raw = _bounded_file(root, parts, 1024**2)
            lines = raw.decode("utf-8").splitlines(keepends=True)
            text = "".join(lines[start - 1:start - 1 + count])
            encoded = text.encode()
            result.update(text=encoded[:10000].decode("utf-8", errors="ignore"),
                          sha256=digest(raw),
                          truncated=len(encoded) > 10000 or len(lines) >= start + count)
            return result
        query = request.get("query")
        if operation == "search" and (not isinstance(query, str) or not 1 <= len(query) <= 256):
            raise ControlError("invalid-inspection-query")
        pending = [parts]
        entries = []; matches = []; visited = 0; read_bytes = 0; emitted = 0
        deadline = time.monotonic() + 2
        while pending:
            if time.monotonic() > deadline or visited >= 10000 or emitted >= 60000:
                result["truncated"] = True; break
            current = pending.pop()
            descriptor = _open(root, current)
            try:
                info = os.fstat(descriptor)
                if stat.S_ISDIR(info.st_mode):
                    # scandir is incremental; never allocate an unbounded listdir.
                    with os.scandir(descriptor) as scan:
                        for entry in scan:
                            visited += 1
                            if visited > 10000 or time.monotonic() > deadline:
                                result["truncated"] = True; pending.clear(); break
                            candidate = (*current, entry.name)
                            try:
                                _parts(str(Path(*candidate)))
                            except ControlError:
                                continue
                            if entry.is_symlink():
                                continue
                            if operation == "list":
                                emitted += len(json.dumps(entry.name).encode()) + 8
                                if len(entries) >= 1000 or emitted > 60000:
                                    result["truncated"] = True; break
                                entries.append(entry.name)
                            elif entry.name not in {"node_modules", ".venv", "vendor"}:
                                pending.append(candidate)
                                if len(pending) >= 10000:
                                    result["truncated"] = True; break
                elif stat.S_ISREG(info.st_mode) and operation == "search":
                    if info.st_size > 256 * 1024 or read_bytes + info.st_size > 1024**2:
                        result["truncated"] = True; continue
                    raw = _bounded_file(root, current, 256 * 1024)
                    read_bytes += len(raw)
                    if b"\0" in raw:
                        continue
                    for number, line in enumerate(raw.decode("utf-8", errors="replace").splitlines(), 1):
                        if query in line:
                            item = {"path": str(Path(*current)), "line": number, "text": line[:1000]}
                            emitted += len(json.dumps(item).encode())
                            if len(matches) >= 100 or emitted > 60000:
                                result["truncated"] = True; pending.clear(); break
                            matches.append(item)
            finally:
                os.close(descriptor)
            if operation == "list":
                break
        result.update(entries=sorted(entries)) if operation == "list" else result.update(matches=sorted(matches, key=lambda x: (x["path"], x["line"])))
        return result
    except (OSError, UnicodeError) as error:
        raise ControlError("inspection-unavailable") from error
    finally:
        os.close(root)


def register_profile(home, project, filename, expected):
    """Install an exact owner-reviewed project recipe, without launching it."""
    from resource_enrollment import locked, registry, save, validate_binding

    project = Path(project).resolve(strict=True)
    path = Path(filename)
    if path.is_absolute():
        try:
            path = path.relative_to(project)
        except ValueError as error:
            raise ControlError("profile-outside-project") from error
    parts = _parts(str(path))
    if len(parts) < 3 or parts[:2] != (".forgewright", "recipes") or path.suffix != ".json":
        raise ControlError("project-recipe-required")
    if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ControlError("invalid-profile-sha256")
    root = _open_directory(project)
    try:
        raw = _bounded_file(root, parts, 16384, private=True)
    finally:
        os.close(root)
    if digest(raw) != expected:
        raise ControlError("reviewed-profile-drift")
    value = json.loads(raw)
    if value.get("project") != str(project):
        raise ControlError("profile-project-mismatch")
    validate_profile(value)
    with locked(Path(home)):
        values = registry(Path(home)); enrollment = values.get(str(project))
        if enrollment:
            validate_binding(enrollment)
            if value["id"] not in enrollment["profiles"] and len(enrollment["profiles"]) >= 8:
                raise ControlError("enrollment-profile-limit")
        installed = install_profile(home, value)
        if enrollment:
            enrollment["profiles"][value["id"]] = installed
            save(Path(home), values)
    return {"status": "registered", "profile": value["id"], "digest": installed,
            "executed": False, "enrolled": bool(enrollment)}
