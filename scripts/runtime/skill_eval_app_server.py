"""One pinned, tools-off native session. Never a general provider abstraction.

The private worker owns JSON-RPC: native/model JSON cannot issue host evidence.
Only configured selection is confirmed; backend execution identity is unknown.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path

VERSION = "codex-cli 0.159.0-alpha.3"
BINARY_SHA256 = "981ade7b03926534c654fd718ced3a9f378b7b2841271e29156f939462d176e9"
SOURCE_COMMIT = "3b01b36fa5eb96ba82a776bd3c2fc57f8969181f"
# Exact public source corresponding to the audited version, not a backend claim.
SOURCE_HASHES = {
    "app-server/src/lib.rs": "000ecbef7cac8888c80d958975698adc7d916dac6ac1f8999a376ad7cc1b8f56",
    "app-server-protocol/src/protocol/v2/remote_control.rs": "26a76375d0b9286de8740ff6550801cf85c22563e6d68b8734f86f5ba17f372f",
    "config/src/config_toml.rs": "daafa4160f4b0c2c9cf7d470b3e207efed22aa8243f66017431181f1784d93a8",
    "app-server/src/config_manager_service.rs": "cb5e0862e3402aed6349d870f4a8b38472ad1835edd906f797ea1e3aeeac8209",
    "app-server-protocol/src/protocol/v2/config.rs": "8187edb07de0259f5a96927ca69b749a7ba9049062bf2ef2eb1ff9c7d8696447",
    "core/src/tools/spec_plan.rs": "849ef21d4e5c83febdc31eacd7609911d43e3f69a35168fe02ae899273b5ef3e",
    "core/src/session/turn.rs": "9a17f81eec18679f42c066fe03202ea4085e6e3b80ce8249bcf8153e367aee27",
    "core/src/context/developer_instructions.rs": "65924b2320a5c0109e969cdee598d69ced087fe32bca282af13c793ed31f4836",
    "core/src/context/base_instructions.rs": "d3c394eb1fc677328c973e0558007aca01fc9c1f819d3eedd0a442775972dc6c",
    "core/src/context/world_state/managed_developer_instructions.rs": "7350efd0aaf4f42863e3bdd308038fa3e883fb87b8d8b018c63e1f4a7c3aa40d",
    "core/src/context/world_state/permissions.rs": "328391dba90a4f70d80a666ba1c901125572aae827f5b4468b75b4a2fd58d8e5",
    "ext/skills/src/extension.rs": "a2ecc6ad9b08f21a3e4df7a8bd89fbc204c8e87733b3b9bf329d00631bcede3b",
    "core/config.schema.json": "dfba4a998e5257fabf55acbb3ccfef72ffbfcab27ff5388f8d2ae32e845e9b0f",
    "app-server-protocol/schema/json/v2/ThreadStartParams.json": "e9c6d3cc18d049bfbc0249add3808fb8e5a27e1a0b5a423767aafbc3859a9428",
    "app-server-protocol/schema/json/v2/ThreadStartResponse.json": "185324ac7860327db6ceeff644d16ee6e7d7c60a899925007b23553ef69eb125",
}
DISABLED_FEATURES = tuple(
    "shell_tool apps browser_use browser_use_external computer_use code_mode code_mode_host multi_agent multi_agent_v2 sleep_tool view_image image_generation skill_search plugins remote_plugin hooks memories workspace_dependencies in_app_browser deferred_executor token_budget current_time_reminder request_permissions_tool send_message_to_user_async agent_message_board goals tool_suggest default_mode_request_user_input standalone_web_search context_management code_mode_prewarm".split()
)
CONFIG = {
    "include_permissions_instructions": True,
    "model_reasoning_effort": "low",
    "web_search": "disabled",
    "apps": {"_default": {"enabled": False}},
    "skills": {"include_instructions": False, "bundled": {"enabled": False}},
    "cloud": {"skills": {"enabled": False}},
    "orchestrator": {"mcp": {"enabled": False}},
    "tools": {
        "experimental_request_user_input": {"enabled": False},
        "update_plan": {"enabled": False},
    },
}
# Finite nonsecret ConfigToml controls affecting local request/context behavior.
# None preserves the configured default; no values are overridden here.
CONTEXT_ENUMS = {
    "model_reasoning_summary": ("auto", "concise", "detailed", "none"),
    "model_verbosity": ("low", "medium", "high"),
    "personality": ("none", "friendly", "pragmatic"),  # Deprecated; no style claim.
    "model_auto_compact_token_limit_scope": ("total", "body_after_prefix"),
}
CONTEXT_BOOLEANS = (
    "include_environment_context",
    "include_collaboration_mode_instructions",
    "include_apps_instructions",
)
CONTEXT_INTEGERS = ("model_context_window", "model_auto_compact_token_limit")
CUSTOM_INSTRUCTION_FIELDS = (
    "instructions",
    "model_instructions_file",
    "developer_instructions",
    "model_catalog_json",
    "compact_prompt",
    "experimental_compact_prompt_file",
)

TURN_TEXT = "Complete the task in the supplied experiment packet. Return the requested answer as text."


def _json(value):
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode()


def _hash(raw):
    return hashlib.sha256(raw).hexdigest()


def _emit(kind, value):
    print(_json({"host_event": kind, "value": value}).decode(), flush=True)


def _safe(value):
    """Retain lifecycle and digests, never native private reasoning bodies."""
    if isinstance(value, list):
        return [_safe(v) for v in value]
    if not isinstance(value, dict):
        return value
    if value.get("type") == "reasoning":
        return {
            **{
                k: _safe(v) for k, v in value.items() if k not in ("summary", "content")
            },
            "body_sha256": _hash(
                _json({k: value[k] for k in ("summary", "content") if k in value})
            ),
        }
    if "reasoning" in str(value.get("method", "")).lower():
        return {
            "method": value["method"],
            "params": {
                k: v
                for k, v in value.get("params", {}).items()
                if k in ("threadId", "turnId", "itemId", "summaryIndex", "contentIndex")
            },
            "body_sha256": _hash(_json(value.get("params"))),
        }
    return {k: _safe(v) for k, v in value.items() if k != "codexHome"}


class ProtocolFailure(Exception):
    pass


def _require(condition, reason):
    if not condition:
        raise ProtocolFailure(reason)


def _safe_config_projection(config):
    """Audit only declared local controls; discard unrelated config immediately."""
    scalar_keys = (
        *CONTEXT_ENUMS,
        *CONTEXT_BOOLEANS,
        *CONTEXT_INTEGERS,
        "model_post_turn_compact_threshold_percent",
        "service_tier",
    )
    required = {
        *CUSTOM_INSTRUCTION_FIELDS,
        *scalar_keys,
        "include_permissions_instructions",
    }
    _require(
        isinstance(config, dict) and required.issubset(config),
        "incomplete_effective_config",
    )
    projection = {
        key + "_present": config[key] is not None for key in CUSTOM_INSTRUCTION_FIELDS
    }
    projection["include_permissions_instructions"] = config[
        "include_permissions_instructions"
    ]
    for key in scalar_keys:
        value = config[key]
        if value is not None:
            if key in CONTEXT_ENUMS:
                valid = isinstance(value, str) and value in CONTEXT_ENUMS[key]
            elif key in CONTEXT_BOOLEANS:
                valid = type(value) is bool
            elif key in CONTEXT_INTEGERS:
                valid = type(value) is int and -(2**63) <= value < 2**63
            elif key == "model_post_turn_compact_threshold_percent":
                valid = type(value) is int and 0 <= value <= 100
            else:
                valid = isinstance(value, str) and len(value) <= 256
            _require(valid, "invalid_effective_context_scalar")
        projection[key] = value
    return projection


class NativeBudget:
    """One byte cap across all preflight/session stdout and stderr pipes."""

    def __init__(self, limit):
        self.limit = limit
        self.used = 0
        self.lock = threading.Lock()

    def consume(self, size):
        with self.lock:
            self.used += size
            return self.used <= self.limit


class Child:
    """Pipes have native-byte bounds as well as the supervisor's output bound."""

    def __init__(self, argv, budget):
        self.budget = budget
        self.bound = budget.limit
        self.bytes = 0
        self.stderr_bytes = 0
        self.stderr_hash = hashlib.sha256()
        # Diagnostic stderr is unstructured and can contain reasoning. Hash only.
        self.proc = subprocess.Popen(
            argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        self.thread = threading.Thread(target=self._drain_stderr, daemon=True)
        self.thread.start()

    def _drain_stderr(self):
        while data := self.proc.stderr.read(65536):
            self.stderr_bytes += len(data)
            self.stderr_hash.update(data)
            if not self.budget.consume(len(data)):
                try:
                    self.proc.kill()
                except ProcessLookupError:
                    pass
                break

    def read(self):
        raw = self.proc.stdout.readline(self.bound - self.bytes + 1)
        self.bytes += len(raw)
        _require(self.budget.consume(len(raw)), "native_output_limit")
        return raw

    def close(self):
        if self.proc.stdin and not self.proc.stdin.closed:
            self.proc.stdin.close()
        try:
            self.proc.wait(timeout=0.25)
        except subprocess.TimeoutExpired:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=0.25)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
        self.thread.join(timeout=0.25)
        _emit(
            "stderr_digest",
            {
                "bytes": self.stderr_bytes,
                "sha256": self.stderr_hash.hexdigest(),
                "content": "omitted-unstructured-native-diagnostics",
            },
        )
        self.proc.stdout.close()
        self.proc.stderr.close()


def _command(argv, budget):
    child = Child(argv, budget)
    try:
        child.proc.stdin.close()
        raw = b"".join(iter(child.read, b""))
        child.proc.wait()
        _require(child.proc.returncode == 0, "preflight_command_failed")
        _require(budget.used <= budget.limit, "native_output_limit")
        return raw
    finally:
        child.close()


def _selection(catalog, model):
    matches = [m for m in catalog if m.get("slug") == model]
    _require(len(matches) == 1, "model_catalog_missing_or_duplicate")
    chosen = matches[0]
    _require(
        chosen.get("experimental_supported_tools") == [], "model_has_mandatory_tools"
    )
    _require(chosen.get("use_responses_lite") is True, "unsupported_model_transport")
    # Full catalog row is retained and bound; no silent capability drift.
    return chosen


def _worker(plan):
    evidence = {
        "failures": [],
        "connection_lifecycle": [],
        "usage": None,
        "tool_calls": 0,
        "output": [],
        "terminal": False,
        "generation_requests": 0,
        "action_counter_scope": "complete-native-lifecycle-with-source-proved-empty-tools",
        "thread_id": None,
        "turn_id": None,
        "instruction_sources": None,
        "model": {
            "requested": plan["model"],
            "requested_effort": plan["effort"],
            "configured": None,
            "configured_effort": None,
            "configured_provider": None,
            "reported": None,
            "reported_effort": None,
            "identity_basis": "service-configured-no-reroute",
            "reroutes": [],
            "backend_snapshot": "unavailable",
        },
    }
    child = None
    try:
        prefix = plan["prefix"]
        bound = plan["bound"]
        budget = NativeBudget(bound)
        _require(
            plan["fixture"] or plan["binary_sha256"] == BINARY_SHA256,
            "unsupported_native_binary",
        )
        version = _command(prefix + ["--version"], budget).decode().strip()
        _require(version == VERSION, "unsupported_native_version")
        switches = [v for flag in DISABLED_FEATURES for v in ("--disable", flag)]
        switches += ["-c", "include_permissions_instructions=true"]
        features_raw = _command(
            prefix + switches + ["features", "list"], budget
        ).decode()
        features = {}
        for line in features_raw.splitlines():
            fields = line.split()
            _require(
                len(fields) >= 3 and fields[-1] in ("false", "true"),
                "invalid_effective_features",
            )
            _require(fields[0] not in features, "duplicate_effective_feature")
            features[fields[0]] = fields[-1] == "true"
        _require(
            all(features.get(flag) is False for flag in DISABLED_FEATURES),
            "unapplied_feature_controls",
        )
        catalog = json.loads(_command(prefix + switches + ["debug", "models"], budget))
        selected = _selection(catalog["models"], plan["model"])
        control = {
            "contract": "native-configured-selection/v1",
            "version": version,
            "binary_sha256": plan["binary_sha256"],
            "source_commit": SOURCE_COMMIT,
            "source_hashes": SOURCE_HASHES,
            "features": features,
            "config": CONFIG,
            "model_capability": selected,
            "model": plan["model"],
            "effort": plan["effort"],
            "loader": "inline-developer-packet; native-auto-sources-empty; fixed-marker-free-user-input",
            "tools": "empty-by-pinned-source-gates-and-empty-mcp-environments",
            "environments": [],
            "dynamicTools": [],
            "selectedCapabilityRoots": [],
            "runtimeWorkspaceRoots": [],
            "approvalPolicy": "never",
            "sandbox": {"type": "readOnly", "networkAccess": False},
            "allowProviderModelFallback": False,
            "ephemeral": True,
        }
        evidence["native_controls"] = control
        child = Child(
            prefix + switches + ["app-server", "--strict-config", "--stdio"], budget
        )
        seq = 0
        pending = None
        thread = None
        announced_thread = None
        turn = None
        started = False
        usage = None
        completed = {}
        active = set()
        terminal_items = None
        early_thread_ids = []
        early_turn_events = []

        def send(method, params=None, notification=False):
            nonlocal seq, pending
            message = {"method": method}
            if params is not None:
                message["params"] = params
            if not notification:
                seq += 1
                message["id"] = seq
                pending = seq
            _emit("request", _safe(message))
            child.proc.stdin.write(_json(message) + b"\n")
            child.proc.stdin.flush()

        def receive(*, project_config=False):
            raw = child.read()
            _require(bool(raw), "native_eof")
            message = json.loads(raw)
            _require(isinstance(message, dict), "invalid_native_message")
            if project_config and "id" in message and "method" not in message:
                _require(
                    type(message["id"]) is int
                    and message["id"] == pending
                    and "error" not in message,
                    "invalid_effective_config_response",
                )
                result = message.get("result")
                config = result.get("config") if isinstance(result, dict) else None
                # Complete ConfigToml -> ApiConfig with flattened additional map
                # is source-audited. Never emit provider/auth/other config fields.
                projection = _safe_config_projection(config)
                message = {
                    "id": message["id"],
                    "result": {"safe_instruction_config": projection},
                }
            _emit("native", _safe(message))
            if "method" in message and "id" in message:
                evidence["tool_calls"] += 1
            _require(
                not ("method" in message and "id" in message),
                "native_server_request_forbidden",
            )
            return message

        def event(message):
            nonlocal started, usage, terminal_items, announced_thread
            method = message.get("method")
            p = message.get("params", {})
            _require(isinstance(p, dict), "invalid_native_event")
            if method == "remoteControl/status/changed":
                # Pinned lib.rs sends this to the initialized connection even
                # before a thread exists; it is never a model/thread action.
                required = {"installationId", "serverName", "status"}
                _require(
                    set(message) <= {"method", "params", "emittedAtMs"}
                    and required.issubset(p)
                    and set(p) <= required | {"environmentId"}
                    and p["status"] == "disabled"
                    and p.get("environmentId") is None
                    and all(
                        isinstance(p[k], str) and p[k]
                        for k in ("installationId", "serverName")
                    )
                    and (
                        "emittedAtMs" not in message
                        or (
                            type(message["emittedAtMs"]) is int
                            and message["emittedAtMs"] >= 0
                        )
                    ),
                    "unsupported_connection_lifecycle",
                )
                evidence["connection_lifecycle"].append(_safe(message))
                return
            if method == "thread/started":
                _require(announced_thread is None, "duplicate_thread_notification")
                announced_thread = p.get("thread", {}).get("id")
                _require(
                    isinstance(announced_thread, str)
                    and (thread is None or announced_thread == thread),
                    "mixed_thread",
                )
                return
            if method in (
                "warning",
                "error",
                "configWarning",
                "guardianWarning",
                "model/rerouted",
            ):
                if method == "model/rerouted":
                    evidence["model"]["reroutes"].append(_safe(p))
                raise ProtocolFailure("native_" + method.replace("/", "_"))
            if method == "thread/status/changed" and thread is None:
                _require(
                    p.get("status") == {"type": "idle"}
                    and isinstance(p.get("threadId"), str),
                    "invalid_prethread_status",
                )
                early_thread_ids.append(p["threadId"])
                return
            _require(thread is not None and p.get("threadId") == thread, "mixed_thread")
            if method == "thread/status/changed":
                status = p.get("status", {})
                _require(
                    status in ({"type": "idle"}, {"type": "active", "activeFlags": []}),
                    "unexpected_native_thread_status",
                )
                return
            _require(not evidence["terminal"], "event_after_terminal")
            event_turn = p.get("turnId", p.get("turn", {}).get("id"))
            _require(turn is not None and event_turn == turn, "mixed_turn")
            if method == "turn/started":
                _require(
                    not started and p["turn"].get("status") == "inProgress",
                    "invalid_turn_start",
                )
                started = True
            elif method == "thread/tokenUsage/updated":
                _require(started, "usage_before_turn")
                u = p.get("tokenUsage", {})
                last = u.get("last")
                total = u.get("total")
                keys = (
                    "inputTokens",
                    "cachedInputTokens",
                    "outputTokens",
                    "reasoningOutputTokens",
                    "totalTokens",
                )
                _require(
                    isinstance(last, dict)
                    and last == total
                    and all(type(last.get(k)) is int and last[k] >= 0 for k in keys),
                    "invalid_native_usage",
                )
                _require(
                    last["cachedInputTokens"] <= last["inputTokens"]
                    and last["reasoningOutputTokens"] <= last["outputTokens"]
                    and last["totalTokens"]
                    == last["inputTokens"] + last["outputTokens"],
                    "invalid_native_usage",
                )
                usage = {
                    "input_tokens": last["inputTokens"],
                    "cached_input_tokens": last["cachedInputTokens"],
                    "output_tokens": last["outputTokens"],
                    "reasoning_output_tokens": last["reasoningOutputTokens"],
                    "total_tokens": last["totalTokens"],
                    "scope": "single-native-turn",
                }
            elif method in ("item/started", "item/completed"):
                _require(started, "item_before_turn")
                item = p.get("item", {})
                identifier = item.get("id")
                kind = item.get("type")
                _require(isinstance(identifier, str) and identifier, "invalid_item")
                if kind not in ("agentMessage", "reasoning", "userMessage"):
                    evidence["tool_calls"] += 1
                    raise ProtocolFailure("disallowed_native_operation")
                if kind == "userMessage":
                    _require(
                        item.get("content")
                        == [{"type": "text", "text": TURN_TEXT, "text_elements": []}],
                        "unexpected_native_user_input",
                    )
                if kind == "agentMessage":
                    _require(
                        not item.get("questions") and not item.get("delivery"),
                        "native_user_message_forbidden",
                    )
                if method == "item/started":
                    _require(
                        identifier not in active and identifier not in completed,
                        "duplicate_item",
                    )
                    active.add(identifier)
                else:
                    _require(identifier not in completed, "duplicate_item")
                    active.discard(identifier)
                    completed[identifier] = _safe(item)
                    if kind == "agentMessage":
                        _require(isinstance(item.get("text"), str), "invalid_output")
                        evidence["output"].append(item["text"])
            elif method == "turn/completed":
                t = p["turn"]
                _require(
                    started
                    and t.get("status") == "completed"
                    and not t.get("error")
                    and not active,
                    "invalid_turn_terminal",
                )
                _require(isinstance(t.get("items"), list), "missing_terminal_items")
                terminal_items = [_safe(i) for i in t["items"]]
                # Terminal inventories may be empty in native notifications; when
                # present they must agree with individually observed completions.
                _require(
                    all(
                        i.get("id") in completed and completed[i["id"]] == i
                        for i in terminal_items
                    ),
                    "unobserved_terminal_item",
                )
                evidence["terminal"] = True
            elif method in (
                "item/agentMessage/delta",
                "item/reasoning/summaryTextDelta",
                "item/reasoning/textDelta",
                "item/reasoning/summaryPartAdded",
            ):
                _require(started and p.get("itemId") in active, "orphan_item_delta")
            else:
                raise ProtocolFailure("unsupported_native_event")

        def response(*, project_config=False, buffer_turn=False):
            nonlocal pending
            while True:
                message = receive(project_config=project_config)
                if "id" in message:
                    _require(
                        type(message["id"]) is int and message["id"] == pending,
                        "unexpected_native_response",
                    )
                    pending = None
                    _require(
                        "error" not in message
                        and isinstance(message.get("result"), dict),
                        "native_rpc_error",
                    )
                    return message["result"]
                if buffer_turn and message.get("method") in (
                    "turn/started",
                    "turn/completed",
                    "thread/tokenUsage/updated",
                    "thread/status/changed",
                    "item/started",
                    "item/completed",
                    "item/agentMessage/delta",
                    "item/reasoning/summaryTextDelta",
                    "item/reasoning/textDelta",
                    "item/reasoning/summaryPartAdded",
                ):
                    item = message.get("params", {}).get("item")
                    if item is not None and item.get("type") not in (
                        "agentMessage",
                        "reasoning",
                        "userMessage",
                    ):
                        evidence["tool_calls"] += 1
                        raise ProtocolFailure("disallowed_native_operation")
                    early_turn_events.append(message)
                    continue
                event(message)

        send(
            "initialize",
            {
                "clientInfo": {"name": "forgewright-skill-eval", "version": "1"},
                "capabilities": {"experimentalApi": True},
            },
        )
        response()
        send("initialized", notification=True)
        send("config/read", {"cwd": plan["cwd"], "includeLayers": False})
        projection = response(project_config=True)["safe_instruction_config"]
        control["effective_instruction_config"] = projection
        _require(
            projection["include_permissions_instructions"] is True,
            "permissions_instructions_unproved",
        )
        _require(
            not any(projection[k] for k in projection if k.endswith("_present")),
            "unbound_custom_instruction_config",
        )
        send("model/list", {"includeHidden": False})
        models = response()
        rows = [m for m in models.get("data", []) if m.get("model") == plan["model"]]
        _require(
            models.get("nextCursor") is None
            and len(rows) == 1
            and any(
                x.get("reasoningEffort") == plan["effort"]
                for x in rows[0].get("supportedReasoningEfforts", [])
            ),
            "service_model_selection_unavailable",
        )
        evidence["service_model_capability"] = rows[0]
        params = {
            "model": plan["model"],
            "allowProviderModelFallback": False,
            "ephemeral": True,
            "cwd": plan["cwd"],
            "approvalPolicy": "never",
            "sandbox": "read-only",
            "environments": [],
            "dynamicTools": [],
            "selectedCapabilityRoots": [],
            "runtimeWorkspaceRoots": [],
            "experimentalRawEvents": False,
            "config": CONFIG,
            "developerInstructions": plan["payload"],
        }
        send("thread/start", params)
        selection = response()
        t = selection.get("thread", {})
        thread = t.get("id")
        _require(announced_thread is None or announced_thread == thread, "mixed_thread")
        _require(
            all(identifier == thread for identifier in early_thread_ids), "mixed_thread"
        )
        _require(
            isinstance(thread, str)
            and thread
            and t.get("ephemeral") is True
            and t.get("environments") == [],
            "unisolated_native_thread",
        )
        _require(
            selection.get("model") == plan["model"]
            and selection.get("reasoningEffort") == plan["effort"]
            and selection.get("modelProvider") == "openai",
            "native_selection_mismatch",
        )
        _require(
            selection.get("instructionSources") == []
            and selection.get("runtimeWorkspaceRoots") == []
            and selection.get("cwd") == plan["cwd"]
            and selection.get("approvalPolicy") == "never"
            and selection.get("sandbox")
            == {"type": "readOnly", "networkAccess": False},
            "native_isolation_unproved",
        )
        evidence["model"].update(
            configured=selection["model"],
            configured_effort=selection["reasoningEffort"],
            configured_provider=selection["modelProvider"],
        )
        evidence["thread_id"] = thread
        evidence["instruction_sources"] = []
        control["service_model_capability"] = rows[0]
        control["configured_provider"] = selection["modelProvider"]
        evidence["native_control_digest"] = _hash(_json(control))
        send("mcpServerStatus/list", {"threadId": thread})
        mcp = response()
        _require(
            mcp.get("data") == [] and mcp.get("nextCursor") is None,
            "native_mcp_not_empty",
        )
        evidence["generation_requests"] += 1
        send(
            "turn/start",
            {
                "threadId": thread,
                "input": [{"type": "text", "text": TURN_TEXT, "text_elements": []}],
            },
        )
        result = response(buffer_turn=True)
        turn = result.get("turn", {}).get("id")
        evidence["turn_id"] = turn
        _require(
            isinstance(turn, str)
            and turn
            and result["turn"].get("status") == "inProgress",
            "invalid_turn_response",
        )
        for message in early_turn_events:
            event(message)
        while not evidence["terminal"]:
            message = receive()
            _require("id" not in message, "unexpected_native_response")
            event(message)
        _require(usage is not None, "missing_native_usage")
        _require(evidence["output"], "missing_native_output")
        evidence["usage"] = usage
        child.proc.stdin.close()
        while raw := child.read():
            message = json.loads(raw)
            _emit("native", _safe(message))
            _require("id" not in message, "native_server_request_forbidden")
            event(message)
        child.proc.wait()
        _require(child.proc.returncode == 0, "native_nonzero_exit")
        _require(budget.used <= budget.limit, "native_output_limit")
    except (
        ProtocolFailure,
        ValueError,
        KeyError,
        TypeError,
        UnicodeError,
        OSError,
    ) as error:
        evidence["failures"].append(
            str(error)
            if isinstance(error, ProtocolFailure)
            else "invalid_native_protocol_or_launch"
        )
    finally:
        if child is not None:
            child.close()
        if "budget" in locals():
            evidence["native_observed_bytes"] = budget.used
            if (
                budget.used > budget.limit
                and "native_output_limit" not in evidence["failures"]
            ):
                evidence["failures"].append("native_output_limit")
        _emit("summary", evidence)


def validate_request(payload, *, model, effort, limits):
    packet = json.loads(payload)
    public = {k: packet.get(k) for k in ("prompt", "source_facts")}
    if re.search(
        r"\$[A-Za-z_][\w-]*|<skill\b|\[\[?skill[:/]", json.dumps(public), re.I
    ):
        raise ValueError("native skill mention forbidden in public task")
    if (
        model != "gpt-5.6-sol"
        or effort != "low"
        or limits.allowed_operations
        or limits.request_limit != 1
    ):
        raise ValueError("only audited gpt-5.6-sol/low text-only selection supported")


def capture_transport(
    executable, payload, *, model, effort, cwd, limits, fixture_command=None
):
    """Bound the entire preflight + one session with the reviewed owned supervisor."""
    from skill_eval_host import run_owned_process

    if fixture_command is not None and (
        not isinstance(fixture_command, tuple)
        or not fixture_command
        or not all(isinstance(arg, str) and "\0" not in arg for arg in fixture_command)
        or not fixture_command[0]
    ):
        raise ValueError("nonempty fixture argv tuple required")
    validate_request(payload, model=model, effort=effort, limits=limits)
    resolved = shutil.which(executable)
    binary_hash = _hash(Path(resolved).read_bytes()) if resolved else None
    plan = {
        "prefix": list(fixture_command) if fixture_command is not None else [resolved],
        "binary_sha256": binary_hash,
        "payload": payload.decode(),
        "model": model,
        "effort": effort,
        "cwd": str(cwd),
        "bound": limits.output_bytes,
        "fixture": fixture_command is not None,
    }
    process = run_owned_process(
        [sys.executable, str(Path(__file__).resolve())],
        _json(plan),
        cwd=cwd,
        wall_seconds=limits.wall_seconds,
        output_bytes=limits.output_bytes,
        cleanup_seconds=limits.cleanup_seconds,
    )
    evidence = {
        "failures": ["missing_native_summary"],
        "usage": None,
        "model": {"requested": model, "reported": None},
        "instruction_sources": None,
        "tool_calls": None,
        "thread_id": None,
        "terminal": False,
        "output": [],
    }
    try:
        messages = [json.loads(line) for line in process["stdout"].splitlines()]
        summaries = [m["value"] for m in messages if m.get("host_event") == "summary"]
        if len(summaries) == 1 and messages[-1].get("host_event") == "summary":
            evidence = summaries[0]
    except (ValueError, KeyError, TypeError):
        pass
    return {"process": process, "evidence": evidence}


if __name__ == "__main__":
    _worker(json.load(sys.stdin))
