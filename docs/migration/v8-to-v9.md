# Migration Guide: v8.x to v9.0

> **Upgrading Forgewright from v8.x to v9.0**

## What's New in v9.0

| Feature | Description | Breaking? |
|---------|-------------|-----------|
| Skill Consolidation | 70 → 55 skills | ⚠️ Deprecated skill names |
| Fast-Path Scoring | Skip full scoring for simple requests | ❌ No |
| Fuzzy Mode Detection | Better routing | ❌ No |
| Skill Versioning | Version control for skills | ❌ No |

## Breaking Changes

### Skill Name Changes

These skills have been consolidated or renamed:

| Old Name | New Name | Action Required |
|----------|----------|----------------|
| `software-engineer` | `fullstack-engineer` | Auto-redirects (until v9.1) |
| `frontend-engineer` | `fullstack-engineer` | Auto-redirects (until v9.1) |
| `debugger` | `code-quality-engineer` | Auto-redirects (until v9.1) |
| `code-reviewer` | `code-quality-engineer` | Auto-redirects (until v9.1) |
| `qa-engineer` | `code-quality-engineer` | Auto-redirects (until v9.1) |

### Backward Compatibility

All deprecated skill names still work via the alias loader. You'll see a warning:

```
⚠️ WARNING: software-engineer is deprecated, using fullstack-engineer
   This alias will be removed in v9.0
```

### Migration Steps

#### 1. Update Skill References

In your code and configuration, update skill references:

```bash
# Update skill names in your project
grep -r "software-engineer" . --include="*.yaml" --include="*.json"
grep -r "frontend-engineer" . --include="*.yaml" --include="*.json"
grep -r "debugger" . --include="*.yaml" --include="*.json"
grep -r "code-reviewer" . --include="*.yaml" --include="*.json"
grep -r "qa-engineer" . --include="*.yaml" --include="*.json"
```

#### 2. Update Alias Loader (if used)

If you have custom integrations with the alias loader:

```bash
# Old configuration
skillAliases:
  - software-engineer
  - frontend-engineer

# New configuration
skillAliases: []  # Deprecated, use new names
```

#### 3. Verify Configuration

```bash
# Check your configuration
cat .production-grade.yaml

# Verify skills are accessible
bash skills/_shared/skill-alias-loader.sh --list
```

## New Features to Explore

### Fast-Path Scoring

Simple requests now skip full plan quality scoring:

```yaml
# In .production-grade.yaml
planQuality:
  fastPath:
    enabled: true
    maxSteps: 5
    maxComplexity: 3
```

### Skill Versioning

Skills now have version control:

```bash
# Backup a skill before changes
bash scripts/skill-backup.sh fullstack-engineer

# Rollback if needed
bash scripts/skill-rollback.sh fullstack-engineer
```

### Improved Mode Detection

Fuzzy matching improves routing for vague requests. No configuration needed.

## Testing After Migration

1. **Test mode detection:**
   ```
   "build a SaaS" → Should detect Full Build
   "add login" → Should detect Feature
   ```

2. **Test skill loading:**
   ```
   Request a software-engineer task → Should auto-redirect to fullstack-engineer
   ```

3. **Test backward compatibility:**
   ```
   Use old skill names → Should work with deprecation warning
   ```

## Rollback (if needed)

If you need to rollback to v8.x:

```bash
git checkout v8.7.0
git submodule update --init
```

## Getting Help

- **Documentation:** [docs/index.md](../index.md)
- **Breaking Changes:** [breaking-changes.md](breaking-changes.md)
- **GitHub Issues:** [Open an issue](https://github.com/buiphucminhtam/forgewright/issues)

---

*Migration Guide version: 1.0 | Created: 2026-05-29*
