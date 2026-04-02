---
description: Run a comprehensive security audit on existing code using Harden mode with full compliance
---

# Security Audit Workflow

Use this workflow to audit an existing codebase for security vulnerabilities before production launch.

## Prerequisites
- Existing codebase with API endpoints and data handling
- Authentication/authorization already implemented
- Database with user data

## Steps

1. **Initialize in Harden mode**
   ```
   Use production-grade skill in Harden mode
   ```

2. **Reconnaissance Phase**
   - Scan all services, identify entry points
   - Map data flows: user input → API → service → database
   - Inventory auth mechanisms, external integrations
   - Check existing security measures (middleware, validation, rate limiting)

3. **Threat Modeling (Security Engineer Phase 1)**
   - STRIDE analysis on all data flows
   - Attack surface mapping
   - Trust boundary identification
   - **Output:** Threat model document

4. **Parallel Audit (Phases 2-5)**
   - **Code Audit:** OWASP Top 10 review, injection points, XSS, CSRF
   - **Auth Review:** Token management, session handling, RBAC policy
   - **Data Security:** PII inventory, encryption audit, GDPR compliance
   - **Supply Chain:** SBOM generation, dependency CVE scan, license check

5. **AI Security (if applicable)**
   - Prompt injection testing
   - Output filtering validation
   - PII in training/RAG data check

6. **QA Security Tests**
   - Security-focused test cases
   - API fuzzing configurations
   - Penetration test plan

7. **Code Review**
   - Architecture conformance check
   - Code quality issues that create security risks

8. **Findings Consolidation**
   - Merge all findings, deduplicate
   - Severity ranking: Critical → High → Medium → Low
   - **Gate: Review findings before remediation**

9. **Remediation**
   - Fix Critical and High issues with code changes
   - Each fix includes regression test
   - Document remaining Medium/Low for backlog

## Recommended Config

```yaml
# .production-grade.yaml
engagement_mode: thorough
overrides:
  security:
    depth: comprehensive  # Full OWASP Top 10, not essential-only
    compliance: [gdpr, soc2]  # Specify applicable frameworks
  qa:
    depth: security-focused
```

## Expected Output
```
.forgewright/security-engineer/
├── threat-model/          # STRIDE analysis
├── code-audit/            # OWASP findings
├── auth-review/           # Auth flow analysis
├── data-security/         # PII inventory, encryption
├── supply-chain/          # SBOM, dependency audit
├── ai-security/           # (if applicable)
├── pen-test/              # Pen test plan
└── remediation/           # Fix plan + applied fixes
```
