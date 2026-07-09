# `.forgewright/` — Project Intelligence Directory

This directory stores Forgewright's project-level state, configuration, and runtime artifacts.

## Directory Structure

| Path | Purpose | Git Status |
|------|---------|------------|
| `config/` | Project configuration | Committed |
| `memory-bank/` | Persistent memory files (activeContext, handover) | Committed |
| `memory.db` | SQLite memory database | Committed |
| `mcp-server/` | MCP server runtime (`node_modules/` gitignored) | Partial |
| `schemas/` | JSON schemas for manifest validation | Committed |
| `subagent-context/` | Inter-agent communication state | Committed |
| `skills-config.json` | Skill configuration and feature flags | Committed |
| `project-profile.json` | Project fingerprint, health, patterns, risk | Committed |
| `code-conventions.md` | Detected coding patterns for consistency | Committed |

## Gitignored (Generated / Ephemeral)

| Path | Purpose |
|------|---------|
| `mcp-server/node_modules/` | Vendored npm dependencies (~3,700 files) |
| `memory.db-wal`, `memory.db-shm` | SQLite WAL journal files |
| `session-log.json` | Session history |
| `quality-history.json` | Quality score trending |
| `quality-report-*.json` | Per-session quality reports |
| `baseline-*.json` | Brownfield test baselines |
| `change-manifest-*.json` | File change tracking |
| `logs/` | Runtime log files |
| `metrics/` | Collected metrics |
| `reports/` | Generated reports |
| `cache/` | Temporary caches |

## Notes

- Run `npm install` inside `mcp-server/` to restore vendored dependencies after cloning.
- The `memory.db` file is a SQLite database; use `scripts/mem0-v2.py` to interact with it.
- See `skills/_shared/protocols/session-lifecycle.md` for session state management.
