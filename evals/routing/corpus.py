#!/usr/bin/env python3
"""Deterministic 100-task corpus for evaluating risk-based model routing."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Final


@dataclass(frozen=True)
class RoutingEvalTask:
    id: str
    category: str
    prompt: str
    expected_tier: str
    risk_signals: tuple[str, ...]


VALID_TIERS: Final[frozenset[str]] = frozenset({"scout", "builder", "expert"})
VALID_RISK_SIGNALS: Final[frozenset[str]] = frozenset(
    {
        "architecture",
        "concurrency",
        "public_api",
        "repeated_failure",
        "schema",
        "security",
    }
)


SCENARIOS: Final[dict[str, tuple[tuple[str, str, tuple[str, ...]], ...]]] = {
    "extraction": (
        ("List exported symbols in src/auth.ts.", "scout", ()),
        ("Extract package versions from package.json.", "scout", ()),
        ("Classify these log lines by severity.", "scout", ()),
        ("Summarize the changed filenames in this diff.", "scout", ()),
        ("Rank search results by exact identifier match.", "scout", ()),
        ("Convert this flat checklist to JSON.", "scout", ()),
        ("Identify duplicate headings in this document.", "scout", ()),
        ("Inventory test commands without running them.", "scout", ()),
        ("Extract API route names from this source excerpt.", "scout", ()),
        ("Group these files by extension.", "scout", ()),
    ),
    "documentation": (
        ("Fix grammar in one paragraph without changing meaning.", "scout", ()),
        ("Update a README command after a verified rename.", "builder", ()),
        ("Write release notes from this verified changelog.", "builder", ()),
        ("Add examples for an existing CLI flag.", "builder", ()),
        ("Summarize test evidence into a VERIFY block.", "scout", ()),
        ("Generate a table of existing configuration fields.", "scout", ()),
        ("Document error recovery for an existing command.", "builder", ()),
        ("Correct broken internal links in three docs.", "builder", ()),
        ("Create an ADR template with no product decision.", "builder", ()),
        ("Normalize headings in a single guide.", "scout", ()),
    ),
    "debug": (
        ("Fix an off-by-one error with a failing unit test.", "builder", ()),
        ("Trace a null dereference in one module.", "builder", ()),
        ("Repair JSON parsing while preserving valid behavior.", "builder", ()),
        ("Diagnose a flaky test caused by async ordering.", "expert", ("concurrency",)),
        ("Fix a path resolution bug in a CLI command.", "builder", ()),
        (
            "Find why a cache returns stale data after writes.",
            "expert",
            ("concurrency",),
        ),
        ("Repair an incorrect environment-variable fallback.", "builder", ()),
        ("Fix an error mapper with deterministic tests.", "builder", ()),
        (
            "Investigate a production-only authentication failure.",
            "expert",
            ("security",),
        ),
        (
            "Resolve a second failure after the same fix was retried.",
            "expert",
            ("repeated_failure",),
        ),
    ),
    "feature": (
        ("Add a bounded CLI output format option.", "builder", ()),
        ("Implement a private helper with unit tests.", "builder", ()),
        (
            "Add a new public API endpoint and response schema.",
            "expert",
            ("public_api", "schema"),
        ),
        ("Add pagination to an internal list function.", "builder", ()),
        ("Implement file hashing with missing-file handling.", "builder", ()),
        ("Add a database migration used by existing clients.", "expert", ("schema",)),
        ("Add an optional config flag with a safe default.", "builder", ()),
        (
            "Implement a background worker with ordering guarantees.",
            "expert",
            ("concurrency",),
        ),
        ("Add a deterministic report exporter.", "builder", ()),
        ("Expose a new package export consumed externally.", "expert", ("public_api",)),
    ),
    "refactor": (
        ("Extract duplicate formatting into a private helper.", "builder", ()),
        ("Split one internal module without changing exports.", "builder", ()),
        ("Rename a public method across multiple packages.", "expert", ("public_api",)),
        ("Move validation into a shared internal utility.", "builder", ()),
        (
            "Replace a public response type used by clients.",
            "expert",
            ("public_api", "schema"),
        ),
        ("Simplify a pure calculation with property tests.", "builder", ()),
        (
            "Refactor a lock manager while preserving fairness.",
            "expert",
            ("concurrency",),
        ),
        ("Remove dead private code proven unused.", "builder", ()),
        ("Consolidate two authentication middlewares.", "expert", ("security",)),
        ("Reorganize test helpers without production changes.", "builder", ()),
    ),
    "security": (
        ("Prevent path traversal in a file reader.", "expert", ("security",)),
        ("Remove shell injection from a command runner.", "expert", ("security",)),
        ("Implement JWT refresh-token rotation.", "expert", ("security", "public_api")),
        ("Redact API keys from logs.", "expert", ("security",)),
        ("Harden OAuth callback state validation.", "expert", ("security",)),
        (
            "Add authorization to an existing admin endpoint.",
            "expert",
            ("security", "public_api"),
        ),
        (
            "Change filesystem permissions for generated secrets.",
            "expert",
            ("security",),
        ),
        (
            "Validate webhook signatures and replay windows.",
            "expert",
            ("security", "concurrency"),
        ),
        (
            "Audit untrusted MCP tool output for prompt injection.",
            "expert",
            ("security",),
        ),
        ("Replace plaintext credential storage.", "expert", ("security", "schema")),
    ),
    "architecture": (
        (
            "Choose a canonical runtime across three control planes.",
            "expert",
            ("architecture",),
        ),
        (
            "Design a cross-repository contract registry.",
            "expert",
            ("architecture", "public_api"),
        ),
        (
            "Define service boundaries for a monolith split.",
            "expert",
            ("architecture",),
        ),
        (
            "Review a persistence strategy for concurrent writers.",
            "expert",
            ("architecture", "concurrency"),
        ),
        (
            "Design an API versioning and migration policy.",
            "expert",
            ("architecture", "public_api"),
        ),
        (
            "Select a consistency model for distributed state.",
            "expert",
            ("architecture", "concurrency"),
        ),
        (
            "Create a rollback-safe data migration design.",
            "expert",
            ("architecture", "schema"),
        ),
        ("Assess whether two runtimes should be retired.", "expert", ("architecture",)),
        (
            "Design tenant isolation for an agent platform.",
            "expert",
            ("architecture", "security"),
        ),
        (
            "Define event contracts shared by external consumers.",
            "expert",
            ("architecture", "public_api"),
        ),
    ),
    "concurrency": (
        (
            "Prevent lost updates in a file state repository.",
            "expert",
            ("concurrency",),
        ),
        (
            "Add idempotency to concurrent payment requests.",
            "expert",
            ("concurrency", "public_api"),
        ),
        (
            "Fix a race between cache invalidation and reads.",
            "expert",
            ("concurrency",),
        ),
        ("Implement bounded parallel worker scheduling.", "expert", ("concurrency",)),
        ("Preserve ordering in an async event pipeline.", "expert", ("concurrency",)),
        (
            "Add cancellation safety around resource cleanup.",
            "expert",
            ("concurrency",),
        ),
        (
            "Design a compare-and-swap state revision.",
            "expert",
            ("concurrency", "schema"),
        ),
        ("Fix deadlock risk across two locks.", "expert", ("concurrency",)),
        (
            "Make retry backoff safe under a thundering herd.",
            "expert",
            ("concurrency",),
        ),
        (
            "Guarantee one-time processing after worker restart.",
            "expert",
            ("concurrency",),
        ),
    ),
    "operations": (
        ("Pin a GitHub Action to an immutable commit.", "builder", ()),
        ("Add a deterministic package smoke test.", "builder", ()),
        ("Change production deployment permissions.", "expert", ("security",)),
        ("Add a required aggregate CI gate.", "builder", ()),
        (
            "Design zero-downtime database deployment.",
            "expert",
            ("schema", "architecture"),
        ),
        ("Generate an SBOM during release.", "builder", ()),
        ("Add rollback verification to a release workflow.", "builder", ()),
        ("Rotate signing credentials in CI.", "expert", ("security",)),
        ("Fix a deterministic cache key in CI.", "builder", ()),
        (
            "Change a protected-branch release policy.",
            "expert",
            ("public_api", "security"),
        ),
    ),
    "verification": (
        ("Run and summarize an existing unit test command.", "scout", ()),
        ("Write unit tests for a pure helper.", "builder", ()),
        ("Create a regression test for a parser bug.", "builder", ()),
        ("Verify package metadata fields deterministically.", "scout", ()),
        ("Add property tests for a calculation.", "builder", ()),
        ("Review security test coverage for authentication.", "expert", ("security",)),
        ("Check a generated file for deterministic drift.", "scout", ()),
        ("Add a concurrency stress test for state writes.", "expert", ("concurrency",)),
        ("Compare two live model runs with pinned metadata.", "builder", ()),
        (
            "Independently review a high-risk public API diff.",
            "expert",
            ("public_api",),
        ),
    ),
}


def build_corpus() -> tuple[RoutingEvalTask, ...]:
    """Build the frozen, local-only routing corpus.

    The assertions make a malformed hand-edited corpus fail immediately instead
    of silently weakening a shadow or canary evaluation.
    """
    corpus: list[RoutingEvalTask] = []
    for category, scenarios in SCENARIOS.items():
        for index, (prompt, tier, signals) in enumerate(scenarios, start=1):
            corpus.append(
                RoutingEvalTask(
                    id=f"{category}-{index:02d}",
                    category=category,
                    prompt=prompt,
                    expected_tier=tier,
                    risk_signals=signals,
                )
            )
    task_ids = [task.id for task in corpus]
    category_counts = {
        category: sum(task.category == category for task in corpus)
        for category in SCENARIOS
    }
    if len(corpus) != 100 or len(set(task_ids)) != len(corpus):
        raise RuntimeError("routing corpus must contain exactly 100 unique tasks")
    if len(category_counts) != 10 or set(category_counts.values()) != {10}:
        raise RuntimeError("routing corpus must contain 10 categories of 10 tasks")
    if any(task.expected_tier not in VALID_TIERS for task in corpus):
        raise RuntimeError("routing corpus contains an invalid expected tier")
    if any(not set(task.risk_signals).issubset(VALID_RISK_SIGNALS) for task in corpus):
        raise RuntimeError("routing corpus contains an invalid risk signal")
    return tuple(corpus)


def main() -> None:
    print(json.dumps([asdict(task) for task in build_corpus()], indent=2))


if __name__ == "__main__":
    main()
