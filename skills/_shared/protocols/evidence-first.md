# Evidence-First Thinking (Anti-Hallucination)

<!-- source: skills/_shared/protocols/evidence-first.md -->
<!-- This is the single source of truth for Evidence-First Thinking -->

**Every assumption is a landmine. Declare it. Verify it. Or die on it.**

Modern models hallucinate confidently. The solution is not to try harder to be correct — it is to **never act on unverified assumptions**.

```
┌─────────────────────────────────────────────────────────────────────┐
│ EVIDENCE-FIRST THINKING                                            │
├─────────────────────────────────────────────────────────────────────┤
│ BEFORE acting on ANY assumption:                                    │
│ 1. STATE the assumption explicitly                                  │
│ 2. GATHER evidence — read the file, run the command, check the DB│
│ 3. VERIFY — does the evidence confirm or deny the assumption?       │
│ 4. THEN act — with the evidence, not the assumption               │
│                                                                     │
│ ❌ "The API is at /api/users — let me add the endpoint"              │
│ ✅ "I ASSUME the API is at /api/users." READ routes.ts               │
│ → Evidence: base path is /v1/users. VERIFIED. Proceeding."           │
│                                                                     │
│ NEVER guess then implement. Guess → VERIFY → then implement.         │
└─────────────────────────────────────────────────────────────────────┘
```

## 🎯 Empirical Confidence > 99% Rule

No module, feature, or logic block is considered "done" unless the AI has **empirical evidence** yielding 99% confidence.
- **Subjective Confidence (Bad):** "I am 100% sure this code works because it looks correct."
- **Empirical Confidence (Good):** "I am 99% confident because `npm run test` passed and the CLI returned exit code 0."

**UI/Visual Confidence Exception (Max 80%):**
- AI cannot visually assess aesthetics (color harmony, spacing aesthetics) accurately.
- For UI tasks, empirical confidence is **capped at 80%** (verified structurally via Chrome DevTools/DOM check).
- The remaining **19% MUST be provided by the User** via a Quality Gate (or AI Vision) to reach 99%.

**Anti-Loop Breaker:**
- If verification fails **3 consecutive times** (Confidence remains < 99%), STOP execution.
- Do not burn tokens in an infinite fix-loop. Lock the Gate and escalate to the user using the `scripts/confidence-breaker.sh` protocol.

**Decision rules:**
- If evidence **confirms** assumption → safe to proceed
- If evidence **denies** assumption → correct the assumption, update plan
- If evidence is **absent** → WRITE VERIFICATION ARTIFACT. Run it.
 → Artifact **passes** → assumption confirmed, proceed
 → Artifact **fails** → assumption wrong, research → replan → new test → verify
 → Cannot write artifact → escalate to user (rare: pure preference/taste only)
- If evidence is **insufficient** → state uncertainty, flag as assumption, proceed with caution

**Verification Artifacts (autonomous evidence gathering):**
When evidence is absent, write a test or script instead of stopping to ask the user. This preserves autonomous flow while ensuring every assumption is empirically verified.

```
ASSUMPTION: "API uses JWT auth"
 ↓ (evidence absent)
WRITE: test_api_auth.py — check if requests require JWT
RUN: pytest test_api_auth.py
 ├── PASS → Assumption confirmed. Proceed.
 └── FAIL → Assumption wrong. Research → Replan → new test → verify.
```

**Evidence hierarchy (strongest first):**
1. Verification artifact output (test/script that ran and produced output)
2. Direct code/DB reading (`Read` tool on actual files)
3. Command output (run `ls`, `grep`, `test` commands)
4. User confirmation (ask the person who knows — only when artifact impossible)
5. Project documentation (README, comments)
6. Inference from context (use sparingly, flag as inference)

---

## ⚠️ Pipeline Skip = Hallucination Pattern

Skipping the Forgewright pipeline is a form of hallucination. You **assume** you know what to do without verification.

| Symptom | Root Cause | Fix |
|---------|------------|-----|
| User asks → I answer immediately | Assume "I already know" | Run Step 0.5 first |
| Read file → Answer without interpretation | Assume "context is enough" | Step 0 + Step 1 + Step 2 |
| "Simple task, no pipeline needed" | Assume task is simple | EVERY task needs pipeline |
| Skip memory retrieval | Assume "no relevant memories" | Run `scripts/memory-retrieve.sh` |

**The pipeline IS the verification step.** Not running it means every subsequent assumption is unverified.

---

*Source: skills/_shared/protocols/evidence-first.md*
*Synced to: AGENTS.md, CLAUDE.md*
