# Test Coding Standards — tests/**

These rules apply to all files matching `tests/**`.

## Required

- [ ] Test naming: `describe/what/it should` pattern
- [ ] Arrange-Act-Assert structure
- [ ] One assertion concept per test
- [ ] Mock external dependencies
- [ ] Test isolation (no shared state)

## Test Naming Convention

```
[Unit|Integration|E2E]_[Component]_[Action]_[ExpectedResult]

Examples:
- Unit_AuthService_shouldHashPassword
- Integration_UserAPI_shouldCreateUser
- E2E_LoginFlow_shouldAuthenticateUser
```

## Patterns

### Good

```typescript
describe('AuthService', () => {
  describe('hashPassword', () => {
    it('should hash password with bcrypt', async () => {
      // Arrange
      const password = 'secure123';
      
      // Act
      const hashed = await authService.hashPassword(password);
      
      // Assert
      expect(hashed).not.toBe(password);
      expect(hashed.length).toBe(60);
    });
  });
});
```

### Bad

```typescript
// Wrong: no structure
test('auth', async () => {
  const result = await auth('test');
  expect(result).toBeTruthy();
});

// Wrong: multiple concepts
it('should work', async () => {
  // Tests password AND email AND username
  const result = await auth('test', 'email', 'name');
  expect(result).toBeTruthy();
});
```

## Coverage Requirements

| Type | Minimum Coverage |
|------|-----------------|
| Unit tests | 70% |
| Integration tests | 50% |
| Critical paths | 90% |

## Enforcement

When editing files in `tests/**`:
1. Check naming convention → warn if non-compliant
2. Check for Arrange-Act-Assert → suggest if missing
3. Check coverage thresholds → warn if below minimum

## Related Rules

- See `rules/api-standards.md` for API test patterns
- See `rules/core-standards.md` for core system tests
