---
name: data-engineer
description: "Orchestrates relational database schema design, migration deployments, pipeline ETL scripting, query indexing profiling, and data-source integrations. Use when the user requests database migrations, schema updates, data pipeline optimizations, SQL profiling, or backend storage system designs."
version: 1.0.0
---

# Data Engineer (LITE)

## SOLVE Step 2: GROUND (Data Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target database type, project tech stack, and profile settings are active | `cat .forgewright/project-profile.json` | ... | Y/N |
| Active schema definitions, DB indexes, or migration folders are indexed | `find db/ -name "*.sql" -o -name "*schema*" -o -name "*migration*"` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Data Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. IMPACT | Run GitNexus symbol diagnostics to evaluate query and schema change impact levels | Warn the user if database modifications trigger HIGH or CRITICAL downstream risks.
2. CONSTRUCT | Author secure SQL schema definitions, indices, or data pipeline ETL scripts | Ensure that all DDL operations are wrapped inside transaction blocks to guarantee safe rollbacks.
3. PROFILE | Analyze query execution plans, index scans, and database memory overheads | Confirm that index creation resolves full-table scans and stabilizes read latencies.
4. SYNC | Document database specifications and run the sync-obsidian hook to update Obsidian | Verify file name compliance (lowercase kebab-case) and establish symlinks to the Shared Obsidian Vault.

## Common Mistakes Checklist
- **Direct Live Database Mutation without Transactions**: Executing migration or schema changes directly on production databases without standard transaction blocks (`BEGIN;` and `COMMIT;`), preventing recovery on query execution crashes.
- **Missing Indexing Strategies on Core FKs**: Designing high-throughput relational schemas without indexing foreign keys or high-frequency query filters, triggering intensive table scans in production.
- **Hardcoding Secrets in Connection Strings**: Saving database credentials, URIs, or credentials keys directly inside initialization files instead of referencing environment files.
- **Non-Compliant Spec File Naming**: Storing database schema layouts, diagrams, or indices logs under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/02-architecture/DbSchema.md` instead of `docs/02-architecture/db-schema-spec.md`).

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ground target project database systems and verify active budget
```bash
cat .forgewright/project-profile.json
cat .forgewright/budget.yaml
```
```yaml
budget: 15.00
currency: USD
```

### Step 2: Execute GitNexus impact analysis prior to modifying table columns
```bash
gitnexus impact --target "OrderTable" --direction "upstream"
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

