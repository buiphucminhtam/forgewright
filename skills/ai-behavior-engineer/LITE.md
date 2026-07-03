---
name: ai-behavior-engineer
description: "Orchestrates AI behavioral optimizations, prompt engineering, safety guardrails, model routing configurations, and Gemini-native parameter tuning. Use when the user requests adjustment of LLM routing rules, token optimization configs, Skeptic agent thresholds, temperature tuning, or custom thinking_level profiles."
version: 1.0.0
---

# Ai Behavior Engineer (LITE)

## SOLVE Step 2: GROUND (Ai Behavior Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project stack and baseline profile are onboarded and defined | `cat .forgewright/project-profile.json` | Project profile JSON with tech stack and health status | [1] |
| Gemini and Anthropic model configurations or thinking levels are defined | `cat .production-grade.yaml` | Active orchestrator behavioral rules, temperature settings, and thinking thresholds | [2, 3] |
| Active memory auto-tagging or cognitive settings are indexed | `cat .agents/workflows/` or check `mem0-v2.py` presence | Verifies RAG-grounding scripts and category rules | [3, 4] |
| Running budget limits and cost ceilings are configured | `cat .forgewright/budget.yaml` | Displays session token budgets and provider-specific cost thresholds | [2, 5] |

## SOLVE Step 3: DECOMPOSE (Ai Behavior Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. ROUTE | Map incoming task complexity to the optimal model and thinking level | Verify high-stakes planning routes to Pro models (`thinking_level: HIGH`) while low-risk tasks use Flash (`thinking_level: MINIMAL`) [2].
2. CONFIGURE | Enforce parameter rules, specifically Temperature 1.0 and Thought Signatures preservation | Ensure intermediate middleware layers do not strip Thought Signatures to prevent API 400 error codes [2].
3. AUDIT | Evaluate generator outputs via the Skeptic Agent and confidence scoring | Validate that output calibrations meet Expected Calibration Error (ECE) metrics of `< 0.10` [3].
4. CACHE | Trigger passive idle checks and context offloading on token threshold hits | Confirm context volumes exceeding 1200 tokens are offloaded to `.forgewright/offload/` using trace handles [6].

## Common Mistakes Checklist
- **Thought Signature Stripping**: Modifying API response streams or stripping thought signatures via regex in post-processing, triggering immediate API 400 bad request failures [2].
- **Invalid Temperature Scaling**: Overriding the mandatory Temperature 1.0 rule during logical tasks, causing unstable code paths or hallucinations [2].
- **Skeptic Agent Bypass**: Allowing output generation to skip confidence scoring or ECE validation, letting unverified model outputs bypass safety gates [3].
- **Thinking Level Mismatch**: Configuring `thinking_level: HIGH` on model models that do not natively support thinking parameters, leading to execution timeouts.
- **Context Bloat Overload**: Failing to leverage progressive disclosure or offloading on long sessions, causing high token spend and memory loss [7, 8].

## Worked Example

### Step 1: Verify model parameters in the production config
```bash
cat .production-grade.yaml
```
Output:
```yaml
gemini_config:
  model: "gemini-3.1-pro"
  temperature: 1.0
  thinking_level: "HIGH"
  preserve_thought_signatures: true
skeptic_agent:
  ece_threshold: 0.10
  enabled: true
```

### Step 2: Implement a behavior guardrail class `src/GeminiGuardrail.ts`
```typescript
import { GeminiClient } from 'forgewright-gemini-sdk';

export class GeminiGuardrail {
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  // Ensure prompt structures conform to behavioral rules
  public preparePayload(prompt: string) {
    return {
      model: this.config.gemini_config.model,
      // Mandatory: Temperature 1.0 enforced for Gemini 3.x Native optimization
      temperature: 1.0, 
      thinking_config: {
        thinking_budget: this.config.gemini_config.thinking_level === 'HIGH' ? 1024 : 0
      },
      // Enforce preservation of thought signatures to prevent API 400 errors
      preserve_thought_signatures: this.config.gemini_config.preserve_thought_signatures,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    };
  }

  // Validate output via the Skeptic Agent confidence scorer
  public validateOutput(response: { text: string; confidence: number }): boolean {
    const ece = 1.0 - response.confidence;
    if (this.config.skeptic_agent.enabled && ece > this.config.skeptic_agent.ece_threshold) {
      console.warn(`[REJECT] Skeptic Agent triggered. ECE ${ece.toFixed(2)} exceeds threshold 0.10.`);
      return false;
    }
    return true;
  }
}
```

### Step 3: Run the execution flow to test the custom AI behavior setup
```bash
node scripts/test-gemini-behavior.js
```
Output:
```
[INFO] Initializing GeminiGuardrail with gemini-3.1-pro...
[SUCCESS] Payload configured: Temperature=1.0, ThoughtSignatures=Preserved.
[AUDIT] Skeptic Agent evaluation: Confidence=0.94 (ECE=0.06).
[SUCCESS] Behavior verified: Output complies with production-grade E3 safety parameters.
```
