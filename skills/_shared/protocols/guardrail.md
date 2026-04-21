# Guardrail Protocol

> **Purpose:** Pre-authorize every tool call before execution. Blocks destructive operations, warns on sensitive access, and enforces scope discipline. Runs as Middleware ④ in the chain — the only middleware that can halt skill execution.

## When to Apply

- **Every tool call** during any skill execution
- **Every file write** during parallel dispatch workers
- **Every command execution** proposed by any skill
- **NOT applied** to read-only operations by default (configurable)

## Configuration

```yaml
# .production-grade.yaml
guardrail:
  enabled: true
  mode: warn            # warn | deny | disabled | dry_run
  log_all: false        # log every tool call (verbose, for debugging)
  escalate_to_user: true  # show WARN/DENY to user

  # Graduate from warn → deny after confirming no false positives
  # Recommended: run in warn mode for 5+ sessions, review logs, then switch to deny
  # dry_run: Enable Global Dry Run, blocks all writing tools, requires AI to generate diff patch only.
```

## Rule Categories

### 1. Destructive File Operations — DENY

Block operations that could cause irreversible data loss:

```
DENY Rules:
  - Pattern: rm -rf /
  - Pattern: rm -rf ~
  - Pattern: rm -rf /*
  - Pattern: rm -rf ./*  (in project root only — contextual)
  - Pattern: git push --force (without branch check)
  - Pattern: DROP TABLE / DROP DATABASE (SQL)
  - Pattern: truncate * (SQL)
  - Reason: "Destructive operation — manual confirmation required"
  - Action: BLOCK + notify user
```

### 2. Sensitive File Access — WARN

Alert on access to files containing secrets or credentials:

```
WARN Rules:
  - Pattern: *.env, *.env.*, .env.local, .env.production
  - Pattern: *.key, *.pem, *.cert, *.p12
  - Pattern: credentials/*, secrets/*, .ssh/*
  - Pattern: *password*, *secret*, *token* (in filenames)
  - Pattern: ~/.aws/*, ~/.gcp/*, ~/.azure/*
  - Scope: read AND write
  - Reason: "Accessing sensitive file — ensure no secrets are logged"
  - Action: LOG warning + continue (don't block reads)
```

### 3. Remote Code Execution — DENY

Block operations that download and execute remote code:

```
DENY Rules:
  - Pattern: curl * | sh
  - Pattern: curl * | bash
  - Pattern: wget * | sh
  - Pattern: eval($(curl *))
  - Pattern: npm install -g * (global installs — suggest local)
  - Reason: "Remote code execution — use explicit dependency management"
  - Action: BLOCK + suggest alternative
```

### 4. Publishing / Release — ESCALATE

Require explicit user approval for release operations:

```
ESCALATE Rules:
  - Pattern: npm publish
  - Pattern: docker push
  - Pattern: git tag + git push --tags
  - Pattern: helm install / helm upgrade (production namespace)
  - Pattern: terraform apply (without -plan)
  - Reason: "Publishing/release operation requires user approval"
  - Action: BLOCK + request approval via notify_user
```

### 5. Scope Enforcement — WARN/DENY

Prevent skills from modifying files outside their contracted scope:

```
Scope Rules (for parallel dispatch workers):
  - IF CONTRACT.json exists:
    - Check tool target path against contract.outputs
    - IF path NOT in outputs → DENY: "Outside contracted scope"
    - IF path in contract.forbidden → DENY: "Forbidden path"
  
  - IF protected_paths (from brownfield-safety):
    - Check tool target path against protected patterns
    - IF match + operation=MODIFY → DENY
    - IF match + operation=DELETE → DENY + ESCALATE
    - IF match + operation=CREATE → ALLOW (adding alongside is OK)
```

### 6. Dry Run Mode (Global Read-Only)

When `mode: dry_run` is set, Guardrail acts as an interceptor for all modifying operations. This allows the AI to plan and simulate changes without actually mutating the filesystem.

```
Dry Run Rules:
  - IF operation=READ (view_file, read_resource, etc.) → ALLOW
  - IF operation=WRITE (write_to_file, multi_replace_file_content) → WARN_DRYRUN_MOCK
  - IF operation=EXECUTE (run_command that mutates) → WARN_DRYRUN_MOCK
  - Reason: "Global Dry Run is enabled. File modification blocked."
  - Action: Intercept call, return simulated success `[DRY RUN] Thực thi thành công trong môi trường ảo`, and instruct the agent to generate a `.diff` patch artifact instead.
```

## Decision Matrix

| Rule Type | Read | Write | Execute | Delete |
|-----------|------|-------|---------|--------|
| **Normal files** | ALLOW | ALLOW | ALLOW | WARN |
| **Sensitive files** (.env, .key) | WARN | DENY | — | DENY |
| **Protected paths** (brownfield) | ALLOW | DENY | — | DENY+ESCALATE |
| **Contracted scope** (parallel) | ALLOW | DENY if outside | — | DENY |
| **Destructive commands** | — | — | DENY | — |
| **Publishing commands** | — | — | ESCALATE | — |
| **Dry Run Mode** | ALLOW | WARN_DRYRUN_MOCK | WARN_DRYRUN_MOCK | WARN_DRYRUN_MOCK |

## Response Format

```json
{
  "decision": "ALLOW | WARN | DENY | ESCALATE | WARN_DRYRUN_MOCK",
  "rule": "destructive-file-ops",
  "pattern": "rm -rf /",
  "matched": "rm -rf /var/data/",
  "reason": "Destructive operation — manual confirmation required",
  "suggestion": "Use targeted deletion: rm specific-file.txt",
  "timestamp": "ISO-8601"
}
```

### Event Emission on WARN_DRYRUN_MOCK

When `guardrail: mode: dry_run` is enabled, mutating tools are intercepted:

```json
{
  "type": "GUARDRAIL_DRYRUN",
  "skill_id": "qa-engineer",
  "tool": "write_to_file",
  "target": "src/auth.ts",
  "rule": "global-dry-run",
  "reason": "Global Dry Run is enabled. File modification blocked.",
  "timestamp": "ISO-8601"
}
```
*Note: The agent must intercept this and output the intended change as a `.diff` artifact instead of retrying the write operation.*

### Event Emission on DENY

When Guardrail returns DENY, it MUST emit a structured event via Middleware ⑧ (TaskTracking) before halting execution. This ensures `session-log.json` has a complete record:

```json
{
  "type": "GUARDRAIL_DENY",
  "skill_id": "qa-engineer",
  "tool": "run_command",
  "target": "rm -rf ./",
  "rule": "destructive-file-ops",
  "reason": "Destructive operation — manual confirmation required",
  "timestamp": "ISO-8601"
}
```

If the DENY causes the skill to fail entirely (no alternative path), also emit `SKILL_FAILED`:

```json
{
  "type": "SKILL_FAILED",
  "skill_id": "qa-engineer",
  "error_type": "guardrail_deny",
  "details": "Tool 'run_command' blocked by guardrail rule 'destructive-file-ops'",
  "retry_count": 0,
  "max_retries": 0,
  "timestamp": "ISO-8601"
}
```

## Logging

All guardrail decisions are logged to `.forgewright/guardrail-log.jsonl`:

```jsonl
{"timestamp":"2026-03-25T11:00:00Z","decision":"ALLOW","tool":"write_to_file","target":"src/auth.ts","skill":"software-engineer"}
{"timestamp":"2026-03-25T11:00:01Z","decision":"WARN","tool":"view_file","target":".env","skill":"software-engineer","rule":"sensitive-file-access"}
{"timestamp":"2026-03-25T11:00:05Z","decision":"DENY","tool":"run_command","target":"rm -rf ./","skill":"qa-engineer","rule":"destructive-file-ops"}
```

## Integration with Brownfield Safety

Guardrail (④) and BrownfieldSafety (⑦) provide **defense in depth**:

```
Layer 1 — Guardrail (pre-tool):
  → Blocks BEFORE the tool call is attempted
  → Pattern-based, fast (~2ms per check)
  → Catches obviously dangerous operations

Layer 2 — BrownfieldSafety (post-skill):
  → Validates AFTER the skill has run
  → Context-aware (checks regression, baselines)
  → Catches subtle issues (unexpected modifications, regressions)
```

## Custom Rules

Projects can define custom guardrail rules in `.production-grade.yaml`:

```yaml
guardrail:
  custom_rules:
    - name: no-direct-db-access
      pattern: "prisma db push"
      action: DENY
      reason: "Use migrations instead of db push in this project"
      suggestion: "npx prisma migrate dev --name <migration_name>"
    
    - name: warn-on-api-key-string
      pattern: "sk-[a-zA-Z0-9]{20,}"
      action: DENY
      scope: write
      reason: "API key detected in source code — use environment variables"
    
    - name: production-deploy-check
      pattern: "railway up --environment production"
      action: ESCALATE
      reason: "Production deployment requires explicit approval"
```

## Graceful Degradation

```
IF guardrail rule evaluation fails (regex error, config parse error):
  1. Log error: "⚠ Guardrail rule evaluation failed: [rule_name]"
  2. Default to ALLOW (fail-open for non-security rules)
  3. Default to DENY (fail-closed for security rules marked critical: true)
  4. Continue pipeline — NEVER block pipeline on guardrail internal error
```

## Path-Scoped Coding Standards (CCGS Pattern)

Automatically load and enforce coding standards based on file location. See `rules/README.md` for full documentation.

```
!`cat rules/README.md 2>/dev/null || echo "Rules directory not found — no path-scoped standards active"`
```

### Path-to-Rule Mapping

| Path Pattern | Rules File | Enforcement |
|--------------|------------|-------------|
| `src/gameplay/**` | `rules/gameplay-standards.md` | Warn |
| `src/core/**` | `rules/core-standards.md` | Warn |
| `src/ui/**` | `rules/ui-standards.md` | Warn |
| `frontend/src/**` | `rules/ui-standards.md` | Warn |
| `api/**` | `rules/api-standards.md` | Block |
| `services/**` | `rules/api-standards.md` | Block |
| `tests/**` | `rules/test-standards.md` | Warn |
| `docs/**` | `rules/doc-standards.md` | Suggest |

### Enforcement Flow

```
1. Before writing to file:
   - Detect file path
   - Match to rule pattern
   - Load relevant standards file
   - Inject standards into context

2. Check for violations:
   - Forbid patterns → BLOCK
   - Required patterns → WARN if missing
   - Forbidden patterns → WARN

3. Show violation:
   ⚠️ Path-Scoped Rule Violation
   File: src/gameplay/combat/MeleeAttack.cs
   Rule: gameplay-standards.md
   
   Found: health -= 10;
   Problem: Magic number detected
   
   Fix: Use GameData.get_value("melee_damage")
```
