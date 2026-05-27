# 00-memory-loader.md (Pre-Skill Middleware)

**Hook:** `before_skill`

## Purpose
Automatically load the conversation memory, subagent context, session log, and handover documents into the LLM context before the skill execution begins. Loads memories in priority order with token-aware truncation.

## Constants
```bash
MAX_HANDOVER_TOKENS=800
MAX_CONVERSATION_TOKENS=400
MAX_ACTIVECONTEXT_TOKENS=300
MAX_MEM0_TOKENS=300
MAX_BA_SCOPE_TOKENS=500
```

## Execution
```bash
#!/bin/bash

# =============================================================================
# MEMORY LOADER — Priority-ordered with guardrails and token limits
# =============================================================================

# Guardrail: Set safe defaults if tokens env var not set
FORGEWRIGHT_MAX_INJECTION_TOKENS="${FORGEWRIGHT_MAX_INJECTION_TOKENS:-2000}"
INJECTED_TOKEN_COUNT=0

# Helper: Truncate file to max tokens (rough estimate: ~4 chars per token)
truncate_to_tokens() {
  local file="$1"
  local max_tokens="$2"
  local max_chars=$((max_tokens * 4))
  if [ -f "$file" ]; then
    local file_size=$(wc -c < "$file")
    if [ "$file_size" -gt "$max_chars" ]; then
      head -c "$max_chars" "$file"
      echo ""
      echo "[... truncated to ~${max_tokens} tokens]"
    else
      cat "$file"
    fi
  fi
}

# Helper: Add section with token accounting
add_section() {
  local label="$1"
  local content="$2"
  local section_tokens="$3"

  if [ -z "$content" ] || [ "$content" = "NOT_FOUND" ]; then
    echo "# [${label}: not available]"
    return 0
  fi

  # Guardrail: Check if adding this section would exceed token budget
  local projected_total=$((INJECTED_TOKEN_COUNT + section_tokens))
  if [ "$projected_total" -gt "$FORGEWRIGHT_MAX_INJECTION_TOKENS" ]; then
    echo ""
    echo "# [${label}: skipped — would exceed token budget]"
    return 1
  fi

  echo ""
  echo "--- ${label} ---"
  echo "$content"
  INJECTED_TOKEN_COUNT=$projected_total
}

# =============================================================================
# 1. HANDOVER (highest priority — IDE adaptability, cross-session context)
# =============================================================================
HANDOVER_CONTENT="NOT_FOUND"

if [ -f ".forgewright/memory-bank/HANDOVER.md" ]; then
  HANDOVER_CONTENT=$(truncate_to_tokens ".forgewright/memory-bank/HANDOVER.md" "$MAX_HANDOVER_TOKENS")
elif [ -d ".forgewright/memory-bank" ]; then
  # Fallback: find most recent timestamped handover
  latest_handover=$(ls -t .forgewright/memory-bank/handover-*.md 2>/dev/null | head -1)
  if [ -n "$latest_handover" ] && [ -f "$latest_handover" ]; then
    HANDOVER_CONTENT=$(truncate_to_tokens "$latest_handover" "$MAX_HANDOVER_TOKENS")
  fi
fi

add_section "HANDOVER" "$HANDOVER_CONTENT" "$MAX_HANDOVER_TOKENS"

# =============================================================================
# 2. CONVERSATION SUMMARY (cross-turn continuity)
# =============================================================================
CONV_SUMMARY_CONTENT="NOT_FOUND"

if [ -f ".forgewright/subagent-context/CONVERSATION_SUMMARY.md" ]; then
  CONV_SUMMARY_CONTENT=$(truncate_to_tokens ".forgewright/subagent-context/CONVERSATION_SUMMARY.md" "$MAX_CONVERSATION_TOKENS")
fi

add_section "CONVERSATION SUMMARY" "$CONV_SUMMARY_CONTENT" "$MAX_CONVERSATION_TOKENS"

# =============================================================================
# 3. ACTIVE CONTEXT (current session state)
# =============================================================================
ACTIVECONTEXT_CONTENT="NOT_FOUND"

if [ -f ".forgewright/memory-bank/activeContext.md" ]; then
  ACTIVECONTEXT_CONTENT=$(truncate_to_tokens ".forgewright/memory-bank/activeContext.md" "$MAX_ACTIVECONTEXT_TOKENS")
fi

add_section "ACTIVE CONTEXT" "$ACTIVECONTEXT_CONTENT" "$MAX_ACTIVECONTEXT_TOKENS"

# =============================================================================
# 4. MEM0 RECENTS (semantic memory from previous sessions)
# =============================================================================
MEM0_CONTENT="NOT_FOUND"

# Guardrail: Check if mem0 CLI is available
if command -v python3 &>/dev/null && [ -f "scripts/mem0-v2.py" ]; then
  # Attempt to fetch recent memories (suppress errors if unconfigured)
  MEM0_RAW=$(python3 scripts/mem0-v2.py search "session recent" --limit 3 2>/dev/null)
  if [ -n "$MEM0_RAW" ] && [ "$MEM0_RAW" != "NOT_FOUND" ]; then
    MEM0_CONTENT=$(echo "$MEM0_RAW" | head -c $((MAX_MEM0_TOKENS * 4)))
  fi
fi

add_section "MEM0 RECENTS" "$MEM0_CONTENT" "$MAX_MEM0_TOKENS"

# =============================================================================
# 5. BA SCOPE (optional — only if exists and budget allows)
# =============================================================================
BA_SCOPE_CONTENT="NOT_FOUND"

if [ -f ".forgewright/business-analyst/handoff/ba-package.md" ]; then
  BA_SCOPE_CONTENT=$(truncate_to_tokens ".forgewright/business-analyst/handoff/ba-package.md" "$MAX_BA_SCOPE_TOKENS")
  add_section "BA SCOPE" "$BA_SCOPE_CONTENT" "$MAX_BA_SCOPE_TOKENS"
fi

# =============================================================================
# Summary (for debugging)
# =============================================================================
echo ""
echo "# [Memory injection: ~${INJECTED_TOKEN_COUNT} tokens / ${FORGEWRIGHT_MAX_INJECTION_TOKENS} max]"
```
