#!/usr/bin/env python3
"""Lint Forgewright skill frontmatter so descriptions remain routing metadata."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

BOOT_SKILLS = (
    "debugger",
    "ui-designer",
    "software-engineer",
    "code-reviewer",
    "qa-engineer",
    "devops",
)
MAX_DESCRIPTION_CHARS = 280
_TRIGGER_PREFIX = re.compile(r"^Use (?:when|for)\b", re.IGNORECASE)
_WORKFLOW_PATTERNS = (
    (
        re.compile(
            r"(?<![-])\b(?:first|then|finally|step\s*\d|workflow)\b", re.IGNORECASE
        ),
        "sequence",
    ),
    (re.compile(r"\b(?:must|should|always|never)\b", re.IGNORECASE), "instruction"),
    (
        re.compile(
            r"\b(?:includes?|ensures?|routed via|produces?|executes?)\b", re.IGNORECASE
        ),
        "behavior",
    ),
    (
        re.compile(
            r"\b(?:write (?:a )?failing test|run (?:the )?tests?|apply (?:a )?fix)\b",
            re.IGNORECASE,
        ),
        "procedure",
    ),
)


class SkillMetadataError(ValueError):
    """Raised when a skill frontmatter block is malformed."""


def _frontmatter(text: str) -> list[str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise SkillMetadataError("skill file must start with YAML frontmatter")
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration as error:
        raise SkillMetadataError("skill frontmatter is not terminated") from error
    return lines[1:end]


def _scalar(lines: list[str], key: str) -> str | None:
    prefix = key + ":"
    for index, line in enumerate(lines):
        if not line.startswith(prefix):
            continue
        raw = line[len(prefix) :].strip()
        if raw in {">", "|", ">-", "|-"}:
            body: list[str] = []
            for following in lines[index + 1 :]:
                if following and not following[0].isspace():
                    break
                body.append(following.strip())
            return " ".join(part for part in body if part).strip()
        if len(raw) >= 2 and raw[0] == raw[-1] == '"':
            try:
                value = json.loads(raw)
                return value if isinstance(value, str) else None
            except json.JSONDecodeError:
                return raw[1:-1]
        if len(raw) >= 2 and raw[0] == raw[-1] == "'":
            return raw[1:-1].replace("''", "'")
        return raw
    return None


def parse_skill(path: Path) -> dict[str, str]:
    lines = _frontmatter(path.read_text(encoding="utf-8"))
    name = _scalar(lines, "name")
    description = _scalar(lines, "description")
    if not name or not description:
        raise SkillMetadataError(f"{path}: name and description are required")
    return {"name": name.strip(), "description": description.strip()}


def lint_description(description: str) -> list[dict[str, str]]:
    diagnostics: list[dict[str, str]] = []
    if len(description) > MAX_DESCRIPTION_CHARS:
        diagnostics.append(
            {"code": "DESCRIPTION_TOO_LONG", "detail": str(len(description))}
        )
    if not _TRIGGER_PREFIX.search(description):
        diagnostics.append(
            {
                "code": "DESCRIPTION_NOT_TRIGGER_ONLY",
                "detail": "description must start with 'Use when' or 'Use for'",
            }
        )
    for pattern, kind in _WORKFLOW_PATTERNS:
        match = pattern.search(description)
        if match:
            diagnostics.append(
                {
                    "code": "DESCRIPTION_WORKFLOW_LEAK",
                    "detail": f"{kind}:{match.group(0)}",
                }
            )
    return diagnostics


def scan(root: Path, *, strict_all: bool = False) -> dict[str, Any]:
    skills_root = root / "skills"
    rows: list[dict[str, Any]] = []
    paths = sorted(skills_root.glob("*/LITE.md")) + sorted(
        skills_root.glob("*/SKILL.md")
    )
    for path in sorted(paths, key=lambda item: item.relative_to(root).as_posix()):
        if path.parent.name.startswith("_"):
            continue
        try:
            metadata = parse_skill(path)
            diagnostics = lint_description(metadata["description"])
        except SkillMetadataError as error:
            metadata = {"name": path.parent.name, "description": ""}
            diagnostics = [{"code": "FRONTMATTER_INVALID", "detail": str(error)}]
        strict = strict_all or metadata["name"] in BOOT_SKILLS
        rows.append(
            {
                "skill": metadata["name"],
                "surface": path.name,
                "path": path.relative_to(root).as_posix(),
                "description": metadata["description"],
                "strict": strict,
                "diagnostics": diagnostics,
            }
        )
    errors = [
        {"skill": row["skill"], **diag}
        for row in rows
        if row["strict"]
        for diag in row["diagnostics"]
    ]
    warnings = [
        {"skill": row["skill"], **diag}
        for row in rows
        if not row["strict"]
        for diag in row["diagnostics"]
    ]
    return {
        "schema": "forgewright-skill-metadata-lint/v1",
        "status": "pass" if not errors else "fail",
        "strict_skills": list(BOOT_SKILLS) if not strict_all else "all",
        "skills_scanned": len(rows),
        "errors": errors,
        "warnings": warnings,
        "rows": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--strict-all", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    report = scan(args.root.resolve(), strict_all=args.strict_all)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for row in report["errors"]:
            print(f"ERROR {row['skill']}: {row['code']} {row['detail']}")
        print(
            f"skill-metadata: {report['status']} "
            f"({report['skills_scanned']} scanned, "
            f"{len(report['errors'])} errors, {len(report['warnings'])} warnings)"
        )
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SkillMetadataError as error:
        print(f"skill-metadata: {error}", file=sys.stderr)
        raise SystemExit(2)
