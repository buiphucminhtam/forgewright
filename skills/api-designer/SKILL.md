---
name: api-designer
description: "Designs production-grade APIs — REST, GraphQL, gRPC, and AsyncAPI patterns including pagination, versioning, error handling, rate limiting, and API governance. Use when the user asks to design APIs, create endpoints, build an API layer, write OpenAPI specs, or needs help with REST/GraphQL/gRPC service design."
version: 2.0.0
author: forgewright
tags: [api, rest, graphql, grpc, openapi, asyncapi, versioning, design, contracts]
---

# API Designer

> **Identity:** The contract architect. APIs are promises to consumers. Design them thoughtfully — breaking changes cost real money and time.

## Critical Rules

| Rule | Why It Matters |
|------|---------------|
| **URLs contain NO verbs** | REST uses HTTP methods. `/users/{id}` with GET = read, POST = create, PUT = replace, DELETE = remove. |
| **Every list endpoint paginates** | No pagination = unbounded response = DoS vulnerability. Default: cursor-based, 20 items. |
| **Error responses are typed** | Generic 500 errors are useless. Every endpoint needs specific error codes with field-level details. |
| **Breaking changes are versioned** | `/v1/` → `/v2/` is the only safe way to break contracts. Never remove fields without version. |
| **Idempotency for mutations** | POST isn't idempotent. `Idempotency-Key` header prevents duplicate charges/orders. |

---

## Protocols

!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/input-validation.md 2>/dev/null || true`
!`cat skills/_shared/protocols/tool-efficiency.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`
!`cat .forgewright/codebase-context.md 2>/dev/null || true`

**Fallback:** Use notify_user with options. Work continuously. Print progress. Validate inputs.

---

## Engagement Mode

!`cat .forgewright/settings.md 2>/dev/null || echo "No settings — using Standard"`

| Mode | Behavior |
|------|----------|
| **Express** | Fully autonomous. Design APIs with best practices. Report decisions. |
| **Standard** | Surface API style (REST/GraphQL/gRPC), pagination, versioning. Auto-resolve rest. |
| **Thorough** | Full API design document. Walk through resource modeling. Show error taxonomy. |
| **Meticulous** | Walk through each resource. User reviews schemas, error responses. Show API mock. |

---

## Brownfield Awareness

If `.forgewright/codebase-context.md` exists and mode is `brownfield`:

- **READ existing patterns first** — understand current URL structure, naming, error format
- **MATCH existing conventions** — if they use `camelCase`, don't switch to `snake_case`
- **BACKWARD COMPATIBLE** — new endpoints only. Never break existing consumers
- **Document existing patterns** — capture conventions before extending

---

## API Style Selection

Choose the right protocol for your use case:

| Protocol | Strengths | Best For | When NOT to Use |
|----------|-----------|----------|-----------------|
| **REST/JSON** | Ubiquitous, cacheable, human-readable | CRUD resources, public APIs, browser clients | Real-time, high-frequency, complex graphs |
| **GraphQL** | Flexible queries, single endpoint, no over-fetching | Mobile, multiple clients, complex data graphs | Simple CRUD, real-time subscriptions |
| **gRPC** | Binary efficiency, code generation, streaming | Microservices, high-performance, internal | Browser clients, public APIs, simple CRUD |
| **AsyncAPI** | Event-driven, async patterns | Event streams, webhooks, message queues | Synchronous request/response |

### REST vs GraphQL Decision Matrix

```
                    REST                    GraphQL
                    ────                    ───────
Flexibility         Fixed endpoints         Client chooses fields
Over-fetching       Often over-fetches      Precise data needs
Caching             HTTP caching            Custom caching needed
Tooling             Universal               Requires GraphQL tooling
Learning curve      Low                    Medium
```

---

## Input Classification

| Category | Inputs | Behavior if Missing |
|----------|--------|---------------------|
| **Critical** | Domain entities, user stories, feature requirements | STOP — cannot design API without knowing the domain |
| **Degraded** | Existing API patterns, consumer requirements, scale expectations | WARN — use best practice defaults |
| **Optional** | Auth strategy, rate limits, compliance constraints | Continue — sensible defaults |

---

## Phase Index

| Phase | Purpose | Key Activities |
|-------|---------|----------------|
| 1 | Domain Modeling | Entity extraction, relationships, resource classification |
| 2 | Resource Design | URL structure, naming conventions, response formats |
| 3 | Endpoint Specification | OpenAPI/GraphQL/gRPC specs, request/response schemas |
| 4 | Error & Edge Cases | Error taxonomy, edge case handling |
| 5 | Documentation & Governance | Style guide, breaking change policy |

---

## Phase 1: Domain Modeling

**Goal:** Identify API resources from domain entities and relationships.

### Entity Extraction Process

1. **Extract entities from requirements:**
   ```markdown
   ## Entity Inventory
   
   | Entity | Description | Key Attributes |
   |--------|-------------|----------------|
   | User | Platform user | id, email, name, role, tenantId |
   | Order | Customer order | id, userId, status, total, items |
   | Product | Sellable item | id, name, price, inventory |
   | Payment | Order payment | id, orderId, amount, method, status |
   ```

2. **Identify relationships:**
   ```markdown
   ## Relationships
   
   | Relationship | Type | Navigation |
   |-------------|------|-----------|
   | User → Order | One-to-Many | /users/{id}/orders |
   | Order → Product | Many-to-Many (via OrderItem) | /orders/{id}/items |
   | Order → Payment | One-to-One | /orders/{id}/payment |
   ```

3. **Classify resources:**

   | Type | Definition | Example |
   |------|------------|---------|
   | **Primary** | Own endpoints, full CRUD | `/users`, `/orders` |
   | **Sub-resource** | Nested under parent | `/orders/{id}/items` |
   | **Lookup** | Read-only, rarely changes | `/countries`, `/categories` |
   | **Action** | Operations, not data | `/orders/{id}/cancel` |

4. **Map to HTTP methods:**
   ```markdown
   ## HTTP Method Mapping
   
   | Method | Use | Idempotent | Safe |
   |--------|-----|-----------|------|
   | GET | Read resource(s) | Yes | Yes |
   | POST | Create new resource | No | No |
   | PUT | Replace resource entirely | Yes | No |
   | PATCH | Partial update | No | No |
   | DELETE | Remove resource | Yes | No |
   | HEAD | Check resource exists | Yes | Yes |
   | OPTIONS | Check available methods | Yes | Yes |
   ```

---

## Phase 2: Resource Design

**Goal:** Design URL structure, naming, and representation formats.

### URL Naming Rules

```markdown
## URL Structure Rules

| Rule | Correct | Incorrect |
|------|---------|-----------|
| Plural nouns | /users | /user |
| Kebab-case multi-word | /line-items | /lineItems, /line_items |
| No verbs | /orders/{id}/cancel (POST) | /cancelOrder |
| Max 3 nesting levels | /users/{id}/orders | /users/{id}/orders/{oid}/items/{iid}/reviews |
| IDs in path | /users/{id} | /users?id=123 |
| Query for filtering | /orders?status=pending | /orders/pending |

## URL Examples

| Action | URL | Method |
|--------|-----|--------|
| List users | /api/v1/users | GET |
| Get user | /api/v1/users/{id} | GET |
| Create user | /api/v1/users | POST |
| Update user | /api/v1/users/{id} | PATCH |
| Replace user | /api/v1/users/{id} | PUT |
| Delete user | /api/v1/users/{id} | DELETE |
| List user's orders | /api/v1/users/{id}/orders | GET |
| Cancel order | /api/v1/orders/{id}/cancel | POST |
| Search users | /api/v1/users?q=name:john | GET |
```

### Response Envelope Patterns

```typescript
// Standard envelope
interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    perPage: number;
    cursor?: string;
  };
  links?: {
    self: string;
    next?: string;
    prev?: string;
  };
}

// Success response
{
  "data": { "id": "123", "name": "John" },
  "meta": { "requestId": "req_abc123" }
}

// Collection response
{
  "data": [
    { "id": "1", "name": "Item 1" },
    { "id": "2", "name": "Item 2" }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "perPage": 20,
    "nextCursor": "eyJpZCI6IDIwfQ=="
  },
  "links": {
    "self": "/api/v1/items?page=1",
    "next": "/api/v1/items?cursor=eyJpZCI6IDIwfQ=="
  }
}

// Error response
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body contains invalid fields.",
    "details": [
      { "field": "email", "issue": "must be a valid email address" }
    ],
    "requestId": "req_abc123"
  }
}
```

### Pagination Strategy

| Strategy | Pros | Cons | Use When |
|----------|------|------|----------|
| **Cursor-based** | Consistent with concurrent writes | Can't jump to page N | Default for production APIs |
| **Offset/Limit** | Simple, familiar | Inconsistent with writes | Admin dashboards, internal tools |
| **Keyset** | Efficient, consistent | Requires unique sortable column | Time-series, leaderboards |

```typescript
// Cursor-based pagination (RECOMMENDED)
interface CursorPagination {
  // Request
  cursor?: string;    // Opaque cursor from previous response
  limit?: number;     // Default 20, max 100

  // Response
  data: T[];
  meta: {
    nextCursor?: string;  // Pass to next request
    hasMore: boolean;     // Or use nextCursor === undefined
  };
}

// Example request
GET /api/v1/orders?cursor=eyJpZCI6IDIwfQ==&limit=20

// Example response
{
  "data": [...],
  "meta": {
    "nextCursor": "eyJpZCI6IDMwfQ==",
    "hasMore": true
  }
}
```

---

## Phase 3: Endpoint Specification

**Goal:** Write complete OpenAPI 3.1 specs.

### OpenAPI Spec Template

```yaml
openapi: 3.1.0
info:
  title: Example API
  version: 1.0.0
  description: |
    API for managing orders and products.
    
servers:
  - url: https://api.example.com/v1
    description: Production
  - url: https://api.staging.example.com/v1
    description: Staging

paths:
  /users:
    get:
      summary: List users
      description: Returns a paginated list of users.
      operationId: listUsers
      tags:
        - Users
      security:
        - bearerAuth: []
      parameters:
        - name: cursor
          in: query
          schema:
            type: string
          description: Pagination cursor
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - name: sort
          in: query
          schema:
            type: string
            enum: [created_at, -created_at, name, -name]
          description: Sort field. Prefix with - for descending.
      responses:
        '200':
          description: Success
          headers:
            X-Request-ID:
              schema:
                type: string
              description: Server-generated request ID
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserList'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '429':
          $ref: '#/components/responses/RateLimited'

    post:
      summary: Create user
      description: Creates a new user.
      operationId: createUser
      tags:
        - Users
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '400':
          $ref: '#/components/responses/ValidationError'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /users/{id}:
    get:
      summary: Get user
      operationId: getUser
      parameters:
        - $ref: '#/components/parameters/UserId'
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '404':
          $ref: '#/components/responses/NotFound'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  parameters:
    UserId:
      name: id
      in: path
      required: true
      schema:
        type: string
        format: uuid

  schemas:
    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
        role:
          type: string
          enum: [admin, user, guest]
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
      required:
        - id
        - email
        - name
        - role
        - createdAt
        - updatedAt

    CreateUserRequest:
      type: object
      properties:
        email:
          type: string
          format: email
        name:
          type: string
          minLength: 1
          maxLength: 100
        role:
          type: string
          enum: [user, guest]
          default: user
      required:
        - email
        - name

    UserList:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/User'
        meta:
          $ref: '#/components/schemas/PaginationMeta'

    PaginationMeta:
      type: object
      properties:
        nextCursor:
          type: string
        hasMore:
          type: boolean
        total:
          type: integer

  responses:
    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

    ValidationError:
      description: Validation failed
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

    RateLimited:
      description: Rate limit exceeded
      headers:
        X-RateLimit-Limit:
          schema:
            type: integer
        X-RateLimit-Remaining:
          schema:
            type: integer
        X-RateLimit-Reset:
          schema:
            type: integer
        Retry-After:
          schema:
            type: integer
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

    Error:
      type: object
      properties:
        error:
          type: object
          properties:
            code:
              type: string
            message:
              type: string
            details:
              type: array
              items:
                type: object
                properties:
                  field:
                    type: string
                  issue:
                    type: string
            requestId:
              type: string
          required:
            - code
            - message
```

### Standard Headers

| Header | Direction | Purpose |
|--------|-----------|---------|
| `Authorization` | Request | Bearer token or API key |
| `X-Request-ID` | Both | Request tracking for debugging |
| `X-Idempotency-Key` | Request | Prevent duplicate mutations |
| `Content-Type` | Both | `application/json` |
| `X-RateLimit-*` | Response | Rate limit status |
| `Retry-After` | Response | When to retry (429/503) |
| `ETag` | Response | For conditional requests |
| `Sunset` | Response | Deprecation notice |

---

## Phase 4: Error Design & Edge Cases

**Goal:** Design a comprehensive, consistent error handling system.

### Error Code Taxonomy

```typescript
// Error response schema
interface ErrorResponse {
  error: {
    code: ErrorCode;       // Machine-readable
    message: string;       // Human-readable
    details?: FieldError[]; // Validation details
    requestId: string;    // For debugging
    documentation?: string; // Link to error docs
  };
}

interface FieldError {
  field: string;    // e.g., "email"
  issue: string;   // e.g., "must be a valid email"
  value?: unknown; // Actual value (for debugging)
}

// Error codes by HTTP status
enum ErrorCode {
  // 400 Bad Request
  BAD_REQUEST = 'BAD_REQUEST',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_CONTENT_TYPE = 'INVALID_CONTENT_TYPE',
  MALFORMED_JSON = 'MALFORMED_JSON',

  // 401 Unauthorized
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',

  // 403 Forbidden
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // 404 Not Found
  NOT_FOUND = 'NOT_FOUND',
  RESOURCE_GONE = 'RESOURCE_GONE', // 410 Gone

  // 409 Conflict
  CONFLICT = 'CONFLICT',
  DUPLICATE_RESOURCE = 'DUPLICATE_RESOURCE',
  STALE_UPDATE = 'STALE_UPDATE', // Optimistic lock failure

  // 422 Unprocessable
  UNPROCESSABLE = 'UNPROCESSABLE',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',

  // 429 Too Many Requests
  RATE_LIMITED = 'RATE_LIMITED',

  // 500 Internal Server Error
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // 503 Service Unavailable
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}
```

### Error Response Examples

```json
// Validation error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body contains invalid fields.",
    "details": [
      { "field": "email", "issue": "must be a valid email address", "value": "not-an-email" },
      { "field": "age", "issue": "must be at least 18", "value": 15 }
    ],
    "requestId": "req_abc123"
  }
}

// Conflict error (duplicate)
{
  "error": {
    "code": "DUPLICATE_RESOURCE",
    "message": "A user with this email already exists.",
    "requestId": "req_abc123"
  }
}

// Optimistic locking error
{
  "error": {
    "code": "STALE_UPDATE",
    "message": "The resource was modified by another request.",
    "details": [
      { "field": "version", "issue": "expected 5, actual 6" }
    ],
    "requestId": "req_abc123"
  }
}

// Rate limit error
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please retry later.",
    "details": [
      { "field": "retryAfter", "issue": "retry after 60 seconds" }
    ],
    "requestId": "req_abc123"
  }
}
```

### Edge Case Handling

| Edge Case | Handling |
|-----------|----------|
| **Concurrent updates** | Optimistic locking with `ETag`/`If-Match` header |
| **Batch partial failure** | Return per-item results with success/failure status |
| **Large payload** | Return 413 with `Content-Length` limit documented |
| **Slow response** | Return 202 + status endpoint for async operations |
| **Deleted resource** | Return 410 Gone vs 404 Not Found (410 = known deleted) |
| **Idempotency replay** | Store by `Idempotency-Key` with 24h TTL |
| **Malformed JSON** | Return 400 with specific parse error location |

---

## Phase 5: Documentation & Governance

**Goal:** Generate API documentation and governance rules.

### API Style Guide Template

```markdown
# API Style Guide

## Naming Conventions

### URLs
- Use plural nouns: `/users`, `/orders`
- Kebab-case: `/line-items`, `/order-items`
- No verbs: `/orders/{id}/cancel` (POST) not `/cancelOrder`
- Max 3 path segments: `/users/{id}/orders`

### Fields
- camelCase: `userId`, `createdAt`
- Timestamps: `createdAt`, `updatedAt` (ISO 8601)
- IDs: `id` (UUID)
- Booleans: `isActive`, `hasPermission` (prefix with is/has/can)

## Pagination
- Default: cursor-based
- Default page size: 20
- Max page size: 100
- Cursor in `meta.nextCursor`

## Error Format
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": [...],
    "requestId": "req_..."
  }
}
```

## Versioning Policy
- URL path: `/api/v1/`
- Support N-1 versions
- Deprecation: Sunset header + 6 months notice
```

### Breaking vs Non-Breaking Changes

| Breaking (Require v2) | Non-Breaking |
|----------------------|--------------|
| Remove a field | Add new optional field |
| Change field type | Add new endpoint |
| Remove an endpoint | Add new optional parameter |
| Make required optional | Add new error code |
| Change URL structure | Add new header |
| Remove parameter | Relax validation |

---

## GraphQL Design Patterns

### Schema Design

```graphql
# Types
type User {
  id: ID!
  email: String!
  name: String!
  role: UserRole!
  createdAt: DateTime!
  updatedAt: DateTime!
  orders: OrderConnection!
}

enum UserRole {
  ADMIN
  USER
  GUEST
}

# Pagination with cursor
type OrderConnection {
  edges: [OrderEdge!]!
  pageInfo: PageInfo!
}

type OrderEdge {
  node: Order!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

# Input types for mutations
input CreateUserInput {
  email: String!
  name: String!
  role: UserRole = USER
}

input UpdateUserInput {
  email: String
  name: String
}

# Mutations with error handling
type Mutation {
  createUser(input: CreateUserInput!): CreateUserPayload!
  updateUser(id: ID!, input: UpdateUserInput!): UpdateUserPayload!
  deleteUser(id: ID!): DeleteUserPayload!
}

# Union for mutation results
union CreateUserPayload = User | ValidationError | UnauthorizedError

type ValidationError {
  field: String!
  message: String!
  code: String!
}

type UnauthorizedError {
  message: String!
}
```

---

## gRPC Design Patterns

### Proto Definition

```protobuf
syntax = "proto3";

package orders.v1;

import "google/protobuf/timestamp.proto";
import "google/protobuf/empty.proto";

service OrdersService {
  rpc ListOrders(ListOrdersRequest) returns (ListOrdersResponse);
  rpc GetOrder(GetOrderRequest) returns (Order);
  rpc CreateOrder(CreateOrderRequest) returns (Order);
  rpc CancelOrder(CancelOrderRequest) returns (Order);
}

message Order {
  string id = 1;
  string user_id = 2;
  OrderStatus status = 3;
  int64 total_cents = 4;
  repeated OrderItem items = 5;
  google.protobuf.Timestamp created_at = 6;
  google.protobuf.Timestamp updated_at = 7;
}

message OrderItem {
  string product_id = 1;
  int32 quantity = 2;
  int64 price_cents = 3;
}

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;
  ORDER_STATUS_PENDING = 1;
  ORDER_STATUS_CONFIRMED = 2;
  ORDER_STATUS_SHIPPED = 3;
  ORDER_STATUS_DELIVERED = 4;
  ORDER_STATUS_CANCELLED = 5;
}

message ListOrdersRequest {
  string user_id = 1;
  OrderStatus status = 2;
  int32 page_size = 3;
  string page_token = 4;
}

message ListOrdersResponse {
  repeated Order orders = 1;
  string next_page_token = 2;
  int32 total_size = 3;
}

message GetOrderRequest {
  string id = 1;
}

message CreateOrderRequest {
  string user_id = 1;
  repeated OrderItem items = 2;
}

message CancelOrderRequest {
  string id = 1;
  string reason = 2;
}
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Verbs in URLs | Use nouns + HTTP methods: `GET /users`, `POST /users` |
| Inconsistent naming | Pick camelCase and enforce everywhere |
| No pagination | Every list endpoint paginates. Default: cursor-based, 20 items. |
| Generic errors | Specific codes + field-level details: `VALIDATION_ERROR` |
| Exposing auto-increment IDs | Use UUIDs. Auto-increment leaks data volume. |
| No versioning | Add `/v1/` from day one. Retrofitting is painful. |
| Inconsistent response envelope | Same wrapper: `{ data, meta, links }` |
| Missing idempotency | Support `Idempotency-Key` header for POST |
| Deeply nested URLs | Flatten: `/items?orderId=123` |
| No rate limiting | Every API needs rate limits. Document. Return 429. |

---

## Output Structure

```
api/
├── openapi/
│   ├── openapi.yaml
│   └── components/
│       ├── schemas/
│       ├── responses/
│       └── parameters/
├── graphql/
│   ├── schema.graphql
│   └── resolvers.md
├── grpc/
│   ├── proto/
│   └── generated/
└── docs/
    ├── style-guide.md
    ├── versioning-policy.md
    └── migration-guides/

.forgewright/api-designer/
├── domain-model.md
├── resource-inventory.md
└── design-decisions.md
```

---

## Execution Checklist

- [ ] API style selected (REST/GraphQL/gRPC/AsyncAPI)
- [ ] Domain entities extracted and relationships mapped
- [ ] Resource types classified (primary, sub-resource, lookup, action)
- [ ] URL structure follows naming conventions
- [ ] Response envelope standardized
- [ ] Pagination strategy selected and implemented
- [ ] OpenAPI/GraphQL/proto specs written
- [ ] Error codes defined with field-level details
- [ ] Edge cases handled (concurrent updates, batch failures, etc.)
- [ ] Standard headers documented
- [ ] Rate limiting defined
- [ ] Idempotency strategy for mutations
- [ ] API style guide written
- [ ] Breaking change policy documented
