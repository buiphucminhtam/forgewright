---
name: software-engineer
description: "[production-grade internal] Implements backend services, APIs, and business logic — builds features, fixes bugs, refactors code from specs. Includes error handling, idempotency, concurrency, and clean architecture patterns. Routed via the production-grade orchestrator."
version: 2.0.0
tags: [backend, api, services, implementation, clean-architecture, tdd]
---

# Software Engineer (LITE)

## SOLVE Step 2: GROUND (Software Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Service interface or types defined | View file containing service/model types | ... | Y/N |
| Data repository / DB table exists | View schema file or run DB check | ... | Y/N |
| Dependency packages are installed | Read `package.json` or `go.mod` etc. | ... | Y/N |
| Test suite runs and is green | Run existing test command | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Software Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
- `n. ACTION (write failing test) | TARGET (tests/feature.test.ts) | CHECK (npm test tests/feature.test.ts)`
- `n. ACTION (define types/interfaces) | TARGET (src/types.ts) | CHECK (tsc --noEmit)`
- `n. ACTION (implement business logic) | TARGET (src/services/feature.ts) | CHECK (npm test tests/feature.test.ts)`
- `n. ACTION (wire handler/controller) | TARGET (src/controllers/feature.ts) | CHECK (npm test tests/feature.test.ts)`
- `n. ACTION (run full tests) | TARGET (tests/) | CHECK (npm test)`

---

## Worked Example: Idempotent Payment processing Service
> [!NOTE]
> The following example is illustrative.

### 1. UNDERSTAND
- **Task**: Implement an idempotent `processPayment` method in `PaymentService` to prevent double-charging.
- **What must be TRUE**: Same token only charges once; second call returns cached response; unit tests pass.
- **What could I be wrong about**: Concurrency race conditions if two requests hit at same millisecond; database key constraints.

### 2. GROUND
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target service exists | `ls src/services/payment.ts` | File exists | Y |
| Db client is accessible | View `src/services/payment.ts` | Uses `this.db` client | Y |
| Test framework works | `npm test -- --version` | Jest v29.0.0 | Y |

### 3. DECOMPOSE
1. ACTION (write failing idempotency test)   TARGET (tests/payment.test.ts)   CHECK (npx jest tests/payment.test.ts)
2. ACTION (implement idempotency lock & check)   TARGET (src/services/payment.ts)   CHECK (npx jest tests/payment.test.ts)
3. ACTION (run full test suite)   TARGET (tests/)   CHECK (npm test)

### 4. EXECUTE
#### Step 1: Write failing test
- Added test case to `tests/payment.test.ts` where we call `processPayment` twice with the same `idempotencyKey` concurrently and verify only one call deducts balance.
- CHECK: `npx jest tests/payment.test.ts` -> Failed (charged twice).

#### Step 2: Implement check
- Modified `src/services/payment.ts`:
```typescript
export class PaymentService {
  async processPayment(key: string, amount: number) {
    return await this.db.transaction(async (tx) => {
      const existing = await tx.paymentLog.findUnique({ where: { key } });
      if (existing) return existing;
      
      const payment = await tx.paymentLog.create({
        data: { key, amount, status: 'SUCCESS' }
      });
      // Deduct balance logic here...
      return payment;
    });
  }
}
```
- CHECK: `npx jest tests/payment.test.ts` -> Passed.

#### Step 3: Run full tests
- CHECK: `npm test` -> Passed.

### 5. VERIFY
CLAIM: payment processing is idempotent and safe from double charges
COMMAND: npx jest tests/payment.test.ts
PASS  tests/payment.test.ts
✓ should process payment successfully
✓ should return cached result for duplicate idempotency key
EXIT CODE: 0
VERDICT: PASS
