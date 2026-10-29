# SUSTAIN Phase — Dispatcher

This phase manages tasks T11 (Technical Writer), T12 (Skill Maker), and T13 (Compound Learning + Final Assembly).

Run only SUSTAIN tasks required by the user's declared outcome and applicable
project capabilities. Skip inapplicable lanes with a reason; do not manufacture
skills, documentation systems or deployments. Change status to completed only
after observed acceptance checks. Remaining/failed tasks stay explicit, and
this phase cannot require a new permission round for already-authorized work.

## T11: Technical Writer

```
Update task.md: T11 status → in_progress

Read skills/technical-writer/SKILL.md and follow its instructions.
Context:
- Read the matching task state and only relevant workspace artifacts.
- Read the affected deliverables and current canonical documentation.
- Read protocols from: skills/_shared/protocols/
- Read .production-grade.yaml for paths and preferences.
- Generate: API reference (from OpenAPI specs), developer guides, operational guide, architecture guide, contributing guide.
- If features.documentation_site is true: scaffold Docusaurus site.
- Write docs to project root: docs/
- Write workspace artifacts to: .forgewright/technical-writer/

Update task.md: T11 status → completed
```

## T12: Skill Maker

```
Update task.md: T12 status → in_progress

Read skills/skill-maker/SKILL.md and follow its instructions.
Context:
- Analyze the completed project for recurring patterns: API routes, DB queries, auth checks, deployment procedures, testing patterns, domain-specific workflows.
- Read protocols from: skills/_shared/protocols/
- Create a project-specific skill only when authorized reusable capability is in scope; no fixed skill count.
- Install skills to: skills/
- Write workspace artifacts to: .forgewright/skill-maker/

Update task.md: T12 status → completed
```

## T13: Compound Learning + Final Assembly

After T11 and T12 complete:

```
Update task.md: T13 status → in_progress
```

### Compound Learning

Write to `.forgewright/compound-learnings.md`:

```markdown
## Learning: [date] — [project name]

### What Worked
- [patterns, decisions, tools that worked well]

### What Failed
- [errors encountered, root causes, how they were fixed]

### Architecture Insights
- [patterns that emerged, tech stack fit/misfit]

### Time Sinks
- [phases that took longest, what slowed them down]

### Skip Next Time
- [unnecessary steps for this project type]

### Add Next Time
- [missing steps that should have been included]
```

Optionally append key patterns to project `CLAUDE.md` for cross-session persistence.

### Final Assembly

Integrate the deliverables into the location and scope already authorized by the
user. Ask only if a material integration/publication decision remains unresolved;
do not impose an automatic copy/integrate interview.

Run final validation from the actual project capability and acceptance contract.
Use Docker, make, Terraform or health checks only where the project uses them
and the requested outcome requires them. Inspect real output; a command name or
phase label is not evidence of readiness.

Finalize canonical task state after checks/review pass, then run the unchanged
final verifier to bind that state. Mark only applicable verified tasks complete;
retain SKIPPED, unfinished and blocked items honestly. Reclaim task-owned resources
and provide exact receipt links plus material remaining runtime boundaries.

## Pipeline Complete

Complete only when the requested acceptance has been observed. A local task may
finish before SHIP/SUSTAIN; deployed/native success requires the corresponding
runtime evidence. Do not infer success from a phase list or a completed host turn.
