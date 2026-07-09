#!/usr/bin/env python3
"""
Goal Evaluator - Checks if goal conditions are met.

Inspired by Claude Code /goal evaluator.
"""

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Literal

GoalResult = Literal["met", "not_met", "unknown"]


def run_command(cmd: str) -> tuple[int, str, str]:
    """Run shell command and return (exit_code, stdout, stderr)."""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=60
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Command timed out"
    except Exception as e:
        return -1, "", str(e)


def evaluate_condition(condition: str, context: str = "") -> tuple[GoalResult, str]:
    """
    Evaluate if a goal condition has been met.

    Args:
        condition: The goal condition string
        context: Additional context (recent outputs, file states)

    Returns:
        (result, reason) tuple
    """

    # Parse condition components
    condition_lower = condition.lower()

    # === TEST-BASED CONDITIONS ===

    # "all tests pass" / "tests pass"
    if "test" in condition_lower and (
        "pass" in condition_lower or "passing" in condition_lower
    ):
        return evaluate_tests(condition, context)

    # "lint is clean" / "lint passes"
    if "lint" in condition_lower and (
        "clean" in condition_lower or "pass" in condition_lower
    ):
        return evaluate_lint(condition, context)

    # === FILE-BASED CONDITIONS ===

    # "N files" / "file count"
    file_match = re.search(
        r"(\d+)\s+(?:new\s+)?(?:file|module|service)s?", condition_lower
    )
    if file_match:
        expected_count = int(file_match.group(1))
        return evaluate_file_count(condition, context, expected_count)

    # "no undocumented" / "all documented"
    if "document" in condition_lower:
        return evaluate_documentation(condition, context)

    # === BUILD-BASED CONDITIONS ===

    # "compiles" / "builds" / "build succeeds"
    if any(
        kw in condition_lower
        for kw in ["compiles", "builds", "build succeeds", "build pass"]
    ):
        return evaluate_build(condition, context)

    # === GIT-BASED CONDITIONS ===

    # "git status clean"
    if "git" in condition_lower and "clean" in condition_lower:
        return evaluate_git_status(condition, context)

    # === COVERAGE CONDITIONS ===

    if "coverage" in condition_lower:
        return evaluate_coverage(condition, context)

    # === DEFAULT: ASK FOR HELP ===

    return (
        "unknown",
        "Cannot auto-evaluate this condition type. Please verify manually.",
    )


def evaluate_tests(condition: str, context: str) -> tuple[GoalResult, str]:
    """Evaluate test-related conditions."""

    # Look for test command in condition
    cmd_match = re.search(r"`([^`]+)`", condition)
    if cmd_match:
        test_cmd = cmd_match.group(1)
    else:
        # Try common test commands
        if os.path.exists("pytest.ini") or os.path.exists("pyproject.toml"):
            test_cmd = "pytest --tb=short -q"
        elif os.path.exists("package.json"):
            test_cmd = "npm test 2>&1"
        elif os.path.exists("Makefile"):
            test_cmd = "make test 2>&1"
        else:
            return "unknown", "No recognized test framework found"

    exit_code, stdout, stderr = run_command(test_cmd)

    # Check for common pass indicators
    output = stdout + stderr
    pass_indicators = ["passed", "ok", "pass", "✓", "success", "0 failed"]  # noqa: F841
    fail_indicators = ["failed", "error", "fail", "✗", "1 failed", "2 failed"]  # noqa: F841

    # Parse pytest output
    pytest_match = re.search(r"(\d+)\s+passed", output)
    if pytest_match:
        passed = int(pytest_match.group(1))
        if exit_code == 0 and passed > 0:
            return "met", f"All {passed} tests passed"
        elif exit_code != 0:
            return "not_met", f"{passed} tests passed, but some failed"

    # Parse npm test output
    npm_match = re.search(r"Tests:\s+(\d+)\s+passed", output)
    if npm_match:
        passed = int(npm_match.group(1))
        if exit_code == 0:
            return "met", f"All {passed} tests passed"

    # Generic check
    if exit_code == 0:
        return "met", "Tests passed (exit code 0)"
    elif "0 failed" in output or "passed" in output.lower():
        return "met", "Tests appear to pass"
    else:
        return "not_met", f"Tests failed (exit code {exit_code})"


def evaluate_lint(condition: str, context: str) -> tuple[GoalResult, str]:
    """Evaluate lint-related conditions."""
    lint_cmd = None

    if os.path.exists("package.json"):
        # Check for lint script
        try:
            with open("package.json") as f:
                pkg = json.load(f)
                if "scripts" in pkg and "lint" in pkg["scripts"]:
                    lint_cmd = "npm run lint 2>&1"
        except Exception:  # noqa: E722
            pass

    if (
        not lint_cmd
        and os.path.exists(".eslintrc.js")
        or os.path.exists(".eslintrc.json")
    ):
        lint_cmd = "npx eslint . --max-warnings=0 2>&1"
    elif not lint_cmd and os.path.exists("pylintrc") or os.path.exists(".pylintrc"):
        lint_cmd = "pylint **/*.py 2>&1"

    if not lint_cmd:
        return "unknown", "No lint configuration found"

    exit_code, stdout, stderr = run_command(lint_cmd)

    if exit_code == 0:
        return "met", "Lint passed"
    else:
        return "not_met", "Lint found issues"


def evaluate_file_count(
    condition: str, context: str, expected: int
) -> tuple[GoalResult, str]:
    """Evaluate file count conditions."""
    # Extract path from condition
    path_match = re.search(r"in\s+([^\s]+)", condition)
    path = path_match.group(1) if path_match else "."

    if not os.path.exists(path):
        return "not_met", f"Path '{path}' does not exist"

    # Count files
    if os.path.isdir(path):
        count = sum(1 for _ in Path(path).rglob("*") if _.is_file())
    else:
        count = 1

    if count >= expected:
        return "met", f"Found {count} files (expected {expected})"
    else:
        return "not_met", f"Found {count} files, need {expected}"


def evaluate_documentation(condition: str, context: str) -> tuple[GoalResult, str]:
    """Evaluate documentation conditions."""
    # Check for undocumented items
    # This is a simplified version - real implementation would parse code

    output = context + "\n" if context else ""  # noqa: F841

    # Check for TODO/FIXME comments that indicate missing docs
    exit_code, stdout, _ = run_command(
        "grep -r 'TODO.*doc' --include='*.py' --include='*.js' --include='*.ts' . 2>/dev/null | head -5"
    )

    if exit_code != 0:  # No TODO doc comments found
        return "met", "No undocumented items found"
    else:
        return "not_met", "Some items may be undocumented"


def evaluate_build(condition: str, context: str) -> tuple[GoalResult, str]:
    """Evaluate build conditions."""
    build_cmd = None

    if os.path.exists("package.json"):
        build_cmd = "npm run build 2>&1"
    elif os.path.exists("Makefile"):
        build_cmd = "make build 2>&1"
    elif os.path.exists("Dockerfile"):
        build_cmd = "docker build -t test . 2>&1"

    if not build_cmd:
        return "unknown", "No build command found"

    exit_code, stdout, stderr = run_command(build_cmd)

    if exit_code == 0:
        return "met", "Build succeeded"
    else:
        return "not_met", f"Build failed (exit code {exit_code})"


def evaluate_git_status(condition: str, context: str) -> tuple[GoalResult, str]:
    """Evaluate git status conditions."""
    exit_code, stdout, stderr = run_command("git status --porcelain")

    if exit_code != 0:
        return "unknown", "Git not available or not a git repo"

    if stdout.strip():
        return "not_met", f"Git has uncommitted changes:\n{stdout}"
    else:
        return "met", "Git working directory is clean"


def evaluate_coverage(condition: str, context: str) -> tuple[GoalResult, str]:
    """Evaluate coverage conditions."""
    # Extract percentage
    pct_match = re.search(r"coverage?\s*>\s*(\d+)%?", condition)
    if not pct_match:
        pct_match = re.search(r"(\d+)%?\s*coverage", condition)

    if not pct_match:
        return "unknown", "Could not parse coverage threshold"

    threshold = int(pct_match.group(1))

    # Try to find coverage output
    coverage_file = Path(".coverage")
    if coverage_file.exists():
        try:
            with open(coverage_file) as f:
                content = f.read()
            # Parse coverage report
            total_match = re.search(r"TOTAL\s+\d+\s+\d+\s+(\d+)%", content)
            if total_match:
                actual = int(total_match.group(1))
                if actual >= threshold:
                    return "met", f"Coverage {actual}% (threshold: {threshold}%)"
                else:
                    return "not_met", f"Coverage {actual}% (need {threshold}%)"
        except Exception:  # noqa: E722
            pass

    return "unknown", "No coverage report found"


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: goal-evaluate.py '<condition>'")
        sys.exit(1)

    condition = " ".join(sys.argv[1:])
    result, reason = evaluate_condition(condition)

    print(
        json.dumps(
            {"result": result, "reason": reason, "condition": condition}, indent=2
        )
    )
