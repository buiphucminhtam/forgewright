# Phase 1: Threat Modeling

## Objective

Perform STRIDE threat analysis for every service in the system, map the complete attack surface, define trust boundaries, and annotate data flow diagrams with threat overlays. Generate all outputs in `.forgewright/security-engineer/threat-model/`. The security-engineer is the SOLE AUTHORITY on STRIDE threat modeling -- no other skill performs this analysis.

## Context Bridge

Read Phase 0 (Reconnaissance) outputs. You should already know every service, its language/framework, entry points, exposed APIs, data flows, auth mechanisms, and external integrations. If Phase 0 was not explicitly run, perform reconnaissance inline before proceeding.

## Inputs

- Architecture docs -- `docs/architecture/` (ADRs, system diagrams, data flow)
- API specs -- `api/` (OpenAPI, gRPC proto, AsyncAPI)
- Data schemas -- `schemas/` (ERD, migrations, data flow diagrams)
- Implementation code -- `services/`, `frontend/` (controllers, middleware, routes)
- Infrastructure configs -- `infrastructure/` (Terraform, K8s manifests)
- Prior pipeline artifacts -- any existing `.forgewright/` outputs from other skills

If any inputs are missing, note the gap and flag it as an incomplete audit area in the output.

## Workflow

### Step 1: Enumerate Services and Entry Points

For every service discovered in reconnaissance:
- List all publicly exposed endpoints (HTTP routes, gRPC methods, WebSocket handlers)
- List all internal service-to-service communication channels
- List all data ingestion points (file uploads, webhooks, message queue consumers, cron jobs)
- List all admin interfaces and debug endpoints

### Step 2: STRIDE Analysis Per Service

Perform STRIDE analysis for EACH service independently. Do not produce a single generic STRIDE table -- each service has unique threat characteristics.

For each service, evaluate all six categories:

| Category | Question to Answer |
|----------|-------------------|
| **Spoofing** | How can an attacker impersonate a legitimate user or service? |
| **Tampering** | Where can data be modified between trust boundaries? |
| **Repudiation** | Which operations lack audit trails? Can users deny transactions? |
| **Information Disclosure** | Where does sensitive data leak -- logs, errors, APIs, caches? |
| **Denial of Service** | Which endpoints are resource-intensive? Missing rate limits? |
| **Elevation of Privilege** | Where can horizontal or vertical privilege escalation occur? |

For each identified threat, assign:
- **Likelihood:** Low / Medium / High / Critical
- **Impact:** Low / Medium / High / Critical
- **Risk Score:** Likelihood x Impact using a standard risk matrix
- **Existing Mitigations:** What the codebase already has
- **Recommended Mitigations:** What must be added

### Step 3: Map Attack Surface

Enumerate the complete attack surface and classify each area:

- **Exposed** -- internet-facing, no authentication required
- **Protected** -- internet-facing, authentication required
- **Internal** -- service-to-service only
- **Restricted** -- admin-only access

Include: external endpoints, internal service APIs, data ingestion points, admin interfaces, client-side exposure (frontend code, mobile APIs, WebSocket connections), and third-party callbacks (OAuth redirects, payment webhooks).

### Step 4: Define Trust Boundaries

Document every trust boundary crossing in the system:

- External user to API gateway
- API gateway to backend services
- Service to service (mTLS? service mesh? shared secret?)
- Service to database
- Service to external APIs
- Service to message queue

For each boundary, document: what validation occurs, what validation is missing, data transformation or sanitization applied, and credentials or tokens passed across.

### Step 5: Annotate Data Flow with Threats

Trace sensitive data (PII, credentials, tokens) through the entire system:

- Mark where encryption is applied and where data is plaintext
- Identify caching layers that may hold sensitive data
- Flag logging pipelines that may capture PII or credentials
- Document serialization/deserialization points (injection vectors)
- Map cross-service propagation of auth tokens and user context

### Step 6: Build Threat Matrix

Compile all findings into a threat matrix with columns: Threat ID, Service, STRIDE Category, Description, Likelihood, Impact, Risk Score, Existing Mitigations, Recommended Mitigations, Status.

Sort by risk score descending. Critical and High items become priority inputs for Phase 2 (Code Audit).

## Output Deliverables

Write all outputs to `.forgewright/security-engineer/threat-model/`:

| File | Contents |
|------|----------|
| `stride-analysis.md` | Per-service STRIDE tables with risk scoring |
| `attack-surface.md` | Complete attack surface inventory with classification |
| `trust-boundaries.md` | Trust boundary definitions and crossing analysis |
| `data-flow-threats.md` | Data flow diagrams annotated with threat overlays |

## Validation

Before proceeding to Phase 2, verify:
- [ ] Every service in the architecture has its own STRIDE table
- [ ] Every external-facing endpoint appears in the attack surface map
- [ ] Every trust boundary crossing has validation assessment
- [ ] Data flow traces cover PII from ingestion through storage to retrieval
- [ ] Threat matrix is sorted by risk score with no blank severity fields

## Quality Bar

A threat model is NOT complete if it reads like a generic checklist. Every threat must reference specific services, endpoints, or code paths discovered during reconnaissance. "SQL injection is possible" is not a threat -- "The /api/v1/users endpoint in user-service constructs queries via string concatenation at src/routes/users.js:42" is a threat.

**Present the threat model to the user for review before proceeding to Phase 2.**
