# CLARIFY — Vague Requirement Resolver

If a user request is vague, check the Trigger Table below. You may ask up to three concise Multiple-Choice Questions (MCQs) only when needed to resolve ambiguity.
Do not block specific, clear requests. If the request is sufficiently detailed or explicit, proceed directly to planning.
When the user provides answers, record explicit defaults and constraints before starting implementation.

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

### MCQ 1: UI Improvement (Default: A)
"Which aspect of the UI needs improvement?"
- **A)** Layout, alignment, and spacing (structural fixes)
- **B)** Colors, theme, and styling (visual overhaul)
- **C)** Responsiveness (mobile/desktop view layout)
- **D)** Interaction, transitions, and animations

### MCQ 2: Error Investigation (Default: B)
"What is the observed behavior or error message?"
- **A)** The application crashes on startup / command fails completely
- **B)** There is an error message (please paste the logs/stack trace)
- **C)** Silent failure (it runs but gives incorrect output/behavior)
- **D)** Performance issue (it hangs, freezes, or takes too long)

### MCQ 3: Performance Target (Default: B)
"What is the primary target for performance optimization?"
- **A)** CPU or memory usage reduction
- **B)** API response latency / backend speed
- **C)** Database query speed (indexing, N+1 query elimination)
- **D)** Frontend bundle size or initial page load time

### MCQ 4: Auth Mechanism (Default: A)
"What authentication mechanism should we implement?"
- **A)** JWT (JSON Web Tokens) with Authorization Headers
- **B)** Session-based cookie authentication
- **C)** OAuth2 / Social Login (Google, GitHub, etc.)
- **D)** Simple Basic Authentication / API Keys

### MCQ 5: Integration Detail (Default: A)
"What environment and authentication details apply to this service?"
- **A)** Standard API key via environment variables (`.env`)
- **B)** OAuth client ID and client secret credentials
- **C)** Sandbox / local mock integration first (no real credentials yet)
- **D)** Direct SDK initialization (please specify package version if known)
