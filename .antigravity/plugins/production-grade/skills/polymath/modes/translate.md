# Translate Mode — Pipeline Companion

Load this mode when the user needs help understanding pipeline artifacts, gate decisions, or technical outputs produced by other skills.

## Entry Behavior

When invoked at a gate or during pipeline execution:

1. **Read the context** — what phase, what gate, what's being decided
2. **Read the artifacts** — parallel Read of all relevant files produced by the skill
3. **Translate** — rewrite technical content in plain language
4. **Present with understanding-check options**

## Translation Patterns

### BRD Translation (Gate 1)

Read `.forgewright/product-manager/BRD/brd.md`, then:

- Translate each user story into plain "what this means" language
- Group features by what the user will see/experience
- Explain technical terms inline (multi-tenant = "each customer gets their own isolated account")
- Highlight what's IN scope and what's explicitly OUT

Present:
```python
notify_user with markdown options:
  "question": "[Plain-language BRD summary]",
  "header": "BRD Explained",
  "options": [
    {"label": "I understand — approve the BRD (Recommended)", "description": "Lock requirements, start architecture"},
    {"label": "Explain [specific feature] more", "description": "[feature that might be confusing]"},
    {"label": "What does [technical term] mean?", "description": "Clarify jargon"},
    {"label": "I want to change something", "description": "Modify requirements before approving"},
    {"label": "Chat about this", "description": "Free-form input"}
  ],
  "multiSelect": false
}])
```

### Architecture Translation (Gate 2)

Read `docs/architecture/`, `api/`, `schemas/`, then:

- Explain the architecture pattern using real-world analogies
- Translate tech stack choices into "why this matters for you" language
- Explain cost implications in concrete dollar amounts
- Surface the 2-3 most important trade-offs the user should know about

Use analogies that match the user's domain:
- "Modular monolith" → "One building with clearly separated rooms — kitchen, dining, office"
- "Multi-tenant row isolation" → "Everyone's data is in the same filing cabinet but in locked, separate drawers"
- "Redis cache" → "A cheat sheet for frequent lookups — instead of searching the whole database, check the cheat sheet first"
- "Circuit breaker" → "If one supplier is down, stop calling them for 30 seconds instead of blocking every order"

### Security Findings Translation

Read `.forgewright/security-engineer/`, then:

- Translate severity levels: Critical = "this can cause real damage now", High = "must fix before going live"
- Explain each finding in terms of business impact, not technical details
- Group by theme: "authentication issues", "data exposure risks", "dependency problems"

### Production Readiness Translation (Gate 3)

Read all SHIP phase outputs, then:

- Translate SLOs: "99.9% availability means your app can be down for at most ~43 minutes per month"
- Explain infrastructure costs in concrete monthly amounts
- Translate deployment strategy: "blue-green means zero downtime during updates"
- Surface any remaining risks in business terms

## Key Rules

1. **Never assume technical knowledge.** Explain every term the first time you use it.
2. **Use the user's domain for analogies.** Restaurant owner? Use kitchen metaphors. Finance? Use accounting metaphors.
3. **Focus on "what this means for you" not "how it works."** Technical details only if the user asks for them via options.
4. **After translating, ALWAYS re-present the original gate options.** You explain, the user decides. Never make the decision for them.
5. **Anticipate confusion.** Pre-empt "what does X mean?" by offering it as an option before they need to ask.

## Output

Translate mode is **ephemeral** — it produces no persistent files. Its output is understanding in the conversation, not documents. The only exception: if the translation reveals a gap or concern, note it in `context/decisions.md`.
