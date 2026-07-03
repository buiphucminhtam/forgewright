---
name: prompt-engineer
description: "Orchestrates system prompt design, prompt optimization, few-shot examples alignment, context compression, and prompt injection security audits. Use when the user requests custom system prompt designs, context length optimization, system prompt updates, or LLM output behavior tuning."
version: 1.0.0
---

# Prompt Engineer (LITE)

## SOLVE Step 2: GROUND (Prompt Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target model configs and optimization levels are active | `cat .production-grade.yaml` | Validates model routing, thought signatures, and temperature configurations | |
| Existing system prompts or template instructions are indexed | `find src/ -name "*prompt*" -o -name "*instruction*" -o -name "*template*"` | Identifies active system prompts, instruction files, or template layouts | |
| Standardized product specification templates are loaded | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs | |
| Active session spend tracker parameters and token limits are configured | `cat .forgewright/budget.yaml` | Displays configured budget cap rules to restrict agent task loops | |

## SOLVE Step 3: DECOMPOSE (Prompt Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Analyze system instructions against prompt injections and secret leak vectors | Ensure strict credential redactors and Middleware ④c rules are defined to filter API keys.
2. OPTIMIZE | Structure system prompts with explicit few-shot examples and variable inputs | Ensure prompts are optimized under 1200 tokens or set up progressive disclosure to avoid context bloat.
3. PRESERVE | Enforce Gemini 3.x native configurations (Temperature 1.0, high reasoning budget) | Verify prompt processing does not strip model-generated Thought Signatures, avoiding API 400 bad requests.
4. SYNC | Save optimized templates as lowercase kebab-case under `docs/03-guides/` | Trigger standard post-skill sync scripts to establish absolute symlinks for documentation.

## Common Mistakes Checklist
- **Stripping Thought Signatures**: Writing custom regex, string trimmers, or JSON parsers on model outputs that accidentally strip thought signatures, causing Gemini API 400 bad requests.
- **Hardcoding Secrets in Prompts**: Placing raw API keys, bearer tokens, or connection URIs directly inside system prompts or few-shot examples, risking context leaks.
- **Ignoring Context Bloat Guidelines**: Feeding extremely large database dumps or raw codebases directly into the prompt context instead of leveraging progressive summaries or minimal signature layouts.
- **Hardcoding Overridden Temperatures**: Specifying a static, lower temperature (e.g., 0.0 or 0.2) for creative or complex reasoning tasks, violating the optimal Temperature 1.0 native configuration for Gemini 3.x.
- **Non-Compliant File Names**: Storing prompt guides or optimization reports under `docs/` using CamelCase, spaces, or uppercase letters instead of strictly lowercase kebab-case.

## Worked Example

### Step 1: Ground the model configuration rules
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
```

### Step 2: Implement a secure, token-optimized system prompt template generator in `src/prompts/prompt-generator.ts`
```typescript
export class PromptGenerator {
  // Conforms strictly to Middleware ④c (Tool Sandbox) by avoiding hardcoded credentials
  private static SYSTEM_TEMPLATE = `
You are an expert Forgewright Assistant. You must act strictly as a grounded developer.

## Core Rules:
1. Grounding: Every factual claim must be backed by workspace files.
2. Compliance: Always use lowercase kebab-case for file names under docs/.

## Technical Parameters:
- Temperature: {{temperature}}
- Tech Stack: {{techStack}}

## Few-shot Example:
Input: Create a script for task tracking.
Output: Use "docs/05-operations/task-tracker.md". Do not use CamelCase.
`;

  public static generatePrompt(techStack: string, temp: number): string {
    return this.SYSTEM_TEMPLATE
      .replace('{{techStack}}', techStack)
      .replace('{{temperature}}', temp.toFixed(1));
  }
}
```

### Step 3: Run pre-flight validation on the generated prompt template
```bash
# Verify prompt structure compiles cleanly
node -e "
const { PromptGenerator } = require('./src/prompts/prompt-generator');
const prompt = PromptGenerator.generatePrompt('TypeScript', 1.0);
console.log('[AUDIT] Generated prompt character length:', prompt.length);
if (prompt.includes('{{')) throw new Error('Unreplaced template variables detected!');
console.log('[SUCCESS] Prompt pre-flight check passed.');
"
```
Output:
```
[AUDIT] Generated prompt character length: 486
[SUCCESS] Prompt pre-flight check passed.
```

### Step 4: Write prompt guidelines and trigger the Shared Obsidian Vault sync
```bash
cat << 'EOF' > docs/03-guides/prompt-guidelines.md
# Prompt Engineering Guidelines

## 1. Executive Summary
Standardized system instruction guidelines to optimize model accuracy and reduce context token waste.

## 2. Mandatory Constraints
- Native Temperature: 1.0 (enforces reasoning consistency)
- Thought Signatures: Must be preserved (do not strip from raw outputs)
- Output File Names: Strictly lowercase kebab-case
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for prompt-guidelines.md.
[SUCCESS] Symlinked docs/03-guides/prompt-guidelines.md to /workspace/shared-obsidian-vault/forgewright/03-guides/prompt-guidelines.md.
```
