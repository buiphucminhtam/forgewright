#!/usr/bin/env python3
"""Read current pilot receipts and run the local regression boundary again."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import sqlite3
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "scripts/runtime"), str(ROOT / "scripts/memory")]
from host_job_profiles import private_read, load_profile
from host_job_runner import journal_released
from project_disk import report_project
from recurrence import lesson_context


def scope_roots(manifest):
    projects, held = manifest["projects"], manifest["held_projects"]
    assert len(projects) == 3 and len(held) == 1, "three covered workspaces and one owner-held workspace required"
    roots = [str(Path(item["root"]).resolve(strict=True)) for item in projects]
    expected = {str(path.resolve(strict=True)) for path in (ROOT, ROOT.parent / "arrow", ROOT.parent / "mobbowmaster")}
    assert len(set(roots)) == 3 and set(roots) == expected, "invalid covered physical roots"
    held_root = str(Path(held[0]["root"]).resolve(strict=True))
    assert held_root == str((ROOT.parent / "videoeditor").resolve(strict=True)) and held_root not in roots
    assert held[0]["status"] == "owner-held"
    assert held[0]["reason"] == "native hook not loaded; failed realcanary; ownerpaused"
    return roots, held_root


def validate_held(home, admission, held_root, deployed):
    assert deployed.operator_disabled(home, held_root), "owner-held videoeditor must remain disabled"
    assert admission.connection.execute(
        "SELECT 1 FROM jobs WHERE project=? AND kind='heavy' AND state!='released' LIMIT 1",
        (held_root,),
    ).fetchone() is None, "owner-held workspace has an unreleased heavy job"


def validate_injection(admission, injected, manifest, context):
    assert injected["job_id"] == manifest["injection_job"]
    assert injected["physical_workspace"] == str(ROOT)
    assert injected["profile"] == "cli-build-20261018-v1"
    assert injected["profile_digest"] == manifest["main_profile_digest"]
    assert injected["native_context"]["native"]["session_id"] == manifest["session"]
    assert injected["native_context"]["physical_workspace"] == str(ROOT)
    assert injected["native_context"]["profile_digest"] == manifest["main_profile_digest"]
    assert 0 < injected["native_context"]["lesson_context_chars"] == len(context["context"])
    assert injected["native_context"]["lesson_context_sha256"] == hashlib.sha256(context["context"].encode()).hexdigest()
    assert injected["state"] == "quiescent" and type(injected["exit_code"]) is int and injected["exit_code"] == 0
    assert injected["storage"]["quiescent"] is True and injected["storage"]["state"] in {"retained", "reclaimed"}
    assert journal_released(admission, injected)


def main():
    if sys.flags.optimize:
        raise SystemExit("Optimized Python cannot execute acceptance assertions")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--sha256", required=True)
    args = parser.parse_args()
    raw = private_read(args.manifest, 262144)
    assert hashlib.sha256(raw).hexdigest() == args.sha256
    manifest = json.loads(raw)
    assert manifest["schema"] == "forgewright-resource-rollout-pilot/v1"
    _, held_root = scope_roots(manifest)
    tests = [
        "tests/unit_tests/test_resource_controls.py", "tests/unit_tests/test_project_disk.py", "tests/unit_tests/test_recurrence_adapter.py",
        "tests/unit_tests/test_evidence_file_reads.py", "tests/unit_tests/test_recurrence.py",
        "tests/unit_tests/test_resource_enrollment.py", "tests/unit_tests/test_project_recipe.py",
        "tests/unit_tests/test_host_job_history.py::test_optional_native_observations_preserve_strict_history_schema",
        "tests/unit_tests/test_harness_adaptation.py",
        ".forgewright/recipes/test_rollout_final_review.py",
    ]
    result = subprocess.run([sys.executable, "-m", "pytest", "-q", *tests], cwd=ROOT, timeout=180,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    print(result.stdout, end="")
    assert result.returncode == 0, "resource regression failed"
    implementation = Path(manifest["implementation_root"]).resolve(strict=True)
    # The deployed source must agree with the candidate being validated.
    for relative, expected in manifest["source_sha256"].items():
        assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == expected, relative
        assert hashlib.sha256((implementation / relative).read_bytes()).hexdigest() == expected, relative
    home = Path.home() / ".forgewright/runtime/admission"
    enrollment = json.loads(private_read(home / "enrollments.json", 65536))
    operator = json.loads(private_read(home / "operator-disable.json", 16384))
    # Validation uses the actual deployed code-binding root, not a Main copy.
    sys.path.insert(0, str(implementation / "scripts/runtime"))
    import importlib.util
    spec = importlib.util.spec_from_file_location("deployed_enrollment", implementation / "scripts/runtime/resource_enrollment.py")
    deployed = importlib.util.module_from_spec(spec); spec.loader.exec_module(deployed)
    connection = sqlite3.connect((home / "host.sqlite3").as_uri() + "?mode=ro", uri=True, timeout=0.25)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    admission = SimpleNamespace(connection=connection)
    try:
        validate_held(home, admission, held_root, deployed)
        for item in manifest["projects"]:
            root = Path(item["root"]).resolve(strict=True)
            entry = enrollment[str(root)]
            assert str(root) not in operator["projects"]
            assert entry["phase"] == entry["mode"] == "enforce" and entry["enforcement_verified"]
            deployed.validate_binding(entry)
            proof = entry["native_proof"]
            canary = json.loads(private_read(home / "jobs" / (proof["job_id"] + ".json"), 65536))
            assert canary["native_context"]["native"] == proof["native"]
            assert canary["state"] == "quiescent" and canary["exit_code"] == 0
            assert journal_released(admission, canary)
            pilot = json.loads(private_read(home / "jobs" / (item["pilot_job"] + ".json"), 65536))
            assert pilot["state"] == "quiescent" and pilot["exit_code"] == 0
            assert pilot["physical_workspace"] == str(root) and journal_released(admission, pilot)
            assert isinstance(pilot.get("native_context", {}).get("native", {}).get("session_id"), str) and pilot["native_context"]["native"]["session_id"]
            assert pilot["profile"] == item["profile"] and pilot["profile_digest"] == item["digest"]
            load_profile(home, root, item["profile"], item["digest"])
            assert pilot["storage"]["quiescent"] and pilot["storage"]["state"] in {"retained", "reclaimed"}
            disk = report_project(root)
            assert disk["complete"] and disk["total_bytes"] < disk["block_mb"] * 1024**2, disk
            diagnostic = json.loads(private_read(root / ".forgewright/runtime/memory/recurrence/diagnostics.json", 3 * 1024**2))
            assert any(row["event"]["job_id"] == pilot["job_id"] and row["event"]["outcome"] == "success"
                       for row in diagnostic["events"])
            print(json.dumps({"project": str(root), "native": "enforced", "pilot": pilot["job_id"],
                              "project_bytes": disk["total_bytes"], "entries": disk["entries"]}))
        context = lesson_context(ROOT, "cli-build", sys.platform,
                                 {"recipe_digest": manifest["main_profile_digest"]}, manifest["session"])
        assert context["status"] == "retrieved" and len(context["sources"]) == 3
        assert context["chars"] <= 2000
        injected = json.loads(private_read(home / "jobs" / (manifest["injection_job"] + ".json"), 65536))
        validate_injection(admission, injected, manifest, context)
        validate_held(home, admission, held_root, deployed)
        print(json.dumps({"project": held_root, "status": "owner-held", "operator_disabled": True,
                          "unreleased_heavy": False, "covered": False}))
        print("Three reviewed lessons captured and observed in the actual native recipe context")
    finally:
        connection.close()
    print("Three covered native pilots, owner-held videoeditor, disk lifecycle, recurrence and rejection regressions passed")


if __name__ == "__main__":
    main()
