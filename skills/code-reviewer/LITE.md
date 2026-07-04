---
name: code-reviewer
description: "Reviews code for quality — architecture conformance, anti-patterns, performance issues, maintainability. Read-only analysis that detects circular dependencies, N+1 queries, dead code, naming violations, and layering breaches. Use when the user asks for a code review, wants feedback on code quality, PR review, tech debt analysis, or architecture conformance checks."
version: 2.0.0
tags: [code-review, quality, architecture, anti-patterns, tech-debt, maintainability]
---

# Code Reviewer (LITE)

## SOLVE Step 2: GROUND (Code Reviewer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Changes in the current branch | Run `git diff main...` or list modified files | ... | Y/N |
| Coding style guides exist | Look for ESLint, Prettier, or python configs | ... | Y/N |
| Database access in API handlers | Search handlers directory for database queries | ... | Y/N |
| Circular dependencies checker | Check for `madge` or similar tools | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Code Reviewer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
- `n. ACTION (analyze git diff) | TARGET (git diff) | CHECK (git diff main)`
- `n. ACTION (scan for db queries in views) | TARGET (src/controllers/) | CHECK (grep -r "db." src/controllers/)`
- `n. ACTION (detect loop database queries) | TARGET (src/services/) | CHECK (grep -rn "forEach" src/services/)`
- `n. ACTION (draft code review feedback) | TARGET (docs/review-comments.md) | CHECK (cat docs/review-comments.md)`

---

## Worked Example: Reviewing N+1 Queries in Orders loop
> [!NOTE]
> The following example is illustrative.

### 1. UNDERSTAND
- **Task**: Review the newly added `getUserOrdersSummary` logic in `src/services/user-service.ts` for performance issues.
- **What must be TRUE**: PR review file identifies N+1 issue, provides batched query solution using `IN` or `JOIN`, output is written.
- **What could I be wrong about**: The db driver might do batching internally (but standard SQL patterns should still be correct).

### 2. GROUND
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Service code file exists | `ls src/services/user-service.ts` | File exists | Y |
| Modified function exists | View file at suspected lines | Loop contains query | Y |

### 3. DECOMPOSE
1. ACTION (audit user-service.ts for loops and queries)   TARGET (src/services/user-service.ts)   CHECK (grep -rn "db.query" src/services/user-service.ts)
2. ACTION (identify structural layer violations)   TARGET (src/services/user-service.ts)   CHECK (git diff main)
3. ACTION (draft review notes with fix recommendations)   TARGET (docs/review-feedback.md)   CHECK (cat docs/review-feedback.md)

### 4. EXECUTE
#### Step 1: Audit code
- Inspected `getUserOrdersSummary`:
```typescript
async function getUserOrdersSummary(users: User[]) {
  return Promise.all(users.map(async (u) => {
    const orders = await db.query('SELECT * FROM orders WHERE user_id = $1', [u.id]);
    return { ...u, ordersCount: orders.length };
  }));
}
```
- CHECK: N+1 query vulnerability confirmed (one query per user).

#### Step 2: Layer violations check
- Inspected routing. No db queries in route controllers. Service layer compiles.
- CHECK: `git diff main` -> Confirmed layering is conformant; only N+1 is present.

#### Step 3: Draft feedback
- Created `docs/review-feedback.md` highlighting the N+1 issue and proposing:
```typescript
const userIds = users.map(u => u.id);
const orders = await db.query('SELECT user_id, COUNT(*) FROM orders WHERE user_id = ANY($1) GROUP BY user_id', [userIds]);
```
- CHECK: `cat docs/review-feedback.md` -> Printed review successfully.

### 5. VERIFY
CLAIM: code review report successfully generated and saved
COMMAND: cat docs/review-feedback.md
# Code Review Feedback
- **Critical Performance Issue (N+1 Query)**: `getUserOrdersSummary` queries database inside `Promise.all(users.map(...))`.
- **Recommendation**: Query orders in a single bulk query using `ANY` or `IN` operator.
EXIT CODE: 0
VERDICT: PASS
