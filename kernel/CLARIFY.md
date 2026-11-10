# CLARIFY — Vague Requirement Resolver

Clarify only a **material unknown** that changes acceptance, cost, risk, or a public contract and cannot be resolved from the current workspace/runtime. Inspect evidence before asking. If a reversible default preserves the user's objective, state the default briefly and proceed.

The Trigger Table below is a guide, not a mandatory interview. Do not block clear requests, do not ask a question that current project evidence can answer, and do not force MCQs merely because a phrase matches a trigger.

## Trigger Table

| Vague Phrase / Pattern | Category | Action |
|---|---|---|
| "make it look better" / "improve the UI" | UI/UX Aesthetics | Prompt with **MCQ 1: UI Improvement** |
| "it's broken" / "fix the bug" (no trace/logs) | Unspecified Error | Prompt with **MCQ 2: Error Investigation** |
| "make it faster" / "optimize this" | Performance | Prompt with **MCQ 3: Performance Target** |
| "add authentication" / "secure the app" | Security / Auth | Prompt with **MCQ 4: Auth Mechanism** |
| "integrate [service]" (without config details) | Third-Party Integration | Prompt with **MCQ 5: Integration Detail** |

---

## Multiple-Choice Questions (MCQs)

- **MCQ 1 — UI Improvement (Default: A):** A) Layout/spacing · B) Colors/theme · C) Responsiveness · D) Interaction/motion. *Invariant: responsiveness, accessibility, and design-system consistency remain required.*
- **MCQ 2 — Error Investigation (Default: B):** A) Startup/command crash · B) Error message/stack trace · C) Silent wrong output · D) Hang/performance.
- **MCQ 3 — Performance Target (Default: B):** A) CPU/memory · B) API/backend latency · C) Database queries · D) Frontend bundle/load.
- **MCQ 4 — Auth Mechanism (No default — explicit choice required):** A) JWT w/ rotation · B) Session cookies · C) OAuth2/Social · D) Service API keys.
- **MCQ 5 — Integration Detail (Default: A):** A) `.env` API key · B) OAuth client credentials · C) Local sandbox/mock first · D) Direct SDK.
