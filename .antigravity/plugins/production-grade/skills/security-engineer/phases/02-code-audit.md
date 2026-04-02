# Phase 2: Code Security Audit

## Objective

Systematically audit the entire codebase against the OWASP Top 10. security-engineer is the SOLE AUTHORITY on OWASP code review -- no other skill performs OWASP analysis. Every finding must reference specific files, lines, and code patterns. Generate all outputs in `.forgewright/security-engineer/code-audit/`.

## Context Bridge

Read Phase 1 outputs from `.forgewright/security-engineer/threat-model/` before beginning. The STRIDE analysis and attack surface map tell you WHERE to focus. Start with endpoints and code paths that scored Critical or High in the threat matrix.

## Inputs

- Phase 1 threat model -- `.forgewright/security-engineer/threat-model/`
- Implementation code -- `services/`, `frontend/` (controllers, middleware, data access layers, utilities)
- API specs -- `api/` (OpenAPI, gRPC proto) for expected behavior comparison
- Test suites -- `tests/` for coverage gap analysis
- Dependency manifests -- `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml`

## Workflow

### Step 1: A01 -- Broken Access Control

- Review every route/endpoint for authorization checks
- Search for IDOR vulnerabilities (direct object references without ownership validation)
- Check for missing function-level access control (admin endpoints accessible to regular users)
- Verify CORS configuration is restrictive (reject `Access-Control-Allow-Origin: *`)
- Check for path traversal in file operations (`../` sequences in user-supplied paths)
- Review WebSocket and GraphQL authorization

### Step 2: A02 -- Cryptographic Failures

- Identify sensitive data transmitted without TLS enforcement
- Check password hashing (require bcrypt/scrypt/argon2 -- reject MD5/SHA1/SHA256 without KDF)
- Review encryption key management -- hardcoded keys, weak algorithms, missing rotation
- Check for sensitive data in URLs, logs, or error messages
- Verify cryptographically secure random number generation (not `Math.random()` or `random.random()` for tokens)

### Step 3: A03 -- Injection

Audit EVERY database call, system call, and template render:
- **SQL injection** -- parameterized queries vs string concatenation
- **NoSQL injection** -- MongoDB query operator injection via user input
- **Command injection** -- `exec`, `system`, `spawn`, `os.popen` with user-controlled arguments
- **LDAP injection** -- if directory services are used
- **Template injection** -- server-side template engines processing user input
- **ORM injection** -- unsafe ORM methods that bypass parameterization
- **Header injection** -- CRLF in HTTP headers constructed from user input

### Step 4: A04 -- Insecure Design

- Review business logic for race conditions (TOCTOU in payments, inventory, counters)
- Check for missing rate limiting on sensitive operations (login, password reset, OTP verification)
- Verify multi-step workflows cannot be bypassed (skipping payment, reordering steps)
- Review error handling for information leakage (stack traces, internal paths, version info)
- Check for insecure defaults in configuration

### Step 5: A05 -- Security Misconfiguration

- Review framework security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
- Check for debug mode enabled in production configs
- Verify default credentials are not present
- Review CORS policy strictness
- Check for unnecessary HTTP methods (TRACE, permissive OPTIONS)
- Review error pages for information disclosure

### Step 6: A06 -- Vulnerable and Outdated Components

- Cross-reference with Phase 5 (Supply Chain) for detailed dependency analysis
- Flag components with known CVEs currently in use
- Check for unmaintained or deprecated packages in direct dependencies

### Step 7: A07 -- Identification and Authentication Failures

- Cross-reference with Phase 3 (Auth Review) for detailed analysis
- Check for credential stuffing protection (rate limiting, CAPTCHA)
- Verify MFA implementation if present
- Review session fixation and session ID entropy

### Step 8: A08 -- Software and Data Integrity Failures

- Check CI/CD pipeline for unsigned artifacts
- Review deserialization of untrusted data (Java `ObjectInputStream`, Python `pickle`, PHP `unserialize`, Node.js `node-serialize`)
- Verify integrity of third-party code (SRI hashes for CDN-hosted scripts)
- Check for auto-update mechanisms without signature verification

### Step 9: A09 -- Security Logging and Monitoring Failures

- Verify authentication events are logged (login, logout, failed attempts)
- Check that authorization failures are logged with context (user_id, resource, action)
- Review log format for required security fields (user_id, ip, action, timestamp, result)
- Verify sensitive data is NOT logged (passwords, tokens, PII, credit card numbers)
- Check for tamper-proof log storage
- Review alerting on security-relevant events

### Step 10: A10 -- Server-Side Request Forgery (SSRF)

- Identify all code paths that make HTTP requests based on user input
- Check for URL validation and allowlisting
- Review cloud metadata endpoint access restrictions (169.254.169.254)
- Check for DNS rebinding protections
- Verify internal service URLs cannot be reached via user-controlled parameters

### Step 11: Map Injection Points

Enumerate every input entry point in the system:
- HTTP request parameters (query, body, headers, cookies)
- File upload handlers
- WebSocket message handlers
- Message queue consumers
- GraphQL resolvers accepting user arguments
- CLI/admin command arguments
- Environment variables consumed from external sources

For each entry point, document: current sanitization applied, missing sanitization needed, expected vs accepted data types, maximum length enforcement.

### Step 12: Generate Per-Service Findings

For each service, compile findings using this structure:

```markdown
# Security Findings: <Service Name>

## Summary
- Critical: N | High: N | Medium: N | Low: N | Info: N

## Findings

### [SEVERITY] Finding Title
- **Category:** OWASP A0X
- **Location:** `file:line`
- **Description:** What the vulnerability is
- **Proof of Concept:** How it could be exploited
- **Remediation:** Specific code fix or pattern to apply
- **References:** CWE-XXX, relevant documentation
```

Every finding MUST reference a specific file and line number. Generic findings ("check for SQL injection") are not acceptable.

## Output Deliverables

Write all outputs to `.forgewright/security-engineer/code-audit/`:

| File | Contents |
|------|----------|
| `owasp-top10-report.md` | Full OWASP Top 10 analysis with findings per category |
| `findings-by-service/<service>.md` | Per-service findings with severity summary |
| `injection-points.md` | Comprehensive map of every input entry point |

## Validation

Before proceeding to Phase 3, verify:
- [ ] All 10 OWASP categories have been evaluated (even if no findings in some)
- [ ] Every finding has a specific file:line location
- [ ] Every finding has a concrete remediation (not just "fix this")
- [ ] Per-service findings include severity summary counts
- [ ] Injection points map covers all input vectors (not just HTTP parameters)

## Quality Bar

This is a code audit, not a checklist exercise. Every finding must include the vulnerable code snippet, an explanation of how it can be exploited, and the specific fix. "Possible SQL injection in user service" is not a finding. "String concatenation in user-service/src/db/queries.js:87 allows SQL injection via the `sort` parameter -- replace with parameterized query using `$1` placeholder" is a finding.
