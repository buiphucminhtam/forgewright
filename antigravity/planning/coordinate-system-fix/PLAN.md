# Forgewright Game Coordinate System Fix - IMPROVED PLAN v2

## 1. Problem Statement

**Current Issue**: When coding games in Forgewright, frequently unable to accurately identify coordinates to properly position assets.

**Root Causes Identified from Research**:
1. Engine coordinate system mismatch (Unity LH vs Godot RH)
2. Import scale inconsistency (FBX vs native formats)
3. No standardized coordinate conventions documentation
4. Floating point precision issues at large distances (>5000 units)
5. Missing validation/checklist system for asset placement

**Specific Threshold**: All coordinate conversions must be accurate to ±0.001 units.

---

## 2. Goals

| # | Goal | Success Metric |
|---|------|----------------|
| G1 | Document coordinate conventions for 4 engines | 100% coverage |
| G2 | Create validation CLI command | Pass all 12 test scenarios |
| G3 | Build conversion utility with ±0.001 precision | All test cases pass |
| G4 | Provide floating origin templates | Working for Unity + Godot |
| G5 | Integrate into Forgewright skills | Listed in skill docs |

---

## 3. Scope

### In Scope
- Unity (Left-Hand, -Z forward, 1 unit = 1 meter)
- Godot (Right-Hand, +Z forward, 1 unit = 1 meter)
- Unreal (Left-Hand, +Z forward, 1 unit = 1 cm)
- Blender (Right-Hand, +Z forward, 1 unit = 1 meter)
- glTF 2.0 / FBX import handling
- Forgewright CLI integration
- Editor visual helpers (coordinate gizmos)

### Out of Scope
- Modifying game engine source code
- Creating new game engines
- 3D modeling tutorials
- Maya/3ds Max pipeline (only Blender documented)

---

## 4. Tasks Breakdown

### Phase 1: Documentation & Standards (4h)

#### Task 1.1: Coordinate System Cheatsheet (1.5h)
- [ ] Create `docs/coordinate-systems/cheatsheet.md`
- [ ] Include visual diagrams for each engine
- [ ] Add axis orientation illustrations
- [ ] Create quick reference table

#### Task 1.2: Engine Import Settings Doc (1.5h)
- [ ] Unity: FBX import, scale factor, axis conversion
- [ ] Godot: Import defaults, GLTF settings
- [ ] Unreal: FBX import, unit scale
- [ ] Blender: Export settings for each engine

#### Task 1.3: Axis Conversion Reference (1h)
- [ ] Create conversion matrix table
- [ ] Document rotation flip requirements
- [ ] Add code snippets for each conversion

#### Task 1.4: Integration into Skills (INTEGRATION) → Phase 5

---

### Phase 2: Validation CLI (6h)

#### Task 2.1: `forge validate --asset-coords` Command (2h)
- [ ] Design command interface
- [ ] Implement coordinate bounds checker
- [ ] Add JSON output support
- [ ] Write unit tests (TDD)

#### Task 2.2: Coordinate Bounds Checker (1.5h)
- [ ] Check if coordinates exceed single-precision threshold
- [ ] Warn if >5000 units from origin
- [ ] Suggest floating origin if needed

#### Task 2.3: Import Scale Detector (1.5h)
- [ ] Parse FBX/glTF metadata
- [ ] Detect unit scale mismatches
- [ ] Generate import report

#### Task 2.4: Validation Test Suite (1h)
- [ ] 12 test scenarios (see Section 5)
- [ ] Integration tests
- [ ] Edge case coverage

---

### Phase 3: Conversion Utilities (4h)

#### Task 3.1: Coordinate Conversion Library (2h)
- [ ] `CoordConverter` class
- [ ] `transform LH → RH`
- [ ] `transform RH → LH`
- [ ] `applyAxisFlip()`
- [ ] Unit tests with known values

#### Task 3.2: `forge coords convert` Command (1h)
- [ ] Parse source/target engine
- [ ] Apply transformation
- [ ] Output formatted result

#### Task 3.3: Batch Conversion Tool (1h)
- [ ] Process multiple coordinates
- [ ] CSV input/output support
- [ ] Progress reporting

---

### Phase 4: Floating Origin Support (4h)

#### Task 4.1: Godot Floating Origin (1.5h)
- [ ] GDScript implementation
- [ ] Threshold configuration
- [ ] Test with large world scene

#### Task 4.2: Unity Floating Origin (1.5h)
- [ ] C# implementation
- [ ] Physics.SyncTransforms() integration
- [ ] Test with large world scene

#### Task 4.3: Documentation (1h)
- [ ] Usage guide
- [ ] Performance considerations
- [ ] Troubleshooting

---

### Phase 5: Editor Visual Tools (3h)

#### Task 5.1: Coordinate Display Gizmo (1.5h)
- [ ] Godot: Label3D showing global/local coords
- [ ] Unity: Editor script showing coord overlay

#### Task 5.2: Placement Checklist Panel (1.5h)
- [ ] Checklist UI before placement
- [ ] Auto-check transform applied
- [ ] Warning indicators

---

### Phase 6: Integration & Testing (2h)

#### Task 6.1: Forgewright Skills Integration (1h)
- [ ] Update Unity Engineer skill
- [ ] Update Godot Engineer skill
- [ ] Add to Game Designer skill

#### Task 6.2: Final Test Suite (1h)
- [ ] End-to-end tests
- [ ] Documentation tests
- [ ] Performance benchmarks

---

## 5. Test Scenarios (12 Required)

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| T1 | Unity LH → Godot RH conversion | Position matches ±0.001 |
| T2 | Godot RH → Unity LH conversion | Position matches ±0.001 |
| T3 | Unity rotation (-Z fwd) → Godot rotation (+Z fwd) | Rotation correct |
| T4 | Scale: 1 unit consistency check | All engines = 1 meter |
| T5 | Large world: 10,000 units from origin | Warning issued |
| T6 | Large world: After floating origin | Objects stable |
| T7 | FBX import scale detection | Correct scale factor |
| T8 | glTF import detection | Correct unit metadata |
| T9 | Batch: 1000 coordinates converted | All pass ±0.001 |
| T10 | Edge: (0,0,0) origin | No transformation needed |
| T11 | Edge: Negative coordinates | Handled correctly |
| T12 | Edge: Very small values (0.0001) | Precision maintained |

---

## 6. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Engine version API changes | Medium | Medium | Version-specific code paths, feature flags |
| Coordinate precision loss | Low | High | Use double precision internally, validate output |
| Test coverage gaps | Medium | Medium | 12 required test scenarios, ≥80% coverage |
| User adoption resistance | Low | Low | Backward compatibility, opt-in features |
| glTF/FBX metadata inconsistencies | Medium | Medium | Warn on missing metadata, use defaults |
| Floating origin physics sync issues | Medium | High | Physics.SyncTransforms(), thorough testing |

### Rollback Plan
- Each phase is independent
- Git tags per phase
- Feature flags disable new features
- CLI commands are additive (no breaking changes)

---

## 7. Task Dependencies

```
1.1 Cheatsheet ──────────────┐
1.2 Import Settings ─────────┼── 1.3 Axis Reference ───┐
1.4 Integration (Phase 5) ◄──┘                         │
                                                       │
2.1 validate command ──► 2.2 bounds checker ──► 2.3 scale detector ──► 2.4 tests
                  │                                    │
                  └────────────────────────────────────┘
                                │
3.1 conversion lib ──► 3.2 convert cmd ──► 3.3 batch tool
        │
        └──────────────────────────────┐
                                     │
4.1 Godot floating ──► 4.3 docs      │
4.2 Unity floating ──► 4.3 docs ─────┘
                    │
5.1 gizmo ──► 5.2 checklist
        │
        └──────────────┐
                     │
6.1 skills ◄─────────┼────────► 6.2 tests
                     │
              (All phases complete)
```

---

## 8. Timeline (with Buffer)

| Week | Phase | Tasks | Buffer |
|------|-------|-------|--------|
| Week 1, Day 1-2 | Phase 1 | 1.1, 1.2, 1.3 | 10% |
| Week 1, Day 3-4 | Phase 2 | 2.1, 2.2, 2.3 | 10% |
| Week 1, Day 5 | Phase 2.4 + Review | 2.4, Retrospective | 10% |
| Week 2, Day 1-2 | Phase 3 | 3.1, 3.2, 3.3 | 10% |
| Week 2, Day 3-4 | Phase 4 | 4.1, 4.2, 4.3 | 10% |
| Week 2, Day 5 | Phase 5 | 5.1, 5.2 | 10% |
| Week 3, Day 1-2 | Phase 6 | 6.1, 6.2 | 10% |
| Week 3, Day 3-4 | Buffer | Unexpected issues | 20% |

**Total: 19h planned → 23h with buffer**

---

## 9. Success Criteria (Updated)

| Criterion | Metric | Verification |
|-----------|--------|--------------|
| Documentation | 4 engines fully documented | PR review |
| Validation CLI | Pass all 12 test scenarios | `npm test` |
| Conversion accuracy | ±0.001 units | Unit tests |
| Test coverage | ≥80% | Coverage report |
| Integration | Listed in 3 skills | Skill docs updated |
| Editor tools | Working gizmo + checklist | Demo scene |
