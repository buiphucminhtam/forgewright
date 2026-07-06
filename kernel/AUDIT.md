# AUDIT — Requirement Coverage Check

After EXECUTE & VERIFY, before declaring success: re-read every changed file in full and compare against the original request.

## Template
```text
REQUIREMENT COVERAGE MATRIX:
| # | Requirement (from user request) | File(s) changed | Covered? | Evidence |
|---|------|------|------|------|
| 1 | ... | ... | ✅ / ⚠️ / ❌ | ... |

CONTRADICTION SCAN:
| File | Rule/instruction says | Example/template shows | Conflict? |
|---|---|---|---|
| ... | ... | ... | ✅ OK / ❌ CONFLICT |

CROSS-ENTRY CONSISTENCY: (if multiple files serve the same role)
| Concept | File A says | File B says | Aligned? |
|---|---|---|---|
| ... | ... | ... | ✅ / ❌ |

VERDICT: FULL COVERAGE | GAPS FOUND → fix before delivery
```

## Rules
1. Re-read changed files IN FULL (not diffs). An agent consumes the whole file.
2. Every numbered requirement from the user's request gets its own row.
3. If examples/templates contradict rules in the same file → ❌ CONFLICT.
4. GAPS FOUND verdict requires fixing before declaring done.
5. For tasks with ≤ 2 requirements and 1 changed file, the matrix collapses to a single inline sentence — but the re-read is never skipped.
6. If the task involved tool calls, verify no guardrail DENY events were suppressed or bypassed.
