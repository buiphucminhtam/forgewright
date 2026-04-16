# Plan: Agent-First CLI — Forgewright Integration

> **Version:** 1.0
> **Created:** 2026-04-15
> **Status:** Draft — Pending Review
> **Target Score:** ≥ 9.0/10

---

## 1. Context & Problem Statement

### Current State

Forgewright hiện tại là một orchestration system mạnh mẽ với 55 skills, nhưng **thiếu AI-agent-friendly CLI**:

| Gap | Current | Needed |
|-----|---------|--------|
| Tool discovery | ❌ Không có | `forge tools --json` |
| Structured output | ❌ Human-only | `--json` for agents |
| Exit codes | ❌ Random | Standardized (0-6) |
| Config management | ⚠️ Partial | Layered (5 sources) |
| Input conventions | ⚠️ Inconsistent | URL, stdin, @path |

### Reference Implementation

`human-cli` (mrgoonie) đã implement thành công các patterns này. Đánh giá:
- Implementation efficiency: 8.2/10
- Security: 4.5/10 (cần cải thiện)
- Maintainability: 7.0/10

### Success Criteria

1. AI agents có thể discover và invoke Forgewright tools tự động
2. CLI output parseable cho automation scripts
3. Error recovery qua standardized exit codes
4. **Zero breaking changes** cho existing users
5. Backward compatible với existing workflows

---

## 2. Scope Definition

### In Scope (Phase 1-2)

```
✓ Tool registry với JSON discovery
✓ Dual-mode output (human/JSON)
✓ Standardized exit codes
✓ Input conventions (URL, stdin, @path)
✓ Config layering (5 sources)
✓ Migration documentation
```

### Out of Scope (Deferred to v2.1)

```
✗ Claude Code plugin marketplace
✗ Streaming output
✗ Advanced security hardening
✗ Multi-tenant / team features
```

### Boundaries

| Boundary | Definition |
|----------|------------|
| CLI only | Không thay đổi skill logic |
| Backward compatible | Tất cả existing flags work |
| Incremental | Mỗi phase có thể deploy riêng |

---

## 3. Architecture

### High-Level Design

```bash
forge [global-flags] <command> [args] [flags]

# Global flags
  --json              # Force JSON output (agent mode)
  --no-color          # Disable colors
  --quiet, -q         # Suppress stdout
  --debug             # Verbose logging
  --version, -v        # Show version

# Commands
  tools list [--json]      # List all tools
  tools call <name> --args # Invoke tool by name
  skills [list|category]   # Skill management
  validate [--json]        # Quality gate
  config [get|set|list]   # Configuration
  doctor                   # Diagnostics
```

### Exit Codes (Standardized)

```typescript
const EXIT_CODES = {
  OK: 0,                      // Success
  TOOL_ERROR: 1,              // Tool execution failed
  USAGE_ERROR: 2,             // Invalid arguments
  CONFIG_ERROR: 3,            // Configuration issue
  AUTH_ERROR: 4,               // Authentication/permission
  TIMEOUT: 5,                 // Operation timed out
  MISSING_DEPENDENCY: 6,      // Required dep not found
  INTERNAL_ERROR: 7            // Unexpected error
} as const;
```

### Tool Registry Schema

```typescript
interface ToolSpec {
  name: string;                    // e.g., "skills.list"
  description: string;             // Human-readable description
  category: string;               // e.g., "engineering", "devops"
  inputSchema: Record<string, {    // JSON Schema
    type: "string" | "number" | "boolean" | "array" | "object";
    required?: boolean;
    description?: string;
    default?: unknown;
  }>;
  outputSchema?: Record;           // Optional output schema
  examples?: string[];            // Usage examples
}
```

### JSON Output Envelope

```typescript
interface AgentEnvelope<T = unknown> {
  ok: boolean;
  tool: string;
  data: T;
  metadata: {
    duration_ms: number;
    version: string;
    config_source?: string;    // Which config source won
  };
  error: {
    code: number;              // Exit code
    message: string;
    details?: unknown;
  } | null;
}
```

### Config Layering (5 Sources)

| Priority | Source | Example |
|----------|--------|---------|
| 1 (highest) | OS env | `FORGE_API_KEY=xxx` |
| 2 | User config | `~/.config/forgewright/config.json` |
| 3 | process.env | Injected at runtime |
| 4 | .env files | `.env`, `.env.local` in CWD |
| 5 (lowest) | Inline flags | `--api-key=xxx` |

Override: `FORGE_INLINE_FIRST=1` inverts priority.

---

## 4. Implementation Phases

### Phase 1: Core Foundation (8h)

| Task | Effort | Owner | Dependencies |
|------|--------|-------|-------------|
| Create CLI entry point | 1h | — | None |
| Implement exit codes | 0.5h | — | None |
| Add `--json` global flag | 1.5h | — | CLI entry |
| Implement JSON envelope | 1h | — | `--json` flag |
| Create tool registry | 2h | — | None |
| Add `forge tools list` | 1h | — | Registry |
| Add `forge tools call` | 1h | — | Registry |

**Acceptance Criteria:**
- [ ] `forge --version` returns JSON when `--json` passed
- [ ] All commands accept `--json` flag
- [ ] Exit codes documented and consistent
- [ ] `forge tools list --json` returns valid tool registry

### Phase 2: Enhanced CLI (14h)

| Task | Effort | Owner | Dependencies |
|------|--------|-------|-------------|
| Implement config layering | 3h | — | Phase 1 |
| Add input conventions | 2h | — | Phase 1 |
| Implement `forge config` | 2h | — | Config layering |
| Add `forge doctor` | 1h | — | None |
| Add `forge validate --json` | 2h | — | Phase 1 |
| Migration guide | 1h | — | Phase 1 |
| Backward compatibility layer | 3h | — | Phase 1 |

**Acceptance Criteria:**
- [ ] `forge config list` shows config source per key
- [ ] `@path/to/file.md` input convention works
- [ ] stdin (`-`) input convention works
- [ ] Migration guide covers all breaking changes (if any)

### Phase 3: Polish (8h) — Optional

| Task | Effort | Owner | Dependencies |
|------|--------|-------|-------------|
| Progress spinners | 2h | — | Phase 1 |
| Colored output | 2h | — | Phase 1 |
| Help text improvements | 2h | — | Phase 1 |
| Completion scripts | 2h | — | Phase 1 |

---

## 5. Migration Strategy

### Backward Compatibility Commitment

> **CRITICAL:** Zero breaking changes for v1.x users.

### Deprecation Timeline

```
v1.x (current)     → All existing commands work, no changes
v2.0 (this update) → New flags available, old behavior unchanged
v2.1               → Deprecation warnings for future removals
v3.0               → Legacy flags removed (if any)
```

### Migration Guide Structure

```markdown
## Migrating to Forgewright CLI v2.0

### For Human Users
- No changes required
- New `--json` flag available for scripting

### For AI Agents
- Use `forge tools list --json` for discovery
- Parse JSON envelope for structured output
- Use exit codes for error handling

### Config Changes
- Existing `.production-grade.yaml` still works
- New: `~/.config/forgewright/config.json`
- See "Config Layering" section for priority
```

### Feature Flags

```bash
# Force legacy behavior if needed
FORGE_LEGACY_OUTPUT=1 forge validate

# Force new behavior
FORGE_NEW_OUTPUT=1 forge validate
```

---

## 6. Rollback Plan

### Git Tag Strategy

```bash
# Before Phase 1
git tag -a v1.x-stable -m "Stable before CLI refactor"
git push origin v1.x-stable

# After each phase
git tag -a v2.0-phase1 -m "Phase 1 complete"
git push origin v2.0-phase1
```

### Quick Revert Path

```bash
# Revert to previous stable
git checkout v1.x-stable
npm publish patch --force  # Only if needed

# Revert specific file
git checkout HEAD~1 -- src/cli/output.ts
```

### Feature Branching

```
main
  ├── feature/cli-json-output
  │     ├── Phase 1: Core foundation
  │     └── Phase 2: Enhanced CLI
  └── feature/cli-polish (Phase 3)
```

### CI/CD Integration

```yaml
# .github/workflows/cli-test.yml
- name: Test CLI (legacy mode)
  run: FORGE_LEGACY_OUTPUT=1 ./scripts/forge-validate.sh --json

- name: Test CLI (new mode)
  run: ./scripts/forge-validate.sh --json
```

---

## 7. Security Considerations

### Input Validation

| Input Type | Validation | Action |
|------------|------------|--------|
| File paths | Sanitize `../`, absolute check | Reject if out of scope |
| URLs | SSRF check, protocol whitelist | Reject `file://`, `ftp://` |
| stdin | Max size limit (10MB) | Truncate or reject |
| JSON args | Schema validation | Return exit code 2 |

### Secret Handling

| Current | Recommended |
|---------|-------------|
| Plain env vars | Continue (acceptable for CLI) |
| Config file | Warn if permissions too open |
| Command history | Recommend `HISTIGNORE` |

### Security Baseline (v2.0)

- ✅ Input sanitization for all user inputs
- ✅ Path traversal prevention
- ✅ URL protocol whitelist (`http://`, `https://` only)
- ⏳ Rate limiting (defer to v2.1)
- ⏳ Audit logging (defer to v2.1)

---

## 8. Testing Strategy

### Unit Tests

```typescript
// src/cli/__tests__/exit-codes.test.ts
describe('Exit Codes', () => {
  test('OK on success', () => { /* ... */ });
  test('USAGE_ERROR on invalid args', () => { /* ... */ });
  test('CONFIG_ERROR on missing config', () => { /* ... */ });
});

// src/cli/__tests__/json-envelope.test.ts
describe('JSON Envelope', () => {
  test('returns valid JSON', () => { /* ... */ });
  test('includes metadata', () => { /* ... */ });
  test('handles errors correctly', () => { /* ... */ });
});
```

### Integration Tests

```bash
# Test all commands with --json
for cmd in tools skills validate doctor config; do
  forge $cmd --json | jq . > /dev/null || exit 1
done
```

### E2E Tests (Human + Agent modes)

```bash
# Human mode: check colored output
forge validate | grep -q "$(tput colors)"  # Should have color codes

# Agent mode: check JSON structure
forge validate --json | jq -e '.ok == true'
```

---

## 9. Documentation

### Files to Update

| File | Changes |
|------|---------|
| `README.md` | Add CLI reference section |
| `CLAUDE.md` | Document `--json` usage |
| `AGENTS.md` | Add AI agent integration guide |
| `docs/cli.md` | **NEW** — Full CLI documentation |

### CLI Reference Structure

```markdown
# Forgewright CLI Reference

## Installation
npm i -g forgewright

## Quick Start
forge --version
forge tools list --json
forge validate --json

## Global Flags
--json, -j    Force JSON output
--help, -h    Show help
--version, -v Show version

## Commands
tools    Tool registry management
skills   Skill management
validate Quality gate validation
config   Configuration management
doctor   Diagnostics

## Exit Codes
0-7 as defined above

## Examples
# Human usage
forge validate

# Agent usage
forge --json tools list | jq '.data[] | select(.category=="engineering")'
```

---

## 10. Effort Breakdown

### Timeline

```
Week 1:
  Day 1-2: Phase 1 (Core Foundation) — 8h
  Day 3-5: Phase 2 (Enhanced CLI) — 14h

Week 2:
  Day 1-2: Phase 3 (Polish) — 8h
  Day 3-4: Testing & Documentation — 8h + 10% buffer = 9h
  Day 5:   Release preparation — 4h
```

### Total: ~46h (2 weeks) — includes 10% contingency

| Phase | Hours | % |
|-------|-------|---|
| Phase 1 | 8h | 17% |
| Phase 2 | 14h | 30% |
| Phase 3 | 8h | 17% |
| Testing | 9h | 20% |
| Docs | 4h | 9% |
| Buffer | 4h | 9% |
| **Total** | **~46h** | 100% |

---

## 11. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| CLI adoption | 50% of users use new flags | Survey after 1 month |
| Agent integration | 3+ external agents use `forge tools --json` | GitHub stars, issues |
| Zero breaking changes | 0 regressions reported | Support issues < 5 |
| Build success | 100% CI pass rate | GitHub Actions |
| Documentation coverage | All commands documented | docs/cli.md completeness |

---

## 11.1 Performance Benchmarks

### Baseline Metrics (Before)

| Metric | Current Value |
|--------|---------------|
| `forge --version` cold start | ~200ms |
| `forge tools list` (human) | ~100ms |
| `forge validate` | ~5s (shell) |

### Target Metrics (After)

| Metric | Target | Measurement |
|--------|--------|-------------|
| `forge --version` cold start | <250ms (no regression) |
| `forge tools list` (human) | <150ms (no regression) |
| `forge tools list --json` | <200ms |
| `forge validate` | <6s (CI mode) |

### Regression Testing

```bash
# Benchmark script
hyperfine --warmup 3 'forge --version'
hyperfine --warmup 3 'forge tools list'
hyperfine --warmup 3 'forge tools list --json'
```

**Threshold:** No metric >10% slower than baseline

---

## 11.2 Pilot Group

### Recommended Pilot (3-5 users)

1. **Internal team** — Use for Forgewright development
2. **Early adopters** — 2-3 external users from Discord/community
3. **AI agent testing** — Use with Claude Code, Cowork

### Feedback Collection

- GitHub Discussion thread
- Discord #cli-feedback channel
- Weekly check-in during pilot

### Success Criteria for Pilot

| Metric | Target |
|--------|--------|
| Completion rate | >80% complete pilot tasks |
| NPS score | >40 |
| Bug reports | <5 critical |

---

## 12. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking existing users | Low | High | Zero-breaking-change policy, feature flags |
| JSON parsing errors | Medium | Medium | Comprehensive error handling, exit code 1 |
| Config migration confusion | Medium | Low | Clear migration guide, `--verbose` output |
| Performance regression | Low | Medium | Benchmark before/after, CI checks |
| Feature creep | High | Medium | Strict scope enforcement, defer to v2.1 |

---

## 14. Review Checklist

### Pre-Execution

- [ ] Plan reviewed by at least 1 peer
- [ ] Migration strategy validated
- [ ] Rollback plan tested
- [ ] Security baseline confirmed
- [ ] Test coverage defined

### During Execution

- [ ] Each phase has acceptance criteria
- [ ] CI passes before next phase
- [ ] Breaking changes tracked
- [ ] Documentation updated per phase

### Post-Execution

- [ ] Migration guide published
- [ ] Release notes drafted
- [ ] Success metrics collected
- [ ] Retrospective scheduled

---

## 15. Appendix: Reference Implementation

### human-cli Patterns (to adopt)

1. **Tool registry** — `src/mcp/tool-registry.ts`
2. **Dual-mode output** — `src/cli.ts` (isTTY check)
3. **Exit codes** — `src/cli.ts` (exit(0-4))
4. **Config layering** — `src/runtime/config.ts`
5. **Input conventions** — Commands support URL, stdin, @path

### Forgewright Existing Code

- `scripts/forge-validate.sh` — Reference for CLI structure
- `.production-grade.yaml` — Current config (extend, not replace)
- `skills/` — Source of truth for tool registry

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Author | Claude | 2026-04-15 | Draft |
| Reviewer | — | — | Pending |
| Approver | — | — | Pending |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-15 | Initial plan |
| 1.1 | 2026-04-15 | Added performance benchmarks, pilot group, buffer time |
