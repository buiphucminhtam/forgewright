#!/usr/bin/env python3
"""Single-process execution-policy gate for Antigravity PreToolUse and Gemini BeforeTool.

Replaces multi-subprocess bash/python chains with one bounded Python invocation
while preserving strict fail-closed semantics, workspace-first policy precedence,
structural destructive-command detection, and best-effort telemetry logging.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shlex
import sys
from pathlib import Path

MAX_PAYLOAD_BYTES = 1048576

_SCALAR_RE = re.compile(
    r'^(mode|require_verify|max_escalations|refresh_interval_ticks):[ \t]*([^\s#"]+)(?:[ \t]*#.*)?$'
)
_ITEM_RE = re.compile(r'^[ \t]*-[ \t]"([^"]+)"[ \t]*$')
_DENY_HEADER_RE = re.compile(r"^deny_patterns:[ \t]*$")
_BUILTIN_TRIGGER_RE = re.compile(r"(^|[^a-zA-Z0-9_])(rm|git|chmod)([^a-zA-Z0-9_]|$)")

_POSIX_CLASSES = {
    "[:space:]": r"\s",
    "[:blank:]": " \t",
    "[:digit:]": "0-9",
    "[:alpha:]": "A-Za-z",
    "[:alnum:]": "A-Za-z0-9",
    "[:lower:]": "a-z",
    "[:upper:]": "A-Z",
    "[:xdigit:]": "0-9A-Fa-f",
}


def normalize_path(candidate: str) -> str:
    if os.name == "nt":
        match = re.match(r"^/([A-Za-z])(?:/(.*))?$", candidate)
        if match:
            drive = match.group(1).upper()
            rest = match.group(2) or ""
            return f"{drive}:/{rest}"
    return candidate


def _translate_posix_ere(pattern: str) -> str:
    translated = pattern
    for posix_cls, py_cls in _POSIX_CLASSES.items():
        if posix_cls in translated:
            translated = translated.replace(posix_cls, py_cls)
    return translated


def _load_and_validate_policy(policy_path: Path) -> tuple[str, list[tuple[str, re.Pattern[str]]]]:
    if not policy_path.is_file():
        raise ValueError("policy missing or not a regular file")
    raw = policy_path.read_bytes()
    if not raw:
        raise ValueError("policy empty")
    text = raw.decode("utf-8")

    scalars: dict[str, str] = {}
    counts = {
        "mode": 0,
        "require_verify": 0,
        "max_escalations": 0,
        "refresh_interval_ticks": 0,
        "deny_patterns": 0,
    }
    raw_patterns: list[str] = []

    for line in text.splitlines():
        line = line.rstrip("\r")
        if not line or line.lstrip(" \t").startswith("#"):
            continue
        scalar_m = _SCALAR_RE.match(line)
        if scalar_m:
            key, val = scalar_m.group(1), scalar_m.group(2)
            counts[key] += 1
            scalars[key] = val
            continue
        if _DENY_HEADER_RE.match(line):
            counts["deny_patterns"] += 1
            continue
        item_m = _ITEM_RE.match(line)
        if item_m:
            raw_patterns.append(item_m.group(1))
            continue
        raise ValueError("malformed policy line")

    if any(count != 1 for count in counts.values()):
        raise ValueError("missing or duplicate policy keys")
    if not raw_patterns:
        raise ValueError("deny_patterns must not be empty")

    mode = scalars["mode"]
    if mode not in {"strict", "permissive", "audit"}:
        raise ValueError("invalid mode")
    if scalars["require_verify"] not in {"true", "false"}:
        raise ValueError("invalid require_verify")
    if not re.fullmatch(r"[1-9][0-9]*", scalars["max_escalations"]):
        raise ValueError("invalid max_escalations")
    if not re.fullmatch(r"[1-9][0-9]*", scalars["refresh_interval_ticks"]):
        raise ValueError("invalid refresh_interval_ticks")

    compiled: list[tuple[str, re.Pattern[str]]] = []
    for raw_pat in raw_patterns:
        try:
            compiled.append((raw_pat, re.compile(_translate_posix_ere(raw_pat), re.IGNORECASE)))
        except re.error as exc:
            raise ValueError("invalid deny pattern regex") from exc

    return mode, compiled


def _builtin_deny(subject: str) -> str:
    try:
        lexer = shlex.shlex(subject.replace("\\", "/"), posix=True, punctuation_chars=";&|")
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        return "malformed-command"

    stops = {";", "&&", "||", "|", "&"}

    def base(token: str) -> str:
        name = token.replace("\\", "/").rsplit("/", 1)[-1].lower()
        for ext in (".exe", ".cmd", ".bat"):
            if name.endswith(ext):
                return name[: -len(ext)]
        return name

    for i, token in enumerate(tokens):
        command = base(token)
        segment: list[str] = []
        for item in tokens[i + 1 :]:
            if item in stops:
                break
            segment.append(item)

        if command == "rm":
            flags = ""
            long_flags: set[str] = set()
            for arg in segment:
                if arg.startswith("--"):
                    long_flags.add(arg)
                elif arg.startswith("-"):
                    flags += arg[1:]
            recursive = "r" in flags or "R" in flags or "--recursive" in long_flags
            force = "f" in flags or "--force" in long_flags
            if recursive and force:
                return "builtin:rm-recursive-force"

        if command == "git":
            j = 0
            options_with_value = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}
            while j < len(segment):
                arg = segment[j]
                if arg in options_with_value:
                    j += 2
                    continue
                if any(
                    arg.startswith(prefix + "=")
                    for prefix in options_with_value
                    if prefix.startswith("--")
                ):
                    j += 1
                    continue
                if arg == "--":
                    j += 1
                    break
                if arg.startswith("-"):
                    j += 1
                    continue
                break
            args = segment[j:]
            if args[:1] == ["reset"] and "--hard" in args[1:]:
                return "builtin:git-reset-hard"
            if args[:1] == ["clean"] and any(
                arg == "--force" or (arg.startswith("-") and "f" in arg[1:])
                for arg in args[1:]
            ):
                return "builtin:git-clean-force"
            if args[:1] == ["push"] and any(
                arg in {"--force", "-f"} or arg.startswith("--force=")
                for arg in args[1:]
            ):
                return "builtin:git-push-force"

        if command == "chmod" and "777" in segment:
            return "builtin:chmod-777"

    return ""


def _resolve_workspace(
    candidate_paths: list[str | None], framework_root: str | None
) -> Path:
    workspaces: list[str] = []
    for candidate in candidate_paths:
        if not isinstance(candidate, str) or not candidate.strip():
            continue
        resolved = os.path.realpath(normalize_path(candidate))
        if not os.path.isdir(resolved):
            continue
        while True:
            if os.path.lexists(
                os.path.join(resolved, ".forgewright", "execution-policy.yaml")
            ):
                workspaces.append(resolved)
                break
            parent = os.path.dirname(resolved)
            if parent == resolved:
                break
            resolved = parent

    if not workspaces and isinstance(framework_root, str) and framework_root.strip():
        resolved_fw = os.path.realpath(normalize_path(framework_root))
        if os.path.isdir(resolved_fw) and os.path.lexists(
            os.path.join(resolved_fw, ".forgewright", "execution-policy.yaml")
        ):
            workspaces.append(resolved_fw)

    if not workspaces:
        raise ValueError("no workspace contains a Forgewright execution policy")
    return Path(workspaces[0])


def _emit_telemetry_best_effort(
    workspace: Path, event_type: str, tool: str, pattern: str, mode: str
) -> None:
    try:
        now = dt.datetime.now(dt.timezone.utc)
        telem_dir_env = os.environ.get("FORGEWRIGHT_TELEMETRY_DIR")
        if telem_dir_env:
            telem_dir = Path(normalize_path(telem_dir_env))
            if not telem_dir.is_absolute():
                telem_dir = workspace / telem_dir
        else:
            telem_dir = workspace / ".forgewright" / "telemetry"
        telem_dir.mkdir(parents=True, exist_ok=True)
        record = {
            "ts": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "event": event_type,
            "data": {"tool": tool, "pattern": pattern, "mode": mode},
        }
        target = telem_dir / f"events-{now.strftime('%Y%m')}.jsonl"
        with target.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, separators=(",", ":")) + "\n")
    except Exception:
        pass


def _extract_args(tool_input: dict) -> str:
    for key in ("command", "cmd"):
        candidate = tool_input.get(key)
        if isinstance(candidate, str):
            return candidate
    return json.dumps(tool_input, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def _antigravity_out(decision: str, reason: str) -> int:
    print(json.dumps({"decision": decision, "reason": reason}, separators=(",", ":")))
    return 0


def _gemini_deny() -> int:
    print("Forgewright policy denied this tool call.", file=sys.stderr)
    return 2


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--platform", choices=("antigravity", "gemini"), required=True)
    parser.add_argument("--framework-root", default="")
    args, _ = parser.parse_known_args()
    platform = args.platform
    framework_root = args.framework_root or str(Path(__file__).resolve().parents[2])

    try:
        raw = sys.stdin.buffer.read(MAX_PAYLOAD_BYTES + 1)
        if len(raw) > MAX_PAYLOAD_BYTES:
            raise ValueError("payload too large")
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("payload must be an object")

        if platform == "antigravity":
            tool_call = payload.get("toolCall")
            if not isinstance(tool_call, dict):
                raise ValueError("toolCall is required")
            tool_name = tool_call.get("name")
            tool_args = tool_call.get("args")
            if not isinstance(tool_name, str) or not tool_name.strip():
                raise ValueError("toolCall.name is required")
            if tool_args is None:
                tool_args = {}
            if not isinstance(tool_args, dict):
                raise ValueError("toolCall.args must be an object")
            ws_paths = payload.get("workspacePaths")
            candidates: list[str | None] = ws_paths if isinstance(ws_paths, list) else []
            candidates = [
                *candidates,
                payload.get("cwd"),
                os.environ.get("FORGEWRIGHT_WORKSPACE"),
            ]
        else:
            tool_name = payload.get("tool_name")
            tool_args = payload.get("tool_input")
            if not isinstance(tool_name, str) or not tool_name.strip():
                raise ValueError("tool_name is required")
            if tool_args is None:
                tool_args = {}
            if not isinstance(tool_args, dict):
                raise ValueError("tool_input must be an object")
            candidates = [
                payload.get("cwd"),
                os.environ.get("FORGEWRIGHT_WORKSPACE"),
                os.getcwd(),
            ]

        workspace = _resolve_workspace(candidates, framework_root)
        policy_override = os.environ.get("FORGEWRIGHT_POLICY_FILE")
        if policy_override:
            policy_path = Path(normalize_path(policy_override))
            if not policy_path.is_absolute():
                policy_path = workspace / policy_path
        else:
            policy_path = workspace / ".forgewright" / "execution-policy.yaml"

        mode, compiled_patterns = _load_and_validate_policy(policy_path)
        tool = tool_name.strip()
        arg_text = _extract_args(tool_args)
        subject = f"{tool} {arg_text}"

        matched = ""
        if (
            "'" in subject
            or '"' in subject
            or "\\" in subject
            or _BUILTIN_TRIGGER_RE.search(subject)
        ):
            matched = _builtin_deny(subject)
        if not matched:
            for raw_pat, regex in compiled_patterns:
                if regex.search(subject):
                    matched = raw_pat
                    break

        if not matched:
            if platform == "antigravity":
                return _antigravity_out("allow", "Forgewright policy allowed this tool call.")
            print("{}")
            return 0

        if mode == "permissive":
            _emit_telemetry_best_effort(workspace, "policy.warn", tool, matched, mode)
            if platform == "antigravity":
                return _antigravity_out(
                    "force_ask", "Forgewright policy requires explicit permission."
                )
            print("{}")
            return 0
        if mode == "audit":
            _emit_telemetry_best_effort(workspace, "policy.audit", tool, matched, mode)
            if platform == "antigravity":
                return _antigravity_out("allow", "Forgewright policy allowed this tool call.")
            print("{}")
            return 0

        _emit_telemetry_best_effort(workspace, "policy.deny", tool, matched, mode)
        if platform == "antigravity":
            return _antigravity_out("deny", "Forgewright policy denied this tool call.")
        return _gemini_deny()
    except Exception:
        if platform == "antigravity":
            return _antigravity_out("deny", "Forgewright could not validate this tool call.")
        return _gemini_deny()


if __name__ == "__main__":
    raise SystemExit(main())
