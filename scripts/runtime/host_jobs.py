#!/usr/bin/env python3
"""Explicit finite job entry; install a reviewed recipe, then run its digest."""

import argparse
import json
import os
from pathlib import Path
import signal
import sys
import threading
from dataclasses import replace

from host_admission import HostAdmission, AdmissionError
from host_inventory import snapshot
from host_job_profiles import (
    install_profile,
    load_profile,
    validate_profile,
    ProfileError,
)
from host_job_runner import run_job, JobError
from project_storage import StorageError
from resource_enrollment import EnrollmentError
from resource_controls import (
    ControlError,
    inspect_workspace,
    reconcile_quarantined_plan,
    register_profile,
)


def recurrence_projection(project, profile, expected, receipt):
    """An optional projection cannot change the supervisor's terminal result."""
    fallback = {"status": "unavailable", "authority": "context-only", "promoted": False}
    try:
        from recurrence_adapter import after_profile

        # Pass an isolated snapshot, including nested native context.
        snapshot = json.loads(json.dumps(receipt))
        value = after_profile(project, profile, expected, snapshot)
        encoded = json.dumps(value, allow_nan=False)
        if not isinstance(value, dict) or len(encoded.encode()) > 16384:
            return fallback
        return json.loads(encoded)
    except Exception:
        return fallback


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path)
    commands = parser.add_subparsers(dest="action", required=True)
    install = commands.add_parser("install-profile")
    install.add_argument("file", type=Path)
    run = commands.add_parser("run")
    run.add_argument("--project", required=True, type=Path)
    run.add_argument("--profile", required=True)
    run.add_argument("--digest", required=True)
    run.add_argument("--native-request")
    commands.add_parser("status")
    commands.add_parser("disk")
    commands.add_parser("history")
    disable = commands.add_parser("disable")
    disable.add_argument("--project", required=True, type=Path)
    inspect = commands.add_parser("inspect")
    inspect.add_argument("--project", required=True, type=Path)
    inspect.add_argument("--request", required=True)
    register = commands.add_parser("register-profile")
    register.add_argument("--project", required=True, type=Path)
    register.add_argument("--file", required=True, type=Path)
    register.add_argument("--sha256", required=True)
    restage = commands.add_parser("restage-shared")
    restage.add_argument("--project", required=True, type=Path)
    restage.add_argument("--manifest", required=True, type=Path)
    restage.add_argument("--sha256", required=True)
    reconcile = commands.add_parser("reconcile-quarantined")
    reconcile.add_argument("--project", required=True, type=Path)
    reconcile.add_argument("--plan", required=True, type=Path)
    reconcile.add_argument("--sha256", required=True)
    reconcile.add_argument("--apply", action="store_true")
    activate = commands.add_parser("activate")
    activate.add_argument("--project", required=True, type=Path)
    args = parser.parse_args(argv)
    home = args.home or Path(
        os.environ.get("FORGEWRIGHT_ADMISSION_HOME")
        or Path.home() / ".forgewright/runtime/admission"
    )
    try:
        if args.action in {"restage-shared", "activate"}:
            from resource_enrollment import registry, restage_shared, activate

            project = args.project.resolve(strict=True)
            config = Path(registry(home)[str(project)]["config"])
            result = (
                restage_shared(home, project, config, args.manifest, args.sha256)
                if args.action == "restage-shared"
                else activate(home, project, config)
            )
            print(json.dumps(result))
            return 0
        if args.action == "inspect":
            if len(args.request) > 8192:
                raise ControlError("invalid-inspection")
            print(json.dumps(inspect_workspace(args.project, json.loads(args.request))))
            return 0
        if args.action == "register-profile":
            print(
                json.dumps(register_profile(home, args.project, args.file, args.sha256))
            )
            return 0
        if args.action == "reconcile-quarantined":
            result = reconcile_quarantined_plan(
                home,
                args.project,
                args.plan,
                args.sha256,
                apply=bool(args.apply),
            )
            print(json.dumps(result))
            return 0 if result.get("status") in {"eligible", "reconciled"} else 2
        if args.action == "install-profile":
            value = json.loads(args.file.read_bytes())
            print(
                json.dumps(
                    {"profile": value.get("id"), "digest": install_profile(home, value)}
                )
            )
            return 0
        if args.action == "status":
            print(json.dumps(snapshot(home), indent=2))
            return 0
        if args.action == "disk":
            from project_disk import main as disk_main

            return disk_main(["--root", str(Path.cwd()), "--json"])
        if args.action == "history":
            from host_job_history import collect_history

            admission = HostAdmission(home)
            try:
                result = collect_history(admission)
                print(json.dumps(result))
                return 0 if result["status"] == "complete" else 125
            finally:
                admission.close()
        if args.action == "disable":
            from resource_enrollment import disable_enrollment

            project = args.project.resolve(strict=True)
            print(json.dumps(disable_enrollment(home, project)))
            return 0
        profile = load_profile(home, args.project, args.profile, args.digest)
        cancel = threading.Event()
        previous = {
            sig: signal.signal(sig, lambda *_: cancel.set())
            for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP)
        }
        admission = None
        try:
            admission = HostAdmission(home)
            # Loader variables are intentionally absent. Environment is part of
            # the reviewed profile; do not persist secrets in it.
            saved = dict(os.environ)
            safe = {
                k: saved[k]
                for k in (
                    "HOME",
                    "PATH",
                    "LANG",
                    "LC_ALL",
                    "TMPDIR",
                    "FORGEWRIGHT_RLG_HOME",
                )
                if k in saved
            }
            safe.update(profile["env"])
            os.environ.clear()
            os.environ.update(safe)
            try:
                request = replace(
                    validate_profile(profile), native_request=args.native_request
                )
                receipt = run_job(admission, request, cancel=cancel)
            finally:
                os.environ.clear()
                os.environ.update(saved)
            receipt["recurrence"] = recurrence_projection(
                args.project, profile, args.digest, receipt
            )
            print(json.dumps(receipt), file=sys.stderr)
            if receipt["state"] != "quiescent":
                return 130 if receipt["state"] == "cancelled" else 125
            code = receipt["exit_code"]
            return code if code >= 0 else 128 - code
        finally:
            if admission is not None:
                admission.close()
            for sig, handler in previous.items():
                signal.signal(sig, handler)
    except (
        ProfileError,
        JobError,
        StorageError,
        AdmissionError,
        EnrollmentError,
        ControlError,
        OSError,
        ValueError,
        TypeError,
        KeyError,
    ) as error:
        # No argv, raw exception text, token or environment in public errors.
        code = (
            str(error)
            if isinstance(error, (ProfileError, JobError, AdmissionError))
            else "job-unavailable"
        )
        print(json.dumps({"error": code}), file=sys.stderr)
        return 125


if __name__ == "__main__":
    raise SystemExit(main())
