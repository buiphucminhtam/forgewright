#!/usr/bin/env python3
"""Short Codex PreToolUse decision. No waits, execution or command evaluation.

Only an explicitly enrolled physical workspace has a deny/rewrite lane. The
native installer and a real deny/rewrite canary must prove host delivery.
"""

import json
import argparse
import os
import re
from pathlib import Path
import shlex
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "runtime"))
from host_job_profiles import load_profile, private_read, ProfileError, digest
from resource_enrollment import (
    validate_binding,
    record_canary,
    EnrollmentError,
    operator_disabled,
)


def runner_prefix(home):
    runner = Path(__file__).resolve().parents[1] / "runtime/host_jobs.py"
    bootstrap = 'import runpy,sys;sys.argv.pop(0);sys.path.insert(0,sys.argv.pop(0));runpy.run_path(sys.argv[0],run_name="__main__")'
    return [
        sys.executable,
        "-I",
        "-B",
        "-c",
        bootstrap,
        str(runner.parent),
        str(runner),
        "--home",
        str(home),
    ]


def literal_argv(command):
    if (not isinstance(command, str) or len(command) > 16384
            or "\n" in command or "\r" in command):
        return []
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|<>`()\n")
        lexer.whitespace_split = True
        lexer.commenters = ""
        return list(lexer)
    except ValueError:
        return []


def explicit_profile(command, enrollment):
    argv = literal_argv(command)
    if (len(argv) == 7 and argv[:4] == ["forge", "delegate", "exec", "--profile"]
            and argv[5] == "--digest"
            and enrollment.get("profiles", {}).get(argv[4]) == argv[6]):
        return argv[4]
    return None


def control_decision(payload, home):
    """Exact diagnostics/operator-off never depend on mutable job profiles."""
    if payload.get("tool_name") != "Bash":
        return None
    command = payload.get("tool_input", {}).get("command")
    if command in {
        "forge delegate resources",
        "forge --json delegate resources",
        "forge delegate resources --inventory",
    }:
        return {
            "permissionDecision": "allow",
            "updatedInput": {"command": shlex.join(runner_prefix(home) + ["status"])},
        }
    if command == "forge delegate resources --disk":
        return {
            "permissionDecision": "allow",
            "updatedInput": {"command": shlex.join(runner_prefix(home) + ["disk"])},
        }
    if command == "forge delegate resources --disable":
        project = str(Path(payload.get("cwd") or ".").resolve(strict=True))
        return {
            "permissionDecision": "allow",
            "updatedInput": {
                "command": shlex.join(
                    runner_prefix(home) + ["disable", "--project", project]
                )
            },
        }
    if command == "forge delegate resources --prune-history":
        return {
            "permissionDecision": "allow",
            "updatedInput": {"command": shlex.join(runner_prefix(home) + ["history"])},
        }
    if isinstance(command, str) and len(command) <= 16384:
        argv = literal_argv(command)
        if argv[:3] == ["forge", "delegate", "resources"]:
            action = None
            if len(argv) == 5 and argv[3] == "--inspect":
                action = ["inspect", "--request", argv[4]]
            elif (len(argv) == 7 and argv[3] == "--register-profile"
                  and argv[5] == "--sha256" and re.fullmatch(r"[0-9a-f]{64}", argv[6])):
                action = ["register-profile", "--file", argv[4], "--sha256", argv[6]]
            if action:
                project = str(Path(payload.get("cwd") or ".").resolve(strict=True))
                return {
                    "permissionDecision": "allow",
                    "updatedInput": {"command": shlex.join(
                        runner_prefix(home) + action[:1] + ["--project", project] + action[1:])},
                }
    return None


def decide(payload, home, enrollments):
    if payload.get("tool_name") != "Bash":
        return {"additionalContext": "Resource coverage: unmanaged tool path"}
    control = control_decision(payload, home)
    if control:
        return control
    project = str(Path(payload.get("cwd") or ".").resolve(strict=True))
    enrollment = enrollments.get(project)
    if not enrollment:
        return {"additionalContext": "Resource coverage: unenrolled/advisory"}
    mode = enrollment.get("mode")
    if mode not in {"enforce", "canary"}:
        return {"additionalContext": "Resource coverage: probe; enforcement unverified"}
    command = payload.get("tool_input", {}).get("command")
    selected = explicit_profile(command, enrollment)
    prefix = runner_prefix(home)
    if (
        mode == "canary"
        and isinstance(command, str)
        and digest(command.encode()) == enrollment.get("deny_command_sha256")
    ):
        return {
            "permissionDecision": "deny",
            "permissionDecisionReason": "Resource native deny canary; harmless marker must remain absent.",
        }
    for name, expected in enrollment.get("profiles", {}).items():
        if selected is not None and selected != name:
            continue
        if mode == "canary" and name != enrollment.get("canary_profile"):
            continue
        profile = load_profile(home, project, name, expected)
        if profile["command"] == command or selected == name:
            context = ""
            try:
                from recurrence_adapter import before_profile
                candidate = before_profile(project, profile, expected, payload.get("session_id"))
                if isinstance(candidate, str) and len(candidate) <= 2000:
                    context = candidate
            except Exception:
                pass  # Optional context never replaces the admission decision.
            argv = prefix + [
                "run",
                "--project",
                project,
                "--profile",
                name,
                "--digest",
                expected,
            ]
            # The trusted argv is quoted once for the host shell. The original
            # command is never reparsed/executed or used as a wrapper exemption.
            decision = {
                "permissionDecision": "allow",
                "updatedInput": {"command": shlex.join(argv)},
            }
            if context:
                decision["additionalContext"] = context
            return decision
    if mode == "canary":
        return {
            "additionalContext": "Resource coverage: canary only; other shell paths remain advisory"
        }
    return {
        "permissionDecision": "deny",
        "permissionDecisionReason": "Resource enrollment requires an exact reviewed finite profile; command was not launched.",
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path)
    args = parser.parse_args(argv)
    home = args.home or Path(
        os.environ.get("FORGEWRIGHT_ADMISSION_HOME")
        or Path.home() / ".forgewright/runtime/admission"
    )
    current = None
    try:
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError("payload-too-large")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("invalid-payload")
        project = str(Path(payload.get("cwd") or ".").resolve(strict=True))
        control = control_decision(payload, home)
        if control:
            print(
                json.dumps(
                    {"hookSpecificOutput": {"hookEventName": "PreToolUse", **control}}
                )
            )
            return 0
        if operator_disabled(home, project):
            print(
                json.dumps(
                    {
                        "hookSpecificOutput": {
                            "hookEventName": "PreToolUse",
                            "additionalContext": "Resource adapter disabled by operator; enrollment is not enforced. Existing supervisors retain their leases.",
                        }
                    }
                )
            )
            return 0
        enrollment = home / "enrollments.json"
        registry = (
            json.loads(private_read(enrollment, 65536)) if enrollment.exists() else {}
        )
        current = registry.get(project)
        if current and current.get("phase") not in {"canary", "enforce"}:
            output = {
                "additionalContext": "Resource enrollment incomplete/inactive; native enforcement unverified"
            }
        else:
            if current:
                validate_binding(current)
            output = decide(payload, home, registry)
        if (
            current
            and output.get("permissionDecision") == "allow"
            and "updatedInput" in output
        ):
            from native_job_requests import issue

            for name, expected in current["profiles"].items():
                selected = explicit_profile(payload.get("tool_input", {}).get("command"), current)
                if selected is not None and selected != name:
                    continue
                profile = load_profile(home, project, name, expected)
                if payload.get("tool_input", {}).get("command") == profile["command"] or selected == name:
                    context = issue(home, project, payload, profile, expected, current,
                                    lesson_context=output.get("additionalContext", ""))
                    argv = shlex.split(output["updatedInput"]["command"]) + [
                        "--native-request",
                        context["request_id"],
                    ]
                    output["updatedInput"]["command"] = shlex.join(argv)
                    if current["mode"] == "canary":
                        record_canary(
                            home, project, payload, "profile-run", context=context
                        )
                    break
        elif (
            current
            and current["mode"] == "canary"
            and output.get("permissionDecision") == "deny"
        ):
            record_canary(home, project, payload, "deny")
    except (OSError, ValueError, KeyError, TypeError, ProfileError, EnrollmentError):
        if current and current.get("mode") == "canary":
            output = {
                "additionalContext": "Resource canary unavailable; no rewrite occurred and native enforcement remains unverified."
            }
        else:
            output = {
                "permissionDecision": "deny",
                "permissionDecisionReason": "Resource enrollment unavailable; no job was launched.",
            }
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", **output}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
