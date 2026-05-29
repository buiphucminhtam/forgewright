# CI/CD Integration

> **Status: Placeholder** — Content to be added.

## Overview

Forgewright can integrate with CI/CD pipelines for automated code quality checks, deployments, and testing.

## Available Scripts

| Script | Purpose |
|--------|---------|
| `scripts/skill-health.sh` | Validate all skills in CI |
| `scripts/dep-graph.sh --check-cycles` | Detect circular dependencies |
| `scripts/run-self-tests.sh` | Run self-test suite |
| `scripts/forgewright-session-tracker.sh` | Check plan quality history |

## GitHub Actions Integration

Example workflow — add to `.github/workflows/forgewright.yml`:

```yaml
name: Forgewright Health Check

on: [push, pull_request]

jobs:
  skill-health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run skill health check
        run: bash scripts/skill-health.sh check
      - name: Check circular dependencies
        run: bash scripts/dep-graph.sh check-cycles
```

## Pre-commit Hooks

See `.claude/hooks.yml` for pre-commit hooks that run on each message.

---

*Last updated: 2026-05-29*
