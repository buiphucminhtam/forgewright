# Common Mistakes Reference

<!-- source: skills/production-grade/references/common-mistakes.md -->

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Running BUILD without DEFINE | Architecture decisions must exist first |
| Code reviewer doing OWASP review | security-engineer is sole OWASP authority |
| DevOps defining SLOs | sre is sole SLO authority |
| DevOps writing runbooks | sre writes runbooks to docs/runbooks/ |
| Skipping tests | Production grade means tested |
| Not running code after writing | Every skill verifies output compiles and runs |
| Skills working in isolation | Cross-reference via Context Bridging table |
| Over-asking the user | Respect engagement mode. Express: 3 gates only. Standard: 3 gates + moderate interview. Thorough/Meticulous: deeper interviews but always structured options. |
| Ignoring engagement mode | ALL skills must read settings.md and adapt depth. Express architect doesn't ask 15 questions. Meticulous PM doesn't skip to BRD after 2 questions. |
| One-size-fits-all architecture | Architecture is derived from constraints (scale, team, budget, compliance). A 100-user internal tool does NOT need microservices + K8s. |
| Writing stubs | No `// TODO: implement` in production code |
| Hardcoded paths | Read `.production-grade.yaml` for path overrides |
| Not leveraging skill architecture | Even though execution is sequential, each skill's internal phase structure ensures quality. Foundations before dependent work. |
| Duplicating security review | code-reviewer references security-engineer findings |
| Skipping quality gate | EVERY skill output must pass quality-gate.md — no exceptions, even in sequential mode |
| Ignoring code conventions in brownfield | Read `.forgewright/code-conventions.md` BEFORE writing code. Match existing patterns. |
| Modifying protected paths | Check brownfield-safety protected paths before ANY file write |
| No regression check in brownfield | After EACH build skill, verify existing tests still pass against baseline |
| Not saving session state | Call session lifecycle hooks at every phase/task/gate completion |
