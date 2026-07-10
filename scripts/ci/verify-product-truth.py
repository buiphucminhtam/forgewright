#!/usr/bin/env python3
"""Validate canonical product facts against their declared source files."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


CANONICAL_PIPELINE = [
    "INTERPRET",
    "DEFINE",
    "BUILD",
    "HARDEN",
    "SHIP",
    "SUSTAIN",
]
MATURITY_VOCABULARY = ["stable", "beta", "experimental", "docs-only"]


def _load_json(path: Path, errors: list[str]) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"missing required file: {path.name}")
        return {}
    except json.JSONDecodeError as error:
        errors.append(f"invalid JSON in {path.name}: {error.msg}")
        return {}
    if not isinstance(data, dict):
        errors.append(f"{path.name} must contain a JSON object")
        return {}
    return data


def _read(root: Path, relative: str, errors: list[str]) -> str:
    path = root / relative
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        errors.append(f"missing truth file: {relative}")
        return ""


def _require_marker(
    content: str, marker: str, relative: str, description: str, errors: list[str]
) -> None:
    if marker not in content:
        errors.append(f"{relative} is missing {description}: {marker}")


def _reject_conflicting_counts(
    content: str,
    noun: str,
    expected: int,
    relative: str,
    errors: list[str],
) -> None:
    pattern = rf"\b(\d+)\s+(?:[A-Za-z][A-Za-z-]*\s+){{0,3}}{re.escape(noun)}\b"
    observed = sorted({int(match) for match in re.findall(pattern, content)})
    conflicts = [count for count in observed if count != expected]
    if conflicts:
        errors.append(
            f"{relative} contains conflicting {noun} counts: {conflicts}; "
            f"expected only {expected}"
        )


def _registry_inventory(content: str) -> dict[str, str]:
    inventory: dict[str, str] = {}
    current_name: str | None = None
    for line in content.splitlines():
        name_match = re.match(r"^\s*- name:\s*([^#\s]+)", line)
        if name_match:
            current_name = name_match.group(1)
            continue
        type_match = re.match(r"^\s+type:\s*(canonical|alias)\s*$", line)
        if type_match and current_name:
            inventory[current_name] = type_match.group(1)
            current_name = None
    return inventory


def _validate_manifest_shape(manifest: dict[str, Any], errors: list[str]) -> None:
    if manifest.get("schemaVersion") != 1:
        errors.append("product-manifest.json schemaVersion must be 1")
    product = manifest.get("product")
    pipeline = manifest.get("pipeline")
    skills = manifest.get("skills")
    modes = manifest.get("modes")
    truth_files = manifest.get("truthFiles")
    if not isinstance(product, dict) or not isinstance(product.get("version"), str):
        errors.append("product-manifest.json product.version must be a string")
    if not isinstance(pipeline, dict) or pipeline.get("phases") != CANONICAL_PIPELINE:
        errors.append(
            "product-manifest.json pipeline must be the canonical six phases: "
            + " → ".join(CANONICAL_PIPELINE)
        )
    if not isinstance(skills, dict):
        errors.append("product-manifest.json skills must be an object")
    if not isinstance(modes, dict):
        errors.append("product-manifest.json modes must be an object")
    elif not isinstance(modes.get("inventory"), list) or not all(
        isinstance(mode, str) and mode for mode in modes.get("inventory", [])
    ):
        errors.append("product-manifest.json modes.inventory must be a string array")
    elif modes.get("count") != len(modes["inventory"]):
        errors.append("product-manifest.json modes.count must match modes.inventory")
    if manifest.get("maturityVocabulary") != MATURITY_VOCABULARY:
        errors.append(
            "product-manifest.json maturityVocabulary must be: "
            + ", ".join(MATURITY_VOCABULARY)
        )

    surfaces = manifest.get("supportedSurfaces", [])
    if not isinstance(surfaces, list):
        errors.append("product-manifest.json supportedSurfaces must be an array")
        surfaces = []
    surface_ids: list[str] = []
    allowed_maturity = set(MATURITY_VOCABULARY)
    for index, surface in enumerate(surfaces):
        if not isinstance(surface, dict):
            errors.append(
                f"product-manifest.json supportedSurfaces[{index}] must be an object"
            )
            continue
        surface_id = str(surface.get("id", ""))
        surface_ids.append(surface_id)
        if surface.get("maturity") not in allowed_maturity:
            errors.append(
                f"surface {surface_id or '<missing id>'} has invalid maturity"
            )
        marker = surface.get("truthMarker")
        truth_file = surface.get("truthFile")
        if not isinstance(marker, str) or not isinstance(truth_file, str):
            errors.append(
                f"surface {surface_id or '<missing id>'} requires string truthFile and truthMarker"
            )
        else:
            maturity = str(surface.get("maturity", "")).title()
            if f"| {maturity} |" not in marker:
                errors.append(
                    f"surface {surface_id or '<missing id>'} truthMarker must encode maturity {maturity}"
                )
    if not surfaces:
        errors.append("product-manifest.json supportedSurfaces must not be empty")
    if len(surface_ids) != len(set(surface_ids)):
        errors.append("product-manifest.json supported surface ids must be unique")
    if not isinstance(truth_files, list) or not truth_files:
        errors.append("product-manifest.json truthFiles must be a non-empty array")
    elif not all(
        isinstance(entry, dict) and isinstance(entry.get("path"), str)
        for entry in truth_files
    ):
        errors.append("product-manifest.json truthFiles entries require a string path")


def _validate_package(
    root: Path, manifest: dict[str, Any], pipeline: str, errors: list[str]
) -> None:
    package = _load_json(root / "package.json", errors)
    expected_version = manifest["product"]["version"]
    actual_version = package.get("version")
    if actual_version != expected_version:
        errors.append(
            f"package.json version is {actual_version}; expected {expected_version}"
        )
    description = str(package.get("description", ""))
    _reject_conflicting_counts(
        description,
        "skills",
        manifest["skills"]["canonicalCount"],
        "package.json description",
        errors,
    )
    _reject_conflicting_counts(
        description,
        "modes",
        manifest["modes"]["count"],
        "package.json description",
        errors,
    )
    for marker, description_label in (
        (f"{manifest['skills']['canonicalCount']} skills", "canonical skill count"),
        (f"{manifest['modes']['count']} modes", "declared mode count"),
        (f"Pipeline: {pipeline}", "canonical pipeline"),
    ):
        _require_marker(
            description, marker, "package.json description", description_label, errors
        )


def _validate_public_docs(
    root: Path, manifest: dict[str, Any], pipeline: str, errors: list[str]
) -> None:
    version = manifest["product"]["version"]
    skill_count = manifest["skills"]["canonicalCount"]
    mode_count = manifest["modes"]["count"]

    readme = _read(root, "README.md", errors)
    _reject_conflicting_counts(readme, "skills", skill_count, "README.md", errors)
    _require_marker(
        readme, f"version-{version}-blue", "README.md", "version badge", errors
    )
    _require_marker(
        readme,
        f"skills-{skill_count}-brightgreen",
        "README.md",
        "canonical skill badge",
        errors,
    )
    _require_marker(readme, f"`{pipeline}`", "README.md", "canonical pipeline", errors)

    overview = _read(root, "docs/product-overview.md", errors)
    _reject_conflicting_counts(
        overview, "skills", skill_count, "docs/product-overview.md", errors
    )
    _reject_conflicting_counts(
        overview, "modes", mode_count, "docs/product-overview.md", errors
    )
    for marker, label in (
        (f"**Version:** {version}", "product version"),
        (f"{skill_count} specialized AI skills", "canonical skill count"),
        (f"one of {mode_count} execution modes", "declared mode count"),
        (pipeline, "canonical pipeline"),
    ):
        _require_marker(overview, marker, "docs/product-overview.md", label, errors)

    docs_index = _read(root, "docs/index.md", errors)
    _reject_conflicting_counts(
        docs_index, "skills", skill_count, "docs/index.md", errors
    )
    _reject_conflicting_counts(docs_index, "modes", mode_count, "docs/index.md", errors)
    for marker, label in (
        (f"{skill_count} AI skills", "canonical skill count"),
        (f"{mode_count} execution modes", "declared mode count"),
        (f"Current version: **{version}**", "product version"),
    ):
        _require_marker(docs_index, marker, "docs/index.md", label, errors)


def _validate_skills(root: Path, manifest: dict[str, Any], errors: list[str]) -> None:
    skill_truth = manifest["skills"]
    registry_path = str(skill_truth["registry"])
    registry = _registry_inventory(_read(root, registry_path, errors))
    excluded = set(skill_truth["excludedDirectories"])
    skills_root = root / str(skill_truth["root"])
    installed = {
        path.parent.name
        for path in skills_root.glob("*/SKILL.md")
        if path.parent.name not in excluded
    }
    canonical = {name for name, kind in registry.items() if kind == "canonical"}
    aliases = {name for name, kind in registry.items() if kind == "alias"}

    expected_counts = (
        ("canonical skill", len(canonical), skill_truth["canonicalCount"]),
        ("alias skill", len(aliases), skill_truth["aliasCount"]),
        ("installed skill", len(installed), skill_truth["installedCount"]),
    )
    for label, actual, expected in expected_counts:
        if actual != expected:
            errors.append(f"{label} count is {actual}; expected {expected}")

    missing_files = sorted(set(registry) - installed)
    unregistered = sorted(installed - set(registry))
    if missing_files:
        errors.append("registry entries missing SKILL.md: " + ", ".join(missing_files))
    if unregistered:
        errors.append("unregistered skill directories: " + ", ".join(unregistered))


def _validate_modes(root: Path, manifest: dict[str, Any], errors: list[str]) -> None:
    mode_truth = manifest["modes"]
    source = str(mode_truth["source"])
    content = _read(root, source, errors)
    level = int(mode_truth["headingLevel"])
    prefix = "#" * level
    headings = {
        match.group(1).strip()
        for match in re.finditer(
            rf"^{re.escape(prefix)}\s+(.+?)\s*$", content, re.MULTILINE
        )
    }
    modes = headings - set(mode_truth["excludedHeadings"])
    expected = set(mode_truth["inventory"])
    if modes != expected:
        missing = sorted(expected - modes)
        unexpected = sorted(modes - expected)
        errors.append(
            f"mode inventory differs in {source}; missing={missing}; unexpected={unexpected}"
        )


def _validate_surfaces(root: Path, manifest: dict[str, Any], errors: list[str]) -> None:
    cache: dict[str, str] = {}
    for surface in manifest["supportedSurfaces"]:
        relative = str(surface["truthFile"])
        if relative not in cache:
            cache[relative] = _read(root, relative, errors)
        _require_marker(
            cache[relative],
            str(surface["truthMarker"]),
            relative,
            f"surface marker for {surface['id']}",
            errors,
        )


def validate(root: Path) -> list[str]:
    errors: list[str] = []
    manifest = _load_json(root / "product-manifest.json", errors)
    if not manifest:
        return errors

    _validate_manifest_shape(manifest, errors)
    if errors:
        return sorted(set(errors))
    try:
        pipeline = " → ".join(manifest["pipeline"]["phases"])
        truth_files = manifest["truthFiles"]
        truth_paths = [entry["path"] for entry in truth_files]
        if len(truth_paths) != len(set(truth_paths)):
            errors.append("product-manifest.json truth file paths must be unique")
        for relative in truth_paths:
            if not (root / relative).is_file():
                errors.append(f"missing truth file: {relative}")

        _validate_package(root, manifest, pipeline, errors)
        _validate_public_docs(root, manifest, pipeline, errors)
        _validate_skills(root, manifest, errors)
        _validate_modes(root, manifest, errors)
        _validate_surfaces(root, manifest, errors)
    except (KeyError, TypeError, ValueError) as error:
        errors.append(f"invalid product-manifest.json structure: {error}")
    return sorted(set(errors))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="repository root (defaults to the validator's repository)",
    )
    args = parser.parse_args()
    errors = validate(args.root.resolve())
    if errors:
        print("Product truth verification failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Product truth verified: manifest, inventory, and public claims agree.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
