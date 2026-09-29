"""Exercise maintained local game/web/app workloads without models or network."""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_local_scenarios_execute_twice_under_the_same_contract():
    result = subprocess.run(
        ["node", "evals/ecc/run.mjs"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["authority"] == "test-only"
    assert report["comparable"] is True
    assert report["promotionEligible"] is False
    assert report["performanceImprovementClaimed"] is False
    assert len(report["variants"]) == 2
    assert report["variants"][0]["identity"] == report["variants"][1]["identity"]
    for variant in report["variants"]:
        assert len(variant["results"]) == 3
        for scenario in variant["results"]:
            assert scenario["status"] == "PASS"
            assert scenario["checks"] > 0
            assert scenario["elapsedMs"] >= 0
            assert scenario["usage"]["tokens"] is None
            assert scenario["usage"]["costUsd"] is None
    assert len(report["negativeControls"]) == 3
    assert all(item["mutationRejected"] for item in report["negativeControls"])


def test_contract_names_match_maintained_scenarios():
    contracts = json.loads((ROOT / "evals/ecc/contracts.json").read_text())
    assert contracts["requiredScenarios"] == [
        "game-save-idempotency",
        "web-api-layout-contract",
        "app-refresh-cache",
    ]
    assert contracts["comparison"]["minimumAcceptanceRate"] == 1
    assert contracts["authority"] == "test-only"
