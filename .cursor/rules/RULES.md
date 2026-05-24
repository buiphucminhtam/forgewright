# Cursor Rules Index

> Master index of all Cursor rules for the Forgewright project.
> Managed by Forgewright — auto-generated from skill audit.

---

## Overview

This project uses Cursor rules to provide project-specific guidance to the AI.
Rules live in `.cursor/rules/` (project-level) and are loaded based on file patterns.

---

## Available Rules

No rules deployed yet. See "Adding a New Rule" below.

---

## Quick Reference

### Rule Priority

Rules are applied in order of specificity:
1. Exact file matches (highest priority)
2. Pattern matches (`*.ts`, `src/**`)
3. Directory matches
4. Global rules (lowest priority)

### Best Practices

- Keep rules concise (< 500 words)
- Use specific scopes
- Include concrete examples
- Avoid conflicting rules
- Review rules quarterly

---

## Agent Skills (`.cursor/agents/`)

These are Cursor Agent skills, not file-scope rules. They define complete agent behaviors:

| Agent | File | Purpose |
|-------|------|---------|
| `chat-interpreter` | `.cursor/agents/chat-interpreter.md` | Translates natural language into pipeline requests |
| `quality-reviewer` | `.cursor/agents/quality-reviewer.md` | Code quality assessment |
| `security-auditor` | `.cursor/agents/security-auditor.md` | OWASP security audit |
| `spec-reviewer` | `.cursor/agents/spec-reviewer.md` | Spec compliance validation |
| `verifier` | `.cursor/agents/verifier.md` | Functional verification |

---

## Hook Activation Rules (`skills/production-grade/hooks/`)

Pattern-matching rules that recommend skill activation on UserPromptSubmit:

| Hook | File | Purpose |
|------|------|---------|
| Activation Rules | `skills/production-grade/hooks/activation-rules.json` | Maps user prompts → Forgewright skills |

---

## Templates (`templates/cursor/`)

Templates for generating new rules:

| Template | File | Purpose |
|----------|------|---------|
| Rule Template | `templates/cursor/rule.md.hbs` | General-purpose Cursor rule template |
| File Rule Template | `templates/cursor/file-rule.hbs` | File-specific rule template |
| Rules Index Template | `templates/cursor/rules-index.hbs` | Rules index template |

---

## Adding a New Rule

1. Create a new `.md` file in `.cursor/rules/`
2. Follow the `rule.md.hbs` template structure
3. Add an entry to this index
4. Test the rule in Cursor
