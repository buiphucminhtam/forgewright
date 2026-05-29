# Breaking Changes in v9.0

> **What's changed that might affect your workflows**

## Summary

v9.0 introduces **skill consolidation** and **improved routing**. Most changes are backward compatible.

## Breaking Changes

### 1. Skill Consolidation (v9.0)

**Impact:** Low  
**Migration Effort:** ~15 minutes

#### Deprecated Skills

| Deprecated Skill | Replacement | Auto-Redirect? |
|-----------------|-------------|-----------------|
| `software-engineer` | `fullstack-engineer` | ✅ Yes |
| `frontend-engineer` | `fullstack-engineer` | ✅ Yes |
| `debugger` | `code-quality-engineer` | ✅ Yes |
| `code-reviewer` | `code-quality-engineer` | ✅ Yes |
| `qa-engineer` | `code-quality-engineer` | ✅ Yes |

#### Deprecation Timeline

| Version | Status |
|---------|--------|
| v9.0 | Deprecated (with warnings) |
| v9.1 | Removed |

#### Action Required

Update skill references in your configuration files:

```yaml
# Old (deprecated, will show warnings)
skills:
  - software-engineer
  - frontend-engineer

# New (recommended)
skills:
  - fullstack-engineer
```

## Non-Breaking Changes

### 2. Fast-Path Scoring (v9.0)

**Impact:** None (opt-in via config)

Requests with <5 steps and complexity <3 now skip full plan quality scoring by default. No changes required.

To disable:

```yaml
planQuality:
  fastPath:
    enabled: false
```

### 3. Fuzzy Mode Detection (v9.0)

**Impact:** None (improvement)

Better mode detection for vague requests. No configuration changes required.

### 4. Skill Versioning (v9.0)

**Impact:** None (new feature)

Skills now have version tracking. Optional feature, no migration needed.

## Migration Checklist

- [ ] Update skill references from deprecated names to new names
- [ ] Test that auto-redirect still works
- [ ] Verify `.production-grade.yaml` is valid
- [ ] Test a few requests to confirm routing works

## Compatibility Matrix

| Component | v8.x Compatible? | v9.0 Compatible? |
|-----------|-------------------|-------------------|
| `.production-grade.yaml` | ✅ Yes | ✅ Yes |
| Skill configs | ✅ Yes | ✅ Yes |
| CLI scripts | ✅ Yes | ✅ Yes |
| MCP setup | ✅ Yes | ✅ Yes |

## Known Issues

None at release.

## Getting Help

If you encounter issues:

1. Check the [Migration Guide](v8-to-v9.md)
2. Run diagnostics: `bash scripts/forgewright-mcp-setup.sh --diagnose`
3. Open a [GitHub issue](https://github.com/buiphucminhtam/forgewright/issues)

---

*Breaking Changes version: 1.0 | Updated: 2026-05-29*
