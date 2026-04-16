# Scope: Agent-First CLI — Forgewright Integration

> **Parent:** [PLAN.md](./PLAN.md)
> **Version:** 1.0

---

## 1. In Scope

### Phase 1: Core Foundation

- [ ] CLI entry point (`src/cli/index.ts`)
- [ ] Exit codes (0-7)
- [ ] `--json` global flag
- [ ] JSON envelope format
- [ ] Tool registry data structure
- [ ] `forge tools list` command
- [ ] `forge tools call` command

### Phase 2: Enhanced CLI

- [ ] Config layering (5 sources)
- [ ] Input conventions (URL, stdin, @path)
- [ ] `forge config` command
- [ ] `forge doctor` command
- [ ] `forge validate --json`
- [ ] Migration guide
- [ ] Backward compatibility layer

### Documentation

- [ ] Update README.md
- [ ] Update CLAUDE.md
- [ ] Update AGENTS.md
- [ ] Create docs/cli.md

### Testing

- [ ] Unit tests for exit codes
- [ ] Unit tests for JSON envelope
- [ ] Integration tests for all commands
- [ ] E2E tests (human + agent modes)

---

## 2. Out of Scope

### Deferred to v2.1

| Feature | Reason |
|---------|--------|
| Claude Code plugin marketplace | Nice-to-have, complex |
| Streaming output | Performance optimization |
| Advanced security hardening | Rate limiting, audit logging |
| Multi-tenant features | Team/enterprise only |
| Cloud storage integration | Outside core CLI scope |

### Explicitly Excluded

- Changes to skill logic (CLI only)
- Changes to MCP server (separate concern)
- Changes to skill file formats
- Breaking changes to existing APIs

---

## 3. Boundaries

### What This Project Does

- Adds new CLI interface layer
- Wraps existing functionality
- Provides structured output
- Standardizes error handling

### What This Project Does NOT Do

- Modifies skill implementations
- Changes ForgeNexus internals
- Refactors MCP server
- Alters skill discovery mechanism

---

## 4. Success Criteria

| Criterion | Definition |
|-----------|------------|
| Functional | All 7 Phase 1 tasks complete |
| Compatible | 0 breaking changes |
| Testable | >80% code coverage |
| Documented | docs/cli.md complete |
| Secure | Input validation in place |

---

## 5. Constraints

| Constraint | Implication |
|------------|-------------|
| Zero breaking changes | Must be additive only |
| Node.js 18+ | No native modules unless optional |
| Bash 4+ | CI scripts use modern bash |
| Backward compatible | Legacy flags must still work |

---

## 6. Dependencies

| Dependency | Source | Version |
|------------|--------|---------|
| TypeScript | Existing | ^5.6 |
| Zod | New | ^3.23 |
| commander | New | ^12 |
| picocolors | New | ^1.1 |

### Optional Dependencies

| Dependency | Purpose | Required? |
|------------|---------|-----------|
| @modelcontextprotocol/sdk | MCP compatibility | No |
| ora | Progress spinners | No |
