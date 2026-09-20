#!/usr/bin/env python3
"""Fail-closed, local-first skill routing for Forgewright.

The skills config owns mode ordering and enablement.  This module only supplies
the small prompt classifier needed to select a configured mode.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

# Direct script invocation from a consumer cwd must import this trusted package,
# rather than requiring PYTHONPATH or finding a consumer's unrelated scripts/.
if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.runtime.local_routing import (
    ExactRoutingCache,
    select_mode,
    valid_name,
    validate_candidates,
)


def _result(
    *,
    status: str,
    mode: str | None,
    source: str,
    skills: list[dict[str, Any]] | None = None,
    errors: list[str] | None = None,
    context_budget: dict[str, Any] | None = None,
    routing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "routing": routing
        or {
            "status": "error" if status == "error" else "abstain",
            "mode": None,
            "source": source,
            "rule_score": 0,
            "score_kind": "rule-score-not-calibrated",
            "backend": "python-stdlib",
            "reason": "routing-error" if status == "error" else "no-selection",
        },
        "status": status,
        "mode": mode,
        "source": source,
        "skills": skills or [],
        "errors": errors or [],
        "context_budget": context_budget
        or {
            "limit": None,
            "estimated_used": 0,
            "estimator": "utf8_bytes_div_4_ceil",
            "deferred_skills": [],
            "deferred_count": 0,
        },
    }


def _normalise_mode(value: str) -> str:
    return re.sub(r"\s+", "-", value.strip().lower())


def _mode_skill_map(config: dict[str, Any]) -> dict[str, list[str]]:
    rules = config.get("auto_detect_rules", {})
    if not isinstance(rules, dict):
        raise ValueError("auto_detect_rules must be an object")
    raw_map = rules.get("mode_skill_map", config.get("mode_skill_map"))
    if not isinstance(raw_map, dict):
        raise ValueError("mode_skill_map must be an object")

    if len(raw_map) > 64:
        raise ValueError("mode_skill_map exceeds 64 modes")
    result: dict[str, list[str]] = {}
    for raw_mode, raw_skills in raw_map.items():
        if not isinstance(raw_mode, str) or not raw_mode.strip():
            raise ValueError("mode_skill_map contains an invalid mode name")
        if not isinstance(raw_skills, list) or not all(
            isinstance(skill, str) and skill.strip() for skill in raw_skills
        ):
            raise ValueError(
                f"mode_skill_map[{raw_mode!r}] must be a list of skill names"
            )
        mode_name = _normalise_mode(raw_mode)
        if not valid_name(mode_name) or mode_name in result:
            raise ValueError("invalid or duplicate normalized mode name")
        if len(raw_skills) > 128:
            raise ValueError("mode skill list exceeds 128 entries")
        names = [skill.strip() for skill in raw_skills]
        if any(not valid_name(name) for name in names):
            raise ValueError("invalid skill name or path escapes skills root")
        result[mode_name] = names
    return result


def _skill_settings(config: dict[str, Any]) -> dict[str, Any]:
    raw = config.get("skills", {})
    if not isinstance(raw, dict):
        raise ValueError("skills must be an object")
    return raw


def _enabled_value(settings: Any, skill: str) -> str:
    if not isinstance(settings, dict):
        raise ValueError(f"skills[{skill!r}] must be an object")
    value = settings.get("enabled", "auto")
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str) and value.strip().lower() in {"auto", "true", "false"}:
        return value.strip().lower()
    raise ValueError(f"skills[{skill!r}].enabled must be auto, true, or false")


def _context_budget(config: dict[str, Any]) -> tuple[int, int]:
    """Parse the two context limits using strict, provider-neutral semantics."""
    budget = config.get("context_budget", {})
    if not isinstance(budget, dict):
        raise ValueError("context_budget must be an object")

    max_skills = budget.get("max_skills_per_mode", 12)
    if (
        isinstance(max_skills, bool)
        or not isinstance(max_skills, int)
        or max_skills < 0
    ):
        raise ValueError(
            "context_budget.max_skills_per_mode must be a non-negative integer"
        )

    descriptions = budget.get("max_skill_descriptions_tokens", 8000)
    if (
        isinstance(descriptions, bool)
        or not isinstance(descriptions, int)
        or descriptions < 0
    ):
        raise ValueError(
            "context_budget.max_skill_descriptions_tokens must be a non-negative integer"
        )
    return max_skills, descriptions


def _estimate_overlay_tokens(skill: dict[str, str]) -> int:
    """Estimate rendered overlay cost as ceil(UTF-8 bytes / 4).

    This deterministic heuristic is intentionally local/provider-neutral; it is
    an estimate, not an exact provider tokenizer count.  Use file metadata so a
    deferred overlay body is not read merely to decide whether it fits.
    """
    content_bytes = Path(skill["lite_path"]).stat().st_size
    prefix = f"\n## Skill-Specific Instructions: {skill['name']}\n".encode("utf-8")
    rendered_bytes = len(prefix) + content_bytes + len(b"\n")
    return (rendered_bytes + 3) // 4


def _contains_path(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _verified_skill(skill_name: str, *, skills_root: Path) -> dict[str, str]:
    if not isinstance(skill_name, str) or not skill_name.strip():
        raise ValueError("mode_skill_map contains an invalid skill name")
    if not valid_name(skill_name):
        raise ValueError(
            f"invalid skill name or path escapes skills root: {skill_name}"
        )
    candidate_path = skills_root / skill_name
    if candidate_path.is_symlink():
        raise ValueError(f"symlinked skill directory is not allowed: {skill_name}")
    candidate = candidate_path.resolve()
    if not _contains_path(candidate, skills_root):
        raise ValueError(f"skill path escapes skills root: {skill_name}")
    if not candidate.is_dir():
        raise ValueError(f"missing skill directory: {skill_name}")

    skill_source = candidate / "SKILL.md"
    lite_source = candidate / "LITE.md"
    if skill_source.is_symlink():
        raise ValueError(f"symlinked SKILL.md is not allowed: {skill_name}")
    if lite_source.is_symlink():
        raise ValueError(f"symlinked LITE.md is not allowed: {skill_name}")
    skill_path = skill_source.resolve()
    lite_path = lite_source.resolve()
    if not _contains_path(skill_path, skills_root) or not _contains_path(
        lite_path, skills_root
    ):
        raise ValueError(f"skill files escape skills root: {skill_name}")
    if not skill_path.is_file():
        raise ValueError(f"missing SKILL.md: {skill_name}")
    if not lite_path.is_file():
        raise ValueError(f"missing LITE.md: {skill_name}")
    return {
        "name": skill_name,
        "skill_path": str(skill_path),
        "lite_path": str(lite_path),
    }


def classify_mode(prompt: str, configured_modes: set[str] | None = None) -> str | None:
    """Classify a prompt without inventing or owning the configured mode map."""
    text = (prompt or "").strip().lower()
    if not text:
        return None
    configured = (
        {_normalise_mode(mode) for mode in configured_modes}
        if configured_modes is not None
        else None
    )

    def candidate(mode: str) -> str | None:
        return mode if configured is None or mode in configured else None

    def has(*terms: str) -> bool:
        return any(term in text for term in terms)

    # Specific game signals must win over generic build/create language.
    game_signal = has(
        "unity",
        "unreal engine",
        "unreal",
        "roblox",
        "godot",
        "phaser",
        "game",
        "gameplay",
        "video game",
        "level design",
    )
    if game_signal and (
        has("build", "create", "make", "develop", "prototype")
        or has("unity", "unreal", "roblox", "godot", "phaser")
    ):
        return candidate("game-build")

    # Visual concept/art-direction work is design, rather than generic build.
    if has(
        "concept art",
        "concept-artist",
        "visual concept",
        "art direction",
        "art-director",
        "moodboard",
        "visual style",
        "visual identity",
        "character design",
        "environment design",
        "illustration",
    ):
        return candidate("design")

    candidates = (
        ("full-build", ("full build", "build", "create", "scaffold", "new project")),
        ("feature", ("feature", "implement", "add functionality")),
        ("test", ("test", "qa", "coverage", "validation")),
        ("review", ("code review", "pull request", "review")),
        ("ship", ("ship", "release", "deploy")),
        ("architect", ("architecture", "architect", "design system")),
        ("document", ("documentation", "document", "readme")),
        ("research", ("research", "investigate")),
        ("optimize", ("optimize", "performance", "latency")),
        ("mobile", ("ios", "android", "mobile")),
        ("marketing", ("marketing", "campaign", "landing page")),
        ("ai-build", ("llm", "ai agent", "machine learning")),
        ("xr-build", ("xr", "ar", "vr", "mixed reality")),
        ("analyze", ("analyze", "analysis", "metrics")),
    )
    for mode, terms in candidates:
        if has(*terms):
            return candidate(mode)

    return None


def _resolve_skills_root(root: Path, override: str | Path | None) -> Path:
    """Separate consumer config from the installed package's skill catalog.

    An explicit override is host input, never prompt text. Retain the historical
    standalone project_root/skills layout when it exists; a package nested in a
    consumer (including a submodule) always uses its own skills by default.
    """
    package = Path(__file__).resolve().parents[2]
    if override is not None:
        candidate = Path(override).expanduser()
        if not candidate.is_absolute():
            candidate = root / candidate
    elif package != root and _contains_path(package, root):
        candidate = package / "skills"
    elif (root / "skills").exists() or (root / "skills").is_symlink():
        candidate = root / "skills"
    else:
        candidate = package / "skills"
    if candidate.is_symlink():
        raise ValueError("symlinked skills root is not allowed")
    candidate = candidate.resolve()
    if not candidate.is_dir():
        raise ValueError(f"missing skills root: {candidate}")
    return candidate


def _routing_fingerprint(
    root: Path,
    config: Path,
    document: dict,
    skills_root: Path,
    mode_map: dict,
    settings: dict,
) -> str:
    # No overlay contents are read. Changes in catalog metadata invalidate hits;
    # selected entries are revalidated even on a cache hit.
    names = {name for values in mode_map.values() for name in values}
    names.update(name for name in settings if not name.startswith("_"))
    if len(names) > 512 or any(not valid_name(name) for name in names):
        raise ValueError("invalid or oversized skill catalog (max 512)")
    catalog = []
    for name in sorted(names):
        for leaf in ("", "SKILL.md", "LITE.md"):
            path = skills_root / name / leaf
            try:
                st = path.lstat()
                stamp = (
                    st.st_mode,
                    st.st_size,
                    st.st_mtime_ns,
                    st.st_ctime_ns,
                    st.st_ino,
                )
            except FileNotFoundError:
                stamp = None
            catalog.append((name, leaf, stamp))
    policy = root / ".forgewright" / "execution-policy.yaml"
    policy_digest = None
    if policy.exists():
        with policy.open("rb") as handle:
            contents = handle.read(1024 * 1024 + 1)
        if len(contents) > 1024 * 1024:
            raise ValueError("routing policy fingerprint input exceeds 1 MiB")
        policy_digest = hashlib.sha256(contents).hexdigest()
    payload = [
        str(root),
        str(config),
        str(skills_root),
        document,
        catalog,
        policy_digest,
    ]
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def _allowed_modes(document: dict, mode_map: dict, allowed_modes) -> list[str]:
    policy = document.get("routing_policy", {})
    if not isinstance(policy, dict):
        raise ValueError("routing_policy must be an object")
    enabled = policy.get("enabled", True)
    if not isinstance(enabled, bool):
        raise ValueError("routing_policy.enabled must be a boolean")
    modes = list(mode_map)
    if "allowed_modes" in policy:
        allowed = validate_candidates(policy["allowed_modes"])
        modes = [mode for mode in modes if mode in allowed]
    if allowed_modes is not None:
        allowed = validate_candidates(allowed_modes)
        modes = [mode for mode in modes if mode in allowed]
    return modes if enabled else []


def route_skills(
    *,
    prompt: str = "",
    mode: str | None = None,
    config_path: str | Path | None = None,
    project_root: str | Path | None = None,
    skills_root: str | Path | None = None,
    allowed_modes: list[str] | None = None,
    cache: ExactRoutingCache | None = None,
) -> dict[str, Any]:
    """Return verified, ordered skill overlays from the local project config."""
    root = Path(project_root or Path.cwd()).expanduser().resolve()
    config = (
        Path(config_path or root / ".forgewright" / "skills-config.json")
        .expanduser()
        .resolve()
    )
    source = "explicit" if mode is not None else "local-rules"
    requested_mode = _normalise_mode(mode) if mode is not None else None

    if not config.is_file():
        return _result(
            status="error",
            mode=requested_mode,
            source=source,
            errors=[f"missing config: {config}"],
        )
    try:
        with config.open("r", encoding="utf-8") as handle:
            raw = handle.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise ValueError("skills config exceeds 1 MiB")
            document = json.loads(raw)
        if not isinstance(document, dict):
            raise ValueError("config root must be an object")
        mode_map = _mode_skill_map(document)
        settings = _skill_settings(document)
        if len(settings) > 512:
            raise ValueError("skills settings exceeds 512 entries")
        for name, value in settings.items():
            if not name.startswith("_"):
                if not valid_name(name):
                    raise ValueError("invalid skill name or path escapes skills root")
                _enabled_value(value, name)
        skills_root = _resolve_skills_root(root, skills_root)
        candidates = _allowed_modes(document, mode_map, allowed_modes)
        fingerprint = (
            _routing_fingerprint(
                root, config, document, skills_root, mode_map, settings
            )
            if cache is not None
            else "uncached"
        )
        cap, description_budget = _context_budget(document)
    except (OSError, UnicodeError, ValueError) as error:
        return _result(
            status="error", mode=requested_mode, source=source, errors=[str(error)]
        )

    selected_mode: str | None = None
    selected_source = source
    try:
        auto_detect = document.get("auto_detect", True)
        if not isinstance(auto_detect, bool):
            raise ValueError("auto_detect must be a boolean")
        decision = select_mode(
            prompt=prompt if auto_detect else "",
            candidates=candidates,
            project_root=root,
            fingerprint=fingerprint,
            explicit=requested_mode,
            cache=cache,
        )
        selected_mode = decision["mode"]
        selected_source = decision["source"]
        if selected_mode is None:
            force_names = [
                name
                for name, value in settings.items()
                if isinstance(name, str)
                and not name.startswith("_")
                and _enabled_value(value, name) == "true"
            ]
            selected_names = force_names
            if force_names:
                selected_source = "explicit"
                decision = dict(
                    decision, source="explicit", reason="host-forced-skills"
                )
        else:
            if selected_mode not in mode_map:
                message = (
                    f"unknown explicit mode: {selected_mode}"
                    if mode is not None
                    else f"classified mode is not configured: {selected_mode}"
                )
                return _result(
                    status="error",
                    mode=selected_mode,
                    source=selected_source,
                    errors=[message],
                )
            selected_names = list(mode_map[selected_mode])
            for name, value in settings.items():
                if not isinstance(name, str):
                    raise ValueError("skills contains a non-string skill name")
                if name.startswith("_"):
                    continue
                enabled = _enabled_value(value, name)
                if enabled == "false":
                    selected_names = [item for item in selected_names if item != name]
                elif enabled == "true" and name not in selected_names:
                    selected_names.append(name)
    except ValueError as error:
        return _result(
            status="error",
            mode=selected_mode,
            source=selected_source,
            errors=[str(error)],
        )

    # Validate before applying the cap so a bad configured path can never be
    # hidden by ordering or truncation.
    verified: list[dict[str, str]] = []
    seen: set[str] = set()
    try:
        for name in selected_names:
            if name in seen:
                continue
            seen.add(name)
            if name not in settings:
                # Unlisted skills are auto-enabled for compatibility with the
                # ordered map; their files still must pass validation.
                enabled = "auto"
            else:
                enabled = _enabled_value(settings[name], name)
            if enabled == "false":
                continue
            verified.append(_verified_skill(name, skills_root=skills_root))
    except (OSError, ValueError) as error:
        return _result(
            status="error",
            mode=selected_mode,
            source=selected_source,
            errors=[str(error)],
        )

    capped = verified[:cap] if cap else []
    loaded: list[dict[str, Any]] = []
    estimated_used = 0
    try:
        estimates = [_estimate_overlay_tokens(skill) for skill in capped]
        for skill, estimated_tokens in zip(capped, estimates):
            if (
                description_budget == 0
                or estimated_used + estimated_tokens > description_budget
            ):
                break
            enriched = dict(skill)
            enriched["estimated_tokens"] = estimated_tokens
            loaded.append(enriched)
            estimated_used += estimated_tokens
    except (OSError, UnicodeError, ValueError) as error:
        return _result(
            status="error",
            mode=selected_mode,
            source=selected_source,
            errors=[str(error)],
        )

    loaded_names = {skill["name"] for skill in loaded}
    deferred_names = [
        skill["name"] for skill in verified if skill["name"] not in loaded_names
    ]
    return _result(
        status="ok",
        mode=selected_mode,
        source=selected_source,
        skills=loaded,
        routing=decision,
        context_budget={
            "limit": description_budget,
            "estimated_used": estimated_used,
            "estimator": "utf8_bytes_div_4_ceil",
            "deferred_skills": deferred_names,
            "deferred_count": len(deferred_names),
        },
    )


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt")
    parser.add_argument("--mode")
    parser.add_argument("--config")
    parser.add_argument(
        "--skills-root", help="Explicit host-owned skill catalog override"
    )
    parser.add_argument("--project-root", default=str(Path.cwd()))
    args = parser.parse_args(argv)
    if args.prompt is None and args.mode is None:
        raise ValueError("one of --prompt or --mode is required")
    return args


def main(argv: list[str] | None = None) -> int:
    try:
        args = _parse_args(sys.argv[1:] if argv is None else argv)
        output = route_skills(
            prompt=args.prompt or "",
            mode=args.mode,
            config_path=args.config,
            project_root=args.project_root,
            skills_root=args.skills_root,
        )
    except Exception as error:  # Keep CLI output structured even for bad input.
        output = _result(status="error", mode=None, source="cli", errors=[str(error)])
    print(json.dumps(output, ensure_ascii=False, sort_keys=True))
    return 0 if output["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
