# Forgewright Security Scan

Automated security scanning for every pull request — catches vulnerabilities before they reach production.

## Overview

AgentShield-style scanning built natively into Forgewright:
- **Pattern matching** against curated security rules (injection, auth, exposure, IaC)
- **A-F grading** — clear pass/fail criteria for every PR
- **GitHub Actions** — automatic scanning on PR open
- **Merge blocking** — F grades block merge until issues are fixed

## Quick Start

```bash
# Run locally
npx tsx .forgewright/security/scanner.ts

# JSON output for automation
npx tsx .forgewright/security/scanner.ts --output json

# Scan specific files
npx tsx .forgewright/security/scanner.ts --files "src/**/*.ts"

# Fail on high or critical findings
npx tsx .forgewright/security/scanner.ts --fail-on high
```

## Security Grades

| Grade | Criteria | Merge Status |
|-------|----------|--------------|
| 🟢 **A** | 0 critical, 0 high | ✅ Allowed |
| 🔵 **B** | 0 critical, ≤2 high | ✅ Allowed |
| 🟡 **C** | 0 critical, ≤5 high, ≤10 medium | ✅ Allowed |
| 🟠 **D** | ≤2 critical, ≤10 high | ⚠️ Allowed with warning |
| 🔴 **F** | >2 critical OR >10 high | ❌ **Blocked** |

## File Structure

```
.forgewright/security/
├── scanner.ts          # Core scanning engine
├── grader.ts           # A-F grading logic
├── report.ts           # Report formatters
└── rules/
    ├── injection.yaml   # SQL, command, XSS injection rules
    ├── auth.yaml        # Auth bypass, credential leak rules
    ├── exposure.yaml     # PII, data leak, logging rules
    └── iac.yaml         # Terraform, K8s, Docker, Cloud rules
```

## Available Rules

### Injection (16 rules)
- SQL/NoSQL injection via string concatenation
- Command injection via exec(), spawn(), eval()
- Path traversal attacks
- XSS via innerHTML, dangerouslySetInnerHTML
- Server-side template injection (SSTI)

### Authentication (18 rules)
- Hardcoded passwords, API keys, private keys
- AWS/Azure/GCP credential patterns
- Weak JWT algorithms, missing expiration
- Authentication bypass via missing middleware
- Insecure cookie configuration

### Data Exposure (16 rules)
- PII in responses, logs, localStorage
- SSN, credit card number patterns
- Sensitive files (.env, .bak, .sql dumps)
- Missing security headers, CORS wildcards
- Weak encryption, disabled certificate validation

### Infrastructure as Code (18 rules)
- Terraform hardcoded secrets
- Kubernetes: privileged containers, running as root
- Docker: root user, docker.sock mount
- Cloud: public S3 buckets, open security groups

**Total: 68 security rules** across 4 categories

## CI Integration

### GitHub Actions (Recommended)

Copy `.forgewright/security/github-action.yml` to `.github/workflows/security-scan.yml`

The action:
1. Triggers on PR open, push, and PR update
2. Runs the security scanner
3. Posts results as a PR comment
4. Creates a GitHub Checks annotation for failures
5. **Blocks merge on F grade**

### Standalone Usage

```bash
# As a pre-commit hook
npx tsx .forgewright/security/scanner.ts --fail-on high

# In CI pipeline
npx tsx .forgewright/security/scanner.ts \
  --base origin/main \
  --output json \
  --fail-on critical
```

## Output Formats

### Text (default)
```
════════════════════════════════════════════════════════════
  FORGEWRIGHT SECURITY SCAN REPORT
════════════════════════════════════════════════════════════

  Grade:     🟢 A
  Critical:  0
  High:      0
  Medium:    2
  Low:       5

  ✓ No security issues found
```

### JSON
```json
{
  "timestamp": "2026-06-02T12:00:00Z",
  "grade": "A",
  "summary": { "critical": 0, "high": 0, "medium": 2, "low": 5 },
  "findings": [...]
}
```

### GitHub Actions
Posts structured output to PR comments and creates check annotations.

## Adding Custom Rules

Create a new YAML file in `rules/` or extend existing files:

```yaml
rules:
  - id: custom-001
    name: "Custom Security Rule"
    pattern: 'dangerous_pattern.*user_input'
    severity: high
    description: "What this catches..."
    cwe: "CWE-XXX"
    remediation: "How to fix this..."
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGEWRIGHT_SECURITY_RULES_DIR` | `.forgewright/security/rules` | Rules directory |
| `FORGEWRIGHT_SECURITY_FAIL_ON` | `critical` | Minimum severity to fail |

### scanner.ts Options

| Option | Description |
|--------|-------------|
| `--base <ref>` | Base branch/commit to compare against |
| `--files <glob>` | Specific files to scan |
| `--rules <dir>` | Rules directory |
| `--output <format>` | Output: text, json, github |
| `--fail-on <severity>` | Exit with error on findings at or above severity |

## Performance

- Scans 1000 TypeScript files in ~30 seconds
- Rule matching is parallelized per file
- Pattern caching for repeated scans

## Integration with Security Engineer Skill

The automated scanner complements manual security reviews:

```
┌─────────────────────────────────────────────────────────────┐
│                     Security Review                          │
├─────────────────────────────────────────────────────────────┤
│  Automated (scanner.ts)     │  Manual (security-engineer)   │
│  ─────────────────────────  │  ──────────────────────────   │
│  • Pattern matching         │  • Threat modeling            │
│  • Fast (seconds)           │  • Business logic flaws      │
│  • Always runs on PR        │  • Architecture review       │
│  • Catches 80% of issues    │  • Catches remaining 20%     │
└─────────────────────────────────────────────────────────────┘
```

## References

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks)
