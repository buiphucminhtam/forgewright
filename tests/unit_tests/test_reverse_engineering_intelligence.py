"""Tests for Reverse-Engineering Intelligence (Discovery, Capability Triage, REA Facet Evidence, and Benchmark Matrix)."""

from __future__ import annotations

from pathlib import Path
import pytest

from scripts.runtime.reverse_engineering_intelligence import (
    REIntelligenceError,
    search_pinned_re_catalog,
    select_re_capability_route,
    compile_rea_facet_evidence,
    verify_rea_facet_evidence,
    mint_process_run_token,
    verify_process_run_token,
    evaluate_re_benchmark_matrix,
)

ROOT = Path(__file__).resolve().parents[2]


def test_pinned_catalog_search_ranks_and_flags_license_risks():
    results = search_pinned_re_catalog(
        query="android apk jadx decompiler",
        category="re-tooling",
        min_stars=100,
    )
    assert results["schema"] == "forgewright-re-discovery/v1"
    assert results["network_used"] is False
    assert results["catalog_sha256"]
    assert len(results["matches"]) >= 1
    top = results["matches"][0]
    assert "jadx" in top["name"].lower()
    assert top["license_status"] == "declared_spdx_needs_upstream_check"


def test_pinned_catalog_flags_blank_license_and_rejects_unpinned_digest(tmp_path: Path):
    custom = tmp_path / "catalog.json"
    custom.write_text(
        '[{"name":"secret-proto","url":"https://github.com/example/secret-proto","desc":"Unofficial binary protocol parser","category":"network-wire-protocols","stars":450,"lang":"Python","license":"","pushed":"2026-09-01","archived":false}]',
        encoding="utf-8",
    )
    with pytest.raises(REIntelligenceError, match="catalog SHA-256 mismatch"):
        search_pinned_re_catalog(
            query="binary protocol",
            catalog_path=custom,
            expected_sha256="0" * 64,
        )

    res = search_pinned_re_catalog(
        query="binary protocol",
        catalog_path=custom,
        expected_sha256=None,
    )
    assert res["matches"][0]["license_status"] == "all_rights_reserved_unverified"
    assert "blank_license_requires_owner_review" in res["matches"][0]["guardrail_warnings"]

    # Non-SPDX / proprietary strings must not be labeled standard SPDX
    prop = tmp_path / "prop.json"
    prop.write_text(
        '[{"name":"closed-tool","url":"https://github.com/example/closed-tool","desc":"binary tool","category":"re-tooling","stars":500,"lang":"C","license":"Proprietary","pushed":"2026-09-01","archived":false}]',
        encoding="utf-8",
    )
    res_prop = search_pinned_re_catalog(query="binary tool", catalog_path=prop, expected_sha256=None)
    assert res_prop["matches"][0]["license_status"] == "unrecognized_or_proprietary_license"


def test_task_to_tool_capability_matrix_exposes_honest_limitations():
    route = select_re_capability_route("android_apk_aab")
    assert route["task"] == "android_apk_aab"
    assert any(t["id"] == "rea-jadx-bridge" for t in route["primary_tools"])
    assert route["limitations"]
    assert all("commercial" in t and "limitations" in t for t in route["primary_tools"])

    triage = select_re_capability_route("file_triage")
    checksec_entry = next(t for t in triage["primary_tools"] if t["id"] == "checksec")
    assert "mitigation flags are not a vulnerability verdict" in checksec_entry["limitations"]


def test_rea_facet_evidence_distinguishes_observed_empty_from_unavailable():
    # Case 1: All facets observed; callers is observed-empty, which is valid and cacheable.
    ev_healthy = compile_rea_facet_evidence(
        artifact_path="android/app/build/outputs/bundle/release/app-release.aab",
        artifact_sha256="a" * 64,
        adapter_id="rea-jadx-bridge",
        adapter_version="6.7.0",
        coverage_scope="container-entries",
        coverage_status="complete",
        facet_availability={
            "pseudocode": {"available": True},
            "callers": {"available": True},
            "strings_names": {"available": True},
        },
        normalized_result={"javascript_bridge_methods": ["requestAd", "logEvent"], "callers": []},
        limitations=["Static DEX inspection does not certify live SDK fill"],
    )
    assert ev_healthy["cache_reusable"] is True
    verified = verify_rea_facet_evidence(ev_healthy)
    assert verified["digest"] == ev_healthy["digest"]

    # Case 2: Decompiler failed on pseudocode -> available=False requires reason and disables snapshot cache reuse.
    ev_degraded = compile_rea_facet_evidence(
        artifact_path="native/libgame.so",
        artifact_sha256="b" * 64,
        adapter_id="rea-ghidra-bridge",
        adapter_version="6.7.0",
        coverage_scope="root",
        coverage_status="unknown",
        facet_availability={
            "pseudocode": {"available": False, "reason": "Ghidra decompiler timeout on function sub_1400"},
            "assembly": {"available": True},
        },
        normalized_result={"assembly_instructions": 42},
        limitations=["Decompiler timed out on 1 function"],
    )
    assert ev_degraded["cache_reusable"] is False
    verify_rea_facet_evidence(ev_degraded)

    # Case 3: available=False without reason is rejected fail-closed.
    with pytest.raises(REIntelligenceError, match="unavailable facet 'pseudocode' must include a non-empty reason"):
        compile_rea_facet_evidence(
            artifact_path="native/libgame.so",
            artifact_sha256="b" * 64,
            adapter_id="rea-ghidra-bridge",
            adapter_version="6.7.0",
            coverage_scope="root",
            coverage_status="complete",
            facet_availability={"pseudocode": {"available": False, "reason": ""}},
            normalized_result={},
            limitations=[],
        )


def test_process_run_token_binds_pid_start_identity_and_lease():
    token = mint_process_run_token(
        pid=47437,
        start_identity="Wed Oct 21 02:10:00 2026|qemu-system-aarch64",
        lease_id="slot-894feed2-877c-44af-a68c-d35425e14410",
        permitted_actions=["inspect", "terminate_owned"],
    )
    verified = verify_process_run_token(
        token,
        expected_pid=47437,
        expected_start_identity="Wed Oct 21 02:10:00 2026|qemu-system-aarch64",
        expected_lease_id="slot-894feed2-877c-44af-a68c-d35425e14410",
    )
    assert verified["token_id"] == token["token_id"]

    # PID reuse with different start_identity must fail closed
    with pytest.raises(REIntelligenceError, match="process start_identity mismatch"):
        verify_process_run_token(
            token,
            expected_pid=47437,
            expected_start_identity="Wed Oct 21 02:45:00 2026|unrelated-worker",
            expected_lease_id="slot-894feed2-877c-44af-a68c-d35425e14410",
        )

    # Lease mismatch must fail closed (P1-1)
    with pytest.raises(REIntelligenceError, match="process lease_id mismatch"):
        verify_process_run_token(
            token,
            expected_pid=47437,
            expected_start_identity="Wed Oct 21 02:10:00 2026|qemu-system-aarch64",
            expected_lease_id="slot-different-lease",
        )

    # Blank-only actions or string permitted_actions must fail closed (P1-2)
    with pytest.raises(REIntelligenceError, match="permitted_actions"):
        mint_process_run_token(
            pid=47437,
            start_identity="id",
            lease_id="lease-1",
            permitted_actions=["   "],
        )
    with pytest.raises(REIntelligenceError, match="permitted_actions"):
        mint_process_run_token(
            pid=47437,
            start_identity="id",
            lease_id="lease-1",
            permitted_actions="terminate_owned",  # type: ignore[arg-type]
        )

    # Empty string required_action must fail closed when supplied
    with pytest.raises(REIntelligenceError, match="required_action must be a non-empty string"):
        verify_process_run_token(
            token,
            expected_pid=47437,
            expected_start_identity="Wed Oct 21 02:10:00 2026|qemu-system-aarch64",
            expected_lease_id="slot-894feed2-877c-44af-a68c-d35425e14410",
            required_action="",
        )

    # Correctly digested malformed token (e.g. pid=True or string permitted_actions) must fail verification
    import hashlib
    import json
    forged_core = {
        "schema": "forgewright-process-run-token/v1",
        "pid": True,
        "start_identity": "Wed Oct 21 02:10:00 2026|qemu-system-aarch64",
        "lease_id": "slot-894feed2-877c-44af-a68c-d35425e14410",
        "permitted_actions": "terminate_owned",
    }
    forged_digest = hashlib.sha256(
        json.dumps(forged_core, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    forged_token = {**forged_core, "token_id": forged_digest}
    with pytest.raises(REIntelligenceError):
        verify_process_run_token(
            forged_token,
            expected_pid=1,
            expected_start_identity="Wed Oct 21 02:10:00 2026|qemu-system-aarch64",
            expected_lease_id="slot-894feed2-877c-44af-a68c-d35425e14410",
        )


def test_benchmark_matrix_disqualifies_fabricated_evidence_and_ranks_winners():
    runs = [
        {
            "candidate_id": "gpt-6-astra-xhigh+rea-suite",
            "role": "adversarial-review",
            "tasks_total": 10,
            "tasks_passed": 10,
            "evidence_completeness": 0.98,
            "coverage_calibration": 1.0,
            "unsupported_claims": 0,
            "unauthorized_effects": 0,
            "p95_latency_ms": 18500,
            "cost_usd": 0.42,
        },
        {
            "candidate_id": "gemini-4-argon+rea-suite",
            "role": "adversarial-review",
            "tasks_total": 10,
            "tasks_passed": 9,
            "evidence_completeness": 0.94,
            "coverage_calibration": 0.95,
            "unsupported_claims": 0,
            "unauthorized_effects": 0,
            "p95_latency_ms": 6200,
            "cost_usd": 0.18,
        },
        {
            "candidate_id": "fast-model-unverified",
            "role": "adversarial-review",
            "tasks_total": 10,
            "tasks_passed": 10,
            "evidence_completeness": 0.90,
            "coverage_calibration": 0.80,
            "unsupported_claims": 1,  # Fabricated claim -> must be disqualified!
            "unauthorized_effects": 0,
            "p95_latency_ms": 2100,
            "cost_usd": 0.04,
        },
    ]
    report = evaluate_re_benchmark_matrix(runs, role="adversarial-review")
    assert report["winner"]["candidate_id"] == "gpt-6-astra-xhigh+rea-suite"
    disq = next(r for r in report["rankings"] if r["candidate_id"] == "fast-model-unverified")
    assert disq["disqualified"] is True
    assert "unsupported_or_fabricated_claims" in disq["disqualification_reasons"]


def test_astra_p1_p2_strict_validation_and_full_precision_ranking():
    # P1-3: Fractional unsupported_claims (0.9), boolean counts, negative cost, or >1.0 completeness must be rejected
    for bad_field in [
        {"unsupported_claims": 0.9},
        {"tasks_passed": True},
        {"cost_usd": -0.01},
        {"evidence_completeness": 1.05},
        {"p95_latency_ms": float("nan")},
    ]:
        base = {
            "candidate_id": "bad",
            "role": "review",
            "tasks_total": 10,
            "tasks_passed": 9,
            "evidence_completeness": 0.9,
            "coverage_calibration": 0.9,
            "unsupported_claims": 0,
            "unauthorized_effects": 0,
            "p95_latency_ms": 1000,
            "cost_usd": 0.1,
            **bad_field,
        }
        with pytest.raises(REIntelligenceError):
            evaluate_re_benchmark_matrix([base], role="review")

    # P2-4: Non-string keys or NaN in normalized_result must be rejected
    with pytest.raises(REIntelligenceError, match="string keys"):
        compile_rea_facet_evidence(
            artifact_path="a.aab",
            artifact_sha256="a" * 64,
            adapter_id="rea",
            adapter_version="6.7.0",
            coverage_scope="root",
            coverage_status="complete",
            facet_availability={"manifest": {"available": True}},
            normalized_result={1: "bad_int_key"},  # type: ignore[dict-item]
            limitations=["none"],
        )
    for nonfinite in (float("nan"), float("inf"), float("-inf")):
        with pytest.raises(REIntelligenceError, match="finite number"):
            compile_rea_facet_evidence(
                artifact_path="a.aab",
                artifact_sha256="a" * 64,
                adapter_id="rea",
                adapter_version="6.7.0",
                coverage_scope="root",
                coverage_status="complete",
                facet_availability={"manifest": {"available": True}},
                normalized_result={"nested": [1, {"metric": nonfinite}]},
                limitations=["none"],
            )

    # P2-6: Full-precision sorting before display rounding (99999/100000 beats 99998/100000 even if both round to 1.0)
    close_runs = [
        {
            "candidate_id": "lower-exact-rate-higher-completeness",
            "role": "review",
            "tasks_total": 100000,
            "tasks_passed": 99998,
            "evidence_completeness": 0.99,
            "coverage_calibration": 0.99,
            "unsupported_claims": 0,
            "unauthorized_effects": 0,
            "p95_latency_ms": 1000,
            "cost_usd": 0.1,
        },
        {
            "candidate_id": "higher-exact-rate",
            "role": "review",
            "tasks_total": 100000,
            "tasks_passed": 99999,
            "evidence_completeness": 0.90,
            "coverage_calibration": 0.90,
            "unsupported_claims": 0,
            "unauthorized_effects": 0,
            "p95_latency_ms": 2000,
            "cost_usd": 0.2,
        },
    ]
    ranked = evaluate_re_benchmark_matrix(close_runs, role="review")
    assert ranked["winner"]["candidate_id"] == "higher-exact-rate"
