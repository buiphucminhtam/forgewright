---
name: liveops-engineer
description: "Orchestrates live operations, service status monitoring, deployment verification, game/SaaS hotfixes, dynamic configuration updates, and operational runbook management. Use when the user requests live server status checks, production hotfixes, database migrations, configuration flag updates, or system health reporting."
version: 1.0.0
---

# Liveops Engineer (LITE)

## SOLVE Step 2: GROUND (Liveops Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project tech stack, operational profile, and status are active | `cat .forgewright/project-profile.json` | Identifies primary environment frameworks and health baseline | |
| Live environment configs, feature flags, or server variables are indexed | `find . -name "*.env" -o -name "config*.json" -o -name "docker-compose*.yml"` | Locates active environment configurations and network layouts | |
| Standardized product templates and operations runbooks exist | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Ensures feature specifications and BDD-first layouts are loaded | |
| Active API expenditure limit rules and token trackers are configured | `cat .forgewright/budget.yaml` | Verifies current session spend parameters and warning thresholds | |

## SOLVE Step 3: DECOMPOSE (Liveops Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Review live service logs, resource metrics, and database connections | Verify that active process metrics, server health endpoints, and database connection pools are within safety bounds.
2. HOTFIX | Implement targeted hotfixes, remote config adjustments, or schema migrations | Ensure that modifications contain strict validation guards and a clearly documented rollback script.
3. VERIFY | Execute post-deployment endpoint checks and integration smoke tests | Confirm that target APIs respond with HTTP 200 OK and no lingering exceptions are generated in system logs.
4. SYNC | Document incident post-mortems and sync operational files to the Shared Obsidian Vault | Ensure report files use lowercase kebab-case naming under `docs/05-operations/` and run post-skill sync hooks.

## Common Mistakes Checklist
- **Direct Live Database Mutation without Backup or Rollback**: Executing raw, manual SQL queries or schema migrations directly on production systems without running dry-run audits, risking catastrophic data loss.
- **Hardcoding Dynamic Environment Variables**: Hardcoding server URLs, feature flags, or integration tokens within source code instead of referencing environment files or secure vault stores.
- **Dangling Connections and Resource Leaks**: Launching a hotfix that opens new database socket threads or process loops without implementing clean socket terminations, causing server memory exhaustion.
- **Non-Compliant Incident File Naming**: Saving server post-mortems, system logs, or hotfix records under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/05-operations/LiveOpsHotfix.md` instead of `docs/05-operations/liveops-hotfix.md`).
- **Unverified AI Token Spending**: Initiating automated incident logs extraction or large-scale operational reviews without verifying active budget limits in `.forgewright/budget.yaml`.

## Worked Example

### Step 1: Ground active environment settings and service profile
```bash
cat .forgewright/project-profile.json
cat .forgewright/budget.yaml
```
Output:
```json
{
  "project_name": "forgewright-saas-platform",
  "tech_stack": ["Node.js", "Express", "PostgreSQL"],
  "health_status": "PASS"
}
```
```yaml
budget: 25.00
currency: USD
```

### Step 2: Implement a safe PostgreSQL schema hotfix script under `scripts/migrations/patch-user-index.sql`
```sql
-- Up Migration: Create optimized index to resolve production latency
-- Grounded Rule: Wrap in TRANSACTION block to guarantee safe rollback on failure
BEGIN;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_active 
ON users (last_active_at DESC);

-- Rollback scenario check logic
COMMIT;
```

### Step 3: Execute dry-run and verify the production endpoint health status
```bash
# Check syntax of migration script
psql -f scripts/migrations/patch-user-index.sql --dry-run

# Run local smoke tests on the API health endpoint
curl -f http://localhost:3000/api/health
```
Output:
```
[INFO] Schema migration syntax verified. (DRY-RUN SUCCESS)
{"status": "ok", "database": "connected", "redis": "connected"}
```

### Step 4: Write compliant incident post-mortem logs and run the sync script
```bash
cat << 'EOF' > docs/05-operations/latency-hotfix-report.md
# Incident Post-Mortem: User Query Latency Resolving

## 1. Executive Summary
Resolved high production query latency on user dashboard loads by creating a concurrent database index.

## 2. Technical Profile
- Target Database: PostgreSQL
- Applied Script: `scripts/migrations/patch-user-index.sql`
- Performance Impact: Query response times reduced from 1.2s to 12ms.
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for latency-hotfix-report.md.
[SUCCESS] Symlinked docs/05-operations/latency-hotfix-report.md to /workspace/shared-obsidian-vault/forgewright/05-operations/latency-hotfix-report.md.
```
