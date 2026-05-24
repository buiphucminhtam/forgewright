# Credit-Killing Patterns Reference

> Extracted from chat-interpreter skill. These 35 patterns represent the most common reasons prompts fail to produce good outputs.

## Task Patterns (7)

| # | Pattern | Detection | Fix |
|---|---------|-----------|-----|
| 1 | **Vague task verb** | "help me", "make it", "do something" | Convert to precise operation |
| 2 | **Two tasks in one prompt** | "explain AND rewrite", "build AND test" | Split into sequential prompts |
| 3 | **No success criteria** | "make it better", "improve it" | Derive binary pass/fail criteria |
| 4 | **Over-permissive agent** | "do whatever it takes", "fix everything" | Add explicit allowed/forbidden list |
| 5 | **Emotional description** | "it's broken", "so annoying", "totally wrong" | Extract specific technical fault |
| 6 | **Build-the-whole-thing** | "build my entire app" | Decompose into sequential prompts |
| 7 | **Implicit reference** | "the thing we discussed", "as before" | Always restate full context |

## Context Patterns (6)

| # | Pattern | Detection | Fix |
|---|---------|-----------|-----|
| 8 | **Assumed prior knowledge** | "continue", "as we discussed", "you know" | Prepend Memory Block |
| 9 | **No project context** | Generic request without domain info | Inject project profile context |
| 10 | **Forgotten stack** | Contradicts prior tech choice | Include Memory Block with established stack |
| 11 | **Hallucination invite** | "what do experts say", "research shows" | Add grounding: "cite only verified sources" |
| 12 | **Undefined audience** | "write for users" without specs | Specify technical level, role |
| 13 | **No mention of failures** | No mention of what was tried | Ask what already failed (max 3 Qs) |

## Format Patterns (6)

| # | Pattern | Detection | Fix |
|---|---------|-----------|-----|
| 14 | **Missing output format** | "explain this", "show me" | Derive format from task type |
| 15 | **Implicit length** | "write a summary" without count | Add word/sentence count constraint |
| 16 | **No role assignment** | Generic without expert identity | Assign domain-specific expert role |
| 17 | **Vague aesthetic** | "make it professional", "look nice" | Translate to concrete specs (hex, px, font) |
| 18 | **No negative prompts** | Image gen without exclusions | Add negative constraints |
| 19 | **Prose for image AI** | Full sentences for Midjourney | Convert to comma-separated descriptors |

## Scope Patterns (6)

| # | Pattern | Detection | Fix |
|---|---------|-----------|-----|
| 20 | **No scope boundary** | "fix my app", "update the system" | Scope to specific files/features |
| 21 | **No stack constraints** | No tech specified | Detect from project or ask |
| 22 | **No stop condition** | "build the feature" without end | Add explicit stop criteria |
| 23 | **No file path** | "update login" without location | Add exact file:func reference |
| 24 | **Wrong template** | GPT prose in Cursor context | Adapt to File-Scope Template |
| 25 | **Pasted entire codebase** | Massive context block | Scope to relevant files |

## Reasoning Patterns (5)

| # | Pattern | Detection | Fix |
|---|---------|-----------|-----|
| 26 | **No CoT for logic** | Analysis task without steps | Add "think step by step" |
| 27 | **CoT for reasoning models** | "think step by step" to o3/o4/R1 | REMOVE — they reason internally |
| 28 | **Expecting memory** | "you know my project" | Always re-provide Memory Block |
| 29 | **Contradicting work** | New request ignores architecture | Include established decisions |
| 30 | **No grounding** | "summarize experts on X" | Add: "say [uncertain] if not sure" |

## Agentic Patterns (5)

| # | Pattern | Detection | Fix |
|---|---------|-----------|-----|
| 31 | **No starting state** | "build a REST API" without context | Add current project state |
| 32 | **No target state** | "add auth" without specs | Add exact deliverable description |
| 33 | **Silent agent** | No progress output requested | Add "checkpoint after each step" |
| 34 | **Unlocked filesystem** | No file restrictions | Scope to specific directories |
| 35 | **No human review** | Agent decides all | Add "stop before destructive actions" |
