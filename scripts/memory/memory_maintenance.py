"""Explicit maintenance for local SQLite memory; never automatic retention."""

import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import time

from memory_common import continuity, database_path, disabled, project_id
from memory_flow import memory_module


def backup(source, destination):
    destination = destination.absolute()
    if continuity._has_symlink_component(destination):
        raise ValueError("unsafe_backup_path")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    try:
        with (
            closing(
                sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=0.5)
            ) as src,
            closing(sqlite3.connect(destination)) as dst,
        ):
            deadline = time.monotonic() + 30

            def progress(_status, _remaining, _total):
                if time.monotonic() >= deadline:
                    raise TimeoutError("memory_backup_deadline")

            src.backup(dst, pages=128, progress=progress, sleep=0.01)
            if dst.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise RuntimeError("backup_integrity_failed")
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    return destination


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    save = commands.add_parser("backup")
    save.add_argument("--destination", type=Path, required=True)
    save.add_argument("--all-scopes", action="store_true")
    migrate = commands.add_parser("migrate-db")
    migrate.add_argument("--backup", type=Path, required=True)
    migrate.add_argument("--from-project")
    preview = commands.add_parser("retention-preview")
    preview.add_argument("--max-obs", type=int, default=200)
    args = parser.parse_args(argv)
    mutation_attempted = False
    destination = None
    try:
        if disabled():
            result = {"status": "disabled", "mutated": False}
        elif not database_path().is_file():
            result = {"status": "not-configured", "mutated": False}
        elif args.command == "retention-preview":
            if args.max_obs < 0:
                raise ValueError("invalid_retention_limit")
            db = memory_module().MemoryDB()
            candidates = db.archive_candidates(args.max_obs)
            result = {
                "status": "preview",
                "mutated": False,
                "archive_candidate_ids": candidates,
                "erasure": False,
            }
        else:
            path = database_path()
            if continuity._has_symlink_component(path):
                raise ValueError("unsafe_memory_path")
            with closing(
                sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=0.5)
            ) as conn:
                version = conn.execute("PRAGMA user_version").fetchone()[0]
                scopes = [
                    r[0]
                    for r in conn.execute(
                        "SELECT DISTINCT project_root FROM observations"
                    )
                ]
            if args.command == "backup" and len(scopes) > 1 and not args.all_scopes:
                raise ValueError("physical_backup_requires_explicit_all_scopes")
            if args.command == "migrate-db" and version not in (0, 1):
                raise ValueError("migration_version_unsupported_or_already_current")
            destination = backup(
                path, args.destination if args.command == "backup" else args.backup
            )
            result = {
                "status": "backed-up",
                "destination": str(destination),
                "mutated": False,
            }
            if args.command == "migrate-db":
                module = memory_module()
                conn = sqlite3.connect(path, timeout=0.5)
                try:
                    # install_schema owns its transaction and may commit before
                    # a later check fails. A failed receipt cannot promise rollback.
                    mutation_attempted = True
                    module.install_schema(
                        conn,
                        migrate=True,
                        from_project=args.from_project,
                        namespace=project_id(),
                    )
                    if conn.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                        raise RuntimeError("migration_integrity_failed")
                finally:
                    conn.close()
                result.update(
                    status="migrated",
                    mutated=True,
                    schema_version=module.SCHEMA_VERSION,
                    limitations=[
                        "Legacy graph IDs remain unadopted; no ownership guessed",
                        "Backup is pre-migration; never restore over later writes without reconciliation",
                    ],
                )
    except (ValueError, OSError, RuntimeError, sqlite3.Error) as error:
        result = {
            "status": "degraded",
            "reason": type(error).__name__,
            "mutated": mutation_attempted,
        }
        if mutation_attempted:
            result.update(
                mutation_state="attempted-unconfirmed",
                destination=str(destination),
                writer_fence_required=True,
            )
    print(json.dumps(result, ensure_ascii=False))
    return 1 if result["status"] == "degraded" else 0


if __name__ == "__main__":
    raise SystemExit(main())
