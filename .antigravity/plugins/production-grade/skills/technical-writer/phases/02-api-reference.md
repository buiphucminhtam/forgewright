# Phase 2: API Reference

## Objective

Generate comprehensive API documentation from OpenAPI/AsyncAPI specs and source code so that an API consumer can integrate without reading source code or asking questions. Every endpoint, authentication method, error code, and webhook event is documented with working examples.

## 2.1 — Mandatory Inputs

| Input | Path | What to Extract |
|-------|------|-----------------|
| OpenAPI specs | `api/openapi/*.yaml` | Endpoints, schemas, auth requirements |
| AsyncAPI specs | `api/asyncapi/*.yaml` | Webhook events, payload schemas |
| Auth middleware | `services/*/src/middleware/auth*` | Authentication methods, token formats |
| Error handler | `services/*/src/middleware/error*` | Error codes, HTTP status mappings |
| Rate limit config | `services/*/src/middleware/rate-limit*` | Rate tiers, limit values |
| Content inventory | `.forgewright/technical-writer/content-inventory.md` | Phase 1 gap analysis results |

## 2.2 — Authentication Documentation

Generate `docs/api-reference/authentication.md`:

1. **Overview** — One paragraph: what auth method is used, how to obtain credentials
2. **Getting credentials** — Step-by-step instructions for obtaining API keys or tokens
3. **Using credentials** — Header authentication (recommended) and query parameter authentication (with security warning)
4. **Authentication errors** — Table with status code, error code, description, and resolution
5. **Code examples** — Working examples in Python, JavaScript, and Go (minimum three languages)
6. **Token refresh flow** — If using OAuth2/JWT, document the refresh cycle

Every code example must be complete and copy-pasteable. No pseudo-code, no `...` ellipsis in runnable blocks.

## 2.3 — Endpoint Reference

Generate `docs/api-reference/endpoints/<resource-name>.md` — one file per API resource.

Each endpoint page follows this template:

```
# <Resource Name>

## List <Resources>
`GET /v1/<resources>`

<One-sentence description>

### Authentication
Required. Scope: `<resource>:read`

### Query Parameters
| Parameter | Type | Required | Default | Description |

### Response (200)
```json
{ ... complete example ... }
```

### Error Responses
| Status | Code | Description |

### cURL Example
```bash
curl -X GET ... complete command ...
```
```

For each endpoint document: method, path, auth scope, all parameters (path, query, body), request body schema, response schema with example, all error responses, and a working cURL example.

## 2.4 — Error Codes Reference

Generate `docs/api-reference/error-codes.md`:

1. Extract all error codes from error handling middleware in source code
2. Cross-reference with OpenAPI spec error responses
3. Produce a master table:

| HTTP Status | Error Code | Description | Common Cause | Resolution |
|-------------|-----------|-------------|--------------|------------|
| 400 | `VALIDATION_ERROR` | Request body failed validation | Missing required field | Check request body against schema |
| 401 | `AUTH_MISSING` | No authentication provided | Missing Authorization header | Include Bearer token |
| ... | ... | ... | ... | ... |

4. Group errors by category: authentication, validation, resource, rate limiting, server

## 2.5 — Rate Limiting Documentation

Generate `docs/api-reference/rate-limiting.md`:

1. **Rate limit tiers** — Table showing limits by plan/API key type
2. **Rate limit headers** — Document `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
3. **Handling 429 responses** — Exponential backoff strategy with code examples in Python and JavaScript
4. **Requesting increases** — Process for requesting higher rate limits

## 2.6 — Webhook Documentation

Generate `docs/api-reference/webhooks.md` (if AsyncAPI specs or webhook implementation exists):

1. **Available events** — Table of all webhook events with descriptions
2. **Payload format** — JSON example for each event type
3. **Signature verification** — Code examples for verifying webhook signatures in Python, JavaScript, and Go
4. **Retry policy** — How failed deliveries are retried (intervals, max attempts)
5. **Testing locally** — Step-by-step instructions using ngrok or localtunnel
6. **Best practices** — Respond with 200 quickly, process asynchronously, handle duplicate deliveries

## 2.7 — Auto-Generated Reference

Generate artifacts in `docs/api-reference/generated/`:

1. Copy the OpenAPI spec as `openapi.json` for consumers to download
2. Generate `openapi.html` using Redoc standalone HTML (single-file, works without a server)
3. This serves as a machine-readable fallback that works independently of the Docusaurus site

## Output Deliverables

| Artifact | Path |
|----------|------|
| Authentication guide | `docs/api-reference/authentication.md` |
| Endpoint pages | `docs/api-reference/endpoints/<resource>.md` (one per resource) |
| Error codes reference | `docs/api-reference/error-codes.md` |
| Rate limiting guide | `docs/api-reference/rate-limiting.md` |
| Webhooks guide | `docs/api-reference/webhooks.md` |
| OpenAPI JSON | `docs/api-reference/generated/openapi.json` |
| Redoc HTML | `docs/api-reference/generated/openapi.html` |

## Validation Loop

Before moving to Phase 3:
- Every endpoint in the OpenAPI spec has a corresponding documentation page
- Authentication guide has working code examples in at least 3 languages
- Error codes table covers every error defined in source code
- All code examples are complete (no `...` or placeholders in runnable code)
- Webhook documentation covers all events in AsyncAPI spec (if applicable)
- `<!-- TODO -->` comments are inserted where source artifacts are missing (never fabricate)

## Quality Bar

- API consumer can integrate using only these docs (no source code needed)
- Every code example includes expected output or response
- Error table has resolution steps, not just descriptions
- Rate limiting section includes backoff code, not just prose
