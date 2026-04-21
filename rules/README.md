# Path-Scoped Coding Standards

> **Purpose:** Automatically enforce coding standards based on file location. When editing a file, the system loads and applies the relevant rule file.

## Directory Structure

```
rules/
├── README.md                    # This file
├── gameplay-standards.md         # src/gameplay/**
├── core-standards.md            # src/core/**
├── ui-standards.md              # src/ui/**, frontend/src/components/**
├── api-standards.md             # api/**, services/**
├── test-standards.md            # tests/**
└── doc-standards.md             # docs/**, design/**
```

## Rule File Format

Each rule file follows this structure:

```markdown
# [Category] Coding Standards — [Path Pattern]

[Description of what these rules apply to]

## Required

- [ ] List of required practices

## Forbidden

- [ ] List of forbidden practices

## Patterns

### Good

[Good code examples]

### Bad

[Bad code examples with fixes]

## Enforcement

[How to check and enforce these rules]

## Related Rules

[Links to related rule files]
```

## Path Matching

| Pattern | Matches | Rules File |
|---------|---------|------------|
| `src/gameplay/**` | Gameplay code | `gameplay-standards.md` |
| `src/core/**` | Core engine code | `core-standards.md` |
| `src/ui/**` | UI code | `ui-standards.md` |
| `frontend/src/**` | Frontend code | `ui-standards.md` |
| `api/**` | API endpoints | `api-standards.md` |
| `services/**` | Backend services | `api-standards.md` |
| `tests/**` | Test files | `test-standards.md` |
| `docs/**` | Documentation | `doc-standards.md` |
| `design/**` | Design docs | `doc-standards.md` |

## Guardrail Integration

When editing a file, the guardrail middleware:

```
1. Detect file path being edited
2. Match path to rule pattern
3. Load relevant rule file
4. Inject rule content into context
5. Before write:
   - Check for violations
   - Warn about violations
   - Suggest fixes
```

## Rule Priority

If a file matches multiple patterns (e.g., `tests/**` also matches `api/**`):
1. Most specific pattern wins
2. Parent directory patterns are inherited

Example: `services/api/tests/` matches `tests/**` (more specific)

## Creating New Rules

1. Create `rules/[category]-standards.md`
2. Follow the rule file format
3. Add to the path matching table
4. Update guardrail middleware if needed

## Enforcement Levels

| Level | Behavior |
|-------|----------|
| **Block** | Prevents the write operation |
| **Warn** | Shows warning but allows write |
| **Suggest** | Shows suggestion but no warning |

## Examples

### Creating a Gameplay System

```bash
# When you create src/gameplay/combat/MeleeAttack.cs:
# Guardrail loads gameplay-standards.md

⚠️ Warning: Magic number detected
   Rule: "All tunable values in data files"
   Found: health -= 10;
   Suggest: Use GameData.get_value("melee_damage")
```

### Creating an API Endpoint

```bash
# When you create api/users/create.ts:
# Guardrail loads api-standards.md

⚠️ Warning: Missing input validation
   Rule: "Input validation on all public endpoints"
   Suggest: Use schema validation middleware
```

## Related Protocols

- `skills/_shared/protocols/guardrail.md` — Guardrail middleware
- `skills/_shared/protocols/quality-gate.md` — Quality enforcement

## History

- v1.0 — Initial path-scoped rules (inspired by CCGS path rules)
