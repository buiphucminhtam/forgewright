#!/usr/bin/env python3
"""Compatibility fence for explicitly selected legacy cwd-relative databases.

No migration or new capture authority. Unselected projects retain their reviewed
legacy implementation. Private files prevent accidental mixups, not same-UID
forgery. The lock is held through a legacy invocation so maintenance can drain it.
"""

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import shlex
import sys
import time


def build_shell_wrapper(module, module_sha, policy, legacy, legacy_sha, python):
    """Preserve executed and sourced legacy Bash entry semantics."""

    def command(check=False):
        arguments = [
            "--quiet-fence",
            "--policy",
            str(policy),
            "--legacy",
            str(legacy),
            "--legacy-sha256",
            legacy_sha,
            "--legacy-kind",
            "bash",
        ]
        if check:
            arguments.append("--check-only")
        bootstrap = (
            "import hashlib,sys\nfrom pathlib import Path\n"
            f"p=Path({str(module)!r});raw=p.read_bytes()\n"
            f"if hashlib.sha256(raw).hexdigest()!={module_sha!r}:raise SystemExit('memory fence source drift')\n"
            "ns={'__name__':'forgewright_pinned_fence','__file__':str(p)}\n"
            "exec(compile(raw,str(p),'exec'),ns)\n"
            f"raise SystemExit(ns['main']({arguments!r}+['--',*sys.argv[1:]]))\n"
        )
        return shlex.join([str(python), "-I", "-B", "-c", bootstrap])

    return (
        '#!/bin/bash\nif [[ "${BASH_SOURCE[0]}" != "$0" ]]; then\n'
        f'  if {command(True)} "$@"; then\n'
        f'    source {shlex.quote(str(legacy))} "$@"\n'
        "  else\n    _forgewright_fence_status=$?\n"
        '    if [[ "$_forgewright_fence_status" -eq 77 ]]; then return 0; fi\n'
        '    return "$_forgewright_fence_status"\n  fi\nelse\n'
        f'  exec {command()} "$@"\nfi\n'
    )


def private_read(path, limit):
    path = Path(path)
    if any(item.is_symlink() for item in (path, *path.parents)):
        raise ValueError("unsafe-fence-path")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_mode & 0o077
        ):
            raise ValueError("unsafe-fence-file")
        raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise ValueError("oversize-fence-file")
        return raw


@contextmanager
def writer_lock(policy, *, exclusive=False):
    path = Path(str(policy) + ".lock")
    if any(item.is_symlink() for item in (path, *path.parents)):
        raise ValueError("unsafe-fence-lock")
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_mode & 0o077
        ):
            raise ValueError("unsafe-fence-lock")
        deadline = time.monotonic() + 2
        while True:
            try:
                fcntl.flock(
                    descriptor,
                    (fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH) | fcntl.LOCK_NB,
                )
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError("legacy-writer-busy")
                time.sleep(0.02)
        yield descriptor
    finally:
        os.close(descriptor)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--policy", type=Path, required=True)
    parser.add_argument("--legacy", type=Path, required=True)
    parser.add_argument("--legacy-sha256", required=True)
    parser.add_argument("--legacy-kind", choices=("python", "bash"), default="python")
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--quiet-fence", action="store_true")
    parser.add_argument("legacy_args", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    legacy_started = False
    try:
        with writer_lock(args.policy) as fence_descriptor:
            policy = json.loads(private_read(args.policy, 16384))
            if (
                not isinstance(policy, dict)
                or set(policy) != {"schema", "databases"}
                or policy["schema"] != "forgewright-legacy-writer-fences/v1"
            ):
                raise ValueError("invalid-writer-fence")
            databases = policy["databases"]
            if not isinstance(databases, list) or len(databases) > 128:
                raise ValueError("invalid-writer-fence")
            for item in databases:
                if (
                    not isinstance(item, str)
                    or not Path(item).is_absolute()
                    or str(Path(item).resolve()) != item
                ):
                    raise ValueError("invalid-writer-fence")
            target = str((Path.cwd() / ".forgewright/memory.db").resolve())
            if target in databases:
                if args.check_only:
                    return 77
                if args.quiet_fence:
                    return 0
                print(
                    json.dumps(
                        {
                            "status": "legacy-writer-fenced",
                            "mutated": False,
                            "authority": "maintenance-only",
                        }
                    )
                )
                return 0
            raw = private_read(args.legacy, 2 * 1024**2)
            if hashlib.sha256(raw).hexdigest() != args.legacy_sha256:
                raise ValueError("legacy-source-drift")
            if args.check_only:
                return 0
            forwarded = args.legacy_args
            if forwarded[:1] == ["--"]:
                forwarded = forwarded[1:]
            if args.legacy_kind == "bash":
                # Keep the shared fence held through exec and all legacy shell
                # effects. The selected script stays beside its original helpers.
                legacy_started = True
                os.set_inheritable(fence_descriptor, True)
                os.execv("/bin/bash", ["bash", str(args.legacy), *forwarded])
            previous = sys.argv
            sys.argv = [str(args.legacy), *forwarded]
            try:
                legacy_started = True
                exec(
                    compile(raw, str(args.legacy), "exec"),
                    {"__name__": "__main__", "__file__": str(args.legacy)},
                )
            finally:
                sys.argv = previous
            return 0
    except (OSError, ValueError, RuntimeError) as error:
        if legacy_started:
            raise  # Preserve legacy errors; its writes may already have committed.
        print(
            json.dumps(
                {
                    "status": "legacy-writer-unavailable",
                    "mutated": False,
                    "reason": type(error).__name__,
                }
            )
        )
        return 125


if __name__ == "__main__":
    raise SystemExit(main())
