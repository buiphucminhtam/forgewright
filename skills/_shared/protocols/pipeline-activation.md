# Pipeline Activation Protocol

<!-- source: skills/_shared/protocols/pipeline-activation.md -->

This protocol is the source of truth for starting and tracking the Forgewright
pipeline across Antigravity, Codex, Claude Code, Cursor, Gemini CLI, and
OpenCode.

## Mandatory Activation Contract

For every new user request:

1. Output the exact string `[PIPELINE_RESET]` before any tool call.
2. Run memory retrieval:
   - `bash scripts/memory-retrieve.sh "<request>"`
   - `bash scripts/memory-suggest.sh "<request>"`
3. Read the production-grade orchestrator instructions before execution.
4. Classify the mode and create a plan.
5. Record a passing plan score with `scripts/forgewright-session-tracker.sh`.
6. If Forgewright MCP is available, call `fw_start_pipeline` at request start.
7. Use `fw_update_subtask` or `fw_update_status_and_log_usage` while working.
8. Use `fw_advance_to_next_phase` when moving across pipeline phases.
9. Use `fw_check_pipeline_compliance` before closing substantial work.

## Failure Rules

- Missing `[PIPELINE_RESET]` is a pipeline activation failure.
- Missing memory retrieval is a pipeline activation failure.
- Missing plan score is a pipeline activation failure.
- A stale `.forgewright/pipeline-state.json` is a dashboard compliance failure.
- MCP setup drift is an MCP availability failure.

## Verification Commands

```bash
bash scripts/pipeline-preflight.sh --strict
bash scripts/forgewright-mcp-setup.sh --check
bash scripts/verify-mcp-manifest.sh .
```

## Score Targets

All pipeline activation controls must maintain these minimum scores:

| Category | Target |
|---|---:|
| Rule clarity | 9/10 |
| Cross-client consistency | 9/10 |
| Runtime enforcement | 9/10 |
| MCP availability | 9/10 |
| Pipeline state compliance | 9/10 |
