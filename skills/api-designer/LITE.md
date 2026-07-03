---
name: api-designer
description: "Designs production-grade APIs — REST, GraphQL, gRPC, and AsyncAPI patterns including pagination, versioning, error handling, rate limiting, and API governance. Use when the user asks to design APIs, create endpoints, build an API layer, write OpenAPI specs, or needs help with REST/GraphQL/gRPC service design."
version: 2.0.0
tags: [api, rest, graphql, grpc, openapi, asyncapi, versioning, design, contracts]
---

# API Designer (LITE)

## SOLVE Step 2: GROUND (API Designer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| OpenAPI spec path exists | Search directory for `openapi.yaml` or `swagger.json` | ... | Y/N |
| Spec version format | Read file header of the OpenAPI spec | ... | Y/N |
| API linting tool exists | Check for `spectral` or `swagger-cli` in `package.json` | ... | Y/N |
| Error Schema Convention | Look for RFC 7807 references in docs/spec | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (API Designer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
- `n. ACTION (draft API endpoint path) | TARGET (api/openapi/spec.yaml) | CHECK (npx spectral lint api/openapi/spec.yaml)`
- `n. ACTION (define response schemas) | TARGET (api/openapi/spec.yaml) | CHECK (npx spectral lint api/openapi/spec.yaml)`
- `n. ACTION (add pagination parameters) | TARGET (api/openapi/spec.yaml) | CHECK (npx spectral lint api/openapi/spec.yaml)`
- `n. ACTION (validate spec compiles) | TARGET (api/openapi/spec.yaml) | CHECK (npx swagger-cli validate api/openapi/spec.yaml)`

---

## Worked Example: Paginated Products API Specification

### 1. UNDERSTAND
- **Task**: Design an OpenAPI 3.0 specification for GET `/v1/products` with pagination (`limit`, `cursor`) and versioning.
- **What must be TRUE**: Valid OpenAPI 3.0 file, contains schema for paginated responses, compiles, linter runs with zero errors.
- **What could I be wrong about**: Incorrect JSON schema syntax inside parameter specifications.

### 2. GROUND
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Spec directory exists | `ls api/openapi` | Directory exists | Y |
| Linter tool is available | `npx spectral --version` | Spectral v6.5.0 | Y |
| Main spec file exists | `ls api/openapi/spec.yaml` | File exists | Y |

### 3. DECOMPOSE
1. ACTION (define /v1/products route) | TARGET (api/openapi/spec.yaml) | CHECK (npx spectral lint api/openapi/spec.yaml)
2. ACTION (define paginated schema response) | TARGET (api/openapi/spec.yaml) | CHECK (npx spectral lint api/openapi/spec.yaml)
3. ACTION (validate API specification compilation) | TARGET (api/openapi/spec.yaml) | CHECK (npx swagger-cli validate api/openapi/spec.yaml)

### 4. EXECUTE
#### Step 1: Define route
- Wrote `/v1/products` GET request params for limit and cursor in `api/openapi/spec.yaml`.
- CHECK: `npx spectral lint api/openapi/spec.yaml` -> Passed (warnings only).

#### Step 2: Define response schema
- Added inline schema definitions for `Product` and `PaginatedProductsResponse`:
```yaml
paths:
  /v1/products:
    get:
      summary: List products
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
        - name: cursor
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Paginated product list
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      type: object
                      properties:
                        id: { type: string }
                        name: { type: string }
                  next_cursor:
                    type: string
```
- CHECK: `npx spectral lint api/openapi/spec.yaml` -> Passed.

#### Step 3: Validate compile
- CHECK: `npx swagger-cli validate api/openapi/spec.yaml` -> Passed.

### 5. VERIFY
CLAIM: products API spec compiles cleanly and complies with OpenAPI 3.0 rules
COMMAND: npx swagger-cli validate api/openapi/spec.yaml
OUTPUT:
api/openapi/spec.yaml is valid
EXIT CODE: 0
VERDICT: PASS
