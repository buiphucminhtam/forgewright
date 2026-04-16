# Tasks: Agent-First CLI — Phase Breakdown

> **Parent:** [PLAN.md](./PLAN.md)
> **Version:** 1.0

---

## Phase 1: Core Foundation (8h)

### Task 1.1: CLI Entry Point (1h)

**Owner:** TBD
**Status:** Pending
**Effort:** 1h

**Subtasks:**
- [ ] Create `src/cli/` directory structure
- [ ] Set up `src/cli/index.ts` entry point
- [ ] Configure `package.json` bin entry
- [ ] Add TypeScript configuration
- [ ] Set up build (tsup)

**Acceptance:**
- [ ] `forge --version` outputs version
- [ ] `forge --help` shows help text

---

### Task 1.2: Exit Codes (0.5h)

**Owner:** TBD
**Status:** Pending
**Effort:** 0.5h

**Subtasks:**
- [ ] Create `src/cli/exit-codes.ts`
- [ ] Document each code
- [ ] Add tests

**Acceptance:**
- [ ] `src/cli/exit-codes.ts` exports all codes
- [ ] Tests pass for all code paths

---

### Task 1.3: Global Flags (1.5h)

**Owner:** TBD
**Status:** Pending
**Effort:** 1.5h

**Subtasks:**
- [ ] Add `--json` flag
- [ ] Add `--no-color` flag
- [ ] Add `--quiet` flag
- [ ] Add `--debug` flag
- [ ] Auto-detect TTY vs non-TTY

**Acceptance:**
- [ ] All flags documented
- [ ] Auto-detection works
- [ ] Flags persist across commands

---

### Task 1.4: JSON Envelope (1h)

**Owner:** TBD
**Status:** Pending
**Effort:** 1h

**Subtasks:**
- [ ] Define `AgentEnvelope<T>` interface
- [ ] Create envelope builder utility
- [ ] Add error envelope support
- [ ] Add metadata (duration, version)

**Acceptance:**
- [ ] Valid JSON output
- [ ] Schema matches spec
- [ ] Handles errors correctly

---

### Task 1.5: Tool Registry (2h)

**Owner:** TBD
**Status:** Pending
**Effort:** 2h

**Subtasks:**
- [ ] Define `ToolSpec` interface
- [ ] Create registry data structure
- [ ] Load from skills directory
- [ ] Add filtering/sorting

**Acceptance:**
- [ ] All 55 skills discoverable
- [ ] JSON schema valid
- [ ] Filtering works

---

### Task 1.6: Tools List Command (1h)

**Owner:** TBD
**Status:** Pending
**Effort:** 1h

**Subtasks:**
- [ ] Implement `forge tools list`
- [ ] Add `--category` filter
- [ ] Add `--format` option
- [ ] Human-readable table output

**Acceptance:**
- [ ] `forge tools list` works
- [ ] `forge tools list --json` returns registry
- [ ] `forge tools list --category engineering` filters

---

### Task 1.7: Tools Call Command (1h)

**Owner:** TBD
**Status:** Pending
**Effort:** 1h

**Subtasks:**
- [ ] Implement `forge tools call <name>`
- [ ] Add `--args` for JSON input
- [ ] Add `--stdin` for pipe input
- [ ] Implement result rendering

**Acceptance:**
- [ ] `forge tools call skills.list --json` works
- [ ] Error handling for unknown tools
- [ ] Args validation

---

## Phase 2: Enhanced CLI (14h)

### Task 2.1: Config Layering (3h)

**Owner:** TBD
**Status:** Pending
**Effort:** 3h

**Subtasks:**
- [ ] Create `src/cli/config/layered.ts`
- [ ] Implement 5-source resolution
- [ ] Add `--inline-first` override
- [ ] Create `forge config` commands

**Acceptance:**
- [ ] Priority order correct
- [ ] Override works
- [ ] `forge config list` shows sources

---

### Task 2.2: Input Conventions (2h)

**Owner:** TBD
**Status:** Pending
**Effort:** 2h

**Subtasks:**
- [ ] Implement URL input handling
- [ ] Implement stdin (`-`) input
- [ ] Implement `@path` file literal
- [ ] Add input validation

**Acceptance:**
- [ ] `forge analyze https://url.com` works
- [ ] `cat file.md | forge analyze -` works
- [ ] `forge analyze @file.md` works

---

### Task 2.3: Forge Config Commands (2h)

**Owner:** TBD
**Status:** Pending
**Effort:** 2h

**Subtasks:**
- [ ] `forge config get <key>`
- [ ] `forge config set <key> <value>`
- [ ] `forge config list`
- [ ] `forge config init`

**Acceptance:**
- [ ] All subcommands work
- [ ] Config persisted correctly
- [ ] Sources shown in list

---

### Task 2.4: Forge Doctor (1h)

**Owner:** TBD
**Status:** Pending
**Effort:** 1h

**Subtasks:**
- [ ] Check Node.js version
- [ ] Check TypeScript installation
- [ ] Check config files
- [ ] Check dependencies

**Acceptance:**
- [ ] `forge doctor` shows diagnostics
- [ ] Exit code 0 if healthy
- [ ] Clear error messages

---

### Task 2.5: Forge Validate JSON (2h)

**Owner:** TBD
**Status:** Pending
**Effort:** 2h

**Subtasks:**
- [ ] Wrap existing `forge-validate.sh`
- [ ] Add JSON output mode
- [ ] Add `--json` flag
- [ ] Maintain existing output

**Acceptance:**
- [ ] `forge validate --json` valid JSON
- [ ] Same results as human mode
- [ ] Exit codes preserved

---

### Task 2.6: Migration Guide (1h)

**Owner:** TBD
**Status:** Pending
**Effort:** 1h

**Subtasks:**
- [ ] Write migration guide
- [ ] Document breaking changes (if any)
- [ ] Add examples for agents
- [ ] Add to documentation

**Acceptance:**
- [ ] Guide complete
- [ ] Examples work
- [ ] Reviewer approves

---

### Task 2.7: Backward Compatibility (3h)

**Owner:** TBD
**Status:** Pending
**Effort:** 3h

**Subtasks:**
- [ ] Add feature flags
- [ ] Implement legacy mode
- [ ] Add `FORGE_LEGACY_OUTPUT=1`
- [ ] Test all existing commands

**Acceptance:**
- [ ] Legacy mode works
- [ ] New mode is default
- [ ] No breaking changes

---

## Phase 3: Polish (8h)

### Task 3.1: Progress Spinners (2h)

**Owner:** TBD
**Status:** Pending
**Effort:** 2h

**Subtasks:**
- [ ] Add `ora` dependency (optional)
- [ ] Add spinners for long operations
- [ ] Disable in non-TTY mode
- [ ] Add `--no-spinner` flag

---

### Task 3.2: Colored Output (2h)

**Owner:** TBD
**Status:** Pending
**Effort:** 2h

**Subtasks:**
- [ ] Integrate `picocolors`
- [ ] Color scheme definition
- [ ] `--no-color` support
- [ ] Test on various terminals

---

### Task 3.3: Help Text Improvements (2h)

**Owner:** TBD
**Status:** Pending
**Effort:** 2h

**Subtasks:**
- [ ] Enhanced examples
- [ ] Related commands section
- [ ] Link to full documentation
- [ ] Per-command help text

---

### Task 3.4: Completion Scripts (2h)

**Owner:** TBD
**Status:** Pending
**Effort:** 2h

**Subtasks:**
- [ ] Bash completion
- [ ] Zsh completion
- [ ] Fish completion
- [ ] Installation instructions

---

## Testing Phase (8h)

### Task 4.1: Unit Tests (3h)

**Owner:** TBD
**Status:** Pending
**Effort:** 3h

**Subtasks:**
- [ ] Test exit codes
- [ ] Test JSON envelope
- [ ] Test config layering
- [ ] Test input conventions

**Target:** >80% coverage

---

### Task 4.2: Integration Tests (3h)

**Owner:** TBD
**Status:** Pending
**Effort:** 3h

**Subtasks:**
- [ ] Test all commands
- [ ] Test flag combinations
- [ ] Test error conditions
- [ ] Test performance

---

### Task 4.3: E2E Tests (2h)

**Owner:** TBD
**Status:** Pending
**Effort:** 2h

**Subtasks:**
- [ ] Human mode test
- [ ] Agent mode test
- [ ] Cross-mode consistency
- [ ] CI/CD integration

---

## Documentation Phase (4h)

### Task 5.1: Core Docs (2h)

**Owner:** TBD
**Status:** Pending
**Effort:** 2h

**Subtasks:**
- [ ] Create `docs/cli.md`
- [ ] Update `README.md`
- [ ] Update `CLAUDE.md`
- [ ] Update `AGENTS.md`

---

### Task 5.2: Migration Docs (1h)

**Owner:** TBD
**Status:** Pending
**Effort:** 1h

**Subtasks:**
- [ ] Write migration guide
- [ ] Add agent examples
- [ ] Add changelog entry

---

### Task 5.3: Release Docs (1h)

**Owner:** TBD
**Status:** Pending
**Effort:** 1h

**Subtasks:**
- [ ] Draft release notes
- [ ] Update CHANGELOG.md
- [ ] Create migration guide
- [ ] Prepare announcement

---

## Summary

| Phase | Tasks | Hours |
|-------|-------|-------|
| Phase 1 | 7 | 8h |
| Phase 2 | 7 | 14h |
| Phase 3 | 4 | 8h |
| Testing | 3 | 8h |
| Documentation | 3 | 4h |
| **Total** | **24** | **42h** |
