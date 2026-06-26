# Tool Routing Reference

<!-- source: skills/production-grade/references/tool-routing.md -->

## Tool-Specific Routing (from prompt-master)

When generating prompts for specific AI tools, use the appropriate template and technique based on the target tool. Reference files:

| File | Read When |
|------|-----------|
| `skills/_shared/protocols/prompt-templates.md` | Need template structure for any tool category |
| `skills/_shared/protocols/credit-killing-patterns.md` | Fixing bad prompts or diagnosing failures |
| `skills/_shared/protocols/prompt-techniques.md` | Selecting safe techniques per model |

### Code AI Tools

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Claude Code** | ReAct + Stop Conditions (H) | Stop conditions MANDATORY, file scope, human review triggers |
| **Cursor / Windsurf** | File-Scope (G) | Path + function + do-not-touch list + done_when |
| **GitHub Copilot** | RTF (A) | Exact function signature as docstring |
| **Cline (Claude Dev)** | ReAct + Stop Conditions (H) | File scope + approval gates + stop conditions |

### Reasoning Models

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Claude (claude.ai)** | RTF/CO-STAR (A/B) | XML tags, explicit length, no over-engineering |
| **ChatGPT / GPT-5.x** | RTF/CO-STAR (A/B) | Output contract, verbosity control, compact structure |
| **o3 / o4-mini** | Short clean only | **REMOVE CoT** — they think internally, under 200 words |
| **Gemini 2.x/3** | CO-STAR (B) | Grounding anchors, citation rules, format locks |
| **DeepSeek-R1** | Short clean only | **REMOVE CoT**, short instructions only |
| **Qwen3 (thinking)** | Short clean only | Treat like o3 — no CoT scaffolding |
| **Qwen3 (non-thinking)** | RTF (A) | Full structure, explicit format, role assignment |
| **MiniMax** | RTF (A) | Temperature 0-1 only, structured output |

### Local Models

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Ollama** | RTF (A) | Ask which model first, shorter prompts, simple structure |
| **Llama / Mistral** | RTF (A) | Shorter prompts, flat structure, explicit role |
| **CodeLlama** | File-Scope (G) | Coding-focused prompts, shorter |

### Image/Video AI

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Midjourney** | Visual Descriptor (I) | Comma-separated, negative prompt, parameters |
| **DALL-E 3** | Visual Descriptor (I) | Prose works, text exclusion, foreground/background |
| **Stable Diffusion** | Visual Descriptor (I) | `(word:weight)` syntax, CFG 7-12, negative mandatory |
| **ComfyUI** | ComfyUI (K) | Separate positive/negative, checkpoint-specific |
| **Reference editing** | Reference Image (J) | Delta only, attach reference first |
| **Sora / Runway** | Visual Descriptor (I) | Camera movement, duration, cinematic language |

### Full-Stack Generators

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Bolt / v0 / Lovable** | RISEN (C) | Stack + version + what NOT to scaffold |
| **Figma Make** | RISEN (C) | Component names from Figma, scope boundaries |
| **Google Stitch** | RISEN (C) | Interface goal over implementation, Material Design 3 |

### Autonomous Agents

| Tool | Template | Key Fixes |
|------|----------|-----------|
| **Devin / SWE-agent** | ReAct + Stop Conditions (H) | Starting state + target state + forbidden actions |
| **Manus / Perplexity Computer** | RISEN (C) | End deliverable focus, permission scope |

### Quick Reference

- **Claude Code, Devin, AutoGPT** → Template H (ReAct + Stop Conditions)
- **Cursor, Windsurf, Copilot** → Template G (File-Scope)
- **o3, o4-mini, R1, Qwen3-thinking** → **REMOVE CoT**, keep under 200 words
- **Claude, GPT-4o, Gemini** → CoT allowed, use Template E if logic-heavy
- **Midjourney, SD, DALL-E** → Template I (Visual Descriptor), negative prompts
- **Complex multi-step** → Template C (RISEN)
