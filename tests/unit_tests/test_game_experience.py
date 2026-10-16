"""Behavioral coverage of completeness, artifact binding and stage boundaries."""

import copy
import hashlib
import json
import runpy
import subprocess
import sys
from pathlib import Path

import pytest

from tests.unit_tests.test_creative_handoff import (
    art_gates,
    concept_packet,
    evidence_args,
)
from tests.unit_tests.test_style_contract import valid_contract

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "scripts/art-direction/game-experience.py"


def artifact(root, name, value):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    data = value if isinstance(value, bytes) else json.dumps(value).encode()
    path.write_bytes(data)
    return {"path": name, "sha256": hashlib.sha256(data).hexdigest()}


def example(root):
    concept = concept_packet()
    creative = {
        "concept": artifact(root, "concept.json", concept),
        "gates": artifact(root, "gates.json", art_gates(concept)),
    }
    evidence_args(root)
    creative["visual_basis"] = artifact(
        root, "visual-basis.json", json.loads((root / "visual-basis.json").read_text())
    )
    creative["cards"] = [
        artifact(
            root,
            f"cards/product-{i}.json",
            json.loads((root / f"cards/product-{i}.json").read_text()),
        )
        for i in range(1, 4)
    ]
    style = valid_contract()
    style["engine"]["name"] = "phaser"
    creative["style_contract"] = artifact(root, "style.json", style)
    spec = artifact(
        root,
        "wireframe.svg",
        b'<svg xmlns="http://www.w3.org/2000/svg"><text>Play / pause</text></svg>',
    )
    return {
        "schema": "game-experience/v1",
        "project_id": "project-aurora",
        "engine": {"name": "phaser", "version": "4.2.1"},
        "intent": artifact(
            root, "intent.md", b"One playable loop; start and pause are required."
        ),
        "targets": {
            "viewports": [[960, 800], [390, 844]],
            "inputs": ["keyboard", "touch"],
            "camera": "top-down",
        },
        "required": {
            "states": ["menu", "play", "pause"],
            "components": {"start": ["default", "pressed", "focus", "disabled"]},
            "assets": ["character/hero"],
            "concepts": ["character", "environment", "ui"],
        },
        "journeys": [
            {
                "id": "main",
                "states": ["menu", "play", "pause"],
                "transitions": [["menu", "play"], ["play", "pause"], ["pause", "play"]],
            }
        ],
        "screens": [
            {"id": name, "states": [name], "wireframe": spec, "components": ["start"]}
            for name in ["menu", "play", "pause"]
        ],
        "concepts": {
            name: {"applicable": True, "artifact": spec}
            for name in ["character", "environment", "ui"]
        },
        "components": [
            {
                "id": "start",
                "states": ["default", "pressed", "focus", "disabled"],
                "spec": spec,
            }
        ],
        "assets": [
            {
                "id": "character/hero",
                "license": "CC0 authored fixture",
                "import": {
                    "kind": "sprite",
                    "frame_width": 16,
                    "frame_height": 16,
                    "frame_count": 2,
                    "anchor": [0.5, 1],
                    "scale": 1,
                    "animations": ["idle"],
                },
            }
        ],
        "tokens": spec,
        "creative": creative,
    }


def run(root, doc, stage="design"):
    manifest = root / "experience.json"
    manifest.write_text(json.dumps(doc))
    proc = subprocess.run(
        [
            sys.executable,
            str(TOOL),
            "validate",
            str(manifest),
            "--project-root",
            str(root),
            "--stage",
            stage,
        ],
        cwd=root,
        capture_output=True,
        text=True,
    )
    return proc, json.loads(proc.stdout)


def test_complete_design_is_not_a_runtime_or_implementation_claim(tmp_path):
    proc, result = run(tmp_path, example(tmp_path))
    assert proc.returncode == 0, result
    assert result["status"] == "PASS" and result["stage"] == "design"
    assert "runtime" in " ".join(result["limitations"])
    proc, result = run(tmp_path, example(tmp_path), "implementation")
    assert proc.returncode == 1 and result["status"] == "FAIL"
    assert any(i["code"] == "implementation_missing" for i in result["issues"])
    planned = example(tmp_path)
    planned["assets"][0]["import"] = {}
    proc, result = run(tmp_path, planned)
    assert proc.returncode == 0, result


@pytest.mark.parametrize(
    "change,code",
    [
        ("missing_screen", "missing_state"),
        ("orphan_state", "uncovered_state"),
        ("disconnected_journey", "unreachable_state"),
        ("foreign_journey_edge", "dangling_state"),
        ("orphan_component", "uncovered_component"),
        ("missing_component", "missing_component"),
        ("missing_focus", "missing_component_state"),
        ("missing_concept", "missing_concept"),
        ("fake_na", "required_concept_na"),
        ("fake_na_declared_asset", "required_concept_na"),
        ("dangling", "dangling_state"),
        ("duplicate", "duplicate_id"),
        ("hash", "artifact_hash"),
        ("escape", "unsafe_artifact"),
        ("missing_file", "artifact_missing"),
        ("version", "schema"),
        ("draft", "creative_gate"),
        ("style_draft", "style_contract"),
    ],
)
def test_missing_or_false_handoff_rejects_real_requirement(tmp_path, change, code):
    doc = example(tmp_path)
    if change == "orphan_state":
        doc["journeys"][0]["states"].remove("pause")
        doc["journeys"][0]["transitions"] = [["menu", "play"]]
    elif change == "disconnected_journey":
        doc["journeys"][0]["transitions"] = []
    elif change == "foreign_journey_edge":
        doc["journeys"][0]["states"].remove("pause")
    elif change == "orphan_component":
        for screen in doc["screens"]:
            screen["components"] = []
    elif change == "missing_screen":
        doc["screens"].pop()
    elif change == "missing_component":
        doc["components"] = []
    elif change == "missing_focus":
        doc["components"][0]["states"].remove("focus")
    elif change == "missing_concept":
        del doc["concepts"]["character"]
    elif change in ("fake_na", "fake_na_declared_asset"):
        if change == "fake_na_declared_asset":
            doc["required"]["concepts"].remove("character")
        doc["concepts"]["character"] = {
            "applicable": False,
            "reason": "omit to save time",
        }
    elif change == "dangling":
        doc["journeys"][0]["transitions"].append(["play", "absent"])
    elif change == "duplicate":
        doc["screens"].append(copy.deepcopy(doc["screens"][0]))
    elif change == "hash":
        doc["tokens"]["sha256"] = "0" * 64
    elif change == "escape":
        doc["tokens"]["path"] = "../foreign.json"
    elif change == "missing_file":
        (tmp_path / "wireframe.svg").unlink()
    elif change == "version":
        doc["engine"]["version"] = "^4.2.1"
    elif change == "draft":
        g = art_gates(concept_packet())
        g["style_dna"]["status"] = "DRAFT"
        doc["creative"]["gates"] = artifact(tmp_path, "gates.json", g)
    elif change == "style_draft":
        s = valid_contract()
        s["approval"]["status"] = "draft"
        doc["creative"]["style_contract"] = artifact(tmp_path, "style.json", s)
    proc, result = run(tmp_path, doc)
    assert proc.returncode == 1, result
    assert any(i["code"] == code for i in result["issues"]), result


def test_legitimate_characterless_game_and_symlink_boundary(tmp_path):
    doc = example(tmp_path)
    doc["assets"] = []
    doc["required"]["assets"] = []
    doc["required"]["concepts"].remove("character")
    doc["concepts"]["character"] = {
        "applicable": False,
        "reason": "Abstract game, no character appears in any journey.",
    }
    assert run(tmp_path, doc)[0].returncode == 0
    outside = tmp_path.parent / (tmp_path.name + "-foreign.txt")
    outside.write_bytes(b"foreign")
    (tmp_path / "linked.txt").symlink_to(outside)
    doc["tokens"] = {
        "path": "linked.txt",
        "sha256": hashlib.sha256(b"foreign").hexdigest(),
    }
    proc, result = run(tmp_path, doc)
    assert proc.returncode == 1 and any(
        i["code"] == "unsafe_artifact" for i in result["issues"]
    )


def test_malformed_document_is_structured_failure(tmp_path):
    proc, result = run(tmp_path, {"schema": "game-experience/v1", "required": []})
    assert proc.returncode == 1 and result["status"] == "FAIL"
    assert result["issues"][0]["code"] == "schema"


@pytest.mark.parametrize("unlisted_symlink", [False, True])
def test_creative_helpers_cannot_consume_unbound_directory_cards(
    tmp_path, unlisted_symlink
):
    doc = example(tmp_path)
    doc["creative"]["cards"] = doc["creative"]["cards"][:1]
    if unlisted_symlink:
        card = tmp_path / "cards/product-2.json"
        outside = tmp_path.parent / (tmp_path.name + "-outside-card.json")
        outside.write_bytes(card.read_bytes())
        card.unlink()
        card.symlink_to(outside)
    proc, result = run(tmp_path, doc)
    assert proc.returncode == 1, result
    assert result["status"] == "FAIL"
    assert any(i["code"] == "creative_gate" for i in result["issues"])


@pytest.mark.parametrize("malformed", ["inventory", "engine_manifest"])
def test_non_object_asset_packets_return_structured_failure(tmp_path, malformed):
    doc = example(tmp_path)
    fixture = ROOT / "tests/game/fixtures/phaser4-lifecycle/handoff"
    for key, filename in [
        ("inventory", "inventory.json"),
        ("engine_manifest", "engine-manifest.json"),
    ]:
        value = [] if key == malformed else json.loads((fixture / filename).read_text())
        doc[key] = artifact(tmp_path, filename, value)
    doc["runtime"] = doc["tokens"]
    proc, result = run(tmp_path, doc, "implementation")
    assert proc.returncode == 1, result
    assert result["status"] == "FAIL"
    assert any(i["code"] == "asset_binding" for i in result["issues"])


def test_single_screen_journey_needs_no_artificial_transition(tmp_path):
    doc = example(tmp_path)
    doc["required"]["states"] = ["menu"]
    doc["screens"] = doc["screens"][:1]
    doc["journeys"] = [{"id": "single-screen", "states": ["menu"], "transitions": []}]
    proc, result = run(tmp_path, doc)
    assert proc.returncode == 0, result


def test_assetless_implementation_preserves_legacy_manifest_boundary(tmp_path):
    doc = example(tmp_path)
    doc["assets"] = []
    doc["required"]["assets"] = []

    def canonical_hash(value):
        return hashlib.sha256(
            json.dumps(
                value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
            ).encode()
        ).hexdigest()

    style = json.loads((tmp_path / "style.json").read_text())
    inventory = {
        "schema_version": "game-art-inventory/v1",
        "project_name": "Abstract UI game",
        "contract_sha256": canonical_hash(style),
        "assets": [],
    }
    manifest = {
        "schema_version": "game-art-engine-import/v1",
        "project_name": "Abstract UI game",
        "engine": "phaser",
        "contract_sha256": canonical_hash(style),
        "inventory_sha256": canonical_hash(inventory),
        "assets": [],
    }
    doc["inventory"] = artifact(tmp_path, "inventory.json", inventory)
    doc["engine_manifest"] = artifact(tmp_path, "engine-manifest.json", manifest)
    doc["runtime"] = doc["tokens"]
    for component in doc["components"]:
        component["runtime"] = component["preview"] = component["spec"]
    # The legacy lifecycle API still refuses empty manifests by default.
    legacy = runpy.run_path(str(ROOT / "scripts/art-direction/asset-lifecycle.py"))
    with pytest.raises(ValueError, match="non-empty"):
        legacy["validate_manifest_document"](manifest)
    proc, result = run(tmp_path, doc, "implementation")
    assert proc.returncode == 0, result
