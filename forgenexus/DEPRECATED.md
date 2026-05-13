# ForgeNexus Deprecation Notice

> **Status:** DEPRECATED - As of v9.0, ForgeNexus has been replaced by GitNexus.

## Why Deprecated?

| Aspect | GitNexus | ForgeNexus |
|--------|----------|------------|
| Installation | `npm install -g gitnexus` | Manual submodule |
| Setup | `gitnexus setup` (auto) | Manual config |
| Community | 38K+ stars | Internal only |
| Editors | Claude, Cursor, Codex, Windsurf, OpenCode | Claude, Cursor only |

## Migration

If you're using ForgeNexus, migrate to GitNexus:

```bash
# 1. Install GitNexus
npm install -g gitnexus

# 2. Setup for all editors
gitnexus setup

# 3. Analyze projects
gitnexus analyze

# 4. Update references in AGENTS.md/CLAUDE.md
# Change forgenexus_* to gitnexus_*
```

## Backward Compatibility

ForgeNexus scripts and launchers are kept for rollback purposes but will be removed in a future version.

### What Still Works

- `forgenexus-mcp-launcher.sh` - Still functional, but deprecated
- `forgenexus/` directory - Still contains code
- Legacy `.forgenexus/` indexes - Still readable

### What to Update

| File | Change |
|------|--------|
| `AGENTS.md` | `forgenexus_*` → `gitnexus_*` |
| `CLAUDE.md` | `forgenexus_*` → `gitnexus_*` |
| `~/.cursor/mcp.json` | Remove forgenexus entry |
| Claude Desktop config | Remove forgenexus entry |

## Support

For issues or questions:
- **GitNexus Discord:** https://discord.gg/MgJrmsqr62
- **GitNexus Docs:** https://abhigyanpatwari-gitnexus.mintlify.app

## Timeline

| Version | Status |
|---------|--------|
| v8.x | ForgeNexus deprecated, GitNexus recommended |
| v9.0 | ForgeNexus launchers removed |
| v10.0 | ForgeNexus directory removed |
