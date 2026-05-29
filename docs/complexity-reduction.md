# Forgewright Complexity Reduction Strategy

> **Version:** 1.0.0
> **Created:** 2026-05-29
> **Phase:** 3.1 / Phase 2.5
> **Status:** Implementation

---

## Executive Summary

This document outlines the systematic approach to reducing Forgewright's complexity while maintaining full functionality. The goal is to improve maintainability, reduce learning curve, and enhance performance without breaking existing workflows.

---

## Current State Analysis

### Baseline Metrics (2026-05-29)

| Category | Current | Target | Reduction | Status |
|----------|---------|--------|-----------|--------|
| **Skills** | 68 | 50 | 18 (29%) | Not Started |
| **Scripts** | 52 | 35 | 17 (33%) | Not Started |
| **Protocols** | 36 | 30 | 6 (17%) | Not Started |

### Skill Inventory by Category

| Category | Count | Skills |
|----------|-------|--------|
| **Orchestration & Meta** | 7 | orchestrator, polymath, parallel-dispatch, memory-manager, skill-maker, mcp-generator, goal-driven |
| **Engineering** | 22 | software-engineer, frontend-engineer, business-analyst, product-manager, solution-architect, qa-engineer, security-engineer, code-reviewer, debugger, devops, sre, data-scientist, technical-writer, ui-designer, interaction-designer, art-director, vision-review, mobile-engineer, mobile-tester, api-designer, database-engineer, accessibility-engineer |
| **Performance & UX** | 3 | performance-engineer, ux-researcher, data-engineer |
| **AI & Prompt** | 5 | ai-engineer, prompt-engineer, prompt-optimizer, xlsx-engineer, project-manager |
| **Game - Core** | 3 | game-designer, level-designer, narrative-designer |
| **Game - Unity** | 6 | unity-engineer, unity-mcp, unity-multiplayer, unity-shader-artist, animation-engineer, unity-build |
| **Game - Other Engines** | 5 | unreal-engineer, unreal-technical-artist, unreal-multiplayer, godot-engineer, godot-multiplayer, roblox-engineer, phaser3-engineer, threejs-engineer |
| **Game - Support** | 5 | technical-artist, game-asset-vfx, game-audio-engineer, xr-engineer, game-accessibility-engineer |
| **Data & Web** | 5 | autonomous-testing, web-scraper, notebooklm-researcher, growth-marketer, conversion-optimization, ai-behavior-engineer, liveops-engineer, build-release-engineer |
| **Testing** | 2 | autonomous-testing, mobile-tester |

### Script Inventory by Function

| Function | Count | Scripts |
|----------|-------|---------|
| **Memory & Session** | 12 | memory-retrieve, memory-suggest, memory-local, memory-session, memory-hygiene, memory-middleware, session, session-health-check, verify-memory-handover, ensure-mem0 |
| **Forgewright Core** | 10 | forgewright-setup, forgewright-update, forgewright-mcp-setup, forgewright-mcp-launcher, forgewright-shell-filter, forgewright-session-tracker, forgewright-lesson-migrator, forgewright-evolution-init, forgewright-goal, forgewright-compliance-enforcer |
| **Git & Version** | 8 | validate-commit, validate-push, readme-check, convention-indexer, cleanup, circuit-breaker, brownfield-safety, guardrail |
| **Testing & Validation** | 6 | test-runner, verify-skill-count, verify-skills-count, verify-ide-adaptability, validate-assets, run_shell_filter |
| **Project Setup** | 4 | setup-project, fw-global-setup, fw-global-launcher, fw-ext-gen |
| **Miscellaneous** | 12 | worktree-manager, mobile-test-setup, unity-workflow, checkpoint-extract, asip-deterministic-check, task-runner, check-status, statusline, quality-gate, forgenexus-mcp-launcher, migrate-skills-to-files, session |

---

## Consolidation Strategy

### Strategy 1: Skill Consolidation (18 skills to remove)

#### Tier 1: Merge into Meta-Skills (12 skills)

| Merge Target | Skills to Merge | Rationale |
|--------------|-----------------|-----------|
| `fullstack-engineer` | software-engineer + frontend-engineer | Both handle code generation; FE is subset of fullstack |
| `code-quality-engineer` | debugger + code-reviewer + qa-engineer | All address code quality from different angles |
| `game-engineer` | unity-engineer + unreal-engineer + godot-engineer + roblox-engineer + phaser3-engineer + threejs-engineer | Unified game development meta-skill |

#### Tier 2: Deprecate with Aliases (4 skills)

| Deprecated Skill | Alias Target | Reason |
|-----------------|--------------|--------|
| `frontend-engineer` | fullstack-engineer | Subset of fullstack |
| `database-engineer` | devops | Database management is DevOps responsibility |
| `ai-behavior-engineer` | ai-engineer | Specialized subset of AI engineering |
| `liveops-engineer` | devops | Operations subset |

#### Tier 3: Merge into Existing Categories (4 skills)

| Skill | Merge Into | Rationale |
|-------|-----------|-----------|
| `mobile-engineer` + `mobile-tester` | mobile-engineer | Combine with mobile-tester capability |
| `build-release-engineer` | devops | Build/release is DevOps responsibility |
| `game-accessibility-engineer` | accessibility-engineer | Unified accessibility across domains |
| `xlsx-engineer` | data-engineer | Data engineering includes spreadsheet work |

### Strategy 2: Script Consolidation (17 scripts to consolidate/remove)

#### Consolidate Duplicates (8 scripts)

| Keep | Remove | Rationale |
|------|--------|-----------|
| `verify-skills-count.sh` | `verify-skill-count.sh` | Duplicate functionality |
| `session-health-check.sh` | — | Keep (session validation) |
| `checkpoint-extract.sh` | — | Keep (checkpointing) |
| `memory-session.sh` | `session.sh` | session.sh is subset of memory-session |
| `memory-local.sh` | — | Keep (local memory operations) |
| `asip-deterministic-check.sh` | — | Keep (ASIP validation) |

#### Merge Related Scripts (6 scripts)

| Target | Merge Sources | New Name |
|--------|---------------|----------|
| `forgewright-dev.sh` | forgewright-setup, setup-project, fw-global-setup | `forgewright-dev.sh` (unified setup) |
| `memory-tools.sh` | memory-local, memory-session, memory-hygiene | `memory-tools.sh` (unified memory ops) |
| `validate.sh` | validate-commit, validate-push, validate-assets | `validate.sh` (unified validation) |

#### Deprecate Unused (3 scripts)

| Script | Status | Rationale |
|--------|--------|-----------|
| `convention-indexer.sh` | Deprecated | Low usage, can be integrated into verify scripts |
| `check-status.sh` | Deprecated | Redundant with session-health-check |
| `forgenexus-mcp-launcher.sh` | Deprecated | Legacy, GitNexus MCP replaces ForgeNexus |

### Strategy 3: Protocol Consolidation (6 protocols to consolidate/remove)

| Keep | Remove/Merge | Rationale |
|------|--------------|-----------|
| `plan-quality-loop.md` | — | Core protocol |
| `quality-dashboard.md` | `quality-gate.md` | Quality gate is subset of dashboard |
| `middleware-chain.md` | `bulkhead.md`, `circuit-breaker.md` | Consolidate resilience patterns |
| `parallel-protocol.md` | — | Keep (parallel execution) |
| `self-improving-loop.md` | — | Keep (ASIP core) |
| `execution-blocker-loop.md` | `graceful-failure.md` | Graceful failure is subset of blocker loop |
| `input-validation.md` | `sensitive-file-protection.md` | Combine validation concerns |

---

## Implementation Phases

### Phase A: Backward Compatibility Layer (Week 1)

Before any removal, establish aliases and deprecation warnings:

```bash
# scripts/skill-alias-loader.sh
#!/bin/bash
# Backward compatibility layer for renamed/deprecated skills

SKILL_NAME="$1"
SKILLS_DIR="skills"

# Alias mapping
declare -A ALIASES=(
    ["frontend-engineer"]="fullstack-engineer"
    ["software-engineer"]="fullstack-engineer"
    ["debugger"]="code-quality-engineer"
    ["code-reviewer"]="code-quality-engineer"
    ["qa-engineer"]="code-quality-engineer"
    ["database-engineer"]="devops"
    ["ai-behavior-engineer"]="ai-engineer"
    ["liveops-engineer"]="devops"
    ["build-release-engineer"]="devops"
    ["game-accessibility-engineer"]="accessibility-engineer"
    ["xlsx-engineer"]="data-engineer"
    ["mobile-tester"]="mobile-engineer"
)

# Check if skill exists
if [ -d "$SKILLS_DIR/$SKILL_NAME" ]; then
    echo "$SKILL_NAME"
elif [ -n "${ALIASES[$SKILL_NAME]}" ]; then
    echo "⚠️ WARNING: $SKILL_NAME is deprecated, using ${ALIASES[$SKILL_NAME]}" >&2
    echo "${ALIASES[$SKILL_NAME]}"
else
    echo "❌ ERROR: Skill not found: $SKILL_NAME" >&2
    exit 1
fi
```

### Phase B: Script Consolidation (Week 2-3)

1. Create unified scripts
2. Add deprecation notices to old scripts
3. Update all references to old scripts
4. Remove deprecated scripts after verification

### Phase C: Skill Consolidation (Week 4-6)

1. Create meta-skills
2. Migrate content from merged skills
3. Add aliases
4. Update orchestrator routing
5. Verify all modes still functional

### Phase D: Protocol Consolidation (Week 7-8)

1. Merge protocol content
2. Update skill references
3. Remove duplicate protocols
4. Verify all functionality preserved

---

## Verification Checklist

### Skill Consolidation

- [ ] All 24 modes still have valid skill routing
- [ ] Backward compatibility aliases work
- [ ] No broken references in AGENTS.md or CLAUDE.md
- [ ] GitNexus re-indexed and accurate
- [ ] Test suite passes (if implemented)

### Script Consolidation

- [ ] All existing functionality preserved
- [ ] New unified scripts work correctly
- [ ] Old scripts show deprecation warnings
- [ ] All callers updated to new script names
- [ ] CI/CD pipelines updated

### Protocol Consolidation

- [ ] All skills still reference valid protocols
- [ ] Protocol content logically organized
- [ ] Documentation reflects new structure
- [ ] No orphaned protocol references

---

## Risk Mitigation

| Risk | Mitigation | Owner |
|------|------------|-------|
| Breaking existing workflows | Backward compatibility aliases + feature flags | Architect |
| Mode routing failures | Comprehensive test coverage before removal | QA |
| Documentation inconsistencies | Automated link checker + dual-write period | Tech Writer |
| GitNexus index stale | Re-index after every change | DevOps |

---

## Success Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Skill count | 68 | 50 | `ls skills/*/SKILL.md \| wc -l` |
| Script count | 52 | 35 | `ls scripts/*.sh \| wc -l` |
| Protocol count | 36 | 30 | `ls skills/_shared/protocols/*.md \| wc -l` |
| Mode coverage | 100% | 100% | All 24 modes functional |
| Backward compat | 0% | 100% | All aliases resolve |

---

*Document Version: 1.0.0*
*Last Updated: 2026-05-29*
*Phase: Implementation Ready*
