---
id: game-evaluation-rubric
title: Multi-Angle Game Quality Evaluation Protocol
summary: Evidence-backed, stage-gated game evaluation framework synthesizing MDA, Elemental Tetrad, PENS/SDT, PXI/miniPXI, Swink Game Feel, Hodent UX, PLAY, Korhonen Mobile Playability, XAG Accessibility, Technical Frame Pacing/Latency, and Ethical Monetization.
status: active
version: 1.0.0
owners: [core, game]
triggers: [game build, game review, milestone review, playtest, game polish]
used_by: [game-designer, game-engineer, art-director, ui-designer, qa-engineer, ux-researcher, performance-engineer, game-accessibility-engineer, production-grade]
related: [game-studio-pipeline, game-test-protocol, mobile-monetization, qa-test-protocol, verification]
supersedes: []
superseded_by: null
---

# Multi-Angle Game Quality Evaluation Protocol

> **Anti-Bias Invariant:** Never score a game from developer intuition or prose alone. Every rating on the 1–4 rubric MUST attach observed evidence (blind playtest clip/notes, `miniPXI` response summary, grayscale readability screenshot, profiler 1%-low frame-time capture, or telemetry funnel). Unobserved axes remain `UNVERIFIED` — never `3` or `4`.

Use this protocol as the recurring evaluation backbone inside `skills/_shared/protocols/game-studio-pipeline.md` across weekly build checks, bi-weekly blind playtests, and milestone exit gates.

---

## 1. Eight Evaluation Angles & Reference Frameworks

| # | Angle | Grounded Frameworks | Primary Owner Lens | Core Observed Signals |
|---|---|---|---|---|
| **1** | **Core Design & Cohesion** | **MDA** (Hunicke/LeBlanc/Zubek) · **Elemental Tetrad** (Schell: Mechanics, Story, Aesthetics, Technology) | `game-designer` | Mechanics produce intended Dynamics & Aesthetics; 4 Tetrad pillars reinforce one promise; zero degenerate/dominant strategies. |
| **2** | **Player Experience & Motivation** | **PENS / SDT** (Competence, Autonomy, Relatedness) · **PXI / miniPXI** (Vanden Abeele et al., 10 constructs) | `ux-researcher` + `game-designer` | Functional (Control, Progress Feedback, Audiovisual Appeal, Clarity of Goals/Rules, Challenge) + Psychosocial (Mastery, Autonomy, Immersion, Curiosity, Meaning). |
| **3** | **Game Feel & Kinesthetics** | **Swink Game Feel** (Real-Time Control, Simulated Space, Polish/Juice, Metaphor) · **Nintendo Toy-first** | `game-designer` + engine specialist | Action/contact/recovery clarity, weight/momentum fit, input buffering/coyote timing where intended, zero juice-without-information. |
| **4** | **Usability, FTUE & Onboarding** | **Celia Hodent (*Gamer's Brain*)** (Usability + Engage-ability) · **PLAY / HEP** (Desurvire) | `ux-researcher` + `ui-designer` | Blind 10-minute FTUE without verbal coaching; learn-by-doing pacing; minimal cognitive overload; clear failure & recovery loops. |
| **5** | **Mobile / Portable Playability** *(when applicable)* | **Korhonen & Koivisto Mobility Model** | `mobile-engineer` + `ui-designer` | Quick Start (minimal boot-to-play delay), Interruptibility (instant pause/save/resume), thumb ergonomics, playable muted & in bright lighting. |
| **6** | **Art, Audio & UI Readability** | **Squint & Grayscale Test** · **Silhouette & Figure–Ground Separation** · **Unslop UI Craft** | `art-director` + `unslop` + `game-audio-engineer` | Key actors, hazards, projectiles, and goals read instantly in grayscale & thumbnail; audio/visual/haptic cue hierarchy without HUD clutter or AI slop. |
| **7** | **Accessibility & Inclusivity** | **Xbox Accessibility Guidelines (XAG)** · **Game Accessibility Guidelines (GAG)** | `game-accessibility-engineer` | Color-independent state coding + readable contrast; subtitles & visual audio cues; input remapping/toggle options; reduced-motion/flash-safe controls. |
| **8** | **Technical, Economy & Ethics** | **Frame Pacing (1%/0.1% Lows) & Latency** · **Faucets/Sinks** · **Supercell Retention** · **Ethical Monetization** | `performance-engineer` + `product-manager` + `qa-engineer` | Stable 99th-percentile frame times (<=16.67ms @ 60fps), responsive end-to-end input latency (<50ms competitive / 50–80ms standard), zero RAM/thermal collapse over sustained play; faucet/sink balance; transparent, non-P2W monetization. |

---

## 2. Stage-Gate Evaluation Matrix (Right Criteria at the Right Stage)

Do not score late-stage polish during early prototyping, and do not defer core-fun or FTUE checks until Beta.

| Studio Phase | Exit Gate Question | Mandatory Evaluation Angles | Kill / Pivot / Pass Bar |
|---|---|---|---|
| **Pre-Production / Prototype** *(Greybox)* | Is the core loop genuinely fun and legible? | **#1 Core Design**, **#3 Game Feel**, **#4 Blind Playtest** | Blind testers want to keep playing without coaching; core control feel >= **3**. If dull -> **KILL or PIVOT** before production art. |
| **Vertical Slice** *(1 representative loop)* | Does one full slice hit target fidelity & sustainable unit cost? | **#1**, **#2 (`miniPXI`)**, **#3**, **#6 Readability & Unslop**, **#8 baseline budgets** | Target fidelity proven end-to-end; second content-unit cost measured; zero score **1** across active angles. |
| **Alpha** *(Feature Complete)* | Does the full game hold together start-to-finish? | **#1–#6**, **#8 Economy & Stability** | Zero S1 blockers/softlocks; blind 10-min FTUE completes without intervention; no dominant strategy or runaway economy. |
| **Beta** *(Content Freeze & Polish)* | Is it smooth, accessible, fair, and ship-ready? | **All 8 Angles** (Full PXI/miniPXI, XAG, 1% lows, latency, thermal/memory, ethical monetization) | Every applicable angle >= **3** with current build/device evidence; zero unapproved score **1–2** regressions. |
| **Soft Launch / Sustain** | Do real players retain and engage sustainably? | **#2 Telemetry/Sentiment**, **#8 Retention (D1/D7/D30) & Funnel Drop-off** | Decisions driven by observed funnel/retention cohorts and player reviews, never assumptions. |

---

## 3. Recurring Cadence During Production

1. **Weekly — 15-Minute Playable Build Audit (Internal):**
   Play the actual current build (never rely on code diff or video alone) and check 4 fast regressions:
   - Control/feel timing or input lag regression?
   - Grayscale combat/gameplay screenshot readability intact?
   - 1% low frame-time / hitch spike on target hardware?
   - Save/pause/resume/softlock clean?
2. **Bi-Weekly — Blind Playtest + `miniPXI` (3–5 fresh testers when available):**
   - Record first 10 minutes with zero verbal hints; timestamp every hesitation, misclick, or confusion.
   - Collect the **11-item `miniPXI`** (covering all 10 PXI constructs + Enjoyment on a -3 to +3 scale) to track directional drift sprint-over-sprint.
3. **Per Milestone — Full 8-Angle Scorecard:**
   Record the compact evidence-bound table below in the resolved studio state file (default: `production/session-state/game-studio.md`) — do not spawn duplicate transient report files.

---

## 4. Evidence-Bound Scorecard Scale & Template

- **1 — Critical Blocker:** Fails exit gate (broken feel, unreadable action, softlock, >120ms lag, predatory dark pattern, severe stutter).
- **2 — Below Bar:** Playable but visibly hurts UX/retention/readability; must remediate before Beta/Release.
- **3 — Ship Target:** Meets target genre/platform bar backed by observed evidence.
- **4 — Signature Polish:** Memorable craft benchmark (e.g., <50ms latency, effortless invisible onboarding, standout glance readability).
- **`UNVERIFIED` / `N/A`:** Use `UNVERIFIED` when evidence/participants/devices are absent (never inflate to `3`); use `N/A` only with an explicit rationale (e.g., Mobility on desktop-only titles).

```markdown
### Game Quality Evaluation — <Milestone / Date / Build SHA>
Stage: Prototype | Vertical Slice | Alpha | Beta | Soft Launch

| # | Angle | Score (1–4 / UNVERIFIED / N/A) | Observed Evidence (capture / profiler / playtest / miniPXI) | Top Defect / Action |
|---|---|---:|---|---|
| 1 | Core Design & Cohesion (MDA / Tetrad) | | | |
| 2 | Player Experience (PENS / miniPXI) | | | |
| 3 | Game Feel & Kinesthetics (Swink) | | | |
| 4 | Usability & FTUE (Hodent / PLAY) | | | |
| 5 | Mobile Playability (Korhonen) | | | |
| 6 | Art, Audio & UI Readability (Grayscale / Unslop) | | | |
| 7 | Accessibility (XAG / GAG) | | | |
| 8 | Technical, Economy & Ethics | | | |

Decision: PASS | ITERATE | PIVOT | KILL
Blocking items before next gate: <list or none>
```
