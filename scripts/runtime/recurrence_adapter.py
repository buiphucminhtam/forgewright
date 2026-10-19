"""Project opt-in wire for context and terminal diagnostics, never authority."""
import json
from pathlib import Path
import re
import sys

from host_job_profiles import private_read

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "memory"))
SCHEMA = "forgewright-recurrence-optin/v1"
IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")


def _config(project):
    project = Path(project).resolve(strict=True)
    path = project / ".forgewright/recurrence.json"
    if not path.exists() and not path.is_symlink():
        return None
    value = json.loads(private_read(path, 32768))
    if (not isinstance(value, dict) or set(value) != {"schema", "diagnostics", "profiles", "captures"}
            or value["schema"] != SCHEMA or type(value["diagnostics"]) is not bool
            or not isinstance(value["profiles"], dict) or len(value["profiles"]) > 8
            or not isinstance(value["captures"], list) or len(value["captures"]) > 3):
        raise ValueError("invalid-recurrence-optin")
    for name, item in value["profiles"].items():
        if (not isinstance(name, str) or not IDENTIFIER.fullmatch(name)
                or not isinstance(item, dict) or set(item) != {"digest", "operation", "platform", "toolchain"}
                or not re.fullmatch(r"[0-9a-f]{64}", item["digest"])
                or not IDENTIFIER.fullmatch(item["operation"])
                or not IDENTIFIER.fullmatch(item["platform"])
                or not isinstance(item["toolchain"], dict)
                or item["toolchain"] != {"recipe_digest": item["digest"]}):
            raise ValueError("invalid-recurrence-profile")
    _validate_captures(value["captures"], value["profiles"])
    return value


def _validate_captures(captures, profiles):
    if not isinstance(captures, list) or len(captures) > 3:
        raise ValueError("invalid-selected-lesson")
    for item in captures:
        if (not isinstance(item, dict) or set(item) != {"profile", "session", "event", "evidence_ref", "job_id", "payload"}
                or item["profile"] not in profiles
                or not all(isinstance(item[k], str) and 0 < len(item[k]) <= 512
                           for k in ("session", "event", "evidence_ref", "job_id"))
                or not isinstance(item["payload"], dict)):
            raise ValueError("invalid-selected-lesson")


def _captures(project, config):
    """Bounded selected data; capture still independently proves every binding."""
    path = Path(project) / ".forgewright/runtime/memory/recurrence/selected.json"
    selected = list(config["captures"])
    if path.exists() or path.is_symlink():
        queue = json.loads(private_read(path, 32768))
        if (not isinstance(queue, dict) or set(queue) != {"schema", "captures"}
                or queue["schema"] != "forgewright-recurrence-selected/v1"):
            raise ValueError("invalid-selected-lesson")
        selected += queue["captures"]
    _validate_captures(selected, config["profiles"])
    return selected


def _selection(config, profile, expected):
    if config is None:
        return None
    item = config["profiles"].get(profile["id"])
    return item if item and item["digest"] == expected and item["platform"] == sys.platform else None


def before_profile(project, profile, expected, session):
    """No matching lesson or unavailable optional storage always allows work."""
    try:
        item = _selection(_config(project), profile, expected)
        if not item or not isinstance(session, str) or not IDENTIFIER.fullmatch(session):
            return ""
        from recurrence import lesson_context
        result = lesson_context(project, item["operation"], sys.platform, item["toolchain"], session)
        if not isinstance(result, dict):
            return ""
        text = result.get("context", "")
        return text if result.get("status") == "retrieved" and isinstance(text, str) and len(text) <= 2000 else ""
    except Exception:  # Optional context must never replace the tool decision.
        return ""


def after_profile(project, profile, expected, receipt):
    """Called after run_job teardown. Preserve its result on every failure."""
    result = {"status": "disabled", "authority": "context-only", "promoted": False}
    try:
        config = _config(project)
        item = _selection(config, profile, expected)
        if not item:
            return result
        from recurrence import record_native_diagnostic
        native_context = receipt.get("native_context")
        native = native_context.get("native") if isinstance(native_context, dict) else None
        session = native.get("session_id") if isinstance(native, dict) else None
        # A direct explicitly reviewed CLI job has its own isolated local
        # session identity; it cannot access another native session's context.
        session = session or ("local-" + receipt["job_id"])
        result["status"] = "processed"
        if config["diagnostics"]:
            state = receipt.get("state")
            succeeded = state == "quiescent" and receipt.get("exit_code") == 0
            result["diagnostic"] = record_native_diagnostic(project, {
                "event_id": receipt["job_id"], "session_id": session,
                "job_id": receipt["job_id"], "profile": profile["id"],
                "source": "host-job-runner", "outcome": "success" if succeeded else "failure",
                "failure_class": "none" if succeeded else (
                    state if state in {"cancelled", "quarantined", "rejected"} else "job-failed"),
            })
        captures = []
        for candidate in _captures(project, config):
            if candidate["profile"] != profile["id"]:
                continue
            from recurrence import capture_verified_lesson
            # Capture is selected by an owner-authored opt-in. The capture API
            # independently validates the referenced actual terminal job and
            # final evidence/review; this event grants no acceptance itself.
            captures.append(capture_verified_lesson(
                project, candidate["payload"], candidate["session"], candidate["event"],
                candidate["evidence_ref"], candidate["job_id"]))
        result["captures"] = captures
        return result
    except Exception:  # Preserve the supervisor's receipt and actual exit code.
        return {"status": "unavailable", "authority": "context-only", "promoted": False}
