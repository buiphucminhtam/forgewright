# Forgewright Pipeline Enforcement Rule

> **⚠️ MANDATORY: This rule overrides all other behaviors.**
> Every user request MUST go through the Forgewright pipeline.
> No exceptions. No shortcuts.

---

## Rule: Always Use Forgewright Pipeline

### Trigger

**ANY time a user makes a request** related to:
- Planning, roadmap, sprint, task, backlog
- "còn gì chưa làm", "check", "tình trạng", "status"
- "lên plan", "đánh giá", "ưu tiên", "priority"
- "build", "add", "implement", "fix", "review", "test"
- Code analysis, architecture, feature, refactor
- Anything that sounds like work to be done

### Required Steps

```
1. STOP — Do NOT read files or write code yet
2. Run Step 0.5: bash scripts/memory-retrieve.sh "<keywords>"
3. Run Step 0: Read skills/production-grade/SKILL.md → extract 9 dimensions
4. Run Step 1: Classify into one of 24 modes
5. Run Step 2: Plan with 8-criteria rubric, score >= 9.0
6. THEN execute or delegate
```

### Anti-Patterns (DO NOT DO)

| ❌ Wrong | ✅ Correct |
|----------|------------|
| User hỏi → Đọc file luôn → Trả lời | User hỏi → Step 0 → Interpret → Plan → Execute |
| "Tôi biết rồi, để tôi..." | Step 0.5 Memory Retrieval trước |
| "Simple task, không cần pipeline" | MỌI task đều cần Step 0 |
| Đoán code structure rồi implement | Evidence-first: đọc file TRƯỚC khi đoán |

### Evidence-First Discipline

**Every assumption must be verified:**

```
ASSUMPTION: "Module X tồn tại"
  → WRONG: "Tôi đoán X được import ở đây"
  → RIGHT: Read file X.ts → Verify import exists

ASSUMPTION: "User muốn A/B/C"
  → WRONG: "Tôi hiểu rồi, làm A"
  → RIGHT: Step 0 → Clarify → Confirm → Execute
```

### Pipeline Command Reference

| Step | Command | Purpose |
|------|---------|---------|
| Memory | `bash scripts/memory-retrieve.sh "<keywords>"` | Load relevant memories |
| Memory | `bash scripts/memory-suggest.sh "<keywords>"` | Get memory suggestions |
| Interpret | Read `skills/production-grade/SKILL.md` Step 0 | Classify + interpret |
| Classify | Read `skills/production-grade/modes/README.md` | 24 mode classification |
| Plan | Read `skills/_shared/protocols/plan-quality-loop.md` | 8-criteria scoring |
| Orchestrate | Read `skills/production-grade/SKILL.md` | Full orchestrator |

### Escalation

If the user asks "why didn't you use Forgewright?" → Immediately:
1. Acknowledge the violation
2. Run the pipeline retroactively
3. Report findings
4. Update this rule if the violation pattern recurs

---

## Scope

- **Files**: All `.md`, `.ts`, `.py` in this project
- **Modes**: Agent, Edit, Chat
- **Priority**: Highest (overrides all other rules)
