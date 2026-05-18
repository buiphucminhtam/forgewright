# 00-memory-loader.md (Pre-Skill Middleware)

**Hook:** `before_skill`

## Purpose
Automatically load the conversation memory, subagent context, and session log into the LLM context before the skill execution begins.

## Execution
```bash
#!/bin/bash
if [ -f ".forgewright/memory-bank/activeContext.md" ]; then
  echo "--- ACTIVE CONTEXT ---"
  cat .forgewright/memory-bank/activeContext.md
fi
if [ -f ".forgewright/subagent-context/CONVERSATION_SUMMARY.md" ]; then
  echo "--- CONVERSATION SUMMARY ---"
  cat .forgewright/subagent-context/CONVERSATION_SUMMARY.md
fi
```
