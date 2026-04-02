# Phase 3: Cross-Cutting Concerns

## Objective

Implement shared middleware and infrastructure code in `libs/shared/` and wire into each service. This phase covers authentication, tenant resolution, error handling, structured logging, rate limiting, caching, retry/circuit-breaker patterns, feature flags, and graceful degradation.

## 3.1 — Authentication Middleware

Based on the auth ADR from the architect:

```
Request arrives
  → Extract token (Bearer header / cookie)
  → Validate token (JWT signature, expiry, issuer, audience)
  → Extract claims (user_id, tenant_id, roles, permissions)
  → Attach to request context
  → Pass to next middleware
  → On failure: 401 with standard error format
```

Implementation requirements:
- JWKS key caching with background refresh (not per-request fetch)
- Token introspection fallback for opaque tokens
- Role-based access control (RBAC) decorator/annotation for handlers
- Permission-based fine-grained access where needed
- Service-to-service auth (mTLS or service account tokens)

## 3.2 — Tenant Resolution Middleware

```
Request arrives (after auth)
  → Extract tenant identifier (from JWT claim / subdomain / header / path)
  → Validate tenant exists and is active
  → Load tenant configuration (feature flags, limits, plan tier)
  → Attach tenant context to request
  → All downstream queries automatically scoped to tenant
  → On failure: 403 with "invalid tenant" error
```

## 3.3 — Error Handling

Global error handler that catches all unhandled errors:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "User with ID '123' not found",
    "details": [],
    "trace_id": "abc-123-def-456"
  }
}
```

Error mapping:
| Domain Error | HTTP Status | Error Code |
|-------------|-------------|------------|
| ValidationFailed | 400 | `VALIDATION_ERROR` |
| Unauthorized | 401 | `UNAUTHORIZED` |
| Forbidden | 403 | `FORBIDDEN` |
| NotFound | 404 | `RESOURCE_NOT_FOUND` |
| Conflict | 409 | `CONFLICT` |
| RateLimited | 429 | `RATE_LIMITED` |
| InternalError | 500 | `INTERNAL_ERROR` |
| ServiceUnavailable | 503 | `SERVICE_UNAVAILABLE` |

- Never expose stack traces in production (only in development)
- Always include `trace_id` for support correlation
- Log full error details server-side at ERROR level
- Return user-friendly messages client-side

## 3.4 — Structured Logging

Every log line is JSON with mandatory fields:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "service": "user-service",
  "trace_id": "abc-123",
  "span_id": "def-456",
  "tenant_id": "tenant-789",
  "user_id": "user-012",
  "method": "POST",
  "path": "/api/v1/users",
  "status": 201,
  "duration_ms": 45,
  "message": "User created successfully"
}
```

Log levels:
- `error` — Unexpected failures requiring investigation
- `warn` — Expected failures (validation errors, rate limits, not-found)
- `info` — Request/response lifecycle, business events
- `debug` — Detailed execution flow (disabled in production)

## 3.5 — Rate Limiting

Implement at two levels:

1. **Global rate limiting** (per IP) — Sliding window, configurable RPM per endpoint
2. **Tenant rate limiting** (per tenant) — Based on plan tier from tenant config

```
Request arrives
  → Check global rate limit (Redis INCR + EXPIRE)
  → Check tenant rate limit (Redis INCR + EXPIRE, keyed by tenant_id)
  → If exceeded: 429 with Retry-After header
  → Set response headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  → Pass to next middleware
```

## 3.6 — Caching Layer

Implement cache-aside pattern in repositories:

```
Read path:
  → Check cache (Redis) by key
  → Cache HIT: return cached entity, log cache hit
  → Cache MISS: query database, store in cache with TTL, return entity

Write path:
  → Write to database
  → Invalidate cache (delete key, not update — avoids race conditions)
  → Emit cache invalidation event (for multi-instance consistency)
```

Cache key convention: `{service}:{entity}:{tenant_id}:{entity_id}` (e.g., `user-service:user:tenant-123:user-456`)

## 3.7 — Retry and Circuit Breaker

For all external calls (HTTP, database, cache, message broker):

**Retry policy:**
- Max retries: 3
- Backoff: Exponential with jitter (100ms, 200ms, 400ms + random 0-100ms)
- Retry on: Network errors, 502, 503, 504, connection timeouts
- Do NOT retry on: 400, 401, 403, 404, 409 (client errors are not transient)

**Circuit breaker:**
- Closed (normal) -> Open (failing) after 5 consecutive failures or >50% error rate in 60s window
- Open -> Half-Open after 30s cooldown
- Half-Open -> Closed after 3 consecutive successes
- Open state returns 503 immediately (fail fast, don't pile up timeouts)

Use existing libraries: resilience4j (Java), polly (.NET), cockatiel (Node.js), go-resilience (Go), tenacity (Python).

## 3.8 — Feature Flags

Implement a feature flag abstraction that supports multiple backends:

```
interface FeatureFlagService {
  isEnabled(flagName: string, context: { tenantId, userId, environment }): boolean
  getVariant(flagName: string, context): string | null
}
```

Backends:
- **Environment variables** — Simple `FEATURE_X=true/false` (default, zero dependencies)
- **LaunchDarkly / Unleash / ConfigCat** — When dynamic toggling is needed
- **Database-backed** — When tenant-specific flags are needed

Feature flags must be used for:
- New feature rollouts (percentage-based)
- Tenant-specific features (plan tier gating)
- Kill switches for degraded mode
- A/B testing integration points

## 3.9 — Graceful Degradation

Every external dependency must have a fallback:

| Dependency | Degraded Behavior |
|-----------|-------------------|
| Cache (Redis) down | Bypass cache, serve from database (higher latency, still functional) |
| Message broker down | Queue events locally (in-memory or disk), replay when reconnected |
| External API down | Return cached/default response, log degradation, alert |
| Read replica down | Route reads to primary (higher load, still functional) |
| Feature flag service down | Fall back to cached flags or env-var defaults |
| Auth service down | Accept cached JWT validation (short window), reject new tokens |

Log all degradation events at WARN level with `degraded_dependency` field.

## Validation Loop

Before moving to Phase 4:
- All middleware compiles and passes lint
- Auth middleware correctly validates JWTs and extracts claims
- Tenant resolution correctly scopes all downstream operations
- Error handler maps all domain errors to correct HTTP status codes
- Logging produces valid JSON with all mandatory fields
- Rate limiting enforces limits and returns correct headers
- Cache layer handles HIT, MISS, and invalidation correctly
- Circuit breaker opens after failures and recovers after cooldown
- Feature flag service returns correct values for all backends

## Quality Bar

- Zero `any` types in middleware code
- All middleware is independently unit testable
- Integration test demonstrates full middleware chain
- Degradation fallbacks verified with dependency-down tests
