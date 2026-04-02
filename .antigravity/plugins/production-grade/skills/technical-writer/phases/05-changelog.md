# Phase 5 — Changelog Generation

## Goal

Generate and maintain a `CHANGELOG.md` at the project root following [Keep a Changelog](https://keepachangelog.com/) format. Auto-generate entries from git commit history using Conventional Commits. Produce user-facing release notes — not raw commit dumps.

## Inputs to Read

- Git commit history (`git log --oneline --since="last tag"`)
- Previous `CHANGELOG.md` (if exists — append, don't overwrite)
- `.forgewright/product-manager/` — business context for user-facing language
- Git tags — existing release versions for continuity

## Actions

### 1. Parse Git History

Read git log and classify commits by Conventional Commit type:

| Prefix | Changelog Section | User-Facing Label |
|--------|------------------|-------------------|
| `feat(*)` | Added | ✨ New Features |
| `fix(*)` | Fixed | 🐛 Bug Fixes |
| `perf(*)` | Changed | ⚡ Performance Improvements |
| `refactor(*)` | Changed | 🔧 Internal Improvements |
| `docs(*)` | — | (Skip unless user-facing docs) |
| `chore(*)` | — | (Skip) |
| `test(*)` | — | (Skip) |
| `ci(*)` | — | (Skip) |
| `BREAKING CHANGE` | ⚠️ Breaking Changes | 🚨 Breaking Changes |
| `deprecate(*)` | Deprecated | ⚠️ Deprecations |
| `security(*)` | Security | 🔒 Security |

### 2. Generate User-Facing Entries

Transform technical commit messages into user-readable descriptions:

**Bad (raw commit):**
```
- feat(auth): implement OAuth2 PKCE flow with state parameter validation
```

**Good (user-facing):**
```
- **Login with Google/GitHub** — You can now sign in using your Google or GitHub account. No password needed.
```

Rules:
- Write from the user's perspective, not the developer's
- Lead with the benefit, not the implementation
- Group related changes into single entries (3 auth commits → 1 "Auth improvements" entry)
- Include PR/issue links where available: `([#123](link))`
- Breaking changes get a dedicated section with migration instructions

### 3. Write CHANGELOG.md

Format:
```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ✨ Added
- [entry]

### 🐛 Fixed
- [entry]

### ⚡ Changed
- [entry]

### 🚨 Breaking Changes
- [entry with migration guide]

## [1.0.0] — YYYY-MM-DD

### ✨ Added
- [entries for this release]
```

### 4. Generate Release Notes

For tagged releases, also generate a GitHub-flavored release note at `.forgewright/technical-writer/release-notes/v{version}.md`:
- Summary paragraph (2-3 sentences)
- Highlights (top 3 features)
- Full changelog (same as CHANGELOG.md entry)
- Upgrade guide (if breaking changes)
- Contributors list

## Output

```
CHANGELOG.md                                           # Project root
.forgewright/technical-writer/
    release-notes/
        v{version}.md                                  # Per-release notes
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Dumping raw git commits into CHANGELOG | Write user-facing descriptions, not developer messages |
| Including chore/test/ci commits | Only user-visible changes belong in CHANGELOG |
| No migration guide for breaking changes | Every breaking change needs a "Before/After" code example |
| Overwriting existing CHANGELOG | Prepend new entries, never overwrite existing history |
| Not grouping related commits | 5 auth-related commits → 1 "Authentication improvements" entry |
