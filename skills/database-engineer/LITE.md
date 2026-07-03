---
name: database-engineer
description: "[production-grade internal] Designs and optimizes database systems — schema design, query optimization, migration management, indexing strategy, scaling patterns, and multi-database architecture. Routed via the production-grade orchestrator."
version: 2.0.0
tags: [database, postgresql, mysql, mongodb, redis, schema, indexing, migration, scaling]
---

# Database Engineer (LITE)

## SOLVE Step 2: GROUND (Database Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Database dialect / version | Connect to DB and run version query, or check config | ... | Y/N |
| Migration engine is set up | Check `package.json` or schema directory structure | ... | Y/N |
| Slow query log or query plan | Run `EXPLAIN` on the target SQL query | ... | Y/N |
| Indexes present on table | Query db system tables/information schema | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Database Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
- `n. ACTION (write schema migration script) | TARGET (prisma/schema.prisma) | CHECK (npx prisma migrate dev --dry-run)`
- `n. ACTION (apply schema migration) | TARGET (prisma/schema.prisma) | CHECK (npx prisma migrate status)`
- `n. ACTION (analyze execution plan) | TARGET (scripts/db-explain.sql) | CHECK (psql -d mydb -f scripts/db-explain.sql)`
- `n. ACTION (create composite index) | TARGET (prisma/schema.prisma) | CHECK (npx prisma migrate dev)`

---

## Worked Example: Optimizing Slow Tenant Queries

### 1. UNDERSTAND
- **Task**: Optimize a slow query on the `orders` table filtering by `tenant_id` and sorted by `created_at` DESC.
- **What must be TRUE**: Composite index exists, query plan changes from `Seq Scan` to `Index Scan`, query takes < 10ms.
- **What could I be wrong about**: Existing indexes already covered it, database engine ignores index because table is too small in dev.

### 2. GROUND
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Table `orders` exists | `npx prisma db pull` or inspect schema | Exists | Y |
| Query matches | View `src/repo/orders.ts` | `WHERE tenant_id = ? ORDER BY created_at DESC` | Y |
| Exec plan available | Run `EXPLAIN` in DB console | `Seq Scan on orders (cost=0.00..3421.00)` | Y |

### 3. DECOMPOSE
1. ACTION (draft migration for composite index) | TARGET (prisma/schema.prisma) | CHECK (npx prisma migrate dev --name add_orders_tenant_created_idx --create-only)
2. ACTION (apply index migration) | TARGET (prisma/schema.prisma) | CHECK (npx prisma db push)
3. ACTION (run EXPLAIN to verify scan type) | TARGET (scripts/explain.sql) | CHECK (psql -d forgewright -f scripts/explain.sql)

### 4. EXECUTE
#### Step 1: Draft migration
- Modified `prisma/schema.prisma` adding index:
```prisma
model Order {
  id        String   @id
  tenant_id String
  created_at DateTime @default(now())
  @@index([tenant_id, created_at(sort: Desc)])
}
```
- CHECK: `npx prisma migrate dev --name add_orders_tenant_created_idx --create-only` -> Migration SQL drafted successfully.

#### Step 2: Apply index migration
- CHECK: `npx prisma db push` -> Applied successfully.

#### Step 3: Run EXPLAIN
- CHECK: `psql -d forgewright -f scripts/explain.sql` -> Plan updated: `Index Scan using Order_tenant_id_created_at_idx`.

### 5. VERIFY
CLAIM: tenant order query uses composite index and performs index scan
COMMAND: psql -d forgewright -c "EXPLAIN ANALYZE SELECT * FROM \"Order\" WHERE tenant_id = 't1' ORDER BY created_at DESC;"
OUTPUT:
Index Scan using "Order_tenant_id_created_at_idx" on "Order"  (cost=0.15..8.20 rows=10 width=128)
Planning Time: 0.12 ms
Execution Time: 0.08 ms
EXIT CODE: 0
VERDICT: PASS
