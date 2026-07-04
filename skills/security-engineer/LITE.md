---
name: security-engineer
description: "[production-grade internal] Audits code for security vulnerabilities — OWASP top 10, auth flaws, injection, data exposure, dependency risks, AI/LLM security, pen testing, threat modeling, and compliance automation. Routed via the production-grade orchestrator."
version: 2.0.0
tags: [security, owasp, pentest, threat-modeling, compliance, hardening, audit]
---

# Security Engineer (LITE)

## SOLVE Step 2: GROUND (Security Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Dependency vulnerabilities | Run package manager audit command | ... | Y/N |
| Static analysis scanner ready | Check if `semgrep` or `bandit` is installed | ... | Y/N |
| Raw SQL queries exist | Search codebase for string concatenation in SQL | ... | Y/N |
| Encryption standards used | Check passwords hashing algorithm in code | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Security Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
- `n. ACTION (audit npm dependencies) | TARGET (package.json) | CHECK (npm audit)`
- `n. ACTION (scan code with semgrep) | TARGET (src/) | CHECK (npx semgrep --config auto src/)`
- `n. ACTION (implement parameterized query) | TARGET (src/user.ts) | CHECK (npm test)`
- `n. ACTION (update hashing algorithm) | TARGET (src/auth.ts) | CHECK (npm test)`

---

## Worked Example: Remediating SQL Injection
> [!NOTE]
> The following example is illustrative.

### 1. UNDERSTAND
- **Task**: Fix a SQL injection vulnerability in the login user lookup inside `src/user.ts`.
- **What must be TRUE**: User input is parameterized; malicious payloads (e.g. `' OR '1'='1`) do not bypass authentication; tests pass.
- **What could I be wrong about**: Other inputs or API endpoints having the same string interpolation pattern.

### 2. GROUND
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| SQL injection exists | `grep -n "SELECT" src/user.ts` | Found interpolated SQL string | Y |
| DB client supports query parameters | View database connector | Uses PG `db.query(sql, params)` | Y |
| Vulnerable file exists | `ls src/user.ts` | File exists | Y |

### 3. DECOMPOSE
1. ACTION (write security test simulating SQLi attack)   TARGET (tests/security.test.ts)   CHECK (npx jest tests/security.test.ts)
2. ACTION (parameterize the database query)   TARGET (src/user.ts)   CHECK (npx jest tests/security.test.ts)
3. ACTION (run full security/unit test suite)   TARGET (tests/)   CHECK (npm test)

### 4. EXECUTE
#### Step 1: Write SQLi test
- Created `tests/security.test.ts` trying login with username: `admin' --`.
- CHECK: `npx jest tests/security.test.ts` -> Failed (returned admin user without password).

#### Step 2: Parameterize query
- Modified `src/user.ts`:
```typescript
// BEFORE: const sql = `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`;
// AFTER:
export async function authenticateUser(email: string, passwordHash: string) {
  const sql = `SELECT * FROM users WHERE email = $1 AND password = $2`;
  const result = await db.query(sql, [email, passwordHash]);
  return result.rows;
}
```
- CHECK: `npx jest tests/security.test.ts` -> Passed (denied access with SQLi payload).

#### Step 3: Run all tests
- CHECK: `npm test` -> Passed.

### 5. VERIFY
CLAIM: login query is secured against SQL injection using parameterization
COMMAND: npx jest tests/security.test.ts
PASS  tests/security.test.ts
✓ should deny authentication with standard sql injection payloads
EXIT CODE: 0
VERDICT: PASS
