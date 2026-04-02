# Phase 3: Authentication & Authorization Review

## Objective

Trace every authentication flow end-to-end and verify every authorization decision in the codebase. security-engineer is the SOLE AUTHORITY on auth flow analysis, token security, and RBAC/ABAC policy review. Generate all outputs in `.forgewright/security-engineer/auth-review/`.

## Context Bridge

Read Phase 2 outputs from `.forgewright/security-engineer/code-audit/`. The OWASP A01 (Broken Access Control) and A07 (Identification and Authentication Failures) findings from the code audit provide the starting point. This phase goes deeper with dedicated auth flow tracing.

## Inputs

- Phase 2 code audit -- `.forgewright/security-engineer/code-audit/`
- Implementation code -- auth middleware, session handlers, token generation, RBAC logic
- API specs -- `api/` (endpoint auth requirements, security schemes)
- Infrastructure configs -- OAuth provider configs, identity provider setup
- Architecture docs -- auth architecture, service-to-service auth model

## Workflow

### Step 1: Trace Authentication Flows

Walk through each authentication lifecycle end-to-end by reading the actual code (not just config):

**Registration flow:**
- Input validation on registration fields
- Email/phone verification mechanism
- Password complexity requirements enforcement
- Account enumeration prevention (generic success messages)
- Duplicate account handling

**Login flow:**
- Credential verification implementation
- Brute force protection (lockout policy, progressive delays, CAPTCHA)
- Account lockout and unlock mechanism
- Timing attack resistance (constant-time comparison)
- Login event logging

**Password reset flow:**
- Reset token generation (entropy, length, algorithm)
- Token expiration enforcement
- One-time use enforcement
- Old session invalidation after password change
- Email verification before reset

**OAuth2/OIDC flows (if present):**
- State parameter generation and validation (CSRF protection)
- Redirect URI validation (exact match vs pattern match)
- Token exchange implementation
- Scope validation and enforcement
- ID token verification (signature, issuer, audience, expiration)

**MFA flow (if present):**
- Second factor verification implementation
- Backup code generation and storage
- MFA bypass scenarios (recovery flow security)
- MFA enrollment flow security
- Remember-device token handling

**API authentication:**
- API key generation (entropy, format)
- API key storage (hashed, not plaintext)
- Key rotation mechanism
- Per-key scoping and rate limiting

**Service-to-service authentication:**
- mTLS implementation and certificate management
- Shared secret handling and rotation
- JWT inter-service token validation
- Credential storage (secrets manager vs environment variables vs hardcoded)

For each flow, evaluate:
- Can any step be skipped or reordered?
- Are tokens cryptographically secure?
- Is the flow resistant to replay attacks?
- Are error messages generic (no user/account enumeration)?

### Step 2: Audit Token Management

Catalog every token type in the system and evaluate each:

| Aspect | What to Verify |
|--------|---------------|
| Generation | Sufficient entropy (128+ bits), CSPRNG source |
| Storage | Server-side tokens in DB/Redis, client tokens as HttpOnly Secure SameSite cookies |
| Expiration | Appropriate TTL for token type, server-side enforcement |
| Rotation | Refresh token rotation on use, sliding expiration where appropriate |
| Revocation | Logout invalidates all tokens, password change revokes sessions |
| Transmission | HTTPS only, no tokens in URL query parameters or logs |

For JWTs specifically:
- Algorithm specified and enforced server-side (reject `alg: none`)
- Signature verification on every request
- Claims validated (iss, aud, exp, nbf, iat)
- Token size reasonable (no sensitive data in payload)
- Key rotation mechanism (JWKS endpoint with key ID)

### Step 3: Review RBAC/ABAC Policies

Analyze the authorization model:

- **Permission model identification** -- RBAC, ABAC, or hybrid? Document the complete matrix.
- **Role hierarchy** -- all roles, inheritance chains, default permissions for new users
- **Resource ownership** -- how is resource-to-user binding enforced? Direct DB foreign key? Middleware check? Can it be bypassed?
- **Horizontal privilege escalation** -- can user A access user B's resources by manipulating IDs?
- **Vertical privilege escalation** -- can a regular user invoke admin-only endpoints or actions?
- **Permission checking consistency** -- is authorization checked at every layer (route middleware, controller, service, data access)?
- **Default deny verification** -- is the system default-deny? Enumerate any endpoints missing auth checks entirely.
- **Delegation** -- can users delegate permissions? Is delegation scoped and time-limited?

### Step 4: Test Authorization Boundaries

For every endpoint discovered in Phase 1 attack surface mapping:
- Verify the required role/permission is enforced
- Check if authorization can be bypassed by omitting auth headers
- Check if authorization can be bypassed by using a lower-privilege token
- Verify that bulk/batch endpoints enforce per-item authorization
- Check GraphQL resolvers for field-level authorization

## Output Deliverables

Write all outputs to `.forgewright/security-engineer/auth-review/`:

| File | Contents |
|------|----------|
| `auth-flow-analysis.md` | End-to-end trace of every authentication flow with findings |
| `token-management.md` | Token type inventory with security assessment per token |
| `rbac-policy-review.md` | Complete authorization model analysis with escalation findings |

## Validation

Before proceeding to Phase 4, verify:
- [ ] Every authentication flow has been traced through actual code (not just config)
- [ ] Every token type is catalogued with generation, storage, expiration, and revocation details
- [ ] RBAC analysis covers both horizontal and vertical escalation
- [ ] Every endpoint has been checked for authorization enforcement
- [ ] Findings include specific file:line references

## Quality Bar

Auth review is NOT reading the JWT library documentation and confirming it is used. It is tracing the actual middleware chain to verify that EVERY route applies the auth check, that token validation actually verifies signatures (not just decodes), that refresh token rotation is implemented (not just planned), and that RBAC checks happen at the data access layer (not just the route layer). Test the boundaries, not the happy path.
