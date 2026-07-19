# Game Build Gates — Approval Checklists

> **Purpose:** Standardized approval criteria for Game Build pipeline gates. Each gate requires explicit sign-off before advancing to the next phase.

---

## Gate 0: Project Scoping (Pre-Game Designer)

**Approver:** Product Manager / User

**Triggers:** User initiates Game Build mode with concept description

### Checklist

- [ ] **Concept defined:** Game genre, theme, platform clearly stated
- [ ] **Target audience identified:** Age range, experience level, platform
- [ ] **Scope boundary:** MVP features vs nice-to-have clearly separated
- [ ] **Technical constraints:** Platform limitations, performance targets
- [ ] **Team capacity:** Available skills, time, resources
- [ ] **Art style direction:** Visual style keywords or reference images
- [ ] **Monetization model:** Premium, F2P, subscription, or hybrid
- [ ] **Competitor references:** 2-3 similar games identified

### Exit Criteria

✅ All items checked OR explicitly marked as "Not Applicable"  
✅ User approves scope before Game Designer begins

### Template Output

```markdown
## Gate 0 Sign-Off

**Project:** [Name]
**Date:** [Date]
**Approver:** [User/PM Name]

| Item | Status | Notes |
|------|--------|-------|
| Concept defined | ✅ | [Notes] |
| Target audience | ✅ | [Notes] |
| Scope boundary | ✅ | [Notes] |
| Technical constraints | ✅ | [Notes] |
| Team capacity | ✅ | [Notes] |
| Art style direction | ✅ | [Notes] |
| Monetization model | ✅ | [Notes] |
| Competitor references | ✅ | [Notes] |

**Approved:** [ ] Yes  [ ] No with changes
**Sign-off:** _______________________
```

---

## Gate 1: Art Style Approval

**Approver:** User + Art Director (if available)

**Triggers:** Game Designer completes Visual Style section

### Checklist

- [ ] **Versioned Style DNA contract:** `.forgewright/art-direction/game-art-contract.json` declares `schema_version: game-art-contract/v2`
- [ ] **Reference roles separated:** STYLE references define appearance; TARGET references define content/layout; CHARACTER references define identity
- [ ] **Visual pillars defined:** 3-5 keywords describing visual identity
- [ ] **Color palette approved:** Primary, secondary, accent colors with hex codes
- [ ] **Shape language consistent:** Character silhouette, UI geometry
- [ ] **Lighting mood established:** Emotional temperature (warm/cool, bright/dark)
- [ ] **Material direction:** PBR, stylized, toon, pixel art
- [ ] **UI style guide:** Typography, icon style, button design
- [ ] **Animation philosophy:** Fluid, snappy, exaggerated, subtle
- [ ] **Reference collection:** Mood board with 5-10 visual references
- [ ] **Technical feasibility:** Art style achievable within platform constraints
- [ ] **Performance budget:** Estimated draw calls, texture memory for target style
- [ ] **Confidence resolved:** Every populated `style.confidence` dimension is `>= 0.75`
- [ ] **Generation approval recorded:** `approval.status` is `approved` with approver and timestamp
- [ ] **Mechanical validation passes:** `python3 scripts/art-direction/style-contract.py validate .forgewright/art-direction/game-art-contract.json --stage generation`

### Exit Criteria

✅ All items checked  
✅ User approves visual direction  
✅ No conflicting visual elements identified
✅ Style DNA contract passes generation-stage validation

### Template Output

```markdown
## Gate 1 Sign-Off — Art Style

**Project:** [Name]
**Date:** [Date]
**Approver:** [User Name]

### Visual Pillars
1. [ ] ___________
2. [ ] ___________
3. [ ] ___________

### Color Palette
- Primary: #______
- Secondary: #______
- Accent: #______

### Style Selection
[ ] Realistic  [ ] Stylized  [ ] Pixel Art  [ ] Cartoon  [ ] Low-poly  [ ] Other: ___

### Approved References
| Reference | Source | Purpose |
|-----------|--------|---------|
| | | |

### Style DNA Contract
- Path: `.forgewright/art-direction/game-art-contract.json`
- Schema: `game-art-contract/v2`
- Validation: [ ] PASS
- Low-confidence fields remaining: [ ] None

**Approved:** [ ] Yes  [ ] No with changes
**Sign-off:** _______________________
```

---

## Gate 1A: Asset Handoff Readiness

**Approver:** Art Director + Engine Engineer

**Triggers:** One or more generated assets passed vision review

### Checklist

- [ ] **Versioned inventory:** Every approved asset is registered with `scripts/art-direction/art-pipeline.sh register <type> <name> <path>`
- [ ] **Idempotency:** Re-registering unchanged content does not create a new version
- [ ] **Drift gate:** `scripts/art-direction/art-pipeline.sh drift` exits successfully against the current Style DNA and source files
- [ ] **Engine manifest:** `scripts/art-direction/art-pipeline.sh manifest` emits `game-art-engine-import/v1`
- [ ] **Safe handoff:** `scripts/art-direction/art-pipeline.sh handoff <game-project-dir>` verifies hashes and refuses to overwrite target-side changes

### Exit Criteria

✅ Asset inventory, current Style DNA, and source hashes agree
✅ Engine import metadata carries pixels-per-unit, compression, atlas, and filter settings
✅ Handoff manifest and copied assets pass hash verification

---

## Gate 2: Architecture Approval

**Approver:** Solution Architect / Tech Lead

**Triggers:** Unity Engineer completes Core Framework phase

### Checklist

- [ ] **ScriptableObject framework documented:** Variables, Events, RuntimeSets defined
- [ ] **Event channel diagram:** All GameEvents and their listeners mapped
- [ ] **Folder structure approved:** `/Scripts/Core`, `/Scripts/Gameplay`, `/Data`, etc.
- [ ] **State machine design:** Player states, AI states, game states documented
- [ ] **Data flow defined:** How data moves between systems
- [ ] **Save/load architecture:** What persists, how, where
- [ ] **Input system chosen:** New Input System (recommended) or legacy
- [ ] **Render pipeline selected:** URP (default), HDRP, or Built-in
- [ ] **Multiplayer architecture (if needed):** Netcode for GameObjects, Relay, Lobby
- [ ] **Performance targets:** Target FPS, draw calls, memory budget
- [ ] **Platform priorities:** PC > Mobile, or Mobile-first optimization
- [ ] **DOTS consideration:** Pure DOTS, hybrid, or GameObject-only (see DOTS Decision Guide)

### Exit Criteria

✅ Architecture document complete  
✅ No architectural red flags (circular dependencies, tight coupling)  
✅ User approves architecture before gameplay implementation

### Template Output

```markdown
## Gate 2 Sign-Off — Architecture

**Project:** [Name]
**Date:** [Date]
**Approver:** [Tech Lead/User]

### Framework Components
| Component | Status | Notes |
|-----------|--------|-------|
| SO Variables | [ ] Done | |
| GameEvents | [ ] Done | |
| RuntimeSets | [ ] Done | |
| StateMachine | [ ] Done | |

### Folder Structure
```
Assets/_Project/
├── Scripts/Core/        [ ] ✓
├── Scripts/Gameplay/   [ ] ✓
├── Data/               [ ] ✓
├── Prefabs/            [ ] ✓
└── ...
```

### Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Render Pipeline | URP | [Reason] |
| Input System | New Input System | [Reason] |
| Multiplayer | Netcode for GO | [Reason/N/A] |

**Approved:** [ ] Yes  [ ] No with changes
**Sign-off:** _______________________
```

---

## Gate 3: Implementation Approval

**Approver:** QA Engineer + User

**Triggers:** Unity Engineer completes all gameplay systems

### Checklist

- [ ] **All GDD mechanics implemented:** Combat, movement, progression, etc.
- [ ] **No TODO stubs:** All placeholder comments resolved
- [ ] **Performance targets met:** 60 FPS on target platform
- [ ] **Memory within budget:** No memory leaks, proper pooling
- [ ] **All scripts compile:** No build errors
- [ ] **Core loop functional:** Player can start, play, and complete a session
- [ ] **UI responsive:** All screens, menus, HUD functional
- [ ] **Save/load working:** Progress persists correctly
- [ ] **Edge cases handled:** Invalid inputs, null references, out-of-bounds
- [ ] **Error handling:** Graceful failure with meaningful messages
- [ ] **Assembly definitions:** Compilation time optimized
- [ ] **Build settings configured:** All platforms target set

### Exit Criteria

✅ Unity build successful  
✅ Core gameplay loop playable  
✅ No blocking bugs  
✅ QA approves implementation

### Template Output

```markdown
## Gate 3 Sign-Off — Implementation

**Project:** [Name]
**Date:** [Date]
**Approver:** [QA/User]

### Feature Checklist
| Feature | Implemented | Tested | Notes |
|---------|-------------|--------|-------|
| Player Movement | [ ] | [ ] | |
| Combat System | [ ] | [ ] | |
| Enemy AI | [ ] | [ ] | |
| Progression/XP | [ ] | [ ] | |
| Economy | [ ] | [ ] | |
| UI/HUD | [ ] | [ ] | |
| Save System | [ ] | [ ] | |

### Build Status
- [ ] Builds without errors
- [ ] Runs on target platform
- [ ] Performance targets met (60 FPS)

### Blocking Issues
| Issue | Severity | Status |
|-------|----------|--------|
| None | — | — |

**Approved:** [ ] Yes  [ ] No with changes
**Sign-off:** _______________________
```

---

## Gate 4: Testing Approval (Pre-Ship)

**Approver:** QA Engineer + User

**Triggers:** All systems tested, ready for release build

### Checklist

- [ ] **Mechanics tests pass:** All gameplay mechanics verified
- [ ] **Balance verified:** Damage numbers, XP curves, economy balanced
- [ ] **No critical bugs:** Severity 1-2 bugs fixed or documented
- [ ] **Regression pass:** Previously fixed bugs still fixed
- [ ] **Platform testing:** All target platforms tested
- [ ] **Performance validated:** Profiling shows no bottlenecks
- [ ] **Memory validated:** No leaks under extended play
- [ ] **Audio verified:** All SFX, music, VO present and working
- [ ] **Localization ready:** Text externalized, UI accommodates languages
- [ ] **Accessibility:** Colorblind modes, subtitles, remappable controls
- [ ] **Store assets ready:** Icons, screenshots, trailers prepared
- [ ] **Legal compliance:** Age rating, data privacy requirements met

### Exit Criteria

✅ All checklist items pass  
✅ QA sign-off obtained  
✅ User approves release

### Template Output

```markdown
## Gate 4 Sign-Off — Testing

**Project:** [Name]
**Date:** [Date]
**Approver:** [QA Lead/User]

### Test Summary
| Category | Tests | Passed | Failed |
|----------|-------|--------|--------|
| Mechanics | 50 | 48 | 2 |
| Performance | 10 | 10 | 0 |
| Regression | 30 | 30 | 0 |
| Platform | 5 | 4 | 1 |

### Bug Status
| Severity | Open | Closed |
|----------|------|--------|
| Critical (S1) | 0 | 10 |
| High (S2) | 2 | 8 |
| Medium (S3) | 5 | 15 |
| Low (S4) | 10 | 20 |

### Release Blockers
| Blocker | Owner | ETA |
|---------|-------|-----|
| None | — | — |

**Approved for Release:** [ ] Yes  [ ] No with changes
**Sign-off:** _______________________
```

---

## Gate Escalation Protocol

### If Gate Fails

1. **Document failure:** Note which items failed and why
2. **Create remediation plan:** Specific tasks to fix failures
3. **Assign owner:** Who is responsible for fixing
4. **Set deadline:** When fixes must be completed
5. **Re-review:** Return to gate after fixes

### Escalation Matrix

| Gate | Fail Impact | Escalation Path |
|------|-------------|-----------------|
| Gate 0 | Scope unclear | User clarification |
| Gate 1 | Visual inconsistency | Art revision |
| Gate 2 | Refactoring needed | Architecture redesign |
| Gate 3 | Blocking bugs | Developer fix + QA retest |
| Gate 4 | Release blocked | QA + Dev emergency fix |

---

## Quick Reference

| Gate | Focus | Approver | Time in Pipeline |
|------|-------|----------|------------------|
| Gate 0 | Scoping | PM/User | Pre-phase |
| Gate 1 | Art Style | Art/User | After Game Designer |
| Gate 2 | Architecture | Tech Lead | After Core Framework |
| Gate 3 | Implementation | QA/User | After Gameplay Systems |
| Gate 4 | Testing | QA Lead | Pre-Release |
