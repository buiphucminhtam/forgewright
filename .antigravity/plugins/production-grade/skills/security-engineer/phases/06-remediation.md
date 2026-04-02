# Phase 6: Remediation Plan

## Objective

Aggregate all findings from Phases 1-5 into a single prioritized remediation plan with executable fix instructions. Every Critical and High finding gets before/after code, a verification test, and an owner assignment. Medium and Low findings get a timeline. Also generate a structured penetration test plan. Generate all outputs in `.forgewright/security-engineer/remediation/` and `.forgewright/security-engineer/pen-test/`.

## Context Bridge

Read ALL prior phase outputs:
- `.forgewright/security-engineer/threat-model/` (Phase 1)
- `.forgewright/security-engineer/code-audit/` (Phase 2)
- `.forgewright/security-engineer/auth-review/` (Phase 3)
- `.forgewright/security-engineer/data-security/` (Phase 4)
- `.forgewright/security-engineer/supply-chain/` (Phase 5)

Every finding from every phase feeds into this plan. Do not re-analyze -- aggregate, deduplicate, and prioritize.

## Workflow

### Step 1: Aggregate and Deduplicate Findings

Collect every finding from all phases into a unified list:
- Assign a unique finding ID to each (e.g., SEC-001, SEC-002)
- Deduplicate findings that appear in multiple phases (e.g., A02 crypto finding in code audit that also appears in data security encryption audit)
- When duplicates exist, keep the more detailed version and cross-reference the other
- Preserve the original phase and source file for traceability

### Step 2: Prioritize Using Severity Matrix

Classify every finding into a priority tier:

| Priority | Criteria | SLA |
|----------|----------|-----|
| P0 -- Immediate | Actively exploitable, data breach risk, RCE, critical auth bypass, no special access required | Fix within 24-48 hours |
| P1 -- This Sprint | High-severity with known exploit patterns, compliance blockers, privilege escalation requiring auth | Fix within 1 week |
| P2 -- Next Sprint | Medium-severity, defense-in-depth improvements, missing hardening headers, verbose errors | Fix within 1 sprint |
| P3 -- Backlog | Low-severity, best-practice deviations, informational findings with no direct exploitability | Fix within 1 quarter |
| Info -- Track | Informational only, monitor for escalation, no immediate action required | Track and review quarterly |

### Step 3: Generate Critical Fixes with Code

For EVERY P0 and P1 finding, produce a complete fix specification:

```markdown
## [SEVERITY] SEC-XXX: Finding Title

**Source:** Phase X -- <report file>
**Category:** OWASP A0X / CWE-XXX
**Location:** `service/file:line`

### Current (Vulnerable) Code
```<language>
// the exact vulnerable code from the codebase
```

### Fixed Code
```<language>
// the remediated code with inline comments explaining every change
```

### Why This Fix Works
<brief explanation of the security principle applied>

### Verification
- [ ] Unit test to add: `test_<finding>_is_mitigated`
- [ ] Integration test: <description of what to test>
- [ ] Manual verification: <steps to confirm the fix>

### References
- CWE-XXX: <title>
- OWASP guidance: <relevant OWASP page>
```

Requirements for code fixes:
- MUST include the actual vulnerable code (not a description of it)
- MUST include the complete fixed code (not just the changed line)
- MUST include a test that would fail before the fix and pass after
- MUST include references for the engineering team to learn more

### Step 4: Generate Penetration Test Plan

Create a structured pen test plan in `.forgewright/security-engineer/pen-test/`:

**Authentication Tests:**
- Brute force login (test lockout threshold and timing)
- Credential stuffing with known breached credentials format
- Password reset token prediction/reuse
- Session fixation and session hijacking
- JWT manipulation (algorithm confusion, signature stripping, claim tampering)
- OAuth redirect URI manipulation
- MFA bypass attempts

**Authorization Tests:**
- IDOR testing on every resource endpoint (substitute IDs)
- Horizontal privilege escalation (access other users' resources)
- Vertical privilege escalation (perform admin actions as regular user)
- Missing function-level access control (direct endpoint access)
- GraphQL introspection and query depth attacks
- Batch request permission bypass

**Injection Tests:**
- SQL injection (UNION, blind, time-based) on all input fields
- NoSQL injection (MongoDB operator injection)
- Command injection on any system call with user input
- XSS (reflected, stored, DOM-based) on all output points
- SSRF on any URL-accepting parameter
- Template injection on any template-rendered user content
- CRLF injection in headers and redirects

**Business Logic Tests:**
- Race conditions on financial operations (double-spend, parallel requests)
- Workflow bypass (skip required steps in multi-step processes)
- Integer overflow/underflow on quantities, prices, balances
- Negative value attacks on financial fields
- Rate limit bypass (header manipulation, distributed requests)
- File upload attacks (malicious file types, path traversal in filenames, polyglot files)

**API-Specific Tests:**
- Mass assignment (send unexpected fields in requests)
- Excessive data exposure (API returns more fields than needed)
- Broken Object Level Authorization on every API resource
- Rate limiting verification per endpoint
- API versioning bypass (access deprecated endpoints)
- GraphQL batching attacks and query complexity abuse

### API Fuzzing Configuration

Generate `api-fuzzing-config.yml` targeting discovered API endpoints:

```yaml
fuzzing:
  target_base_url: "${BASE_URL}"
  auth:
    type: "bearer"
    token_env: "FUZZ_AUTH_TOKEN"

  global_settings:
    request_timeout_ms: 5000
    max_concurrent_requests: 10
    follow_redirects: false

  endpoints:
    - path: "/api/v1/users/{id}"
      method: "GET"
      parameters:
        id:
          type: "integer"
          fuzz_values: ["0", "-1", "99999999", "' OR 1=1 --", "../../../etc/passwd", "${7*7}"]
      expected_status: [200, 404]
      unexpected_status_is_finding: true

  wordlists:
    sql_injection: "standard_sqli_payloads"
    xss: "standard_xss_payloads"
    path_traversal: "standard_traversal_payloads"
    command_injection: "standard_cmdi_payloads"
```

### Per-Service Attack Scenarios

Generate attack scenario files for each service:

```markdown
# Attack Scenarios: <Service Name>

## Scenario 1: <Attack Name>
- **Target:** <endpoint or component>
- **Category:** <STRIDE category>
- **Prerequisites:** <access level, knowledge required>
- **Steps:**
  1. <step>
  2. <step>
- **Expected Vulnerable Response:** <what a vulnerable system returns>
- **Expected Secure Response:** <what a patched system returns>
- **Severity:** Critical / High / Medium / Low
- **Automated:** Yes (included in fuzzing config) / No (manual test required)
```

### Step 5: Build Remediation Timeline

Organize all findings into a phased remediation schedule:

**Week 1: P0 -- Critical (Immediate)**
- List every P0 finding with: title, owner (team/person), estimated effort in hours
- Include deployment instructions: hotfix branch, staging verification, production push
- Include rollback plan if fix causes regression

**Weeks 2-3: P1 -- High (This Sprint)**
- List every P1 finding with: title, owner, estimated effort
- Group by service for efficient batch fixing
- Include in next release cycle

**Sprint +1: P2 -- Medium (Next Sprint)**
- List every P2 finding with: title, owner, estimated effort
- Prioritize by effort-to-impact ratio

**Backlog: P3 -- Low**
- List every P3 finding with: title, owner, estimated effort
- Schedule for opportunistic fixing

**Recurring schedule:**
- Re-run dependency audit monthly
- Re-run OWASP code audit after major feature releases
- Update threat model when architecture changes
- Rotate API keys and service credentials quarterly
- Review and update PII inventory when new data fields are added

### Step 6: Generate Executive Summary

Produce a summary suitable for stakeholders:

- Total findings by severity (Critical / High / Medium / Low / Informational)
- Top 3 most critical risks in plain language
- Estimated total remediation effort in person-weeks
- Compliance status summary (GDPR/CCPA gaps count)
- Dependency risk summary (CVE counts by reachability)
- Comparison to industry benchmarks where applicable

## Output Deliverables

Write all outputs to `.forgewright/security-engineer/remediation/` and `.forgewright/security-engineer/pen-test/`:

| File | Contents |
|------|----------|
| `remediation/remediation-plan.md` | Executive summary, prioritization matrix, full finding inventory |
| `remediation/critical-fixes.md` | Before/after code for every P0 and P1 finding with tests |
| `remediation/timeline.md` | Phased remediation schedule with owners, effort, and recurring cadence |
| `pen-test/test-plan.md` | Structured penetration test plan by attack category |
| `pen-test/api-fuzzing-config.yml` | Fuzzing configuration for discovered API endpoints |
| `pen-test/attack-scenarios/<service>.md` | Per-service attack scenario files |

## Validation

Before marking the security audit complete, verify:
- [ ] Every finding from Phases 1-5 appears in the remediation plan
- [ ] Every P0 and P1 finding has before/after code and a verification test
- [ ] Timeline includes specific owners or team assignments
- [ ] Pen test plan covers auth, authz, injection, business logic, and API-specific tests
- [ ] Recurring audit schedule is defined
- [ ] Executive summary is written for non-technical stakeholders

## Quality Bar

A remediation plan that says "fix the SQL injection" is not a plan. Every Critical and High finding must have the exact vulnerable code, the exact fixed code, a test to verify the fix, and a reference for the developer to understand WHY. Medium and Low findings must have clear descriptions and a timeline. The plan must be actionable by an engineer who did not participate in the audit -- if they cannot pick up a finding and fix it from the plan alone, the plan is insufficient.
