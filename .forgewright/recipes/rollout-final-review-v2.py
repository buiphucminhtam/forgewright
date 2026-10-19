"""Reviewer-invoked attestation; register only after actual independent review."""

import argparse
from contextlib import redirect_stdout
import importlib
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import sys

ROOT = Path(__file__).resolve().parents[2]
TASK = ROOT / ".forgewright/verify/resource-rollout-completion"
DECISION = TASK / "independent-review-decision.json"


def pending_snapshot(controller, common):
    original = controller.read(controller.FINAL)
    record = common.read_evidence_json(
        controller.ROOT, controller.FINAL, max_bytes=65536
    )
    controller.demand(
        record == json.loads(original), "pending evidence changed during read"
    )
    return original, record


def prepare_approval(controller, record, original):
    controller.demand(
        controller.read(controller.FINAL) == original,
        "pending evidence changed before approval",
    )
    record["reviewer"]["status"] = "independent-approved"


def review_inputs(controller, args, record, original):
    controller.demand(
        args.approve is True and args.reviewer_id == controller.REVIEWER,
        "explicit independent reviewer invocation required",
    )
    decision = json.loads(controller.read(DECISION, 4096))
    required = {
        "schema",
        "reviewer_id",
        "approved",
        "report_sha256",
        "evidence_sha256",
        "tree_sha",
        "turn",
    }
    controller.demand(
        isinstance(decision, dict) and set(decision) == required,
        "invalid independent review decision",
    )
    controller.demand(
        decision["schema"] == "forgewright-independent-review-decision/v1"
        and decision["reviewer_id"] == controller.REVIEWER
        and decision["approved"] is True,
        "independent approval not established",
    )
    controller.demand(
        decision["evidence_sha256"] == controller.digest(original)
        and decision["tree_sha"] == record["tree_sha"]
        and decision["turn"] == record["turn"],
        "review decision does not bind the actual final evidence",
    )
    report = controller.read(controller.REPORT, 65536)
    controller.demand(
        report.strip()
        and isinstance(decision["report_sha256"], str)
        and controller.SHA.fullmatch(decision["report_sha256"])
        and controller.digest(report) == decision["report_sha256"],
        "actual independent report is missing or changed",
    )
    return [
        "Actual independent report: resource-rollout-completion/independent-review-report.md "
        "sha256:" + decision["report_sha256"]
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewer-id", required=True)
    parser.add_argument("--approve", action="store_true", required=True)
    args = parser.parse_args()
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location(
        "rollout_validation_controller", TASK / "validation-controller.py"
    )
    controller = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(controller)
    deployed, common, gate = controller.modules()
    sys.path.insert(0, str(controller.DEPLOYED / "scripts/runtime"))
    from project_recipe import require_managed

    require_managed(controller.ROOT)
    os.chdir(controller.ROOT)
    attest = importlib.import_module("review_attest")
    result = json.loads(controller.read(controller.RESULT))
    controller.validation_released(
        Path.home().resolve() / ".forgewright/runtime/admission", result
    )
    original, record = pending_snapshot(controller, common)
    controller.demand(
        result["status"] == "awaiting-independent-review",
        "completed controller evidence required",
    )
    controller.demand(
        record["reviewer"]
        == {
            "id": controller.REVIEWER,
            "status": "pending",
            "evidence_ref": controller.REVIEW_REF,
        },
        "unexpected reviewer binding",
    )
    controller.validate_record(
        record,
        controller.FINAL,
        common,
        gate,
        result["command"],
        0,
        tree=result["tree_sha"],
    )
    controller.demand(
        common.worktree_fingerprint(controller.ROOT) == record["tree_sha"],
        "current tree changed after validation",
    )
    controller.demand(
        not gate._validate_chain(
            record, controller.ROOT, current_path=controller.FINAL, hard=True
        ),
        "final validation chain is incomplete",
    )
    findings = review_inputs(controller, args, record, original)
    previous_review = (
        controller.read(controller.REVIEW, 262144)
        if controller.REVIEW.exists()
        else None
    )
    prepare_approval(controller, record, original)
    handlers = {
        sig: signal.signal(sig, controller.stop)
        for sig in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT)
    }
    try:
        controller.write(controller.FINAL, controller.canonical(record) + b"\n")
        with redirect_stdout(io.StringIO()):
            code = attest._run_create(
                argparse.Namespace(
                    evidence=str(controller.FINAL),
                    output=None,
                    finding=findings,
                    limitation=[controller.KEYLESS],
                )
            )
        controller.demand(code == 0, "review-2 persistence failed")
        errors = common.schema_errors(record) + common.phase_errors(record, final=True)
        errors += gate._validate_output(record) + gate._validate_staleness(record)
        errors += gate._validate_workspace(
            record, controller.ROOT
        ) + gate._validate_exit_code(record)
        errors += gate._validate_tree(
            record, common.worktree_fingerprint(controller.ROOT)
        )
        errors += gate._validate_hard_requirements(record, True, controller.ROOT)
        errors += gate._validate_chain(
            record, controller.ROOT, current_path=controller.FINAL, hard=True
        )
        controller.demand(
            not errors, "attested validation failed: " + "; ".join(errors[:3])
        )
        persisted = common.read_evidence_json(
            controller.ROOT, controller.FINAL, max_bytes=65536
        )
        controller.demand(persisted == record, "final evidence changed while attesting")
    except BaseException:
        blocked = signal.pthread_sigmask(signal.SIG_BLOCK, set(handlers))
        try:
            controller.write(controller.FINAL, original)
            if previous_review is not None:
                controller.write(controller.REVIEW, previous_review)
            elif controller.REVIEW.exists():
                controller.scoped(controller.REVIEW).unlink()
        finally:
            for sig, handler in handlers.items():
                signal.signal(sig, handler)
            signal.pthread_sigmask(signal.SIG_SETMASK, blocked)
        raise
    finally:
        for sig, handler in handlers.items():
            signal.signal(sig, handler)
    print(
        controller.canonical(
            {
                "status": "independent-approved",
                "evidence_ref": str(controller.FINAL.relative_to(ROOT)),
                "tree_sha": record["tree_sha"],
                "review_ref": controller.REVIEW_REF,
                "limitations": [controller.KEYLESS],
            }
        ).decode()
    )
    print(controller.strict_block(record, approved=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
