---
name: ai-engineer
description: "Orchestrates LLM integration, custom RAG pipelines, cognitive memory management, and prompt routing policies. Use when the user requests custom AI feature builds, RAG pipeline integrations, memory-bank customizations, or LLM-backed agentic flows."
version: 1.0.0
---

# Ai Engineer (LITE)

## SOLVE Step 2: GROUND (Ai Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project tech stack and AI routing profiles are onboarded | `cat .forgewright/project-profile.json` | Project profile mapping tech stack and active models [1] | |
| Production-grade model variables and thinking levels are active | `cat .production-grade.yaml` | Validates Gemini/Anthropic configs, thought signature rules, and temp parameters [2] | |
| Memory bank structures and schema directories are initialized | `find .forgewright/ -maxdepth 2 -type d` | Confirms location of `memory-bank/` or active sqlite databases [3, 4] | |
| Active API expenditure limit rules and token trackers are configured | `cat .forgewright/budget.yaml` | Verifies cost parameters, spend ceilings, and notification alerts [2, 5] | |

## SOLVE Step 3: DECOMPOSE (Ai Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. ROUTE | Match prompt task complexity to model routing rules | Verify high-stakes tasks use Gemini 3.1 Pro (`thinking_level: HIGH`) and low-risk tasks use Gemini 3.5 Flash (`thinking_level: MINIMAL`) [2].
2. CONFIGURE | Enforce API parameter rules, focusing on Temperature 1.0 and Thought Signatures preservation | Ensure intermediate prompt layers do not filter out Thought Signatures, avoiding API 400 bad requests [2].
3. OFFLOAD | Divert heavy outputs (>1200 tokens) via Context Offload (Middleware ④d) | Verify outputs are written under `.forgewright/offload/` and represented as compact trace handles (e.g., `refs/n-X-tool-hash.md`) [6].
4. REINFORCE | Apply ASIP edge adjustments to SQLite Cognitive Graph (FluxMem) nodes | Verify failed execution loops trigger a 0.5 decay while successful workflows trigger a 1.2 reinforcement [4].

## Common Mistakes Checklist
- **Stripping Thought Signatures**: Using custom text or regex parsers on model output streams that accidentally strip thought signatures, triggering immediate API 400 failures [2].
- **Bypassing Sandbox Redaction**: Allowing raw tool executions to run without filtering through Middleware ④c (Tool Sandbox), causing API keys or credentials to leak into context caching layers [6].
- **Context Overload (Missing Offload)**: Failing to enforce the 1200-token threshold for large tool outputs, leading to rapid context window exhaustion and increased API latency [6].
- **Hardcoding Temperatures**: Specifying standard temperature overrides (like 0.0 or 0.7) for reasoning tasks, violating the optimal Temperature 1.0 native configuration for Gemini 3.x [2].
- **Fragmented Memory Updates**: Manually editing JSON-based memory files directly instead of letting `mem0-v2.py` or the SQLite memory manager handle cognitive updates [4, 7].

## Worked Example

### Step 1: Verify the orchestrator's production-grade configurations and budgets
```bash
cat .production-grade.yaml
cat .forgewright/budget.yaml
```
Output:
```yaml
gemini_config:
  model: "gemini-3.1-pro"
  temperature: 1.0
  thinking_level: "HIGH"
  preserve_thought_signatures: true
```

### Step 2: Build a cost-aware, RAG-grounded model dispatcher in `src/ai-dispatcher.ts`
```typescript
import { GeminiClient } from 'forgewright-gemini';

export class AIDispatcher {
  private client: GeminiClient;

  constructor() {
    this.client = new GeminiClient({
      // Safe: Enforces the mandatory Temperature 1.0 rule [2]
      temperature: 1.0,
      preserveThoughtSignatures: true
    });
  }

  // Handle task routing with adaptive thinking budget configs [2]
  public async dispatchTask(taskPrompt: string, complexity: 'HIGH' | 'LOW') {
    const model = complexity === 'HIGH' ? 'gemini-3.1-pro' : 'gemini-3.5-flash';
    const thinkingBudget = complexity === 'HIGH' ? 1024 : 0;

    console.log(`[ROUTE] Dispatching to ${model} (Budget: ${thinkingBudget} tokens)`);
    
    return await this.client.generate({
      model,
      prompt: taskPrompt,
      thinkingConfig: { budget: thinkingBudget }
    });
  }
}
```

### Step 3: Run the memory-consolidator script to optimize RAG performance
```bash
python3 scripts/memory-consolidate.py
```
Output:
```
[INFO] Scanning SQLite Cognitive Graph (flux_nodes)...
[SUCCESS] Consolidated 14 semantic decisions into .forgewright/memory-bank/persona.md [4, 8].
[SUCCESS] Pruned context; offline search traces linked safely using trace handles [6, 8].
```
