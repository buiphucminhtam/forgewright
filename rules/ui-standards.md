# UI Coding Standards — src/ui/**, frontend/src/components/**

These rules apply to all files matching `src/ui/**`, `frontend/src/components/**`, or UI-related directories.

## Required

- [ ] No direct game state ownership — UI reads state, never modifies
- [ ] Localization-ready — use i18n keys, not hardcoded strings
- [ ] Accessibility — semantic HTML, ARIA labels, keyboard navigation
- [ ] Responsive — works on target screen sizes
- [ ] No business logic — UI only displays and forwards user actions

## Forbidden

- [ ] Direct database access from UI
- [ ] Game state mutations from UI handlers
- [ ] Hardcoded strings — use translation keys
- [ ] Inline styles for complex layouts — use CSS classes
- [ ] Missing loading states

## Patterns

### Good

```tsx
// Correct: localization
<Text>{t('ui.menu.start_button')}</Text>

// Correct: accessible
<button aria-label={t('ui.close')} onClick={onClose}>
  <Icon name="close" />
</button>

// Correct: state read-only
const health = gameState.player.health;
```

### Bad

```tsx
// Wrong: hardcoded string
<button onClick={start}>Start Game</button>

// Wrong: missing aria
<button onClick={close}>X</button>

// Wrong: UI modifying game state
onClick={() => gameState.setHealth(100)}
```

## Enforcement

When editing files in UI directories:
1. Check for hardcoded strings → suggest i18n keys
2. Check for missing aria labels → warn
3. Check for direct state mutations → block
