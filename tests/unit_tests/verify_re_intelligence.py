#!/usr/bin/env python3
"""Deterministic verification runner for Reverse-Engineering Intelligence."""
from __future__ import annotations
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tests.unit_tests.test_reverse_engineering_intelligence import (
    test_pinned_catalog_search_ranks_and_flags_license_risks,
    test_pinned_catalog_flags_blank_license_and_rejects_unpinned_digest,
    test_task_to_tool_capability_matrix_exposes_honest_limitations,
    test_rea_facet_evidence_distinguishes_observed_empty_from_unavailable,
    test_process_run_token_binds_pid_start_identity_and_lease,
    test_benchmark_matrix_disqualifies_fabricated_evidence_and_ranks_winners,
    test_astra_p1_p2_strict_validation_and_full_precision_ranking,
)

def main() -> int:
    test_pinned_catalog_search_ranks_and_flags_license_risks()
    with tempfile.TemporaryDirectory() as tmp:
        test_pinned_catalog_flags_blank_license_and_rejects_unpinned_digest(Path(tmp))
    test_task_to_tool_capability_matrix_exposes_honest_limitations()
    test_rea_facet_evidence_distinguishes_observed_empty_from_unavailable()
    test_process_run_token_binds_pid_start_identity_and_lease()
    test_benchmark_matrix_disqualifies_fabricated_evidence_and_ranks_winners()
    test_astra_p1_p2_strict_validation_and_full_precision_ranking()
    print(json.dumps({"status": "PASS", "suite": "test_reverse_engineering_intelligence", "DeterministicChecks": 7}, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
