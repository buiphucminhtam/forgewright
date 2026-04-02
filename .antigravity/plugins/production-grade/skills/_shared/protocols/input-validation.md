# Input Validation & Graceful Degradation Protocol

**Every skill MUST validate its inputs before starting work.** This prevents skills from failing silently or producing incomplete outputs when upstream artifacts are missing.

## Step 1: Read Configuration

```bash
# Read project config if present
cat .production-grade.yaml 2>/dev/null
```

If `.production-grade.yaml` exists, use its `paths.*` values for all file lookups. If not, use the default paths documented in each skill.

## Step 2: Probe Inputs in Parallel

Issue parallel find_by_name/view_file calls for all expected inputs. Do NOT read inputs one by one sequentially.

```
# Example: probe all inputs at once
find_by_name("*.md", "docs/architecture/")
find_by_name("*.yaml", "api/openapi/")
find_by_name("*", "schemas/")
find_by_name("*", "services/")
view_file(".production-grade.yaml")
```

## Step 3: Classify Missing Inputs

For each expected input, classify into one of three categories:

| Classification | Criteria | Action |
|---------------|----------|--------|
| **Critical** | Skill cannot produce meaningful output without this input | Stop. Use notify_user to ask user where the input is or whether to skip this skill. |
| **Degraded** | Skill can produce partial output but some sections will be incomplete | Log the gap. Print a warning. Continue with partial scope. Mark affected sections as `[DEGRADED: <input> not found]`. |
| **Optional** | Nice-to-have input that enriches output but is not necessary | Skip silently. Do not mention to user. |

## Step 4: Print Gap Summary

Before starting work, print a summary of input status:

```
━━━ Input Validation ━━━━━━━━━━━━━━━━━━━━━━
✓ Architecture docs found (12 files)
✓ API contracts found (3 specs)
⚠ Frontend code not found — skipping frontend-related analysis
✓ Test suites found (45 files)
✗ BRD not found — cannot proceed without requirements

Scope: Full analysis minus frontend coverage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Step 5: Adapt Scope

Based on what's available:
- Reduce scope for missing optional/degraded inputs
- Adjust output sections to reflect actual coverage
- Never fabricate content for missing inputs — use placeholders
- Document what was skipped and why in the skill's workspace output
