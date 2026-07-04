---
name: backend
description: "Implements backend application servers, REST/GraphQL APIs, middleware layers, authentication, and database routing layers. Use when designing web servers, authentication systems, API endpoints, microservices, or integration middleware."
version: 1.0.0
tags: [backend, server, api, rest, authentication, middleware, routing]
---

# Backend Developer (LITE)

## SOLVE Step 2: GROUND (Backend Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Web framework is installed | Read package configuration (`package.json`, `go.mod`) | ... | Y/N |
| DB connection configuration exists | Check `.env` files or database config module | ... | Y/N |
| API router base path | Search for routing file or router registration | ... | Y/N |
| Auth strategy / secrets set | Read environment setup for token secrets | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Backend Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
- `n. ACTION (register express routes) | TARGET (src/routes/users.ts) | CHECK (npm run build)`
- `n. ACTION (write JWT middleware) | TARGET (src/middleware/auth.ts) | CHECK (npx jest tests/auth.test.ts)`
- `n. ACTION (build database query logic) | TARGET (src/controllers/users.ts) | CHECK (npm run build)`
- `n. ACTION (run integration tests) | TARGET (tests/api.test.ts) | CHECK (npm test)`

---

## Worked Example: Express JWT Authentication Middleware
> [!NOTE]
> The following example is illustrative.

### 1. UNDERSTAND
- **Task**: Implement a secure JWT authentication middleware and apply it to a `/api/profile` Express route.
- **What must be TRUE**: Requests without a valid Bearer token are rejected with HTTP 401; valid token requests populate `req.user` and succeed; tests pass.
- **What could I be wrong about**: Expiration checks, incorrect parsing of the Bearer schema prefix, secret keys.

### 2. GROUND
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Framework is Express | Read `package.json` | `"express": "^4.18"` | Y |
| JWT library exists | Read `package.json` | `"jsonwebtoken": "^9.0"` | Y |
| Server routing file exists | `ls src/server.ts` | File exists | Y |

### 3. DECOMPOSE
1. ACTION (write unit test for middleware)   TARGET (tests/auth.test.ts)   CHECK (npx jest tests/auth.test.ts)
2. ACTION (implement authMiddleware)   TARGET (src/middleware/auth.ts)   CHECK (npx jest tests/auth.test.ts)
3. ACTION (register route with middleware)   TARGET (src/server.ts)   CHECK (npm test)

### 4. EXECUTE
#### Step 1: Write test
- Wrote tests simulating HTTP requests with valid, missing, and expired tokens.
- CHECK: `npx jest tests/auth.test.ts` -> Failed (middleware undefined).

#### Step 2: Implement authMiddleware
- Created `src/middleware/auth.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const token = authHeader.split(' ');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    (req as any).user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}
```
- CHECK: `npx jest tests/auth.test.ts` -> Passed.

#### Step 3: Register route
- Modified `src/server.ts` to attach `authMiddleware` to `/api/profile`.
- CHECK: `npm test` -> Passed.

### 5. VERIFY
CLAIM: profile endpoint requires valid JWT authentication
COMMAND: npx jest tests/auth.test.ts
PASS  tests/auth.test.ts
✓ should block request without authorization header (401)
✓ should block request with invalid signature (401)
✓ should allow request with valid signature (200)
EXIT CODE: 0
VERDICT: PASS
