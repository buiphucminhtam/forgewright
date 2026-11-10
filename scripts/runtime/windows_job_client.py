#!/usr/bin/env python3
"""Parent-side Windows job completion proof; process exit alone is not proof.

Supply a parent explicitly; missing directories are created with protected private
DACLs, while existing ACLs are never changed. Call prepare before spawn, keep the supervisor's stdin owner pipe open while
running, then validate its reaped return code before releasing any resources.
cleanup removes only receipt.json and its empty, identity-bound directory.
The nonce prevents accidental/replayed completion, not hostile same-user forgery.
No workload output is used as a completion channel.
"""

from __future__ import annotations

import argparse
import ctypes
import json
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import tempfile

SCHEMA = "forgewright-windows-job-completion/v1"
MAX_RECEIPT_BYTES = 4096
RECEIPT_NAME = "receipt.json"
DIRECTORY_PREFIX = "forgewright-job-"


class CompletionError(RuntimeError):
    """Completion or caller-owned cleanup could not be established."""


def _support():
    if os.name != "nt":
        raise CompletionError("Windows completion requires a native Windows runtime")
    # Isolated interpreters do not add the script directory. Both locations
    # belong to the installed framework, never the workload's cwd/PYTHONPATH.
    runtime = Path(__file__).resolve().parent
    for directory in (runtime, runtime.parent / "lite"):
        if str(directory) not in sys.path:
            sys.path.insert(0, str(directory))
    import windows_secure_io
    from windows_security import is_private_path
    return windows_secure_io, is_private_path


def _token(token):
    if not isinstance(token, str) or re.fullmatch(r"[0-9a-f]{64}", token) is None:
        raise CompletionError("invalid completion token")


def _location(path):
    path = Path(path)
    if not path.is_absolute() or ".." in path.parts or path.name != RECEIPT_NAME:
        raise CompletionError("invalid completion path")
    if not path.parent.name.startswith(DIRECTORY_PREFIX):
        raise CompletionError("invalid completion directory")
    io, private = _support()
    for part in path.parts[1:]:
        io._safe_basename(part)
    return path, io, private


def _private_directory(path, private, identity=None):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or not private(path):
        raise CompletionError("unsafe completion directory")
    actual = (info.st_dev, info.st_ino)
    if identity is not None and actual != tuple(identity):
        raise CompletionError("completion directory identity changed")
    return actual


def check_completion_target(path, token):
    """Supervisor preflight: fresh leaf under a pinned owner-controlled parent."""
    _token(token)
    try:
        path, io, private = _location(path)
        with io.locked_directory_chain(Path(path.anchor), path.parent):
            _private_directory(path.parent.parent, private)
            _private_directory(path.parent, private)
            try:
                path.lstat()
            except FileNotFoundError:
                return
            raise CompletionError("completion target already exists")
    except (OSError, ValueError) as error:
        raise CompletionError("unsafe completion target") from error


def _open_receipt(path):
    """Open the leaf itself, denying concurrent writes/deletes while inspecting."""
    import msvcrt
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    pointer, dword = ctypes.c_void_p, ctypes.c_uint32
    create = kernel.CreateFileW
    create.argtypes = [ctypes.c_wchar_p, dword, dword, pointer, dword, dword, pointer]
    create.restype = pointer
    close = kernel.CloseHandle
    close.argtypes, close.restype = [pointer], ctypes.c_int32
    query = kernel.GetFileInformationByHandleEx
    query.argtypes, query.restype = [pointer, ctypes.c_int, pointer, dword], ctypes.c_int32
    handle = create(str(path), 0x80000000, 1, None, 3, 0x02200000, None)
    if not handle or handle == pointer(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        attributes = (dword * 2)()
        if not query(handle, 9, ctypes.byref(attributes), ctypes.sizeof(attributes)):
            raise ctypes.WinError(ctypes.get_last_error())
        if attributes[0] & (0x400 | 0x10):
            raise CompletionError("completion leaf is a directory or reparse point")
        return msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY | os.O_NOINHERIT)
    except BaseException:
        close(handle)
        raise


def _read_receipt(path, private):
    with os.fdopen(_open_receipt(path), "rb") as stream:
        info = os.fstat(stream.fileno())
        current = path.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                or (info.st_dev, info.st_ino) != (current.st_dev, current.st_ino)
                or not private(path) or info.st_size > MAX_RECEIPT_BYTES):
            raise CompletionError("unsafe or oversized completion receipt")
        raw = stream.read(MAX_RECEIPT_BYTES + 1)
        if len(raw) > MAX_RECEIPT_BYTES or len(raw) != info.st_size:
            raise CompletionError("completion receipt size changed")
        return raw


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CompletionError("duplicate completion field")
        result[key] = value
    return result


def validate_completion(path, token, returncode, *, directory_identity=None):
    """Return the strict receipt, or raise; never infer proof from exit status."""
    _token(token)
    if type(returncode) is not int or not 0 <= returncode <= 255 or returncode == 125:
        raise CompletionError("supervisor exit is not a completed protocol result")
    try:
        path, io, private = _location(path)
        with io.locked_directory_chain(Path(path.anchor), path.parent):
            _private_directory(path.parent.parent, private)
            _private_directory(path.parent, private, directory_identity)
            receipt = json.loads(_read_receipt(path, private).decode("utf-8"), object_pairs_hook=_unique_object)
        if (not isinstance(receipt, dict)
                or set(receipt) != {"schema", "token", "exit_code", "quiescent"}
                or receipt["schema"] != SCHEMA
                or not isinstance(receipt["token"], str)
                or re.fullmatch(r"[0-9a-f]{64}", receipt["token"]) is None
                or not secrets.compare_digest(receipt["token"], token)
                or type(receipt["exit_code"]) is not int
                or receipt["exit_code"] != returncode
                or receipt["quiescent"] is not True):
            raise CompletionError("completion receipt mismatch")
        return receipt
    except (OSError, ValueError, UnicodeError, RecursionError) as error:
        raise CompletionError("completion receipt unavailable or invalid") from error


def cleanup_completion(path, directory_identity):
    """Delete only the safe receipt leaf and the caller's now-empty directory.

    The caller must first reap the supervisor (or establish spawn never occurred).
    An unexpected leaf, changed directory, or nonempty directory is left intact.
    """
    try:
        path, io, private = _location(path)
        with io.locked_directory_chain(Path(path.anchor), path.parent.parent):
            _private_directory(path.parent.parent, private)
            try:
                path.parent.lstat()
            except FileNotFoundError:
                return
            with io.locked_directory_chain(path.parent, path.parent):
                _private_directory(path.parent, private, directory_identity)
                try:
                    info = path.lstat()
                except FileNotFoundError:
                    pass
                else:
                    if (not stat.S_ISREG(info.st_mode) or io._is_reparse(info)
                            or info.st_nlink != 1 or not private(path)):
                        raise CompletionError("unsafe completion cleanup leaf")
                    path.unlink()
            path.parent.rmdir()  # Deliberately nonrecursive.
    except (OSError, ValueError) as error:
        raise CompletionError("completion cleanup unconfirmed") from error


class WindowsJobClient:
    def __init__(self, parent=None, supervisor=None):
        # Neither Temp nor home implies safe ACLs. Callers choose an explicit
        # parent; prepare creates it privately or verifies its owner/DACL/ancestry.
        if parent is None:
            raise CompletionError("explicit private completion parent required")
        self.parent = Path(parent)
        self.supervisor = Path(supervisor) if supervisor is not None else Path(__file__).resolve().parents[1] / "lite/windows_job_supervisor.py"
        self.completion_file = None
        self.completion_token = None
        self.directory_identity = None

    def prepare(self):
        if self.completion_file is not None:
            raise CompletionError("completion client already prepared")
        io, private = _support()
        parent = Path(os.path.abspath(self.parent))
        try:
            from windows_security import create_private_directory

            create_private_directory(parent)
            with io.locked_directory_chain(Path(parent.anchor), parent):
                _private_directory(parent, private)
                directory = Path(tempfile.mkdtemp(prefix=DIRECTORY_PREFIX, dir=parent))
                self.completion_file = directory / RECEIPT_NAME
                self.directory_identity = (directory.stat().st_dev, directory.stat().st_ino)
                try:
                    _private_directory(directory, private, self.directory_identity)
                except BaseException:
                    directory.rmdir()  # Empty directory we just created.
                    self.completion_file = None
                    raise
            self.completion_token = secrets.token_hex(32)
            return self
        except (OSError, ValueError) as error:
            raise CompletionError("cannot prepare private completion directory") from error

    def supervisor_argv(self, command, *, mode="exec", python=None):
        if self.completion_file is None or mode not in {"exec", "script"}:
            raise CompletionError("unprepared client or invalid worker mode")
        if not command or any(not isinstance(value, str) or not value or "\0" in value for value in command):
            raise CompletionError("invalid worker command")
        io, _ = _support()
        helper = Path(os.path.abspath(self.supervisor))
        with io.locked_directory_chain(Path(helper.anchor), helper.parent):
            info = helper.lstat()
            if not stat.S_ISREG(info.st_mode) or io._is_reparse(info):
                raise CompletionError("unsafe Windows supervisor")
        check_completion_target(self.completion_file, self.completion_token)
        return [python or sys.executable, "-I", "-B", "-X", "utf8", str(helper),
                "--completion-file", str(self.completion_file),
                "--completion-token", self.completion_token, "--" + mode, *command]

    def validate(self, returncode):
        if self.completion_file is None:
            raise CompletionError("completion client is not prepared")
        return validate_completion(self.completion_file, self.completion_token, returncode,
                                   directory_identity=self.directory_identity)

    def cleanup(self):
        if self.completion_file is not None:
            cleanup_completion(self.completion_file, self.directory_identity)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    create = commands.add_parser("prepare")
    create.add_argument("--parent", required=True)
    for name in ("validate", "cleanup"):
        sub = commands.add_parser(name)
        sub.add_argument("--completion-file", required=True)
        sub.add_argument("--directory-device", type=int, required=True)
        sub.add_argument("--directory-inode", type=int, required=True)
        if name == "validate":
            sub.add_argument("--completion-token", required=True)
            sub.add_argument("--exit-code", type=int, required=True)
    args = parser.parse_args()
    if args.action == "prepare":
        client = WindowsJobClient(parent=args.parent).prepare()
        # NTFS IDs may exceed JavaScript's exact integer range.
        result = dict(completion_file=str(client.completion_file), completion_token=client.completion_token,
                      directory_device=str(client.directory_identity[0]), directory_inode=str(client.directory_identity[1]))
    else:
        identity = (args.directory_device, args.directory_inode)
        if args.action == "validate":
            result = validate_completion(args.completion_file, args.completion_token, args.exit_code, directory_identity=identity)
        else:
            cleanup_completion(args.completion_file, identity)
            result = {"cleaned": True}
    print(json.dumps(result, separators=(",", ":")), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CompletionError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(125)
