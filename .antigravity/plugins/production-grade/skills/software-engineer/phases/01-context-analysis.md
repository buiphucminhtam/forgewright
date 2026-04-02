# Phase 1: Context Analysis

## Objective

Read ALL architecture artifacts from the project root before writing any code. Validate that required inputs exist, extract implementation decisions from ADRs, create a structured implementation plan, and get user approval before proceeding to coding.

## 1.1 — Mandatory Inputs (Fail if Missing)

| Input | Path | What to Extract |
|-------|------|-----------------|
| Tech stack | `docs/architecture/tech-stack.md` | Language, framework, database, cache, message broker |
| API contracts | `api/openapi/*.yaml` | Endpoints, request/response schemas, auth requirements |
| gRPC contracts | `api/grpc/*.proto` | Service definitions, message types |
| Async contracts | `api/asyncapi/*.yaml` | Event schemas, channels, message formats |
| Data models | `schemas/erd.md` | Entity relationships, field types, constraints |
| Migrations | `schemas/migrations/*.sql` | Table structures, indexes, constraints |
| ADRs | `docs/architecture/architecture-decision-records/` | Architecture pattern, communication patterns, data strategy, auth, multi-tenancy |
| Scaffold structure | `services/` | Service names, directory layout, existing boilerplate |

## 1.2 — Extract Implementation Decisions

From the ADRs, determine and document:

```markdown
## Implementation Plan

### Architecture Pattern
- [ ] Monolith / Modular Monolith / Microservices

### Communication
- [ ] REST (OpenAPI) / gRPC / Both
- [ ] Sync vs Async patterns
- [ ] Event bus technology (Kafka/RabbitMQ/SQS/Pub-Sub)

### Data Access
- [ ] ORM vs Query Builder vs Raw SQL
- [ ] Connection pooling strategy
- [ ] Read replicas / Write-read split

### Auth Pattern
- [ ] JWT validation / OAuth2 / Session-based
- [ ] RBAC / ABAC / Policy-based
- [ ] Multi-tenancy isolation level (row / schema / database)

### Services to Implement (ordered by dependency)
1. <service-name> — <purpose> — <endpoint count> — <estimated complexity>
2. ...
```

## 1.3 — Clarify Ambiguities

Use notify_user for anything not covered in the architect's output (batch into 1-2 calls max):

1. **Implementation preferences** — Specific ORM/library preferences? Existing codebase conventions?
2. **Priority ordering** — Which services are MVP-critical vs can-wait?
3. **External service accounts** — Any third-party API keys/SDKs needed? (Stripe, SendGrid, Twilio, etc.)
4. **Feature flag provider** — LaunchDarkly, Unleash, ConfigCat, or env-var based?

**Present the Implementation Plan to user via notify_user for approval before proceeding.**

## Validation Loop

Before moving to Phase 2:
- All mandatory inputs have been read and parsed
- Implementation Plan document is written to `.forgewright/software-engineer/implementation-plan.md`
- User has approved the plan via notify_user
- Ambiguities have been resolved or documented with chosen defaults

## Quality Bar

- Every service listed with dependency order, endpoint count, and complexity estimate
- Architecture pattern, communication, data access, and auth decisions are all documented
- No unresolved blockers — all critical ambiguities addressed

## Context Bridging

This phase reads from the Solution Architect's outputs:

| Architect Output (Project Root) | What to Extract |
|--------------------------------|-----------------|
| `api/openapi/*.yaml` | Endpoint definitions, schemas |
| `api/grpc/*.proto` | Service definitions, messages |
| `api/asyncapi/*.yaml` | Event schemas, channels |
| `schemas/migrations/*.sql` | Table structures |
| `schemas/erd.md` | Relationships, constraints |
| `docs/architecture/tech-stack.md` | Language, framework, libraries |
| `docs/architecture/architecture-decision-records/` | Patterns, trade-offs |
| `services/` (scaffolded) | Service names, structure |

**Do NOT modify architecture files** (`api/`, `schemas/`, `docs/architecture/`). If an API contract needs changes, flag it to the user — do not unilaterally alter the architect's decisions.
