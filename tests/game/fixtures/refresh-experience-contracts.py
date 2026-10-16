"""Create explicit synthetic contract fixtures, never real approval claims."""

import copy
import hashlib
import json
import sys
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(root))
    from tests.unit_tests.test_creative_handoff import concept_packet, art_gates
    from tests.unit_tests.test_style_contract import valid_contract
    from tests.unit_tests.test_visual_evidence import evidence_card, visual_basis

    def put(folder, name, value):
        p = folder / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(value, indent=2) + "\n")
        return ref(folder, p)

    def ref(folder, path):
        if isinstance(path, str):
            path = folder / path
        return {
            "path": path.relative_to(root).as_posix(),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }

    for engine in ["phaser", "threejs"]:
        folder = (
            root
            / "tests/game/fixtures"
            / ("phaser4-lifecycle" if engine == "phaser" else "threejs-lifecycle")
        )
        version = "4.2.1" if engine == "phaser" else "0.183.2"
        folder.joinpath("handoff").mkdir(exist_ok=True)
        name = "Signal Garden" if engine == "phaser" else "Signal Dash experience"
        scope = ["ready", "playing", "paused", "won", "lost", "settings"]
        ids = [
            "start",
            "left",
            "right",
            "pause",
            "settings",
            "options",
            "motion",
            "contrast",
            "close-settings",
        ] + (["advance"] if engine == "phaser" else [])
        concept = concept_packet()
        concept["project"] = {"id": f"fixture-{engine}", "name": name}
        concept["visual_thesis"] = (
            "A yellow courier stays distinct against navy routes and coral obstacles; compact edge UI preserves the playfield."
        )
        concept["target_context"].update(
            platform="browser",
            audience="Fixture reviewers",
            camera="top-down 2D" if engine == "phaser" else "three-quarter perspective",
            scale="640x480 world / 960x800 and 390x844 browser",
            use_case="Functional authored fixture, not player-outcome proof",
        )
        concept["handoff_metadata"].update(
            packet_id=f"fixture-{engine}-packet", created_at="2026-10-16T08:00:00Z"
        )
        concept["selected_direction_id"] = "aurora-a"
        concept["directions"][0].update(
            name="Clear garden lanes",
            premise="Large separated lanes and compact edge controls",
            distinctive_difference="Open playfield with three repeated navigable lanes.",
        )
        concept["directions"][1].update(
            name="Orbital radar",
            premise="Circular navigation and peripheral instruments",
            distinctive_difference="Concentric navigation instead of parallel lanes.",
        )
        concept["directions"][2].update(
            name="Paper route map",
            premise="Layered card paths and a stamped courier",
            distinctive_difference="Chunky card planes with paper-like value grouping.",
        )
        gates = art_gates(concept)
        for value in gates["gates"].values():
            value.update(
                owner="fixture-author",
                evidence=["handoff/concepts.svg"],
                next_action="Synthetic fixture approval only; actual runtime/visual/player review is separate.",
            )
        gates["style_dna"].update(
            artifact_id=f"fixture-{engine}-style", evidence=["handoff/style.json"]
        )
        cards = []
        for i in range(1, 4):
            card = evidence_card(f"product-{i}", kind="project_product")
            card["subject"]["name"] = name + " authored fixture study " + str(i)
            card["source"]["location"] = (
                "handoff/concepts.svg" if i != 1 else "handoff/wireframes.svg"
            )
            cards.append(put(folder, f"handoff/cards/product-{i}.json", card))
        basis = visual_basis(
            [f"product-{i}" for i in range(1, 4)], origin="project", greenfield=False
        )
        basis["target_context"].update(
            category="browser game fixture",
            platform="web desktop and touch-emulated viewport",
            audience="Fixture reviewers",
            primary_job="Verify complete authored game handoff",
        )
        basis["decisions"][0].update(
            claim="Reuse the existing Signal Dash navy, yellow and coral roles in functional fixture studies.",
            synthesis="Existing project source and authored studies are the declared basis; no external adoption or causal visual improvement is claimed.",
            applicability_boundary="Forgewright functional fixtures only, not a universal style or user-approved commercial concept.",
        )
        creative = {
            "concept": put(folder, "handoff/concept.json", concept),
            "gates": put(folder, "handoff/gates.json", gates),
            "visual_basis": put(folder, "handoff/visual-basis.json", basis),
            "cards": cards,
        }
        style = valid_contract()
        style["project"].update(
            name=name, platform="web", asset_scope="2d" if engine == "phaser" else "3d"
        )
        style["engine"]["name"] = engine
        style["approval"].update(
            approved_by="synthetic-fixture-author", approved_at="2026-10-16T08:00:00Z"
        )
        style["style"]["palette"]["primary"] = ["#081524"]
        style["style"]["palette"]["secondary"] = ["#173C50"]
        style["style"]["palette"]["neutral"] = ["#F3F6EC", "#E5F2FA"]
        style["style"]["color_map"] = {
            "background": ["#081524"],
            "button_primary": ["#FFD44D", "#173C50"],
            "text_label": ["#F3F6EC", "#E5F2FA"],
        }
        if engine == "threejs":
            style["style"]["rendering"] = "3d_render"
            style["style"]["camera"] = "three_quarter"
            style["style"].pop("pixel_register", None)
        style["style"]["palette"]["accent"] = ["#FFD44D"]
        creative["style_contract"] = put(folder, "handoff/style.json", style)
        # Original sketches are source artifacts. They are not screenshots or external art review.
        labels = "".join(
            f'<g transform="translate({(i % 3) * 300 + 10},{(i // 3) * 210 + 10})"><rect width="280" height="185" rx="8" fill="#173c50" stroke="#ffd44d"/><text x="12" y="28" fill="#f3f6ec">{state}</text><rect x="35" y="45" width="210" height="90" fill="#24586a"/><rect x="45" y="145" width="190" height="26" fill="#35576b"/></g>'
            for i, state in enumerate(scope)
        )
        folder.joinpath("handoff/wireframes.svg").write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="920" height="440">'
            + labels
            + "</svg>"
        )
        folder.joinpath("handoff/concepts.svg").write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#081524"/><g fill="#f3f6ec" font-size="18"><text x="20" y="35">Character: yellow courier, shared silhouette</text><text x="320" y="100">Environment: three clear routes</text><text x="620" y="170">UI: compact edge controls</text></g><rect x="80" y="90" width="50" height="100" fill="#ffd44d"/><path d="M300 260L350 120H390L430 260M430 260L480 120H520L560 260" fill="#24586a"/><rect x="630" y="205" width="210" height="48" rx="8" fill="#173c50" stroke="#ffd44d"/></svg>'
        )
        folder.joinpath("handoff/intent.md").write_text(
            f"# {name} functional fixture\n\nOriginal CC0 fixture assets; required states: {', '.join(scope)}. Preserve controls, win/lose, pause/restart and source identity. Wireframe/concept/gate documents are synthetic contract fixtures authored for local conformance checks, not evidence of external/user art approval, actual rendered quality, live specialist output or player enjoyment.\n"
        )
        wire = ref(folder, "handoff/wireframes.svg")
        drawing = ref(folder, "handoff/concepts.svg")
        app = ref(folder, "src/app.ts" if engine == "phaser" else "experience/app.ts")
        components = []
        required_components = {}
        for cid in ids:
            states = (
                ["default"]
                if cid == "options"
                else ["default", "focus"]
                if cid in ["motion", "contrast"]
                else ["default", "pressed", "focus"]
                + (["disabled"] if cid in ["left", "right", "pause", "advance"] else [])
            )
            required_components[cid] = states
            components.append(
                {
                    "id": cid,
                    "states": states,
                    "spec": wire,
                    "runtime": (
                        app
                        if engine == "threejs"
                        and cid in ["start", "left", "right", "pause"]
                        else ref(folder, root / "templates/game/ui-kit/index.ts")
                    ),
                    "preview": ref(folder, root / "templates/game/ui-kit/preview.html"),
                }
            )
        source_assets = (
            [
                (
                    "character/hero",
                    "assets/hero.png",
                    {
                        "kind": "sprite",
                        "frame_width": 16,
                        "frame_height": 16,
                        "frame_count": 2,
                        "anchor": [0.5, 1],
                        "scale": 5,
                        "animations": ["idle"],
                    },
                ),
                (
                    "environment/garden",
                    "assets/garden.svg",
                    {"kind": "image", "width": 640, "height": 480},
                ),
                (
                    "panel/frame",
                    "assets/panel.svg",
                    {
                        "kind": "ui",
                        "width": 32,
                        "height": 32,
                        "nine_slice": [8, 8, 8, 8],
                    },
                ),
            ]
            if engine == "phaser"
            else [
                (
                    "character/courier",
                    "assets/courier.glb",
                    {
                        "kind": "model",
                        "units": "meters",
                        "up_axis": "Y",
                        "pivot": [0, 0, 0],
                        "scale": 1,
                        "animations": ["hover"],
                    },
                )
            ]
        )
        inventory = {
            "schema_version": "game-art-inventory/v1",
            "project_name": name,
            "contract_sha256": hashlib.sha256(
                json.dumps(style, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest(),
            "assets": [],
        }
        manifest = {
            "schema_version": "game-art-engine-import/v1",
            "project_name": name,
            "engine": engine,
            "contract_sha256": inventory["contract_sha256"],
            "inventory_sha256": "",
            "assets": [],
        }
        assets = []
        for aid, path, contract in source_assets:
            ar = ref(folder, path)
            atype, aname = aid.split("/", 1)
            observed = {
                "source_sha256": ar["sha256"],
                "engine": {"name": engine, "version": version},
                "import": copy.deepcopy(contract),
                "scope": "Source structure and authored import configuration; actual renderer/animation remains separate browser evidence.",
            }
            obs = put(folder, f"handoff/import-{atype}-{aname}.json", observed)
            assets.append(
                {
                    "id": aid,
                    "license": "CC0-1.0, original authored fixture; assets/LICENSE.md",
                    "artifact": ar,
                    "import": contract,
                    "observation": obs,
                }
            )
            inventory["assets"].append(
                {
                    "asset_id": aid,
                    "asset_type": atype,
                    "name": aname,
                    "latest_version": 1,
                    "versions": [
                        {
                            "version": 1,
                            "source_path": ar["path"],
                            "sha256": ar["sha256"],
                            "contract_sha256": inventory["contract_sha256"],
                        }
                    ],
                }
            )
            manifest["assets"].append(
                {
                    "asset_id": aid,
                    "version": 1,
                    "source_path": ar["path"],
                    "sha256": ar["sha256"],
                    "relative_path": path,
                    "engine_uri": path,
                    "import_settings": {
                        "pixels_per_unit": 16,
                        "texture_compression": "lossless",
                        "atlas_group": "fixture",
                        "filter_mode": "nearest" if engine == "phaser" else "linear",
                    },
                }
            )
        manifest["inventory_sha256"] = hashlib.sha256(
            json.dumps(inventory, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        document = {
            "schema": "game-experience/v1",
            "project_id": f"fixture-{engine}",
            "engine": {"name": engine, "version": version},
            "intent": ref(folder, "handoff/intent.md"),
            "targets": {
                "viewports": [[960, 800], [390, 844]],
                "inputs": ["keyboard", "touch"],
                "camera": concept["target_context"]["camera"],
            },
            "required": {
                "states": scope,
                "components": required_components,
                "assets": [a["id"] for a in assets],
                "concepts": ["character", "environment", "ui"],
            },
            "journeys": [
                {
                    "id": "core-loop",
                    "states": scope,
                    "transitions": [
                        ["ready", "playing"],
                        ["playing", "paused"],
                        ["paused", "playing"],
                        ["playing", "won"],
                        ["playing", "lost"],
                        ["won", "playing"],
                        ["lost", "playing"],
                        ["playing", "settings"],
                        ["settings", "playing"],
                    ],
                }
            ],
            "screens": [
                {
                    "id": state,
                    "states": [state],
                    "wireframe": wire,
                    "components": (
                        ["options", "motion", "contrast", "close-settings"]
                        if state == "settings"
                        else [
                            cid
                            for cid in ids
                            if cid
                            not in ["options", "motion", "contrast", "close-settings"]
                        ]
                    ),
                }
                for state in scope
            ],
            "concepts": {
                c: {"applicable": True, "artifact": drawing}
                for c in ["character", "environment", "ui"]
            },
            "components": components,
            "assets": assets,
            "tokens": ref(folder, root / "templates/game/ui-kit/tokens.css"),
            "creative": creative,
            "inventory": put(folder, "handoff/inventory.json", inventory),
            "engine_manifest": put(folder, "handoff/engine-manifest.json", manifest),
            "runtime": app,
        }
        put(folder, "experience.json", document)
        print(
            engine,
            "experience fixture generated, synthetic approvals explicitly labeled",
        )


if __name__ == "__main__":
    main()
