#!/usr/bin/env python3
"""Deterministic, non-LLM AI-slop gate for Forgewright.

Checks structural, hygiene, and documentation-integrity signals associated with
LLM-generated slop (SlopCodeBench structural erosion, silent error swallowing,
duplicate scripts, personal-path leaks, broken relative links, INDEX.md drift,
and boilerplate LITE.md overlays).

Usage:
    python3 scripts/ci/slop-check.py [--root .] [--json] [--strict-metrics]
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any

PLACEHOLDER_USER_PREFIXES = (
    "/users/you",
    "/users/username",
    "/users/user",
    "/users/alice",
    "/users/dev",
    "/users/name",
    "/users/example",
    "/users/test",
    "/users/<",
)
PERSONAL_PATH_RE = re.compile(r"/Users/[a-zA-Z0-9._-]+/[^\s\x22\x27<>`)]*")
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)#\s]+)")
EMPTY_JS_CATCH_RE = re.compile(r"catch\s*(?:\([^)]*\))?\s*\{\s*(?://[^\n]*)?\s*\}")
CORRUPT_TRIGGER_RE = re.compile(r"^(?:Nd|Creen|Ject|Ader|Ken)\b")

FORBIDDEN_TRACKED_PREFIXES = (
    ".obsidian/",
    ".forge17/",
    ".agent/state/",
    ".forgewright/verify/",
    ".forgewright/recipes/",
    "forgenexus/",
    "skills/generated/",
)
FORBIDDEN_TRACKED_EXACT = frozenset(
    {
        ".forgewright/rule-ledger.jsonl",
        ".forgewright/marketing-insights.md",
        ".forgewright/goal-progress.md",
        ".forgewright/code-reviewer/review-report.md",
    }
)
PERSONAL_PATH_EXEMPT_PREFIXES = (
    "tests/fixtures/",
    "antigravity/planning/",
    "docs/plans/",
    "docs/improvement-plan-v9.md",
    "docs/chat-interpreter-test-results.md",
)


def _tracked_files(root: Path) -> list[str]:
    res = subprocess.run(
        ["git", "ls-files"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    if res.returncode == 0:
        return list(dict.fromkeys(line for line in res.stdout.splitlines() if line.strip()))
    return [
        p.relative_to(root).as_posix()
        for p in root.rglob("*")
        if p.is_file() and ".git" not in p.parts and "node_modules" not in p.parts
    ]


def _calc_cyclomatic_complexity(node: ast.AST) -> int:
    cc = 1
    for child in ast.walk(node):
        if isinstance(
            child,
            (
                ast.If,
                ast.For,
                ast.AsyncFor,
                ast.While,
                ast.ExceptHandler,
                ast.With,
                ast.AsyncWith,
                ast.IfExp,
                ast.Match,
            ),
        ):
            cc += 1
        elif isinstance(child, ast.BoolOp):
            cc += len(child.values) - 1
        elif isinstance(child, ast.comprehension):
            cc += 1 + len(child.ifs)
    return cc


def check_forbidden_tracked(tracked: list[str]) -> list[str]:
    findings: list[str] = []
    for rel in tracked:
        if rel in FORBIDDEN_TRACKED_EXACT or rel.startswith(FORBIDDEN_TRACKED_PREFIXES):
            findings.append(f"forbidden runtime/personal tracked file: {rel}")
        elif rel.endswith("/.DS_Store") or rel == ".DS_Store":
            findings.append(f"tracked macOS metadata file: {rel}")
    return findings


def check_personal_path_leaks(root: Path, tracked: list[str]) -> list[str]:
    findings: list[str] = []
    scan_exts = {".md", ".json", ".yaml", ".yml", ".py", ".sh", ".ts", ".js", ".mjs", ".toml"}
    for rel in tracked:
        if rel.startswith(PERSONAL_PATH_EXEMPT_PREFIXES):
            continue
        path = root / rel
        if path.suffix not in scan_exts or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for hit in sorted(set(PERSONAL_PATH_RE.findall(text))):
            low = hit.lower()
            if any(low.startswith(prefix) for prefix in PLACEHOLDER_USER_PREFIXES):
                continue
            findings.append(f"hardcoded personal path in {rel}: {hit}")
    return findings


def check_duplicate_code_files(root: Path, tracked: list[str]) -> list[str]:
    findings: list[str] = []
    code_exts = {".py", ".sh", ".js", ".mjs", ".cjs", ".ts"}
    by_hash: dict[str, list[str]] = defaultdict(list)
    for rel in tracked:
        if rel.startswith(("tests/", "templates/", "evals/")):
            continue
        path = root / rel
        if path.suffix not in code_exts or not path.is_file():
            continue
        if path.stat().st_size < 500:
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        by_hash[digest].append(rel)
    for files in by_hash.values():
        if len(files) > 1:
            findings.append("duplicate code files: " + " == ".join(sorted(files)))
    return sorted(findings)


def check_skill_index(root: Path) -> list[str]:
    findings: list[str] = []
    index_path = root / "kernel" / "INDEX.md"
    if not index_path.is_file():
        return ["missing kernel/INDEX.md"]
    indexed: set[str] = set()
    for line_no, line in enumerate(
        index_path.read_text(encoding="utf-8").splitlines(), 1
    ):
        if not line.startswith("| **"):
            continue
        match = re.match(
            r"^\|\s*\*\*([a-z0-9-]+)\*\*\s*\|\s*(.*?)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|$",
            line,
        )
        if not match:
            findings.append(f"kernel/INDEX.md malformed row at line {line_no}")
            continue
        name, trigger, _label, rel_target = match.groups()
        indexed.add(name)
        trig = trigger.strip()
        if not trig or trig in {">", "|", ">-", "|-"} or CORRUPT_TRIGGER_RE.match(trig):
            findings.append(f"kernel/INDEX.md corrupted trigger for {name}: {trig!r}")
        if not (index_path.parent / rel_target.strip()).resolve().is_file():
            findings.append(f"kernel/INDEX.md missing target for {name}: {rel_target!r}")
    skills_dir = root / "skills"
    if skills_dir.is_dir():
        for entry in sorted(skills_dir.iterdir()):
            if entry.is_dir() and entry.name not in {"_shared", "_test", "generated"}:
                if (entry / "LITE.md").is_file() and entry.name not in indexed:
                    findings.append(f"kernel/INDEX.md missing skill {entry.name}")
    return findings


def check_broken_links(root: Path, tracked: list[str]) -> list[str]:
    findings: list[str] = []
    root_resolved = root.resolve()
    for rel in tracked:
        if not rel.endswith(".md"):
            continue
        if not (rel.startswith(("docs/", "kernel/")) or "/" not in rel):
            continue
        path = root / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        stripped = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
        for match in LINK_RE.finditer(stripped):
            target = match.group(1)
            if target.startswith(("http://", "https://", "mailto:", "file://", "#", "data:", "<")):
                continue
            if any(ch in target for ch in ("{", "}", "*", "$")):
                continue
            resolved = (path.parent / target).resolve()
            try:
                resolved.relative_to(root_resolved)
            except ValueError:
                continue
            if not resolved.exists():
                findings.append(f"broken relative link in {rel} -> {target}")
    return findings


def check_lite_overlays(root: Path, tracked: list[str]) -> list[str]:
    findings: list[str] = []
    for rel in tracked:
        if not (rel.startswith("skills/") and rel.endswith("/LITE.md")):
            continue
        path = root / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if "run the check command and paste output" in text:
            findings.append(f"boilerplate evidence placeholder in {rel}")
        if re.search(r"TARGET\s*\(docs/(?:review-comments|test-cases)\.md\)", text):
            findings.append(f"transient docs/ write instruction in {rel}")
    return findings


def check_python_hygiene(
    root: Path, tracked: list[str], *, max_loc: int = 120, max_cc: int = 25
) -> tuple[list[str], dict[str, Any]]:
    hard_errors: list[str] = []
    god_funcs: list[dict[str, Any]] = []
    high_cc_funcs: list[dict[str, Any]] = []
    for rel in tracked:
        if not rel.endswith(".py") or rel.startswith("tests/"):
            continue
        path = root / rel
        if not path.is_file():
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), filename=rel)
        except SyntaxError as exc:
            hard_errors.append(f"python syntax error in {rel}: {exc}")
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ExceptHandler) and node.type is None:
                hard_errors.append(f"bare except in {rel}:{node.lineno}")
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                length = (node.end_lineno or node.lineno) - node.lineno + 1
                cc = _calc_cyclomatic_complexity(node)
                if length > max_loc:
                    god_funcs.append(
                        {"file": rel, "line": node.lineno, "name": node.name, "loc": length, "cc": cc}
                    )
                if cc > max_cc:
                    high_cc_funcs.append(
                        {"file": rel, "line": node.lineno, "name": node.name, "loc": length, "cc": cc}
                    )
    god_funcs.sort(key=lambda item: -item["loc"])
    high_cc_funcs.sort(key=lambda item: -item["cc"])
    return hard_errors, {
        "god_function_count": len(god_funcs),
        "high_cc_count": len(high_cc_funcs),
        "top_god_functions": god_funcs[:10],
        "top_high_cc_functions": high_cc_funcs[:10],
    }


def check_empty_js_catches(root: Path, tracked: list[str]) -> list[str]:
    findings: list[str] = []
    for rel in tracked:
        if rel.startswith(("tests/", "templates/", "evals/")):
            continue
        path = root / rel
        if path.suffix not in {".js", ".mjs", ".cjs", ".ts"} or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        count = len(EMPTY_JS_CATCH_RE.findall(text))
        if count:
            findings.append(f"{count} empty catch block(s) in {rel}")
    return findings


def run_audit(root: Path, *, strict_metrics: bool = False) -> dict[str, Any]:
    tracked = _tracked_files(root)
    errors: list[str] = []
    warnings: list[str] = []

    errors.extend(check_forbidden_tracked(tracked))
    errors.extend(check_personal_path_leaks(root, tracked))
    errors.extend(check_duplicate_code_files(root, tracked))
    errors.extend(check_skill_index(root))
    errors.extend(check_broken_links(root, tracked))
    errors.extend(check_lite_overlays(root, tracked))

    py_errors, py_metrics = check_python_hygiene(root, tracked)
    errors.extend(py_errors)

    js_empty = check_empty_js_catches(root, tracked)
    if strict_metrics:
        errors.extend(js_empty)
        if py_metrics["god_function_count"] > 0:
            errors.append(
                f"{py_metrics['god_function_count']} Python God functions (>120 LOC)"
            )
    else:
        warnings.extend(js_empty)

    return {
        "schema_version": "forgewright-slop-check/v1",
        "status": "fail" if errors else "pass",
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "metrics": py_metrics,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="Repository root to inspect.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON report.")
    parser.add_argument(
        "--strict-metrics",
        action="store_true",
        help="Also fail on legacy structural debt warnings.",
    )
    args = parser.parse_args()

    report = run_audit(args.root.resolve(), strict_metrics=args.strict_metrics)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(
            f"slop-check: {report['status'].upper()} "
            f"(errors={report['error_count']}, warnings={report['warning_count']}, "
            f"god_funcs={report['metrics']['god_function_count']}, "
            f"high_cc={report['metrics']['high_cc_count']})"
        )
        for err in report["errors"]:
            print(f"  [ERROR] {err}")
        for warn in report["warnings"][:15]:
            print(f"  [WARN]  {warn}")
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
