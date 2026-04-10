# Safe Prompt Techniques (from prompt-master)

> 5 techniques with reliable, bounded effects. Methods that cause hallucinations or unpredictable output are explicitly excluded.

---

## Forbidden Techniques

These techniques **NEVER use** — they produce fabrication, false confidence, or degraded output:

| Technique | Why Forbidden |
|-----------|--------------|
| **Tree of Thought (ToT)** | Model generates linear text and simulates branching — no real parallelism |
| **Graph of Thought (GoT)** | Requires external graph engine — single-prompt = fabrication |
| **Universal Self-Consistency (USC)** | Requires independent sampling — later paths contaminate earlier ones |
| **Prompt chaining as layered technique** | Pushes models into fabrication on longer chains |
| **Mixture of Experts (MoE)** | Model role-plays personas — no real routing in single forward pass |

---

## Safe Techniques

### 1. Role Assignment

Assign a specific expert identity to calibrate depth and vocabulary.

**Weak:**
```
You are a helpful assistant
```

**Strong:**
```
You are a senior backend engineer specializing in distributed systems
who prioritizes correctness over cleverness.
```

**When to use:**
- Complex or specialized tasks
- Domain-specific knowledge required
- Depth calibration needed

**When NOT to use:**
- Simple, generic tasks
- Short, one-shot requests
- Tasks that don't benefit from expertise

---

### 2. Few-Shot Examples

Add 2-5 examples when format consistency matters more than instructions.

```
Here are examples of the exact format needed:

<examples>
  <example>
    <input>How do I center a div?</input>
    <output>display: flex;
justify-content: center;
align-items: center;</output>
  </example>
  <example>
    <input>Center a div vertically only</input>
    <output>display: flex;
align-items: center;</output>
  </example>
</examples>

Now apply this exact pattern to: [your input]
```

**When to use:**
- Format is easier to show than describe
- User re-prompted for same formatting twice
- Pattern replication needed
- Edge cases are hard to verbalize

**When NOT to use:**
- First attempt at a task
- Creative/open-ended output
- When verbal instructions suffice
- More than 5 examples (rarely helps, wastes tokens)

**Rules:**
- 2-5 examples max
- Include edge cases, not just easy cases
- Use XML tags — Claude parses XML reliably

---

### 3. XML Structural Tags

Wrap sections in XML tags for Claude-based tools that parse it reliably.

```
<context>
The user is building a SaaS for project management.
Stack: React 18, Node.js, PostgreSQL.
</context>

<task>
Add authentication to the existing Express API.
</task>

<constraints>
- Use JWT stored in httpOnly cookies
- No localStorage for tokens
- Match existing error handling patterns
</constraints>

<success_criteria>
- POST /auth/login returns JWT
- Protected routes reject requests without valid JWT
- Logout invalidates the token
</success_criteria>
```

**When to use:**
- Complex multi-section prompts
- Claude-based tools (Claude.ai, Claude Code, Cursor)
- Clear separation of concerns needed
- Tool parses structured sections

**When NOT to use:**
- Simple, single-task prompts
- Non-Claude models (XML parsing varies)
- When plain text suffices

---

### 4. Grounding Anchors

Add anti-hallucination rules for factual and citation tasks.

```
Use only information you are highly confident is accurate.
If uncertain, write [uncertain] next to the claim.
Do not fabricate citations or statistics.
Do not extrapolate beyond the provided context.
```

**When to use:**
- Factual or research tasks
- Tasks requiring citations
- Code accuracy claims
- Technical documentation

**When NOT to use:**
- Creative writing
- Brainstorming
- When hallucinations are acceptable

---

### 5. Chain of Thought (CoT)

Force step-by-step reasoning for logic tasks.

```
Before answering, think through this carefully:

<thinking>
1. What is the actual problem being asked?
2. What constraints must the solution respect?
3. What are the possible approaches?
4. Which approach is best and why?
</thinking>

Give your final answer in <answer> tags only.
```

**When to use:**
- Logic-heavy tasks
- Math and calculations
- Debugging (cause not obvious)
- Comparing approaches
- Multi-factor analysis

**When NOT to use:**
- **o3, o4-mini, DeepSeek-R1, Qwen3 thinking mode** — they reason internally, CoT degrades output
- Simple tasks (unnecessary overhead)
- Creative tasks (CoT can kill natural voice)
- First-pass information retrieval

---

## Model-Specific Guidance

| Model | CoT | Role | XML Tags | Few-Shot |
|-------|-----|------|----------|----------|
| Claude | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| GPT-4o | ✅ Yes | ✅ Yes | ⚠️ Sparse | ✅ Yes |
| o3/o4-mini | ❌ Never | ✅ Yes | ⚠️ Sparse | ✅ Yes |
| Gemini | ✅ Yes | ✅ Yes | ⚠️ Sparse | ✅ Yes |
| Local (Llama) | ⚠️ Minimal | ✅ Yes | ❌ Avoid | ⚠️ 2-3 max |
| DeepSeek-R1 | ❌ Never | ✅ Yes | ⚠️ Sparse | ✅ Yes |

---

## Technique Selection Quick Reference

| Task Type | Recommended Techniques |
|-----------|---------------------|
| Simple Q&A | None needed |
| Code generation | Role + File-Scope template |
| Complex analysis | CoT + Grounding |
| Format-critical output | Few-Shot + XML |
| Multi-step agent | Role + ReAct + Stop Conditions |
| Image generation | Visual Descriptor template |
| Creative writing | Role + CRISPE template |
| Research/summaries | Grounding + Context |
