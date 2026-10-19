"""Fixed, bounded, read-only runtime packet for the independent rollout reviewer."""

import importlib.util
import json
from pathlib import Path
import re
import sqlite3
import sys
from types import SimpleNamespace

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
TASK = ROOT / ".forgewright/verify/resource-rollout-completion"
JOB = re.compile(r"job-[a-f0-9]{32}")


def fingerprint(common):
    persist = common._save_stat_cache
    try:
        common._save_stat_cache = lambda *args: None
        return common.worktree_fingerprint(ROOT)
    finally:
        common._save_stat_cache = persist


def main():
    if len(sys.argv) != 1:
        raise SystemExit("this reader accepts no arguments")
    spec = importlib.util.spec_from_file_location(
        "rollout_packet_controller", TASK / "validation-controller.py"
    )
    controller = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(controller)
    deployed, common, gate = controller.modules()
    sys.path.insert(0, str(controller.DEPLOYED / "scripts/runtime"))
    from project_recipe import require_managed
    from host_job_profiles import private_read
    from host_job_runner import journal_released

    require_managed(ROOT)
    demand = controller.demand
    home = Path.home().resolve() / ".forgewright/runtime/admission"
    raw_result = controller.read(controller.RESULT, 262144)
    result = json.loads(raw_result)
    demand(
        result["status"] == "awaiting-independent-review",
        "completed controller result required",
    )
    controller.validation_released(home, result)
    raw_final = controller.read(controller.FINAL, 65536)
    final = common.read_evidence_json(ROOT, controller.FINAL, max_bytes=65536)
    demand(final == json.loads(raw_final), "pending evidence changed during read")
    tree = fingerprint(common)
    demand(tree == final["tree_sha"], "tree changed after controller verification")
    controller.validate_record(
        final,
        controller.FINAL,
        common,
        gate,
        result["command"],
        0,
        tree=result["tree_sha"],
    )
    demand(
        not gate._validate_chain(final, ROOT, current_path=controller.FINAL, hard=True),
        "invalid final evidence chain",
    )
    links = common.link_values(final)
    demand(
        {"red", "pre_mutation", "mutation"}.issubset(links) and len(links) <= 8,
        "bounded fix chain required",
    )
    linked = {}
    for relation, ref in links.items():
        path, error = common.resolve_evidence_link(ROOT, ref)
        demand(error is None and path is not None, "unsafe linked evidence")
        raw = common.read_evidence_bytes(ROOT, path, max_bytes=65536)
        record = common.read_evidence_json(ROOT, path, max_bytes=65536)
        demand(record == json.loads(raw), "linked evidence changed during read")
        demand(not gate._validate_output(record), "invalid linked output")
        linked[relation] = {
            "ref": ref,
            "sha256": controller.digest(raw),
            "record": record,
        }
    manifest_path = TASK / "rollout-manifest.json"
    raw_manifest = controller.read(manifest_path, 262144)
    demand(
        controller.digest(raw_manifest) == result["command"][-1],
        "manifest no longer matches executed command",
    )
    manifest = json.loads(raw_manifest)
    expected = {
        str(ROOT),
        str(ROOT.parent / "arrow"),
        str(ROOT.parent / "mobbowmaster"),
    }
    demand(
        len(manifest["projects"]) == 3
        and {item["root"] for item in manifest["projects"]} == expected,
        "unexpected pilot scope",
    )
    enrollments = json.loads(private_read(home / "enrollments.json", 65536))
    connection = sqlite3.connect(
        (home / "host.sqlite3").as_uri() + "?mode=ro", uri=True, timeout=0.25
    )
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    admission = SimpleNamespace(connection=connection)
    projects = []
    try:
        for item in manifest["projects"]:
            root = item["root"]
            entry = enrollments[root]
            deployed.validate_binding(entry)
            demand(
                entry["phase"] == entry["mode"] == "enforce"
                and entry["enforcement_verified"] is True,
                "project is not verified-enforced",
            )
            records = {}
            for role, job_id in (
                ("canary", entry["native_proof"]["job_id"]),
                ("pilot", item["pilot_job"]),
            ):
                demand(
                    isinstance(job_id, str) and JOB.fullmatch(job_id),
                    "invalid fixed pilot job ID",
                )
                raw = private_read(home / "jobs" / (job_id + ".json"), 65536)
                journal = json.loads(raw)
                demand(
                    journal["job_id"] == job_id
                    and journal["physical_workspace"] == root
                    and journal["state"] == "quiescent"
                    and type(journal["exit_code"]) is int
                    and journal["exit_code"] == 0
                    and journal_released(admission, journal),
                    "pilot/canary not successful and released",
                )
                demand(
                    journal["storage"]["quiescent"] is True
                    and journal["storage"]["state"] in {"retained", "reclaimed"},
                    "pilot storage is not quiescent",
                )
                if role == "pilot":
                    demand(
                        journal["profile"] == item["profile"]
                        and journal["profile_digest"] == item["digest"],
                        "pilot digest changed",
                    )
                else:
                    demand(
                        journal["native_context"]["native"]
                        == entry["native_proof"]["native"],
                        "canary native context changed",
                    )
                records[role] = {
                    "journal_sha256": controller.digest(raw),
                    "journal": journal,
                    "canonical_leases_released": True,
                }
            projects.append(
                {"root": root, "native_proof": entry["native_proof"], "jobs": records}
            )
        main_pilot = next(row for row in projects if row["root"] == str(ROOT))["jobs"][
            "pilot"
        ]["journal"]
        demand(
            main_pilot["job_id"] == manifest["injection_job"]
            and main_pilot["native_context"]["native"]["session_id"]
            == manifest["session"],
            "injection is not the pinned native pilot",
        )
        held = str(ROOT.parent / "videoeditor")
        demand(
            deployed.operator_disabled(home, held),
            "owner-held videoeditor must remain disabled",
        )
    finally:
        connection.close()
    packet = {
        "schema": "forgewright-rollout-review-packet/v1",
        "authority": "read-only",
        "evidence_ref": str(controller.FINAL.relative_to(ROOT / ".forgewright/verify")),
        "evidence_sha256": controller.digest(raw_final),
        "current_tree_sha": tree,
        "final_evidence": final,
        "controller_result_sha256": controller.digest(raw_result),
        "controller_result": result,
        "controller_released": True,
        "linked_records": linked,
        "manifest_sha256": controller.digest(raw_manifest),
        "native_projects": projects,
        "owner_held": {"root": held, "operator_disabled": True},
    }
    if final["reviewer"]["status"] == "independent-approved":
        raw_review = controller.read(controller.REVIEW, 262144)
        demand(
            not gate._validate_hard_requirements(final, True, ROOT),
            "invalid independent attestation",
        )
        demand(
            controller.read(controller.REVIEW, 262144) == raw_review,
            "review changed while validating attestation",
        )
        packet["review2_sha256"] = controller.digest(raw_review)
        packet["review2"] = json.loads(raw_review)
        packet["strict_block"] = controller.strict_block(final, approved=True)
    demand(
        controller.read(controller.FINAL, 65536) == raw_final
        and controller.read(controller.RESULT, 262144) == raw_result
        and fingerprint(common) == tree,
        "evidence changed while reading review packet",
    )
    raw = controller.canonical(packet)
    demand(len(raw) <= 786432, "review packet exceeds fixed output bound")
    print(raw.decode())


if __name__ == "__main__":
    main()
