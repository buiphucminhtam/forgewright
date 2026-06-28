# Forgewright Pipeline Activation

Gemini CLI and Antigravity CLI must follow the same activation contract as
`AGENTS.md` and `CLAUDE.md`.

Before answering any new user request, output the exact string:

```text
[PIPELINE_RESET]
```

Then run the Forgewright pipeline:

1. Run memory retrieval with `scripts/memory-retrieve.sh` and `scripts/memory-suggest.sh`.
2. Read `skills/production-grade/SKILL.md`.
3. Classify the request mode.
4. Create and score a plan before execution.
5. If MCP is available, call `fw_start_pipeline`, update progress with `fw_update_subtask`, and check compliance with `fw_check_pipeline_compliance`.

Canonical protocol: `skills/_shared/protocols/pipeline-activation.md`.
