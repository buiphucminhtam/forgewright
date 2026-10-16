#!/usr/bin/env python3
"""Validate scoped game handoff completeness; never certifies gameplay or fun."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any

from game_asset_import import validate_asset_import

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SCHEMA = ROOT / "schemas/game-experience.schema.json"
LIMIT = 2 * 1024 * 1024


def helper(name: str):
    spec = importlib.util.spec_from_file_location(
        name.replace("-", "_"), HERE / (name + ".py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


creative = helper("creative-handoff")
lifecycle = helper("asset-lifecycle")


def digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


def read_json(path: Path) -> Any:
    with path.open("rb") as handle:
        data = handle.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError("artifact exceeds 2 MiB")
    return json.loads(
        data,
        parse_constant=lambda value: (_ for _ in ()).throw(
            ValueError("non-finite JSON")
        ),
    )


def read_object(path: Path) -> dict[str, Any]:
    value = read_json(path)
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} must be a JSON object")
    return value


def validate_experience(
    document: dict[str, Any], *, project_root: Path, stage: str
) -> dict[str, Any]:
    issues: list[dict[str, str]] = []
    bindings: dict[str, str] = {}
    root = project_root.resolve()

    def issue(code, identity, detail):
        issues.append({"code": code, "id": str(identity), "detail": str(detail)})

    def result():
        return {
            "schema": "game-experience-result/v1",
            "stage": stage,
            "status": "FAIL" if issues else "PASS",
            "issues": issues,
            "input_sha256": digest(document),
            "artifact_hashes": bindings,
            "limitations": [
                "Completeness of caller-declared scope and local artifact bindings only; approval authenticity is not certified.",
                "No runtime, rendered quality, player benefit or device performance is certified by this checker.",
            ],
        }

    if stage not in ("design", "implementation"):
        issue("stage", "stage", "expected design or implementation")
        return result()
    errors = creative.schema_errors(document, SCHEMA)
    if errors:
        for error in errors:
            issue("schema", "manifest", error)
        return result()

    def artifact(reference, identity):
        name = reference["path"]
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts or "\\" in name:
            issue("unsafe_artifact", identity, "project-relative path required")
            return None
        path = root / relative
        if not path.resolve().is_relative_to(root) or any(
            part.is_symlink()
            for part in [path, *path.parents]
            if part.is_relative_to(root)
        ):
            issue(
                "unsafe_artifact",
                identity,
                "artifact must stay within project without symlink traversal",
            )
            return None
        try:
            with path.open("rb") as handle:
                data = handle.read(LIMIT + 1)
            if len(data) > LIMIT:
                raise ValueError("artifact exceeds 2 MiB")
        except FileNotFoundError:
            issue("artifact_missing", identity, name)
            return None
        except (OSError, ValueError):
            issue("artifact_unreadable", identity, name)
            return None
        actual = hashlib.sha256(data).hexdigest()
        if actual != reference["sha256"]:
            issue("artifact_hash", identity, name)
            return None
        bindings[name] = actual
        return path

    def unique(items, identity):
        ids = [item["id"] for item in items]
        if len(ids) != len(set(ids)):
            issue("duplicate_id", identity, "IDs must be unique")
        return {item["id"]: item for item in items}

    required = document["required"]
    screens = unique(document["screens"], "screens")
    components = unique(document["components"], "components")
    assets = unique(document["assets"], "assets")
    unique(document["journeys"], "journeys")
    states = [state for screen in screens.values() for state in screen["states"]]
    if len(states) != len(set(states)):
        issue("duplicate_id", "screen_states", "state IDs must be global and unique")
    state_set = set(states)
    for state in required["states"]:
        if state not in state_set:
            issue("missing_state", state, "required state has no screen/wireframe")
    for journey in document["journeys"]:
        journey_states = set(journey["states"])
        edges = {state: [] for state in journey_states}
        for state in journey["states"]:
            if state not in state_set:
                issue("dangling_state", journey["id"], state)
        for transition in journey["transitions"]:
            if len(transition) != 2 or any(
                state not in state_set or state not in journey_states
                for state in transition
            ):
                issue(
                    "dangling_state",
                    journey["id"],
                    "transition must bind two states declared in this journey",
                )
            else:
                edges[transition[0]].append(transition[1])
        # The first declared state is this scoped journey's entry point.
        reached = set()
        pending = journey["states"][:1]
        while pending:
            state = pending.pop()
            if state not in reached:
                reached.add(state)
                pending.extend(edges[state])
        for state in journey_states - reached:
            issue(
                "unreachable_state",
                state,
                f"not reachable from journey {journey['id']} entry",
            )
    journey_states = {
        state for journey in document["journeys"] for state in journey["states"]
    }
    for state in required["states"]:
        if state not in journey_states:
            issue("uncovered_state", state, "required state has no journey")
    referenced_components = {
        cid for screen in screens.values() for cid in screen["components"]
    }
    for cid in required["components"]:
        if cid not in referenced_components:
            issue("uncovered_component", cid, "required component has no screen")
    for screen in screens.values():
        artifact(screen["wireframe"], screen["id"] + ".wireframe")
        for cid in screen["components"]:
            if cid not in components:
                issue("missing_component", screen["id"], cid)
    for cid, expected in required["components"].items():
        if cid not in components:
            issue("missing_component", cid, "required component absent")
        else:
            for state in set(expected) - set(components[cid]["states"]):
                issue("missing_component_state", cid, state)
    for cid, component in components.items():
        artifact(component["spec"], cid + ".spec")
        if stage == "implementation":
            for key in ["runtime", "preview"]:
                if key not in component:
                    issue("implementation_missing", cid, key)
                else:
                    artifact(component[key], cid + "." + key)
    applicable_categories = set(required["concepts"])
    if components:
        applicable_categories.add("ui")
    for aid, asset in assets.items():
        category = aid.split("/", 1)[0]
        if category in {"character", "environment", "ui"}:
            applicable_categories.add(category)
        if asset["import"].get("kind") == "ui":
            applicable_categories.add("ui")
    for category in applicable_categories:
        concept = document["concepts"].get(category)
        if concept is None:
            issue("missing_concept", category, "required concept category absent")
        elif not concept["applicable"]:
            issue(
                "required_concept_na", category, "required categories cannot be waived"
            )
    for category, concept in document["concepts"].items():
        if concept["applicable"]:
            if "artifact" not in concept:
                issue("missing_concept", category, "applicable concept needs artifact")
            else:
                artifact(concept["artifact"], category + ".concept")
        elif not concept.get("reason", "").strip():
            issue("invalid_na", category, "non-applicability needs a reason")
    for aid in required["assets"]:
        if aid not in assets:
            issue("missing_asset", aid, "required asset absent")
    artifact(document["intent"], "intent")
    artifact(document["tokens"], "tokens")
    refs = document["creative"]
    paths = {
        key: artifact(refs[key], "creative." + key)
        for key in ["concept", "gates", "visual_basis", "style_contract"]
    }
    card_paths = [artifact(card, "creative.card") for card in refs["cards"]]
    if all(paths.values()) and all(card_paths):
        parents = {path.parent for path in card_paths}
        if len(parents) != 1:
            issue("creative_gate", "cards", "cards must share their bounded directory")
        elif set(card_paths[0].parent.glob("*.json")) != set(card_paths) or len(
            set(card_paths)
        ) != len(card_paths):
            # Existing creative helpers consume every *.json in cards_dir.
            # Never let that expand beyond the files checked above.
            issue(
                "creative_gate",
                "cards",
                "declare and hash every JSON card in the directory exactly once",
            )
        else:
            args = argparse.Namespace(
                command="validate-handoff",
                concept=str(paths["concept"]),
                art=str(paths["gates"]),
                visual_basis=paths["visual_basis"],
                cards_dir=card_paths[0].parent,
            )
            output, code = creative.run(args)
            if code:
                issue("creative_gate", "creative", json.dumps(output, sort_keys=True))
            else:
                concept = read_object(paths["concept"])
                if concept["project"]["id"] != document["project_id"]:
                    issue("creative_gate", "project_id", "project mismatch")
            try:
                style = lifecycle.validate_contract(
                    paths["style_contract"], paths["visual_basis"], card_paths[0].parent
                )
                if style["engine"]["name"] != document["engine"]["name"]:
                    issue("style_contract", "engine", "engine mismatch")
            except lifecycle.LifecycleError as error:
                issue("style_contract", "style", str(error))
    if stage == "implementation":
        for key in ["inventory", "engine_manifest", "runtime"]:
            if key not in document:
                issue("implementation_missing", key, "implementation artifact required")
        if all(key in document for key in ["inventory", "engine_manifest"]):
            ip = artifact(document["inventory"], "inventory")
            mp = artifact(document["engine_manifest"], "engine_manifest")
            if ip and mp and paths.get("style_contract"):
                try:
                    inventory = read_object(ip)
                    manifest = read_object(mp)
                    style = read_object(paths["style_contract"])
                    lifecycle.validate_inventory_document(inventory)
                    lifecycle.validate_manifest_document(
                        manifest,
                        allow_empty_assets=not assets and not required["assets"],
                    )
                    if (
                        manifest["engine"] != document["engine"]["name"]
                        or manifest["contract_sha256"] != lifecycle.json_hash(style)
                        or inventory["contract_sha256"] != lifecycle.json_hash(style)
                        or manifest["inventory_sha256"]
                        != lifecycle.json_hash(inventory)
                    ):
                        raise ValueError(
                            "inventory/style/engine manifest binding mismatch"
                        )
                    indexed = {x["asset_id"]: x for x in manifest["assets"]}
                    registered = {x["asset_id"]: x for x in inventory["assets"]}
                    for aid, asset in assets.items():
                        if aid not in indexed or aid not in registered:
                            issue(
                                "missing_asset",
                                aid,
                                "not in both inventory and engine manifest",
                            )
                            continue
                        if "artifact" not in asset:
                            issue(
                                "implementation_missing",
                                aid,
                                "source asset artifact required",
                            )
                            continue
                        source = artifact(asset["artifact"], aid)
                        latest = lifecycle.latest_version(registered[aid])
                        if (
                            asset["artifact"]["sha256"] != indexed[aid]["sha256"]
                            or latest["sha256"] != asset["artifact"]["sha256"]
                            or latest["version"] != indexed[aid]["version"]
                        ):
                            issue(
                                "asset_binding", aid, "inventory/import/source mismatch"
                            )
                        if source is not None and not asset.get("license", "").strip():
                            issue("asset_license", aid, "source/license required")
                        if source is not None:
                            if "observation" not in asset:
                                issue(
                                    "implementation_missing",
                                    aid,
                                    "hash-bound import observation required",
                                )
                            else:
                                observed = artifact(
                                    asset["observation"], aid + ".observation"
                                )
                                if observed:
                                    for detail in validate_asset_import(
                                        asset["import"],
                                        source_path=source,
                                        engine=document["engine"],
                                        observation=read_object(observed),
                                    ):
                                        issue("asset_import", aid, detail)
                except (ValueError, KeyError, TypeError) as error:
                    issue("asset_binding", "inventory", str(error))
        if "runtime" in document:
            artifact(document["runtime"], "runtime.entry")
    return result()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate"])
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--stage", choices=["design", "implementation"], required=True)
    args = parser.parse_args(argv)
    try:
        output = validate_experience(
            read_json(args.manifest), project_root=args.project_root, stage=args.stage
        )
    except (OSError, ValueError, TypeError, KeyError, RecursionError) as error:
        output = {
            "schema": "game-experience-result/v1",
            "stage": args.stage,
            "status": "UNVERIFIED",
            "issues": [
                {"code": "unreadable_manifest", "id": "manifest", "detail": str(error)}
            ],
        }
    print(json.dumps(output, sort_keys=True))
    return {"PASS": 0, "FAIL": 1, "UNVERIFIED": 2}[output["status"]]


if __name__ == "__main__":
    raise SystemExit(main())
