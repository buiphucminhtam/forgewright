---
name: devops
description: >
  [production-grade internal] Sets up deployment and infrastructure —
  Docker, CI/CD pipelines, cloud provisioning, environment configuration.
  Routed via the production-grade orchestrator.
---

### DevOps & Platform Engineering (2026 Edition)

#### Protocols
!cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true
!cat skills/_shared/protocols/input-validation.md 2>/dev/null || true
!cat skills/_shared/protocols/tool-efficiency.md 2>/dev/null || true
!cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"
!cat .forgewright/codebase-context.md 2>/dev/null || true
!cat .agent-guardrails.yml 2>/dev/null || true

**Fallback (if protocols not loaded):** Use `notify_user` with options (never open-ended), "Chat about this" last, recommended first. Work continuously. Print progress constantly. Validate inputs before starting — classify missing as Critical (stop), Degraded (warn, continue partial), or Optional (skip silently). Use parallel tool calls for independent reads. Use `view_file_outline` before full Read.

#### Engagement Mode
!cat .forgewright/settings.md 2>/dev/null || echo "No settings — using Standard"

| Mode | Behavior |
| --- | --- |
| **Express (Vibe Coding)** | **NON-TECHNICAL USER (Autonomous):** Zero-config agentic workflow [1]. Default to Vercel (Frontend), Railway (Backend/DB), or serverless 2.0 deployments [2]. Auto-generate configurations. DO NOT ask for infra choices. Execute intent-based "vibe coding" translating natural language to deployed infrastructure [1, 3]. |
| **Platform (Standard)** | Surface 1-2 critical decisions. Focus on Internal Developer Platform (IDP) templates, GitOps defaults, and standardized "golden paths" for developers [4, 5]. Ask for CI provider and target container registry. |
| **Thorough** | Surface major decisions. Show Docker/Podman strategy [6, 7], CI pipeline design, GreenOps/FinOps parameters [8, 9], and AIOps monitoring architecture before implementing. |
| **Zero-Trust (Meticulous)** | Surface every architectural decision. Enforce strict Zero Trust Architecture (ZTA) [10]. Walk through each Terraform/OpenTofu/Pulumi module [11, 12]. Review Policy-as-Code compliance. User approves all Non-Human Identity (NHI) roles for AI agents and threshold-based auto-remediations [13, 14]. |

#### Brownfield Awareness
If `.forgewright/codebase-context.md` exists and mode is brownfield:
*   **READ existing infrastructure first** — check for Dockerfiles, CI configs, Terraform/OpenTofu/Pulumi state, K8s manifests, and existing IDP blueprints [12, 15].
*   **EXTEND, don't replace** — add new services to existing orchestration, append to existing CI/CD contracts [16]. 
*   **Don't overwrite** existing infrastructure state — these contain production-critical configuration. Overwriting causes drift or catastrophic failures [17, 18].
*   **Match existing patterns** — if they use GitHub Actions, don't create GitLab CI. If they use Pulumi, don't create Terraform. If they use Daemonless Podman, match it [6].

#### Overview
Full DevOps pipeline and Internal Developer Platform (IDP) generator [5, 19]. Generates infrastructure and deployment artifacts at the project root (`infrastructure/`, `.github/workflows/`, `Dockerfiles`) with planning notes in `.forgewright/devops/`. Moves beyond traditional CI/CD to autonomous, self-healing pipelines governed by Policy-as-Code [6, 16].

**Zero-Touch Deployments:** If running for a non-technical user (Express Mode), bypass heavy infrastructure immediately. Generate direct PaaS configurations and autonomous GitHub Actions workflows, allowing the platform to abstract operational complexity [20, 21].

#### Config Paths
Read `.production-grade.yaml` at startup. Use these overrides if defined:
*   `paths.terraform` — default: `infrastructure/iac/` (Supports Terraform, OpenTofu, Pulumi) [12, 22].
*   `paths.kubernetes` — default: `infrastructure/kubernetes/`
*   `paths.ci_cd` — default: `.github/workflows/`
*   `paths.monitoring` — default: `infrastructure/monitoring/`
*   `paths.policies` — default: `infrastructure/policies/` (For OPA/Rego and Agentic Guardrails) [23, 24].

#### When to Use
*   Setting up autonomous CI/CD pipelines for a new or existing project [6, 25].
*   Creating Infrastructure as Code (IaC 2.0) for multi-cloud or edge deployments [26].
*   Containerizing applications with Docker or daemonless Podman [7].
*   Configuring Observability 2.0 (AIOps, OpenTelemetry, dynamic baselines) [27, 28].
*   Implementing DevSecOps, SBOMs/AI-BOMs, SLSA provenance, and NHI secrets management [29, 30].
*   Establishing FinOps (cost observability) and GreenOps (carbon-aware scheduling) [9, 31].

#### Parallel Execution
After Phase 1 (Assessment), Phases 2-4 and Phases 5-6 can run as two parallel groups:

**Execution order:**
1. Phase 1: Context Engineering & Assessment (sequential) [32, 33].
2. Phases 2-4: IaC 2.0 + CI/CD Contracts + Container Orchestration (PARALLEL)
3. Phases 5-6: Observability 2.0 (AIOps) + Zero-Trust Security (PARALLEL, after Group 1)

---

#### Process Flow

#### Phase 1: Infrastructure Assessment & Context Engineering
Use `notify_user` to gather constraints (batch into 2-3 calls max):
1.  **Current state** — Existing infra? Greenfield? IDP availability? 
2.  **Application profile** — Agentic AI workload, RAG pipeline, stateful/stateless, edge computing needs [34, 35]?
3.  **Scale & FinOps** — Traffic patterns, auto-scaling needs, budget targets, Carbon-aware/GreenOps constraints [8, 9].
4.  **Environments** — Environment parity strategy via GitOps [36].
5.  **Compliance & Security** — SOC2/HIPAA/PCI, EU AI Act, SLSA levels, Zero-Trust mandates [37, 38].
6.  **Team capabilities** — Platform engineering maturity, AIOps readiness, AI agent delegation limits [5, 39].

#### Phase 2: Infrastructure as Code 2.0 (IaC / Platform Engineering)
Generate `infrastructure/iac/` supporting Terraform, OpenTofu, or Pulumi [11, 12].
**IaC 2.0 Standards:**
*   **GitOps Source of Truth** — Declarative definitions mapped to Git for continuous reconciliation and automated drift remediation [17, 18].
*   **Remote State** — Backend with state locking and encryption.
*   **Policy-as-Code** — Enforce OPA/Rego checks on all configurations prior to provisioning [24, 40].
*   **FinOps & GreenOps Tagging** — Enforce mandatory tagging for environment, service, cost-center, and sustainability metrics [9, 41].
*   **AI Agent Infrastructure** — If deploying an agent, provision Vector DBs, MCP (Model Context Protocol) servers, and dedicated Agentic memory stores [42, 43].

**Multi-Cloud Provider Configs:**
Target services optimized for 2026 patterns (Serverless 2.0, Edge, and AI-native):

| Resource | AWS | GCP | Azure |
| --- | --- | --- | --- |
| Compute | ECS Fargate / EKS / Lambda | Cloud Run / GKE | Container Apps / AKS |
| Database | Aurora Serverless v2 | Cloud SQL / AlloyDB | Azure SQL Serverless |
| Vector/AI DB | Bedrock Knowledge Bases | Vertex AI Vector Search | Azure Cosmos DB Vector |
| Cache/Queue | ElastiCache / SQS | Memorystore / Pub/Sub | Azure Cache / Service Bus |
| Secrets | Secrets Manager | Secret Manager | Key Vault |

**Present IaC design to user for approval before proceeding.**

#### Phase 3: Autonomous CI/CD Pipelines
Generate CI/CD pipelines as enforceable contracts at `.github/workflows/` [16].

**CI Pipeline Stages (DevSecOps Shift-Left):**
1.  **Checkout & cache** — Restore dependency caches.
2.  **Lint & Type check** — Fail-fast code quality.
3.  **AI Code Review** — Automated analysis by an AI agent (e.g., checking for logic drift or context rot) [44, 45].
4.  **Unit & Integration Tests** — Run parallelized, deterministic tests (testcontainers) with AI-driven self-healing test resolution [46, 47].
5.  **Security & Supply Chain** — SAST, DAST, SCA, API Security [48, 49]. **Crucial:** Generate SBOMs and AI-BOMs, verify artifact signatures (Sigstore), and confirm SLSA-3+ compliance [13, 50].
6.  **Build & Push** — Build daemonless (Podman) or Docker images [6]. Push to immutable registry tags.

**CD Pipeline Stages (Progressive Delivery):**
1.  **GitOps Sync** — Pipeline updates declarative state (Argo CD / Flux) [51].
2.  **Deploy to Staging** — Auto-deploy on merge.
3.  **Automated Quality Gates** — Smoke tests + AI-driven performance validation.
4.  **Production Rollout** — Blue-Green or Canary strategies.
5.  **AIOps Verification** — Post-deploy synthetic monitoring. Trigger automated rollback via AIOps agents on error spikes [52, 53].

#### Phase 4: Container & Cloud-Native Orchestration
Generate container artifacts at project root and `infrastructure/`:

**Containerization (Docker / Podman):**
*   Multi-stage builds (builder -> runtime).
*   Non-root user (`USER nonroot`) and Daemonless execution where possible [6, 7].
*   Minimal base images (distroless/alpine/scratch) to reduce attack surface.
*   No secrets in image layers. Inject at runtime via MCP or Secrets Manager [54, 55].

**Kubernetes (K8s) & Serverless 2.0:**
Generate manifests at `infrastructure/kubernetes/`:
*   **Resource limits** — CPU/Memory requests, configured for FinOps efficiency [56].
*   **Autoscaling** — KEDA for event-driven scaling or HPA based on custom metrics.
*   **Network Policies** — Strict micro-segmentation. Default deny, explicit allow [10, 57].
*   **Service Mesh** — Istio/Linkerd configuration for mTLS, zero-trust traffic routing, and observability [58].
*   **Agentic Workload Configs** — Dedicated isolation for AI workloads, restricting root access and enforcing egress filtering for sandboxed execution [59, 60].

#### Phase 5: Observability 2.0 & AIOps
Generate configs at `infrastructure/monitoring/`.
*Note: SRE defines SLO thresholds; DevOps implements the observability fabric [61].*

**Intelligent Observability (AIOps):**
1.  **OpenTelemetry (OTel)** — Default standard for unifying logs, metrics, and distributed traces across all microservices and AI agents [28].
2.  **Predictive Telemetry** — Configure metrics to feed into AIOps platforms (e.g., Datadog, Dynatrace) to predict and auto-remediate anomalies before outages occur [62, 63].
3.  **Four Golden Signals** — Latency, Traffic, Errors, Saturation.
4.  **AI/LLM Observability** — If deploying agents, trace token usage, prompt latency, tool-calling success rates, and hallucination metrics [64, 65].
5.  **FinOps Dashboards** — Cloud cost visibility integrated directly into engineering dashboards [66, 67].

#### Phase 6: Zero-Trust & DevSecOps
Generate `infrastructure/security/`:

**Security Standards (2026 Requirements):**
*   **Zero Trust Architecture (ZTA)** — Continuous authentication, identity-first security as the control plane. No implicit trust [10, 68, 69].
*   **Non-Human Identity (NHI) Management** — AI agents and CI/CD pipelines must use short-lived, ephemeral credentials with strictly scoped IAM roles [13, 60].
*   **Policy-as-Code** — Automated compliance validation in pipelines [40, 70].
*   **Post-Quantum Cryptography (PQC) Readiness** — Enable crypto-agility layers and TLS 1.3 to future-proof data in transit [71, 72].
*   **AI Agent Guardrails** — Prevent prompt injection and unintended tool execution by enforcing strict Model Context Protocol (MCP) tool allowlists and human-in-the-loop triggers for high-risk actions [13, 73].

#### Output Structure
**Project Root Output:**
*   `Dockerfile` / `Containerfile`
*   `.github/workflows/ci.yml`, `cd.yml`, `security-scan.yml`
*   `.agent-guardrails.yml` (If AI components exist)

**Workspace Output (`.forgewright/devops/`):**
*   `architecture-design.md`
*   `finops-strategy.md`

#### Common Mistakes
| Mistake | 2026 Fix |
| --- | --- |
| Assuming AI agents are secure by default | Treat agents as Non-Human Identities (NHIs), enforce MCP allowlists, and deploy in microVM sandboxes [59, 74]. |
| ClickOps / Manual Infrastructure | Enforce GitOps and IaC 2.0 (OpenTofu/Terraform) as the strict source of truth [75, 76]. |
| Post-deployment cost surprises | Embed FinOps tagging and cost-estimation checks directly into the CI/CD pipeline [8, 66]. |
| Treating security as a final gate | Implement Policy-as-Code and DevSecOps validations at the very first commit [48, 77]. |
| Pipeline sprawl and tool fatigue | Consolidate around an Internal Developer Platform (IDP) with standardized "golden paths" [5, 15]. |
| Ignored Observability on AI Models | Instrument OpenTelemetry for LLMs to track token usage, context rot, and reasoning traces [33, 65]. |
| Relying on manual incident response | Integrate AIOps auto-remediation loops and predictive anomaly detection [78, 79]. |
