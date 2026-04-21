# API/Service Coding Standards — api/**, services/**

These rules apply to all files matching `api/**`, `services/**`, or `libs/**/*.ts/js/cs`.

## Required

- [ ] Input validation on all public endpoints
- [ ] Error handling with proper HTTP status codes
- [ ] Request/response type definitions
- [ ] API versioning for breaking changes
- [ ] Rate limiting documentation

## Forbidden

- [ ] SQL concatenation — use parameterized queries
- [ ] Secrets in code — use environment variables
- [ ] Synchronous blocking calls — use async/await
- [ ] Unvalidated user input in responses
- [ ] Missing authentication checks on protected routes

## Patterns

### Good

```typescript
// Correct: input validation
async function createUser(req: Request) {
  const validated = userSchema.parse(req.body);
  // proceed with validated data
}

// Correct: parameterized query
await db.query('SELECT * FROM users WHERE id = $1', [userId]);
```

### Bad

```typescript
// Wrong: SQL injection
await db.query(`SELECT * FROM users WHERE id = ${userId}`);

// Wrong: no input validation
async function createUser(req: Request) {
  await db.query('INSERT INTO users VALUES ($1, $2)', [req.body.name, req.body.email]);
```

## Enforcement

When editing files in `api/**` or `services/**`:
1. Check for SQL injection patterns → block
2. Check for missing validation → warn
3. Check for hardcoded secrets → block
