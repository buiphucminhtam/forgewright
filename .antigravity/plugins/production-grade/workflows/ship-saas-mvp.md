---
description: Build and ship a SaaS MVP using the full production-grade pipeline with optimized settings for rapid delivery
---

# Ship SaaS MVP Workflow

Use this workflow when starting a new SaaS product from scratch.

## Prerequisites
- Clear product idea or domain
- Target audience defined (even roughly)

## Steps

1. **Initialize the production-grade pipeline in Full Build mode**
   ```
   Use production-grade skill in Full Build mode
   ```

2. **Product Manager Phase (Express engagement)**
   - Quick 3-5 question interview to scope MVP
   - Focus on: core value prop, target user, 3 key features
   - Output: Lean BRD with user stories (max 8-10 stories for MVP)
   - **Gate: Approve BRD before architecture**

3. **Solution Architect Phase**
   - Tech stack selection optimized for speed: Next.js + PostgreSQL + Vercel/Railway
   - API-first design with OpenAPI specs
   - Simple monolith architecture (don't over-engineer MVP)
   - Output: Tech stack ADR, API contracts, ERD
   - **Gate: Approve architecture before building**

4. **Parallel Build Phase**
   - Software Engineer: Backend services, API handlers, auth, data layer
   - Frontend Engineer: UI components, pages, design system, responsive layout
   - Database Engineer: Schema, migrations, seed data

5. **Quality Phase**
   - QA: Unit + integration tests for critical paths
   - Code Reviewer: Quick review for production readiness
   - Security Engineer: Basic audit (auth, injection, OWASP top 5)

6. **Ship Phase**
   - DevOps: Dockerfile, CI/CD pipeline (GitHub Actions), deployment config
   - SRE: Basic monitoring, health checks, error tracking (Sentry)

7. **Documentation**
   - Technical Writer: API docs, README, deployment guide

## Recommended Config

```yaml
# .production-grade.yaml
engagement_mode: express
parallel_dispatch:
  enabled: true
  strategy: worktree
overrides:
  skip_skills: [mobile-engineer, parallel-dispatch]
  qa:
    depth: essential  # Skip performance and visual regression for MVP
  security:
    depth: essential  # OWASP top 5, not full audit
```

## Expected Timeline
- Full pipeline: ~2-4 hours of agent time
- Output: Deployable SaaS with auth, core features, tests, and CI/CD
