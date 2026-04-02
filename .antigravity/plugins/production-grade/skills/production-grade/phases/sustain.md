# SUSTAIN Phase — Dispatcher

This phase manages tasks T11 (Technical Writer), T12 (Skill Maker), and T13 (Compound Learning + Final Assembly).

## T11: Technical Writer

```
Update task.md: T11 status → in_progress

Read skills/technical-writer/SKILL.md and follow its instructions.
Context:
- Read ALL workspace folders at .forgewright/ for full project context.
- Read all project deliverables: api/, services/, frontend/, infrastructure/, tests/, docs/.
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
- Generate 3-5 project-specific skills as SKILL.md files.
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

Optionally append key patterns to project `ANTIGRAVITY.md` for cross-session persistence.

### Final Assembly

1. **Integration decision** — ask user via notify_user:

```
Code is ready. How would you like to integrate?

1. **Integrate all code (Recommended)** — Copy services, frontend, infra to project root
2. **Keep in workspace only** — Leave everything in .forgewright/
3. **Let me choose what to copy** — Select which components to integrate
4. **Chat about this** — Discuss integration strategy
```

2. **Run final validation:** `docker-compose up`, `make test`, `terraform validate`, health checks.

3. **Present final summary** using the orchestrator's template.

4. **Clean up:**
```
Update task.md: T13 status → completed
Mark all tasks as complete.
```

## Pipeline Complete

Print the final summary template from the orchestrator. All tasks should show as completed in task.md.
