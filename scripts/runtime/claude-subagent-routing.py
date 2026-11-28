#!/usr/bin/env python3
"""Resolve a Forgewright tier to Claude Code Agent tool arguments.

The tier (`scout`, `builder`, `expert`) comes from task evidence: a requested
tier (for example `worker.role` from `scripts/runtime/orchestration_policy.py`)
plus risk signals. Any kernel/ESCALATE.md HARD signal floors the tier at
`expert`; a requested tier can raise but never lower it. Two role tiers sit
outside that ladder: `planner` (planning and design decisions) and `reviewer`
(independent review). They run on the most capable configured model, so a
requested role tier is kept as is and satisfies the HARD floor when that model
is verified; under HARD signals without it, the request falls back to
`expert`. Role tiers are never chosen implicitly. The resolver then maps
the tier to the Claude Code Agent tool and never invents capabilities:

* `subagent_type` is emitted only when the configured agent (bare, or
  plugin-namespaced as `<plugin>:<agent>`) is advertised by the active runtime.
* `model` is emitted only when the configured alias is advertised by the
  active Agent tool schema. A plugin agent already pins its model in its
  frontmatter, so the alias is a fallback for a generic agent type.
* `effort` is emitted only when the configured level is advertised by the
  active Agent tool schema (`efforts`). A plugin agent pins it in its
  frontmatter too, which applies when no `effort` is passed; a generic agent
  type then inherits the parent effort. The level is resolved independently of
  the model, matched exactly, and never raised or lowered to a level the
  schema did not advertise.
* Missing or malformed capability data yields `provider-managed` selection
  with no override (the subagent inherits the parent's model).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Mapping

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = ROOT / ".production-grade.yaml"
TIERS = ("scout", "builder", "expert")
ROLE_TIERS = ("planner", "reviewer")
ALL_TIERS = TIERS + ROLE_TIERS
FALLBACK_AGENT_TYPE = "general-purpose"


def _mapping(value: Any) -> Mapping[str, Any] | None:
    return value if isinstance(value, Mapping) else None


def _string_set(value: Any) -> set[str] | None:
    if not isinstance(value, list) or not all(
        isinstance(item, str) and item for item in value
    ):
        return None
    return set(value)


def _match_agent(configured: str, advertised: set[str]) -> str | None:
    if configured in advertised:
        return configured
    namespaced = sorted(name for name in advertised if name.endswith(":" + configured))
    return namespaced[0] if len(namespaced) == 1 else None


# kernel/ESCALATE.md HARD signals, matched as keyword stems anywhere in a
# free-text risk signal (case-, hyphen- and underscore-insensitive). Matching is
# deliberately broad: a false positive costs an expert run, a false negative
# would downgrade HARD scope. Tests drive this from the ESCALATE.md wording and
# require it to cover orchestration_policy.HIGH_RISK.
HARD_SIGNAL_PATTERNS = {
    "repeated-failure": r"repeat|stuck|fail(?:ed|s|ure)?\s+twice|same\s+step",
    "disagreement": r"disagree|conflict(?:ing)?\s+evidence",
    "security": r"secur|vulnerab|exploit|auth[a-z]*|credential|secret",
    "permission": r"permission|privilege|access\s+control",
    "public-contract": r"public|interface|schema|export|contract|\bapi\b",
    "concurrency": r"concurren|lock|order(?:ing)?\b|race|thread|parallel\s+writ",
    "migration": r"migrat",
    "release": r"release|deploy|ship|publish|irreversib|rollback|destructive",
    "payment": r"payment|billing|\biap\b|in\s+app|purchase|receipt|entitlement|subscription|checkout|storekit|refund",
    "guardrail": r"guardrail|\bdeny\b|\bwarn\b|policy\s+block",
    "process-termination": r"process\s+termination|terminat|\bkill\b|unowned|deliberately\s+kept",
}
_HARD_RES = {
    name: re.compile(pattern) for name, pattern in HARD_SIGNAL_PATTERNS.items()
}


def _normalize_signal(signal: str) -> str:
    return re.sub(r"[\s_/-]+", " ", signal.strip().lower())


def hard_signal_classes(signals: list[str] | tuple[str, ...]) -> list[str]:
    """Return the HARD classes matched by any free-text risk signal."""
    matched: set[str] = set()
    for signal in signals:
        if not isinstance(signal, str):
            continue
        text = _normalize_signal(signal)
        matched.update(name for name, regex in _HARD_RES.items() if regex.search(text))
    return sorted(matched)


def select_tier(
    requested: str | None,
    risk_signals: list[str] | tuple[str, ...] = (),
    *,
    mechanical: bool = False,
) -> dict[str, Any]:
    """Pick the cheapest tier allowed by task evidence; HARD signals floor at expert.

    A requested tier can raise the result but never lower it below the floor.
    A requested role tier (planner/reviewer) is kept here: on its configured
    model it meets the expert floor. resolve_routing falls back to expert when
    HARD signals apply and that model is not verified.
    """
    if requested is not None and requested not in ALL_TIERS:
        raise ValueError(f"tier must be one of {list(ALL_TIERS)}")
    hard = hard_signal_classes(risk_signals)
    if hard:
        floor = "expert"
    elif mechanical:
        floor = "scout"
    else:
        floor = "builder" if requested is None else "scout"
    if requested in ROLE_TIERS:
        chosen = requested
    else:
        chosen = floor if requested is None else max(requested, floor, key=TIERS.index)
    return {
        "tier": chosen,
        "requested_tier": requested,
        "tier_floor": floor,
        "hard_signals": hard,
        "escalated": requested is not None and chosen != requested,
    }


def resolve_routing(
    config: Any,
    capabilities: Any,
    *,
    tier: str | None = None,
    risk_signals: list[str] | tuple[str, ...] = (),
    mechanical: bool = False,
    capability_source: str = "active Agent tool schema",
) -> dict[str, Any]:
    selection = select_tier(tier, risk_signals, mechanical=mechanical)
    tier = selection["tier"]
    claude = _mapping(_mapping(_mapping(config) or {}).get("subagents", {}))
    claude = _mapping((claude or {}).get("claude"))
    entry = _mapping(_mapping((claude or {}).get("tiers")) or {}).get(tier)
    entry = _mapping(entry) or {}
    configured_agent = (
        entry.get("agent") if isinstance(entry.get("agent"), str) else None
    )
    configured_model = (
        entry.get("model") if isinstance(entry.get("model"), str) else None
    )
    configured_effort = (
        entry.get("effort") if isinstance(entry.get("effort"), str) else None
    )

    caps = _mapping(capabilities)
    models = _string_set(caps.get("models")) if caps else None
    agents = _string_set(caps.get("agent_types")) if caps else None
    efforts = _string_set(caps.get("efforts")) if caps else None

    args: dict[str, Any] = {}
    reasons: list[str] = []
    if configured_agent and agents is not None:
        matched = _match_agent(configured_agent, agents)
        if matched:
            args["subagent_type"] = matched
        elif FALLBACK_AGENT_TYPE in agents:
            args["subagent_type"] = FALLBACK_AGENT_TYPE
            reasons.append(
                f"agent {configured_agent!r} not advertised; using {FALLBACK_AGENT_TYPE}"
            )
        else:
            reasons.append(f"agent {configured_agent!r} not advertised")
    elif configured_agent:
        reasons.append("agent_types capability missing or malformed")

    model_status = "provider-managed"
    if configured_model and models is not None and configured_model in models:
        args["model"] = configured_model
        model_status = "verified"
    elif configured_model and models is not None:
        reasons.append(
            f"model {configured_model!r} not advertised; inheriting parent model"
        )
    elif configured_model:
        reasons.append(
            "models capability missing or malformed; inheriting parent model"
        )
    else:
        reasons.append("no configured model for tier")

    effort_status = "provider-managed"
    if configured_effort and efforts is not None and configured_effort in efforts:
        args["effort"] = configured_effort
        effort_status = "verified"
    elif configured_effort and efforts is not None:
        reasons.append(
            f"effort {configured_effort!r} not advertised; passing no effort"
        )
    elif configured_effort:
        reasons.append("efforts capability missing or malformed; passing no effort")
    else:
        reasons.append("no configured effort for tier")

    if tier in ROLE_TIERS and selection["hard_signals"] and model_status != "verified":
        # The role tier meets the HARD floor only on its verified model. Without
        # it the subagent would inherit the parent model, which may sit below
        # expert, so route to the expert entry instead.
        fallback = resolve_routing(
            config,
            capabilities,
            tier="expert",
            risk_signals=risk_signals,
            mechanical=mechanical,
            capability_source=capability_source,
        )
        return {
            **fallback,
            "requested_tier": selection["requested_tier"],
            "escalated": True,
            "reasons": list(
                dict.fromkeys(
                    [
                        f"{tier} model {configured_model!r} not verified under HARD signals;"
                        " using the expert tier",
                        *reasons,
                        *fallback["reasons"],
                    ]
                )
            ),
        }

    return {
        **selection,
        "agent_args": args,
        "model_selection": model_status,
        "effort_selection": effort_status,
        "configured": {
            "agent": configured_agent,
            "model": configured_model,
            "effort": configured_effort,
        },
        "capability_source": capability_source,
        "reasons": reasons,
    }


def _load_config(path: Path) -> Any:
    try:
        import yaml  # type: ignore[import-untyped]
    except ImportError:
        return {}
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return {}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument(
        "--tier",
        choices=ALL_TIERS,
        help="requested tier; never lowers the HARD floor (planner/reviewer are kept as is)",
    )
    parser.add_argument(
        "--risk-signal", action="append", default=[], help="repeatable HARD/risk signal"
    )
    parser.add_argument(
        "--mechanical", action="store_true", help="bounded read-only inventory"
    )
    parser.add_argument(
        "--capabilities-json",
        default="",
        help='{"models": [...], "agent_types": [...], "efforts": [...]} from the active Agent tool schema',
    )
    parser.add_argument("--capability-source", default="active Agent tool schema")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        capabilities = (
            json.loads(args.capabilities_json) if args.capabilities_json else None
        )
    except json.JSONDecodeError:
        capabilities = None
    result = resolve_routing(
        _load_config(args.config),
        capabilities,
        tier=args.tier,
        risk_signals=args.risk_signal,
        mechanical=args.mechanical,
        capability_source=args.capability_source,
    )
    sys.stdout.write(json.dumps(result, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
