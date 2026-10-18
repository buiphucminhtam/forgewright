"""Conservative product-evidence sidecar, independent of skill-quality promotion.

Plan validation checks declared pairing constraints; it does not authenticate
consumer trees, authorize edits, or measure a product. The current trusted
registry issues agent-decision receipts only. Those receipts never establish
render, participant, device, or market evidence. No product collector or JSON
receipt importer is provided here.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Mapping, Sequence

from skill_eval_verify import TrustedRunRegistry

PLAN_SCHEMA = "product-eval-plan/v1"
DECISION_SCHEMA = "product-eval-decision/v1"
PAIR_BINDINGS = (
    "baseline_digest",
    "initial_state_digest",
    "protected_rules_digest",
    "evaluator_digest",
)
PRODUCT_AXES = (
    "implementation",
    "render",
    "player_comprehension",
    "novice_operator",
    "native",
    "business",
)
_HEX = re.compile(r"[0-9a-f]{64}\Z")
_PLAN_FIELDS = {
    "schema",
    "task_id",
    "consumer_id",
    "registry_plan_digest",
    *PAIR_BINDINGS,
    "arms",
    "requested_axes",
    "primary_novice_measure",
    "baseline_defects",
}
_ARM_FIELDS = {
    *PAIR_BINDINGS,
    "run_id",
    "instruction_manifest_digest",
    "host_manifest_digest",
    "output_tree_digest",
    "rendered_build_digest",
    "authorized_output_tree_digests",
}


def _plain(value):
    if isinstance(value, Mapping):
        if any(not isinstance(key, str) for key in value):
            raise ValueError("string mapping fields required")
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    if value is None or type(value) in (str, int, float, bool):
        return value
    raise ValueError("JSON-compatible plan fields required")


def _fields(value, expected, label):
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError(f"exact {label} fields required")


def _text(value, label):
    if not isinstance(value, str) or not value.strip() or len(value) > 2048:
        raise ValueError(f"bounded nonempty {label} required")


def _digest(value, label):
    if not isinstance(value, str) or not _HEX.fullmatch(value):
        raise ValueError(f"SHA-256 {label} required")


def _list(value, label, *, empty=False):
    if not isinstance(value, list) or len(value) > 128 or (not empty and not value):
        raise ValueError(f"bounded {label} list required")


def _novice(value):
    if value is None:
        return
    _fields(value, {"endpoint", "role", "assignments"}, "primary novice measure")
    _text(value["endpoint"], "novice endpoint")
    if value["role"] not in ("player", "operator"):
        raise ValueError("separate player or operator novice role required")
    _list(value["assignments"], "participant assignments")
    participants = set()
    for row in value["assignments"]:
        _fields(
            row, {"participant_id", "arm", "exposure_number"}, "participant assignment"
        )
        _text(row["participant_id"], "participant ID")
        if row["participant_id"] in participants:
            raise ValueError("participant cannot be assigned a second primary exposure")
        participants.add(row["participant_id"])
        if row["arm"] not in ("current", "candidate"):
            raise ValueError("current/candidate participant arm required")
        if type(row["exposure_number"]) is not int or row["exposure_number"] != 1:
            raise ValueError("primary novice measure requires first exposure")


def validate_product_plan(value: Mapping[str, object]) -> dict[str, object]:
    """Return a detached, strict plan or raise ValueError; never prove outcomes.

    Baseline/initial-state/protected-rule/evaluator digests describe the common
    original inputs. Each arm separately declares its run/instruction/host
    manifest and authorized generated tree. Host manifest digests are never
    treated as rendered build digests. Authorization lists are frozen plan
    declarations, not independently issued edit permissions or measurements.
    """
    if not isinstance(value, Mapping):
        raise ValueError("product plan mapping required")
    plan = _plain(value)
    _fields(plan, _PLAN_FIELDS, "product plan")
    try:
        json.dumps(plan, allow_nan=False)
    except (TypeError, ValueError) as error:
        raise ValueError("finite JSON-compatible product plan required") from error
    if plan["schema"] != PLAN_SCHEMA:
        raise ValueError(f"{PLAN_SCHEMA} schema required")
    for key in ("task_id", "consumer_id"):
        _text(plan[key], key)
    for key in (*PAIR_BINDINGS, "registry_plan_digest"):
        _digest(plan[key], key)
    _fields(plan["arms"], {"current", "candidate"}, "paired arms")
    run_ids = set()
    for name, arm in plan["arms"].items():
        _fields(arm, _ARM_FIELDS, f"{name} arm")
        for key in PAIR_BINDINGS:
            _digest(arm[key], key)
            if arm[key] != plan[key]:
                raise ValueError(f"same original {key} required for paired arms")
        _text(arm["run_id"], "run ID")
        if arm["run_id"] in run_ids:
            raise ValueError("each arm requires its own run ID")
        run_ids.add(arm["run_id"])
        for key in (
            "instruction_manifest_digest",
            "host_manifest_digest",
            "output_tree_digest",
        ):
            _digest(arm[key], key)
        if arm["rendered_build_digest"] is not None:
            _digest(arm["rendered_build_digest"], "rendered_build_digest")
        authorized = arm["authorized_output_tree_digests"]
        _list(authorized, "authorized output trees")
        for digest in authorized:
            _digest(digest, "authorized output tree")
        if (
            len(set(authorized)) != len(authorized)
            or arm["output_tree_digest"] not in authorized
        ):
            raise ValueError(
                "arm output tree must be explicitly authorized in the frozen plan"
            )
    axes = plan["requested_axes"]
    _list(axes, "requested axes")
    if any(not isinstance(axis, str) or axis not in PRODUCT_AXES for axis in axes):
        raise ValueError("known product axes required")
    if len(set(axes)) != len(axes):
        raise ValueError("unique requested axes required")
    _novice(plan["primary_novice_measure"])
    _list(plan["baseline_defects"], "baseline defects", empty=True)
    defect_ids = set()
    for row in plan["baseline_defects"]:
        _fields(
            row,
            {"id", "source", "reproduction_status", "impact", "owner", "disposition"},
            "baseline defect",
        )
        for key, field in row.items():
            _text(field, f"defect {key}")
        if row["id"] in defect_ids:
            raise ValueError("unique baseline defect IDs required")
        defect_ids.add(row["id"])
        if row["reproduction_status"] not in ("not-reproduced", "reproduced"):
            raise ValueError("explicit baseline defect reproduction status required")
        if row["disposition"] not in ("in-scope", "out-of-scope"):
            raise ValueError("explicit baseline defect scope disposition required")
    return plan


def evaluate_product_evidence(
    plan: Mapping[str, object],
    *,
    registry: TrustedRunRegistry,
    observation_refs: Sequence[str],
) -> dict[str, object]:
    """Audit genuine agent receipts; report unsupported product axes UNVERIFIED.

    Registry resolution authenticates only its existing in-process issuance
    boundary. Hashes do not authenticate same-user code/memory or an observer's
    honesty. Persisted decision JSON is a report, never a trusted receipt.
    """
    plan = validate_product_plan(plan)
    if type(registry) is not TrustedRunRegistry:
        raise ValueError("out-of-band TrustedRunRegistry required")
    if (
        not isinstance(observation_refs, Sequence)
        or isinstance(observation_refs, (str, bytes))
        or len(observation_refs) > 128
        or any(
            not isinstance(ref, str) or not ref.strip() or len(ref) > 4096
            for ref in observation_refs
        )
        or len(set(observation_refs)) != len(observation_refs)
    ):
        raise ValueError("bounded unique observation reference strings required")
    accepted, rejected = [], []
    for ref in observation_refs:
        observation = registry.resolve_observation(
            ref, plan_digest=plan["registry_plan_digest"]
        )
        if observation is None:
            rejected.append(
                {"ref": ref, "reason": "no fresh independently issued receipt"}
            )
            continue
        arm = next(
            (
                row
                for row in plan["arms"].values()
                if row["run_id"] == observation.run_id
            ),
            None,
        )
        if (
            arm is None
            or observation.ref != ref
            or observation.source_digest != arm["instruction_manifest_digest"]
            or observation.build_digest != arm["host_manifest_digest"]
        ):
            rejected.append(
                {"ref": ref, "reason": "run/source/host manifest binding mismatch"}
            )
            continue
        # Do not silently accept a future collector's capability or reinterpret
        # a host's source/build fields as consumer source/rendered-build proof.
        if observation.capabilities != ("agent-decision",):
            rejected.append(
                {
                    "ref": ref,
                    "reason": "collector capability unsupported by product verifier",
                }
            )
            continue
        accepted.append(
            {
                "ref": ref,
                "run_id": observation.run_id,
                "collector_id": observation.collector_id,
                "capabilities": list(observation.capabilities),
                "instruction_manifest_digest": observation.source_digest,
                "host_manifest_digest": observation.build_digest,
                "raw_artifacts": _plain(observation.raw_artifacts),
                "host_measurements": _plain(observation.measurements),
            }
        )
    axes = {
        axis: {
            "status": "UNVERIFIED",
            "requested": axis in plan["requested_axes"],
            "measurements": {},
            "reason": f"no reviewed {axis} collector or independently measured product receipt",
        }
        for axis in PRODUCT_AXES
    }
    reproduced = any(
        row["reproduction_status"] == "reproduced" for row in plan["baseline_defects"]
    )
    canonical = json.dumps(
        plan, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode()
    return {
        "schema": DECISION_SCHEMA,
        "task_id": plan["task_id"],
        "consumer_id": plan["consumer_id"],
        "plan_digest": hashlib.sha256(canonical).hexdigest(),
        "registry_plan_digest": plan["registry_plan_digest"],
        "pairing": {
            "status": "VALID",
            "meaning": "declared plan constraints only; no execution or product verification",
        },
        "accepted_agent_decisions": accepted,
        "rejected_observations": rejected,
        "axes": axes,
        "scoped_task": {
            "status": "UNVERIFIED",
            "reason": "product rules and absolute quality bar not independently measured",
        },
        "readiness": {
            "status": "FAIL" if reproduced else "UNVERIFIED",
            "baseline_defects": plan["baseline_defects"],
            "reason": "declared reproduced baseline defect remains unresolved"
            if reproduced
            else "whole-product readiness lacks independent product/native/business evidence",
        },
        "comparative_improvement": False,
        "limitations": [
            "Contract tests and plan declarations do not establish actual product outcomes",
            "Agent decisions and host measurements cannot certify rendered builds, human comprehension, novice operation, native devices or revenue",
            "No product/human/business/native collector is implemented; missing measurements have no numeric fallback",
            "Hashes and in-process identities do not authenticate same-user code/memory modification or evaluator honesty",
            "No statistical significance or whole-game generalization is inferred",
        ],
    }
