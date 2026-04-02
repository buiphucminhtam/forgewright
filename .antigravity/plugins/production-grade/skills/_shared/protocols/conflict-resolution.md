# Conflict Resolution Protocol

**When two skills produce overlapping or contradictory outputs, this protocol determines which output takes authority.**

## Authority Hierarchy

Each artifact type has a single authoritative skill. Contributors may flag issues but do NOT override the authority.

| Artifact | Authority (Sole Owner) | Contributors (Read-Only Input) |
|----------|----------------------|-------------------------------|
| Business requirements (BRD) | **product-manager** | — |
| Architecture decisions (ADRs) | **solution-architect** | code-reviewer flags drift |
| API contracts (OpenAPI, gRPC, AsyncAPI) | **solution-architect** | software-engineer requests changes via findings |
| Implementation code (services/, libs/) | **software-engineer** | reviewers produce findings only, do NOT modify code |
| Frontend code (frontend/) | **frontend-engineer** | reviewers produce findings only, do NOT modify code |
| Test suites (tests/) | **qa-engineer** | — |
| Security findings (OWASP, STRIDE, pen-test) | **security-engineer** | code-reviewer does NOT perform OWASP review |
| Code quality / arch conformance findings | **code-reviewer** | — |
| SLO definitions, error budgets, runbooks | **sre** | devops provides infra metrics, does NOT define SLOs |
| Monitoring infrastructure (dashboards, alerts) | **devops** | sre defines thresholds, devops implements them |
| Infrastructure (Terraform, K8s, CI/CD) | **devops** | sre reviews for reliability concerns |
| Documentation (docs/) | **technical-writer** | — |
| Custom project skills | **skill-maker** | — |

## Deduplication Rules

When multiple skills analyze the same code and produce overlapping findings:

1. **Keep highest severity**: If security-engineer rates a finding as Critical and code-reviewer rates the same file:line as High, keep Critical.
2. **Deduplicate by location**: Findings targeting the same `file:line` are merged. The authoritative skill's finding wins.
3. **Cross-reference, don't duplicate**: code-reviewer should write "See security-engineer findings for OWASP analysis" instead of performing its own OWASP review.

## Feedback Loops (HARDEN → BUILD)

When HARDEN phase skills find issues that require code changes:

1. **Findings become tasks**: The orchestrator reads all HARDEN findings and creates remediation task entries tracked in `task.md`.
2. **Remediation assigned to build agents**: Critical/High findings are assigned to the original build skill (software-engineer or frontend-engineer).
3. **Re-scan after remediation**: After fixes are applied, the HARDEN skill re-scans the affected files.
4. **Termination after 2 cycles**: If issues persist after 2 fix-rescan cycles, escalate to user via notify_user.

## Specific Boundary Clarifications

### security-engineer vs code-reviewer
- **security-engineer**: Sole authority on OWASP Top 10, STRIDE, penetration testing, compliance, PII, encryption.
- **code-reviewer**: Architecture conformance, code quality (SOLID, DRY), performance, test quality. Does NOT do security review — references security-engineer findings instead.

### sre vs devops
- **devops**: Owns infrastructure provisioning, CI/CD pipelines, container orchestration, monitoring tool setup.
- **sre**: Owns SLO/SLI definitions, error budget policy, chaos engineering, incident management, runbooks, capacity planning. Does NOT provision infrastructure — reviews it for reliability.

### product-manager vs solution-architect
- **product-manager**: Owns WHAT to build (requirements, user stories, acceptance criteria).
- **solution-architect**: Owns HOW to build it (architecture, tech stack, API contracts, data models). Does NOT change requirements — flags gaps back to PM.
