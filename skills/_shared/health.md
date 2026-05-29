# Forgewright Skill Health Check Protocol

> **Version:** 1.0.0
> **Created:** 2026-05-29
> **Phase:** 3.3
> **Status:** Implementation

---

## Overview

The Skill Health Check Protocol defines automated validation procedures to ensure skill integrity, reliability, and consistency across the Forgewright ecosystem. It establishes severity levels, check categories, and remediation procedures.

---

## Severity Levels

| Level | Color | Description | Action Required |
|-------|-------|-------------|-----------------|
| **CRITICAL** | 🔴 | Skill is completely broken or missing essential files | Fix immediately, block release |
| **HIGH** | 🟠 | Skill has significant issues affecting functionality | Fix before next release |
| **MEDIUM** | 🟡 | Skill has minor issues or degraded functionality | Fix within 1 week |
| **LOW** | 🟢 | Cosmetic issues or optimization opportunities | Fix at convenience |

---

## Health Check Categories

### 1. Schema Validation (CRITICAL)

**What it checks:**
- `SKILL.md` exists and is readable
- Required frontmatter fields are present
- File structure matches expected schema

**Required Frontmatter Fields:**
```yaml
---
name: skill-name
description: One-line description
version: 1.0.0  # Optional
---
```

**Failure Conditions:**
- `SKILL.md` missing
- File not readable
- Empty or malformed content

**Remediation:**
```bash
# Auto-fix: Create minimal SKILL.md template
if [ ! -f "skills/$SKILL/SKILL.md" ]; then
    echo "# Skill: $SKILL" > "skills/$SKILL/SKILL.md"
fi
```

---

### 2. Dependency Validation (HIGH)

**What it checks:**
- Referenced skills in `skills/` directory exist
- Referenced protocols in `skills/_shared/protocols/` exist
- Referenced scripts in `scripts/` exist and are executable

**Detection Pattern:**
```bash
# Extract skill references from SKILL.md
grep -oE 'skills/[a-z-]+/SKILL\.md' SKILL.md

# Extract protocol references
grep -oE 'skills/_shared/protocols/[a-z-]+\.md' SKILL.md

# Extract script references
grep -oE 'scripts/[a-z0-9-]+\.sh' SKILL.md
```

**Failure Conditions:**
- Referenced skill does not exist
- Referenced protocol does not exist
- Referenced script does not exist or is not executable

**Remediation:**
1. Add missing skill/protocol/script
2. Update reference to valid path
3. If dependency is deprecated, create alias

---

### 3. Template Validation (MEDIUM)

**What it checks:**
- All templates referenced in SKILL.md exist
- Templates are valid markdown/structured content
- Template placeholders are properly formatted

**Template Format:**
```markdown
{% TEMPLATE: template-name %}
<!-- Template content -->
{% END TEMPLATE %}
```

**Detection Pattern:**
```bash
# Find template references
grep -oE '{% TEMPLATE: [a-z0-9-]+ %}' SKILL.md

# Check for broken references
grep -oE '\[\[template:([a-z0-9-]+)\]\]' SKILL.md
```

**Failure Conditions:**
- Referenced template does not exist
- Template file is empty
- Template has malformed content

---

### 4. Protocol Validation (MEDIUM)

**What it checks:**
- Referenced protocols exist and are valid markdown
- Protocol versions are compatible
- Protocol chain is properly defined

**Protocol Reference Format:**
```markdown
> **Protocol:** [protocol-name](skills/_shared/protocols/protocol-name.md)
```

**Failure Conditions:**
- Protocol file missing
- Protocol file malformed
- Protocol version incompatible

---

### 5. Script Validation (HIGH)

**What it checks:**
- Referenced scripts exist
- Scripts are executable (`chmod +x`)
- Scripts have valid bash syntax

**Detection Pattern:**
```bash
grep -oE '`[^`]*\.sh`' SKILL.md | sed 's/`//g'
```

**Validation Commands:**
```bash
# Check existence
[ -f "scripts/$SCRIPT" ]

# Check executable
[ -x "scripts/$SCRIPT" ]

# Check syntax
bash -n "scripts/$SCRIPT"
```

---

### 6. Mode Coverage Validation (CRITICAL)

**What it checks:**
- Every execution mode has at least one skill assigned
- Mode routing table is complete
- No orphaned modes

**Expected Modes (24 total):**

| Mode | Category |
|------|----------|
| Full Build | Engineering |
| Feature | Engineering |
| Debug | Engineering |
| Review | Engineering |
| Test | Engineering |
| Architect | Engineering |
| Design | Design |
| Mobile | Mobile |
| Game Build | Game |
| XR Build | XR |
| Ship | DevOps |
| Document | Technical Writing |
| Explore | Research |
| Research | Research |
| Optimize | Performance |
| Marketing | Growth |
| Grow | Growth |
| Analyze | Business |
| Prompt | AI |
| AI Build | AI |
| Migrate | Engineering |
| Autonomous | Meta |
| Goal | Meta |
| Custom | Meta |

**Failure Conditions:**
- Mode has no skill assigned
- Skill references non-existent mode
- Mode routing conflicts

---

## Health Check Report Format

```json
{
  "timestamp": "2026-05-29T00:00:00Z",
  "summary": {
    "total_skills": 68,
    "checked": 68,
    "passed": 65,
    "warnings": 2,
    "failures": 1,
    "health_score": 96.5
  },
  "details": [
    {
      "skill": "software-engineer",
      "status": "PASS",
      "checks": [
        { "name": "schema", "status": "PASS" },
        { "name": "dependencies", "status": "PASS" },
        { "name": "templates", "status": "PASS" }
      ]
    },
    {
      "skill": "example-skill",
      "status": "FAIL",
      "severity": "HIGH",
      "checks": [
        { "name": "schema", "status": "PASS" },
        { "name": "dependencies", "status": "FAIL", "reason": "Missing: skills/missing-skill" }
      ]
    }
  ],
  "recommendations": [
    {
      "skill": "example-skill",
      "action": "Add missing dependency: skills/missing-skill"
    }
  ]
}
```

---

## Implementation

See `scripts/skill-health.sh` for the automated implementation.

## Usage

```bash
# Run all health checks
./scripts/skill-health.sh

# Run specific check
./scripts/skill-health.sh --check schema
./scripts/skill-health.sh --check dependencies
./scripts/skill-health.sh --check coverage

# Generate report
./scripts/skill-health.sh --report json
./scripts/skill-health.sh --report markdown

# Fix auto-fixable issues
./scripts/skill-health.sh --fix
```

---

*Document Version: 1.0.0*
*Last Updated: 2026-05-29*
