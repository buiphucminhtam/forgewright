# Skill Versioning Protocol

> **Purpose:** Track and manage skill versions for rollback capability and compatibility.

## Overview

Skills use semantic versioning (semver) to track changes:

```
MAJOR.MINOR.PATCH
     │    │    └── PATCH: Bug fixes, documentation updates
     │    └────────── MINOR: New features, backward-compatible changes
     └──────────────── MAJOR: Breaking changes, restructuring
```

## VERSION File Schema

Each skill directory should contain a `VERSION` file:

```yaml
version: "2.3.1"
released: "2026-05-29"
changelog:
  - "2.3.1: Fixed test generation edge case"
  - "2.3.0: Added Rust support"
  - "2.2.0: Improved error handling"
breakingChanges:
  - "2.0.0: Removed deprecated auth pattern"
dependencies:
  - orchestrator: ">=8.7.0"
  - protocol: ">=1.2.0"
```

## Version Control Workflow

### Before Making Changes

```bash
# 1. Create a backup
bash scripts/skill-backup.sh <skill-name>

# 2. Check current version
cat skills/<skill-name>/VERSION

# 3. Determine next version
# - Bug fix only? → PATCH increment
# - New feature? → MINOR increment
# - Breaking change? → MAJOR increment
```

### After Making Changes

```bash
# 1. Update VERSION file
# 2. Commit with version tag
git add skills/<skill-name>/
git commit -m "skills/<skill-name>: v2.3.1 - Fixed test generation edge case"

# 3. Tag the release
git tag -a skills/<skill-name>/v2.3.1 -m "Release <skill-name> v2.3.1"
```

### Rolling Back

```bash
# 1. List available versions
bash scripts/skill-rollback.sh --list <skill-name>

# 2. Rollback to previous version
bash scripts/skill-rollback.sh <skill-name>

# 3. Rollback to specific version
bash scripts/skill-rollback.sh <skill-name> 2.2.0
```

## Version Compatibility Matrix

| Skill Version | Forgewright Version | Compatible? |
|--------------|---------------------|--------------|
| 1.x.x | 8.x.x | ✅ Yes |
| 2.x.x | 8.7+ | ✅ Yes |
| 3.x.x | 9.0+ | ⚠️ May require update |

## Backup Directory Structure

```
.forgewright/backups/skills/<skill-name>/
├── 20260529_143022/     # Timestamp format: YYYYMMDD_HHMMSS
│   ├── VERSION
│   └── SKILL.md
├── 20260528_091500/
│   ├── VERSION
│   └── SKILL.md
└── ...
```

## Rolling Back a Skill

### Automatic Rollback (Previous Version)

```bash
bash scripts/skill-rollback.sh <skill-name>
```

### Specific Version Rollback

```bash
bash scripts/skill-rollback.sh <skill-name> 2.2.0
```

### Verification After Rollback

```bash
# 1. Check the VERSION file
cat skills/<skill-name>/VERSION

# 2. Verify files are correct
bash scripts/skill-backup.sh --verify <skill-name>

# 3. Test the skill
bash scripts/skill-health.sh <skill-name>
```

## Version Increment Guidelines

### When to Increment PATCH (2.3.0 → 2.3.1)

- Bug fixes
- Documentation improvements
- Typo corrections
- Minor code refactoring without behavior change

### When to Increment MINOR (2.3.0 → 2.4.0)

- New features added
- New examples or templates
- New protocol references
- Improved error messages
- Performance improvements

### When to Increment MAJOR (2.3.0 → 3.0.0)

- Removing deprecated features
- Changing skill behavior
- Renaming required parameters
- Changing output format
- Consolidating with other skills

## Deprecation Policy

### Adding Deprecations

When deprecating a feature or parameter:

```yaml
deprecations:
  - version: "2.3.0"
    feature: "old-parameter"
    replacement: "new-parameter"
    removalVersion: "3.0.0"
    warning: "Use new-parameter instead. old-parameter will be removed in v3.0.0"
```

### Removing Deprecated Features

```yaml
breakingChanges:
  - version: "3.0.0"
    removed: "old-parameter"
    reason: "Replaced by new-parameter in v2.3.0"
    migration: "Update to new-parameter. See migration guide."
```

## Version Migration Guide

### Upgrading from v1.x to v2.x

1. Check breaking changes list
2. Update skill references in orchestrator
3. Test all mode routing
4. Update VERSION files

### Consolidating Skills (v9.0)

When consolidating skills:

```yaml
consolidation:
  version: "1.0.0"
  sources:
    - software-engineer: "2.x.x"
    - frontend-engineer: "2.x.x"
  mergedInto: "fullstack-engineer"
  aliases:
    - software-engineer  # Deprecated, redirects to fullstack-engineer
    - frontend-engineer  # Deprecated, redirects to fullstack-engineer
```

## Automation

### Git Pre-Commit Hook

Add this to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
# Check if VERSION file was modified
if git diff --cached --name-only | grep -q "skills/.*/VERSION"; then
    echo "VERSION file staged. Ensure changelog is updated."
fi
```

### CI/CD Integration

```yaml
# In your CI pipeline
- name: Check version consistency
  run: |
    for skill in skills/*/; do
      version=$(grep '^version:' "$skill/VERSION" | cut -d'"' -f2)
      if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "Invalid version in $skill: $version"
        exit 1
      fi
    done
```

## Best Practices

1. **Always backup before changes** — `bash scripts/skill-backup.sh <skill>`
2. **Update VERSION after changes** — Don't forget changelog entries
3. **Tag releases** — Use git tags for version tracking
4. **Test after rollback** — Verify skill still works
5. **Document breaking changes** — Clear migration paths

---

**Protocol Version:** 1.0
**Last Updated:** 2026-05-29
