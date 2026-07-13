import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ROADMAP = ROOT / "docs" / "active-roadmap.md"
MANIFEST = ROOT / "docs" / "roadmap-completion.json"
EXPECTED_IDS = {
    *(f"P{phase}.{item}" for phase in range(3) for item in range(1, 6)),
    *(f"P3.{item}" for item in range(1, 5)),
}


def _manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def test_completion_manifest_covers_every_roadmap_deliverable_once() -> None:
    roadmap_ids = re.findall(
        r"^\| (P[0-3]\.\d+) \|", ROADMAP.read_text(encoding="utf-8"), re.MULTILINE
    )
    manifest_ids = [item["id"] for item in _manifest()["deliverables"]]

    assert set(roadmap_ids) == EXPECTED_IDS
    assert len(manifest_ids) == len(set(manifest_ids))
    assert set(manifest_ids) == EXPECTED_IDS


def test_every_deliverable_has_local_evidence_and_rollback() -> None:
    for item in _manifest()["deliverables"]:
        assert item["status"] == "implemented", item["id"]
        assert item["activation"] in {
            "local",
            "opt-in",
            "library-only",
            "canonical-mcp",
            "not-enabled",
        }, item["id"]
        assert item["evidence"], item["id"]
        assert item["rollback"].strip(), item["id"]
        for relative_path in item["evidence"]:
            assert not Path(relative_path).is_absolute(), relative_path
            assert (ROOT / relative_path).is_file(), f"{item['id']}: {relative_path}"


def test_provider_activation_is_not_overclaimed() -> None:
    gated = {
        item["id"]: item
        for item in _manifest()["deliverables"]
        if item["id"] in {"P2.2", "P2.3", "P2.4", "P2.5"}
    }

    assert set(gated) == {"P2.2", "P2.3", "P2.4", "P2.5"}
    assert all(item["activation"] == "not-enabled" for item in gated.values())
    assert (
        "Provider-native activation is a separate gate"
        in _manifest()["completion_rule"]
    )
