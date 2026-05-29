# Troubleshooting Guide

> **Status: Placeholder** — Content to be added.

## Common Issues

### Forgewright not responding

1. Check that `CLAUDE.md` or `AGENTS.md` exists in project root
2. Verify MCP server is running: `bash scripts/forgewright-mcp-setup.sh --check`
3. Check session health: `python3 scripts/memory-middleware.py status`

### Wrong mode selected

Add more context to your request. See [Mode Reference](mode-reference.md) for mode descriptions.

### Skills not loading

1. Check skill directory: `ls skills/`
2. Run health check: `bash scripts/skill-health.sh check`
3. Verify skill schema: each skill needs `SKILL.md`

### Memory issues

Run memory middleware:
```bash
python3 scripts/memory-middleware.py status
python3 scripts/memory-middleware.py checkpoint
```

### Plan quality score low

See [Research Gate](../skills/_shared/protocols/research-gate.md) for improving plan scores.

### GitNexus index stale

```bash
npx gitnexus analyze
```

## Getting Help

- [Common Issues](common-issues.md) — Detailed solutions
- [GitHub Issues](https://github.com/buiphucminhtam/forgewright/issues)

---

*Last updated: 2026-05-29*
