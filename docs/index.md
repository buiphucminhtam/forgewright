# Forgewright Documentation

> **Central documentation index for Forgewright v8.7+**

Welcome to Forgewright — an adaptive orchestrator with 56+ AI skills covering the full software development lifecycle.

## Quick Navigation

| Getting Started | Core Concepts | Reference |
|-----------------|---------------|-----------|
| [Quickstart Guide](quickstart.md) | [Mode Reference](mode-reference.md) | [Skill Catalog](skill-catalog.md) |
| [Architecture Overview](architecture.md) | [Pipeline Reference](pipeline-reference.md) | [Protocol Reference](protocol-reference.md) |

## By Category

### Getting Started
- **[Quickstart Guide](quickstart.md)** — Get up and running with Forgewright in 5 minutes
- **[Setup Guide](SETUP.md)** — Detailed installation instructions
- **[Configuration Guide](SETUP-REFERENCE.md)** — Configure Forgewright for your project

### Core Concepts
- **[Mode Reference](mode-reference.md)** — 24 execution modes explained
- **[Skill Catalog](skill-catalog.md)** — All skills with descriptions and use cases
- **[Pipeline Reference](pipeline-reference.md)** — INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN

### Architecture
- **[Architecture Overview](architecture.md)** — System design and component interactions
- **[Protocol Reference](protocol-reference.md)** — 40+ shared protocols indexed

### Migration & Troubleshooting
- **[Migration Guide](migration/v8-to-v9.md)** — Upgrade from v8 to v9
- **[Breaking Changes](migration/breaking-changes.md)** — What's changed in v9
- **[Common Issues](troubleshooting/common-issues.md)** — Solutions to frequent problems
- **[Debugging Guide](troubleshooting/debugging.md)** — Debug Forgewright issues

## What's New in v8.7

| Feature | Description |
|---------|-------------|
| **Skill Consolidation** | Reduced from 70 to 55 skills for easier learning |
| **Fast-Path Scoring** | Simple requests skip full plan quality scoring |
| **Fuzzy Mode Detection** | Better routing for vague requests |
| **Skill Versioning** | Version control for skills with rollback capability |

## By Role

### For Developers
1. Read the [Quickstart Guide](quickstart.md)
2. Understand [Modes](mode-reference.md)
3. Browse [Skill Catalog](skill-catalog.md)

### For Architects
1. Study the [Architecture Overview](architecture.md)
2. Review [Protocol Reference](protocol-reference.md)
3. Understand [Pipeline Reference](pipeline-reference.md)

### For DevOps
1. Read the [Setup Guide](SETUP.md)
2. Configure via [Setup Reference](SETUP-REFERENCE.md)
3. Check [CI/CD Integration](CI-CD.md)

## Search

To search the documentation:

```bash
# Search all docs
grep -r "keyword" docs/

# Search with context
grep -rn "pattern" docs/ --include="*.md"
```

## Contributing to Docs

See the [Technical Writer skill](../skills/technical-writer/SKILL.md) for documentation standards and contribution guidelines.

## Version

Current version: **8.7.0**
Last updated: 2026-05-29

---

*For questions or feedback, open an issue on GitHub.*
