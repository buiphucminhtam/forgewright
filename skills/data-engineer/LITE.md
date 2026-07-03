---
name: data-engineer
description: "Orchestrates relational database schema design, migration deployments, pipeline ETL scripting, query indexing profiling, and data-source integrations. Use when the user requests database migrations, schema updates, data pipeline optimizations, SQL profiling, or backend storage system designs."
version: 1.0.0
---

# Data Engineer (LITE)

## SOLVE Step 2: GROUND (Data Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target database type, project tech stack, and profile settings are active | `cat .forgewright/project-profile.json` | Displays onboarded stack (e.g., PostgreSQL, SQLite, Redis) and status [1] | |
| Active schema definitions, DB indexes, or migration folders are indexed | `find db/ -name "*.sql" -o -name "*schema*" -o -name "*migration*"` | Identifies active SQL migrations, tables, and target data schemas | |
| Standard feature specs and BDD-first testing templates are present | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Ensures design specifications conform to the standard layout format [2] | |
| Running token tracker budget and spending safety ceilings are active | `cat .forgewright/budget.yaml` | Verifies cost boundaries prior to starting heavy query optimizations [3] | |

## SOLVE Step 3: DECOMPOSE (Data Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. IMPACT | Run GitNexus symbol diagnostics to evaluate query and schema change impact levels [4] | Warn the user if database modifications trigger HIGH or CRITICAL downstream risks [4].
2. CONSTRUCT | Author secure SQL schema definitions, indices, or data pipeline ETL scripts | Ensure that all DDL operations are wrapped inside transaction blocks to guarantee safe rollbacks.
3. PROFILE | Analyze query execution plans, index scans, and database memory overheads | Confirm that index creation resolves full-table scans and stabilizes read latencies.
4. SYNC | Document database specifications and run the sync-obsidian hook to update Obsidian [5] | Verify file name compliance (lowercase kebab-case) [2] and establish symlinks to the Shared Obsidian Vault [5].

## Common Mistakes Checklist
- **Direct Live Database Mutation without Transactions**: Executing migration or schema changes directly on production databases without standard transaction blocks (`BEGIN;` and `COMMIT;`), preventing recovery on query execution crashes.
- **Missing Indexing Strategies on Core FKs**: Designing high-throughput relational schemas without indexing foreign keys or high-frequency query filters, triggering intensive table scans in production.
- **Hardcoding Secrets in Connection Strings**: Saving database credentials, URIs, or credentials keys directly inside initialization files instead of referencing environment files.
- **Non-Compliant Spec File Naming**: Storing database schema layouts, diagrams, or indices logs under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/02-architecture/DbSchema.md` instead of `docs/02-architecture/db-schema-spec.md`) [2].
- **Unverified Token Budgets**: Initiating intensive query analyzer passes or generating recursive synthetic mock datasets without verifying spending boundaries inside `.forgewright/budget.yaml` [3].

## Worked Example

### Step 1: Ground target project database systems and verify active budget
```bash
cat .forgewright/project-profile.json
cat .forgewright/budget.yaml
```
Output:
```json
{
  "project_name": "forgewright-data-service",
  "tech_stack": ["PostgreSQL", "Node.js"],
  "health_status": "PASS"
}
```
```yaml
budget: 15.00
currency: USD
```

### Step 2: Execute GitNexus impact analysis prior to modifying table columns
```bash
gitnexus impact --target "OrderTable" --direction "upstream"
```
Output:
```
[INFO] Querying symbol graph database...
[INFO] "OrderTable" is imported/referenced by 3 active modules.
[SUCCESS] Blast Radius Risk Level: LOW (Low risk changes permitted)
```

### Step 3: Write an optimized PostgreSQL migration script wrapping operations safely in a transaction
Create `db/migrations/patch-order-indexes.sql`:
```sql
-- Up Migration: Create optimized indices for performance
-- Enforce TRANSACTION to guarantee safe rollbacks on execution blocks
BEGIN;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_id 
ON orders (customer_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_at_desc 
ON orders (created_at DESC);

COMMIT;
```

### Step 4: Run a dry-run linting check and verify database metrics
```bash
# Verify SQL syntax against standard targets
psql -f db/migrations/patch-order-indexes.sql --dry-run
```
Output:
```
[INFO] Schema migration syntax verified. (DRY-RUN SUCCESS)
```

### Step 5: Document layout and synchronize files to the Shared Obsidian Vault
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/02-architecture/order-schema-spec.md
# Database Schema: Order Optimization

## 1. Executive Summary
Optimized query workloads on high-frequency order searches by introducing concurrent customer indices.

## 2. Technical Profile
- Database: PostgreSQL
- Applied Migration: `db/migrations/patch-order-indexes.sql`
- Strategy: Added concurrent index structures on 'customer_id' and 'created_at' fields to avoid table scans
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for order-schema-spec.md.
[SUCCESS] Symlinked docs/02-architecture/order-schema-spec.md to /workspace/shared-obsidian-vault/forgewright/02-architecture/order-schema-spec.md.
```
