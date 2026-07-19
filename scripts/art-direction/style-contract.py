#!/usr/bin/env python3
"""Validate and compile Forgewright game-art-contract/v2 files."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = (
    ROOT / "skills" / "art-director" / "contracts" / "game-art-contract.v2.schema.json"
)
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
ASPECT_RE = re.compile(r"^[1-9][0-9]*:[1-9][0-9]*$")
PLACEHOLDER_RE = re.compile(r"\[[^\[\]\r\n]+\]")


class ContractError(ValueError):
    """Raised when a game art contract cannot be used safely."""


def load_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ContractError(f"{label} is not valid JSON: {error}") from error
    if not isinstance(value, dict):
        raise ContractError(f"{label} must be a JSON object")
    return value


def load_schema() -> dict[str, Any]:
    return load_json(SCHEMA_PATH, "contract schema")


def get_path(document: dict[str, Any], dotted: str) -> tuple[bool, Any]:
    value: Any = document
    for part in dotted.split("."):
        if not isinstance(value, dict) or part not in value:
            return False, None
        value = value[part]
    return True, value


def require_object(value: Any, path: str, errors: list[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        errors.append(f"{path} must be an object")
        return {}
    return value


def validate_hex_map(value: Any, path: str, errors: list[str]) -> None:
    mapping = require_object(value, path, errors)
    if not mapping:
        errors.append(f"{path} must contain at least one color role")
        return
    for role, colors in mapping.items():
        role_path = f"{path}.{role}"
        if not isinstance(colors, list) or not colors:
            errors.append(f"{role_path} must be a non-empty list")
            continue
        for index, color in enumerate(colors):
            if not isinstance(color, str) or HEX_RE.fullmatch(color) is None:
                errors.append(f"{role_path}[{index}] must match #RRGGBB")


def validate_contract(
    document: dict[str, Any], schema: dict[str, Any], stage: str
) -> list[str]:
    errors: list[str] = []
    if document.get("schema_version") != schema.get("$id"):
        errors.append(f"schema_version must be {schema.get('$id')}")

    allowed_top = set(schema.get("allowed_top_level", []))
    unknown_top = sorted(set(document) - allowed_top)
    for key in unknown_top:
        errors.append(f"unknown top-level field: {key}")

    for key in schema.get("required_top_level", []):
        if key not in document:
            errors.append(f"missing required field: {key}")
    for dotted in schema.get("required_paths", []):
        present, _ = get_path(document, dotted)
        if not present:
            errors.append(f"missing required field: {dotted}")

    for dotted, allowed in schema.get("enums", {}).items():
        present, value = get_path(document, dotted)
        if present and value not in allowed:
            errors.append(f"{dotted} must be one of: {', '.join(allowed)}")

    for dotted in schema.get("list_string_paths", []):
        present, value = get_path(document, dotted)
        if present and (
            not isinstance(value, list)
            or not all(isinstance(item, str) and item.strip() for item in value)
        ):
            errors.append(f"{dotted} must be a list of non-empty strings")

    for dotted in schema.get("hex_map_paths", []):
        present, value = get_path(document, dotted)
        if present:
            validate_hex_map(value, dotted, errors)

    present, aspect = get_path(document, "style.canvas.aspect_ratio")
    if present and (not isinstance(aspect, str) or ASPECT_RE.fullmatch(aspect) is None):
        errors.append("style.canvas.aspect_ratio must use W:H")

    present, outline_enabled = get_path(document, "style.outline.enabled")
    if present and not isinstance(outline_enabled, bool):
        errors.append("style.outline.enabled must be a boolean")

    present, pixels_per_unit = get_path(document, "engine.pixels_per_unit")
    if present and (
        isinstance(pixels_per_unit, bool)
        or not isinstance(pixels_per_unit, int)
        or pixels_per_unit <= 0
    ):
        errors.append("engine.pixels_per_unit must be a positive integer")

    for dotted in ("engine.texture_compression", "engine.atlas_group"):
        present, value = get_path(document, dotted)
        if present and (not isinstance(value, str) or not value.strip()):
            errors.append(f"{dotted} must be a non-empty string")

    present, rendering = get_path(document, "style.rendering")
    pixel_present, _ = get_path(document, "style.pixel_register")
    if present and rendering == "pixel_art" and not pixel_present:
        errors.append("style.pixel_register is required for pixel_art")
    if present and rendering != "pixel_art" and pixel_present:
        errors.append("style.pixel_register is only valid for pixel_art")

    present, confidence_value = get_path(document, "style.confidence")
    confidence = require_object(confidence_value, "style.confidence", errors)
    for dimension, score in confidence.items():
        if isinstance(score, bool) or not isinstance(score, (int, float)):
            errors.append(f"style.confidence.{dimension} must be a number")
        elif not 0 <= score <= 1:
            errors.append(f"style.confidence.{dimension} must be between 0 and 1")

    if stage == "generation":
        requirements = schema.get("generation_requirements", {})
        present, status = get_path(document, "approval.status")
        expected = requirements.get("approval_status", "approved")
        if not present or status != expected:
            errors.append(f"approval.status must be {expected} for generation")
        for dotted in requirements.get("approval_required_paths", []):
            present, value = get_path(document, dotted)
            if not present or not isinstance(value, str) or not value.strip():
                errors.append(f"{dotted} must be recorded for generation")
        present, references = get_path(document, "references.style")
        minimum = requirements.get("minimum_style_references", 1)
        if not present or not isinstance(references, list) or len(references) < minimum:
            errors.append(
                f"references.style must contain at least {minimum} STYLE reference"
            )
        threshold = schema.get("confidence_threshold", 0.75)
        if requirements.get("require_all_confidence_at_or_above_threshold"):
            for dimension, score in confidence.items():
                if isinstance(score, (int, float)) and not isinstance(score, bool):
                    if score < threshold:
                        errors.append(
                            f"style.confidence.{dimension} must be >= {threshold}"
                        )
    return errors


def validate_or_raise(document: dict[str, Any], stage: str) -> dict[str, Any]:
    schema = load_schema()
    errors = validate_contract(document, schema, stage)
    if errors:
        raise ContractError("\n".join(f"- {error}" for error in errors))
    return schema


def csv(values: list[str]) -> str:
    return ", ".join(values)


def enum_phrase(value: str) -> str:
    return value.replace("_", " ")


def compile_prompt(document: dict[str, Any], asset_type: str, name: str) -> str:
    schema = validate_or_raise(document, "generation")
    allowed = schema.get("compiler_asset_types", [])
    if asset_type not in allowed:
        raise ContractError(
            f"asset type must be one of: {', '.join(str(item) for item in allowed)}"
        )
    if not name.strip():
        raise ContractError("asset name must be non-empty")

    project = document["project"]
    style = document["style"]
    shape = style["shape"]
    palette = style["palette"]
    color_map = style["color_map"]
    materials = style["materials"]
    lighting = style["lighting"]
    outline = style["outline"]
    canvas = style["canvas"]
    engine = document["engine"]
    references = document["references"]

    surface_colors = "; ".join(
        f"{role.replace('_', ' ')} = {csv(colors)}"
        for role, colors in sorted(color_map.items())
    )
    material_text = "; ".join(
        f"{role} = {enum_phrase(value)}" for role, value in sorted(materials.items())
    )
    shape_parts = [
        f"{enum_phrase(shape['language'])} shape language",
        f"{enum_phrase(shape['corner_radius'])} corner radius",
    ]
    if shape.get("ui_panel_geometry"):
        shape_parts.append(f"{enum_phrase(shape['ui_panel_geometry'])} panel geometry")
    if shape.get("slant"):
        shape_parts.append(f"{enum_phrase(shape['slant'])} slant")

    pixel_text = ""
    if style["rendering"] == "pixel_art":
        pixel_text = f", {enum_phrase(style['pixel_register'])} pixel register"

    type_guidance = {
        "character": "Keep identity, silhouette, outfit colors, and proportions stable across future poses.",
        "background": "Keep the gameplay focal area readable and separate depth into reusable layers.",
        "environment": "Keep the gameplay focal area readable and separate depth into reusable layers.",
        "icon": "Use a centered readable silhouette with transparent-background export readiness.",
        "object": "Make function and interaction affordance readable from the silhouette.",
        "prop": "Make function and interaction affordance readable from the silhouette.",
        "sprite": "Use a consistent frame canvas, pivot, scale, and transparent background.",
        "tile": "Use seamless edges and the declared pixel grid without anti-aliasing drift.",
        "ui-kit": "Render the complete component family on one sheet to reduce cross-asset drift.",
        "screen": "Respect safe areas, hierarchy, and one entry point per feature.",
        "button": "Keep states visually related and preserve label readability.",
        "panel": "Preserve the declared geometry on every edge and trim surface.",
    }[asset_type]

    lines = [
        (
            f"Generate the {asset_type} asset '{name}' for {project['name']}, "
            f"a {csv(project['genre'])} {project['platform']} game."
        ),
        (
            "STYLE reference roles: STYLE references define appearance only; "
            "TARGET references define content or layout only; CHARACTER references "
            "define identity only. Do not mix these roles."
        ),
        (
            f"Reference inputs: STYLE = {csv(references['style'])}; "
            f"TARGET = {csv(references['target']) or 'none'}; "
            f"CHARACTER = {csv(references['character']) or 'none'}."
        ),
        (
            f"Rendering: {enum_phrase(style['rendering'])}{pixel_text}; "
            f"mood: {csv([enum_phrase(item) for item in style['mood']])}."
        ),
        f"Shape lock: {csv(shape_parts)}. Echo this geometry on every relevant surface.",
        (
            f"Palette lock: primary {csv(palette['primary'])}; secondary "
            f"{csv(palette['secondary'])}; accent {csv(palette['accent'])}; "
            f"neutral {csv(palette['neutral'])}."
        ),
        f"Per-surface color lock: {surface_colors}.",
        f"Materials: {material_text}.",
        (
            f"Lighting: {enum_phrase(lighting['direction'])} direction, "
            f"{enum_phrase(lighting['contrast'])} contrast, "
            f"{enum_phrase(lighting['highlight'])} highlight, "
            f"{enum_phrase(lighting['shadow'])} shadow."
        ),
        (
            f"Outline: {'enabled' if outline['enabled'] else 'disabled'}, "
            f"{enum_phrase(outline['thickness'])}, "
            f"{enum_phrase(outline['color'])}."
        ),
        (
            f"Camera and canvas: {enum_phrase(style['camera'])}; "
            f"{canvas['orientation']} {canvas['aspect_ratio']}."
        ),
        type_guidance,
        (
            f"Engine handoff: {engine['name']}, {engine['pixels_per_unit']} pixels "
            f"per unit, {engine['texture_compression']} compression, atlas group "
            f"{engine['atlas_group']}."
        ),
        f"Avoid: {csv(style['negative'])}.",
        f"Contract: {document['schema_version']} (approved).",
    ]
    prompt = "\n".join(lines)
    unresolved = PLACEHOLDER_RE.findall(prompt)
    if unresolved:
        raise ContractError(
            "compiled prompt contains unresolved placeholders: "
            + ", ".join(sorted(set(unresolved)))
        )
    return prompt


def draft_contract(project_name: str, project_type: str) -> dict[str, Any]:
    scope_by_type = {
        "app": "2d",
        "game-2d": "2d",
        "game-3d": "3d",
        "mixed": "mixed",
    }
    return {
        "schema_version": "game-art-contract/v2",
        "project": {
            "name": project_name,
            "genre": ["casual"],
            "platform": "cross_platform",
            "asset_scope": scope_by_type[project_type],
        },
        "approval": {"status": "draft"},
        "references": {"style": [], "target": [], "character": []},
        "style": {
            "rendering": "flat_vector",
            "mood": ["playful"],
            "shape": {"language": "geometric", "corner_radius": "small"},
            "palette": {
                "primary": ["#334155"],
                "secondary": ["#64748B"],
                "accent": ["#F59E0B"],
                "neutral": ["#E2E8F0"],
            },
            "color_map": {"background": ["#334155"]},
            "materials": {
                "button": "matte_plastic",
                "container": "painted_card",
                "icon": "flat",
            },
            "lighting": {
                "direction": "top_left",
                "contrast": "medium",
                "highlight": "soft",
                "shadow": "soft_bottom",
            },
            "outline": {
                "enabled": True,
                "thickness": "thin",
                "color": "darker_variant",
            },
            "camera": "orthographic",
            "canvas": {"orientation": "landscape", "aspect_ratio": "16:9"},
            "negative": ["photorealism", "watermark", "jpeg_artifacts"],
            "confidence": {
                "shape": 0.0,
                "palette": 0.0,
                "rendering": 0.0,
                "material": 0.0,
                "lighting": 0.0,
            },
        },
        "engine": {
            "name": "generic",
            "pixels_per_unit": 100,
            "texture_compression": "platform-default",
            "atlas_group": "unassigned",
        },
    }


def command_validate(args: argparse.Namespace) -> int:
    document = load_json(args.contract, "contract")
    schema = load_schema()
    errors = validate_contract(document, schema, args.stage)
    if errors:
        raise ContractError("\n".join(f"- {error}" for error in errors))
    print(f"VALID {document['schema_version']} stage={args.stage}")
    return 0


def command_compile(args: argparse.Namespace) -> int:
    document = load_json(args.contract, "contract")
    print(compile_prompt(document, args.asset_type, args.name))
    return 0


def command_init(args: argparse.Namespace) -> int:
    if args.output.exists() and not args.force:
        raise ContractError(f"refusing to overwrite existing contract: {args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    value = draft_contract(args.project_name, args.project_type)
    args.output.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    print(f"Created draft {value['schema_version']}: {args.output}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate")
    validate.add_argument("contract", type=Path)
    validate.add_argument("--stage", choices=("draft", "generation"), default="draft")
    validate.set_defaults(handler=command_validate)

    compile_parser = subparsers.add_parser("compile")
    compile_parser.add_argument("contract", type=Path)
    compile_parser.add_argument("--asset-type", required=True)
    compile_parser.add_argument("--name", required=True)
    compile_parser.set_defaults(handler=command_compile)

    init = subparsers.add_parser("init")
    init.add_argument("output", type=Path)
    init.add_argument(
        "--project-type",
        choices=("app", "game-2d", "game-3d", "mixed"),
        default="game-2d",
    )
    init.add_argument("--project-name", default="Untitled Game")
    init.add_argument("--force", action="store_true")
    init.set_defaults(handler=command_init)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return int(args.handler(args))
    except ContractError as error:
        print(f"INVALID game art contract:\n{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
