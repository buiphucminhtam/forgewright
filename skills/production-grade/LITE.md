---
name: production-grade
description: >
  LITE overlay for the production-grade orchestrator. Provides compact
  domain-specific GROUND and DECOMPOSE slots for orchestration tasks
  within the Kernel LITE boot budget.
version: 1.0.0
tags: [orchestrator, meta, routing, pipeline]
---

# Production Grade Orchestrator (LITE)

## SOLVE Step 2: GROUND (Orchestrator Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Project has git repo | `git status 2>/dev/null` | ... | run the check command and paste output |
| Forgewright workspace exists | `ls .forgewright/ 2>/dev/null` | ... | run the check command and paste output |
| Config file present | `cat .production-grade.yaml 2>/dev/null` | ... | run the check command and paste output |
| Skills registry exists | `cat skills/skills-registry.yaml 2>/dev/null \| head -5` | ... | run the check command and paste output |
| MCP tools available | Check if `fw_start_pipeline` is callable | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Orchestrator Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

### Request Classification
- `n. Classify user request into mode | SKILL.md mode table | Mode name logged`
- `n. Select skill(s) to dispatch | Compact routing table or INDEX.md | Skill path(s) identified`

### Pipeline Management (if MCP tools available)
- `n. Start pipeline | fw_start_pipeline | Pipeline ID returned`
- `n. Advance phase | fw_advance_to_next_phase | Phase name updated`
- `n. Request gate approval | fw_request_gate_approval | Gate status logged`

### Skill Dispatch
- `n. Load skill overlay | skills/<name>/LITE.md or SKILL.md | Overlay content loaded`
- `n. Execute skill SOLVE loop | Selected skill's protocol | VERIFY block emitted`

## Mode Quick Reference
| Mode | Primary Skills | Trigger |
|---|---|---|
| Full Build | All skills, 6 phases | "Build a SaaS for..." |
| Feature | PM → Arch → BE/FE → QA | "Add [feature]..." |
| Debug | Debugger | "Fix the bug..." |
| Review | Code Reviewer | "Review my code" |
| Test | QA Engineer | "Write tests" |
| Ship | DevOps → SRE | "Deploy / CI/CD" |
| Design | UX → UI Designer | "Design UI for..." |
| Game Build | Game Designer → Art Director Style DNA Gate → Engine | "Build a game..." |
| Explore | Polymath | "Help me think..." |
